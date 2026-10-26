import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scissors, GripVertical, Clock, AlertTriangle, ArrowLeftRight,
  Loader2, Film, ListOrdered, User
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import UserAvatar from '@/components/UserAvatar';
import ClientLogo from '@/components/ClientLogo';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useCity } from '@/contexts/CityContext';
import { useAuth, profileOwnsUserId } from '@/hooks/useAuth';
import { editingControlMoveError, isContentManager } from '@/lib/contentKanbanRules';
import ConfirmActionDialog, { type ConfirmAction } from '@/components/kanban/ConfirmActionDialog';
import { useAgentIds } from '@/hooks/useAgentIds';
import { agentWorkState, formatSince } from '@/lib/agentCardStatus';

interface EditingTask {
  id: string;
  title: string;
  client_id: string;
  kanban_column: string;
  content_type: string;
  assigned_to: string | null;
  edited_by: string | null;
  editing_started_at: string | null;
  editing_priority: boolean;
  immediate_alteration: boolean;
  created_at: string;
  editing_deadline: string | null;
  alteration_deadline: string | null;
  /** Agente de IA com o card (etapa e último sinal, gravados pela API dos agentes). */
  agent_step?: string | null;
  agent_heartbeat_at?: string | null;
}

const COLUMN_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  edicao: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Edição' },
  revisao: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Revisão' },
  alteracao: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'Alteração' },
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  reels: 'Reels',
  story: 'Story',
  produto: 'Produto',
};

// Fila = card de edição sem dono e sem timer, ou alteração ainda não iniciada. Card de edição já
// atribuído a alguém (marcado ou distribuído), mas ainda não iniciado, fica na coluna do editor:
// entrar em Edição não liga mais o timer, então editing_started_at sozinho não diz se o card tem dono.
function isQueueTask(t: EditingTask) {
  return (t.kanban_column === 'edicao' && !t.editing_started_at && !t.assigned_to) ||
    (t.kanban_column === 'alteracao' && !t.editing_started_at);
}

export default function EditingControl() {
  const { clients, users } = useApp();
  const { user, profile } = useAuth();
  // Decisão do dono (26/10/2026): tirar ou reatribuir card de outro é da gestão (admin, social media,
  // gestor de projetos). Editor e videomaker mexem só nos próprios cards e pegam da fila para si.
  const isManager = isContentManager(profile);
  const ownerOf = (t: EditingTask) => t.edited_by || t.assigned_to;
  const canDragTask = (t: EditingTask) => isManager || !ownerOf(t) || profileOwnsUserId(profile, ownerOf(t));
  const { activeCity, isLoading: cityLoading } = useCity();
  const [tasks, setTasks] = useState<EditingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedTask, setDraggedTask] = useState<EditingTask | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);
  // Tirar card de agente que está trabalhando cancela a entrega dele: pede confirmação
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const agentIds = useAgentIds();

  // Editor e videomaker possuem as mesmas funções operacionais no módulo de edição.
  const editors = useMemo(() =>
    users
      .filter(u => {
        const roles = u.roles && u.roles.length ? u.roles : [u.role];
        return roles.includes('editor') || roles.includes('videomaker');
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );


  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('content_tasks')
      .select('id, title, client_id, kanban_column, content_type, assigned_to, edited_by, editing_started_at, editing_priority, immediate_alteration, created_at, editing_deadline, alteration_deadline, agent_step, agent_heartbeat_at')
      .in('kanban_column', ['edicao', 'revisao', 'alteracao']);

    if (!error && data) {
      setTasks(data as EditingTask[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (cityLoading) return;
    void fetchTasks();
    const interval = setInterval(fetchTasks, 15000);
    return () => clearInterval(interval);
  }, [activeCity, cityLoading]);

  // Queue = tasks in edicao/alteracao with no editing_started_at (not yet picked up) — ver isQueueTask
  const queueTasks = useMemo(() =>
    tasks.filter(isQueueTask).sort((a, b) => {
      // Priority first, then immediate alteration, then by date
      if (a.editing_priority !== b.editing_priority) return a.editing_priority ? -1 : 1;
      if (a.immediate_alteration !== b.immediate_alteration) return a.immediate_alteration ? -1 : 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }),
    [tasks]
  );

  // Tasks by editor (only those with editing_started_at or in revisao)
  const tasksByEditor = useMemo(() => {
    const map: Record<string, EditingTask[]> = {};
    editors.forEach(e => { map[e.id] = []; });

    tasks.forEach(t => {
      // Skip queue tasks (edicao sem dono / alteracao without editing started)
      if (isQueueTask(t)) return;

      const editorId = t.edited_by || t.assigned_to;
      if (editorId && map[editorId]) {
        map[editorId].push(t);
      } else if (editorId && !map[editorId]) {
        // Editor exists but not in the editors list — still track
        map[editorId] = [t];
      } else if (!editorId && t.editing_started_at) {
        // Orphaned task with editing started but no editor assigned — show in unassigned
        if (!map['__unassigned__']) map['__unassigned__'] = [];
        map['__unassigned__'].push(t);
      }
    });

    Object.values(map).forEach(arr =>
      arr.sort((a, b) => {
        // Active editing first, then by column priority
        const colOrder: Record<string, number> = { edicao: 0, alteracao: 1, revisao: 2 };
        return (colOrder[a.kanban_column] ?? 3) - (colOrder[b.kanban_column] ?? 3);
      })
    );
    return map;
  }, [tasks, editors]);

  // Stats
  const totalInQueue = queueTasks.length;
  const totalActive = tasks.filter(t => t.editing_started_at).length;

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, task: EditingTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(targetId);
  };

  const handleDragLeave = () => setDragOverTarget(null);

  // Histórico: quem reatribuiu ou devolveu o card (antes não ficava registro).
  const logReassignment = async (task: EditingTask, action: string) => {
    await supabase.from('task_history').insert({ task_id: task.id, user_id: user?.id || null, action, details: null });
  };

  // Avisa o editor que perdeu o card (não avisa quem fez a mudança nem o próprio novo editor).
  const notifyPreviousEditor = async (task: EditingTask, newEditorId: string | null) => {
    const previousId = task.edited_by || task.assigned_to;
    if (!previousId || previousId === newEditorId || previousId === user?.id) return;
    const client = clients.find(c => c.id === task.client_id);
    await supabase.rpc('notify_user', {
      _user_id: previousId,
      _title: 'Card de edição reatribuído',
      _message: `"${task.title}"${client?.companyName ? ` (${client.companyName})` : ''} ${newEditorId ? 'foi passado para outro editor' : 'voltou para a fila de edição'}.`,
      _type: 'adjustment',
      _link: '/edicao',
    });
  };

  const handleDrop = (e: React.DragEvent, targetEditorId: string) => {
    e.preventDefault();
    setDragOverTarget(null);

    if (!draggedTask) { setDraggedTask(null); return; }
    const task = draggedTask;
    const roleError = editingControlMoveError({
      isManager,
      ownsCard: profileOwnsUserId(profile, ownerOf(task)),
      cardIsFree: !ownerOf(task),
      target: targetEditorId,
      targetIsSelf: profileOwnsUserId(profile, targetEditorId),
    });
    if (roleError) {
      toast.error(roleError);
      setDraggedTask(null);
      return;
    }
    // Agente com sinal recente (mesma regra do /api/agent/tasks/:id/assign): tirar o card no meio
    // da renderização faz a entrega dele falhar
    const work = agentWorkState(task, { agentIds });
    const currentOwner = task.edited_by || task.assigned_to;
    if (work?.state === 'working' && currentOwner !== targetEditorId) {
      const agentName = (users.find(u => u.id === task.assigned_to)?.name || 'O agente').trim().split(/\s+/)[0];
      setConfirmAction({
        title: `Tirar o card de ${agentName}?`,
        description: `${agentName} (agente de IA) está trabalhando neste card agora (etapa: ${work.step}, sinal há ${formatSince(work.minutes ?? 0)}). Se mudar o dono, a entrega dele será recusada.`,
        confirmLabel: 'Tirar mesmo assim',
        destructive: true,
        onConfirm: () => performDrop(task, targetEditorId),
      });
      setDraggedTask(null);
      return;
    }
    void performDrop(task, targetEditorId);
  };

  const performDrop = async (draggedTask: EditingTask, targetEditorId: string) => {
    const currentEditorId = draggedTask.edited_by || draggedTask.assigned_to;
    if (currentEditorId === targetEditorId && targetEditorId !== '__queue__') {
      setDraggedTask(null);
      return;
    }

    if (targetEditorId === '__queue__') {
      // Revisão não tem fila: sem editor o card sumia do painel. Para trocar, arraste para um editor.
      if (draggedTask.kanban_column === 'revisao') {
        toast.error('Card em revisão não volta para a fila. Arraste para um editor.');
        setDraggedTask(null);
        return;
      }
      // Move back to queue — clear assignment
      setReassigning(true);
      try {
        // Em alteração o card continua do editor original (edited_by): só ele e os agentes
        // dele enxergam a alteração. Zerar edited_by deixava o ajuste do cliente parado.
        const isAlteration = draggedTask.kanban_column === 'alteracao';
        const { data: updated, error } = await supabase.from('content_tasks').update({
          assigned_to: null,
          ...(isAlteration ? {} : { edited_by: null }),
          editing_started_at: null,
          editing_paused_at: null,
          editing_paused_seconds: 0,
          // Card que estava com agente: limpa a etapa, como o `pulse liberar`
          ...(draggedTask.agent_step ? { agent_step: null, agent_heartbeat_at: null } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', draggedTask.id).select('id');
        if (error || !updated?.length) {
          toast.error(error?.message ? `Erro: ${error.message}` : 'Não foi possível devolver: o card mudou ou é de outra cidade.');
          fetchTasks();
          return;
        }

        await logReassignment(draggedTask, 'Devolvido para a fila de edição (Controle de Edição)');
        await notifyPreviousEditor(draggedTask, null);
        toast.success('Tarefa devolvida para a fila');
        fetchTasks();
      } catch (err: any) {
        toast.error('Erro: ' + (err.message || 'erro'));
      } finally {
        setReassigning(false);
        setDraggedTask(null);
      }
      return;
    }

    // Reassign to another editor
    setReassigning(true);
    const newEditor = users.find(u => u.id === targetEditorId);
    const client = clients.find(c => c.id === draggedTask.client_id);

    try {
      // O vpsDb não lança exceção: confere o erro e as linhas antes de dizer que deu certo.
      const { data: updated, error } = await supabase.from('content_tasks').update({
        assigned_to: targetEditorId,
        edited_by: targetEditorId,
        editing_started_at: draggedTask.editing_started_at || new Date().toISOString(),
        editing_paused_at: null,
        editing_paused_seconds: 0,
        // O novo dono começa do zero: a etapa do agente anterior sairia no selo do card
        ...(draggedTask.agent_step ? { agent_step: null, agent_heartbeat_at: null } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', draggedTask.id).select('id');
      if (error || !updated?.length) {
        toast.error(error?.message ? `Erro ao reatribuir: ${error.message}` : 'Não foi possível reatribuir: o card mudou ou é de outra cidade.');
        fetchTasks();
        return;
      }

      const previousName = users.find(u => u.id === (draggedTask.edited_by || draggedTask.assigned_to))?.name || 'fila';
      await logReassignment(draggedTask, `Reatribuído de ${previousName} para ${newEditor?.name || '?'} (Controle de Edição)`);
      await notifyPreviousEditor(draggedTask, targetEditorId);
      toast.success(
        `"${client?.companyName || 'Tarefa'}" reatribuída para ${newEditor?.name || '?'}`,
        { duration: 3000 }
      );
      fetchTasks();
    } catch (err: any) {
      toast.error('Erro ao reatribuir: ' + (err.message || 'erro'));
    } finally {
      setReassigning(false);
      setDraggedTask(null);
    }
  };

  const getClient = (clientId: string) => clients.find(c => c.id === clientId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Scissors size={22} className="text-primary" />
            </div>
            Controle de Edição
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e reatribua tarefas de edição entre editores arrastando os cards
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-muted/50 border border-border text-center">
            <p className="text-xs text-muted-foreground">Na Fila</p>
            <p className="text-xl font-bold text-amber-500">{totalInQueue}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-muted/50 border border-border text-center">
            <p className="text-xs text-muted-foreground">Em Andamento</p>
            <p className="text-xl font-bold text-primary">{totalActive}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-muted/50 border border-border text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold text-foreground">{tasks.length}</p>
          </div>
        </div>
      </div>

      {/* Reassigning overlay */}
      <AnimatePresence>
        {reassigning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="flex items-center gap-3 text-foreground">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-lg font-medium">Reatribuindo tarefa...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 320px)' }}>
        {/* Queue Column */}
        <div
          className={`flex-shrink-0 w-[300px] flex flex-col rounded-xl border transition-all duration-200 ${
            dragOverTarget === '__queue__'
              ? 'border-amber-500 bg-amber-500/5 shadow-lg shadow-amber-500/10'
              : 'border-border bg-muted/20'
          }`}
          onDragOver={e => handleDragOver(e, '__queue__')}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, '__queue__')}
        >
          <div className="p-3 border-b border-border flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <ListOrdered size={14} className="text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Fila de Edição</p>
              <p className="text-[10px] text-muted-foreground">
                Tarefas aguardando editor
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px] shrink-0 bg-amber-500/20 text-amber-400">
              {queueTasks.length}
            </Badge>
          </div>

          <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-420px)]">
            {queueTasks.length === 0 && (
              <div className="py-8 text-center">
                <Film size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground/50">Fila vazia</p>
              </div>
            )}

            <AnimatePresence>
              {queueTasks.map(task => (
                <EditingTaskCard
                  key={task.id}
                  task={task}
                  client={getClient(task.client_id)}
                  isDragging={draggedTask?.id === task.id}
                  onDragStart={handleDragStart}
                  showEditor={false}
                  editors={users}
                  canDrag={canDragTask(task)}
                />
              ))}
            </AnimatePresence>
          </div>

          {dragOverTarget === '__queue__' && draggedTask && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mx-2 mb-2 p-3 rounded-lg border-2 border-dashed border-amber-500/50 bg-amber-500/5 text-center"
            >
              <ArrowLeftRight size={16} className="mx-auto mb-1 text-amber-500" />
              <p className="text-xs font-medium text-amber-500">Devolver para fila</p>
            </motion.div>
          )}
        </div>

        {/* Editor Columns */}
        {editors.map(editor => {
          const editorTasks = tasksByEditor[editor.id] || [];
          const isOver = dragOverTarget === editor.id;
          const activeCount = editorTasks.filter(t => t.kanban_column === 'edicao' || t.kanban_column === 'alteracao').length;
          const reviewCount = editorTasks.filter(t => t.kanban_column === 'revisao').length;

          return (
            <div
              key={editor.id}
              className={`flex-shrink-0 w-[300px] flex flex-col rounded-xl border transition-all duration-200 ${
                isOver
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-border bg-muted/20'
              }`}
              onDragOver={e => handleDragOver(e, editor.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, editor.id)}
            >
              <div className="p-3 border-b border-border flex items-center gap-2.5">
                <UserAvatar user={editor} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{editor.displayName || editor.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {activeCount} editando · {reviewCount} em revisão
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {editorTasks.length}
                </Badge>
              </div>

              <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-420px)]">
                {editorTasks.length === 0 && (
                  <div className="py-8 text-center">
                    <Scissors size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground/50">Sem tarefas</p>
                  </div>
                )}

                <AnimatePresence>
                  {editorTasks.map(task => (
                    <EditingTaskCard
                      key={task.id}
                      task={task}
                      client={getClient(task.client_id)}
                      isDragging={draggedTask?.id === task.id}
                      onDragStart={handleDragStart}
                      showEditor={false}
                      editors={users}
                      canDrag={canDragTask(task)}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {isOver && draggedTask && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mx-2 mb-2 p-3 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 text-center"
                >
                  <ArrowLeftRight size={16} className="mx-auto mb-1 text-primary" />
                  <p className="text-xs font-medium text-primary">Atribuir para {editor.displayName || editor.name}</p>
                </motion.div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground border-t border-border pt-4">
        <span className="font-medium text-foreground/70">Legenda:</span>
        {Object.entries(COLUMN_COLORS).map(([key, val]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full`} style={{
              backgroundColor: key === 'edicao' ? 'hsl(217 91% 60%)' : key === 'revisao' ? 'hsl(45 93% 47%)' : 'hsl(25 95% 53%)'
            }} />
            {val.label}
          </span>
        ))}
        <span className="ml-2 flex items-center gap-1">
          <GripVertical size={10} /> Arraste para reatribuir
        </span>
        <span className="ml-2">🤖 agente de IA trabalhando · ⏸ agente sem sinal há 30 min ou mais</span>
      </div>

      <ConfirmActionDialog action={confirmAction} onClose={() => setConfirmAction(null)} />
    </div>
  );
}

/* ── Editing Task Card ── */
function EditingTaskCard({
  task, client, isDragging, onDragStart, showEditor, editors, canDrag = true,
}: {
  /** Fora da gestão, só os próprios cards (e os livres da fila) podem ser arrastados. */
  canDrag?: boolean;
  task: EditingTask;
  client?: { id: string; companyName: string; color: string; logoUrl?: string };
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, t: EditingTask) => void;
  showEditor: boolean;
  editors: any[];
}) {
  const colInfo = COLUMN_COLORS[task.kanban_column] || COLUMN_COLORS.edicao;
  const isAlteration = task.kanban_column === 'alteracao';
  const work = agentWorkState(task);

  // Calculate time in current state
  const timeLabel = task.editing_started_at
    ? formatDistanceToNow(new Date(task.editing_started_at), { locale: ptBR, addSuffix: false })
    : task.created_at
      ? formatDistanceToNow(new Date(task.created_at), { locale: ptBR, addSuffix: false })
      : '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: isDragging ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      draggable={canDrag}
      onDragStart={canDrag ? (e => onDragStart(e as unknown as React.DragEvent, task)) : undefined}
      title={canDrag ? undefined : 'Card de outro editor: só a gestão tira ou reatribui'}
      className={`group relative p-3 rounded-lg border transition-all ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} ${
        isDragging
          ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
          : 'border-border bg-background hover:border-primary/30 hover:shadow-md'
      }`}
    >
      {/* Drag handle */}
      <div className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical size={12} className="text-muted-foreground" />
      </div>

      {/* Priority badge */}
      {(task.editing_priority || task.immediate_alteration) && (
        <div className="mb-1.5">
          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
            {task.immediate_alteration ? '⚡ Alteração Imediata' : '🔥 Prioridade'}
          </Badge>
        </div>
      )}

      {/* Client info */}
      <div className="flex items-center gap-2 mb-2">
        {client && (
          <ClientLogo
            client={{ companyName: client.companyName, color: client.color, logoUrl: client.logoUrl }}
            size="sm"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{client?.companyName || 'Cliente'}</p>
          <p className="text-[10px] text-muted-foreground truncate">{task.title}</p>
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${colInfo.bg} ${colInfo.text}`}>
          {isAlteration ? 'Alteração' : colInfo.label}
        </span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
          {CONTENT_TYPE_LABELS[task.content_type] || task.content_type}
        </Badge>
        {timeLabel && (
          <span className="text-[10px] font-mono flex items-center gap-0.5 text-muted-foreground">
            <Clock size={9} /> {timeLabel}
          </span>
        )}
      </div>

      {/* Agente de IA com o card */}
      {work && (
        <div className={`mt-1.5 text-[9px] font-semibold truncate ${work.state === 'working' ? 'text-indigo-400' : 'text-slate-400'}`}>
          {work.state === 'working'
            ? `🤖 ${work.step}`
            : `⏸ sem sinal${work.minutes !== null ? ` há ${formatSince(work.minutes)}` : ''} · ${work.step}`}
        </div>
      )}

      {/* Deadline warning */}
      {(task.editing_deadline || task.alteration_deadline) && (() => {
        const deadline = task.kanban_column === 'alteracao' ? task.alteration_deadline : task.editing_deadline;
        if (!deadline) return null;
        const isOverdue = new Date(deadline) < new Date();
        if (!isOverdue) return null;
        return (
          <div className="mt-1.5 flex items-center gap-1 text-[9px] text-red-400">
            <AlertTriangle size={10} />
            <span>Prazo vencido</span>
          </div>
        );
      })()}
    </motion.div>
  );
}

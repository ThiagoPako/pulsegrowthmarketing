import { useState, useMemo, useCallback, useRef, DragEvent } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask, DesignTaskColumn } from '@/hooks/useDesignTasks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Kanban, List, Clock, GripVertical, Sparkles, Zap, Eye, Send, CheckCircle2, RotateCcw, Pencil, Trash2, Play, Image as ImageIcon, Upload, Download, FileDown, Calendar, Undo2, Flame } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import DesignTaskCreateDialog from '@/components/designer/DesignTaskCreateDialog';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';
import { downloadSingleArt, downloadArtsAsPdf } from '@/lib/designerDownload';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  media: { label: 'Média', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  alta: { label: 'Alta', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed',
  story: 'Story',
  logomarca: 'Logomarca',
  midia_fisica: 'Mídia Física',
};

const COLUMN_CONFIG: Record<string, { icon: React.ReactNode; gradient: string }> = {
  nova_tarefa: { icon: <Sparkles size={15} />, gradient: 'from-blue-500/20 to-blue-600/10 dark:from-blue-500/30 dark:to-blue-600/10' },
  executando: { icon: <Zap size={15} />, gradient: 'from-amber-500/20 to-yellow-500/10 dark:from-amber-500/30 dark:to-yellow-500/10' },
  em_analise: { icon: <Eye size={15} />, gradient: 'from-purple-500/20 to-violet-500/10 dark:from-purple-500/30 dark:to-violet-500/10' },
  enviar_cliente: { icon: <Send size={15} />, gradient: 'from-cyan-500/20 to-teal-500/10 dark:from-cyan-500/30 dark:to-teal-500/10' },
  aprovado: { icon: <CheckCircle2 size={15} />, gradient: 'from-emerald-500/20 to-green-500/10 dark:from-emerald-500/30 dark:to-green-500/10' },
  ajustes: { icon: <RotateCcw size={15} />, gradient: 'from-red-500/20 to-rose-500/10 dark:from-red-500/30 dark:to-rose-500/10' },
};

/* ── Drag-to-scroll container ── */
function DragScrollContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftRef = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, [draggable="true"], [role="button"]')) return;
    isDragging.current = true;
    startX.current = e.pageX - (ref.current?.offsetLeft || 0);
    scrollLeftRef.current = ref.current?.scrollLeft || 0;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    ref.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const onMouseUp = () => { isDragging.current = false; };

  return (
    <div
      ref={ref}
      className={`overflow-x-auto ${isDragging.current ? 'cursor-grabbing select-none' : 'cursor-grab'} ${className || ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {children}
    </div>
  );
}

export default function DesignerKanban() {
  const { tasksQuery, updateTask, addHistory, deleteTask } = useDesignTasks();
  const { currentUser } = useApp();
  const { user } = useAuth();
  const [view, setView] = useState<'kanban' | 'lista' | 'agendamentos'>('kanban');
  const [createOpen, setCreateOpen] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [copyPreviewTask, setCopyPreviewTask] = useState<DesignTask | null>(null);

  const tasks = tasksQuery.data || [];
  const error = tasksQuery.error as any;
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const canDelete = currentUser?.role === 'admin';

  const PRIORITY_WEIGHT: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

  const tasksByColumn = useMemo(() => {
    const map: Record<string, DesignTask[]> = {};
    DESIGN_COLUMNS.forEach(c => { map[c.key] = []; });
    tasks.forEach(t => {
      if (map[t.kanban_column]) map[t.kanban_column].push(t);
    });
    // Order by position asc, then priority weight, then created_at asc
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => {
        const pa = a.position ?? 999999;
        const pb = b.position ?? 999999;
        if (pa !== pb) return pa - pb;
        const wa = PRIORITY_WEIGHT[a.priority] ?? 9;
        const wb = PRIORITY_WEIGHT[b.priority] ?? 9;
        if (wa !== wb) return wa - wb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    });
    return map;
  }, [tasks]);

  const handleDragStart = useCallback((e: DragEvent, task: DesignTask) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(task.id);
  }, []);

  const handleDragOver = useCallback((e: DragEvent, colKey: string, overTaskId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(colKey);
    if (overTaskId) setDragOverTaskId(overTaskId);
  }, []);

  const handleDragLeave = useCallback(() => { 
    setDragOverColumn(null); 
    setDragOverTaskId(null);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent, targetColumn: DesignTaskColumn, overTaskId?: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDragOverTaskId(null);
    setDraggingTaskId(null);

    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Se mudou de coluna ou se mudou de posição na mesma coluna
    const isChangingColumn = task.kanban_column !== targetColumn;
    const isChangingPosition = overTaskId && overTaskId !== taskId;

    if (!isChangingColumn && !isChangingPosition) return;

    const targetLabel = DESIGN_COLUMNS.find(c => c.key === targetColumn)?.label || targetColumn;
    const extraFields: Record<string, any> = {};

    // Calculate new position
    const colTasks = [...(tasksByColumn[targetColumn] || [])].filter(t => t.id !== taskId);
    let newPosition = 0;
    
    if (overTaskId) {
      const overIdx = colTasks.findIndex(t => t.id === overTaskId);
      // Insert BEFORE the card we are hovering over
      newPosition = overIdx === 0 ? (colTasks[0]?.position || 1000) - 100 : ((colTasks[overIdx-1]?.position || 0) + (colTasks[overIdx]?.position || 0)) / 2;
    } else {
      // If no overTaskId, append to the end
      newPosition = colTasks.length > 0 ? (colTasks[colTasks.length-1]?.position || 0) + 100 : 1000;
    }
    
    extraFields.position = newPosition;

    if (targetColumn === 'executando') {
      if (!task.started_at) extraFields.started_at = new Date().toISOString();
      if (!task.assigned_to && user?.id) extraFields.assigned_to = user.id;
    }

    if (targetColumn === 'em_analise') {
      const hasAttachment = task.attachment_url || (task as any).mockup_url;
      if (!hasAttachment) {
        toast.error('Anexe a arte ou mockup antes de enviar para análise');
        return;
      }
      // Card está pronto: remover data de vencimento para não ficar marcado como atrasado
      extraFields.due_date = null;
    }

    if (targetColumn === 'aprovado') {
      extraFields.completed_at = new Date().toISOString();
      extraFields.client_approved_at = new Date().toISOString();
      if (task.format_type === 'logomarca' && task.client_id) {
        const fileUrl = task.attachment_url || (task as any).mockup_url;
        if (fileUrl) {
          await supabase.from('clients').update({ drive_identidade_visual: fileUrl }).eq('id', task.client_id);
          toast.info('Drive de Identidade Visual do cliente atualizado!');
        }
      }
    }

    if (targetColumn === 'enviar_cliente') {
      if (!task.sent_to_client_at) extraFields.sent_to_client_at = new Date().toISOString();
    }

    try {
      await updateTask.mutateAsync({ id: taskId, kanban_column: targetColumn, ...extraFields } as any);
      await addHistory.mutateAsync({ task_id: taskId, action: `Movido para ${targetLabel}`, user_id: user?.id });
      toast.success(`Tarefa movida para "${targetLabel}"`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao mover tarefa');
    }
  }, [tasks, user, updateTask, addHistory]);

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null);
    setDragOverColumn(null);
    setDragOverTaskId(null);
  }, []);

  const handleQuickStart = async (task: DesignTask) => {
    try {
      const now = new Date().toISOString();
      await updateTask.mutateAsync({
        id: task.id,
        kanban_column: 'executando',
        started_at: task.started_at || now,
        assigned_to: user?.id || task.assigned_to,
        timer_running: true,
        timer_started_at: now,
      } as any);
      await addHistory.mutateAsync({ task_id: task.id, action: 'Iniciou execução', user_id: user?.id });
      toast.success('Tarefa iniciada! 🎨');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao iniciar');
    }
  };

  const handleReturnToQueue = async (task: DesignTask) => {
    if (!window.confirm(`Devolver "${task.title}" para Nova Tarefa? O cronômetro será pausado.`)) return;
    try {
      await updateTask.mutateAsync({
        id: task.id,
        kanban_column: 'nova_tarefa',
        timer_running: false,
        timer_started_at: null,
      } as any);
      await addHistory.mutateAsync({
        task_id: task.id,
        action: 'Devolvida para fila',
        details: 'Designer retornou a tarefa para Nova Tarefa para trocar/ajustar',
        user_id: user?.id,
      });
      toast.success('Tarefa devolvida para a fila');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao devolver tarefa');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Designer</h1>
          <p className="text-sm text-muted-foreground">Gerenciamento de tarefas de design</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={v => setView(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="kanban" className="text-xs gap-1"><Kanban size={14} /> Kanban</TabsTrigger>
              <TabsTrigger value="agendamentos" className="text-xs gap-1"><Calendar size={14} /> Agendamentos</TabsTrigger>
              <TabsTrigger value="lista" className="text-xs gap-1"><List size={14} /> Lista</TabsTrigger>
            </TabsList>
          </Tabs>
          {(currentUser?.role === 'admin' || currentUser?.role === 'social_media' || currentUser?.role === 'designer') && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={16} className="mr-1" /> Nova Tarefa
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400" role="alert">
          <span className="font-medium">Erro ao carregar tarefas:</span> {error.message || 'Erro desconhecido'}
          <p className="mt-1 text-xs">Verifique se as colunas 'position' e 'due_date' foram criadas no banco de dados da VPS.</p>
        </div>
      )}

      {view === 'kanban' ? (
        <DragScrollContainer className="pb-4">
          <div className="flex gap-3 min-w-max" style={{ height: 'calc(100vh - 180px)' }}>
            {DESIGN_COLUMNS.map((col, colIdx) => {
              const cfg = COLUMN_CONFIG[col.key];
              const colTasks = tasksByColumn[col.key] || [];
              return (
                <motion.div
                  key={col.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: colIdx * 0.07, duration: 0.35 }}
                  className={`min-w-[270px] w-[270px] flex-shrink-0 rounded-xl transition-all duration-200 flex flex-col ${
                    dragOverColumn === col.key ? 'ring-2 ring-primary/40 bg-primary/5 scale-[1.01]' : ''
                  }`}
                  onDragOver={e => handleDragOver(e, col.key)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, col.key)}
                >
                  {/* Column header */}
                  <motion.div
                    className={`relative overflow-hidden rounded-xl p-3 mb-3 bg-gradient-to-r ${cfg.gradient} border border-border/50 shrink-0`}
                    whileHover={{ scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                    <div className="flex items-center gap-2 relative z-10">
                      <motion.span
                        className="text-foreground/80"
                        animate={{ rotate: [0, -6, 6, 0] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
                      >
                        {cfg.icon}
                      </motion.span>
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground/90">{col.label}</span>
                      <motion.div
                        key={colTasks.length}
                        initial={{ scale: 1.4 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500 }}
                        className="ml-auto flex items-center gap-1"
                      >
                        <Badge variant="secondary" className="text-[10px] h-5">{colTasks.length}</Badge>
                        {col.key === 'aprovado' && colTasks.some(t => t.attachment_url || (t as any).mockup_url) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="ml-1 w-6 h-6 flex items-center justify-center rounded-md bg-background/70 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="Baixar artes aprovadas"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download size={12} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                onClick={async () => {
                                  const items = colTasks
                                    .map(t => ({ url: (t.attachment_url || (t as any).mockup_url) as string, title: t.title }))
                                    .filter(i => i.url);
                                  if (items.length === 0) return toast.error('Nenhuma arte disponível');
                                  toast.info(`Baixando ${items.length} arte${items.length > 1 ? 's' : ''}...`);
                                  for (const it of items) await downloadSingleArt(it.url, it.title);
                                }}
                              >
                                <Download size={14} className="mr-2" /> Baixar todas (individual)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  const items = colTasks
                                    .map(t => ({ url: (t.attachment_url || (t as any).mockup_url) as string, title: t.title }))
                                    .filter(i => i.url);
                                  if (items.length === 0) return toast.error('Nenhuma arte disponível');
                                  toast.info(`Gerando PDF com ${items.length} arte${items.length > 1 ? 's' : ''}...`);
                                  await downloadArtsAsPdf(items, `Artes-Aprovadas-${new Date().toISOString().slice(0, 10)}`);
                                  toast.success('PDF gerado!');
                                }}
                              >
                                <FileDown size={14} className="mr-2" /> Agrupar em PDF
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </motion.div>
                    </div>
                  </motion.div>

                  {/* Cards - scrollable */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-2 min-h-[100px] px-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    <AnimatePresence mode="popLayout">
                      {colTasks.map((task, i) => (
                        <motion.div
                          key={task.id}
                          layout
                          initial={{ opacity: 0, scale: 0.92, y: 12 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -8 }}
                          transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 25 }}
                          onDragOver={e => handleDragOver(e, col.key, task.id)}
                        >
                          <TaskCard
                            task={task}
                            queueIndex={col.key === 'nova_tarefa' || col.key === 'executando' ? i + 1 : null}
                            columnKey={col.key}
                            isDragging={draggingTaskId === task.id}
                            onClick={() => setCopyPreviewTask(task)}
                            onOpenDetail={() => setSelectedTaskId(task.id)}
                            onDelete={async () => {
                              if (window.confirm(`Excluir "${task.title}"? Esta ação não pode ser desfeita.`)) {
                                await deleteTask.mutateAsync(task.id);
                              }
                            }}
                            canDelete={canDelete}
                            onQuickStart={col.key === 'nova_tarefa' ? () => handleQuickStart(task) : undefined}
                            onReturnToQueue={col.key === 'executando' ? () => handleReturnToQueue(task) : undefined}
                            onDragStart={e => handleDragStart(e, task)}
                            onDragEnd={handleDragEnd}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {colTasks.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-8 text-muted-foreground/40"
                      >
                        <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                          {cfg.icon}
                        </motion.div>
                        <span className="text-[10px] mt-2">Nenhuma tarefa</span>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </DragScrollContainer>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs">
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Título</th>
                <th className="text-left p-3">Formato</th>
                <th className="text-left p-3">Prioridade</th>
                <th className="text-left p-3">Etapa</th>
                <th className="text-left p-3">Criado</th>
                <th className="text-right p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id} className="border-t hover:bg-muted/30 cursor-pointer group" onClick={() => setCopyPreviewTask(task)}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
                      <span className="text-xs font-medium">{task.clients?.company_name}</span>
                    </div>
                  </td>
                  <td className="p-3 font-medium">{task.title}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[10px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge></td>
                  <td className="p-3"><Badge className={`text-[10px] ${PRIORITY_CONFIG[task.priority]?.color}`}>{PRIORITY_CONFIG[task.priority]?.label}</Badge></td>
                  <td className="p-3"><Badge variant="secondary" className="text-[10px]">{DESIGN_COLUMNS.find(c => c.key === task.kanban_column)?.label}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(task.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={(e) => { e.stopPropagation(); setSelectedTaskId(task.id); }}
                      >
                        <Pencil size={13} />
                      </Button>
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`Excluir "${task.title}"?`)) {
                              await deleteTask.mutateAsync(task.id);
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Copy Preview Dialog */}
      {copyPreviewTask && (
        <CopyPreviewDialog
          task={copyPreviewTask}
          onClose={() => setCopyPreviewTask(null)}
          onOpenFull={() => { setSelectedTaskId(copyPreviewTask.id); setCopyPreviewTask(null); }}
        />
      )}

      <DesignTaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      {selectedTask && (
        <DesignTaskDetailSheet task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTaskId(null)} />
      )}
    </div>
  );
}

/* ── Copy Preview Dialog ── */
function CopyPreviewDialog({ task, onClose, onOpenFull }: { task: DesignTask; onClose: () => void; onOpenFull: () => void }) {
  const color = task.clients?.color || '217 91% 60%';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-1.5 h-10 rounded-full" style={{ background: `hsl(${color})` }} />
          <ClientLogo client={{ companyName: task.clients?.company_name || '', color, logoUrl: task.clients?.logo_url }} size="md" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{task.title}</p>
            <p className="text-xs text-muted-foreground">{task.clients?.company_name} • {FORMAT_LABELS[task.format_type] || task.format_type}</p>
          </div>
          <Badge className={`text-[10px] ${PRIORITY_CONFIG[task.priority]?.color}`}>{PRIORITY_CONFIG[task.priority]?.label}</Badge>
        </div>

        {/* Copy text */}
        <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {task.copy_text ? (
            <div className="rounded-lg bg-accent/30 border border-accent p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">📝 Copy da Arte</p>
              <p className="text-sm whitespace-pre-line leading-relaxed">{task.copy_text}</p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/30 border border-border p-3 text-center">
              <p className="text-xs text-muted-foreground">Sem copy definida para esta arte</p>
            </div>
          )}

          {task.description && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">📋 Descrição</p>
              <p className="text-sm whitespace-pre-line leading-relaxed">{task.description}</p>
            </div>
          )}

          {/* Reference images preview */}
          {task.reference_images?.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">🎨 Referências</p>
              <div className="flex flex-wrap gap-2">
                {task.reference_images.map((img, i) => {
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(img);
                  return isImage ? (
                    <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="rounded-lg overflow-hidden border border-border w-20 h-20 hover:ring-2 hover:ring-primary/50">
                      <img src={img} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 p-2 rounded-lg border border-border">
                      <ImageIcon size={12} /> Ref {i + 1}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reference links with image preview */}
          {task.references_links?.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">🔗 Links de Referência</p>
              <div className="space-y-2">
                {task.references_links.map((link, i) => {
                  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(link);
                  return (
                    <div key={i}>
                      <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all flex items-center gap-1">
                        {isImage ? <ImageIcon size={11} /> : <Eye size={11} />} {link}
                      </a>
                      {isImage && (
                        <img src={link} alt={`Ref link ${i + 1}`} className="mt-1 rounded-lg border border-border max-h-32 object-contain" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          <Button size="sm" onClick={onOpenFull} className="gap-1.5">
            <Eye size={13} /> Ver Detalhes Completos
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Enhanced Task Card ── */
interface TaskCardProps {
  task: DesignTask;
  queueIndex?: number | null;
  columnKey?: string;
  isDragging: boolean;
  onClick: () => void;
  onOpenDetail: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onQuickStart?: () => void;
  onReturnToQueue?: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function TaskCard({ task, queueIndex, columnKey, isDragging, onClick, onOpenDetail, onDelete, canDelete, onQuickStart, onReturnToQueue, onDragStart, onDragEnd }: TaskCardProps) {
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
  
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.kanban_column !== 'aprovado';
  const formattedDueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR') : null;
  const isNext = queueIndex === 1 && columnKey === 'nova_tarefa';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`relative bg-card border border-border/60 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 space-y-2.5 group ${
        isDragging ? 'opacity-40 scale-95 ring-2 ring-primary/40' : ''
      } ${isOverdue ? 'border-red-500/50 bg-red-50/10 dark:bg-red-950/5 animate-[pulse_2s_infinite]' : ''} ${
        isNext ? 'ring-2 ring-amber-400/70 shadow-lg shadow-amber-500/10' : ''
      }`}
    >
      {/* Queue order badge */}
      {queueIndex != null && (
        <div
          className={`absolute -top-2 -left-2 z-20 min-w-[26px] h-[26px] px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold shadow-md ${
            isNext
              ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white ring-2 ring-background animate-pulse'
              : 'bg-primary text-primary-foreground ring-2 ring-background'
          }`}
          title={isNext ? 'Próxima a executar' : `Posição ${queueIndex} na fila`}
        >
          {isNext ? <Flame size={11} /> : `#${queueIndex}`}
        </div>
      )}
      {/* Quick action buttons - positioned away from top-right close area */}
      <div className="absolute top-2 left-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
          className="w-6 h-6 flex items-center justify-center rounded-md bg-muted/80 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
          title="Detalhes"
        >
          <Pencil size={12} />
        </button>
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-6 h-6 flex items-center justify-center rounded-md bg-muted/80 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Excluir"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <GripVertical size={12} className="text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />
        <ClientLogo client={{ companyName: task.clients?.company_name || task.prospect_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
        <span className="text-[11px] text-muted-foreground truncate">{task.clients?.company_name || task.prospect_name}</span>
      </div>
      <p className="text-sm font-medium line-clamp-2 group-hover:text-primary/90 transition-colors">{task.title}</p>
      
      {/* Copy preview snippet */}
      {task.copy_text && (
        <p className="text-[10px] text-muted-foreground line-clamp-2 italic bg-muted/30 rounded px-2 py-1">
          📝 {task.copy_text}
        </p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge>
        <Badge className={`text-[10px] ${priorityCfg.color}`}>{priorityCfg.label}</Badge>
        {formattedDueDate && (
          <Badge variant="outline" className={`text-[10px] gap-1 ${isOverdue ? 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30' : ''}`}>
            <Calendar size={10} /> {formattedDueDate}
          </Badge>
        )}
        {task.timer_running && (
          <Badge variant="secondary" className="text-[10px] gap-0.5 animate-pulse"><Clock size={10} /> Em andamento</Badge>
        )}
        {task.attachment_url && (
          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <CheckCircle2 size={9} className="mr-0.5" /> Arte ✓
          </Badge>
        )}
      </div>

      {/* Quick Start button for nova_tarefa */}
      {onQuickStart && (
        <Button
          size="sm"
          className="w-full h-8 text-xs gap-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-lg"
          onClick={(e) => { e.stopPropagation(); onQuickStart(); }}
        >
          <Play size={12} fill="currentColor" /> Iniciar Tarefa
        </Button>
      )}

      {/* Return to queue button for executando */}
      {onReturnToQueue && (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-[11px] gap-1.5 border-dashed text-muted-foreground hover:text-foreground hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 rounded-lg"
          onClick={(e) => { e.stopPropagation(); onReturnToQueue(); }}
          title="Devolver para Nova Tarefa para trocar ou adicionar arte"
        >
          <Undo2 size={11} /> Voltar para Nova Tarefa
        </Button>
      )}
    </div>
  );
}

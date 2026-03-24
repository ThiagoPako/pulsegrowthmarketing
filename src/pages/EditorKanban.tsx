import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/vpsDb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Film, Megaphone, Image, Palette, ExternalLink, Clock, AlertTriangle,
  Check, Eye, Search, Scissors, Send, Link2
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import DeadlineBadge from '@/components/DeadlineBadge';
import { highlightQuotes } from '@/lib/highlightQuotes';
import { format, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { syncContentTaskColumnChange, buildSyncContext } from '@/lib/contentTaskSync';

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400', points: 10 },
  { value: 'criativo', label: 'Criativos', icon: Megaphone, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400', points: 5 },
  { value: 'story', label: 'Story', icon: Image, color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400', points: 3 },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400', points: 2 },
];

const EDITOR_COLUMNS = [
  { id: 'edicao', label: 'Para Editar', bg: '#3498db', icon: '🎬' },
  { id: 'revisao', label: 'Em Revisão', bg: '#1abc9c', icon: '👁' },
  { id: 'alteracao', label: 'Alteração', bg: '#f1c40f', icon: '✏️' },
  { id: 'envio', label: 'Concluído', bg: '#2ecc71', icon: '✅' },
] as const;

interface EditorTask {
  id: string;
  client_id: string;
  title: string;
  content_type: string;
  kanban_column: string;
  description: string | null;
  script_id: string | null;
  recording_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  drive_link: string | null;
  edited_video_link: string | null;
  editing_deadline: string | null;
  editing_started_at: string | null;
  review_deadline: string | null;
  alteration_deadline: string | null;
  approval_deadline: string | null;
  immediate_alteration: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

function getDeadlineStatus(deadline: string | null) {
  if (!deadline) return { label: 'Sem prazo', variant: 'default' as const };
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const hoursLeft = differenceInHours(deadlineDate, now);
  if (isPast(deadlineDate)) return { label: 'Atrasado', variant: 'destructive' as const };
  if (hoursLeft <= 12) return { label: 'Vence hoje', variant: 'warning' as const };
  if (hoursLeft <= 24) return { label: 'Vence amanhã', variant: 'warning' as const };
  return { label: `${Math.ceil(hoursLeft / 24)}d restantes`, variant: 'success' as const };
}

function getTypeConfig(type: string) {
  return CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
}

function TaskCard({ task, clients, onOpenScript, onSendToReview, onAddVideoLink, onClaimTask, draggedId, onDragStart, currentUserId, users }: {
  task: EditorTask; clients: any[]; onOpenScript: (id: string) => void;
  onSendToReview: (task: EditorTask) => void;
  onAddVideoLink: (task: EditorTask) => void;
  onClaimTask: (task: EditorTask) => void;
  draggedId: string | null; onDragStart: (e: React.DragEvent, task: EditorTask) => void;
  currentUserId: string | undefined;
  users: any[];
}) {
  const client = clients.find(c => c.id === task.client_id);
  const typeConfig = getTypeConfig(task.content_type);
  const TypeIcon = typeConfig.icon;
  const clientColor = client?.color || '217 91% 60%';
  const deadlineStatus = getDeadlineStatus(task.editing_deadline);
  const hasVideoLink = !!task.edited_video_link;

  const isReview = task.kanban_column === 'revisao';

  return (
    <div draggable onDragStart={e => onDragStart(e, task)}
      className={`group relative bg-card border rounded-lg cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
        draggedId === task.id ? 'opacity-40 scale-95' : ''
      } ${isReview ? 'border-teal-500/40 bg-teal-500/5' : 'border-border'} ${
        deadlineStatus.variant === 'destructive' && task.kanban_column === 'edicao' ? 'ring-1 ring-destructive/40' : ''
      }`}>
      <div className="h-1 w-full rounded-t-lg" style={{ backgroundColor: `hsl(${clientColor})` }} />
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {client && <ClientLogo client={client as any} size="sm" />}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate">{client?.companyName || 'Cliente'}</p>
              <Badge className={`text-[9px] px-1.5 py-0 ${typeConfig.color} border-0`}>
                <TypeIcon size={9} className="mr-0.5" />{typeConfig.label}
              </Badge>
            </div>
          </div>
          {task.kanban_column === 'edicao' && (
            <Badge variant={deadlineStatus.variant === 'destructive' ? 'destructive' : 'outline'}
              className={`text-[9px] shrink-0 ${
                deadlineStatus.variant === 'warning' ? 'bg-warning/20 text-warning border-warning/30' :
                deadlineStatus.variant === 'success' ? 'bg-success/20 text-success border-success/30' : ''
              }`}>
              {deadlineStatus.variant === 'destructive' && <AlertTriangle size={9} className="mr-0.5" />}
              {deadlineStatus.variant === 'warning' && <Clock size={9} className="mr-0.5" />}
              {deadlineStatus.label}
            </Badge>
          )}
          {task.kanban_column === 'revisao' && (
            <Badge className="text-[9px] bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30 gap-0.5">
              <Eye size={9} /> Em Revisão
            </Badge>
          )}
          {task.kanban_column === 'envio' && (
            <Badge className="text-[9px] bg-success/20 text-success border-success/30">
              <Check size={9} className="mr-0.5" /> Concluído
            </Badge>
          )}
        </div>
        <p className="text-sm font-semibold text-foreground leading-tight">{task.title}</p>
        
        {/* Script alteration badges */}
        {(task as any).script_alteration_type === 'altered' && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-2">
            <p className="text-[10px] font-bold text-amber-600 mb-0.5">⚠️ ROTEIRO ALTERADO</p>
            <p className="text-[10px] text-foreground/80">Não seguir o roteiro original.</p>
            {(task as any).script_alteration_notes && (
              <p className="text-[10px] text-foreground/70 mt-1 whitespace-pre-wrap">📝 {(task as any).script_alteration_notes}</p>
            )}
          </div>
        )}
        {(task as any).script_alteration_type === 'verbal' && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-2">
            <p className="text-[10px] font-bold text-blue-600">🗣️ ALTERAÇÃO VERBAL</p>
            {(task as any).script_alteration_notes && (
              <p className="text-[10px] text-foreground/70 mt-1 whitespace-pre-wrap">📝 {(task as any).script_alteration_notes}</p>
            )}
          </div>
        )}

        {/* Alteration notes */}
        {task.kanban_column === 'alteracao' && task.description && (
          <div className="bg-warning/10 border border-warning/20 rounded-md p-2">
            <p className="text-[10px] font-semibold text-warning mb-0.5">📝 Notas de alteração:</p>
            <p className="text-[10px] text-foreground/80 whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* Script link */}
        {task.script_id && (
          <button onClick={() => onOpenScript(task.script_id!)} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
            <Eye size={11} /> Ver roteiro gravado
          </button>
        )}

        {/* Drive link (raw materials) */}
        {task.drive_link && (
          <a href={task.drive_link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-900/20 rounded-md px-2 py-1.5">
            <ExternalLink size={12} />📁 Abrir materiais no Drive
          </a>
        )}

        {/* Edited video link */}
        {hasVideoLink && (
          <a href={`/portal/${task.client_id}`}
            className="flex items-center gap-1.5 text-[11px] font-medium text-green-600 dark:text-green-400 hover:underline bg-green-50 dark:bg-green-900/20 rounded-md px-2 py-1.5">
            <Eye size={12} />🎬 Assistir no Portal
          </a>
        )}

        {/* Deadlines per column */}
        {task.kanban_column === 'edicao' && task.editing_deadline && (
          <DeadlineBadge deadline={task.editing_deadline} label="Edição" />
        )}
        {task.kanban_column === 'revisao' && task.review_deadline && (
          <DeadlineBadge deadline={task.review_deadline} label="Revisão" />
        )}
        {task.kanban_column === 'alteracao' && task.alteration_deadline && !task.immediate_alteration && (
          <DeadlineBadge deadline={task.alteration_deadline} label="Alteração" />
        )}
        {task.kanban_column === 'envio' && task.approval_deadline && (
          <DeadlineBadge deadline={task.approval_deadline} label="Aprovação" />
        )}

        {/* Assigned editor badge - show "editado por" in review */}
        {task.assigned_to && (
          <div className={`flex items-center gap-1.5 text-[10px] rounded-md px-2 py-1 ${
            isReview ? 'text-teal-700 dark:text-teal-300 bg-teal-500/10 border border-teal-500/20' : 'text-muted-foreground bg-muted/50'
          }`}>
            <Scissors size={10} />
            <span>{isReview ? 'Editado por' : 'Editor'}: <strong className="text-foreground">{users.find(u => u.id === task.assigned_to)?.name || 'Editor'}</strong></span>
          </div>
        )}

        {/* Action buttons based on column */}
        {task.kanban_column === 'edicao' && !task.assigned_to && (
          <Button size="sm" className="w-full gap-1.5 h-7 text-xs mt-1 bg-primary hover:bg-primary/90" 
            onClick={(e) => { e.stopPropagation(); onClaimTask(task); }}>
            <Scissors size={11} /> Pegar para Editar
          </Button>
        )}
        {task.kanban_column === 'edicao' && task.assigned_to === currentUserId && (
          <Button size="sm" variant={hasVideoLink ? 'default' : 'outline'} 
            className={`w-full gap-1.5 h-7 text-xs mt-1 ${!hasVideoLink ? 'border-dashed' : ''}`} 
            onClick={(e) => { e.stopPropagation(); onAddVideoLink(task); }}>
            <Link2 size={11} /> {hasVideoLink ? 'Atualizar link do vídeo' : '📎 Adicionar link do vídeo editado'}
          </Button>
        )}
        
        {task.kanban_column === 'alteracao' && (
          <div className="space-y-1.5 mt-1">
            {!hasVideoLink && (
              <Button size="sm" variant="outline" className="w-full gap-1.5 h-7 text-xs border-dashed" 
                onClick={(e) => { e.stopPropagation(); onAddVideoLink(task); }}>
                <Link2 size={11} /> 📎 Adicionar link do vídeo corrigido
              </Button>
            )}
            <Button size="sm" className="w-full gap-1.5 h-7 text-xs" 
              disabled={!hasVideoLink}
              onClick={(e) => { e.stopPropagation(); onSendToReview(task); }}>
              <Send size={11} /> Enviar para Aprovação
            </Button>
            {!hasVideoLink && (
              <p className="text-[9px] text-destructive text-center">⚠️ Adicione o link do vídeo antes de enviar</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EditorKanban() {
  const { clients, scripts, users } = useApp();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<EditorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [viewingScript, setViewingScript] = useState<any>(null);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [draggedTask, setDraggedTask] = useState<EditorTask | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Video link dialog
  const [videoLinkDialogOpen, setVideoLinkDialogOpen] = useState(false);
  const [videoLinkTask, setVideoLinkTask] = useState<EditorTask | null>(null);
  const [videoLinkValue, setVideoLinkValue] = useState('');
  const [sendToReviewAfterLink, setSendToReviewAfterLink] = useState(false);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase.from('content_tasks').select('*')
      .in('kanban_column', ['edicao', 'revisao', 'alteracao', 'envio'])
      .order('position', { ascending: true });
    if (data) setTasks(data as EditorTask[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const channel = supabase.channel('editor_kanban_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_tasks' }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  const { profile } = useAuth();
  const isEditorRole = profile?.role === 'editor';

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterClient !== 'all' && t.client_id !== filterClient) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const client = clients.find((c: any) => c.id === t.client_id);
        if (!t.title.toLowerCase().includes(q) && !client?.companyName.toLowerCase().includes(q)) return false;
      }
      // Editor role: only see unassigned tasks or tasks assigned to them
      if (isEditorRole && user) {
        if (t.kanban_column === 'edicao') {
          // Show unassigned or assigned to me
          if (t.assigned_to && t.assigned_to !== user.id) return false;
        } else {
          // For revisao/alteracao/envio: only show tasks I worked on
          if (t.assigned_to && t.assigned_to !== user.id) return false;
        }
      }
      return true;
    });
  }, [tasks, filterClient, searchQuery, clients, isEditorRole, user]);

  const sortedTasksByColumn = useMemo(() => {
    const map: Record<string, EditorTask[]> = {};
    EDITOR_COLUMNS.forEach(col => { map[col.id] = []; });
    filteredTasks.forEach(t => { if (map[t.kanban_column]) map[t.kanban_column].push(t); });
    map['edicao'] = [...(map['edicao'] || [])].sort((a, b) => {
      if (!a.editing_deadline && !b.editing_deadline) return 0;
      if (!a.editing_deadline) return 1;
      if (!b.editing_deadline) return -1;
      return new Date(a.editing_deadline).getTime() - new Date(b.editing_deadline).getTime();
    });
    return map;
  }, [filteredTasks]);

  const handleClaimTask = async (task: EditorTask) => {
    if (!user) return;
    const { error } = await supabase.from('content_tasks').update({
      assigned_to: user.id,
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    if (error) { toast.error('Erro ao pegar tarefa'); return; }
    toast.success('Tarefa atribuída a você!');
    fetchTasks();
  };

  const handleDragStart = (e: React.DragEvent, task: EditorTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  // ─── VALIDATION RULES ─────────────────────────────────────
  const validateTransition = (task: EditorTask, targetColumn: string): string | null => {
    // Moving to revisao requires edited_video_link
    if (targetColumn === 'revisao' && !task.edited_video_link) {
      return 'Adicione o link do vídeo editado antes de enviar para revisão';
    }
    // Moving to envio requires edited_video_link
    if (targetColumn === 'envio' && !task.edited_video_link) {
      return 'Adicione o link do vídeo editado antes de concluir';
    }
    return null;
  };

  const handleDrop = async (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask || draggedTask.kanban_column === targetColumn) { setDraggedTask(null); return; }

    // Validate transition
    const validationError = validateTransition(draggedTask, targetColumn);
    if (validationError) {
      toast.error(validationError);
      if (targetColumn === 'revisao' && !draggedTask.edited_video_link) {
        setVideoLinkTask(draggedTask);
        setVideoLinkValue('');
        setSendToReviewAfterLink(true);
        setVideoLinkDialogOpen(true);
      }
      setDraggedTask(null);
      return;
    }

    const updateData: any = { kanban_column: targetColumn, updated_at: new Date().toISOString() };
    if (targetColumn === 'edicao' && !draggedTask.editing_started_at) {
      updateData.editing_started_at = new Date().toISOString();
    }
    // Auto-assign to current editor if not yet assigned
    if (!draggedTask.assigned_to && user) {
      updateData.assigned_to = user.id;
    }
    const { error } = await supabase.from('content_tasks').update(updateData).eq('id', draggedTask.id);
    if (error) {
      toast.error('Erro ao mover cartão');
    } else {
      // Use shared sync for ALL column changes
      const client = clients.find(c => c.id === draggedTask.client_id);
      const ctx = buildSyncContext(draggedTask as any, {
        userId: user?.id,
        clientName: client?.companyName,
        clientWhatsapp: (client as any)?.whatsapp,
      });
      await syncContentTaskColumnChange(targetColumn, ctx);
      toast.success(`Movido para ${EDITOR_COLUMNS.find(c => c.id === targetColumn)?.label}`);
      fetchTasks();
    }
    setDraggedTask(null);
  };

  // Keep createOrUpdateDelivery as fallback for video link save flow
  const createOrUpdateDelivery = async (task: EditorTask, status: string) => {
    const existing = await supabase.from('social_media_deliveries')
      .select('id').eq('content_task_id', task.id).limit(1);
    if (!existing.data?.length) {
      await supabase.from('social_media_deliveries').insert({
        client_id: task.client_id, content_type: task.content_type,
        title: task.title, description: task.description || null,
        status, delivered_at: format(new Date(), 'yyyy-MM-dd'),
        script_id: task.script_id || null, recording_id: task.recording_id || null,
        created_by: user?.id || null, content_task_id: task.id,
      } as any);
    } else {
      await supabase.from('social_media_deliveries').update({ status } as any).eq('content_task_id', task.id);
    }
  };

  const handleSendToReview = async (task: EditorTask) => {
    if (!task.edited_video_link) {
      toast.error('Adicione o link do vídeo editado antes de enviar para revisão');
      setVideoLinkTask(task);
      setVideoLinkValue('');
      setSendToReviewAfterLink(true);
      setVideoLinkDialogOpen(true);
      return;
    }
    const { error } = await supabase.from('content_tasks').update({
      kanban_column: 'revisao', updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    if (error) { toast.error('Erro ao enviar para revisão'); return; }
    
    // Use shared sync
    const client = clients.find(c => c.id === task.client_id);
    const ctx = buildSyncContext(task as any, {
      userId: user?.id,
      clientName: client?.companyName,
      clientWhatsapp: (client as any)?.whatsapp,
    });
    await syncContentTaskColumnChange('revisao', ctx);
    toast.success('Enviado para revisão');
    fetchTasks();
  };

  // ─── VIDEO LINK DIALOG ─────────────────────────────────────
  const openVideoLinkDialog = (task: EditorTask) => {
    setVideoLinkTask(task);
    setVideoLinkValue(task.edited_video_link || '');
    setSendToReviewAfterLink(false);
    setVideoLinkDialogOpen(true);
  };

  const handleSaveVideoLink = async () => {
    if (!videoLinkTask || !videoLinkValue.trim()) {
      toast.error('Cole o link do vídeo editado');
      return;
    }
    const updatePayload: any = {
      edited_video_link: videoLinkValue.trim(),
      updated_at: new Date().toISOString(),
    };
    // Auto-assign to current editor if not yet assigned
    if (!videoLinkTask.assigned_to && user) {
      updatePayload.assigned_to = user.id;
    }
    const { error } = await supabase.from('content_tasks').update(updatePayload).eq('id', videoLinkTask.id);
    if (error) { toast.error('Erro ao salvar link'); return; }

    toast.success('Link do vídeo salvo!');
    setVideoLinkDialogOpen(false);

    // If user was trying to send to review, do it now
    if (sendToReviewAfterLink) {
      const updatedTask = { ...videoLinkTask, edited_video_link: videoLinkValue.trim() };
      // Use shared sync for ALL transitions (edicao→revisao or alteracao→revisao)
      await supabase.from('content_tasks').update({
        kanban_column: 'revisao', updated_at: new Date().toISOString(),
      } as any).eq('id', videoLinkTask.id);
      const client = clients.find(c => c.id === videoLinkTask.client_id);
      const ctx = buildSyncContext(updatedTask as any, {
        userId: user?.id,
        clientName: client?.companyName,
        clientWhatsapp: (client as any)?.whatsapp,
      });
      await syncContentTaskColumnChange('revisao', ctx);
      toast.success('Enviado para revisão!');
    }

    setVideoLinkTask(null);
    setVideoLinkValue('');
    setSendToReviewAfterLink(false);
    fetchTasks();
  };

  const openScript = async (scriptId: string) => {
    const script = scripts.find(s => s.id === scriptId);
    if (script) { setViewingScript(script); setScriptDialogOpen(true); return; }
    // Fallback: fetch directly from DB (script may have been marked as recorded)
    try {
      const { data, error } = await supabase.from('scripts').select('*').eq('id', scriptId).single();
      if (error || !data) {
        toast.error('Roteiro não encontrado. Pode ter sido removido.');
        return;
      }
      setViewingScript({ id: data.id, title: data.title, content: data.content, videoType: data.video_type, contentFormat: data.content_format });
      setScriptDialogOpen(true);
    } catch {
      toast.error('Erro ao carregar roteiro.');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Scissors size={20} className="text-primary" /> Kanban de Edição
          </h1>
          <p className="text-sm text-muted-foreground">Gerencie o fluxo de edição dos vídeos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 w-40 text-sm" />
          </div>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Clientes</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 h-full min-w-max pb-2">
          {EDITOR_COLUMNS.map(col => {
            const colTasks = sortedTasksByColumn[col.id] || [];
            const isDragOver = dragOverColumn === col.id;
            return (
              <div key={col.id}
                className={`flex flex-col w-[300px] shrink-0 rounded-xl transition-colors ${isDragOver ? 'ring-2 ring-primary/40 bg-accent/30' : 'bg-muted/20'}`}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverColumn(col.id); }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={e => handleDrop(e, col.id)}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl" style={{ backgroundColor: col.bg }}>
                  <span className="text-sm">{col.icon}</span>
                  <span className="text-sm font-bold text-white flex-1 truncate">{col.label}</span>
                  <span className="text-xs font-bold text-white/90 bg-white/20 rounded-full px-2 py-0.5 min-w-[24px] text-center">{colTasks.length}</span>
                </div>
                <ScrollArea className="flex-1 px-1.5 py-1.5">
                  <div className="space-y-2">
                    {colTasks.map(task => (
                      <TaskCard key={task.id} task={task} clients={clients} onOpenScript={openScript}
                        onSendToReview={handleSendToReview} onAddVideoLink={openVideoLinkDialog}
                        onClaimTask={handleClaimTask} currentUserId={user?.id} users={users}
                        draggedId={draggedTask?.id || null} onDragStart={handleDragStart} />
                    ))}
                    {colTasks.length === 0 && (
                      <div className="text-center py-10 text-xs text-muted-foreground italic">
                        {col.id === 'edicao' ? 'Nenhum vídeo para editar' :
                         col.id === 'revisao' ? 'Nenhum vídeo em revisão' :
                         col.id === 'alteracao' ? 'Nenhuma alteração pendente' : 'Nenhum vídeo concluído'}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>

      {/* Script viewer dialog */}
      <Dialog open={scriptDialogOpen} onOpenChange={setScriptDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye size={18} /> {viewingScript?.title || 'Roteiro'}</DialogTitle>
          </DialogHeader>
          {viewingScript && (
            <div className="prose prose-sm max-w-none p-4 rounded-xl bg-muted/30 border border-border min-h-[200px]"
              dangerouslySetInnerHTML={{ __html: highlightQuotes(viewingScript.content) || '<em>Sem conteúdo</em>' }} />
          )}
        </DialogContent>
      </Dialog>

      {/* Video link dialog */}
      <Dialog open={videoLinkDialogOpen} onOpenChange={setVideoLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 size={18} className="text-primary" /> Link do Vídeo Editado
            </DialogTitle>
          </DialogHeader>
          {videoLinkTask && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="font-medium text-sm">{videoLinkTask.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {clients.find(c => c.id === videoLinkTask.client_id)?.companyName}
                </p>
              </div>
              <div>
                <Label>Cole o link do vídeo editado *</Label>
                <Input
                  placeholder="https://drive.google.com/... ou outro link"
                  value={videoLinkValue}
                  onChange={e => setVideoLinkValue(e.target.value)}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Este link será usado pela equipe de social media para revisar e enviar ao cliente
                </p>
              </div>
              {sendToReviewAfterLink && (
                <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
                  <p className="text-xs text-primary font-medium">
                    ✨ Após salvar, o vídeo será enviado automaticamente para revisão
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVideoLinkDialogOpen(false); setSendToReviewAfterLink(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveVideoLink} className="gap-1.5" disabled={!videoLinkValue.trim()}>
              <Check size={14} /> {sendToReviewAfterLink ? 'Salvar e Enviar para Revisão' : 'Salvar Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, GripVertical, Film, Megaphone, Image, Palette, Calendar, User, Trash2, Edit, X, Search, Filter, FileText, CheckCircle2, AlertTriangle, Clock, ExternalLink, ThumbsUp, MessageSquareWarning } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import ClientLogo from '@/components/ClientLogo';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Client, Recording, Script } from '@/types';
import { getWhatsAppConfig, sendWhatsAppMessage } from '@/services/whatsappService';

// ─── COLUMN DEFINITIONS ───────────────────────────────────────
const KANBAN_COLUMNS = [
  { id: 'ideias', label: 'Zona de Ideias', icon: '💡', gradient: 'from-violet-500 to-purple-600' },
  { id: 'captacao', label: 'Captação', icon: '📹', gradient: 'from-orange-400 to-orange-600' },
  { id: 'edicao', label: 'Edição de Vídeo', icon: '🎬', gradient: 'from-blue-400 to-blue-600' },
  { id: 'revisao', label: 'Revisão', icon: '👁', gradient: 'from-teal-400 to-emerald-600' },
  { id: 'alteracao', label: 'Alteração', icon: '✏️', gradient: 'from-amber-400 to-yellow-500' },
  { id: 'envio', label: 'Enviar para Cliente', icon: '📤', gradient: 'from-emerald-400 to-green-600' },
  { id: 'agendamentos', label: 'Agendamentos', icon: '📅', gradient: 'from-rose-400 to-red-500' },
  { id: 'acompanhamento', label: 'Acompanhamento', icon: '👀', gradient: 'from-rose-500 to-red-600' },
] as const;

type KanbanColumnId = typeof KANBAN_COLUMNS[number]['id'];

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'text-blue-700 bg-blue-50 border border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
  { value: 'criativo', label: 'Criativos', icon: Megaphone, color: 'text-purple-700 bg-purple-50 border border-purple-200/60 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800' },
  { value: 'story', label: 'Story', icon: Image, color: 'text-pink-700 bg-pink-50 border border-pink-200/60 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800' },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'text-amber-700 bg-amber-50 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
];

interface ContentTask {
  id: string;
  client_id: string;
  title: string;
  content_type: string;
  kanban_column: string;
  description: string | null;
  recording_id: string | null;
  script_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  scheduled_recording_date: string | null;
  scheduled_recording_time: string | null;
  drive_link: string | null;
  edited_video_link: string | null;
  adjustment_notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export default function ContentKanban() {
  const { clients, recordings, scripts, users } = useApp();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<ContentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ContentTask | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Drag state
  const [draggedTask, setDraggedTask] = useState<ContentTask | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Form state
  const [formClientId, setFormClientId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState('reels');
  const [formDescription, setFormDescription] = useState('');
  const [formColumn, setFormColumn] = useState<KanbanColumnId>('ideias');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [formRecordingId, setFormRecordingId] = useState('');
  const [formScriptId, setFormScriptId] = useState('');
  const [formSchedDate, setFormSchedDate] = useState('');
  const [formSchedTime, setFormSchedTime] = useState('');

  // ─── FETCH ─────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('content_tasks')
      .select('*')
      .order('position', { ascending: true });
    if (data) setTasks(data as ContentTask[]);
    if (error) console.error('Error fetching content_tasks:', error);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('content_tasks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_tasks' }, () => {
        fetchTasks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  // ─── HELPERS ───────────────────────────────────────────────
  const getClient = (id: string) => clients.find(c => c.id === id);
  const getTypeConfig = (type: string) => CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
  const getUser = (id: string | null) => id ? users.find(u => u.id === id) : null;

  const clientRecordings = useMemo(() => {
    if (!formClientId) return [];
    return recordings.filter(r => r.clientId === formClientId && r.status === 'agendada');
  }, [formClientId, recordings]);

  const clientScripts = useMemo(() => {
    if (!formClientId) return [];
    return scripts.filter(s => s.clientId === formClientId && !s.recorded);
  }, [formClientId, scripts]);

  // ─── FILTERED TASKS ────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Hide archived cards
      if (t.kanban_column === 'arquivado') return false;
      if (filterClient !== 'all' && t.client_id !== filterClient) return false;
      if (filterType !== 'all' && t.content_type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const client = getClient(t.client_id);
        if (!t.title.toLowerCase().includes(q) && !client?.companyName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filterClient, filterType, searchQuery, clients]);

  const tasksByColumn = useMemo(() => {
    const map: Record<string, ContentTask[]> = {};
    KANBAN_COLUMNS.forEach(col => { map[col.id] = []; });
    filteredTasks.forEach(t => {
      if (map[t.kanban_column]) map[t.kanban_column].push(t);
      else map['ideias'].push(t);
    });
    return map;
  }, [filteredTasks]);

  // ─── CRUD ──────────────────────────────────────────────────
  const resetForm = () => {
    setFormClientId(''); setFormTitle(''); setFormType('reels');
    setFormDescription(''); setFormColumn('ideias'); setFormAssignedTo('');
    setFormRecordingId(''); setFormScriptId('');
    setFormSchedDate(''); setFormSchedTime('');
    setEditingTask(null);
  };

  const openNew = (column?: KanbanColumnId) => {
    resetForm();
    if (column) setFormColumn(column);
    setDialogOpen(true);
  };

  const openEdit = (task: ContentTask) => {
    setEditingTask(task);
    setFormClientId(task.client_id);
    setFormTitle(task.title);
    setFormType(task.content_type);
    setFormDescription(task.description || '');
    setFormColumn(task.kanban_column as KanbanColumnId);
    setFormAssignedTo(task.assigned_to || '');
    setFormRecordingId(task.recording_id || '');
    setFormScriptId(task.script_id || '');
    setFormSchedDate(task.scheduled_recording_date || '');
    setFormSchedTime(task.scheduled_recording_time || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formClientId || !formTitle) {
      toast.error('Preencha cliente e título');
      return;
    }
    const payload: any = {
      client_id: formClientId,
      title: formTitle,
      content_type: formType,
      kanban_column: formColumn,
      description: formDescription || null,
      assigned_to: (formAssignedTo && formAssignedTo !== 'none') ? formAssignedTo : null,
      recording_id: (formRecordingId && formRecordingId !== 'none') ? formRecordingId : null,
      script_id: (formScriptId && formScriptId !== 'none') ? formScriptId : null,
      scheduled_recording_date: formSchedDate || null,
      scheduled_recording_time: formSchedTime || null,
      updated_at: new Date().toISOString(),
    };

    if (editingTask) {
      // Auto-move to acompanhamento if in agendamentos and date+time are set
      if (payload.kanban_column === 'agendamentos' && payload.scheduled_recording_date && payload.scheduled_recording_time) {
        payload.kanban_column = 'acompanhamento';
      }
      const { error } = await supabase.from('content_tasks').update(payload).eq('id', editingTask.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success(payload.kanban_column === 'acompanhamento' && editingTask.kanban_column === 'agendamentos'
        ? 'Agendado! Movido para Acompanhamento'
        : 'Cartão atualizado');

      // Sync: if moved to captacao and has recording, mark recording accordingly
      if (payload.kanban_column === 'captacao' && formRecordingId) {
        // Link exists, no extra action needed
      }
      // If moved to edicao and has script, mark script as recorded
      if (payload.kanban_column === 'edicao' && formScriptId) {
        await supabase.from('scripts').update({ recorded: true } as any).eq('id', formScriptId);
      }
    } else {
      payload.created_by = user?.id || null;
      payload.position = tasksByColumn[formColumn]?.length || 0;
      const { error } = await supabase.from('content_tasks').insert(payload);
      if (error) { toast.error('Erro ao criar cartão'); return; }
      toast.success('Cartão criado');
    }
    setDialogOpen(false);
    resetForm();
    fetchTasks();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('content_tasks').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Cartão excluído');
    fetchTasks();
  };

  // ─── DRAG & DROP ───────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, task: ContentTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask || draggedTask.kanban_column === targetColumn) {
      setDraggedTask(null);
      return;
    }

    // ─── VALIDATION RULES ─────────────────────────────────
    const validationError = validateKanbanTransition(draggedTask, targetColumn);
    if (validationError) {
      toast.error(validationError);
      setDraggedTask(null);
      return;
    }

    const oldColumn = draggedTask.kanban_column;
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === draggedTask.id ? { ...t, kanban_column: targetColumn } : t
    ));

    const { error } = await supabase.from('content_tasks').update({
      kanban_column: targetColumn,
      updated_at: new Date().toISOString(),
    } as any).eq('id', draggedTask.id);

    if (error) {
      toast.error('Erro ao mover cartão');
      setTasks(prev => prev.map(t =>
        t.id === draggedTask.id ? { ...t, kanban_column: oldColumn } : t
      ));
    } else {
      // Sync with other modules
      await syncOnColumnChange(draggedTask, targetColumn);
      toast.success(`Movido para ${KANBAN_COLUMNS.find(c => c.id === targetColumn)?.label}`);
    }
    setDraggedTask(null);
  };

  // ─── VALIDATION FOR TRANSITIONS ───────────────────────────
  const validateKanbanTransition = (task: ContentTask, targetColumn: string): string | null => {
    // captacao → edicao: needs drive_link (materiais brutos)
    if (targetColumn === 'edicao' && task.kanban_column === 'captacao' && !task.drive_link) {
      return 'O card precisa ter o link dos materiais brutos (Drive) para ir para edição';
    }
    // edicao → revisao: needs edited_video_link
    if (targetColumn === 'revisao' && !task.edited_video_link) {
      return 'O editor precisa adicionar o link do vídeo editado antes de enviar para revisão';
    }
    // revisao → envio: should go through social media flow
    // envio → agendamentos: needs approval (approved_at)
    return null;
  };

  // ─── SYNC WITH OTHER MODULES ──────────────────────────────
  const syncOnColumnChange = async (task: ContentTask, newColumn: string) => {
    if (newColumn === 'edicao' && task.script_id) {
      await supabase.from('scripts').update({ recorded: true } as any).eq('id', task.script_id);
    }
    if (newColumn === 'revisao') {
      const existing = await supabase.from('social_media_deliveries')
        .select('id').eq('content_task_id', task.id).limit(1);
      if (!existing.data?.length) {
        await supabase.from('social_media_deliveries').insert({
          client_id: task.client_id, content_type: task.content_type,
          title: task.title, description: task.description || null,
          status: 'revisao', delivered_at: format(new Date(), 'yyyy-MM-dd'),
          recording_id: task.recording_id || null, script_id: task.script_id || null,
          created_by: user?.id || null, content_task_id: task.id,
        } as any);
      } else {
        await supabase.from('social_media_deliveries').update({ status: 'revisao' } as any).eq('content_task_id', task.id);
      }
      const client = clients.find(c => c.id === task.client_id);
      await supabase.rpc('notify_role', {
        _role: 'social_media',
        _title: 'Vídeo para Revisão',
        _message: `${task.title} (${client?.companyName || ''}) está pronto para revisão`,
        _type: 'review',
        _link: '/entregas-social',
      });
    }
    if (newColumn === 'envio') {
      const existing = await supabase.from('social_media_deliveries')
        .select('id').eq('content_task_id', task.id).limit(1);
      if (!existing.data?.length) {
        await supabase.from('social_media_deliveries').insert({
          client_id: task.client_id, content_type: task.content_type,
          title: task.title, description: task.description || null,
          status: 'entregue', delivered_at: format(new Date(), 'yyyy-MM-dd'),
          recording_id: task.recording_id || null, script_id: task.script_id || null,
          created_by: user?.id || null, content_task_id: task.id,
        } as any);
      } else {
        await supabase.from('social_media_deliveries').update({ status: 'entregue' } as any).eq('content_task_id', task.id);
      }

      // Mark approval sent
      await supabase.from('content_tasks').update({
        approval_sent_at: new Date().toISOString(),
      } as any).eq('id', task.id);

      // Auto-send WhatsApp approval message
      try {
        const whatsConfig = await getWhatsAppConfig();
        if (whatsConfig?.integrationActive && whatsConfig?.autoVideoApproval) {
          const client = clients.find(c => c.id === task.client_id);
          if (client?.whatsapp) {
            let msg = whatsConfig.msgVideoApproval
              .replace('{nome_cliente}', client.companyName)
              .replace('{link_video}', task.edited_video_link || 'Link não disponível')
              .replace('{titulo}', task.title);
            
            const result = await sendWhatsAppMessage({
              number: client.whatsapp,
              message: msg,
              clientId: client.id,
              triggerType: 'auto_confirmation',
            });

            if (result.success) {
              toast.success('📱 Link de aprovação enviado por WhatsApp!');
            } else {
              console.error('WhatsApp send error:', result.error);
              toast.warning('Card enviado, mas não foi possível enviar WhatsApp');
            }
          } else {
            toast.warning('Cliente sem WhatsApp cadastrado');
          }
        }
      } catch (err) {
        console.error('WhatsApp auto-send error:', err);
      }
    }
  };

  // ─── APPROVE FROM REVISÃO ─────────────────────────────────
  const handleApproveTask = async (task: ContentTask) => {
    const { error } = await supabase.from('content_tasks').update({
      kanban_column: 'envio',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    if (error) { toast.error('Erro ao aprovar'); return; }
    await syncOnColumnChange(task, 'envio');
    toast.success('✅ Conteúdo aprovado! Movido para Enviar ao Cliente');
    fetchTasks();
  };

  // ─── REQUEST ADJUSTMENTS ──────────────────────────────────
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [adjustmentTask, setAdjustmentTask] = useState<ContentTask | null>(null);

  const openAdjustmentDialog = (task: ContentTask) => {
    setAdjustmentTask(task);
    setAdjustmentNotes('');
    setAdjustmentDialogOpen(true);
  };

  const handleRequestAdjustments = async () => {
    if (!adjustmentTask || !adjustmentNotes.trim()) {
      toast.error('Descreva os ajustes necessários');
      return;
    }
    const { error } = await supabase.from('content_tasks').update({
      kanban_column: 'alteracao',
      adjustment_notes: adjustmentNotes.trim(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', adjustmentTask.id);
    if (error) { toast.error('Erro ao solicitar ajustes'); return; }

    // Update social delivery status
    await supabase.from('social_media_deliveries').update({
      status: 'ajuste',
    } as any).eq('content_task_id', adjustmentTask.id);

    // Notify editor
    if (adjustmentTask.assigned_to) {
      await supabase.rpc('notify_user', {
        _user_id: adjustmentTask.assigned_to,
        _title: 'Ajuste solicitado',
        _message: `"${adjustmentTask.title}" precisa de ajustes: ${adjustmentNotes.trim()}`,
        _type: 'adjustment',
        _link: '/conteudo',
      });
    }

    toast.success('📝 Ajustes solicitados! Movido para Alteração');
    setAdjustmentDialogOpen(false);
    setAdjustmentTask(null);
    fetchTasks();
  };

  // ─── CONFIRM POSTED (archive card) ────────────────────────
  const handleConfirmPosted = async (task: ContentTask) => {
    const { error } = await supabase.from('content_tasks').update({
      kanban_column: 'arquivado',
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);

    if (error) { toast.error('Erro ao arquivar'); return; }

    await supabase.from('social_media_deliveries').update({
      status: 'postado',
      posted_at: format(new Date(), 'yyyy-MM-dd'),
    } as any).eq('content_task_id', task.id);

    toast.success(`✅ ${task.title} confirmado como postado e arquivado!`);
    fetchTasks();
  };

  // ─── RENDER ────────────────────────────────────────────────
  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Criação de Conteúdo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{tasks.length} cartões no pipeline</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-9 w-44 text-sm rounded-xl bg-secondary/50 border-border/50 focus:bg-card"
            />
          </div>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="h-9 w-40 text-sm rounded-xl bg-secondary/50 border-border/50">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Clientes</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 w-36 text-sm rounded-xl bg-secondary/50 border-border/50">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              {CONTENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => openNew()} className="gap-1.5 rounded-xl h-9 px-4 font-semibold shadow-sm">
            <Plus size={14} /> Novo Conteúdo
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 h-full min-w-max pb-2">
          {KANBAN_COLUMNS.map(col => {
            const colTasks = tasksByColumn[col.id] || [];
            const isDragOver = dragOverColumn === col.id;

            return (
              <div
                key={col.id}
                className={`flex flex-col w-[270px] shrink-0 rounded-2xl transition-all duration-200 ${
                  isDragOver ? 'ring-2 ring-primary/40 bg-accent/20 scale-[1.01]' : 'bg-muted/10'
                }`}
                onDragOver={e => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.id)}
              >
                {/* Column header - gradient bar */}
                <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-t-2xl bg-gradient-to-r ${col.gradient}`}>
                  <span className="text-base leading-none">{col.icon}</span>
                  <span className="text-[13px] font-bold text-white flex-1 truncate font-[var(--font-display)]" style={{ fontFamily: 'var(--font-display)' }}>{col.label}</span>
                  <span className="text-[11px] font-bold text-white/90 bg-white/25 backdrop-blur-sm rounded-full px-2.5 py-0.5 min-w-[26px] text-center shadow-sm">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <ScrollArea className="flex-1 px-2 py-2">
                  <div className="space-y-2.5">
                    {colTasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        client={getClient(task.client_id)}
                        assignedUser={getUser(task.assigned_to)}
                        linkedScript={task.script_id ? scripts.find(s => s.id === task.script_id) : undefined}
                        isDragging={draggedTask?.id === task.id}
                        onDragStart={e => handleDragStart(e, task)}
                        onEdit={() => openEdit(task)}
                        onDelete={() => handleDelete(task.id)}
                        onConfirmPosted={task.kanban_column === 'acompanhamento' ? () => handleConfirmPosted(task) : undefined}
                        onApprove={task.kanban_column === 'revisao' ? () => handleApproveTask(task) : undefined}
                        onRequestAdjustments={task.kanban_column === 'revisao' ? () => openAdjustmentDialog(task) : undefined}
                      />
                    ))}
                    {colTasks.length === 0 && (
                      <div className="text-center py-12 text-xs text-muted-foreground/50 italic">
                        {col.id === 'alteracao' ? 'Etapa para a alteração do conteúdo' :
                         col.id === 'revisao' ? 'Etapa para a revisão do conteúdo criado' :
                         'Arraste cartões para cá'}
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Add button at bottom */}
                <button
                  onClick={() => openNew(col.id)}
                  className="mx-2 mb-2 py-2 rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground/70 hover:text-foreground hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 flex items-center justify-center gap-1.5 font-medium"
                >
                  <Plus size={12} /> Adicionar
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Editar Cartão' : 'Novo Conteúdo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cliente *</Label>
                <Select value={formClientId} onValueChange={v => { setFormClientId(v); setFormRecordingId(''); setFormScriptId(''); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Título do Conteúdo *</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Ex: Reels de vendas" className="h-9" />
            </div>

            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} placeholder="Detalhes do conteúdo..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Coluna</Label>
                <Select value={formColumn} onValueChange={v => setFormColumn(v as KanbanColumnId)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KANBAN_COLUMNS.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Responsável</Label>
                <Select value={formAssignedTo} onValueChange={setFormAssignedTo}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Connections */}
            {formClientId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Gravação vinculada</Label>
                  <Select value={formRecordingId} onValueChange={setFormRecordingId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {clientRecordings.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {format(new Date(r.date + 'T12:00:00'), 'dd/MM', { locale: ptBR })} {r.startTime}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Roteiro vinculado</Label>
                  <Select value={formScriptId} onValueChange={setFormScriptId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {clientScripts.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data de gravação</Label>
                <Input type="date" value={formSchedDate} onChange={e => setFormSchedDate(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Horário</Label>
                <Input type="time" value={formSchedTime} onChange={e => setFormSchedTime(e.target.value)} className="h-9" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave}>{editingTask ? 'Salvar' : 'Criar Cartão'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment Notes Dialog */}
      <Dialog open={adjustmentDialogOpen} onOpenChange={v => { if (!v) { setAdjustmentDialogOpen(false); setAdjustmentTask(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareWarning size={18} className="text-amber-500" />
              Solicitar Ajustes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {adjustmentTask && (
              <p className="text-sm text-muted-foreground">
                Conteúdo: <span className="font-medium text-foreground">{adjustmentTask.title}</span>
              </p>
            )}
            <div>
              <Label className="text-xs">Descreva os ajustes necessários *</Label>
              <Textarea
                value={adjustmentNotes}
                onChange={e => setAdjustmentNotes(e.target.value)}
                rows={4}
                placeholder="Ex: Ajustar corte no segundo 15, trocar música de fundo..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAdjustmentDialogOpen(false); setAdjustmentTask(null); }}>Cancelar</Button>
            <Button onClick={handleRequestAdjustments} className="bg-amber-500 hover:bg-amber-600 text-white">
              <MessageSquareWarning size={14} /> Enviar Ajustes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── TASK CARD COMPONENT ─────────────────────────────────────
interface TaskCardProps {
  task: ContentTask;
  client?: Client;
  assignedUser?: { id?: string; name: string; avatarUrl?: string } | null;
  linkedScript?: Script;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmPosted?: () => void;
  onApprove?: () => void;
  onRequestAdjustments?: () => void;
}

function TaskCard({ task, client, assignedUser, linkedScript, isDragging, onDragStart, onEdit, onDelete, onConfirmPosted, onApprove, onRequestAdjustments }: TaskCardProps) {
  const [scriptPreviewOpen, setScriptPreviewOpen] = useState(false);
  const typeConfig = CONTENT_TYPES.find(t => t.value === task.content_type) || CONTENT_TYPES[0];
  const TypeIcon = typeConfig.icon;
  const clientColor = client?.color || '217 91% 60%';

  const isCaptacao = task.kanban_column === 'captacao';
  const isRevisao = task.kanban_column === 'revisao' || task.kanban_column === 'alteracao';
  const isAcompanhamento = task.kanban_column === 'acompanhamento';
  const isOverdue = isAcompanhamento && task.scheduled_recording_date && 
    new Date(task.scheduled_recording_date + 'T23:59:59') < new Date();

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        className={`group relative bg-card rounded-xl cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden ${
          isDragging ? 'opacity-40 scale-95 shadow-none' : 'shadow-sm'
        } ${isOverdue ? 'ring-1 ring-destructive/40' : ''} ${
          isCaptacao ? 'ring-1 ring-orange-400/30' : ''
        }`}
        style={{ borderLeft: `3px solid ${isOverdue ? 'hsl(var(--destructive))' : `hsl(${clientColor})`}` }}
      >
        {/* Recording indicator */}
        {isCaptacao && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-900/10 border-b border-orange-200/40">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>Gravando</span>
          </div>
        )}

        {/* Overdue alert banner */}
        {isOverdue && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-900/10 border-b border-destructive/20">
            <AlertTriangle size={11} className="text-destructive shrink-0" />
            <span className="text-[10px] font-semibold text-destructive uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>Verificar Postagem</span>
          </div>
        )}

        {/* Actions on hover */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
          <button onClick={e => { e.stopPropagation(); onEdit(); }} className="w-6 h-6 rounded-lg flex items-center justify-center bg-card/90 backdrop-blur text-muted-foreground hover:text-foreground hover:bg-accent border border-border/60 shadow-sm transition-colors">
            <Edit size={11} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="w-6 h-6 rounded-lg flex items-center justify-center bg-card/90 backdrop-blur text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border/60 shadow-sm transition-colors">
            <Trash2 size={11} />
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Tags row */}
          <div className="flex flex-wrap gap-1.5">
            {/* Content type badge */}
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${typeConfig.color}`}>
              <TypeIcon size={10} /> {typeConfig.label}
            </span>
            {/* Altered tag */}
            {task.adjustment_notes && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                🔄 Alterado
              </span>
            )}
            {/* Status tags */}
            {task.kanban_column === 'envio' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                ✨ Novo
              </span>
            )}
            {task.kanban_column === 'agendamentos' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800">
                📅 Agendar
              </span>
            )}
            {isAcompanhamento && !isOverdue && task.scheduled_recording_date && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200/60 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800">
                📅 Agendado
              </span>
            )}
          </div>

          {/* Client name */}
          <div className="flex items-center justify-between gap-2 pr-8">
            <h3 className="text-[13px] font-bold text-foreground leading-snug tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {client?.companyName || 'Cliente'}
            </h3>
          </div>

          {/* Title */}
          <p className="text-[12px] text-foreground/70 leading-relaxed line-clamp-2">{task.title}</p>

          {/* Responsible - real-time mini banner */}
          {assignedUser && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/15 dark:from-primary/10 dark:to-primary/15 dark:border-primary/20">
              <div className="relative shrink-0">
                <UserAvatar user={{ name: assignedUser.name, avatarUrl: assignedUser.avatarUrl }} size="sm" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 border border-card"></span>
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-primary/60 block leading-none mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>Executando</span>
                <span className="text-[11px] font-bold text-foreground truncate block">{assignedUser.name}</span>
              </div>
              <User size={11} className="text-primary/40 shrink-0" />
            </div>
          )}

          {/* Scheduled date (acompanhamento - prominent) */}
          {isAcompanhamento && task.scheduled_recording_date && (
            <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg ${
              isOverdue 
                ? 'bg-destructive/5 border border-destructive/20' 
                : 'bg-secondary/50 border border-border/40'
            }`}>
              <Calendar size={13} className={isOverdue ? 'text-destructive' : 'text-muted-foreground'} />
              <div>
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70 block leading-none mb-0.5">Agendado para</span>
                <span className={`text-[12px] font-bold ${isOverdue ? 'text-destructive' : 'text-foreground'}`} style={{ fontFamily: 'var(--font-display)' }}>
                  {format(new Date(task.scheduled_recording_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                  {task.scheduled_recording_time ? ` às ${task.scheduled_recording_time}` : ''}
                </span>
              </div>
            </div>
          )}

          {/* Recording date (other columns) */}
          {!isAcompanhamento && task.scheduled_recording_date && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Calendar size={11} className="shrink-0" />
              <span>
                {format(new Date(task.scheduled_recording_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                {task.scheduled_recording_time ? ` ${task.scheduled_recording_time}` : ''}
              </span>
            </div>
          )}

          {/* Script link */}
          {linkedScript && (
            <button
              onClick={e => { e.stopPropagation(); setScriptPreviewOpen(true); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/15 transition-colors w-full text-left"
            >
              <FileText size={11} className="text-primary shrink-0" />
              <span className="text-[10px] font-medium text-primary truncate">
                Roteiro: {linkedScript.title}
              </span>
            </button>
          )}

          {/* Watch video button (revisão/alteração) */}
          {isRevisao && task.edited_video_link && (
            <a
              href={task.edited_video_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 transition-colors w-full text-left group/video"
            >
              <Film size={11} className="text-teal-600 shrink-0" />
              <span className="text-[10px] font-medium text-teal-700 truncate flex-1">Assistir Vídeo</span>
              <ExternalLink size={10} className="text-teal-500/60 group-hover/video:text-teal-600 transition-colors shrink-0" />
            </a>
          )}

          {/* Approve / Request adjustments (revisão only) */}
          {task.kanban_column === 'revisao' && (onApprove || onRequestAdjustments) && (
            <div className="grid grid-cols-2 gap-1.5">
              {onApprove && (
                <button
                  onClick={e => { e.stopPropagation(); onApprove(); }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-success/10 hover:bg-success/20 border border-success/20 text-success transition-colors text-[10px] font-semibold"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  <ThumbsUp size={11} /> Aprovar
                </button>
              )}
              {onRequestAdjustments && (
                <button
                  onClick={e => { e.stopPropagation(); onRequestAdjustments(); }}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-600 transition-colors text-[10px] font-semibold"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  <MessageSquareWarning size={11} /> Ajustes
                </button>
              )}
            </div>
          )}
          {isOverdue && onConfirmPosted && (
            <button
              onClick={e => { e.stopPropagation(); onConfirmPosted(); }}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 text-xs font-bold shadow-sm hover:shadow"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              <CheckCircle2 size={13} />
              Confirmar Postagem
            </button>
          )}
        </div>
      </div>

      {/* Script Preview Dialog */}
      {linkedScript && (
        <Dialog open={scriptPreviewOpen} onOpenChange={setScriptPreviewOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                {linkedScript.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">{typeConfig.label}</Badge>
                <Badge variant={linkedScript.recorded ? 'default' : 'secondary'} className="text-xs">
                  {linkedScript.recorded ? '✅ Gravado' : '⏳ Pendente'}
                </Badge>
                {linkedScript.priority !== 'normal' && (
                  <Badge variant="destructive" className="text-xs">
                    {linkedScript.priority === 'priority' ? '🔴 Alta' : linkedScript.priority === 'urgent' ? '🚨 Urgente' : linkedScript.priority}
                  </Badge>
                )}
              </div>
              <div className="border rounded-lg p-4 bg-muted/30">
                {linkedScript.content ? (
                  <div
                    className="prose prose-sm max-w-none text-foreground text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: linkedScript.content }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sem conteúdo no roteiro.</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
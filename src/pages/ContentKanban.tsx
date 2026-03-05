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
import { Plus, GripVertical, Film, Megaphone, Image, Palette, Calendar, User, Trash2, Edit, X, Search, Filter, FileText } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Client, Recording, Script } from '@/types';

// ─── COLUMN DEFINITIONS ───────────────────────────────────────
const KANBAN_COLUMNS = [
  { id: 'ideias', label: 'Zona de Ideias', bg: '#9b59b6', icon: '💡' },
  { id: 'captacao', label: 'Captação', bg: '#e67e22', icon: '📹' },
  { id: 'edicao', label: 'Edição de Vídeo', bg: '#3498db', icon: '🎬' },
  { id: 'revisao', label: 'Revisão', bg: '#1abc9c', icon: '👁' },
  { id: 'alteracao', label: 'Alteração', bg: '#f1c40f', icon: '✏️' },
  { id: 'envio', label: 'Enviar para Cliente', bg: '#2ecc71', icon: '📤' },
  { id: 'agendamentos', label: 'Agendamentos', bg: '#e74c3c', icon: '📅' },
  { id: 'acompanhamento', label: 'Acompanhamento', bg: '#e74c3c', icon: '👀' },
] as const;

type KanbanColumnId = typeof KANBAN_COLUMNS[number]['id'];

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'criativo', label: 'Criativos', icon: Megaphone, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'story', label: 'Story', icon: Image, color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400' },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400' },
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
      const { error } = await supabase.from('content_tasks').update(payload).eq('id', editingTask.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Cartão atualizado');

      // Sync: if moved to captacao and has recording, mark recording accordingly
      if (formColumn === 'captacao' && formRecordingId) {
        // Link exists, no extra action needed
      }
      // If moved to edicao and has script, mark script as recorded
      if (formColumn === 'edicao' && formScriptId) {
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

  // ─── SYNC WITH OTHER MODULES ──────────────────────────────
  const syncOnColumnChange = async (task: ContentTask, newColumn: string) => {
    // When moving to "edicao" (editing), mark linked script as recorded
    if (newColumn === 'edicao' && task.script_id) {
      await supabase.from('scripts').update({ recorded: true } as any).eq('id', task.script_id);
    }
    // When moving to "envio" (send to client), create a social_media_delivery
    if (newColumn === 'envio') {
      const existing = await supabase.from('social_media_deliveries')
        .select('id').eq('title', task.title).eq('client_id', task.client_id).limit(1);
      if (!existing.data?.length) {
        await supabase.from('social_media_deliveries').insert({
          client_id: task.client_id,
          content_type: task.content_type,
          title: task.title,
          description: task.description || null,
          status: 'entregue',
          delivered_at: format(new Date(), 'yyyy-MM-dd'),
          recording_id: task.recording_id || null,
          script_id: task.script_id || null,
          created_by: user?.id || null,
        } as any);
      }
    }
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
          <h1 className="text-xl font-bold text-foreground">Criação de Conteúdo</h1>
          <p className="text-sm text-muted-foreground">{tasks.length} cartões no pipeline</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 w-40 text-sm"
            />
          </div>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="h-8 w-36 text-sm">
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
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              {CONTENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => openNew()} className="gap-1.5">
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
                className={`flex flex-col w-[260px] shrink-0 rounded-xl transition-colors ${
                  isDragOver ? 'ring-2 ring-primary/40 bg-accent/30' : 'bg-muted/20'
                }`}
                onDragOver={e => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.id)}
              >
                {/* Column header - colored bar */}
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
                  style={{ backgroundColor: col.bg }}
                >
                  <span className="text-sm">{col.icon}</span>
                  <span className="text-sm font-bold text-white flex-1 truncate">{col.label}</span>
                  <span className="text-xs font-bold text-white/90 bg-white/20 rounded-full px-2 py-0.5 min-w-[24px] text-center">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <ScrollArea className="flex-1 px-1.5 py-1.5">
                  <div className="space-y-2">
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
                      />
                    ))}
                    {colTasks.length === 0 && (
                      <div className="text-center py-10 text-xs text-muted-foreground italic">
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
                  className="mx-1.5 mb-1.5 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 hover:border-primary/30 transition-colors flex items-center justify-center gap-1"
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
    </div>
  );
}

// ─── TASK CARD COMPONENT ─────────────────────────────────────
interface TaskCardProps {
  task: ContentTask;
  client?: Client;
  assignedUser?: { name: string; avatarUrl?: string } | null;
  linkedScript?: Script;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TaskCard({ task, client, assignedUser, linkedScript, isDragging, onDragStart, onEdit, onDelete }: TaskCardProps) {
  const [scriptPreviewOpen, setScriptPreviewOpen] = useState(false);
  const typeConfig = CONTENT_TYPES.find(t => t.value === task.content_type) || CONTENT_TYPES[0];
  const TypeIcon = typeConfig.icon;
  const clientColor = client?.color || '217 91% 60%';

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        className={`group relative bg-card border border-border rounded-lg cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
          isDragging ? 'opacity-40 scale-95' : ''
        }`}
      >
        {/* Actions on hover */}
        <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button onClick={e => { e.stopPropagation(); onEdit(); }} className="w-5 h-5 rounded flex items-center justify-center bg-card text-muted-foreground hover:text-foreground hover:bg-accent border border-border shadow-sm">
            <Edit size={10} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="w-5 h-5 rounded flex items-center justify-center bg-card text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border shadow-sm">
            <Trash2 size={10} />
          </button>
        </div>

        <div className="p-2.5">
          {/* Badge row */}
          {task.kanban_column === 'envio' && (
            <Badge className="mb-2 text-[10px] font-semibold px-2 py-0.5 border-0 bg-emerald-500 text-white">
              Novo {typeConfig.label}
            </Badge>
          )}
          {task.kanban_column === 'agendamentos' && (
            <Badge className="mb-2 text-[10px] font-semibold px-2 py-0.5 border-0 bg-emerald-500 text-white">
              AGENDAR
            </Badge>
          )}
          {task.kanban_column === 'acompanhamento' && task.scheduled_recording_date && (
            <Badge className="mb-2 text-[10px] font-semibold px-2 py-0.5 border-0 bg-teal-500 text-white">
              enviado/aguarda
            </Badge>
          )}

          {/* Client name - bold title */}
          <h3 className="text-sm font-bold text-foreground mb-2 pr-8 leading-tight">
            {client?.companyName || 'Cliente'}
          </h3>

          {/* Labeled fields */}
          <div className="space-y-1.5">
            {/* CLIENTE */}
            <div className="flex items-start gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 shrink-0 mt-0.5">📋 Cliente</span>
            </div>
            <p className="text-[11px] text-foreground/80 pl-4 -mt-1">{client?.companyName}</p>

            {/* TIPO */}
            <div className="flex items-start gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 shrink-0 mt-0.5">
                <TypeIcon size={9} className="inline mr-0.5" />
                Tipo
              </span>
            </div>
            <p className="text-[11px] text-foreground/80 pl-4 -mt-1">{typeConfig.label}</p>

            {/* TÍTULO DO CONTEÚDO */}
            <div className="flex items-start gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 shrink-0 mt-0.5">📝 Título do Conteúdo</span>
            </div>
            <p className="text-[11px] font-semibold text-foreground pl-4 -mt-1 line-clamp-2">{task.title}</p>

            {/* GRAVAÇÃO PROGRAMADA */}
            {task.scheduled_recording_date && (
              <>
                <div className="flex items-start gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 shrink-0 mt-0.5">📅 Gravação Programada</span>
                </div>
                <p className="text-[11px] text-foreground/80 pl-4 -mt-1">
                  {format(new Date(task.scheduled_recording_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                  {task.scheduled_recording_time ? ` ${task.scheduled_recording_time}` : ''}
                </p>
              </>
            )}

            {/* ROTEIRO VINCULADO - clickable indicator */}
            {linkedScript && (
              <button
                onClick={e => { e.stopPropagation(); setScriptPreviewOpen(true); }}
                className="flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors w-full text-left"
              >
                <FileText size={11} className="text-primary shrink-0" />
                <span className="text-[10px] font-semibold text-primary truncate">
                  📄 Roteiro: {linkedScript.title}
                </span>
              </button>
            )}
          </div>

          {/* Avatar */}
          {assignedUser && (
            <div className="mt-2">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-card shadow-sm" title={assignedUser.name}>
                {assignedUser.avatarUrl ? (
                  <img src={assignedUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[9px] font-bold text-muted-foreground">
                    {assignedUser.name.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom color bar */}
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: `hsl(${clientColor})` }}
        />
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

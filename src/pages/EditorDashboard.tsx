import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Film, Megaphone, Image, Palette, ExternalLink, Clock, AlertTriangle,
  Check, Eye, Search, Star, TrendingUp, BarChart3, Timer, Scissors
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { highlightQuotes } from '@/lib/highlightQuotes';
import { format, differenceInHours, isPast, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Constants ──
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
  editing_deadline: string | null;
  editing_started_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

function getDeadlineStatus(deadline: string | null): { label: string; variant: 'destructive' | 'warning' | 'success' | 'default' } {
  if (!deadline) return { label: 'Sem prazo', variant: 'default' };
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const hoursLeft = differenceInHours(deadlineDate, now);
  if (isPast(deadlineDate)) return { label: 'Atrasado', variant: 'destructive' };
  if (hoursLeft <= 12) return { label: 'Vence hoje', variant: 'warning' };
  if (hoursLeft <= 24) return { label: 'Vence amanhã', variant: 'warning' };
  return { label: `${Math.ceil(hoursLeft / 24)}d restantes`, variant: 'success' };
}

function getTypeConfig(type: string) {
  return CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
}

// ── Performance Stats Component ──
function EditorStats({ tasks, clients }: { tasks: EditorTask[]; clients: any[] }) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const completedTasks = tasks.filter(t => t.kanban_column === 'envio');
  const weekCompleted = completedTasks.filter(t => {
    const d = parseISO(t.updated_at);
    return isWithinInterval(d, { start: weekStart, end: weekEnd });
  });
  const monthCompleted = completedTasks.filter(t => {
    const d = parseISO(t.updated_at);
    return isWithinInterval(d, { start: monthStart, end: monthEnd });
  });

  // Points calculation
  const calcPoints = (list: EditorTask[]) =>
    list.reduce((sum, t) => sum + (getTypeConfig(t.content_type).points || 0), 0);

  const weekPoints = calcPoints(weekCompleted);
  const monthPoints = calcPoints(monthCompleted);

  // Average editing time per content type
  const avgTimes = useMemo(() => {
    const byType: Record<string, number[]> = {};
    completedTasks.forEach(t => {
      if (t.editing_started_at && t.updated_at) {
        const startTime = new Date(t.editing_started_at).getTime();
        const endTime = new Date(t.updated_at).getTime();
        const hours = (endTime - startTime) / (1000 * 60 * 60);
        if (hours > 0 && hours < 200) {
          if (!byType[t.content_type]) byType[t.content_type] = [];
          byType[t.content_type].push(hours);
        }
      }
    });
    return Object.entries(byType).map(([type, times]) => ({
      type,
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      count: times.length,
    }));
  }, [completedTasks]);

  const pendingCount = tasks.filter(t => t.kanban_column === 'edicao').length;
  const overdueCount = tasks.filter(t => t.kanban_column === 'edicao' && getDeadlineStatus(t.editing_deadline).variant === 'destructive').length;

  const getClient = (id: string) => clients.find((c: any) => c.id === id);

  const stats = [
    { label: 'Pendentes', value: pendingCount, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Atrasados', value: overdueCount, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Pontos (Semana)', value: weekPoints, icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Pontos (Mês)', value: monthPoints, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ];

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`${s.bg} rounded-xl p-3 border border-border/50`}
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Production breakdown this month */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-primary" /> Produção do Mês
          </h3>
          <div className="space-y-2">
            {CONTENT_TYPES.map(ct => {
              const count = monthCompleted.filter(t => t.content_type === ct.value).length;
              const pts = count * ct.points;
              return (
                <div key={ct.value} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ct.icon size={14} className={ct.color.split(' ')[0]} />
                    <span className="text-sm text-foreground">{ct.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-foreground">{count}</span>
                    <Badge variant="outline" className="text-[10px]">
                      <Star size={9} className="mr-0.5 text-amber-500" /> {pts} pts
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Timer size={14} className="text-primary" /> Tempo Médio de Edição
          </h3>
          {avgTimes.length > 0 ? (
            <div className="space-y-2">
              {avgTimes.map(at => {
                const cfg = getTypeConfig(at.type);
                const hours = Math.floor(at.avg);
                const mins = Math.round((at.avg - hours) * 60);
                return (
                  <div key={at.type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <cfg.icon size={14} className={cfg.color.split(' ')[0]} />
                      <span className="text-sm text-foreground">{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {hours > 0 ? `${hours}h ` : ''}{mins}min
                      </span>
                      <span className="text-[10px] text-muted-foreground">({at.count} edições)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Dados insuficientes para calcular</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Task Card Component ──
function TaskCard({
  task,
  clients,
  scripts,
  onOpenScript,
  draggedId,
  onDragStart,
}: {
  task: EditorTask;
  clients: any[];
  scripts: any[];
  onOpenScript: (id: string) => void;
  draggedId: string | null;
  onDragStart: (e: React.DragEvent, task: EditorTask) => void;
}) {
  const client = clients.find(c => c.id === task.client_id);
  const typeConfig = getTypeConfig(task.content_type);
  const TypeIcon = typeConfig.icon;
  const clientColor = client?.color || '217 91% 60%';
  const deadlineStatus = getDeadlineStatus(task.editing_deadline);

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task)}
      className={`group relative bg-card border border-border rounded-lg cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
        draggedId === task.id ? 'opacity-40 scale-95' : ''
      } ${deadlineStatus.variant === 'destructive' && task.kanban_column === 'edicao' ? 'ring-1 ring-destructive/40' : ''}`}
    >
      <div className="h-1 w-full rounded-t-lg" style={{ backgroundColor: `hsl(${clientColor})` }} />
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ClientLogo client={client as any} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate">{client?.companyName || 'Cliente'}</p>
              <Badge className={`text-[9px] px-1.5 py-0 ${typeConfig.color} border-0`}>
                <TypeIcon size={9} className="mr-0.5" />
                {typeConfig.label}
              </Badge>
            </div>
          </div>
          {task.kanban_column === 'edicao' && (
            <Badge
              variant={deadlineStatus.variant === 'destructive' ? 'destructive' : 'outline'}
              className={`text-[9px] shrink-0 ${
                deadlineStatus.variant === 'warning' ? 'bg-warning/20 text-warning border-warning/30' :
                deadlineStatus.variant === 'success' ? 'bg-success/20 text-success border-success/30' : ''
              }`}
            >
              {deadlineStatus.variant === 'destructive' && <AlertTriangle size={9} className="mr-0.5" />}
              {deadlineStatus.variant === 'warning' && <Clock size={9} className="mr-0.5" />}
              {deadlineStatus.label}
            </Badge>
          )}
          {task.kanban_column === 'envio' && (
            <Badge className="text-[9px] bg-success/20 text-success border-success/30">
              <Check size={9} className="mr-0.5" /> Concluído
            </Badge>
          )}
        </div>

        <p className="text-sm font-semibold text-foreground leading-tight">{task.title}</p>

        {task.script_id && (
          <button onClick={() => onOpenScript(task.script_id!)} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
            <Eye size={11} /> Ver roteiro gravado
          </button>
        )}

        {task.drive_link && (
          <a href={task.drive_link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-900/20 rounded-md px-2 py-1.5">
            <ExternalLink size={12} />
            📁 Abrir materiais no Drive
          </a>
        )}

        {task.editing_deadline && task.kanban_column === 'edicao' && (
          <p className="text-[10px] text-muted-foreground">
            Prazo: {format(new Date(task.editing_deadline), "dd/MM 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Kanban Board Component ──
function EditorKanban({
  tasks,
  clients,
  scripts,
  user,
  onOpenScript,
  onTasksChange,
  searchQuery,
  filterClient,
}: {
  tasks: EditorTask[];
  clients: any[];
  scripts: any[];
  user: any;
  onOpenScript: (id: string) => void;
  onTasksChange: () => void;
  searchQuery: string;
  filterClient: string;
}) {
  const [draggedTask, setDraggedTask] = useState<EditorTask | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterClient !== 'all' && t.client_id !== filterClient) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const client = clients.find((c: any) => c.id === t.client_id);
        if (!t.title.toLowerCase().includes(q) && !client?.companyName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filterClient, searchQuery, clients]);

  const sortedTasksByColumn = useMemo(() => {
    const map: Record<string, EditorTask[]> = {};
    EDITOR_COLUMNS.forEach(col => { map[col.id] = []; });
    filteredTasks.forEach(t => { if (map[t.kanban_column]) map[t.kanban_column].push(t); });
    // Sort edicao by deadline urgency
    map['edicao'] = [...(map['edicao'] || [])].sort((a, b) => {
      if (!a.editing_deadline && !b.editing_deadline) return 0;
      if (!a.editing_deadline) return 1;
      if (!b.editing_deadline) return -1;
      return new Date(a.editing_deadline).getTime() - new Date(b.editing_deadline).getTime();
    });
    return map;
  }, [filteredTasks]);

  const handleDragStart = (e: React.DragEvent, task: EditorTask) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDrop = async (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    if (!draggedTask || draggedTask.kanban_column === targetColumn) { setDraggedTask(null); return; }

    const updateData: any = { kanban_column: targetColumn, updated_at: new Date().toISOString() };
    // Track when editing starts
    if (targetColumn === 'edicao' && !draggedTask.editing_started_at) {
      updateData.editing_started_at = new Date().toISOString();
    }

    const { error } = await supabase.from('content_tasks').update(updateData).eq('id', draggedTask.id);

    if (error) {
      toast.error('Erro ao mover cartão');
    } else {
      if (targetColumn === 'envio') {
        const existing = await supabase.from('social_media_deliveries')
          .select('id').eq('title', draggedTask.title).eq('client_id', draggedTask.client_id).limit(1);
        if (!existing.data?.length) {
          await supabase.from('social_media_deliveries').insert({
            client_id: draggedTask.client_id,
            content_type: draggedTask.content_type,
            title: draggedTask.title,
            description: draggedTask.description || null,
            status: 'entregue',
            delivered_at: format(new Date(), 'yyyy-MM-dd'),
            script_id: draggedTask.script_id || null,
            recording_id: draggedTask.recording_id || null,
            created_by: user?.id || null,
          } as any);
        }
      }
      toast.success(`Movido para ${EDITOR_COLUMNS.find(c => c.id === targetColumn)?.label}`);
      onTasksChange();
    }
    setDraggedTask(null);
  };

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="flex gap-3 h-full min-w-max pb-2">
        {EDITOR_COLUMNS.map(col => {
          const colTasks = sortedTasksByColumn[col.id] || [];
          const isDragOver = dragOverColumn === col.id;
          return (
            <div key={col.id}
              className={`flex flex-col w-[300px] shrink-0 rounded-xl transition-colors ${
                isDragOver ? 'ring-2 ring-primary/40 bg-accent/30' : 'bg-muted/20'
              }`}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverColumn(col.id); }}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={e => handleDrop(e, col.id)}
            >
              <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl" style={{ backgroundColor: col.bg }}>
                <span className="text-sm">{col.icon}</span>
                <span className="text-sm font-bold text-white flex-1 truncate">{col.label}</span>
                <span className="text-xs font-bold text-white/90 bg-white/20 rounded-full px-2 py-0.5 min-w-[24px] text-center">
                  {colTasks.length}
                </span>
              </div>
              <ScrollArea className="flex-1 px-1.5 py-1.5">
                <div className="space-y-2">
                  {colTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      clients={clients}
                      scripts={scripts}
                      onOpenScript={onOpenScript}
                      draggedId={draggedTask?.id || null}
                      onDragStart={handleDragStart}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center py-10 text-xs text-muted-foreground italic">
                      {col.id === 'edicao' ? 'Nenhum vídeo para editar' :
                       col.id === 'revisao' ? 'Nenhum vídeo em revisão' :
                       col.id === 'alteracao' ? 'Nenhuma alteração pendente' :
                       'Nenhum vídeo concluído'}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Dashboard ──
export default function EditorDashboard() {
  const { clients, scripts } = useApp();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<EditorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [viewingScript, setViewingScript] = useState<any>(null);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('content_tasks')
      .select('*')
      .in('kanban_column', ['edicao', 'revisao', 'alteracao', 'envio'])
      .order('position', { ascending: true });
    if (data) setTasks(data as EditorTask[]);
    if (error) console.error('Error fetching editor tasks:', error);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const channel = supabase
      .channel('editor_tasks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_tasks' }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  const openScript = (scriptId: string) => {
    const script = scripts.find(s => s.id === scriptId);
    if (script) { setViewingScript(script); setScriptDialogOpen(true); }
  };

  const pendingCount = tasks.filter(t => t.kanban_column === 'edicao').length;
  const overdueCount = tasks.filter(t => t.kanban_column === 'edicao' && getDeadlineStatus(t.editing_deadline).variant === 'destructive').length;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Scissors size={20} className="text-primary" /> Painel do Editor
          </h1>
          <p className="text-sm text-muted-foreground">
            {pendingCount} vídeo{pendingCount !== 1 ? 's' : ''} para editar
            {overdueCount > 0 && <span className="text-destructive font-semibold"> · {overdueCount} atrasado{overdueCount !== 1 ? 's' : ''}</span>}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit mb-3">
          <TabsTrigger value="overview" className="gap-1.5"><TrendingUp size={14} /> Desempenho</TabsTrigger>
          <TabsTrigger value="kanban" className="gap-1.5"><Scissors size={14} /> Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 overflow-y-auto space-y-4 pb-4">
          <EditorStats tasks={tasks} clients={clients} />

          {/* Urgent tasks preview */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <AlertTriangle size={14} className="text-destructive" /> Tarefas Urgentes
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tasks
                .filter(t => t.kanban_column === 'edicao')
                .sort((a, b) => {
                  if (!a.editing_deadline) return 1;
                  if (!b.editing_deadline) return -1;
                  return new Date(a.editing_deadline).getTime() - new Date(b.editing_deadline).getTime();
                })
                .slice(0, 6)
                .map(task => {
                  const client = clients.find(c => c.id === task.client_id);
                  const cfg = getTypeConfig(task.content_type);
                  const deadline = getDeadlineStatus(task.editing_deadline);
                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-muted/30 rounded-lg p-3 border border-border cursor-pointer hover:shadow-md transition-shadow ${
                        deadline.variant === 'destructive' ? 'ring-1 ring-destructive/40' : ''
                      }`}
                      onClick={() => setActiveTab('kanban')}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <ClientLogo client={client as any} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground truncate">{client?.companyName}</p>
                          <Badge className={`text-[9px] px-1.5 py-0 ${cfg.color} border-0`}>
                            <cfg.icon size={9} className="mr-0.5" /> {cfg.label}
                          </Badge>
                        </div>
                        <Badge variant={deadline.variant === 'destructive' ? 'destructive' : 'outline'} className="text-[9px] shrink-0">
                          {deadline.label}
                        </Badge>
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{task.title}</p>
                      {task.drive_link && (
                        <a href={task.drive_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline mt-1">
                          <ExternalLink size={10} /> Materiais no Drive
                        </a>
                      )}
                      {task.editing_deadline && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Prazo: {format(new Date(task.editing_deadline), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              {tasks.filter(t => t.kanban_column === 'edicao').length === 0 && (
                <p className="text-sm text-muted-foreground italic col-span-full text-center py-6">Nenhuma tarefa pendente 🎉</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kanban" className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
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
          <EditorKanban
            tasks={tasks}
            clients={clients}
            scripts={scripts}
            user={user}
            onOpenScript={openScript}
            onTasksChange={fetchTasks}
            searchQuery={searchQuery}
            filterClient={filterClient}
          />
        </TabsContent>
      </Tabs>

      {/* Script viewer dialog */}
      <Dialog open={scriptDialogOpen} onOpenChange={setScriptDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={18} /> {viewingScript?.title || 'Roteiro'}
            </DialogTitle>
          </DialogHeader>
          {viewingScript && (
            <div className="prose prose-sm max-w-none p-4 rounded-xl bg-muted/30 border border-border min-h-[200px]"
              dangerouslySetInnerHTML={{ __html: highlightQuotes(viewingScript.content) || '<em>Sem conteúdo</em>' }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

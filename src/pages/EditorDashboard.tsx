import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/vpsDb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Film, Megaphone, Image, Palette, ExternalLink, Clock, AlertTriangle,
  Eye, Star, TrendingUp, BarChart3, Timer, Scissors, Kanban, ArrowRight, Check,
  Search, Filter, Users, Calendar, MessageSquare, Upload, Send, History, Zap, Flame,
  Play, Rocket, Trophy, Pause
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import DeadlineBadge from '@/components/DeadlineBadge';
import { highlightQuotes } from '@/lib/highlightQuotes';
import { format, differenceInHours, isPast, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, isToday, startOfDay, endOfDay, differenceInSeconds } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import EditorTaskDetail from '@/components/editor/EditorTaskDetail';

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400', points: 10 },
  { value: 'criativo', label: 'Criativos', icon: Megaphone, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400', points: 5 },
  { value: 'story', label: 'Story', icon: Image, color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400', points: 3 },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400', points: 2 },
];

export interface EditorTask {
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
  edited_video_link: string | null;
  edited_video_type: string | null;
  approval_sent_at: string | null;
  approved_at: string | null;
  adjustment_notes: string | null;
  editing_priority: boolean;
  immediate_alteration: boolean;
  review_deadline: string | null;
  alteration_deadline: string | null;
  approval_deadline: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export function getDeadlineStatus(deadline: string | null) {
  if (!deadline) return { label: 'Sem prazo', variant: 'default' as const };
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const hoursLeft = differenceInHours(deadlineDate, now);
  if (isPast(deadlineDate)) return { label: 'Atrasado', variant: 'destructive' as const };
  if (hoursLeft <= 12) return { label: 'Vence hoje', variant: 'warning' as const };
  if (hoursLeft <= 24) return { label: 'Vence amanhã', variant: 'warning' as const };
  return { label: `${Math.ceil(hoursLeft / 24)}d restantes`, variant: 'success' as const };
}

export function getTypeConfig(type: string) {
  return CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
}

/* ─── Subtle Section Icon ──────────────────────────────── */
function SectionIcon({ icon: Icon, size = 24, className = '' }: { icon: any; size?: number; className?: string }) {
  return (
    <motion.div className={className}
      animate={{ opacity: [0.7, 1, 0.7] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
      <Icon size={size} className="text-primary" />
    </motion.div>
  );
}

/* ─── Live Timer ──────────────────────────────────────────── */
function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return (
    <motion.span className="font-mono text-xs font-bold text-primary tabular-nums"
      animate={{ opacity: [1, 0.6, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
      {h > 0 && `${h}h `}{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </motion.span>
  );
}

/* ─── Score Burst Animation ───────────────────────────────── */
function ScoreBurst({ points, show }: { points: number; show: boolean }) {
  if (!show) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0, opacity: 0, y: 0 }}
        animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 0], y: -40 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2 }}
        className="absolute top-0 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      >
        <div className="flex items-center gap-1 bg-amber-500 text-white font-black text-lg px-3 py-1 rounded-full shadow-lg">
          <Star size={16} /> +{points}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function EditorDashboard() {
  const { clients, scripts, users } = useApp();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<EditorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<EditorTask | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [groupByClient, setGroupByClient] = useState(false);
  const [scoreBurst, setScoreBurst] = useState<{ id: string; pts: number } | null>(null);
  const isEditorRole = profile?.role === 'editor';

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase.from('content_tasks').select('*')
      .in('kanban_column', ['edicao', 'revisao', 'alteracao', 'envio'])
      .order('position', { ascending: true });
    if (data) setTasks(data as EditorTask[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const channel = supabase.channel('editor_dash_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_tasks' }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const visibleTasks = useMemo(() => {
    if (!isEditorRole || !user) return tasks;
    return tasks.filter(t => {
      if (t.kanban_column === 'edicao') return !t.assigned_to || t.assigned_to === user.id;
      return !t.assigned_to || t.assigned_to === user.id;
    });
  }, [tasks, isEditorRole, user]);

  const pendingTasks = visibleTasks.filter(t => t.kanban_column === 'edicao' && !t.editing_started_at);
  const inEditTasks = visibleTasks.filter(t => t.kanban_column === 'edicao' && t.editing_started_at);
  const inReviewTasks = visibleTasks.filter(t => t.kanban_column === 'revisao');
  const adjustmentTasks = visibleTasks.filter(t => t.kanban_column === 'alteracao');
  const completedTasks = visibleTasks.filter(t => t.kanban_column === 'envio');

  const todayCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: todayStart, end: todayEnd }));
  const weekCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: weekStart, end: weekEnd }));
  const monthCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: monthStart, end: monthEnd }));

  const overdueCount = visibleTasks.filter(t => t.kanban_column === 'edicao' && getDeadlineStatus(t.editing_deadline).variant === 'destructive').length;

  const calcPoints = (list: EditorTask[]) => list.reduce((sum, t) => sum + (getTypeConfig(t.content_type).points || 0), 0);
  const weekPoints = calcPoints(weekCompleted);
  const monthPoints = calcPoints(monthCompleted);

  const avgTimes = useMemo(() => {
    const byType: Record<string, number[]> = {};
    completedTasks.forEach(t => {
      if (t.editing_started_at && t.updated_at) {
        const hours = (new Date(t.updated_at).getTime() - new Date(t.editing_started_at).getTime()) / (1000 * 60 * 60);
        if (hours > 0 && hours < 200) {
          if (!byType[t.content_type]) byType[t.content_type] = [];
          byType[t.content_type].push(hours);
        }
      }
    });
    return Object.entries(byType).map(([type, times]) => ({
      type, avg: times.reduce((a, b) => a + b, 0) / times.length, count: times.length,
    }));
  }, [completedTasks]);

  const editingQueueTasks = useMemo(() => {
    return visibleTasks.filter(t => t.kanban_column === 'edicao' || t.kanban_column === 'alteracao');
  }, [visibleTasks]);

  const reviewTasks = useMemo(() => {
    return visibleTasks.filter(t => t.kanban_column === 'revisao' || t.kanban_column === 'envio');
  }, [visibleTasks]);

  const filteredQueueTasks = useMemo(() => {
    return editingQueueTasks.filter(t => {
      if (filterStatus !== 'all' && t.kanban_column !== filterStatus) return false;
      if (filterClient !== 'all' && t.client_id !== filterClient) return false;
      if (filterType !== 'all' && t.content_type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const client = clients.find((c: any) => c.id === t.client_id);
        if (!t.title.toLowerCase().includes(q) && !(client?.companyName || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [editingQueueTasks, filterStatus, filterClient, filterType, searchQuery, clients]);

  const filteredReviewTasks = useMemo(() => {
    return reviewTasks.filter(t => {
      if (filterClient !== 'all' && t.client_id !== filterClient) return false;
      if (filterType !== 'all' && t.content_type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const client = clients.find((c: any) => c.id === t.client_id);
        if (!t.title.toLowerCase().includes(q) && !(client?.companyName || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [reviewTasks, filterClient, filterType, searchQuery, clients]);

  const sortedFiltered = [...filteredQueueTasks].sort((a, b) => {
    if (a.immediate_alteration && !b.immediate_alteration) return -1;
    if (b.immediate_alteration && !a.immediate_alteration) return 1;
    if (a.editing_priority && !b.editing_priority) return -1;
    if (b.editing_priority && !a.editing_priority) return 1;
    const aStatus = getDeadlineStatus(a.editing_deadline);
    const bStatus = getDeadlineStatus(b.editing_deadline);
    if (aStatus.variant === 'destructive' && bStatus.variant !== 'destructive') return -1;
    if (bStatus.variant === 'destructive' && aStatus.variant !== 'destructive') return 1;
    if (!a.editing_deadline && !b.editing_deadline) return 0;
    if (!a.editing_deadline) return 1;
    if (!b.editing_deadline) return -1;
    return new Date(a.editing_deadline).getTime() - new Date(b.editing_deadline).getTime();
  });

  const groupedTasks = useMemo(() => {
    if (!groupByClient) return null;
    const groups: Record<string, EditorTask[]> = {};
    sortedFiltered.forEach(t => {
      const client = clients.find(c => c.id === t.client_id);
      const name = client?.companyName || 'Sem cliente';
      if (!groups[name]) groups[name] = [];
      groups[name].push(t);
    });
    return groups;
  }, [groupByClient, sortedFiltered, clients]);

  const openTaskDetail = (task: EditorTask) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };

  /* ─── Claim + Start Editing ─────────────────────────────── */
  const handleStartEditing = async (task: EditorTask) => {
    if (!user) return;
    const { error } = await supabase.from('content_tasks').update({
      assigned_to: user.id,
      editing_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    if (error) { toast.error('Erro ao iniciar edição'); return; }
    await supabase.from('task_history').insert({ task_id: task.id, user_id: user.id, action: 'Edição iniciada' });
    toast.success('Edição iniciada! O timer está rodando.');
    fetchTasks();
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Scissors size={32} className="text-primary animate-pulse" />
      <p className="text-muted-foreground text-sm">Carregando sua bancada...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header with Rocket */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionIcon icon={Scissors} size={24} />
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Bancada de Edição
            </h1>
            <p className="text-sm text-muted-foreground">
              {inEditTasks.length > 0 && (
                <span className="text-primary font-semibold">{inEditTasks.length} editando agora</span>
              )}
              {inEditTasks.length > 0 && pendingTasks.length > 0 && ' · '}
              {pendingTasks.length > 0 && `${pendingTasks.length} na fila`}
              {overdueCount > 0 && <span className="text-destructive font-semibold"> · {overdueCount} atrasado{overdueCount !== 1 ? 's' : ''}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Score badge */}
          <motion.div whileHover={{ scale: 1.05 }} className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1.5">
            <Trophy size={14} className="text-amber-500" />
            <span className="text-sm font-black text-amber-600">{weekPoints}</span>
            <span className="text-[10px] text-muted-foreground">pts/sem</span>
          </motion.div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/edicao/kanban')}>
            <Kanban size={14} /> Kanban <ArrowRight size={12} />
          </Button>
        </div>
      </motion.div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="queue" className="gap-1.5">
            <Scissors size={13} /> Fila de Edição
            {editingQueueTasks.length > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 ml-1">{editingQueueTasks.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="editing" className="gap-1.5">
            <Play size={13} /> Editando Agora
            {inEditTasks.length > 0 && (
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <Badge className="text-[9px] px-1.5 py-0 ml-1 bg-primary">{inEditTasks.length}</Badge>
              </motion.div>
            )}
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5">
            <Eye size={13} /> Em Revisão
            {inReviewTasks.length > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-1 bg-teal-500/10 text-teal-600 border-teal-500/30">{inReviewTasks.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5">
            <TrendingUp size={13} /> Desempenho
          </TabsTrigger>
        </TabsList>

        {/* ═══════ EDITING NOW TAB ═══════ */}
        <TabsContent value="editing" className="space-y-4">
          {inEditTasks.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-card border border-border rounded-xl p-6 text-center">
              <Scissors size={28} className="mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-foreground font-semibold text-sm">Nenhuma edição em andamento</p>
              <p className="text-xs text-muted-foreground mt-1">Pegue uma tarefa na Fila de Edição para começar!</p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {inEditTasks.map((task, i) => {
                const client = clients.find(c => c.id === task.client_id);
                const cfg = getTypeConfig(task.content_type);
                return (
                  <motion.div key={task.id}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="relative bg-card border-2 border-primary/30 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all"
                    onClick={() => openTaskDetail(task)}
                  >
                    {/* Glow top bar */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/60 to-primary" />
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {client && <ClientLogo client={client as any} size="sm" />}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{client?.companyName}</p>
                            <Badge className={`text-[10px] px-1.5 py-0 ${cfg.color} border-0`}>
                              <cfg.icon size={10} className="mr-0.5" />{cfg.label}
                            </Badge>
                          </div>
                        </div>
                        {/* Live timer */}
                        <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-full px-2.5 py-1">
                          <motion.div className="w-2 h-2 rounded-full bg-primary"
                            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                          {task.editing_started_at && <LiveTimer startedAt={task.editing_started_at} />}
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-foreground leading-tight">{task.title}</p>
                      {task.editing_deadline && <DeadlineBadge deadline={task.editing_deadline} label="Prazo" />}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {task.script_id && <span className="flex items-center gap-0.5"><Eye size={10} /> Roteiro</span>}
                        {task.drive_link && <span className="flex items-center gap-0.5"><ExternalLink size={10} /> Drive</span>}
                        {task.edited_video_link && <span className="flex items-center gap-0.5 text-green-600"><Check size={10} /> Vídeo anexado</span>}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════ QUEUE TAB ═══════ */}
        <TabsContent value="queue" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px] max-w-[280px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm" />
            </div>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-28 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {CONTENT_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={groupByClient ? 'default' : 'outline'} size="sm" className="h-8 gap-1 text-xs"
              onClick={() => setGroupByClient(!groupByClient)}>
              <Users size={12} /> Agrupar
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{sortedFiltered.length} conteúdo{sortedFiltered.length !== 1 ? 's' : ''}</p>

          {sortedFiltered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-card border border-border rounded-xl p-8 text-center">
              <RocketMascot size={56} className="mx-auto mb-3" />
              <p className="text-foreground font-semibold">Fila limpa!</p>
              <p className="text-sm text-muted-foreground">Todos os conteúdos foram editados</p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedFiltered.map((task, i) => (
                <QueueCard key={task.id} task={task} clients={clients} index={i}
                  onClick={() => openTaskDetail(task)}
                  onStartEditing={() => handleStartEditing(task)}
                  currentUserId={user?.id}
                  users={users} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════ REVIEW TAB ═══════ */}
        <TabsContent value="review" className="space-y-4">
          {filteredReviewTasks.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-card border border-border rounded-xl p-8 text-center">
              <Eye size={32} className="mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-muted-foreground">Nenhum conteúdo em revisão</p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredReviewTasks.map((task, i) => (
                <QueueCard key={task.id} task={task} clients={clients} index={i}
                  onClick={() => openTaskDetail(task)} currentUserId={user?.id} users={users} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════ PERFORMANCE TAB ═══════ */}
        <TabsContent value="performance" className="space-y-5">
          {/* Quick Stats with Rocket */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Hoje', value: todayCompleted.length, icon: Scissors, color: 'text-primary', bg: 'bg-primary/10' },
              { label: 'Semana', value: weekCompleted.length, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { label: 'Mês', value: monthCompleted.length, icon: BarChart3, color: 'text-green-500', bg: 'bg-green-500/10' },
              { label: 'Pontos (Mês)', value: monthPoints, icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`${s.bg} rounded-xl p-4 border border-border/50`}>
                <div className="flex items-center gap-2 mb-2">
                  <s.icon size={16} className={s.color} />
                  <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                </div>
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Score + Avg Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Trophy size={14} className="text-amber-500" /> Pontuação
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <p className="text-[11px] text-muted-foreground mb-1">Semana</p>
                  <p className="text-2xl font-black text-amber-600">{weekPoints}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-[11px] text-muted-foreground mb-1">Mês</p>
                  <p className="text-2xl font-black text-primary">{monthPoints}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {CONTENT_TYPES.map(ct => {
                  const count = monthCompleted.filter(t => t.content_type === ct.value).length;
                  return (
                    <div key={ct.value} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ct.icon size={12} className={ct.color.split(' ')[0]} />
                        <span className="text-xs text-foreground">{ct.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{count}</span>
                        <span className="text-[10px] text-muted-foreground">({count * ct.points} pts)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="bg-card border border-border rounded-xl p-4">
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
                        <span className="text-sm font-bold text-foreground">{hours > 0 ? `${hours}h ` : ''}{mins}min</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <RocketMascot size={40} className="mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Dados insuficientes</p>
                </div>
              )}
            </motion.div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Task Detail */}
      {selectedTask && (
        <EditorTaskDetail
          task={selectedTask}
          open={detailOpen}
          onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedTask(null); }}
          onRefresh={fetchTasks}
        />
      )}
    </div>
  );
}

/* ─── Queue Card ──────────────────────────────────────────── */
function QueueCard({ task, clients, index, onClick, onStartEditing, currentUserId, users }: {
  task: EditorTask; clients: any[]; index: number; onClick: () => void;
  onStartEditing?: () => void; currentUserId?: string; users?: any[];
}) {
  const client = clients.find(c => c.id === task.client_id);
  const cfg = getTypeConfig(task.content_type);
  const deadline = getDeadlineStatus(task.editing_deadline);
  const clientColor = client?.color || '217 91% 60%';
  const isEditing = !!task.editing_started_at;
  const isMyTask = task.assigned_to === currentUserId;

  const statusColors: Record<string, string> = {
    edicao: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    revisao: 'bg-teal-500/10 text-teal-600 border-teal-500/30',
    alteracao: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    envio: 'bg-green-500/10 text-green-600 border-green-500/30',
  };
  const statusLabels: Record<string, string> = {
    edicao: isEditing ? 'Editando' : 'Aguardando',
    revisao: 'Em Revisão',
    alteracao: 'Ajuste',
    envio: 'Finalizado',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      whileHover={{ scale: 1.01 }}
      className={`relative bg-card border border-border rounded-xl overflow-hidden cursor-pointer transition-all ${
        deadline.variant === 'destructive' && task.kanban_column === 'edicao' ? 'ring-1 ring-destructive/40' : ''
      } ${task.immediate_alteration ? 'ring-1 ring-red-500/60' : ''} ${task.editing_priority && !task.immediate_alteration ? 'ring-1 ring-amber-500/40' : ''}`}
      onClick={onClick}
    >
      {/* Priority banner */}
      {(task.immediate_alteration || task.editing_priority) && (
        <div className={`px-3 py-1 flex items-center gap-1.5 text-[10px] font-bold ${
          task.immediate_alteration ? 'bg-red-500/15 text-red-600' : 'bg-amber-500/15 text-amber-600'
        }`}>
          {task.immediate_alteration ? (
            <><Zap size={10} className="animate-pulse" /> ALTERAÇÃO IMEDIATA</>
          ) : (
            <><Flame size={10} /> PRIORIDADE</>
          )}
        </div>
      )}

      <div className="h-1.5 w-full" style={{ backgroundColor: `hsl(${clientColor})` }} />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {client && <ClientLogo client={client as any} size="sm" />}
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{client?.companyName || 'Cliente'}</p>
              <Badge className={`text-[10px] px-1.5 py-0 ${cfg.color} border-0`}>
                <cfg.icon size={10} className="mr-0.5" />{cfg.label}
              </Badge>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className={`text-[9px] ${statusColors[task.kanban_column] || ''}`}>
              {statusLabels[task.kanban_column]}
            </Badge>
            {isEditing && task.editing_started_at && (
              <div className="flex items-center gap-1 bg-primary/10 rounded-full px-2 py-0.5">
                <motion.div className="w-1.5 h-1.5 rounded-full bg-primary" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                <LiveTimer startedAt={task.editing_started_at} />
              </div>
            )}
          </div>
        </div>

        <p className="text-sm font-semibold text-foreground leading-tight">{task.title}</p>

        {task.kanban_column === 'edicao' && task.editing_deadline && <DeadlineBadge deadline={task.editing_deadline} label="Edição" />}
        {task.kanban_column === 'revisao' && task.review_deadline && <DeadlineBadge deadline={task.review_deadline} label="Revisão" />}
        {task.kanban_column === 'alteracao' && task.alteration_deadline && !task.immediate_alteration && <DeadlineBadge deadline={task.alteration_deadline} label="Alteração" />}

        {/* Assigned editor */}
        {task.assigned_to && users && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 rounded-md px-2 py-1">
            <Scissors size={10} />
            <span>Editor: <strong className="text-foreground">{users.find((u: any) => u.id === task.assigned_to)?.name || 'Editor'}</strong></span>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {task.script_id && <span className="flex items-center gap-0.5"><Eye size={10} /> Roteiro</span>}
          {task.drive_link && <span className="flex items-center gap-0.5"><ExternalLink size={10} /> Drive</span>}
          {task.edited_video_link && <span className="flex items-center gap-0.5 text-green-600"><Check size={10} /> Vídeo</span>}
        </div>

        {/* Start Editing CTA */}
        {task.kanban_column === 'edicao' && !task.editing_started_at && !task.assigned_to && onStartEditing && (
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button size="sm" className="w-full gap-1.5 h-8 text-xs bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
              onClick={(e) => { e.stopPropagation(); onStartEditing(); }}>
              <Rocket size={13} /> Iniciar Edição
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

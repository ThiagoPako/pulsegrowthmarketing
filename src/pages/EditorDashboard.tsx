import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Film, Megaphone, Image, Palette, ExternalLink, Clock, AlertTriangle,
  Eye, Star, TrendingUp, BarChart3, Timer, Scissors, Kanban, ArrowRight, Check,
  Search, Filter, Users, Calendar, MessageSquare, Upload, Send, History
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { highlightQuotes } from '@/lib/highlightQuotes';
import { format, differenceInHours, isPast, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, isToday, startOfDay, endOfDay } from 'date-fns';
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

export default function EditorDashboard() {
  const { clients, scripts } = useApp();
  const { user } = useAuth();
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

  const pendingTasks = tasks.filter(t => t.kanban_column === 'edicao');
  const inEditTasks = tasks.filter(t => t.kanban_column === 'edicao' && t.editing_started_at);
  const inReviewTasks = tasks.filter(t => t.kanban_column === 'revisao');
  const adjustmentTasks = tasks.filter(t => t.kanban_column === 'alteracao');
  const completedTasks = tasks.filter(t => t.kanban_column === 'envio');

  const todayCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: todayStart, end: todayEnd }));
  const weekCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: weekStart, end: weekEnd }));
  const monthCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: monthStart, end: monthEnd }));

  const overdueCount = pendingTasks.filter(t => getDeadlineStatus(t.editing_deadline).variant === 'destructive').length;

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

  // Filtered tasks for editing queue (only edicao + alteracao)
  const editingQueueTasks = useMemo(() => {
    return tasks.filter(t => t.kanban_column === 'edicao' || t.kanban_column === 'alteracao');
  }, [tasks]);

  // Filtered tasks for review tab (revisao + envio)
  const reviewTasks = useMemo(() => {
    return tasks.filter(t => t.kanban_column === 'revisao' || t.kanban_column === 'envio');
  }, [tasks]);

  // Apply filters to editing queue
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

  // Apply filters to review tasks
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

  const sortedFiltered = [...filteredTasks].sort((a, b) => {
    // Priority: overdue first, then by deadline
    const aStatus = getDeadlineStatus(a.editing_deadline);
    const bStatus = getDeadlineStatus(b.editing_deadline);
    if (aStatus.variant === 'destructive' && bStatus.variant !== 'destructive') return -1;
    if (bStatus.variant === 'destructive' && aStatus.variant !== 'destructive') return 1;
    if (aStatus.variant === 'warning' && bStatus.variant !== 'warning' && bStatus.variant !== 'destructive') return -1;
    if (bStatus.variant === 'warning' && aStatus.variant !== 'warning' && aStatus.variant !== 'destructive') return 1;
    if (!a.editing_deadline && !b.editing_deadline) return 0;
    if (!a.editing_deadline) return 1;
    if (!b.editing_deadline) return -1;
    return new Date(a.editing_deadline).getTime() - new Date(b.editing_deadline).getTime();
  });

  // Group by client
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

  const statusLabels: Record<string, string> = {
    edicao: 'Aguardando edição',
    revisao: 'Aguardando aprovação',
    alteracao: 'Solicitado ajuste',
    envio: 'Finalizado',
  };

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;

  const stats = [
    { label: 'Pendentes', value: pendingTasks.length, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Em Edição', value: inEditTasks.length, icon: Scissors, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Aguardando Aprovação', value: inReviewTasks.length, icon: Eye, color: 'text-teal-500', bg: 'bg-teal-500/10' },
    { label: 'Ajustes', value: adjustmentTasks.length, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Atrasados', value: overdueCount, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Finalizados (Mês)', value: monthCompleted.length, icon: Check, color: 'text-green-500', bg: 'bg-green-500/10' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Scissors size={20} className="text-primary" /> Painel do Editor
          </h1>
          <p className="text-sm text-muted-foreground">
            {pendingTasks.length} vídeo{pendingTasks.length !== 1 ? 's' : ''} para editar
            {overdueCount > 0 && <span className="text-destructive font-semibold"> · {overdueCount} atrasado{overdueCount !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/edicao/kanban')}>
          <Kanban size={14} /> Abrir Kanban <ArrowRight size={12} />
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">📊 Desempenho</TabsTrigger>
          <TabsTrigger value="queue">📋 Fila de Edição</TabsTrigger>
        </TabsList>

        {/* DASHBOARD TAB */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stats.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`${s.bg} rounded-xl p-3 border border-border/50`}>
                <div className="flex items-center gap-2 mb-1">
                  <s.icon size={14} className={s.color} />
                  <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
                </div>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Productivity + Time */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Produtividade */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" /> Produtividade
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Hoje</span>
                  <span className="text-lg font-black text-foreground">{todayCompleted.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Semana</span>
                  <span className="text-lg font-black text-foreground">{weekCompleted.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Mês</span>
                  <span className="text-lg font-black text-foreground">{monthCompleted.length}</span>
                </div>
              </div>
            </div>

            {/* Produção por tipo */}
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
                          <Star size={9} className="mr-0.5 text-amber-500" /> {pts}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                <div className="border-t border-border pt-2 mt-2 flex justify-between items-center">
                  <span className="text-sm font-semibold text-foreground">Total de pontos</span>
                  <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
                    <Star size={10} className="mr-0.5" /> {monthPoints} pts
                  </Badge>
                </div>
              </div>
            </div>

            {/* Tempo médio */}
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
                          <span className="text-sm font-bold text-foreground">{hours > 0 ? `${hours}h ` : ''}{mins}min</span>
                          <span className="text-[10px] text-muted-foreground">({at.count})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Dados insuficientes</p>
              )}
            </div>
          </div>

          {/* Pontos semana */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Star size={14} className="text-amber-500" /> Pontuação da Semana
              </h3>
              <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-lg font-black px-3 py-1">
                {weekPoints} pts
              </Badge>
            </div>
          </div>
        </TabsContent>

        {/* QUEUE TAB */}
        <TabsContent value="queue" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-[300px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar cliente ou projeto..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm" />
            </div>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Clientes</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-44 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="edicao">Aguardando edição</SelectItem>
                <SelectItem value="revisao">Aguardando aprovação</SelectItem>
                <SelectItem value="alteracao">Solicitado ajuste</SelectItem>
                <SelectItem value="envio">Finalizado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-32 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Tipos</SelectItem>
                {CONTENT_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={groupByClient ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => setGroupByClient(!groupByClient)}>
              <Users size={12} /> Por Cliente
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{sortedFiltered.length} conteúdo{sortedFiltered.length !== 1 ? 's' : ''} encontrado{sortedFiltered.length !== 1 ? 's' : ''}</p>

          {sortedFiltered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-muted-foreground">Nenhum conteúdo encontrado 🎉</p>
            </div>
          ) : groupByClient && groupedTasks ? (
            Object.entries(groupedTasks).map(([clientName, clientTasks]) => (
              <div key={clientName} className="space-y-2">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2 pt-2">
                  <ClientLogo client={clients.find(c => c.companyName === clientName) as any} size="sm" />
                  {clientName}
                  <Badge variant="outline" className="text-[10px]">{clientTasks.length}</Badge>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {clientTasks.map((task, i) => (
                    <TaskCard key={task.id} task={task} clients={clients} index={i} onClick={() => openTaskDetail(task)} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedFiltered.map((task, i) => (
                <TaskCard key={task.id} task={task} clients={clients} index={i} onClick={() => openTaskDetail(task)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Task Detail Dialog */}
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

function TaskCard({ task, clients, index, onClick }: {
  task: EditorTask; clients: any[]; index: number; onClick: () => void;
}) {
  const client = clients.find(c => c.id === task.client_id);
  const cfg = getTypeConfig(task.content_type);
  const deadline = getDeadlineStatus(task.editing_deadline);
  const clientColor = client?.color || '217 91% 60%';

  const statusColors: Record<string, string> = {
    edicao: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    revisao: 'bg-teal-500/10 text-teal-600 border-teal-500/30',
    alteracao: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    envio: 'bg-green-500/10 text-green-600 border-green-500/30',
  };

  const statusLabels: Record<string, string> = {
    edicao: 'Aguardando edição',
    revisao: 'Aguardando aprovação',
    alteracao: 'Solicitado ajuste',
    envio: 'Finalizado',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all ${
        deadline.variant === 'destructive' && task.kanban_column === 'edicao' ? 'ring-1 ring-destructive/40' : ''
      }`}
      onClick={onClick}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: `hsl(${clientColor})` }} />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <ClientLogo client={client as any} size="sm" />
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
            {task.kanban_column === 'edicao' && deadline.variant !== 'default' && (
              <Badge variant={deadline.variant === 'destructive' ? 'destructive' : 'outline'}
                className={`text-[9px] shrink-0 ${
                  deadline.variant === 'warning' ? 'bg-warning/20 text-warning border-warning/30' :
                  deadline.variant === 'success' ? 'bg-success/20 text-success border-success/30' : ''
                }`}>
                {deadline.variant === 'destructive' && <AlertTriangle size={9} className="mr-0.5" />}
                {deadline.variant === 'warning' && <Clock size={9} className="mr-0.5" />}
                {deadline.label}
              </Badge>
            )}
          </div>
        </div>

        <p className="text-sm font-semibold text-foreground leading-tight">{task.title}</p>

        {task.editing_deadline && task.kanban_column === 'edicao' && (
          <p className="text-[11px] text-muted-foreground">
            📅 Prazo: {format(new Date(task.editing_deadline), "dd/MM 'às' HH:mm", { locale: ptBR })}
          </p>
        )}

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {task.script_id && <span className="flex items-center gap-0.5"><Eye size={10} /> Roteiro</span>}
          {task.drive_link && <span className="flex items-center gap-0.5"><ExternalLink size={10} /> Drive</span>}
          {task.edited_video_link && <span className="flex items-center gap-0.5"><Upload size={10} /> Vídeo</span>}
        </div>
      </div>
    </motion.div>
  );
}

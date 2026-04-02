import { useState, useMemo } from 'react';
import BonusCongratsBanner from '@/components/BonusCongratsBanner';
import { DESIGNER_SCORE } from '@/lib/scoringSystem';
import { useNavigate } from 'react-router-dom';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask } from '@/hooks/useDesignTasks';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ClientLogo from '@/components/ClientLogo';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';
import DesignTaskCreateDialog from '@/components/designer/DesignTaskCreateDialog';
import DesignerTaskCard from '@/components/designer/DesignerTaskCard';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays, startOfWeek, isSameDay, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Palette, CheckCircle, Clock, Play, Eye, RotateCcw, Kanban, BarChart3,
  TrendingUp, Zap, Timer, Building2, CalendarDays,
  Flame, Target, Award, Send, ArrowRight, FileText, Plus, Search,
  AlertTriangle, ListFilter, Layers
} from 'lucide-react';

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string; slaHours: number }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground', slaHours: 96 },
  media: { label: 'Média', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-500', slaHours: 72 },
  alta: { label: 'Alta', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500', slaHours: 48 },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 animate-pulse', dot: 'bg-red-500', slaHours: 24 },
};

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed', story: 'Story', logomarca: 'Logomarca', midia_fisica: 'Mídia Física',
};

const COL_LABELS: Record<string, string> = {
  nova_tarefa: 'Nova', executando: 'Executando', ajustes: 'Ajustes',
  em_analise: 'Análise', enviar_cliente: 'P/ Cliente', aprovado: 'Aprovado',
};

/* ── Deadline helpers for design tasks ── */
function getDesignDeadline(task: DesignTask): Date {
  const sla = PRIORITY_CONFIG[task.priority]?.slaHours || 72;
  return addDays(new Date(task.created_at), sla / 24);
}

function getDesignDeadlineStatus(task: DesignTask) {
  if (['aprovado'].includes(task.kanban_column)) return { label: 'Concluído', variant: 'success' as const, hoursLeft: 0, progress: 100 };
  const deadline = getDesignDeadline(task);
  const now = new Date();
  const hoursLeft = differenceInHours(deadline, now);
  const totalHours = PRIORITY_CONFIG[task.priority]?.slaHours || 72;
  const elapsed = differenceInHours(now, new Date(task.created_at));
  const progress = Math.min(100, Math.max(0, Math.round((elapsed / totalHours) * 100)));

  if (isPast(deadline)) return { label: 'Atrasado', variant: 'destructive' as const, hoursLeft, progress: 100 };
  if (hoursLeft <= 6) return { label: `${hoursLeft}h restantes`, variant: 'warning' as const, hoursLeft, progress };
  if (hoursLeft <= 24) return { label: `${hoursLeft}h restantes`, variant: 'warning' as const, hoursLeft, progress };
  const days = Math.ceil(hoursLeft / 24);
  return { label: `${days}d restantes`, variant: 'default' as const, hoursLeft, progress };
}

export default function DesignerDashboard() {
  const { tasksQuery } = useDesignTasks();
  const { user } = useAuth();
  const { currentUser, clients } = useApp();
  const navigate = useNavigate();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [queueView, setQueueView] = useState<'all' | 'nova_tarefa' | 'executando' | 'ajustes'>('all');

  const tasks = tasksQuery.data || [];
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const myTasks = useMemo(() => {
    if (!user?.id) return tasks;
    if (currentUser?.role === 'admin') return tasks;
    return tasks.filter(t => t.assigned_to === user.id || !t.assigned_to);
  }, [tasks, user?.id, currentUser?.role]);

  // Stats
  const stats = useMemo(() => {
    const myAssigned = tasks.filter(t => t.assigned_to === user?.id);
    const pending = myTasks.filter(t => t.kanban_column === 'nova_tarefa');
    const inProgress = myTasks.filter(t => t.kanban_column === 'executando');
    const adjustments = myTasks.filter(t => t.kanban_column === 'ajustes');
    const completed = myAssigned.filter(t => ['concluida', 'aprovada_cliente', 'aprovado'].includes(t.kanban_column));
    const urgent = myTasks.filter(t => (t.priority === 'urgente' || t.priority === 'alta') && !['aprovado', 'concluida', 'aprovada_cliente'].includes(t.kanban_column));

    const completedWithTime = completed.filter(t => t.time_spent_seconds > 0);
    const avgTime = completedWithTime.length > 0
      ? completedWithTime.reduce((s, t) => s + t.time_spent_seconds, 0) / completedWithTime.length : 0;

    const completedToday = completed.filter(t => t.completed_at?.startsWith(todayStr));
    const now = new Date();
    const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); ws.setHours(0,0,0,0);
    const completedThisWeek = completed.filter(t => new Date(t.completed_at || t.updated_at) >= ws);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = completed.filter(t => new Date(t.completed_at || t.updated_at) >= monthStart);

    const totalTime = completedWithTime.reduce((s, t) => s + t.time_spent_seconds, 0);
    const uniqueClients = new Set(completed.map(t => t.client_id)).size;

    const byFormat: Record<string, number> = {};
    completed.forEach(t => {
      const label = FORMAT_LABELS[t.format_type] || t.format_type;
      byFormat[label] = (byFormat[label] || 0) + 1;
    });

    const byClient: Record<string, { name: string; count: number; color: string; logoUrl: string | null }> = {};
    myTasks.filter(t => !['aprovado', 'concluida', 'aprovada_cliente'].includes(t.kanban_column)).forEach(t => {
      const cid = t.client_id;
      if (!byClient[cid]) {
        byClient[cid] = {
          name: t.clients?.company_name || '—', count: 0,
          color: t.clients?.color || '217 91% 60%', logoUrl: t.clients?.logo_url || null,
        };
      }
      byClient[cid].count++;
    });

    // Overdue count
    const overdue = myTasks.filter(t =>
      !['aprovado', 'concluida', 'aprovada_cliente'].includes(t.kanban_column) &&
      getDesignDeadlineStatus(t).variant === 'destructive'
    ).length;

    // Scoring
    const monthTasks = myAssigned;
    const scoringCompleted = monthTasks.filter(t => ['concluida', 'aprovada_cliente', 'aprovado'].includes(t.kanban_column)).length;
    const scoringInProgress = monthTasks.filter(t => ['executando', 'em_analise', 'ajustes', 'enviar_cliente'].includes(t.kanban_column)).length;
    const scoringHours = Math.round(monthTasks.reduce((a, t) => a + (t.time_spent_seconds || 0), 0) / 3600);
    const scoringVersions = monthTasks.reduce((a, t) => a + (t.version || 1), 0);
    const scoringPriority = monthTasks.filter(t => t.priority === 'alta' || t.priority === 'urgente').length;
    const designerScore = scoringCompleted * DESIGNER_SCORE.CONCLUIDO +
      scoringInProgress * DESIGNER_SCORE.EM_PROGRESSO +
      scoringHours * DESIGNER_SCORE.POR_HORA +
      scoringVersions * DESIGNER_SCORE.POR_VERSAO +
      scoringPriority * DESIGNER_SCORE.PRIORIDADE;

    return {
      pending: pending.length, inProgress: inProgress.length,
      adjustments: adjustments.length, completed: completed.length,
      urgent: urgent.length, avgTime, completedToday: completedToday.length,
      completedThisWeek: completedThisWeek.length, completedThisMonth: completedThisMonth.length,
      uniqueClients, totalTime, overdue,
      totalActive: pending.length + inProgress.length + adjustments.length,
      byFormat: Object.entries(byFormat).map(([name, value]) => ({ name, value })),
      byClient: Object.values(byClient).sort((a, b) => b.count - a.count),
      designerScore, scoringCompleted, scoringInProgress, scoringHours, scoringVersions, scoringPriority,
    };
  }, [myTasks, tasks, user?.id, todayStr]);

  // Queue tasks (fila do designer)
  const queueTasks = useMemo(() => {
    const activeCols = queueView === 'all'
      ? ['nova_tarefa', 'executando', 'ajustes', 'em_analise', 'enviar_cliente']
      : [queueView];

    return myTasks
      .filter(t => activeCols.includes(t.kanban_column))
      .filter(t => {
        if (filterClient !== 'all' && t.client_id !== filterClient) return false;
        if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!t.title.toLowerCase().includes(q) && !(t.clients?.company_name || '').toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Adjustments first, then by deadline urgency
        if (a.kanban_column === 'ajustes' && b.kanban_column !== 'ajustes') return -1;
        if (b.kanban_column === 'ajustes' && a.kanban_column !== 'ajustes') return 1;
        const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
        const pa = priorityOrder[a.priority] ?? 9;
        const pb = priorityOrder[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        // Then by created_at (oldest first)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }, [myTasks, queueView, filterClient, filterPriority, searchQuery]);

  // Unique clients for filter
  const activeClients = useMemo(() => {
    const map = new Map<string, string>();
    myTasks.filter(t => !['aprovado'].includes(t.kanban_column)).forEach(t => {
      if (t.clients?.company_name) map.set(t.client_id, t.clients.company_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [myTasks]);

  // Today's actionable tasks
  const todayTasks = useMemo(() => {
    return myTasks.filter(t =>
      ['nova_tarefa', 'executando', 'ajustes'].includes(t.kanban_column)
    ).sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
      const colOrder: Record<string, number> = { ajustes: 0, executando: 1, nova_tarefa: 2 };
      const colA = colOrder[a.kanban_column] ?? 9;
      const colB = colOrder[b.kanban_column] ?? 9;
      if (colA !== colB) return colA - colB;
      return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
    });
  }, [myTasks]);

  const getTasksForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return myTasks.filter(t => {
      if (t.kanban_column === 'aprovado') return t.completed_at?.startsWith(dateStr);
      if (t.kanban_column === 'executando' && t.started_at) return t.started_at.startsWith(dateStr);
      return t.created_at?.startsWith(dateStr) && !['aprovado'].includes(t.kanban_column);
    }).sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
      return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
    });
  };

  const recentCompleted = useMemo(() => {
    return tasks
      .filter(t => t.kanban_column === 'aprovado' && t.assigned_to === user?.id)
      .sort((a, b) => new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime())
      .slice(0, 5);
  }, [tasks, user?.id]);

  const formatTime = (seconds: number) => {
    if (seconds === 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}min`;
  };

  return (
    <div className="space-y-5 max-w-[1400px]">
      <BonusCongratsBanner />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-display font-bold">Olá, {currentUser?.displayName || currentUser?.name} 👋</h1>
          <p className="text-muted-foreground text-sm">
            {format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5 text-xs">
            <Plus size={14} /> Nova Demanda
          </Button>
          <Button onClick={() => navigate('/clientes')} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Building2 size={14} /> Clientes
          </Button>
          <Button onClick={() => navigate('/designer')} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Kanban size={14} /> Kanban
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Tarefas Ativas', value: stats.totalActive, icon: Palette, color: 'bg-primary/15 text-primary' },
          { label: 'Atrasadas', value: stats.overdue, icon: AlertTriangle, color: stats.overdue > 0 ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground' },
          { label: 'Clientes Atendidos', value: stats.uniqueClients, icon: Building2, color: 'bg-info/15 text-info' },
          { label: 'Concluídas (mês)', value: stats.completedThisMonth, icon: TrendingUp, color: 'bg-success/15 text-success' },
          { label: 'Tempo Médio', value: formatTime(stats.avgTime), icon: Timer, color: 'bg-warning/15 text-warning' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="stat-card">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
              <s.icon size={16} />
            </div>
            <p className="text-xl font-display font-bold">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ═══════════════ FILA DO DESIGNER ═══════════════ */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-primary" />
            <div>
              <h3 className="font-display font-semibold text-sm">Fila do Designer</h3>
              <p className="text-[11px] text-muted-foreground">{queueTasks.length} tarefa{queueTasks.length !== 1 ? 's' : ''} na fila</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Column filter tabs */}
            <div className="flex rounded-lg border bg-muted/30 p-0.5 gap-0.5">
              {[
                { key: 'all' as const, label: 'Todas', count: myTasks.filter(t => !['aprovado'].includes(t.kanban_column)).length },
                { key: 'nova_tarefa' as const, label: 'Novas', count: myTasks.filter(t => t.kanban_column === 'nova_tarefa').length },
                { key: 'executando' as const, label: 'Executando', count: myTasks.filter(t => t.kanban_column === 'executando').length },
                { key: 'ajustes' as const, label: 'Ajustes', count: myTasks.filter(t => t.kanban_column === 'ajustes').length },
              ].map(tab => (
                <button key={tab.key}
                  onClick={() => setQueueView(tab.key)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all flex items-center gap-1 ${
                    queueView === tab.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-[9px] px-1 rounded-full ${
                      queueView === tab.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar tarefa ou cliente..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {activeClients.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="urgente">🔥 Urgente</SelectItem>
              <SelectItem value="alta">⚡ Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Queue list */}
        {queueTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle size={36} className="mb-2 opacity-40" />
            <p className="text-sm font-medium">Nenhuma tarefa na fila! 🎉</p>
            <p className="text-xs">Todas as demandas foram atendidas</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2 pr-2">
              <AnimatePresence mode="popLayout">
                {queueTasks.map((task, i) => (
                  <DesignerTaskCard
                    key={task.id}
                    task={task}
                    index={i}
                    onOpenDetail={setSelectedTaskId}
                  />
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Main row: Performance (left 1/3) + Week (right 2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Performance card */}
        <div className="glass-card p-5">
          <div className="section-header">
            <BarChart3 size={16} className="text-primary" />
            <h3 className="section-title">Meu Desempenho</h3>
          </div>
          <div className="space-y-4">
            {/* Scoring card */}
            <div className="rounded-xl bg-gradient-to-br from-amber-500/15 to-yellow-500/5 border border-amber-500/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Award size={14} className="text-amber-500" /> Pontuação Mensal
                </span>
                <span className="text-xl font-display font-bold text-amber-500">{stats.designerScore} <span className="text-xs font-normal text-muted-foreground">pts</span></span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <span className="text-muted-foreground">Concluídos: <strong className="text-foreground">{stats.scoringCompleted}</strong> <span className="opacity-60">×{DESIGNER_SCORE.CONCLUIDO}</span></span>
                <span className="text-muted-foreground">Em progresso: <strong className="text-foreground">{stats.scoringInProgress}</strong> <span className="opacity-60">×{DESIGNER_SCORE.EM_PROGRESSO}</span></span>
                <span className="text-muted-foreground">Horas: <strong className="text-foreground">{stats.scoringHours}</strong> <span className="opacity-60">×{DESIGNER_SCORE.POR_HORA}</span></span>
                <span className="text-muted-foreground">Versões: <strong className="text-foreground">{stats.scoringVersions}</strong> <span className="opacity-60">×{DESIGNER_SCORE.POR_VERSAO}</span></span>
                <span className="text-muted-foreground">Prioridade: <strong className="text-foreground">{stats.scoringPriority}</strong> <span className="opacity-60">×{DESIGNER_SCORE.PRIORIDADE}</span></span>
              </div>
            </div>

            {/* Week progress */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Semana</span>
                <span className="font-bold">{stats.completedThisWeek} artes</span>
              </div>
              <Progress value={stats.completedThisWeek > 0 ? Math.min((stats.completedThisWeek / 20) * 100, 100) : 0} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.uniqueClients}</p>
                <p className="text-[10px] text-muted-foreground">Clientes atendidos</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{stats.completedThisMonth}</p>
                <p className="text-[10px] text-muted-foreground">Artes (mês)</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{formatTime(stats.avgTime)}</p>
                <p className="text-[10px] text-muted-foreground">Tempo médio</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-lg font-display font-bold">{formatTime(stats.totalTime)}</p>
                <p className="text-[10px] text-muted-foreground">Tempo total</p>
              </div>
            </div>

            {/* Urgent alert */}
            {stats.urgent > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Flame size={14} className="text-destructive" />
                  <span className="text-xs font-bold text-destructive">{stats.urgent} Urgente{stats.urgent > 1 ? 's' : ''}</span>
                </div>
              </div>
            )}

            {/* Recent completed */}
            {recentCompleted.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CheckCircle size={12} className="text-emerald-500" /> Recém Concluídas
                </p>
                <div className="space-y-1.5">
                  {recentCompleted.map(t => (
                    <div key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                      <ClientLogo
                        client={{ companyName: t.clients?.company_name || '', color: t.clients?.color || '217 91% 60%', logoUrl: t.clients?.logo_url }}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium truncate">{t.title}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {t.time_spent_seconds > 0 && formatTime(t.time_spent_seconds)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By format */}
            {stats.byFormat.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Por Formato</p>
                <div className="space-y-2">
                  {stats.byFormat.map((f, idx) => {
                    const max = Math.max(...stats.byFormat.map(x => x.value), 1);
                    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'];
                    return (
                      <div key={f.name}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-muted-foreground">{f.name}</span>
                          <span className="text-[10px] font-semibold">{f.value}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[idx % colors.length]} transition-all`} style={{ width: `${(f.value / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weekly Kanban */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <CalendarDays size={16} className="text-primary" /> Minha Semana
            </h3>
            <div className="hidden md:flex items-center gap-3 text-[10px] text-muted-foreground">
              {DESIGN_COLUMNS.filter(c => c.key !== 'aprovado').map(col => (
                <div key={col.key} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${col.color})` }} />
                  <span>{col.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 min-h-[300px]">
            {weekDays.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isToday = isSameDay(day, today);
              const dayTasks = getTasksForDay(day);

              return (
                <div key={dateStr} className={`glass-card p-3 ${isToday ? 'ring-1 ring-primary' : ''}`}>
                  <div className="text-center mb-3">
                    <p className={`text-xs font-semibold uppercase ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {format(day, 'EEE', { locale: ptBR })}
                    </p>
                    <p className={`text-lg font-display font-bold ${isToday ? 'text-primary' : ''}`}>
                      {format(day, 'd')}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {dayTasks.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-4">Livre</p>
                    )}
                    {dayTasks.slice(0, 6).map(task => {
                      const taskColor = task.clients?.color || '217 91% 60%';
                      const isApproved = task.kanban_column === 'aprovado';
                      const isAdj = task.kanban_column === 'ajustes';
                      const col = DESIGN_COLUMNS.find(c => c.key === task.kanban_column);
                      const ds = getDesignDeadlineStatus(task);

                      return (
                        <div key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          className={`rounded-lg border p-2 text-xs space-y-1 cursor-pointer transition-all hover:shadow-md ${
                            isApproved ? 'border-emerald-500/30 bg-emerald-500/5 opacity-70' :
                            isAdj ? 'border-orange-400/30 bg-orange-500/5' :
                            ds.variant === 'destructive' ? 'border-destructive/30 bg-destructive/5' :
                            'border-border bg-card hover:border-primary/40'
                          }`}
                          style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${taskColor})` }}
                        >
                          <div className="flex items-center gap-1.5">
                            <ClientLogo client={{ companyName: task.clients?.company_name || '', color: taskColor, logoUrl: task.clients?.logo_url }} size="sm" />
                            <span className="font-medium truncate flex-1">{task.clients?.company_name || '—'}</span>
                          </div>
                          <p className="text-muted-foreground truncate">{task.title}</p>
                          {!isApproved && (
                            <div className="flex items-center gap-1">
                              <Clock size={9} className={ds.variant === 'destructive' ? 'text-destructive' : ds.variant === 'warning' ? 'text-orange-500' : 'text-muted-foreground'} />
                              <span className={`text-[9px] ${ds.variant === 'destructive' ? 'text-destructive font-bold' : ds.variant === 'warning' ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                {ds.label}
                              </span>
                            </div>
                          )}
                          {isApproved && (
                            <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[9px]">✓ Aprovado</Badge>
                          )}
                          {isAdj && (
                            <Badge className="bg-orange-500/20 text-orange-600 border-orange-500/30 text-[9px]">↻ Ajuste</Badge>
                          )}
                          {task.priority === 'urgente' && !isApproved && (
                            <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] animate-pulse">🔥</Badge>
                          )}
                        </div>
                      );
                    })}
                    {dayTasks.length > 6 && (
                      <p className="text-[10px] text-muted-foreground text-center">+{dayTasks.length - 6} mais</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom: Demands by client */}
      {stats.byClient.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
            <Target size={16} /> Demandas Ativas por Cliente
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {stats.byClient.map(c => (
              <div key={c.name} className="rounded-lg border bg-card p-3 text-center space-y-2 hover:shadow-md transition-all">
                <ClientLogo client={{ companyName: c.name, color: c.color, logoUrl: c.logoUrl }} size="md" />
                <p className="text-xs font-medium truncate">{c.name}</p>
                <Badge variant="secondary" className="text-xs">{c.count} demandas</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTask && (
        <DesignTaskDetailSheet task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTaskId(null)} />
      )}

      <DesignTaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
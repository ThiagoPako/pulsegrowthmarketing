import { useState, useMemo, useEffect } from 'react';
import BonusCongratsBanner from '@/components/BonusCongratsBanner';
import { DESIGNER_SCORE } from '@/lib/scoringSystem';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask } from '@/hooks/useDesignTasks';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ClientLogo from '@/components/ClientLogo';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';
import DesignTaskCreateDialog from '@/components/designer/DesignTaskCreateDialog';
import DesignerTaskCard from '@/components/designer/DesignerTaskCard';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays, startOfWeek, isSameDay, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Palette, CheckCircle, Clock, BarChart3,
  TrendingUp, Timer, Building2, CalendarDays,
  Flame, Target, Award, Plus, Search, Play, Pause, Send, Upload, FileText, Eye, ZoomIn,
  AlertTriangle, Layers, Heart, Sparkles, Star, MoonStar, RotateCcw, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';

const PRIORITY_CONFIG: Record<string, { slaHours: number }> = {
  baixa: { slaHours: 72 },
  media: { slaHours: 72 },
  alta: { slaHours: 48 },
  urgente: { slaHours: 24 },
};

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed', story: 'Story', logomarca: 'Logo', midia_fisica: 'Mídia Física',
};

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
  if (hoursLeft <= 24) return { label: `${hoursLeft}h`, variant: 'warning' as const, hoursLeft, progress };
  const days = Math.ceil(hoursLeft / 24);
  return { label: `${days}d`, variant: 'default' as const, hoursLeft, progress };
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
};

export default function DesignerDashboard() {
  const { tasksQuery, updateTask, addHistory } = useDesignTasks();
  const { user } = useAuth();
  const { currentUser } = useApp();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [copyDialogTask, setCopyDialogTask] = useState<DesignTask | null>(null);
  const [activeElapsed, setActiveElapsed] = useState('');

  const tasks = tasksQuery.data || [];
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const todayStr = today.toISOString().split('T')[0];

  const myTasks = useMemo(() => {
    if (!user?.id) return tasks;
    if (currentUser?.role === 'admin') return tasks;
    const assignedOrOpenTasks = tasks.filter(t => t.assigned_to === user.id || !t.assigned_to);
    const isDesignerRole = currentUser?.role === 'designer' || currentUser?.role === 'fotografo';

    // Fallback defensivo: em produção existem demandas antigas atribuídas a IDs legados.
    // Se o filtro pessoal zerar tudo, o designer ainda vê a fila operacional da cidade ativa.
    if (isDesignerRole && assignedOrOpenTasks.length === 0 && tasks.length > 0) return tasks;

    return assignedOrOpenTasks;
  }, [tasks, user?.id, currentUser?.role]);

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
    const now = new Date();
    const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); ws.setHours(0,0,0,0);
    const completedThisWeek = completed.filter(t => new Date(t.completed_at || t.updated_at) >= ws);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = completed.filter(t => new Date(t.completed_at || t.updated_at) >= monthStart);
    const totalTime = completedWithTime.reduce((s, t) => s + t.time_spent_seconds, 0);
    const uniqueClients = new Set(completed.map(t => t.client_id)).size;
    const overdue = myTasks.filter(t =>
      !['aprovado', 'concluida', 'aprovada_cliente'].includes(t.kanban_column) && getDesignDeadlineStatus(t).variant === 'destructive'
    ).length;

    const byFormat: Record<string, number> = {};
    completed.forEach(t => {
      const label = FORMAT_LABELS[t.format_type] || t.format_type;
      byFormat[label] = (byFormat[label] || 0) + 1;
    });

    const byClient: Record<string, { name: string; count: number; color: string; logoUrl: string | null }> = {};
    myTasks.filter(t => !['aprovado', 'concluida', 'aprovada_cliente'].includes(t.kanban_column)).forEach(t => {
      if (!byClient[t.client_id]) {
        byClient[t.client_id] = { name: t.clients?.company_name || '—', count: 0, color: t.clients?.color || '217 91% 60%', logoUrl: t.clients?.logo_url || null };
      }
      byClient[t.client_id].count++;
    });

    // Scoring
    const scoringCompleted = myAssigned.filter(t => ['concluida', 'aprovada_cliente', 'aprovado'].includes(t.kanban_column)).length;
    const scoringHours = Math.round(myAssigned.reduce((a, t) => a + (t.time_spent_seconds || 0), 0) / 3600);
    const designerScore = scoringCompleted * DESIGNER_SCORE.CONCLUIDO + scoringHours * DESIGNER_SCORE.POR_HORA;

    return {
      pending: pending.length, inProgress: inProgress.length, adjustments: adjustments.length,
      completed: completed.length, urgent: urgent.length, avgTime, overdue,
      completedThisWeek: completedThisWeek.length, completedThisMonth: completedThisMonth.length,
      uniqueClients, totalTime, totalActive: pending.length + inProgress.length + adjustments.length,
      byFormat: Object.entries(byFormat).map(([name, value]) => ({ name, value })),
      byClient: Object.values(byClient).sort((a, b) => b.count - a.count),
      designerScore, scoringCompleted, scoringHours,
    };
  }, [myTasks, tasks, user?.id, todayStr]);

  const matchesFilters = (t: DesignTask) => {
    if (filterClient !== 'all' && t.client_id !== filterClient) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.clients?.company_name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const sortByPriority = (a: DesignTask, b: DesignTask) => {
    const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
    const pa = priorityOrder[a.priority] ?? 9;
    const pb = priorityOrder[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  };

  const groupedQueue = useMemo(() => {
    const filtered = myTasks.filter(matchesFilters);
    // Active: only one card in 'executando' (per single-active-task rule). Pick most recently started.
    const executing = filtered
      .filter(t => t.kanban_column === 'executando')
      .sort((a, b) => new Date(b.started_at || b.updated_at).getTime() - new Date(a.started_at || a.updated_at).getTime());
    const active = executing[0] || null;
    const otherExecuting = executing.slice(1); // shouldn't happen, but safety
    return {
      active,
      revisao: filtered
        .filter(t => t.kanban_column === 'ajustes' || t.kanban_column === 'em_analise')
        .sort(sortByPriority),
      fila: filtered.filter(t => t.kanban_column === 'nova_tarefa').sort(sortByPriority),
      filaBaixa: [
        ...otherExecuting,
        ...filtered.filter(t => t.kanban_column === 'fila_baixa_prioridade'),
      ].sort(sortByPriority),
      cliente: filtered.filter(t => t.kanban_column === 'enviar_cliente').sort(sortByPriority),
    };
  }, [myTasks, filterClient, filterPriority, searchQuery]);

  // Live timer for spotlight active task (HH:MM:SS, respects pause)
  const activeTask = groupedQueue.active;
  useEffect(() => {
    if (!activeTask) { setActiveElapsed(''); return; }
    const base = activeTask.time_spent_seconds || 0;
    const running = activeTask.timer_running && activeTask.timer_started_at;
    const startMs = running ? new Date(activeTask.timer_started_at as string).getTime() : 0;
    const fmt = (s: number) => {
      s = Math.max(0, Math.floor(s));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };
    const update = () => {
      const extra = running ? (Date.now() - startMs) / 1000 : 0;
      setActiveElapsed(fmt(base + extra));
    };
    update();
    if (!running) return;
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeTask?.id, activeTask?.timer_running, activeTask?.timer_started_at, activeTask?.time_spent_seconds]);

  const handleTogglePause = async () => {
    if (!activeTask) return;
    try {
      if (activeTask.timer_running) {
        const runSecs = activeTask.timer_started_at
          ? Math.max(0, Math.floor((Date.now() - new Date(activeTask.timer_started_at).getTime()) / 1000))
          : 0;
        await updateTask.mutateAsync({
          id: activeTask.id,
          timer_running: false,
          timer_started_at: null,
          time_spent_seconds: (activeTask.time_spent_seconds || 0) + runSecs,
        } as any);
        await addHistory.mutateAsync({ task_id: activeTask.id, action: 'Cronômetro pausado', user_id: user?.id });
        toast.success('Tarefa pausada 💜');
      } else {
        await updateTask.mutateAsync({
          id: activeTask.id,
          timer_running: true,
          timer_started_at: new Date().toISOString(),
        } as any);
        await addHistory.mutateAsync({ task_id: activeTask.id, action: 'Cronômetro retomado', user_id: user?.id });
        toast.success('Cronômetro retomado ▶');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alternar cronômetro');
    }
  };


  const activeClients = useMemo(() => {
    const map = new Map<string, string>();
    myTasks.filter(t => !['aprovado'].includes(t.kanban_column)).forEach(t => {
      if (t.clients?.company_name) map.set(t.client_id, t.clients.company_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [myTasks]);

  const recentCompleted = useMemo(() => {
    return tasks
      .filter(t => t.kanban_column === 'aprovado' && t.assigned_to === user?.id)
      .sort((a, b) => new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime())
      .slice(0, 5);
  }, [tasks, user?.id]);

  const getTasksForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return myTasks.filter(t => {
      if (t.kanban_column === 'aprovado') return t.completed_at?.startsWith(dateStr);
      if (t.kanban_column === 'executando' && t.started_at) return t.started_at.startsWith(dateStr);
      return t.created_at?.startsWith(dateStr) && !['aprovado'].includes(t.kanban_column);
    });
  };

  const formatTime = (seconds: number) => {
    if (seconds === 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}min`;
  };

  const displayName = currentUser?.displayName || currentUser?.name || 'Designer';
  const firstName = displayName.split(' ')[0];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <BonusCongratsBanner />

      {/* ═══ HEADER ═══ */}
      <motion.div {...fadeUp} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            Olá, {firstName}
            <motion.span
              animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              className="inline-block"
            >💜</motion.span>
          </h1>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5">
            <Sparkles size={14} className="text-violet-400" />
            {format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-lg shadow-violet-300/40 dark:shadow-violet-900/30 font-semibold"
          >
            <Plus size={14} /> Nova Demanda ✨
          </Button>
        </motion.div>
      </motion.div>

      {/* ═══ STATS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Na Fila', value: stats.totalActive, icon: Palette, gradient: 'from-violet-500/15 to-fuchsia-500/10', iconColor: 'text-violet-500' },
          { label: 'Atrasadas', value: stats.overdue, icon: AlertTriangle, gradient: stats.overdue > 0 ? 'from-rose-500/15 to-red-500/10' : 'from-muted to-muted', iconColor: stats.overdue > 0 ? 'text-rose-500' : 'text-muted-foreground' },
          { label: 'Clientes', value: stats.uniqueClients, icon: Heart, gradient: 'from-pink-500/15 to-rose-500/10', iconColor: 'text-pink-500' },
          { label: 'Concluídas', value: stats.completedThisMonth, icon: TrendingUp, gradient: 'from-emerald-500/15 to-teal-500/10', iconColor: 'text-emerald-500' },
          { label: 'Tempo Médio', value: formatTime(stats.avgTime), icon: Timer, gradient: 'from-amber-500/15 to-orange-500/10', iconColor: 'text-amber-500' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
            className={`rounded-2xl border border-pink-200/30 dark:border-pink-800/20 p-4 bg-gradient-to-br ${s.gradient} hover:shadow-lg hover:shadow-pink-200/20 transition-all duration-300 cursor-default`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 bg-white/60 dark:bg-white/10 shadow-sm ${s.iconColor}`}>
              <s.icon size={18} />
            </div>
            <p className="text-2xl font-display font-bold">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ═══ SPOTLIGHT: Tarefa Ativa Agora ═══ */}
      <AnimatePresence mode="popLayout">
        {groupedQueue.active && (() => {
          const t = groupedQueue.active;
          const arts: string[] = Array.from(new Set([
            ...(((t as any).attachment_urls as string[]) || []),
            t.attachment_url,
          ].filter(Boolean) as string[]));
          const ds = getDesignDeadlineStatus(t);
          const isPaused = !t.timer_running && !!t.started_at;
          const clientName = t.clients?.company_name || t.prospect_name || '—';
          const clientColor = t.clients?.color || '270 70% 55%';
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="relative overflow-hidden rounded-3xl border-2 border-violet-400/50 dark:border-violet-500/40 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/8 to-pink-500/10 dark:from-violet-950/40 dark:via-fuchsia-950/30 dark:to-pink-950/30 p-6 shadow-2xl shadow-violet-400/20"
            >
              {/* pulsing halo */}
              <motion.div
                animate={{ opacity: [0.25, 0.5, 0.25] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className="pointer-events-none absolute -top-32 -right-32 w-80 h-80 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400 blur-3xl"
              />

              <div className="relative flex flex-col lg:flex-row gap-6">
                {/* LEFT — info + actions */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <motion.span
                      animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isPaused ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {isPaused ? '⏸ Pausada' : '🎨 Executando ao vivo'}
                    </span>
                    <Badge className="text-[10px] bg-violet-500/15 text-violet-700 dark:text-violet-300 border-0 rounded-full">
                      Prioridade {t.priority}
                    </Badge>
                    <Badge
                      variant={ds.variant === 'destructive' ? 'destructive' : 'secondary'}
                      className="text-[10px] rounded-full"
                    >
                      <Clock size={10} className="mr-1" /> {ds.label}
                    </Badge>
                  </div>

                  <div className="flex items-start gap-4 mb-4">
                    <ClientLogo client={{ companyName: clientName, color: clientColor, logoUrl: t.clients?.logo_url }} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground font-medium">{clientName}</p>
                      <h2 className="text-2xl md:text-3xl font-display font-bold leading-tight break-words">
                        {t.title}
                      </h2>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Palette size={12} /> {FORMAT_LABELS[t.format_type] || t.format_type}</span>
                        {activeElapsed && (
                          <span className="flex items-center gap-1 font-mono font-semibold text-violet-600 dark:text-violet-400">
                            <Timer size={12} /> {activeElapsed} em execução
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => setCopyDialogTask(t)}
                      className="gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md"
                    >
                      <FileText size={14} /> Ver copy
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setSelectedTaskId(t.id)}
                      className="gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-600 hover:to-pink-600 text-white shadow-md"
                    >
                      <Upload size={14} /> Anexar / trocar arte
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedTaskId(t.id)}
                      className="gap-1.5 rounded-xl border-violet-300/50"
                    >
                      <Send size={14} /> Enviar p/ análise
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedTaskId(t.id)}
                      className="gap-1.5 rounded-xl"
                    >
                      Abrir demanda <ArrowRight size={14} />
                    </Button>
                  </div>

                  {/* SLA bar */}
                  <div className="mt-4">
                    <Progress
                      value={ds.progress}
                      className={`h-1.5 rounded-full [&>div]:bg-gradient-to-r ${
                        ds.variant === 'destructive' ? '[&>div]:from-rose-500 [&>div]:to-red-500' :
                        ds.variant === 'warning' ? '[&>div]:from-amber-500 [&>div]:to-orange-500' :
                        '[&>div]:from-violet-500 [&>div]:to-fuchsia-500'
                      }`}
                    />
                  </div>
                </div>

                {/* RIGHT — arts preview */}
                <div className="w-full lg:w-[280px] shrink-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Sparkles size={11} className="text-violet-500" />
                    {t.kanban_column === 'ajustes' ? 'Arte da revisão' : 'Artes anexadas'} ({arts.length})
                  </p>
                  {arts.length === 0 ? (
                    <button
                      onClick={() => setSelectedTaskId(t.id)}
                      className="w-full h-40 rounded-2xl border-2 border-dashed border-violet-300/50 hover:border-violet-500 bg-violet-50/30 dark:bg-violet-950/20 flex flex-col items-center justify-center gap-2 text-violet-600 hover:bg-violet-100/40 transition-colors"
                    >
                      <Upload size={22} />
                      <span className="text-xs font-semibold">Anexar primeira arte</span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {arts.slice(0, 4).map((url, i) => {
                        const isImg = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(url);
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedTaskId(t.id)}
                            className="relative group rounded-xl overflow-hidden border border-violet-200/40 aspect-square bg-muted/30 hover:ring-2 hover:ring-violet-500/50 transition-all"
                          >
                            {isImg ? (
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FileText size={22} className="text-muted-foreground" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                              <ZoomIn size={16} className="text-white" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {arts.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedTaskId(t.id)}
                      className="w-full mt-2 gap-1.5 rounded-xl text-xs text-violet-600 hover:bg-violet-100/40"
                    >
                      <RotateCcw size={12} /> Substituir arte
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ═══ Filtros globais ═══ */}
      <motion.div {...fadeUp} transition={{ delay: 0.15 }} className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400" />
          <Input
            placeholder="Buscar tarefa ou cliente... 🔍"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-9 pl-9 text-xs rounded-xl border-pink-200/40 focus:border-violet-400"
          />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="h-9 w-[160px] text-xs rounded-xl border-pink-200/40">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos 💖</SelectItem>
            {activeClients.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-9 w-[130px] text-xs rounded-xl border-pink-200/40">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="urgente">🔥 Urgente</SelectItem>
            <SelectItem value="alta">⚡ Alta</SelectItem>
            <SelectItem value="media">💜 Média</SelectItem>
            <SelectItem value="baixa">🌿 Baixa</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* ═══ SECTIONS: Revisão · Fila · Baixa Prioridade · Cliente ═══ */}
      {(() => {
        const sections: { key: string; title: string; emoji: string; hint: string; tone: string; items: DesignTask[] }[] = [
          {
            key: 'revisao',
            title: 'Em revisão',
            emoji: '🔄',
            hint: 'Ajustes pedidos ou aguardando análise — resolva primeiro para desbloquear a esteira.',
            tone: 'from-rose-500/10 to-orange-500/10 border-rose-300/40',
            items: groupedQueue.revisao,
          },
          {
            key: 'fila',
            title: 'Fila',
            emoji: '✨',
            hint: 'Próximas demandas para iniciar. SLA de até 72h após criação.',
            tone: 'from-violet-500/10 to-fuchsia-500/10 border-violet-300/40',
            items: groupedQueue.fila,
          },
          {
            key: 'baixa',
            title: 'Fila baixa prioridade',
            emoji: '🌙',
            hint: 'Tarefas pausadas para dar prioridade a outra. Retome assim que possível.',
            tone: 'from-slate-500/10 to-slate-600/10 border-slate-300/40',
            items: groupedQueue.filaBaixa,
          },
          {
            key: 'cliente',
            title: 'Aguardando cliente',
            emoji: '💌',
            hint: 'Já enviadas — aguardando aprovação do cliente.',
            tone: 'from-cyan-500/10 to-teal-500/10 border-cyan-300/40',
            items: groupedQueue.cliente,
          },
        ];
        const allEmpty = sections.every(s => s.items.length === 0) && !groupedQueue.active;
        if (allEmpty) {
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border-2 border-dashed border-pink-200/40 p-16 flex flex-col items-center justify-center text-muted-foreground"
            >
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                <Heart size={48} className="text-pink-300 mb-3" />
              </motion.div>
              <p className="text-base font-display font-semibold">Tudo em dia! 🎉</p>
              <p className="text-xs text-muted-foreground mt-1">Nenhuma tarefa pendente. Aproveite o momento ☕</p>
            </motion.div>
          );
        }
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sections.map((s, si) => (
              <motion.div
                key={s.key}
                {...fadeUp}
                transition={{ delay: 0.2 + si * 0.05 }}
                className={`rounded-2xl border-2 bg-gradient-to-br ${s.tone} p-4`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
                      <span className="text-base">{s.emoji}</span> {s.title}
                      <Badge className="text-[10px] bg-background/60 text-foreground border-0 rounded-full ml-1">{s.items.length}</Badge>
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.hint}</p>
                  </div>
                </div>
                {s.items.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-muted-foreground italic">Nada por aqui 🌸</div>
                ) : (
                  <div className="max-h-[380px] overflow-y-auto pr-1 space-y-2" style={{ scrollbarWidth: 'thin' }}>
                    <AnimatePresence mode="popLayout">
                      {s.items.map((task, i) => (
                        <DesignerTaskCard key={task.id} task={task} index={i} onOpenDetail={setSelectedTaskId} />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        );
      })()}


      {/* ═══ BOTTOM: Performance + Week ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Performance */}
        <motion.div {...fadeUp} transition={{ delay: 0.3 }} className="rounded-2xl border border-pink-200/40 dark:border-pink-800/20 bg-gradient-to-br from-card to-pink-50/20 dark:to-pink-950/10 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
              <BarChart3 size={14} className="text-white" />
            </div>
            <h3 className="font-display font-bold text-sm">Meu Desempenho 💪</h3>
          </div>

          <div className="space-y-4">
            {/* Score */}
            <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 border border-violet-200/30 dark:border-violet-800/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Star size={14} className="text-violet-500" /> Pontuação
                </span>
                <span className="text-2xl font-display font-bold text-violet-600 dark:text-violet-400">{stats.designerScore}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <span>Concluídos: <strong className="text-foreground">{stats.scoringCompleted}</strong></span>
                <span>Horas: <strong className="text-foreground">{stats.scoringHours}h</strong></span>
              </div>
            </div>

            {/* Week progress */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Semana</span>
                <span className="font-bold text-violet-600 dark:text-violet-400">{stats.completedThisWeek} artes</span>
              </div>
              <Progress value={stats.completedThisWeek > 0 ? Math.min((stats.completedThisWeek / 20) * 100, 100) : 0} className="h-2 rounded-full [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-fuchsia-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { v: stats.uniqueClients, l: 'Clientes', emoji: '💖' },
                { v: stats.completedThisMonth, l: 'Artes (mês)', emoji: '🎨' },
                { v: formatTime(stats.avgTime), l: 'Tempo médio', emoji: '⏱' },
                { v: formatTime(stats.totalTime), l: 'Tempo total', emoji: '🕐' },
              ].map(s => (
                <div key={s.l} className="rounded-xl bg-violet-50/50 dark:bg-violet-950/10 border border-violet-200/20 p-3 text-center">
                  <p className="text-lg font-display font-bold">{s.v}</p>
                  <p className="text-[10px] text-muted-foreground">{s.emoji} {s.l}</p>
                </div>
              ))}
            </div>

            {/* Urgent alert */}
            {stats.urgent > 0 && (
              <motion.div
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200/40 dark:border-rose-800/20 rounded-xl p-3"
              >
                <div className="flex items-center gap-2">
                  <Flame size={14} className="text-rose-500" />
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400">{stats.urgent} urgente{stats.urgent > 1 ? 's' : ''} 🔥</span>
                </div>
              </motion.div>
            )}

            {/* Recent completed */}
            {recentCompleted.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CheckCircle size={12} className="text-emerald-500" /> Últimas Aprovadas 💖
                </p>
                <div className="space-y-1.5">
                  {recentCompleted.map(t => (
                    <motion.div key={t.id}
                      whileHover={{ x: 4 }}
                      onClick={() => setSelectedTaskId(t.id)}
                      className="flex items-center gap-2 p-2 rounded-xl hover:bg-violet-50/50 dark:hover:bg-violet-950/10 cursor-pointer transition-colors">
                      <ClientLogo client={{ companyName: t.clients?.company_name || '', color: t.clients?.color || '217 91% 60%', logoUrl: t.clients?.logo_url }} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium truncate">{t.title}</p>
                        <p className="text-[9px] text-muted-foreground">{t.time_spent_seconds > 0 && formatTime(t.time_spent_seconds)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Weekly view */}
        <motion.div {...fadeUp} transition={{ delay: 0.4 }} className="lg:col-span-2 rounded-2xl border border-pink-200/40 dark:border-pink-800/20 bg-gradient-to-br from-card to-fuchsia-50/10 dark:to-fuchsia-950/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-500 flex items-center justify-center">
              <CalendarDays size={14} className="text-white" />
            </div>
            <h3 className="font-display font-bold text-sm">Minha Semana 📅</h3>
          </div>

          <div className="grid grid-cols-5 gap-2 min-h-[300px]">
            {weekDays.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isToday = isSameDay(day, today);
              const dayTasks = getTasksForDay(day);
              return (
                <motion.div
                  key={dateStr}
                  whileHover={{ y: -2 }}
                  className={`rounded-xl border p-3 transition-all ${
                    isToday
                      ? 'border-violet-300/60 bg-violet-50/30 dark:bg-violet-950/10 shadow-md shadow-violet-200/20'
                      : 'border-pink-200/20 dark:border-pink-800/10 bg-card/50'
                  }`}
                >
                  <div className="text-center mb-3">
                    <p className={`text-xs font-semibold uppercase ${isToday ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'}`}>
                      {format(day, 'EEE', { locale: ptBR })}
                    </p>
                    <p className={`text-lg font-display font-bold ${isToday ? 'text-violet-600 dark:text-violet-400' : ''}`}>
                      {format(day, 'd')}
                    </p>
                    {isToday && <div className="w-5 h-0.5 rounded-full bg-violet-500 mx-auto mt-1" />}
                  </div>
                  <div className="space-y-1.5">
                    {dayTasks.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-4 italic">Livre 🌸</p>
                    )}
                    {dayTasks.slice(0, 5).map(task => {
                      const taskColor = task.clients?.color || '217 91% 60%';
                      const isApproved = task.kanban_column === 'aprovado';
                      const ds = getDesignDeadlineStatus(task);
                      return (
                        <motion.div
                          key={task.id}
                          whileHover={{ scale: 1.03 }}
                          onClick={() => setSelectedTaskId(task.id)}
                          className={`rounded-lg border p-2 text-[10px] cursor-pointer transition-all ${
                            isApproved ? 'border-emerald-200/40 bg-emerald-50/30 dark:bg-emerald-950/10 opacity-70' :
                            ds.variant === 'destructive' ? 'border-rose-200/40 bg-rose-50/30 dark:bg-rose-950/10' :
                            'border-pink-200/20 bg-card hover:border-violet-300/40'
                          }`}
                          style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${taskColor})` }}
                        >
                          <p className="font-medium truncate">{task.clients?.company_name || '—'}</p>
                          <p className="text-muted-foreground truncate">{task.title}</p>
                          {isApproved && <span className="text-emerald-500">✓ Aprovado</span>}
                        </motion.div>
                      );
                    })}
                    {dayTasks.length > 5 && (
                      <p className="text-[10px] text-violet-500 text-center font-medium">+{dayTasks.length - 5} mais</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Clients */}
      {stats.byClient.length > 0 && (
        <motion.div {...fadeUp} transition={{ delay: 0.5 }} className="rounded-2xl border border-pink-200/40 dark:border-pink-800/20 bg-gradient-to-br from-card to-rose-50/10 dark:to-rose-950/5 p-5">
          <h3 className="font-display font-bold text-sm mb-4 flex items-center gap-2">
            <Target size={16} className="text-pink-500" /> Clientes Ativos 💖
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {stats.byClient.map(c => (
              <motion.div
                key={c.name}
                whileHover={{ y: -4, scale: 1.03 }}
                className="rounded-xl border border-pink-200/30 dark:border-pink-800/15 bg-card p-3 text-center space-y-2 hover:shadow-lg hover:shadow-pink-200/20 transition-all cursor-default"
              >
                <ClientLogo client={{ companyName: c.name, color: c.color, logoUrl: c.logoUrl }} size="md" />
                <p className="text-xs font-medium truncate">{c.name}</p>
                <Badge className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-0 rounded-full">{c.count} demandas</Badge>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {selectedTask && (
        <DesignTaskDetailSheet task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTaskId(null)} />
      )}
      <DesignTaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Copy preview dialog */}
      <Dialog open={!!copyDialogTask} onOpenChange={o => !o && setCopyDialogTask(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText size={16} className="text-violet-500" />
              Copy — {copyDialogTask?.title}
            </DialogTitle>
          </DialogHeader>
          {copyDialogTask?.copy_text ? (
            <div className="rounded-xl bg-muted/40 border border-border p-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{copyDialogTask.copy_text}</p>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <FileText size={28} className="mx-auto text-muted-foreground/40 mb-2" />
              Ainda não há copy para esta demanda.
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            {copyDialogTask?.copy_text && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(copyDialogTask.copy_text || '');
                  toast.success('Copy copiada!');
                }}
                className="gap-1.5 rounded-xl"
              >
                Copiar texto
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                if (copyDialogTask) setSelectedTaskId(copyDialogTask.id);
                setCopyDialogTask(null);
              }}
              className="gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
            >
              Abrir demanda <ArrowRight size={12} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

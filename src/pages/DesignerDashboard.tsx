import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask } from '@/hooks/useDesignTasks';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import ClientLogo from '@/components/ClientLogo';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';
import { motion } from 'framer-motion';
import {
  Palette, CheckCircle, Clock, AlertTriangle, ArrowRight,
  Play, Eye, RotateCcw, Kanban, BarChart3, LayoutDashboard,
  TrendingUp, Zap, Timer, ListChecks, Building2, CalendarDays,
  Flame, Target, Award, FileText, Send
} from 'lucide-react';

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  media: { label: 'Média', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-500' },
  alta: { label: 'Alta', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500' },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 animate-pulse', dot: 'bg-red-500' },
};

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed', story: 'Story', logomarca: 'Logomarca', midia_fisica: 'Mídia Física',
};

export default function DesignerDashboard() {
  const { tasksQuery } = useDesignTasks();
  const { user } = useAuth();
  const { currentUser, clients } = useApp();
  const navigate = useNavigate();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('visao-geral');

  const tasks = tasksQuery.data || [];
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  const myTasks = useMemo(() => {
    if (!user?.id) return tasks;
    if (currentUser?.role === 'admin') return tasks;
    return tasks.filter(t => t.assigned_to === user.id || !t.assigned_to);
  }, [tasks, user?.id, currentUser?.role]);

  const stats = useMemo(() => {
    const myAssigned = tasks.filter(t => t.assigned_to === user?.id);
    const pending = myTasks.filter(t => t.kanban_column === 'nova_tarefa');
    const inProgress = myTasks.filter(t => t.kanban_column === 'executando');
    const inReview = myTasks.filter(t => t.kanban_column === 'em_analise');
    const adjustments = myTasks.filter(t => t.kanban_column === 'ajustes');
    const sentToClient = myTasks.filter(t => t.kanban_column === 'enviar_cliente');
    const completed = myAssigned.filter(t => t.kanban_column === 'aprovado');
    const urgent = myTasks.filter(t => t.priority === 'urgente' && !['aprovado'].includes(t.kanban_column));
    const highPriority = myTasks.filter(t => t.priority === 'alta' && !['aprovado'].includes(t.kanban_column));

    const completedWithTime = completed.filter(t => t.time_spent_seconds > 0);
    const avgTime = completedWithTime.length > 0
      ? completedWithTime.reduce((s, t) => s + t.time_spent_seconds, 0) / completedWithTime.length
      : 0;

    // Fastest and slowest
    const fastest = completedWithTime.length > 0
      ? Math.min(...completedWithTime.map(t => t.time_spent_seconds))
      : 0;
    const slowest = completedWithTime.length > 0
      ? Math.max(...completedWithTime.map(t => t.time_spent_seconds))
      : 0;

    const todayStr = new Date().toISOString().split('T')[0];
    const completedToday = completed.filter(t => t.completed_at?.startsWith(todayStr));
    const createdToday = myTasks.filter(t => t.created_at?.startsWith(todayStr));

    // This week
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const completedThisWeek = completed.filter(t => new Date(t.completed_at || t.updated_at) >= weekStart);

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const completedThisMonth = completed.filter(t => new Date(t.completed_at || t.updated_at) >= monthStart);

    // By client
    const byClient: Record<string, { name: string; count: number; color: string; logoUrl: string | null }> = {};
    myTasks.filter(t => !['aprovado'].includes(t.kanban_column)).forEach(t => {
      const cid = t.client_id;
      if (!byClient[cid]) {
        byClient[cid] = {
          name: t.clients?.company_name || '—',
          count: 0,
          color: t.clients?.color || '217 91% 60%',
          logoUrl: t.clients?.logo_url || null,
        };
      }
      byClient[cid].count++;
    });

    return {
      pending: pending.length,
      inProgress: inProgress.length,
      inReview: inReview.length,
      adjustments: adjustments.length,
      sentToClient: sentToClient.length,
      completed: completed.length,
      urgent: urgent.length,
      highPriority: highPriority.length,
      avgTime,
      fastest,
      slowest,
      completedToday: completedToday.length,
      createdToday: createdToday.length,
      completedThisWeek: completedThisWeek.length,
      completedThisMonth: completedThisMonth.length,
      totalActive: pending.length + inProgress.length + adjustments.length,
      byClient: Object.values(byClient).sort((a, b) => b.count - a.count),
    };
  }, [myTasks, tasks, user?.id]);

  // Urgent + adjustments first
  const urgentTasks = useMemo(() => {
    return myTasks
      .filter(t => (t.priority === 'urgente' || t.priority === 'alta') && !['aprovado'].includes(t.kanban_column))
      .sort((a, b) => {
        if (a.priority === 'urgente' && b.priority !== 'urgente') return -1;
        if (b.priority === 'urgente' && a.priority !== 'urgente') return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }, [myTasks]);

  const adjustmentTasks = useMemo(() => {
    return myTasks.filter(t => t.kanban_column === 'ajustes');
  }, [myTasks]);

  const todayTasks = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return myTasks.filter(t => 
      ['nova_tarefa', 'executando', 'ajustes'].includes(t.kanban_column) &&
      (t.created_at?.startsWith(todayStr) || t.kanban_column === 'executando' || t.kanban_column === 'ajustes')
    ).sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
      const colOrder: Record<string, number> = { ajustes: 0, executando: 1, nova_tarefa: 2 };
      const colA = colOrder[a.kanban_column] ?? 9;
      const colB = colOrder[b.kanban_column] ?? 9;
      if (colA !== colB) return colA - colB;
      return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
    });
  }, [myTasks]);

  const actionableTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
    const columnOrder: Record<string, number> = { ajustes: 0, executando: 1, nova_tarefa: 2 };
    return myTasks
      .filter(t => ['nova_tarefa', 'executando', 'ajustes'].includes(t.kanban_column))
      .sort((a, b) => {
        const colA = columnOrder[a.kanban_column] ?? 9;
        const colB = columnOrder[b.kanban_column] ?? 9;
        if (colA !== colB) return colA - colB;
        return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
      });
  }, [myTasks]);

  const recentCompleted = useMemo(() => {
    return tasks
      .filter(t => t.kanban_column === 'aprovado' && t.assigned_to === user?.id)
      .sort((a, b) => new Date(b.completed_at || b.updated_at).getTime() - new Date(a.completed_at || a.updated_at).getTime())
      .slice(0, 8);
  }, [tasks, user?.id]);

  const formatTime = (seconds: number) => {
    if (seconds === 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}min`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Palette size={24} className="text-primary" />
            Painel do Designer
          </h1>
          <p className="text-sm text-muted-foreground">
            Olá, {currentUser?.displayName || currentUser?.name}! Aqui está seu painel de trabalho.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/clientes')} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Building2 size={14} /> Clientes
          </Button>
          <Button onClick={() => navigate('/designer')} variant="outline" size="sm" className="gap-1.5 text-xs">
            <Kanban size={14} /> Kanban
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="visao-geral" className="text-xs gap-1.5">
            <LayoutDashboard size={14} /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="minhas-tarefas" className="text-xs gap-1.5">
            <ListChecks size={14} /> Minhas Tarefas
          </TabsTrigger>
          <TabsTrigger value="desempenho" className="text-xs gap-1.5">
            <BarChart3 size={14} /> Desempenho
          </TabsTrigger>
        </TabsList>

        {/* ========== VISÃO GERAL ========== */}
        <TabsContent value="visao-geral" className="space-y-4 mt-4">
          {/* Row 1: Main KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={Zap} label="Novas" value={stats.pending} color="217 91% 60%" iconColor="text-blue-600" bgColor="bg-blue-100 dark:bg-blue-900/30" />
            <KpiCard icon={Play} label="Executando" value={stats.inProgress} color="45 93% 47%" iconColor="text-amber-600" bgColor="bg-amber-100 dark:bg-amber-900/30" />
            <KpiCard icon={RotateCcw} label="Ajustes" value={stats.adjustments} color="0 72% 51%" iconColor="text-red-600" bgColor="bg-red-100 dark:bg-red-900/30" />
            <KpiCard icon={Eye} label="Em Análise" value={stats.inReview} color="262 83% 58%" iconColor="text-purple-600" bgColor="bg-purple-100 dark:bg-purple-900/30" />
            <KpiCard icon={Send} label="P/ Cliente" value={stats.sentToClient} color="187 85% 43%" iconColor="text-teal-600" bgColor="bg-teal-100 dark:bg-teal-900/30" />
            <KpiCard icon={CheckCircle} label="Aprovadas" value={stats.completed} color="142 71% 45%" iconColor="text-emerald-600" bgColor="bg-emerald-100 dark:bg-emerald-900/30" />
          </div>

          {/* Row 2: Performance summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Timer size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold">{formatTime(stats.avgTime)}</p>
                  <p className="text-[10px] text-muted-foreground">Tempo Médio/Arte</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <CalendarDays size={18} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{stats.completedToday}</p>
                  <p className="text-[10px] text-muted-foreground">Concluídas Hoje</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Target size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{stats.completedThisWeek}</p>
                  <p className="text-[10px] text-muted-foreground">Essa Semana</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Award size={18} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-lg font-bold">{stats.completedThisMonth}</p>
                  <p className="text-[10px] text-muted-foreground">Esse Mês</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Urgent + Adjustments alerts */}
          {(stats.urgent > 0 || stats.adjustments > 0) && (
            <div className="grid md:grid-cols-2 gap-3">
              {stats.urgent > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Flame size={18} className="text-red-600" />
                    <span className="text-sm font-bold text-red-700 dark:text-red-400">
                      {stats.urgent} Urgente{stats.urgent > 1 ? 's' : ''} {stats.highPriority > 0 ? `+ ${stats.highPriority} Alta${stats.highPriority > 1 ? 's' : ''}` : ''}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {urgentTasks.slice(0, 3).map(t => (
                      <div key={t.id} onClick={() => setSelectedTaskId(t.id)}
                        className="flex items-center gap-2 text-xs p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 cursor-pointer transition-colors">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === 'urgente' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                        <ClientLogo client={{ companyName: t.clients?.company_name || '', color: t.clients?.color || '217 91% 60%', logoUrl: t.clients?.logo_url }} size="sm" />
                        <span className="truncate font-medium">{t.title}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
              {stats.adjustments > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <RotateCcw size={18} className="text-orange-600" />
                    <span className="text-sm font-bold text-orange-700 dark:text-orange-400">
                      {stats.adjustments} Ajuste{stats.adjustments > 1 ? 's' : ''} Pendente{stats.adjustments > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {adjustmentTasks.slice(0, 3).map(t => (
                      <div key={t.id} onClick={() => setSelectedTaskId(t.id)}
                        className="flex items-center gap-2 text-xs p-1.5 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/20 cursor-pointer transition-colors">
                        <RotateCcw size={10} className="text-orange-500 shrink-0" />
                        <ClientLogo client={{ companyName: t.clients?.company_name || '', color: t.clients?.color || '217 91% 60%', logoUrl: t.clients?.logo_url }} size="sm" />
                        <span className="truncate font-medium">{t.title}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}

          <div className="grid lg:grid-cols-5 gap-4">
            {/* Left: Today's work queue */}
            <div className="lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <CalendarDays size={15} className="text-primary" /> Tarefas do Dia
                </h2>
                <Badge variant="secondary" className="text-xs">{todayTasks.length} tarefas</Badge>
              </div>

              <ScrollArea className="h-[380px]">
                <div className="space-y-2 pr-2">
                  {todayTasks.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle size={40} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma tarefa para hoje! 🎉</p>
                      <p className="text-xs mt-1">Verifique o Kanban para novas demandas</p>
                    </div>
                  )}
                  {todayTasks.map((task, i) => (
                    <motion.div key={task.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                      <TaskRow task={task} onClick={() => setSelectedTaskId(task.id)} />
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Right: Pipeline + clients + recent */}
            <div className="lg:col-span-2 space-y-4">
              {/* Pipeline */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp size={15} /> Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {DESIGN_COLUMNS.filter(c => c.key !== 'aprovado').map(col => {
                    const count = myTasks.filter(t => t.kanban_column === col.key).length;
                    const max = Math.max(...DESIGN_COLUMNS.map(c => myTasks.filter(t => t.kanban_column === c.key).length), 1);
                    return (
                      <div key={col.key}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${col.color})` }} />
                            <span className="text-[11px] text-muted-foreground">{col.label}</span>
                          </div>
                          <span className="text-[11px] font-semibold">{count}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${(count / max) * 100}%`, backgroundColor: `hsl(${col.color})` }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Demandas por cliente */}
              {stats.byClient.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 size={15} /> Demandas por Cliente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {stats.byClient.slice(0, 5).map(c => (
                      <div key={c.name} className="flex items-center gap-2">
                        <ClientLogo client={{ companyName: c.name, color: c.color, logoUrl: c.logoUrl }} size="sm" />
                        <span className="text-xs flex-1 truncate">{c.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{c.count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recent completed */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle size={15} className="text-emerald-500" /> Recém Concluídas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {recentCompleted.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhuma tarefa concluída ainda</p>
                  )}
                  {recentCompleted.slice(0, 5).map(task => (
                    <div key={task.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedTaskId(task.id)}>
                      <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium truncate">{task.title}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {task.completed_at ? new Date(task.completed_at).toLocaleDateString('pt-BR') : ''}
                          {task.time_spent_seconds > 0 && ` · ${formatTime(task.time_spent_seconds)}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ========== MINHAS TAREFAS ========== */}
        <TabsContent value="minhas-tarefas" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Todas as tarefas atribuídas a mim</h2>
            <Button size="sm" variant="outline" onClick={() => navigate('/designer')} className="gap-1.5 text-xs">
              <Kanban size={14} /> Ver Kanban
            </Button>
          </div>

          {DESIGN_COLUMNS.map(col => {
            const colTasks = myTasks.filter(t => t.kanban_column === col.key);
            if (colTasks.length === 0) return null;
            return (
              <div key={col.key}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${col.color})` }} />
                  <span className="text-xs font-semibold uppercase tracking-wide">{col.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-5">{colTasks.length}</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {colTasks.map(task => (
                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* ========== DESEMPENHO ========== */}
        <TabsContent value="desempenho" className="mt-4">
          <DesignerPerformance tasks={tasks} userId={user?.id} />
        </TabsContent>
      </Tabs>

      {selectedTask && (
        <DesignTaskDetailSheet task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTaskId(null)} />
      )}
    </div>
  );
}

/* ==================== Sub-components ==================== */

function KpiCard({ icon: Icon, label, value, color, iconColor, bgColor }: {
  icon: any; label: string; value: number; color: string; iconColor: string; bgColor: string;
}) {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: `hsl(${color})` }}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
          <div className={`h-8 w-8 rounded-lg ${bgColor} flex items-center justify-center`}>
            <Icon size={16} className={iconColor} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskRow({ task, onClick }: { task: DesignTask; onClick: () => void }) {
  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
  const col = DESIGN_COLUMNS.find(c => c.key === task.kanban_column);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer group"
    >
      <ClientLogo
        client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {task.kanban_column === 'ajustes' && <RotateCcw size={12} className="text-red-500 shrink-0" />}
          {task.kanban_column === 'executando' && <Play size={12} className="text-amber-500 shrink-0" />}
          {task.priority === 'urgente' && <Flame size={12} className="text-red-500 shrink-0 animate-pulse" />}
          <p className="text-sm font-medium truncate">{task.title}</p>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{task.clients?.company_name}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant="outline" className="text-[9px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge>
        <Badge className={`text-[9px] ${p.color}`}>{p.label}</Badge>
        {col && (
          <Badge className="text-[9px] border-0" style={{ backgroundColor: `hsl(${col.color})`, color: 'white' }}>
            {col.label}
          </Badge>
        )}
      </div>
      <ArrowRight size={14} className="text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
    </div>
  );
}

function TaskCard({ task, onClick }: { task: DesignTask; onClick: () => void }) {
  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
  const formatTime = (s: number) => {
    if (s === 0) return null;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}min`;
  };
  return (
    <Card className="hover:shadow-md transition-all cursor-pointer group" onClick={onClick}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <ClientLogo
            client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }}
            size="sm"
          />
          <span className="text-[11px] text-muted-foreground truncate flex-1">{task.clients?.company_name}</span>
          {task.priority === 'urgente' && <Flame size={12} className="text-red-500 animate-pulse shrink-0" />}
        </div>
        <p className="text-sm font-medium line-clamp-2">{task.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[9px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge>
          <Badge className={`text-[9px] ${p.color}`}>{p.label}</Badge>
          {task.timer_running && (
            <Badge variant="secondary" className="text-[9px] gap-0.5"><Clock size={10} /> Ativo</Badge>
          )}
          {task.time_spent_seconds > 0 && !task.timer_running && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={9} /> {formatTime(task.time_spent_seconds)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DesignerPerformance({ tasks, userId }: { tasks: DesignTask[]; userId?: string }) {
  const myCompleted = useMemo(() => {
    return tasks.filter(t => t.assigned_to === userId && t.kanban_column === 'aprovado');
  }, [tasks, userId]);

  const weeklyData = useMemo(() => {
    const now = new Date();
    const weeks: { label: string; count: number; timeTotal: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() - (i * 7));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const weekTasks = myCompleted.filter(t => {
        const d = new Date(t.completed_at || t.updated_at);
        return d >= weekStart && d < weekEnd;
      });
      weeks.push({
        label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
        count: weekTasks.length,
        timeTotal: weekTasks.reduce((s, t) => s + (t.time_spent_seconds || 0), 0),
      });
    }
    return weeks;
  }, [myCompleted]);

  const byFormat = useMemo(() => {
    const map: Record<string, number> = {};
    myCompleted.forEach(t => {
      const label = FORMAT_LABELS[t.format_type] || t.format_type;
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [myCompleted]);

  const byClient = useMemo(() => {
    const map: Record<string, { name: string; count: number; color: string; logoUrl: string | null }> = {};
    myCompleted.forEach(t => {
      const key = t.client_id;
      if (!map[key]) map[key] = { name: t.clients?.company_name || '—', count: 0, color: t.clients?.color || '217 91% 60%', logoUrl: t.clients?.logo_url || null };
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [myCompleted]);

  const totalTime = myCompleted.reduce((s, t) => s + (t.time_spent_seconds || 0), 0);
  const completedWithTime = myCompleted.filter(t => t.time_spent_seconds > 0);
  const avgTime = completedWithTime.length > 0 ? totalTime / completedWithTime.length : 0;
  const fastest = completedWithTime.length > 0 ? Math.min(...completedWithTime.map(t => t.time_spent_seconds)) : 0;
  const slowest = completedWithTime.length > 0 ? Math.max(...completedWithTime.map(t => t.time_spent_seconds)) : 0;

  const formatTime = (s: number) => {
    if (s === 0) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}min`;
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle size={20} className="mx-auto mb-1 text-emerald-500" />
            <p className="text-2xl font-bold">{myCompleted.length}</p>
            <p className="text-xs text-muted-foreground">Total Concluídas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Timer size={20} className="mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{formatTime(avgTime)}</p>
            <p className="text-xs text-muted-foreground">Tempo Médio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Zap size={20} className="mx-auto mb-1 text-emerald-500" />
            <p className="text-2xl font-bold">{formatTime(fastest)}</p>
            <p className="text-xs text-muted-foreground">Mais Rápida</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock size={20} className="mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{formatTime(totalTime)}</p>
            <p className="text-xs text-muted-foreground">Tempo Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp size={20} className="mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{weeklyData[weeklyData.length - 1]?.count || 0}</p>
            <p className="text-xs text-muted-foreground">Esta Semana</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Weekly progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Produção Semanal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {weeklyData.map((w, i) => {
                const max = Math.max(...weeklyData.map(x => x.count), 1);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Semana {w.label}</span>
                      <span className="text-xs font-semibold">{w.count} artes</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(w.count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* By format */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por Formato</CardTitle>
          </CardHeader>
          <CardContent>
            {byFormat.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Sem dados ainda</p>
            ) : (
              <div className="space-y-3">
                {byFormat.map((f, idx) => {
                  const max = Math.max(...byFormat.map(x => x.value), 1);
                  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'];
                  return (
                    <div key={f.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{f.name}</span>
                        <span className="text-xs font-semibold">{f.value}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors[idx % colors.length]} transition-all`} style={{ width: `${(f.value / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By client */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byClient.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Sem dados ainda</p>
            ) : (
              byClient.slice(0, 6).map(c => (
                <div key={c.name} className="flex items-center gap-2">
                  <ClientLogo client={{ companyName: c.name, color: c.color, logoUrl: c.logoUrl }} size="sm" />
                  <span className="text-xs flex-1 truncate">{c.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{c.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

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
import ClientLogo from '@/components/ClientLogo';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';
import {
  Palette, CheckCircle, Clock, AlertTriangle, ArrowRight,
  Play, Eye, RotateCcw, Kanban, BarChart3, LayoutDashboard,
  TrendingUp, Zap, Timer, ListChecks
} from 'lucide-react';

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' },
  media: { label: 'Média', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-500' },
  alta: { label: 'Alta', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500' },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-500' },
};

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed', story: 'Story', logomarca: 'Logomarca', midia_fisica: 'Mídia Física',
};

export default function DesignerDashboard() {
  const { tasksQuery } = useDesignTasks();
  const { user } = useAuth();
  const { currentUser } = useApp();
  const navigate = useNavigate();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('visao-geral');

  const tasks = tasksQuery.data || [];
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  const myTasks = useMemo(() => {
    if (!user?.id) return tasks;
    // Show all tasks for admin, only assigned for designer
    if (currentUser?.role === 'admin') return tasks;
    return tasks.filter(t => t.assigned_to === user.id || !t.assigned_to);
  }, [tasks, user?.id, currentUser?.role]);

  const stats = useMemo(() => {
    const myAssigned = tasks.filter(t => t.assigned_to === user?.id);
    const pending = myTasks.filter(t => t.kanban_column === 'nova_tarefa');
    const inProgress = myTasks.filter(t => t.kanban_column === 'executando');
    const inReview = myTasks.filter(t => t.kanban_column === 'em_analise');
    const adjustments = myTasks.filter(t => t.kanban_column === 'ajustes');
    const completed = myAssigned.filter(t => t.kanban_column === 'aprovado');
    const urgent = myTasks.filter(t => t.priority === 'urgente' && !['aprovado'].includes(t.kanban_column));

    const completedWithTime = completed.filter(t => t.time_spent_seconds > 0);
    const avgTime = completedWithTime.length > 0
      ? completedWithTime.reduce((s, t) => s + t.time_spent_seconds, 0) / completedWithTime.length
      : 0;

    const todayStr = new Date().toISOString().split('T')[0];
    const completedToday = completed.filter(t => t.completed_at?.startsWith(todayStr));

    return {
      pending: pending.length,
      inProgress: inProgress.length,
      inReview: inReview.length,
      adjustments: adjustments.length,
      completed: completed.length,
      urgent: urgent.length,
      avgTime,
      completedToday: completedToday.length,
      totalActive: pending.length + inProgress.length + adjustments.length,
    };
  }, [myTasks, tasks, user?.id]);

  const actionableTasks = useMemo(() => {
    // Priority order: urgente first, then ajustes, then executando, then nova_tarefa
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
      .slice(0, 5);
  }, [tasks, user?.id]);

  const formatTime = (seconds: number) => {
    if (seconds === 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}min`;
  };

  const getColumnBadge = (column: string) => {
    const col = DESIGN_COLUMNS.find(c => c.key === column);
    if (!col) return null;
    return (
      <Badge className="text-[10px] border-0" style={{ backgroundColor: `hsl(${col.color})`, color: 'white' }}>
        {col.label}
      </Badge>
    );
  };

  const getColumnIcon = (column: string) => {
    switch (column) {
      case 'nova_tarefa': return <Zap size={14} className="text-blue-500" />;
      case 'executando': return <Play size={14} className="text-amber-500" />;
      case 'ajustes': return <RotateCcw size={14} className="text-red-500" />;
      case 'em_analise': return <Eye size={14} className="text-purple-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Palette size={24} className="text-primary" />
            Painel do Designer
          </h1>
          <p className="text-sm text-muted-foreground">
            Olá, {currentUser?.displayName || currentUser?.name}! Aqui está seu painel de trabalho.
          </p>
        </div>
        <Button onClick={() => navigate('/designer')} variant="outline" className="gap-2">
          <Kanban size={16} /> Abrir Kanban
        </Button>
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
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="border-l-4" style={{ borderLeftColor: 'hsl(217 91% 60%)' }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Pendentes</p>
                    <p className="text-2xl font-bold">{stats.pending}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Zap size={20} className="text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4" style={{ borderLeftColor: 'hsl(45 93% 47%)' }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Em Execução</p>
                    <p className="text-2xl font-bold">{stats.inProgress}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Play size={20} className="text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4" style={{ borderLeftColor: 'hsl(0 72% 51%)' }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ajustes</p>
                    <p className="text-2xl font-bold">{stats.adjustments}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <RotateCcw size={20} className="text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4" style={{ borderLeftColor: 'hsl(142 71% 45%)' }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Concluídas</p>
                    <p className="text-2xl font-bold">{stats.completed}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle size={20} className="text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4" style={{ borderLeftColor: 'hsl(262 83% 58%)' }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Tempo Médio</p>
                    <p className="text-2xl font-bold">{formatTime(stats.avgTime)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Timer size={20} className="text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Urgent alert */}
          {stats.urgent > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {stats.urgent} tarefa{stats.urgent > 1 ? 's' : ''} urgente{stats.urgent > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-red-600/70 dark:text-red-400/70">Priorize essas demandas para evitar atrasos</p>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-5 gap-4">
            {/* Left: Actionable tasks */}
            <div className="lg:col-span-3 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Zap size={15} className="text-primary" /> Fila de Trabalho
                </h2>
                <Badge variant="secondary" className="text-xs">{actionableTasks.length} tarefas</Badge>
              </div>

              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-2">
                  {actionableTasks.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle size={40} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma tarefa pendente! 🎉</p>
                    </div>
                  )}
                  {actionableTasks.map(task => (
                    <TaskRow key={task.id} task={task} onClick={() => setSelectedTaskId(task.id)} />
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Right: Summary + recent */}
            <div className="lg:col-span-2 space-y-4">
              {/* Pipeline summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp size={15} /> Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {DESIGN_COLUMNS.filter(c => c.key !== 'aprovado').map(col => {
                    const count = myTasks.filter(t => t.kanban_column === col.key).length;
                    const max = Math.max(...DESIGN_COLUMNS.map(c => myTasks.filter(t => t.kanban_column === c.key).length), 1);
                    return (
                      <div key={col.key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">{col.label}</span>
                          <span className="text-xs font-semibold">{count}</span>
                        </div>
                        <Progress value={(count / max) * 100} className="h-1.5" style={{ '--progress-color': `hsl(${col.color})` } as any} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Recent completed */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle size={15} className="text-emerald-500" /> Recém Concluídas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentCompleted.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhuma tarefa concluída ainda</p>
                  )}
                  {recentCompleted.map(task => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <ClientLogo
                        client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{task.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {task.completed_at ? new Date(task.completed_at).toLocaleDateString('pt-BR') : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">
                        {FORMAT_LABELS[task.format_type] || task.format_type}
                      </Badge>
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
  return (
    <Card
      className="hover:shadow-md transition-all cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <ClientLogo
            client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }}
            size="sm"
          />
          <span className="text-[11px] text-muted-foreground truncate">{task.clients?.company_name}</span>
        </div>
        <p className="text-sm font-medium line-clamp-2">{task.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[9px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge>
          <Badge className={`text-[9px] ${p.color}`}>{p.label}</Badge>
          {task.timer_running && (
            <Badge variant="secondary" className="text-[9px] gap-0.5"><Clock size={10} /> Ativo</Badge>
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
    const weeks: { label: string; count: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() - (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const count = myCompleted.filter(t => {
        const d = new Date(t.completed_at || t.updated_at);
        return d >= weekStart && d <= weekEnd;
      }).length;
      weeks.push({
        label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
        count,
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

  const totalTime = myCompleted.reduce((s, t) => s + (t.time_spent_seconds || 0), 0);
  const avgTime = myCompleted.filter(t => t.time_spent_seconds > 0).length > 0
    ? totalTime / myCompleted.filter(t => t.time_spent_seconds > 0).length
    : 0;

  const formatTime = (s: number) => {
    if (s === 0) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h${m > 0 ? `${m}m` : ''}` : `${m}min`;
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle size={20} className="mx-auto mb-1 text-emerald-500" />
            <p className="text-2xl font-bold">{myCompleted.length}</p>
            <p className="text-xs text-muted-foreground">Total Concluídas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Timer size={20} className="mx-auto mb-1 text-purple-500" />
            <p className="text-2xl font-bold">{formatTime(avgTime)}</p>
            <p className="text-xs text-muted-foreground">Tempo Médio/Arte</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock size={20} className="mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{formatTime(totalTime)}</p>
            <p className="text-xs text-muted-foreground">Tempo Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp size={20} className="mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{weeklyData[weeklyData.length - 1]?.count || 0}</p>
            <p className="text-xs text-muted-foreground">Esta Semana</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
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
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(w.count / max) * 100}%` }}
                      />
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
                {byFormat.map(f => {
                  const max = Math.max(...byFormat.map(x => x.value), 1);
                  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'];
                  const idx = byFormat.indexOf(f);
                  return (
                    <div key={f.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{f.name}</span>
                        <span className="text-xs font-semibold">{f.value}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colors[idx % colors.length]} transition-all`}
                          style={{ width: `${(f.value / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

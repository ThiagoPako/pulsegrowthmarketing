import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask } from '@/hooks/useDesignTasks';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import ClientLogo from '@/components/ClientLogo';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';
import DesignTaskCreateDialog from '@/components/designer/DesignTaskCreateDialog';
import { motion } from 'framer-motion';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Palette, CheckCircle, Clock, Play, Eye, RotateCcw, Kanban, BarChart3,
  TrendingUp, Zap, Timer, Building2, CalendarDays,
  Flame, Target, Award, Send, ArrowRight, FileText, Plus
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

const COL_LABELS: Record<string, string> = {
  nova_tarefa: 'Nova', executando: 'Executando', ajustes: 'Ajustes',
  em_analise: 'Análise', enviar_cliente: 'P/ Cliente', aprovado: 'Aprovado',
};

export default function DesignerDashboard() {
  const { tasksQuery } = useDesignTasks();
  const { user } = useAuth();
  const { currentUser, clients } = useApp();
  const navigate = useNavigate();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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
    const completed = myAssigned.filter(t => t.kanban_column === 'aprovado');
    const urgent = myTasks.filter(t => (t.priority === 'urgente' || t.priority === 'alta') && !['aprovado'].includes(t.kanban_column));

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

    // Clients served
    const uniqueClients = new Set(completed.map(t => t.client_id)).size;

    // By format
    const byFormat: Record<string, number> = {};
    completed.forEach(t => {
      const label = FORMAT_LABELS[t.format_type] || t.format_type;
      byFormat[label] = (byFormat[label] || 0) + 1;
    });

    // By client (active)
    const byClient: Record<string, { name: string; count: number; color: string; logoUrl: string | null }> = {};
    myTasks.filter(t => !['aprovado'].includes(t.kanban_column)).forEach(t => {
      const cid = t.client_id;
      if (!byClient[cid]) {
        byClient[cid] = {
          name: t.clients?.company_name || '—', count: 0,
          color: t.clients?.color || '217 91% 60%', logoUrl: t.clients?.logo_url || null,
        };
      }
      byClient[cid].count++;
    });

    return {
      pending: pending.length, inProgress: inProgress.length,
      adjustments: adjustments.length, completed: completed.length,
      urgent: urgent.length, avgTime, completedToday: completedToday.length,
      completedThisWeek: completedThisWeek.length, completedThisMonth: completedThisMonth.length,
      uniqueClients, totalTime,
      totalActive: pending.length + inProgress.length + adjustments.length,
      byFormat: Object.entries(byFormat).map(([name, value]) => ({ name, value })),
      byClient: Object.values(byClient).sort((a, b) => b.count - a.count),
    };
  }, [myTasks, tasks, user?.id, todayStr]);

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

  // Tasks for a specific day (by created_at or started_at)
  const getTasksForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return myTasks.filter(t => {
      if (t.kanban_column === 'aprovado') {
        return t.completed_at?.startsWith(dateStr);
      }
      if (t.kanban_column === 'executando' && t.started_at) {
        return t.started_at.startsWith(dateStr);
      }
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-display font-bold">Olá, {currentUser?.displayName || currentUser?.name} 👋</h1>
          <p className="text-muted-foreground text-sm">
            {format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}
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

      {/* Quick Stats - same style as videomaker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Tarefas Ativas', value: stats.totalActive, icon: Palette, color: 'bg-primary/15 text-primary' },
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

      {/* Main row: Today's Tasks (left 2/3) + Performance (right 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <CalendarDays size={16} className="text-primary" /> Tarefas do Dia
            </h3>
            <Badge variant="secondary" className="text-xs">{todayTasks.length} demandas</Badge>
          </div>

          {todayTasks.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <CheckCircle size={36} className="mx-auto mb-2 opacity-30" />
              <p>Nenhuma tarefa pendente! 🎉</p>
              <p className="text-xs mt-1">Verifique o Kanban para novas demandas</p>
            </div>
          ) : (
            <ScrollArea className="h-[340px]">
              <div className="space-y-2 pr-2">
                {todayTasks.map((task, i) => {
                  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
                  const color = task.clients?.color || '217 91% 60%';
                  const isAdjustment = task.kanban_column === 'ajustes';
                  const isExecuting = task.kanban_column === 'executando';

                  return (
                    <motion.div key={task.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                        isAdjustment ? 'border-destructive/30 bg-destructive/5' :
                        isExecuting ? 'border-primary bg-primary/5 ring-1 ring-primary/30' :
                        'border-border bg-secondary/50'
                      }`}>
                      <div className="w-1.5 h-12 rounded-full shrink-0" style={{ backgroundColor: `hsl(${color})` }} />
                      <ClientLogo
                        client={{ companyName: task.clients?.company_name || '', color, logoUrl: task.clients?.logo_url }}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {isAdjustment && <RotateCcw size={12} className="text-destructive shrink-0" />}
                          {isExecuting && <Play size={12} className="text-primary shrink-0" />}
                          {task.priority === 'urgente' && <Flame size={12} className="text-destructive shrink-0 animate-pulse" />}
                          <span className="font-medium text-sm truncate">{task.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{task.clients?.company_name}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[9px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge>
                        <Badge className={`text-[9px] ${p.color}`}>{p.label}</Badge>
                        {isAdjustment && <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px]">Ajuste</Badge>}
                        {isExecuting && task.timer_running && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] animate-pulse">● Timer</Badge>
                        )}
                      </div>
                      <ArrowRight size={14} className="text-muted-foreground/40 shrink-0" />
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Performance card - side panel */}
        <div className="glass-card p-5">
          <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <BarChart3 size={16} /> Meu Desempenho
          </h3>
          <div className="space-y-4">
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
      </div>

      {/* Weekly Kanban - same style as videomaker */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-sm">Minha Semana</h3>
          <div className="flex items-center gap-3">
            {/* Pipeline legend */}
            <div className="hidden md:flex items-center gap-3 text-[10px] text-muted-foreground">
              {DESIGN_COLUMNS.filter(c => c.key !== 'aprovado').map(col => (
                <div key={col.key} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${col.color})` }} />
                  <span>{col.label}</span>
                </div>
              ))}
            </div>
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
                    const color = task.clients?.color || '217 91% 60%';
                    const isApproved = task.kanban_column === 'aprovado';
                    const isAdjustment = task.kanban_column === 'ajustes';
                    const col = DESIGN_COLUMNS.find(c => c.key === task.kanban_column);

                    return (
                      <div key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`rounded-lg border p-2 text-xs space-y-1 cursor-pointer transition-all hover:shadow-md ${
                          isApproved ? 'border-emerald-500/30 bg-emerald-500/5 opacity-70' :
                          isAdjustment ? 'border-destructive/30 bg-destructive/5' :
                          'border-border bg-card hover:border-primary/40'
                        }`}
                        style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${color})` }}
                      >
                        <p className="font-medium truncate">{task.clients?.company_name || '—'}</p>
                        <p className="text-muted-foreground truncate">{task.title}</p>
                        {isApproved && (
                          <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[9px]">✓ Aprovado</Badge>
                        )}
                        {isAdjustment && (
                          <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px]">↻ Ajuste</Badge>
                        )}
                        {task.priority === 'urgente' && !isApproved && (
                          <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] animate-pulse">🔥 Urgente</Badge>
                        )}
                        {task.timer_running && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] animate-pulse">● Timer</Badge>
                        )}
                        {col && !isApproved && !isAdjustment && task.priority !== 'urgente' && !task.timer_running && (
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `hsl(${col.color})` }} />
                            <span className="text-[9px] text-muted-foreground">{col.label}</span>
                          </div>
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
    </div>
  );
}

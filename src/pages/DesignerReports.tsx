import { useMemo } from 'react';
import { useDesignTasks } from '@/hooks/useDesignTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Clock, CheckCircle, Palette, TrendingUp } from 'lucide-react';

const COLORS = ['hsl(217,91%,60%)', 'hsl(142,71%,45%)', 'hsl(45,93%,47%)', 'hsl(262,83%,58%)', 'hsl(0,72%,51%)', 'hsl(187,85%,43%)'];

export default function DesignerReports() {
  const { tasksQuery } = useDesignTasks();
  const tasks = tasksQuery.data || [];

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.kanban_column === 'aprovado').length;
    const inProgress = tasks.filter(t => ['executando', 'ajustes'].includes(t.kanban_column)).length;
    const totalTimeSeconds = tasks.reduce((sum, t) => sum + (t.time_spent_seconds || 0), 0);
    const completedWithTime = tasks.filter(t => t.kanban_column === 'aprovado' && t.time_spent_seconds > 0);
    const avgTimeSeconds = completedWithTime.length > 0 
      ? completedWithTime.reduce((sum, t) => sum + t.time_spent_seconds, 0) / completedWithTime.length 
      : 0;

    // By format
    const byFormat: Record<string, number> = {};
    tasks.forEach(t => {
      byFormat[t.format_type] = (byFormat[t.format_type] || 0) + 1;
    });

    // By priority
    const byPriority: Record<string, number> = {};
    tasks.forEach(t => {
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    });

    // By month
    const byMonth: Record<string, { total: number; completed: number }> = {};
    tasks.forEach(t => {
      const month = new Date(t.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      if (!byMonth[month]) byMonth[month] = { total: 0, completed: 0 };
      byMonth[month].total++;
      if (t.kanban_column === 'aprovado') byMonth[month].completed++;
    });

    return {
      total, completed, inProgress, totalTimeSeconds, avgTimeSeconds,
      byFormat: Object.entries(byFormat).map(([name, value]) => ({ name: formatLabel(name), value })),
      byPriority: Object.entries(byPriority).map(([name, value]) => ({ name: priorityLabel(name), value })),
      byMonth: Object.entries(byMonth).map(([month, data]) => ({ month, ...data })),
    };
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Produtividade do Designer</h1>
        <p className="text-sm text-muted-foreground">Métricas e análise de performance</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Palette size={20} className="mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Tarefas Criadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle size={20} className="mx-auto mb-1 text-emerald-500" />
            <p className="text-2xl font-bold">{stats.completed}</p>
            <p className="text-xs text-muted-foreground">Concluídas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock size={20} className="mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{formatTime(stats.avgTimeSeconds)}</p>
            <p className="text-xs text-muted-foreground">Tempo Médio/Arte</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp size={20} className="mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Conclusão</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Monthly chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tarefas por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.byMonth}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" name="Criadas" fill="hsl(217,91%,60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Concluídas" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Format distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por Formato</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={stats.byFormat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {stats.byFormat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Priority breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Por Prioridade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {stats.byPriority.map(p => (
              <div key={p.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">{p.name}</span>
                <Badge variant="secondary">{p.value}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (seconds === 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? `${m}m` : ''}`;
  return `${m}min`;
}

function formatLabel(f: string) {
  const map: Record<string, string> = { feed: 'Feed', story: 'Story', midia_fisica: 'Mídia Física' };
  return map[f] || f;
}

function priorityLabel(p: string) {
  const map: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
  return map[p] || p;
}

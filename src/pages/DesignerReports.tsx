import { useMemo, useState } from 'react';
import { useDesignTasks, type DesignTask } from '@/hooks/useDesignTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Clock, CheckCircle, Palette, TrendingUp, Image as ImageIcon } from 'lucide-react';

const COLORS = ['hsl(217,91%,60%)', 'hsl(142,71%,45%)', 'hsl(45,93%,47%)', 'hsl(262,83%,58%)', 'hsl(0,72%,51%)', 'hsl(187,85%,43%)'];

type Preset = 'today' | 'week' | 'month' | 'all' | 'custom';

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=dom
  const diff = (day === 0 ? -6 : 1 - day); // segunda como início
  x.setDate(x.getDate() + diff);
  return x;
}
function toInput(d: Date) { return d.toISOString().slice(0, 10); }

function countArts(t: DesignTask): number {
  const urls = Array.isArray(t.attachment_urls) ? t.attachment_urls.filter(Boolean) : [];
  const single = t.attachment_url ? 1 : 0;
  const mockup = t.mockup_url ? 1 : 0;
  return Math.max(urls.length + (urls.length === 0 ? single : 0), 0) + mockup;
}

export default function DesignerReports() {
  const { tasksQuery } = useDesignTasks();
  const allTasks = tasksQuery.data || [];

  const [preset, setPreset] = useState<Preset>('month');
  const now = new Date();
  const [from, setFrom] = useState<string>(toInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState<string>(toInput(now));

  const range = useMemo(() => {
    const n = new Date();
    if (preset === 'today') return { from: startOfDay(n), to: endOfDay(n) };
    if (preset === 'week') return { from: startOfWeek(n), to: endOfDay(n) };
    if (preset === 'month') return { from: new Date(n.getFullYear(), n.getMonth(), 1), to: endOfDay(n) };
    if (preset === 'all') return { from: new Date(2000, 0, 1), to: endOfDay(n) };
    return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
  }, [preset, from, to]);

  const tasks = useMemo(() => {
    return allTasks.filter(t => {
      const ref = new Date(t.completed_at || t.updated_at || t.created_at);
      return ref >= range.from && ref <= range.to;
    });
  }, [allTasks, range]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.kanban_column === 'aprovado').length;
    const inProgress = tasks.filter(t => ['executando', 'ajustes'].includes(t.kanban_column)).length;
    const totalArts = tasks.reduce((sum, t) => sum + countArts(t), 0);
    const deliveredArts = tasks
      .filter(t => ['aprovado', 'enviar_cliente', 'em_analise'].includes(t.kanban_column))
      .reduce((sum, t) => sum + countArts(t), 0);

    const completedWithTime = tasks.filter(t => t.kanban_column === 'aprovado' && t.time_spent_seconds > 0);
    const avgTimeSeconds = completedWithTime.length > 0
      ? completedWithTime.reduce((sum, t) => sum + t.time_spent_seconds, 0) / completedWithTime.length
      : 0;

    const byFormat: Record<string, number> = {};
    tasks.forEach(t => { byFormat[t.format_type] = (byFormat[t.format_type] || 0) + countArts(t); });

    const byPriority: Record<string, number> = {};
    tasks.forEach(t => { byPriority[t.priority] = (byPriority[t.priority] || 0) + 1; });

    // Por dia dentro do range
    const byDay: Record<string, { day: string; artes: number; cards: number }> = {};
    tasks.forEach(t => {
      const ref = new Date(t.completed_at || t.updated_at || t.created_at);
      const key = toInput(ref);
      if (!byDay[key]) byDay[key] = { day: ref.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), artes: 0, cards: 0 };
      byDay[key].artes += countArts(t);
      byDay[key].cards += 1;
    });

    // Por dia da semana
    const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const byWeekday = weekdayNames.map(n => ({ dia: n, artes: 0, cards: 0 }));
    tasks.forEach(t => {
      const ref = new Date(t.completed_at || t.updated_at || t.created_at);
      const wd = ref.getDay();
      byWeekday[wd].artes += countArts(t);
      byWeekday[wd].cards += 1;
    });

    return {
      total, completed, inProgress, totalArts, deliveredArts, avgTimeSeconds,
      byFormat: Object.entries(byFormat).map(([name, value]) => ({ name: formatLabel(name), value })),
      byPriority: Object.entries(byPriority).map(([name, value]) => ({ name: priorityLabel(name), value })),
      byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v),
      byWeekday,
    };
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Produtividade do Designer</h1>
        <p className="text-sm text-muted-foreground">Métricas e análise de performance</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {([
              { k: 'today', l: 'Hoje' },
              { k: 'week', l: 'Semana' },
              { k: 'month', l: 'Mês' },
              { k: 'all', l: 'Tudo' },
              { k: 'custom', l: 'Período' },
            ] as { k: Preset; l: string }[]).map(o => (
              <Button key={o.k} size="sm" variant={preset === o.k ? 'default' : 'outline'} onClick={() => setPreset(o.k)}>
                {o.l}
              </Button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Período: {range.from.toLocaleDateString('pt-BR')} → {range.to.toLocaleDateString('pt-BR')}
          </p>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Palette size={20} className="mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Cards no período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ImageIcon size={20} className="mx-auto mb-1 text-fuchsia-500" />
            <p className="text-2xl font-bold">{stats.totalArts}</p>
            <p className="text-xs text-muted-foreground">Artes anexadas (total)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle size={20} className="mx-auto mb-1 text-emerald-500" />
            <p className="text-2xl font-bold">{stats.deliveredArts}</p>
            <p className="text-xs text-muted-foreground">Artes entregues</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock size={20} className="mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{formatTime(stats.avgTimeSeconds)}</p>
            <p className="text-xs text-muted-foreground">Tempo médio/arte</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp size={20} className="mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%</p>
            <p className="text-xs text-muted-foreground">Taxa conclusão</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Por dia da semana */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Produção por dia da semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.byWeekday}>
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="artes" name="Artes" fill="hsl(262,83%,58%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cards" name="Cards" fill="hsl(217,91%,60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por dia (linha do tempo) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Artes por dia (período)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.byDay}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="artes" name="Artes" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Format distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Artes por formato</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={stats.byFormat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {stats.byFormat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              {stats.byPriority.map(p => (
                <div key={p.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">{p.name}</span>
                  <Badge variant="secondary">{p.value}</Badge>
                </div>
              ))}
              {stats.byPriority.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem dados no período.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds) return '—';
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

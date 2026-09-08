import { BarChart, Bar, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, HelpCircle, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ClientInsights } from '@/services/socialPostsApi';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
];

const compactNumber = (value: number) => new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(value);

export interface InsightMetric {
  id: string;
  label: string;
  value: number | null | undefined;
  icon: LucideIcon;
  description: string;
  detail: string;
  tone: 'primary' | 'info' | 'success' | 'warning' | 'destructive';
}

interface MetricCardProps {
  metric: InsightMetric;
  selected: boolean;
  onSelect: (metric: InsightMetric) => void;
}

const toneClasses: Record<InsightMetric['tone'], string> = {
  primary: 'border-primary/25 bg-primary/10 text-primary',
  info: 'border-info/25 bg-info/10 text-info',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
};

export function InsightMetricCard({ metric, selected, onSelect }: MetricCardProps) {
  const Icon = metric.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(metric)}
      aria-label={`Ver detalhes de ${metric.label}`}
      className={cn(
        'group min-h-[126px] rounded-lg border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'bg-white/[0.04] hover:-translate-y-0.5 hover:bg-white/[0.07] hover:shadow-lg',
        selected ? toneClasses[metric.tone] : 'border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('inline-flex rounded-md border p-2', toneClasses[metric.tone])}><Icon size={16} /></span>
        <ArrowUpRight size={15} className="text-white/25 transition-colors group-hover:text-white/70" />
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{metric.value == null ? '—' : metric.value.toLocaleString('pt-BR')}</p>
      <p className="text-xs font-medium text-white/65">{metric.label}</p>
      <p className="mt-1 line-clamp-1 text-[11px] text-white/35">{metric.description}</p>
    </button>
  );
}

interface PerformanceChartsProps {
  data: ClientInsights;
}

export function PerformanceCharts({ data }: PerformanceChartsProps) {
  const evolution = data.reach_series.map((item, index) => ({
    date: new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    alcance: item.value,
    seguidores: data.follower_series[index]?.value ?? null,
  }));
  const engagement = [
    { name: 'Curtidas', value: data.likes ?? 0 },
    { name: 'Comentários', value: data.comments ?? 0 },
    { name: 'Salvos', value: data.saves ?? 0 },
    { name: 'Compart.', value: data.shares ?? 0 },
    { name: 'Respostas', value: data.replies ?? 0 },
  ].filter(item => item.value > 0);
  const publications = [...data.posts]
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, 6)
    .map((post, index) => ({ name: `#${index + 1}`, alcance: post.reach ?? 0, interacoes: post.interactions ?? 0 }));

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartPanel title="Evolução no período" subtitle="Alcance e seguidores ao longo do mês">
        {evolution.length ? (
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={evolution} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border) / .22)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compactNumber} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Line type="monotone" dataKey="alcance" stroke={CHART_COLORS[0]} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="seguidores" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : <ChartEmpty />}
      </ChartPanel>

      <ChartPanel title="Como o público interagiu" subtitle="Distribuição das ações nas publicações">
        {engagement.length ? (
          <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center">
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={engagement} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={3}>
                  {engagement.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {engagement.map((item, index) => (
                <div key={item.name} className="flex items-center gap-2 text-[11px] text-white/60">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                  <span className="min-w-0 truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <ChartEmpty />}
      </ChartPanel>

      <ChartPanel title="Publicações com maior alcance" subtitle="Comparação dos seis conteúdos mais vistos" className="lg:col-span-2">
        {publications.length ? (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={publications} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border) / .22)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={compactNumber} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Bar dataKey="alcance" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="interacoes" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <ChartEmpty />}
      </ChartPanel>
    </div>
  );
}

function ChartPanel({ title, subtitle, className, children }: { title: string; subtitle: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-lg border border-white/10 bg-white/[0.035] p-4', className)}>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mb-3 text-[11px] text-white/40">{subtitle}</p>
      {children}
    </section>
  );
}

function ChartEmpty() {
  return <div className="flex h-[230px] items-center justify-center text-xs text-white/35">Dados insuficientes para este gráfico.</div>;
}

export function InsightDetailDialog({ metric, onClose }: { metric: InsightMetric | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(metric)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="border-white/10 bg-popover text-foreground sm:max-w-md">
        {metric && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><metric.icon className="text-primary" size={18} /> {metric.label}</DialogTitle>
              <DialogDescription>{metric.description}</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border bg-muted/50 p-5">
              <p className="text-3xl font-bold">{metric.value == null ? '—' : metric.value.toLocaleString('pt-BR')}</p>
              <p className="mt-1 text-xs text-muted-foreground">no período selecionado</p>
            </div>
            <div className="flex gap-2 rounded-lg bg-info/10 p-3 text-xs text-muted-foreground">
              <HelpCircle className="mt-0.5 shrink-0 text-info" size={15} />
              <p>{metric.detail}</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
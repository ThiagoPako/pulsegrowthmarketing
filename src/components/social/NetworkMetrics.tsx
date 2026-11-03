// Métricas de todas as redes conectadas pela Upload-Post (02/11/2026): seguidores, alcance, visualizações e interações
// de cada rede, com a variação dos últimos 30 dias. Usado na Central Social (equipe) e no portal do cliente.
import { useEffect, useState } from 'react';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NetworkMetric {
  platform: string;
  latest: Record<string, number | string>;
  first: Record<string, number | string>;
  followers_series: { day: string; followers: number | null }[];
}

const NETWORK: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn' };
const LABELS: [string, string][] = [
  ['followers', 'Seguidores'], ['reach', 'Alcance'], ['views', 'Visualizações'], ['profileViews', 'Contas engajadas'],
  ['likes', 'Curtidas'], ['comments', 'Comentários'], ['shares', 'Compartilhamentos'], ['saves', 'Salvamentos'], ['watch_time_minutes', 'Minutos assistidos'],
];
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export default function NetworkMetrics({ load, dark = false, accent }: { load: () => Promise<NetworkMetric[]>; dark?: boolean; accent?: string }) {
  const [data, setData] = useState<NetworkMetric[] | null>(null);
  useEffect(() => { let alive = true; load().then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData([]); }); return () => { alive = false; }; }, [load]);

  if (!data) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;
  if (!data.length) return <p className={cn('rounded-2xl p-6 text-center text-sm', dark ? 'bg-white/5 text-white/60' : 'bg-muted text-muted-foreground')}>As métricas das redes aparecem aqui a partir do primeiro dia com as redes conectadas.</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((m) => {
        const series = m.followers_series.filter((p) => p.followers != null) as { day: string; followers: number }[];
        const max = Math.max(...series.map((p) => p.followers), 1);
        const min = Math.min(...series.map((p) => p.followers), max);
        return (
          <div key={m.platform} className={cn('space-y-3 rounded-2xl p-4', dark ? 'bg-white/5 text-white' : 'border bg-card')}>
            <p className="font-semibold">{NETWORK[m.platform] || m.platform}</p>
            <div className="grid grid-cols-3 gap-2">
              {LABELS.filter(([k]) => typeof m.latest[k] === 'number').map(([k, label]) => {
                const now = Number(m.latest[k]);
                const before = Number(m.first?.[k]);
                const diff = k === 'followers' && Number.isFinite(before) && m.first !== m.latest ? now - before : null;
                return (
                  <div key={k}>
                    <p className="text-lg font-bold" style={accent ? { color: accent } : undefined}>{fmt(now)}</p>
                    <p className={cn('text-[11px]', dark ? 'text-white/60' : 'text-muted-foreground')}>{label}</p>
                    {diff != null && diff !== 0 && (
                      <p className={cn('flex items-center gap-0.5 text-[11px]', diff > 0 ? 'text-emerald-500' : 'text-red-500')}>
                        {diff > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{diff > 0 ? '+' : ''}{fmt(diff)} em 30 dias
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {series.length > 1 && (
              <svg viewBox={`0 0 ${series.length - 1} 30`} preserveAspectRatio="none" className="h-10 w-full" aria-label="Seguidores nos últimos dias">
                <polyline fill="none" stroke={accent || 'currentColor'} strokeWidth="1.2" vectorEffect="non-scaling-stroke"
                  points={series.map((p, i) => `${i},${max === min ? 15 : 28 - ((p.followers - min) / (max - min)) * 26}`).join(' ')} />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { portalAction } from '@/lib/portalApi';
import type { ClientInsights } from '@/services/socialPostsApi';
import { Loader2, TrendingUp, Users, Eye, MousePointerClick, Heart, Instagram, Facebook, MessageCircle, Bookmark, Share2, Play, Clock } from 'lucide-react';

interface PortalInsightsTabProps {
  clientId: string;
  clientColor: string;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const nf = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR');

/** Aba opcional que mostra ao cliente o desempenho real do Instagram no mês. */
export function PortalInsightsTab({ clientId, clientColor }: PortalInsightsTabProps) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<ClientInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setMessage(null);
      try {
        const pad = (n: number) => String(n).padStart(2, '0');
        const last = new Date(year, month, 0).getDate();
        const res = await portalAction({
          action: 'get_insights',
          client_id: clientId,
          since: `${year}-${pad(month)}-01`,
          until: `${year}-${pad(month)}-${pad(last)}`,
        });
        if (!active) return;
        if (res?.insights) setData(res.insights as ClientInsights);
        else {
          setData(null);
          setMessage(res?.unavailable || 'Os números deste mês ainda não estão disponíveis.');
        }
      } catch (err) {
        if (active) { setData(null); setMessage((err as Error).message); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [clientId, month, year]);

  const cards = data ? [
    { label: 'Pessoas alcançadas', value: data.reach, icon: TrendingUp },
    { label: 'Visualizações', value: data.views, icon: Eye },
    { label: 'Seguidores', value: data.followers_total, icon: Users },
    { label: 'Novos seguidores', value: data.followers_gained, icon: Users },
    { label: 'Visitas ao perfil', value: data.profile_views, icon: Eye },
    { label: 'Cliques no link', value: data.website_clicks, icon: MousePointerClick },
    { label: 'Interações', value: data.interactions, icon: Heart },
    { label: 'Contas engajadas', value: data.accounts_engaged, icon: Users },
    { label: 'Curtidas', value: data.likes, icon: Heart },
    { label: 'Comentários', value: data.comments, icon: MessageCircle },
    { label: 'Salvamentos', value: data.saves, icon: Bookmark },
    { label: 'Compartilhamentos', value: data.shares, icon: Share2 },
    { label: 'Respostas', value: data.replies, icon: MessageCircle },
    { label: 'Média de alcance', value: data.avg_reach_per_post, icon: TrendingUp },
    { label: 'Publicações', value: data.posts_count, icon: Instagram },
  ] : [];

  const facebookCards = data?.facebook && !data.facebook.unavailable ? [
    { label: 'Seguidores', value: data.facebook.followers_total, icon: Users },
    { label: 'Alcance', value: data.facebook.reach, icon: TrendingUp },
    { label: 'Impressões', value: data.facebook.impressions, icon: Eye },
    { label: 'Pessoas engajadas', value: data.facebook.engaged_users, icon: Users },
    { label: 'Engajamentos', value: data.facebook.post_engagements, icon: Heart },
    { label: 'Visualizações de vídeo', value: data.facebook.video_views, icon: Play },
    { label: 'Reações', value: data.facebook.reactions, icon: Heart },
  ] : [];

  const selectClass = 'bg-white/10 text-white text-xs rounded-lg px-3 py-2 border border-white/10 outline-none';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className={selectClass}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1} className="text-black">{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={selectClass}>
          {Array.from({ length: 3 }, (_, i) => now.getFullYear() - i).map(y => (
            <option key={y} value={y} className="text-black">{y}</option>
          ))}
        </select>
        {data?.account_name && <span className="text-xs text-white/50">@{data.account_name}</span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-white/50 gap-2 text-sm">
          <Loader2 className="animate-spin" size={16} /> Carregando seus resultados…
        </div>
      ) : !data ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/50">
          {message}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Instagram size={16} /> Instagram</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-white/50 text-xs">
                  <Icon size={13} style={{ color: `hsl(${clientColor})` }} /> {label}
                </div>
                <p className="text-2xl font-bold text-white mt-1">{nf(value)}</p>
              </div>
            ))}
          </div>

          {(data.facebook || facebookCards.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white"><Facebook size={16} /> Facebook {data.facebook?.account_name ? `· ${data.facebook.account_name}` : ''}</div>
              {data.facebook?.unavailable ? (
                <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-xs text-white/50">{data.facebook.unavailable}</p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {facebookCards.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center gap-2 text-white/50 text-xs"><Icon size={13} style={{ color: `hsl(${clientColor})` }} /> {label}</div>
                      <p className="text-2xl font-bold text-white mt-1">{nf(value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
            <p className="text-sm font-semibold text-white">Suas publicações do mês</p>
            {data.posts.length === 0 ? (
              <p className="text-xs text-white/50">Nenhuma publicação registrada neste mês.</p>
            ) : data.posts.map(p => (
              <a
                key={p.id}
                href={p.permalink || undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg bg-white/[0.04] p-2 hover:bg-white/[0.08] transition-colors"
              >
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt="" loading="lazy" className="w-12 h-12 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded bg-white/10 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white truncate">{p.caption || 'Sem legenda'}</p>
                  <p className="text-[11px] text-white/40">
                    {p.media_type} · {p.timestamp ? new Date(p.timestamp).toLocaleDateString('pt-BR') : '—'}
                  </p>
                </div>
                <div className="hidden sm:grid grid-cols-3 gap-3 text-right shrink-0">
                  <div><p className="text-xs font-semibold text-white">{nf(p.reach)}</p><p className="text-[11px] text-white/40">alcance</p></div>
                  <div><p className="text-xs font-semibold text-white">{nf(p.shares)}</p><p className="text-[11px] text-white/40">compart.</p></div>
                  <div><p className="text-xs font-semibold text-white">{nf(p.views ?? p.plays)}</p><p className="text-[11px] text-white/40">views</p></div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

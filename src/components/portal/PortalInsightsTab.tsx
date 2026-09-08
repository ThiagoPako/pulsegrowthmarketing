import { useEffect, useMemo, useState } from 'react';
import { portalAction } from '@/lib/portalApi';
import type { ClientInsights } from '@/services/socialPostsApi';
import { Loader2, TrendingUp, Users, Eye, MousePointerClick, Heart, Instagram, Facebook, MessageCircle, Bookmark, Share2, Play, Sparkles, ChevronRight, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { InsightDetailDialog, InsightMetricCard, PerformanceCharts, type InsightMetric } from './PortalInsightsVisuals';
import { PortalInsightsReport } from './PortalInsightsReport';

interface PortalInsightsTabProps {
  clientId: string;
  clientColor: string;
  clientName?: string;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const nf = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR');

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toIso(d); };

/** Aba opcional que mostra ao cliente o desempenho real do Instagram no período escolhido. */
export function PortalInsightsTab({ clientId, clientColor, clientName = 'Cliente' }: PortalInsightsTabProps) {
  const now = new Date();
  const [mode, setMode] = useState<'month' | 'custom'>('month');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [customSince, setCustomSince] = useState(daysAgo(30));
  const [customUntil, setCustomUntil] = useState(toIso(now));
  const [data, setData] = useState<ClientInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<InsightMetric | null>(null);
  const [postSort, setPostSort] = useState<'recent' | 'reach' | 'engagement'>('reach');
  const [reportOpen, setReportOpen] = useState(false);

  const period = useMemo(() => {
    if (mode === 'custom') return { since: customSince, until: customUntil };
    const last = new Date(year, month, 0).getDate();
    return { since: `${year}-${pad(month)}-01`, until: `${year}-${pad(month)}-${pad(last)}` };
  }, [mode, customSince, customUntil, month, year]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setMessage(null);
      try {
        const res = await portalAction({
          action: 'get_insights',
          client_id: clientId,
          since: period.since,
          until: period.until,
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
  }, [clientId, period.since, period.until]);

  const cards: InsightMetric[] = data ? [
    { id: 'reach', label: 'Pessoas alcançadas', value: data.reach, icon: TrendingUp, tone: 'primary', description: 'Contas únicas que viram seu conteúdo.', detail: 'Mostra quantas pessoas diferentes foram impactadas pelas suas publicações no período.' },
    { id: 'views', label: 'Visualizações', value: data.views, icon: Eye, tone: 'info', description: 'Total de exibições dos conteúdos.', detail: 'Uma mesma pessoa pode gerar mais de uma visualização, por isso este número pode superar o alcance.' },
    { id: 'followers', label: 'Seguidores', value: data.followers_total, icon: Users, tone: 'success', description: 'Tamanho atual da comunidade.', detail: 'Total de pessoas que seguem o perfil no momento da consulta.' },
    { id: 'gained', label: 'Novos seguidores', value: data.followers_gained, icon: Users, tone: 'success', description: 'Crescimento conquistado no período.', detail: 'Quantidade de novos seguidores identificada pela Meta dentro do mês selecionado.' },
    { id: 'profile', label: 'Visitas ao perfil', value: data.profile_views, icon: Eye, tone: 'info', description: 'Pessoas interessadas em conhecer o perfil.', detail: 'Visitas indicam que o conteúdo despertou curiosidade suficiente para abrir seu perfil.' },
    { id: 'clicks', label: 'Cliques no link', value: data.website_clicks, icon: MousePointerClick, tone: 'warning', description: 'Ações no link disponível na bio.', detail: 'Cliques representam tráfego direcionado para seu site, WhatsApp ou página de destino.' },
    { id: 'interactions', label: 'Interações', value: data.interactions, icon: Heart, tone: 'destructive', description: 'Todas as ações geradas pelo conteúdo.', detail: 'Soma das principais ações, como curtidas, comentários, compartilhamentos e salvamentos.' },
    { id: 'engaged', label: 'Contas engajadas', value: data.accounts_engaged, icon: Users, tone: 'primary', description: 'Pessoas únicas que realizaram ações.', detail: 'Diferente do total de interações, conta cada pessoa engajada apenas uma vez.' },
    { id: 'likes', label: 'Curtidas', value: data.likes, icon: Heart, tone: 'destructive', description: 'Sinais rápidos de aprovação.', detail: 'Total de curtidas recebidas pelas publicações do período.' },
    { id: 'comments', label: 'Comentários', value: data.comments, icon: MessageCircle, tone: 'info', description: 'Conversas iniciadas nos conteúdos.', detail: 'Comentários demonstram uma interação mais profunda com a mensagem publicada.' },
    { id: 'saves', label: 'Salvamentos', value: data.saves, icon: Bookmark, tone: 'warning', description: 'Conteúdos guardados para rever.', detail: 'Um salvamento costuma indicar que a publicação tem utilidade ou valor duradouro.' },
    { id: 'shares', label: 'Compartilhamentos', value: data.shares, icon: Share2, tone: 'success', description: 'Conteúdos enviados para outras pessoas.', detail: 'Compartilhamentos ajudam a ampliar o alcance de forma orgânica.' },
    { id: 'replies', label: 'Respostas', value: data.replies, icon: MessageCircle, tone: 'info', description: 'Respostas recebidas nos conteúdos.', detail: 'Indica conversas diretas iniciadas a partir das publicações ou Stories.' },
    { id: 'average', label: 'Média de alcance', value: data.avg_reach_per_post, icon: TrendingUp, tone: 'primary', description: 'Alcance médio de cada publicação.', detail: 'Ajuda a comparar a eficiência do conteúdo mesmo entre meses com volumes diferentes.' },
    { id: 'posts', label: 'Publicações', value: data.posts_count, icon: Instagram, tone: 'warning', description: 'Conteúdos publicados no período.', detail: 'Total de publicações encontradas pela Meta dentro das datas selecionadas.' },
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
  const sortedPosts = data ? [...data.posts].sort((a, b) => {
    if (postSort === 'reach') return (b.reach ?? 0) - (a.reach ?? 0);
    if (postSort === 'engagement') return ((b.interactions ?? 0) + b.likes + b.comments) - ((a.interactions ?? 0) + a.likes + a.comments);
    return (b.timestamp ?? '').localeCompare(a.timestamp ?? '');
  }) : [];

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
          <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035] p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium uppercase text-white/50"><Sparkles size={14} className="text-warning" /> Resumo do período</div>
                <p className="mt-2 text-2xl font-bold text-white sm:text-3xl">Seu conteúdo alcançou {nf(data.reach)} pessoas</p>
                <p className="mt-1 text-sm text-white/50">Veja onde sua presença digital ganhou mais força.</p>
              </div>
              <div className="grid grid-cols-2 gap-5 sm:text-right">
                <div><p className="text-2xl font-bold text-success">+{nf(data.followers_gained)}</p><p className="text-[11px] text-white/45">novos seguidores</p></div>
                <div><p className="text-2xl font-bold text-info">{nf(data.interactions)}</p><p className="text-[11px] text-white/45">interações</p></div>
              </div>
            </div>
          </div>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-auto w-full justify-start overflow-x-auto bg-white/[0.04] p-1 scrollbar-hide">
              <TabsTrigger value="overview" className="shrink-0 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">Visão geral</TabsTrigger>
              <TabsTrigger value="charts" className="shrink-0 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">Gráficos</TabsTrigger>
              <TabsTrigger value="instagram" className="shrink-0 gap-1.5 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white"><Instagram size={14} /> Instagram</TabsTrigger>
              {(data.facebook || facebookCards.length > 0) && <TabsTrigger value="facebook" className="shrink-0 gap-1.5 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white"><Facebook size={14} /> Facebook</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {cards.map(metric => <InsightMetricCard key={metric.id} metric={metric} selected={selectedMetric?.id === metric.id} onSelect={setSelectedMetric} />)}
              </div>
            </TabsContent>

            <TabsContent value="charts" className="mt-0"><PerformanceCharts data={data} /></TabsContent>

            <TabsContent value="instagram" className="mt-0 space-y-3">
              <PerformanceCharts data={data} />
            </TabsContent>

            {(data.facebook || facebookCards.length > 0) && (
            <TabsContent value="facebook" className="mt-0 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white"><Facebook size={16} className="text-info" /> Facebook {data.facebook?.account_name ? `· ${data.facebook.account_name}` : ''}</div>
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
            </TabsContent>
          )}
          </Tabs>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold text-white">Suas publicações do mês</p><p className="text-[11px] text-white/40">Explore os conteúdos e descubra o que mais despertou interesse.</p></div>
              <div className="flex gap-1" aria-label="Ordenar publicações">
                {([['reach', 'Alcance'], ['engagement', 'Interações'], ['recent', 'Recentes']] as const).map(([value, label]) => (
                  <Button key={value} type="button" size="sm" variant="ghost" onClick={() => setPostSort(value)} className={postSort === value ? 'bg-white/10 text-white' : 'text-white/45'}>{label}</Button>
                ))}
              </div>
            </div>
            {data.posts.length === 0 ? (
              <p className="text-xs text-white/50">Nenhuma publicação registrada neste mês.</p>
            ) : sortedPosts.map((p, index) => (
              <a
                key={p.id}
                href={p.permalink || undefined}
                target="_blank"
                rel="noreferrer"
                className="group flex min-h-16 items-center gap-3 rounded-lg border border-transparent bg-white/[0.04] p-2 transition-colors hover:border-white/10 hover:bg-white/[0.08]"
              >
                <span className="w-5 shrink-0 text-center text-xs font-bold text-white/30">{index + 1}</span>
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
                <ChevronRight size={15} className="shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
              </a>
            ))}
          </div>
          <InsightDetailDialog metric={selectedMetric} onClose={() => setSelectedMetric(null)} />
        </>
      )}
    </div>
  );
}

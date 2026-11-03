import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, BellRing, CalendarCheck2, CalendarClock, CheckCircle2, Clock, Film, Image as ImageIcon, KeyRound, Layers, Send, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCity } from '@/contexts/CityContext';
import { fetchSchedulingClients, fetchStudioOverview, type StudioOverviewPost } from '@/services/schedulingApi';
import { cn } from '@/lib/utils';
import { PulseMark, glass } from '@/components/scheduling/BestTimeBadge';

// Visão geral do Estúdio de Postagem (03/11/2026). Inspirada na referência de painel de social media que o usuário mandou
// ("não precisa copiar, só o que melhore a usabilidade"): saudação, os números do momento, o próximo post com contagem
// regressiva e a lista do que precisa de alguém. Cada item leva direto ao calendário do cliente.

const TYPE: Record<string, { label: string; icon: typeof Film }> = {
  reels: { label: 'Reels', icon: Film }, story: { label: 'Story', icon: BellRing }, carrossel: { label: 'Carrossel', icon: Layers },
  arte: { label: 'Arte', icon: ImageIcon }, feed: { label: 'Feed', icon: ImageIcon },
};
const NET: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', both: 'Instagram e Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube' };

function greeting(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(d));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function countdown(at: string | undefined, now: number) {
  if (!at) return '';
  const ms = Date.parse(at) - now;
  if (ms <= 0) return 'agora';
  const m = Math.round(ms / 60000);
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `em ${h} h ${m % 60} min`;
  const d = Math.floor(h / 24);
  return `em ${d} dia${d > 1 ? 's' : ''} e ${h % 24} h`;
}

const whenLabel = (p: StudioOverviewPost) => {
  if (!p.when) return '';
  const [y, m, d] = p.when.date.split('-');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const day = p.when.date === today ? 'Hoje' : `${d}/${m}`;
  void y;
  return `${day}${p.when.time ? ` · ${p.when.time}` : ''}`;
};

function Logo({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <img src={src} alt="" onError={() => setFailed(true)} className={cn('shrink-0 rounded-full border border-border bg-white object-contain', className)} />
    : <span className={cn('grid shrink-0 place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground', className)}>{name.charAt(0)}</span>;
}

export default function StudioOverview({ onOpenClient }: { onOpenClient: (clientId: string) => void }) {
  const { profile } = useAuth();
  const { activeCity } = useCity();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['studio-overview', activeCity], queryFn: fetchStudioOverview, refetchInterval: 60_000 });
  const { data: clients } = useQuery({ queryKey: ['scheduling-clients', activeCity], queryFn: fetchSchedulingClients, staleTime: 60_000 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  const first = (profile?.display_name || profile?.name || '').trim().split(/\s+/)[0];
  const pending = useMemo(() => (clients || []).filter((c) => c.pending > 0).sort((a, b) => b.pending - a.pending), [clients]);
  const pendingTotal = pending.reduce((a, c) => a + c.pending, 0);
  const next = data?.next || [];
  const hero = next[0];
  const needs = (data?.errors.length || 0) + (data?.reauth.length || 0) + pending.length;

  const stats = [
    { label: 'Hoje', value: data?.stats.today, hint: 'posts agendados', icon: CalendarClock },
    { label: 'Próximos 7 dias', value: data?.stats.week, hint: 'posts na fila', icon: CalendarCheck2 },
    { label: 'Publicados no mês', value: data?.stats.published_month, hint: 'pelo sistema', icon: Send },
    { label: 'Sem data', value: pendingTotal, hint: 'materiais aprovados', icon: Clock, warn: pendingTotal > 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}{first ? `, ${first}` : ''}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isLoading ? 'Carregando o dia…' : needs ? `${needs} coisa${needs > 1 ? 's' : ''} precisa${needs > 1 ? 'm' : ''} de você hoje.` : 'Tudo em dia por aqui.'}
          </p>
        </div>
      </div>

      {/* números do momento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className={cn('rounded-2xl p-4', glass, s.warn && 'ring-1 ring-amber-500/30')}
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{s.label}</span>
              <s.icon size={15} className={s.warn ? 'text-amber-500' : ''} />
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{s.value ?? '–'}</p>
            <p className="text-[11px] text-muted-foreground">{s.hint}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* próximo post */}
        <section className={cn('overflow-hidden rounded-2xl', glass)}>
          <header className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-semibold">Próximo post</h2>
            {hero && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"><PulseMark size={12} /> {countdown(hero.at, now)}</span>}
          </header>
          {!hero ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Sparkles size={22} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum post agendado daqui para frente.</p>
              {pending[0] && <button type="button" onClick={() => onOpenClient(pending[0].id)} className="text-sm font-semibold text-primary hover:underline">Agendar os materiais de {pending[0].company_name}</button>}
            </div>
          ) : (
            <>
              <button type="button" onClick={() => onOpenClient(hero.client_id)} className="m-4 flex w-[calc(100%-2rem)] gap-4 rounded-xl text-left transition-opacity hover:opacity-90">
                <div className="relative aspect-[4/5] w-28 shrink-0 overflow-hidden rounded-xl bg-muted sm:w-36">
                  {hero.thumb_url ? <img src={hero.thumb_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Film size={20} className="text-muted-foreground" /></div>}
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{TYPE[hero.type]?.label || hero.type}</span>
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <div className="flex items-center gap-2">
                    <Logo src={hero.logo_url} name={hero.client} className="h-7 w-7" />
                    <span className="truncate text-sm font-semibold">{hero.client}</span>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{whenLabel(hero)}</p>
                  <p className="text-xs text-muted-foreground">{NET[hero.platform] || hero.platform}{hero.reminder ? ' · lembrete para postar pelo app' : ''}</p>
                  {hero.caption && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{hero.caption}</p>}
                </div>
              </button>
              {next.length > 1 && (
                <ul className="divide-y divide-border/60 border-t border-border/60">
                  {next.slice(1, 6).map((p) => {
                    const T = TYPE[p.type]?.icon || Film;
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => onOpenClient(p.client_id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40">
                          <Logo src={p.logo_url} name={p.client} className="h-7 w-7" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{p.client}</span>
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><T size={11} /> {TYPE[p.type]?.label || p.type} · {NET[p.platform] || p.platform}</span>
                          </span>
                          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{whenLabel(p)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        {/* o que precisa de alguém */}
        <section className={cn('rounded-2xl', glass)}>
          <header className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-semibold">Precisa de você</h2>
            {needs > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">{needs}</span>}
          </header>
          {needs === 0 && !isLoading ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <CheckCircle2 size={22} className="text-emerald-500" />
              <p className="text-sm text-muted-foreground">Nada parado: sem erro, sem conta pedindo login e sem material sem data.</p>
            </div>
          ) : (
            <ul className="space-y-1.5 p-3">
              {(data?.errors || []).map((p) => (
                <li key={`e-${p.id}`}>
                  <button type="button" onClick={() => onOpenClient(p.client_id)} className="flex w-full items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.05] p-3 text-left transition-colors hover:bg-destructive/10">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{p.client} · {TYPE[p.type]?.label || p.type} não saiu</span>
                      <span className="line-clamp-2 text-[11px] text-muted-foreground">{p.error || 'A rede recusou o post.'}</span>
                    </span>
                    <ArrowRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {(data?.reauth || []).map((a) => (
                <li key={`r-${a.client_id}-${a.platform}`}>
                  <button type="button" onClick={() => navigate('/conexoes-sociais')} className="flex w-full items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3 text-left transition-colors hover:bg-amber-500/10">
                    <KeyRound size={15} className="shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate text-[13px]"><b>{a.client}</b>: o {NET[a.platform] || a.platform} pede login de novo</span>
                    <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {pending.slice(0, 8).map((c) => (
                <li key={`p-${c.id}`}>
                  <button type="button" onClick={() => onOpenClient(c.id)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card/60 p-3 text-left transition-colors hover:bg-muted/50">
                    <Logo src={c.logo_url} name={c.company_name} className="h-7 w-7" />
                    <span className="min-w-0 flex-1 truncate text-[13px]"><b>{c.company_name}</b>: {c.pending} material{c.pending > 1 ? 'is' : ''} sem data</span>
                    <span className="shrink-0 text-[11px] font-semibold text-primary">Agendar</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

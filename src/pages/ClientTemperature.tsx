import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Bell, ChevronRight, Loader2, MessageCircle, Minus, RefreshCw, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ClientTemperatureBadge, { TEMPERATURE_BAND_STYLE } from '@/components/clients/ClientTemperatureBadge';
import { useClientTemperatures } from '@/hooks/useClientTemperatures';
import { useCity, CITY_LABELS, type CityCode } from '@/contexts/CityContext';
import { cn } from '@/lib/utils';
import {
  ALERT_LABELS, SIGNAL_LABELS, TEMPERATURE_BANDS, TEMPERATURE_BAND_ORDER, fetchClientTemperature, refreshClientTemperature,
  temperatureBand, type ClientTemperatureDetail, type ClientTemperatureItem, type TemperatureBand, type TemperatureSignals,
} from '@/lib/clientTemperature';

type Filter = 'todos' | TemperatureBand | 'sem';

const when = (value: string | null | undefined) => (value ? format(new Date(value), 'dd/MM HH:mm') : '—');
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const hours = (h: number | null | undefined) => {
  if (h === null || h === undefined || !Number.isFinite(h)) return '—';
  return h >= 48 ? `${Math.round(h / 24)} dias` : `${Math.round(h)} h`;
};
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SOURCE_LABELS: Record<string, string> = { monitor: 'Na hora', diaria: 'Diária', manual: 'Atualização manual' };

function ClientMark({ name, logo, color }: { name: string; logo: string | null; color: string | null }) {
  if (logo) return <img src={logo} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border" />;
  const hsl = color || '220 10% 50%';
  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
      style={{ backgroundColor: `hsl(${hsl} / 0.15)`, color: `hsl(${hsl})` }}>
      {name.substring(0, 2).toUpperCase()}
    </div>
  );
}

/** Mini gráfico dos últimos 14 dias (linha neutra; o ponto final carrega a cor da faixa). */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="inline-block w-16" aria-hidden="true" />;
  const w = 64;
  const h = 20;
  const step = w / (values.length - 1);
  const y = (v: number) => h - 2 - (Math.max(0, Math.min(100, v)) / 100) * (h - 4);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const band = temperatureBand(last);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" role="img" aria-label={`Últimos ${values.length} dias: ${values.join(', ')}`}>
      <polyline points={points} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={y(last)} r={2.5}
        fill={band === 'satisfeito' ? 'hsl(var(--success))' : band === 'atencao' ? 'rgb(245 158 11)' : 'hsl(var(--destructive))'} />
    </svg>
  );
}

function Trend({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground w-12">—</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums w-12',
      value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-muted-foreground')}
      title="Na semana">
      <Icon size={14} aria-hidden="true" />
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

function ClientRow({ item, onOpen }: { item: ClientTemperatureItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="w-full text-left glass-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 md:grid md:grid-cols-[minmax(0,14rem)_13rem_7.5rem_minmax(0,1fr)_6.5rem_1rem] md:gap-4 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-3 min-w-0 basis-full md:basis-auto">
        <ClientMark name={item.company_name} logo={item.logo_url} color={item.color} />
        <p className="font-semibold truncate">{item.company_name}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold tabular-nums w-10 text-right">{item.nota ?? '—'}</span>
        <ClientTemperatureBadge score={item.nota} showScore={false} showEmpty />
      </div>
      <div className="flex items-center gap-2">
        <Trend value={item.variacao} />
        <Sparkline values={item.serie || []} />
      </div>
      <p className="text-sm text-muted-foreground min-w-0 basis-full md:basis-auto md:truncate">{item.motivo || '—'}</p>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{when(item.analisado_em)}</span>
      <ChevronRight size={16} className="hidden md:block text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: ClientTemperatureDetail['historico'][number] }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md space-y-0.5">
      <p className="font-medium">{dayLabel(p.dia)}</p>
      <p className="tabular-nums">Nota: <b>{p.nota}</b></p>
      <p className="tabular-nums text-muted-foreground">Dados: {p.nota_dados} · Conversa: {p.nota_conversa ?? '—'}</p>
    </div>
  );
}

function HistoryChart({ data }: { data: ClientTemperatureDetail['historico'] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">—</p>;
  const axis = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <ReferenceArea y1={0} y2={40} fill="hsl(var(--destructive))" fillOpacity={0.07} ifOverflow="hidden" />
          <ReferenceArea y1={40} y2={70} fill="rgb(245 158 11)" fillOpacity={0.08} ifOverflow="hidden" />
          <ReferenceArea y1={70} y2={100} fill="hsl(var(--success))" fillOpacity={0.07} ifOverflow="hidden" />
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="dia" tickFormatter={dayLabel} tick={axis} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis domain={[0, 100]} ticks={[0, 40, 70, 100]} tick={axis} axisLine={false} tickLine={false} width={28} />
          <Tooltip content={<HistoryTooltip />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }} />
          <Line type="monotone" dataKey="nota" stroke="hsl(var(--foreground))" strokeWidth={2}
            dot={data.length <= 2 ? { r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' } : false}
            activeDot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function signalRows(s: TemperatureSignals): { label: string; atual: string; anterior: string }[] {
  const rows: { label: string; atual: string; anterior: string }[] = [];
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));
  if (s.atrasos) rows.push({ label: 'Entregas atrasadas', atual: n(s.atrasos.atual), anterior: n(s.atrasos.anterior) });
  if (s.ajustes) {
    rows.push({ label: 'Entregas enviadas', atual: n(s.ajustes.entregas), anterior: n(s.ajustes.entregasAnterior) });
    rows.push({ label: 'Pedidos de ajuste', atual: n(s.ajustes.atual), anterior: n(s.ajustes.anterior) });
  }
  if (s.devolvidos) rows.push({ label: 'Devolvidos 2+ vezes', atual: n(s.devolvidos.atual), anterior: n(s.devolvidos.anterior) });
  if (s.aprovacao) {
    rows.push({ label: 'Tempo para aprovar', atual: hours(s.aprovacao.horas), anterior: hours(s.aprovacao.anterior) });
    rows.push({ label: 'Esperando aprovação 7+ dias', atual: n(s.aprovacao.esperando), anterior: '—' });
  }
  if (s.gravacoes) {
    const detail = [s.gravacoes.canceladas ? `${s.gravacoes.canceladas} cancel.` : '', s.gravacoes.remarcadas ? `${s.gravacoes.remarcadas} remarc.` : ''].filter(Boolean).join(', ');
    rows.push({ label: 'Gravações canceladas/remarcadas', atual: `${s.gravacoes.atual}${detail ? ` (${detail})` : ''}`, anterior: n(s.gravacoes.anterior) });
  }
  if (s.entregas) {
    const e = s.entregas;
    rows.push(e.referencia === 'mes'
      ? { label: 'Entregas do plano no mês', atual: `${e.feitas} de ${Math.round(e.previsto)} (${e.contratado} no mês)`, anterior: n(e.mesAnterior) }
      : { label: 'Entregas do plano (mês passado)', atual: `${e.feitas} de ${e.contratado}`, anterior: '—' });
  }
  if (s.inadimplencia) {
    const i = s.inadimplencia;
    rows.push({
      label: 'Pagamento vencido',
      atual: i.parcelas ? `${i.parcelas} · ${i.maxDias} dias${i.total !== undefined ? ` · ${money(i.total)}` : ''}` : 'Em dia',
      anterior: '—',
    });
  }
  if (s.portal) {
    rows.push({ label: 'Dias com acesso ao portal', atual: n(s.portal.diasComAcesso), anterior: n(s.portal.diasAnterior) });
    if (s.portal.videosVistos !== null) rows.push({ label: 'Vídeos do portal vistos', atual: n(s.portal.videosVistos), anterior: n(s.portal.videosAnterior) });
  }
  if (s.respostaEquipe) {
    rows.push({
      label: 'Resposta da equipe no grupo',
      atual: s.respostaEquipe.conversas ? `${hours(s.respostaEquipe.medianaHoras)} (${s.respostaEquipe.conversas})` : '—',
      anterior: '—',
    });
  }
  if (s.silencio) {
    rows.push({ label: 'Mensagens do cliente no grupo', atual: n(s.silencio.mensagensCliente), anterior: '—' });
    if (s.silencio.observado) rows.push({ label: 'Dias sem escrever no grupo', atual: s.silencio.dias >= 30 ? '30+' : String(s.silencio.dias), anterior: '—' });
  }
  return rows;
}

function TemperatureDetail({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { activeCity } = useCity();
  const detailKey = ['client-temperature-detail', clientId, activeCity];
  const { data, isLoading, error } = useQuery({
    queryKey: detailKey,
    queryFn: () => fetchClientTemperature(clientId as string),
    enabled: !!clientId,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () => refreshClientTemperature(clientId as string),
    onSuccess: (fresh) => {
      queryClient.setQueryData(detailKey, fresh);
      queryClient.invalidateQueries({ queryKey: ['client-temperature'] });
      if (fresh.pendente) toast.info('Atualizando. Confira de novo em alguns minutos.');
      else toast.success('Temperatura atualizada');
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const atual = data?.atual;
  const rows = atual ? signalRows(atual.sinais || {}) : [];

  return (
    <Sheet open={!!clientId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {isLoading || !data ? (
          <div className="space-y-4 pt-6">
            {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : (
              <>
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <SheetHeader className="space-y-3 pr-6 text-left">
              <div className="flex items-center gap-3">
                <ClientMark name={data.client.company_name} logo={data.client.logo_url} color={data.client.color} />
                <div className="min-w-0">
                  <SheetTitle className="truncate">{data.client.company_name}</SheetTitle>
                  <SheetDescription>
                    {CITY_LABELS[data.client.cidade as CityCode] || data.client.cidade} · Última análise: {when(atual?.analisado_em)}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-4xl font-bold tabular-nums">{atual?.nota ?? '—'}</span>
                <ClientTemperatureBadge score={atual?.nota} showScore={false} showEmpty />
                <Trend value={atual?.variacao ?? null} />
                <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
                  {refresh.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Atualizar agora
                </Button>
              </div>
              {atual && (
                <div className="flex gap-2 text-xs">
                  <Badge variant="secondary" className="tabular-nums">Dados {atual.nota_dados}</Badge>
                  <Badge variant="secondary" className="tabular-nums">Conversa {atual.nota_conversa ?? '—'}</Badge>
                </div>
              )}
            </SheetHeader>

            <Section title="Histórico">
              <HistoryChart data={data.historico} />
            </Section>

            {atual && (
              <Section title="Motivos">
                <ul className="space-y-1.5">
                  {atual.motivos.map((m) => (
                    <li key={`${m.chave}-${m.texto}`} className="flex items-start justify-between gap-3 text-sm">
                      <span>{m.texto}</span>
                      {m.pontos > 0 && m.chave !== 'ameaca_cancelar' && (
                        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">−{m.pontos}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {(atual?.trechos?.length || data.conversas.length > 0) && (
              <Section title="Falas no grupo">
                <div className="space-y-3">
                  {data.conversas.map((c) => (
                    <div key={c.id} className="rounded-lg border border-border p-3 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{when(c.created_at)}</span>
                        <span>· {SOURCE_LABELS[c.fonte] || c.fonte}</span>
                        <span>· {c.mensagens} msg</span>
                        <span className={cn('ml-auto rounded px-1.5 py-0.5 font-semibold tabular-nums border', TEMPERATURE_BAND_STYLE[temperatureBand(c.nota) || 'atencao'])}>{c.nota}</span>
                      </div>
                      {c.resumo && <p className="text-sm">{c.resumo}</p>}
                      {c.sinais.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.sinais.map((s) => <Badge key={s} variant="outline" className="text-[10px]">{SIGNAL_LABELS[s] || s}</Badge>)}
                        </div>
                      )}
                      {c.trechos.map((t) => (
                        <blockquote key={t} className="border-l-2 border-border pl-2 text-sm italic text-muted-foreground">“{t}”</blockquote>
                      ))}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {rows.length > 0 && (
              <Section title="Sinais de dados">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left font-medium py-1"></th>
                      <th className="text-right font-medium py-1">30 dias</th>
                      <th className="text-right font-medium py-1 pl-3">30 anteriores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label} className="border-t border-border/60">
                        <td className="py-1.5 pr-3">{r.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.atual}</td>
                        <td className="py-1.5 pl-3 text-right tabular-nums text-muted-foreground">{r.anterior}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {data.alertas.length > 0 && (
              <Section title="Avisos enviados">
                <ul className="space-y-1.5 text-sm">
                  {data.alertas.map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{when(a.created_at)}</span>
                      <span className="flex-1">{ALERT_LABELS[a.motivo] || a.motivo}{a.nota !== null ? ` · ${a.nota}` : ''}</span>
                      {a.notificado && <Bell size={13} className="text-muted-foreground" aria-label="Notificação no sistema" />}
                      {a.whatsapp > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title="WhatsApp">
                          <MessageCircle size={13} aria-hidden="true" />{a.whatsapp}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function ClientTemperature() {
  const { allowed, items, isLoading, error } = useClientTemperatures();
  const [filter, setFilter] = useState<Filter>('todos');
  const [params, setParams] = useSearchParams();
  const selected = params.get('cliente');

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { todos: items.length, insatisfeito: 0, atencao: 0, satisfeito: 0, sem: 0 };
    for (const item of items) c[(item.faixa || temperatureBand(item.nota) || 'sem') as Filter]++;
    return c;
  }, [items]);
  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'todos') return true;
    const band = item.faixa || temperatureBand(item.nota);
    return filter === 'sem' ? !band : band === filter;
  }), [items, filter]);

  const openClient = (id: string) => setParams((p) => { const next = new URLSearchParams(p); next.set('cliente', id); return next; });
  const closeClient = () => setParams((p) => { const next = new URLSearchParams(p); next.delete('cliente'); return next; }, { replace: true });

  if (!allowed) {
    return <div className="glass-card p-12 text-center text-muted-foreground">Acesso restrito à gestão</div>;
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    ...TEMPERATURE_BAND_ORDER.map((band) => ({ key: band as Filter, label: TEMPERATURE_BANDS[band].label })),
    { key: 'sem', label: 'Sem análise' },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <nav className="text-xs text-muted-foreground flex items-center gap-1">
          <Link to="/clientes" className="hover:text-foreground">Clientes</Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span>Temperatura dos clientes</span>
        </nav>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Thermometer size={22} className="text-primary" aria-hidden="true" /> Temperatura dos clientes
        </h1>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por faixa">
        {filters.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} className="h-8 gap-1.5"
            onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}>
            {f.key !== 'todos' && f.key !== 'sem' && (
              <span className={cn('h-2 w-2 rounded-full', f.key === 'satisfeito' ? 'bg-success' : f.key === 'atencao' ? 'bg-amber-500' : 'bg-destructive')} aria-hidden="true" />
            )}
            {f.label}
            <span className="tabular-nums opacity-70">{counts[f.key]}</span>
          </Button>
        ))}
      </div>

      <div className="hidden md:grid md:grid-cols-[minmax(0,14rem)_13rem_7.5rem_minmax(0,1fr)_6.5rem_1rem] md:gap-4 px-4 text-xs font-medium text-muted-foreground">
        <span>Cliente</span><span>Nota</span><span>Tendência</span><span>Motivo principal</span><span>Última análise</span><span />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : error ? (
        <div className="glass-card p-8 text-center text-sm text-destructive">{(error as Error).message}</div>
      ) : visible.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Thermometer size={36} className="mx-auto mb-3 opacity-40" aria-hidden="true" />
          <p>Nenhum cliente nesta faixa</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => <ClientRow key={item.client_id} item={item} onOpen={() => openClient(item.client_id)} />)}
        </div>
      )}

      <TemperatureDetail clientId={selected} onClose={closeClient} />
    </div>
  );
}

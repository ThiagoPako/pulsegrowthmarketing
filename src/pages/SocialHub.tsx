// Central Social (usuário, 02/11/2026): comentários de todas as redes e avaliações do Google, com a Ísis.
// A Ísis lê cada comentário novo e responde, deixa um rascunho para a equipe aprovar ou chama a equipe (reclamação,
// assunto sensível). Por cliente: modo da Ísis (aprovar, automático, desligado) e orientações (contato, o que não falar).
// Servidor: vps-api-server/lib/socialHub.mjs.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, EyeOff, Loader2, MessageCircle, RefreshCw, Sparkles, Star, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { useCity } from '@/contexts/CityContext';
import { useCallback } from 'react';
import NetworkMetrics, { type NetworkMetric } from '@/components/social/NetworkMetrics';

interface HubComment {
  id: string; client_id: string; client_name: string | null; platform: string; post_permalink: string | null; post_caption: string | null;
  post_thumb: string | null; author_username: string | null; text: string; commented_at: string; status: string;
  isis_draft: string | null; isis_reason: string | null; reply_text: string | null; reply_by: string | null; replied_at: string | null;
}
interface HubReview {
  id: string; client_id: string; client_name: string | null; reviewer: string | null; rating: number | null; comment: string | null;
  reviewed_at: string | null; status: string; isis_draft: string | null; isis_reason: string | null; reply_text: string | null; reply_by: string | null;
}
interface HubClient { client_id: string; client_name: string; escalados: number; rascunhos: number; respondidos_7d: number; isis_mode: string }

const NETWORK: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn' };
const STATUS: Record<string, string> = { escalado: 'Pede a equipe', rascunho: 'Rascunho da Ísis', respondido: 'Respondido', ignorado: 'Ignorado', oculto: 'Oculto', novo: 'Novo' };
const MODES: Record<string, string> = { aprovar: 'Ísis escreve, equipe aprova', automatico: 'Ísis responde sozinha o simples', desligado: 'Desligada (só junta)' };
const when = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

async function api<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options as { body?: Record<string, unknown>; method?: string });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro');
  return data as T;
}

function ReplyBox({ draft, onSend, busy }: { draft: string | null; onSend: (text: string) => void; busy: boolean }) {
  const [text, setText] = useState(draft || '');
  useEffect(() => setText(draft || ''), [draft]);
  return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="text-sm" placeholder="Escreva a resposta" />
      <Button size="sm" className="gap-1" disabled={busy || text.trim().length < 2} onClick={() => onSend(text.trim())}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {text === draft ? 'Aprovar e responder' : 'Responder'}
      </Button>
    </div>
  );
}

export default function SocialHub() {
  // segue a cidade escolhida no topo (Minaçu/Uruaçu) e os clientes globais
  const { activeCity } = useCity();
  const [tab, setTab] = useState<'escalado' | 'rascunho' | 'todos' | 'google' | 'metricas' | 'clientes'>('escalado');
  const [clientId, setClientId] = useState<string>('todos');
  const [clients, setClients] = useState<HubClient[]>([]);
  const [comments, setComments] = useState<HubComment[]>([]);
  const [reviews, setReviews] = useState<HubReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<{ isis_mode: string; notes: string } | null>(null);

  const cid = clientId === 'todos' ? undefined : clientId;
  const loadMetrics = useCallback(async () => (cid ? (await api<{ metrics: NetworkMetric[] }>(`social-hub/metrics/${cid}`, { method: 'GET' })).metrics : []), [cid]);

  const load = async () => {
    setLoading(true);
    try {
      const [o, c, r] = await Promise.all([
        api<{ clients: HubClient[] }>('social-hub/overview', { method: 'GET' }),
        api<{ comments: HubComment[] }>('social-hub/comments', { method: 'GET', body: { ...(cid ? { client_id: cid } : {}), ...(tab === 'escalado' || tab === 'rascunho' ? { status: tab } : {}) } }),
        api<{ reviews: HubReview[] }>('social-hub/reviews', { method: 'GET', body: cid ? { client_id: cid } : {} }),
      ]);
      setClients(o.clients);
      setComments(c.comments);
      setReviews(r.reviews);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tab, clientId, activeCity]);
  useEffect(() => { setClientId('todos'); }, [activeCity]);
  useEffect(() => {
    if (!cid) { setSettings(null); return; }
    api<{ isis_mode: string; notes: string }>(`social-hub/settings/${cid}`, { method: 'GET' }).then(setSettings).catch(() => setSettings(null));
  }, [cid]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await load(); } catch (err) { toast.error((err as Error).message); } finally { setBusy(null); }
  };

  const totals = clients.reduce((a, c) => ({ esc: a.esc + c.escalados, ras: a.ras + c.rascunhos, resp: a.resp + c.respondidos_7d }), { esc: 0, ras: 0, resp: 0 });
  const tabBtn = (id: typeof tab, label: string, n?: number) => (
    <button key={id} type="button" onClick={() => setTab(id)}
      className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
      {label}{n ? <span className="ml-1 rounded-full bg-background/30 px-1.5 text-xs">{n}</span> : null}
    </button>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><MessageCircle size={22} /> Central Social</h1>
          <p className="text-sm text-muted-foreground">Comentários de todas as redes e avaliações do Google. A Ísis lê tudo, responde o simples e chama a equipe quando precisa.</p>
        </div>
        <div className="flex gap-2">
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os clientes</SelectItem>
              {clients.map((c) => <SelectItem key={c.client_id} value={c.client_id}>{c.client_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {cid && (
            <Button variant="outline" className="gap-1" disabled={busy === 'sync'} onClick={() => act('sync', () => api(`social-hub/sync/${cid}`, { body: {} }), 'Comentários e avaliações atualizados')}>
              {busy === 'sync' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Buscar agora
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[{ label: 'Pedem a equipe', value: totals.esc, tone: 'text-destructive' }, { label: 'Rascunhos da Ísis', value: totals.ras, tone: 'text-primary' }, { label: 'Respondidos em 7 dias', value: totals.resp, tone: '' }].map((s) => (
          <Card key={s.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className={cn('text-2xl font-bold', s.tone)}>{s.value}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {tabBtn('escalado', 'Pedem a equipe', totals.esc)}
        {tabBtn('rascunho', 'Rascunhos da Ísis', totals.ras)}
        {tabBtn('todos', 'Todos')}
        {tabBtn('google', 'Google', reviews.filter((r) => r.status !== 'respondido').length)}
        {tabBtn('metricas', 'Métricas')}
        {tabBtn('clientes', 'Ísis por cliente')}
      </div>

      {tab === 'metricas' ? (
        cid ? <NetworkMetrics load={loadMetrics} /> : <Card><CardContent className="p-8 text-center text-muted-foreground">Escolha um cliente para ver as métricas das redes dele.</CardContent></Card>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>
      ) : tab === 'clientes' ? (
        <div className="space-y-3">
          {!cid && <p className="text-sm text-muted-foreground">Escolha um cliente no seletor para mudar o modo da Ísis e as orientações dela.</p>}
          {cid && settings && (
            <Card><CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">Ísis para {clients.find((c) => c.client_id === cid)?.client_name}</p>
              <Select value={settings.isis_mode} onValueChange={(v) => setSettings({ ...settings, isis_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MODES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
              <Textarea rows={4} value={settings.notes} onChange={(e) => setSettings({ ...settings, notes: e.target.value })}
                placeholder="Orientações para a Ísis: WhatsApp para orçamento, horário de atendimento, o que não comentar, tom…" />
              <Button size="sm" disabled={busy === 'settings'} onClick={() => act('settings', () => api(`social-hub/settings/${cid}`, { method: 'PUT', body: settings }), 'Configuração da Ísis salva')}>Salvar</Button>
            </CardContent></Card>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            {clients.map((c) => (
              <Card key={c.client_id}><CardContent className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="truncate font-medium">{c.client_name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {c.escalados > 0 && <Badge variant="destructive">{c.escalados}</Badge>}
                  <Badge variant="secondary">{MODES[c.isis_mode]?.split(',')[0] || c.isis_mode}</Badge>
                </span>
              </CardContent></Card>
            ))}
          </div>
        </div>
      ) : tab === 'google' ? (
        reviews.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma avaliação do Google ainda (o cliente precisa conectar a ficha do Google no link de redes).</CardContent></Card> : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <Card key={r.id}><CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.client_name}</span>
                  <span className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} className={i < (r.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted'} />)}</span>
                  <span>{r.reviewer} · {when(r.reviewed_at)}</span>
                  <Badge variant={r.status === 'escalado' ? 'destructive' : 'secondary'}>{STATUS[r.status] || r.status}</Badge>
                </div>
                {r.comment && <p className="text-sm">{r.comment}</p>}
                {r.status === 'respondido' ? (
                  <p className="rounded-md bg-muted p-2 text-sm"><b>{r.reply_by}:</b> {r.reply_text}</p>
                ) : (
                  <>
                    {r.isis_reason && <p className="text-xs text-muted-foreground"><Sparkles size={11} className="mr-1 inline" />Ísis: {r.isis_reason}</p>}
                    <ReplyBox draft={r.isis_draft} busy={busy === r.id} onSend={(text) => act(r.id, () => api(`social-hub/reviews/${r.id}/reply`, { body: { text } }), 'Resposta publicada no Google')} />
                  </>
                )}
              </CardContent></Card>
            ))}
          </div>
        )
      ) : comments.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nada aqui agora. 🎉</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <Card key={c.id} className={c.status === 'escalado' ? 'border-destructive/40' : ''}><CardContent className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                {c.post_thumb && <img src={c.post_thumb} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.client_name}</span>
                    <span>{NETWORK[c.platform] || c.platform} · {when(c.commented_at)}</span>
                    {c.post_permalink && <a className="underline" href={c.post_permalink} target="_blank" rel="noreferrer">post</a>}
                    <Badge variant={c.status === 'escalado' ? 'destructive' : 'secondary'}>{STATUS[c.status] || c.status}</Badge>
                  </div>
                  <p className="text-sm"><b>@{c.author_username || 'alguém'}</b> {c.text}</p>
                  {c.isis_reason && c.status !== 'respondido' && (
                    <p className="text-xs text-muted-foreground">{c.status === 'escalado' ? <AlertTriangle size={11} className="mr-1 inline text-destructive" /> : <Sparkles size={11} className="mr-1 inline" />}Ísis: {c.isis_reason}</p>
                  )}
                </div>
              </div>
              {c.status === 'respondido' ? (
                <p className="rounded-md bg-muted p-2 text-sm"><b>{c.reply_by}:</b> {c.reply_text}</p>
              ) : !['ignorado', 'oculto'].includes(c.status) && (
                <>
                  <ReplyBox draft={c.isis_draft} busy={busy === c.id} onSend={(text) => act(c.id, () => api(`social-hub/comments/${c.id}/reply`, { body: { text } }), 'Resposta publicada')} />
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => act(`d${c.id}`, () => api(`social-hub/comments/${c.id}/draft`, { body: {} }), 'A Ísis escreveu outra resposta')}><Zap size={12} /> Ísis, outra resposta</Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => act(`i${c.id}`, () => api(`social-hub/comments/${c.id}/ignore`, { body: {} }), 'Ignorado')}><X size={12} /> Ignorar</Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive" disabled={!!busy}
                      onClick={() => { if (window.confirm('Ocultar este comentário na rede do cliente?')) act(`h${c.id}`, () => api(`social-hub/comments/${c.id}/hide`, { body: {} }), 'Comentário ocultado'); }}><EyeOff size={12} /> Ocultar na rede</Button>
                  </div>
                </>
              )}
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

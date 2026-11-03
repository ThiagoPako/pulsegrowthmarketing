// Google no Pulse Direct (usuário, 02/11/2026): ligar a ficha do Google do cliente, a Ísis respondendo as avaliações,
// o monitoramento de avaliações negativas (WhatsApps que recebem o link de aprovação; mais de um = auditoria de quem
// aprovou) e o pedido de remoção quando a avaliação fere as regras do Google. Servidor: lib/socialHub.mjs.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Check, ExternalLink, Flag, History, Loader2, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import ClientSocialNetworks from '@/components/social/ClientSocialNetworks';

interface Review {
  id: string; reviewer: string | null; rating: number | null; comment: string | null; reviewed_at: string | null; status: string;
  isis_draft: string | null; isis_reason: string | null; reply_text: string | null; reply_by: string | null;
  removal_reason: string | null; removal_status: string | null;
}
interface AuditRow { name: string | null; phone: string | null; sent_at: string; opened_at: string | null; action: string | null; note: string | null; acted_at: string | null }
interface Monitor { active: boolean; numbers: { name: string; phone: string }[] }

async function api<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options as { body?: Record<string, unknown>; method?: string });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro');
  return data as T;
}
const when = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const STATUS: Record<string, string> = { escalado: 'Pede a equipe', rascunho: 'Rascunho da Ísis', aguardando_cliente: 'Aguardando o cliente', respondido: 'Respondida', novo: 'Nova' };
const REMOVAL: Record<string, string> = { sugerida: 'Ísis sugere remoção', cliente_quer: 'Cliente quer remover', cliente_nao: 'Cliente manteve', solicitada: 'Remoção pedida ao Google' };

export default function GooglePanel({ clientId }: { clientId: string }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<Record<string, AuditRow[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const [r, m] = await Promise.all([
        api<{ reviews: Review[] }>('social-hub/reviews', { method: 'GET', body: { client_id: clientId } }),
        api<Monitor>(`social-hub/review-monitor/${clientId}`, { method: 'GET' }),
      ]);
      setReviews(r.reviews);
      setMonitor(m);
      setDrafts(Object.fromEntries(r.reviews.map((v) => [v.id, v.isis_draft || ''])));
    } catch (err) { toast.error((err as Error).message); setReviews([]); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setReviews(null); setAudit({}); load(); }, [clientId]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await load(); } catch (err) { toast.error((err as Error).message); } finally { setBusy(null); }
  };
  const saveMonitor = (m: Monitor) => act('monitor', async () => setMonitor(await api<Monitor>(`social-hub/review-monitor/${clientId}`, { method: 'PUT', body: m })), m.active ? 'Monitoramento ligado' : 'Monitoramento salvo');

  return (
    <div className="space-y-4">
      <ClientSocialNetworks clientId={clientId} />

      {monitor && (
        <Card><CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold"><BellRing size={15} /> Monitoramento de avaliações negativas</p>
              <p className="text-xs text-muted-foreground">Avaliação de 3 estrelas ou menos manda no WhatsApp de cada número um link para ver a avaliação e aprovar a resposta da Ísis. Com mais de um número, fica registrado quem aprovou.</p>
            </div>
            <Switch checked={monitor.active} onCheckedChange={(v) => setMonitor({ ...monitor, active: v, numbers: v && !monitor.numbers.length ? [{ name: '', phone: '' }] : monitor.numbers })} />
          </div>
          {(monitor.active || monitor.numbers.length > 0) && (
            <div className="space-y-2">
              {monitor.numbers.map((n, i) => (
                <div key={i} className="flex gap-2">
                  <Input className="w-40" placeholder="Nome (ex.: Dono)" value={n.name} onChange={(e) => setMonitor({ ...monitor, numbers: monitor.numbers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <Input placeholder="WhatsApp com DDD" value={n.phone} onChange={(e) => setMonitor({ ...monitor, numbers: monitor.numbers.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)) })} />
                  <Button size="sm" variant="ghost" onClick={() => setMonitor({ ...monitor, numbers: monitor.numbers.filter((_, j) => j !== i) })}><Trash2 size={13} /></Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setMonitor({ ...monitor, numbers: [...monitor.numbers, { name: '', phone: '' }] })}><Plus size={13} /> Outro WhatsApp</Button>
                <Button size="sm" disabled={busy === 'monitor'} onClick={() => saveMonitor(monitor)}>{busy === 'monitor' ? <Loader2 size={13} className="animate-spin" /> : 'Salvar'}</Button>
              </div>
            </div>
          )}
        </CardContent></Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Avaliações do Google</p>
        <Button size="sm" variant="outline" className="gap-1" disabled={busy === 'sync'} onClick={() => act('sync', () => api(`social-hub/sync/${clientId}`, { body: {} }), 'Avaliações atualizadas')}>
          {busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Buscar agora
        </Button>
      </div>
      {!reviews ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : reviews.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma avaliação ainda. Marque "Google (avaliações)" acima e mande o link para o cliente conectar a ficha.</CardContent></Card>
      ) : reviews.map((v) => (
        <Card key={v.id} className={v.status === 'escalado' || v.status === 'aguardando_cliente' ? 'border-amber-500/40' : ''}><CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} className={i < (v.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-muted'} />)}</span>
            <span className="font-medium">{v.reviewer || 'Cliente'}</span>
            <span className="text-muted-foreground">{when(v.reviewed_at)}</span>
            <Badge variant="secondary">{STATUS[v.status] || v.status}</Badge>
            {v.removal_status && <Badge variant="outline" className="gap-1 border-[#F15A24]/50 text-[#F15A24]"><Flag size={10} />{REMOVAL[v.removal_status] || v.removal_status}</Badge>}
          </div>
          {v.comment && <p className="text-sm">{v.comment}</p>}
          {v.removal_reason && <p className="text-xs text-muted-foreground">Ísis sobre remoção: {v.removal_reason}</p>}
          {v.status === 'respondido' ? (
            <p className="rounded-md bg-muted p-2 text-sm"><b>{v.reply_by}:</b> {v.reply_text}</p>
          ) : (
            <div className="space-y-2">
              {v.isis_reason && <p className="text-xs text-muted-foreground">Ísis: {v.isis_reason}</p>}
              <Textarea rows={2} value={drafts[v.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [v.id]: e.target.value })} />
              <Button size="sm" className="gap-1" disabled={busy === v.id || (drafts[v.id] || '').trim().length < 2}
                onClick={() => act(v.id, () => api(`social-hub/reviews/${v.id}/reply`, { body: { text: drafts[v.id] } }), 'Resposta publicada no Google')}>
                {busy === v.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Publicar resposta
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={async () => {
              if (audit[v.id]) { setAudit({ ...audit, [v.id]: undefined as unknown as AuditRow[] }); return; }
              const d = await api<{ audit: AuditRow[] }>(`social-hub/reviews/${v.id}/audit`, { method: 'GET' }).catch(() => ({ audit: [] }));
              setAudit({ ...audit, [v.id]: d.audit });
            }}><History size={12} /> Auditoria</Button>
            {v.removal_status === 'cliente_quer' && (
              <>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" asChild><a href="https://support.google.com/business/answer/4596773" target="_blank" rel="noreferrer"><ExternalLink size={12} /> Como denunciar no Google</a></Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => act(`rm${v.id}`, () => api(`social-hub/reviews/${v.id}/removal-requested`, { body: {} }), 'Marcada como pedida ao Google')}><Flag size={12} /> Já denunciei</Button>
              </>
            )}
          </div>
          {audit[v.id] && (
            <div className="rounded-md border p-2 text-xs">
              {audit[v.id].length === 0 ? <p className="text-muted-foreground">Ninguém do cliente recebeu aviso desta avaliação.</p> : audit[v.id].map((a, i) => (
                <p key={i} className="flex justify-between gap-2 py-0.5">
                  <span>{a.name} {a.phone}</span>
                  <span className="text-muted-foreground">{a.action ? `${a.action} · ${when(a.acted_at)}${a.note ? ` · "${a.note.slice(0, 60)}"` : ''}` : a.opened_at ? `viu · ${when(a.opened_at)}` : `enviado · ${when(a.sent_at)}`}</span>
                </p>
              ))}
            </div>
          )}
        </CardContent></Card>
      ))}
    </div>
  );
}

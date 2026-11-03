// Caixa de entrada do Pulse Direct: conversas do direct do Instagram do cliente, com a cara do Instagram. A equipe
// responde (com botões de link e respostas rápidas), assume a conversa (o robô pausa) e edita etiquetas e dados.
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bot, ExternalLink, Hand, Link2, Loader2, MessageSquareReply, RefreshCw, Search, Send, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { FIELD_LABELS, type Contact, type DmMessage } from './types';

async function api<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options as { body?: Record<string, unknown>; method?: string });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro');
  return data as T;
}
const ago = (v: string | null) => {
  if (!v) return '';
  const m = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};
const paused = (c: Contact) => !!c.paused_until && new Date(c.paused_until) > new Date();

export default function DirectInbox({ clientId }: { clientId: string }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [sel, setSel] = useState<Contact | null>(null);
  const [msgs, setMsgs] = useState<DmMessage[]>([]);
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [btn, setBtn] = useState<{ title: string; url: string } | null>(null);
  const [quick, setQuick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [newTag, setNewTag] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const loadContacts = async () => {
    try { setContacts((await api<{ contacts: Contact[] }>(`flows/contacts/${clientId}`, { method: 'GET' })).contacts); }
    catch (err) { toast.error((err as Error).message); setContacts([]); }
  };
  const loadMsgs = async (c: Contact) => {
    setMsgs((await api<{ messages: DmMessage[] }>(`flows/contact/${c.id}/messages`, { method: 'GET' })).messages);
    setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(null); setContacts(null); loadContacts(); }, [clientId]);
  // atualiza a conversa aberta a cada 15 s (as mensagens chegam pelo aviso em tempo real)
  useEffect(() => {
    if (!sel) return;
    loadMsgs(sel).catch(() => {});
    const t = setInterval(() => { loadMsgs(sel).catch(() => {}); loadContacts(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const shown = useMemo(() => (contacts || []).filter((c) => !q || (c.username || '').toLowerCase().includes(q.toLowerCase()) || (c.tags || []).some((t) => t.toLowerCase().includes(q.toLowerCase()))), [contacts, q]);
  const windowOpen = sel?.last_in_at ? Date.now() - new Date(sel.last_in_at).getTime() < 24 * 3600_000 : false;

  const send = async () => {
    if (!sel || !text.trim()) return;
    setBusy(true);
    try {
      await api(`flows/contact/${sel.id}/send`, { body: { message: text.trim(), buttons: btn?.title && btn.url ? [btn] : [], quick_replies: quick.filter(Boolean) } });
      setText(''); setBtn(null); setQuick([]);
      await loadMsgs(sel);
      setSel({ ...sel, paused_until: new Date(Date.now() + 24 * 3600_000).toISOString() });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const togglePause = async () => {
    if (!sel) return;
    const next = !paused(sel);
    await api(`flows/contact/${sel.id}/pause`, { body: { paused: next } }).catch((err) => toast.error(err.message));
    setSel({ ...sel, paused_until: next ? new Date(Date.now() + 7 * 86400_000).toISOString() : null });
    toast.success(next ? 'Você assumiu a conversa: o robô fica pausado.' : 'Conversa devolvida ao robô.');
    loadContacts();
  };
  const saveContact = async (patch: Partial<Contact>) => {
    if (!sel) return;
    const updated = { ...sel, ...patch };
    setSel(updated);
    await api(`flows/contact/${sel.id}`, { method: 'PUT', body: { tags: updated.tags, fields: updated.fields } }).catch((err) => toast.error(err.message));
    loadContacts();
  };

  if (!contacts) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>;

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid h-[640px] grid-cols-1 p-0 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_240px]">
        {/* conversas */}
        <div className={cn('flex flex-col border-r', sel && 'hidden md:flex')}>
          <div className="flex items-center gap-1 border-b p-2">
            <div className="relative flex-1"><Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 pl-7 text-xs" placeholder="Buscar @ ou etiqueta" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Button size="sm" variant="ghost" className="h-8" onClick={loadContacts}><RefreshCw size={13} /></Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {shown.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">Nenhuma conversa ainda. Quando alguém escrever no direct ou cair num funil, aparece aqui.</p>}
            {shown.map((c) => (
              <button key={c.id} type="button" onClick={() => setSel(c)} className={cn('flex w-full items-center gap-2 border-b px-3 py-2.5 text-left hover:bg-muted/50', sel?.id === c.id && 'bg-muted')}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-xs font-bold text-white">{(c.username || '?').slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1"><span className={cn('truncate text-sm', c.unread && 'font-bold')}>@{c.username || c.ext_id}</span><span className="shrink-0 text-[10px] text-muted-foreground">{ago(c.last_in_at)}</span></span>
                  <span className="flex items-center gap-1"><span className="truncate text-xs text-muted-foreground">{c.last_message || (c.flow_name ? `funil: ${c.flow_name}` : '')}</span>
                    {paused(c) && <Hand size={11} className="shrink-0 text-amber-500" />}{c.unread > 0 && <span className="shrink-0 rounded-full bg-[#3797F0] px-1.5 text-[10px] text-white">{c.unread}</span>}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* chat */}
        <div className={cn('flex flex-col', !sel && 'hidden md:flex')}>
          {!sel ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Escolha uma conversa</div> : (
            <>
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSel(null)}><X size={14} /></Button>
                <span className="flex-1 truncate text-sm font-semibold">@{sel.username || sel.ext_id}</span>
                <Button size="sm" variant={paused(sel) ? 'default' : 'outline'} className="h-8 gap-1 text-xs" onClick={togglePause}>
                  {paused(sel) ? <><Bot size={13} /> Devolver ao robô</> : <><Hand size={13} /> Assumir conversa</>}
                </Button>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-background px-3 py-3 text-sm">
                {msgs.map((m) => (
                  <div key={m.id} className={cn('flex flex-col', m.direction === 'out' ? 'items-end' : 'items-start')}>
                    <div className={cn('max-w-[78%] overflow-hidden rounded-2xl', m.direction === 'out' ? 'bg-[#3797F0] text-white' : 'bg-muted')}>
                      <p className="whitespace-pre-wrap px-3 py-1.5">{m.text}</p>
                      {(m.meta?.buttons || []).map((b, k) => <div key={k} className="flex items-center justify-center gap-1 border-t border-white/30 px-3 py-1.5 text-xs font-semibold">{b.title} <ExternalLink size={10} /></div>)}
                    </div>
                    {!!m.meta?.replies?.length && <div className="mt-1 flex flex-wrap justify-end gap-1">{m.meta.replies.map((r, k) => <span key={k} className="rounded-full border border-[#3797F0] px-2 py-0.5 text-[11px] text-[#3797F0]">{r}</span>)}</div>}
                    <span className="mt-0.5 text-[10px] text-muted-foreground">{m.direction === 'out' ? `${m.by_name || 'Pulse'} · ` : ''}{new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
                <div ref={end} />
              </div>
              <div className="space-y-2 border-t p-2">
                {!windowOpen && <p className="text-[11px] text-amber-600">Passou de 24 h desde a última mensagem da pessoa: o Instagram não deixa responder até ela escrever de novo.</p>}
                {btn && (
                  <div className="flex gap-1">
                    <Input className="h-8 w-32 text-xs" maxLength={20} placeholder="Texto do botão" value={btn.title} onChange={(e) => setBtn({ ...btn, title: e.target.value })} />
                    <Input className="h-8 text-xs" placeholder="https://…" value={btn.url} onChange={(e) => setBtn({ ...btn, url: e.target.value })} />
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setBtn(null)}><X size={12} /></Button>
                  </div>
                )}
                {quick.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {quick.map((qq, k) => <Input key={k} className="h-7 w-28 text-xs" maxLength={20} value={qq} placeholder="Resposta" onChange={(e) => setQuick(quick.map((x, j) => (j === k ? e.target.value : x)))} />)}
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setQuick([])}><X size={12} /></Button>
                  </div>
                )}
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-9" title="Botão de link" onClick={() => setBtn(btn || { title: '', url: 'https://' })}><Link2 size={15} /></Button>
                  <Button size="sm" variant="ghost" className="h-9" title="Respostas rápidas" onClick={() => setQuick(quick.length < 13 ? [...quick, ''] : quick)}><MessageSquareReply size={15} /></Button>
                  <Input className="h-9" placeholder="Mensagem…" value={text} disabled={!windowOpen} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <Button size="sm" className="h-9" disabled={busy || !text.trim() || !windowOpen} onClick={send}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* contato */}
        {sel && (
          <div className="hidden space-y-3 overflow-y-auto border-l p-3 text-sm xl:block">
            <p className="font-semibold">@{sel.username || sel.ext_id}</p>
            {sel.flow_name && <p className="text-xs text-muted-foreground">Funil: {sel.flow_name}</p>}
            {paused(sel) && <Badge variant="secondary" className="gap-1"><Hand size={11} /> Equipe na conversa</Badge>}
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-xs font-medium"><Tag size={12} /> Etiquetas</p>
              <div className="flex flex-wrap gap-1">
                {(sel.tags || []).map((t) => <Badge key={t} variant="outline" className="gap-1">{t}<button type="button" onClick={() => saveContact({ tags: sel.tags.filter((x) => x !== t) })}><X size={10} /></button></Badge>)}
              </div>
              <Input className="h-7 text-xs" placeholder="+ etiqueta (Enter)" value={newTag} onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newTag.trim()) { saveContact({ tags: [...new Set([...(sel.tags || []), newTag.trim()])] }); setNewTag(''); } }} />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Dados</p>
              {Object.keys(FIELD_LABELS).filter((k) => k !== 'texto').map((k) => (
                <div key={k}>
                  <p className="text-[10px] text-muted-foreground">{FIELD_LABELS[k]}</p>
                  <Input className="h-7 text-xs" defaultValue={sel.fields?.[k] || ''} onBlur={(e) => { if (e.target.value !== (sel.fields?.[k] || '')) saveContact({ fields: { ...(sel.fields || {}), [k]: e.target.value } }); }} />
                </div>
              ))}
              {sel.fields?.telefone && <a className="text-xs text-primary underline" target="_blank" rel="noreferrer" href={`https://wa.me/55${sel.fields.telefone.replace(/\D/g, '').replace(/^55/, '')}`}>Chamar no WhatsApp</a>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

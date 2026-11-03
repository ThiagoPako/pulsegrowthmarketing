// Caixa de direct do Instagram do cliente (02/11/2026): a equipe lê as conversas e responde pelo sistema.
// Servidor: vps-api-server/lib/socialAutomations.mjs (Upload-Post dms/conversations e dms/send).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

interface Msg { id: string; created_time: string; from: { id: string; username?: string }; message?: string }
interface Conversation { id: string; updated_time: string; participants: { data: { id: string; username?: string }[] }; messages: { data: Msg[] } }

export default function InboxPanel({ clientId, accountUsername }: { clientId: string | undefined; accountUsername?: string | null }) {
  const [list, setList] = useState<Conversation[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!clientId) return;
    setList(null);
    const { data, error } = await invokeVpsFunction(`automations/inbox/${clientId}`, { method: 'GET' });
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Não deu para abrir o direct'); setList([]); return; }
    setList(data.conversations || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  if (!clientId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Escolha um cliente para ver o direct do Instagram dele.</CardContent></Card>;
  if (!list) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>;

  const me = (accountUsername || '').replace(/^@/, '').toLowerCase();
  const other = (c: Conversation) => c.participants.data.find((p) => (p.username || '').toLowerCase() !== me) || c.participants.data[0];

  const send = async (c: Conversation) => {
    const to = other(c);
    if (!to || !text.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await invokeVpsFunction(`automations/inbox/${clientId}/send`, { body: { recipient_id: to.id, message: text.trim() } });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não enviou');
      toast.success('Mensagem enviada');
      setText('');
      await load();
      setOpen(c.id);
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end"><Button variant="outline" size="sm" className="gap-1" onClick={load}><RefreshCw size={14} /> Atualizar</Button></div>
      {list.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma conversa no direct (o Instagram do cliente está conectado pela Upload-Post?).</CardContent></Card>}
      {list.map((c) => {
        const who = other(c);
        const msgs = [...(c.messages?.data || [])].reverse();
        const last = msgs[msgs.length - 1];
        return (
          <Card key={c.id}><CardContent className="p-3">
            <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span className="truncate text-sm"><b>@{who?.username || 'contato'}</b> <span className="text-muted-foreground">{last?.message ? `· ${last.message.slice(0, 60)}` : ''}</span></span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(c.updated_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </button>
            {open === c.id && (
              <div className="mt-3 space-y-2">
                {msgs.map((m) => {
                  const mine = (m.from?.username || '').toLowerCase() === me;
                  return (
                    <div key={m.id} className={cn('max-w-[80%] rounded-2xl px-3 py-1.5 text-sm', mine ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>
                      {m.message || '(anexo)'}
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Responder no direct" onKeyDown={(e) => { if (e.key === 'Enter') send(c); }} />
                  <Button size="sm" disabled={busy || !text.trim()} onClick={() => send(c)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">O Instagram só deixa responder quem escreveu nas últimas 24 horas.</p>
              </div>
            )}
          </CardContent></Card>
        );
      })}
    </div>
  );
}

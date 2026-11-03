// Automações estilo ManyChat (02/11/2026): quem comenta a palavra-chave no post recebe a mensagem no direct (Instagram)
// com botões de link; nas outras redes, uma resposta pública. Servidor: vps-api-server/lib/socialAutomations.mjs.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pause, Play, Plus, RefreshCw, Square, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import ClientLogo from '@/components/ClientLogo';
import ButtonEditor from '@/components/pulse-direct/ButtonEditor';
import type { LinkButton } from '@/components/pulse-direct/types';

interface Automation {
  id: string; client_name: string | null; client_logo?: string | null; name: string; platform: string; post_url: string | null; trigger_keywords: string[] | null;
  reply_message: string; buttons: { title: string; url: string }[] | null; status: string; created_at: string; last_error: string | null;
  stats: { total_comments?: number; successful_replies?: number; failed_replies?: number } | null;
}
interface Template { id: string; nome: string; palavras: string[]; mensagem: string; botao: string }
interface Post { id: string; permalink: string; caption: string; thumb: string | null; timestamp: string }

async function api<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options as { body?: Record<string, unknown>; method?: string });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro');
  return data as T;
}

const STATUS_TONE: Record<string, string> = { ativa: 'bg-emerald-500/15 text-emerald-600', pausada: 'bg-amber-500/15 text-amber-600', parada: 'bg-muted text-muted-foreground', expirada: 'bg-muted text-muted-foreground' };

export default function AutomationsPanel({ clientId }: { clientId: string | undefined }) {
  const [items, setItems] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', post_url: '', keywords: 'EU QUERO', message: '' });
  const [buttons, setButtons] = useState<LinkButton[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        api<{ automations: Automation[] }>('automations', { method: 'GET', body: clientId ? { client_id: clientId } : {} }),
        api<{ templates: Template[] }>('automations/templates', { method: 'GET' }),
      ]);
      setItems(a.automations);
      setTemplates(t.templates);
    } catch (err) { toast.error((err as Error).message); } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); setPosts(null); setOpen(false); }, [clientId]);

  const loadPosts = async () => {
    if (!clientId) return;
    try { setPosts((await api<{ posts: Post[] }>(`automations/posts/${clientId}`, { method: 'GET', body: { platform: 'instagram' } })).posts); }
    catch (err) { toast.error((err as Error).message); setPosts([]); }
  };

  const applyTemplate = (t: Template) => {
    setForm((f) => ({ ...f, name: t.nome, keywords: t.palavras.join(', '), message: t.mensagem }));
    // "Agendar pelo WhatsApp" já abre o botão de WhatsApp (só falta o número); os outros, um botão de link
    setButtons([{ title: t.botao, url: t.id === 'agendar' ? 'https://wa.me/' : 'https://' }]);
  };

  const create = async () => {
    if (!clientId) return;
    setBusy('create');
    try {
      await api(`automations/${clientId}`, {
        body: {
          name: form.name, platform: 'instagram', post_url: form.post_url, trigger_keywords: form.keywords,
          reply_message: form.message, buttons: buttons.filter((b) => b.title && /^https?:\/\/\S+\.\S+/.test(b.url)),
        },
      });
      toast.success('Automação ligada! Quem comentar a palavra recebe o direct em segundos.');
      setOpen(false);
      await load();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(null); }
  };

  const control = async (id: string, action: string, ok: string) => {
    if (action === 'delete' && !window.confirm('Apagar esta automação?')) return;
    setBusy(id + action);
    try { await api(`automations/item/${id}/${action}`, { body: {} }); toast.success(ok); await load(); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Quem comentar a palavra-chave no post recebe a mensagem no direct, com o botão de link. Até 2 automações novas por cliente por dia; cada uma dura 15 dias (dá para renovar).</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={load}><RefreshCw size={14} /> Atualizar</Button>
          <Button size="sm" className="gap-1" disabled={!clientId} title={clientId ? '' : 'Escolha um cliente'} onClick={() => { setOpen(!open); if (!posts) loadPosts(); }}><Plus size={14} /> Nova automação</Button>
        </div>
      </div>

      {open && clientId && (
        <Card className="border-primary/40"><CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1">
            {templates.map((t) => <Button key={t.id} type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => applyTemplate(t)}><Zap size={12} className="mr-1" />{t.nome}</Button>)}
          </div>
          <Input placeholder="Nome (ex.: Cupom de novembro)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <p className="mb-1 text-xs font-medium">Post do Instagram</p>
            {!posts ? <Loader2 size={16} className="animate-spin" /> : posts.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum post encontrado (o Instagram do cliente está conectado pela Upload-Post?).</p> : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {posts.map((p) => (
                  <button key={p.id} type="button" onClick={() => setForm({ ...form, post_url: p.permalink })} title={p.caption}
                    className={cn('w-20 shrink-0 overflow-hidden rounded-md border-2', form.post_url === p.permalink ? 'border-primary' : 'border-transparent')}>
                    {p.thumb ? <img src={p.thumb} alt="" className="h-20 w-20 object-cover" referrerPolicy="no-referrer" /> : <div className="h-20 w-20 bg-muted p-1 text-[9px]">{p.caption}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input placeholder="Palavras-chave, separadas por vírgula (vazio = responde todo mundo)" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
          <Textarea rows={3} placeholder="Mensagem que a pessoa recebe no direct" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <ButtonEditor value={buttons} onChange={setButtons} />
          <Button disabled={busy === 'create' || !form.post_url || form.message.trim().length < 3} onClick={create} className="gap-1">
            {busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Ligar automação
          </Button>
        </CardContent></Card>
      )}

      {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div> : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma automação ainda.</CardContent></Card>
      ) : items.map((a) => (
        <Card key={a.id}><CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{a.name}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_TONE[a.status] || 'bg-muted')}>{a.status}</span>
            {a.client_name && <Badge variant="outline" className="gap-1.5 py-0.5 pl-0.5"><ClientLogo client={{ companyName: a.client_name, color: '', logoUrl: a.client_logo || undefined }} size="sm" className="!h-5 !w-5" />{a.client_name}</Badge>}
            {a.post_url && <a href={a.post_url} target="_blank" rel="noreferrer" className="text-xs underline">post</a>}
          </div>
          <p className="text-xs text-muted-foreground">Palavras: {(a.trigger_keywords || []).join(', ') || 'qualquer comentário'} · {a.stats?.successful_replies ?? 0} directs enviados de {a.stats?.total_comments ?? 0} comentários{a.stats?.failed_replies ? ` · ${a.stats.failed_replies} falharam` : ''}</p>
          <p className="text-sm">{a.reply_message}</p>
          {a.last_error && <p className="text-xs text-destructive">{a.last_error}</p>}
          <div className="flex flex-wrap gap-1">
            {a.status === 'ativa' && <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => control(a.id, 'pause', 'Pausada')}><Pause size={12} /> Pausar</Button>}
            {a.status === 'pausada' && <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => control(a.id, 'resume', 'Retomada')}><Play size={12} /> Retomar</Button>}
            {['ativa', 'pausada'].includes(a.status) && <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => control(a.id, 'stop', 'Parada')}><Square size={12} /> Parar</Button>}
            {['expirada', 'parada'].includes(a.status) && <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => control(a.id, 'renew', 'Renovada por mais 15 dias')}><RefreshCw size={12} /> Renovar</Button>}
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive" disabled={!!busy} onClick={() => control(a.id, 'delete', 'Apagada')}><Trash2 size={12} /> Apagar</Button>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

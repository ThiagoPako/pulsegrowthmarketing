// Pulse Direct (usuário, 02/11/2026: "igual o ManyChat… completo mesmo… coloca outro nome relacionado à Pulse"):
// funis no direct do Instagram com botões de link e de resposta, perguntas que guardam dados, etiquetas e passagem
// para a equipe; caixa de entrada com a cara do Instagram; contatos; e as automações rápidas de palavra-chave.
// Servidor: vps-api-server/lib/socialFlows.mjs (funis, contatos, conversas) e lib/socialAutomations.mjs (rápidas).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, MapPin, MessagesSquare, Pencil, Plus, Trash2, Users, Workflow, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { useCity, CITY_LABELS } from '@/contexts/CityContext';
import FlowEditor from '@/components/pulse-direct/FlowEditor';
import DirectInbox from '@/components/pulse-direct/DirectInbox';
import AutomationsPanel from '@/components/social/AutomationsPanel';
import GooglePanel from '@/components/pulse-direct/GooglePanel';
import { flowTemplates, type Contact, type Flow } from '@/components/pulse-direct/types';

interface ClientOpt { id: string; name: string; accounts: { platform: string; username?: string | null; api_base?: string }[] }

async function api<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options as { body?: Record<string, unknown>; method?: string });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro');
  return data as T;
}

function ContactsPanel({ clientId }: { clientId: string }) {
  const [list, setList] = useState<Contact[] | null>(null);
  const [tag, setTag] = useState('todas');
  useEffect(() => {
    setList(null);
    api<{ contacts: Contact[] }>(`flows/contacts/${clientId}`, { method: 'GET' }).then((d) => setList(d.contacts)).catch(() => setList([]));
  }, [clientId]);
  if (!list) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>;
  const tags = [...new Set(list.flatMap((c) => c.tags || []))];
  const shown = list.filter((c) => tag === 'todas' || (c.tags || []).includes(tag));
  const exportCsv = () => {
    const rows = [['instagram', 'nome', 'telefone', 'email', 'etiquetas', 'ultimo_contato'], ...shown.map((c) => [
      c.username || c.ext_id, c.fields?.nome || '', c.fields?.telefone || '', c.fields?.email || '', (c.tags || []).join(' | '), c.last_in_at || '',
    ])];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'contatos-pulse-direct.csv';
    a.click();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as etiquetas</SelectItem>{tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{shown.length} contato(s)</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1" disabled={!shown.length} onClick={exportCsv}><Download size={14} /> Baixar planilha</Button>
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="p-2">Instagram</th><th className="p-2">Nome</th><th className="p-2">WhatsApp</th><th className="p-2">E-mail</th><th className="p-2">Etiquetas</th><th className="p-2">Funil</th></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-2 font-medium">@{c.username || c.ext_id}</td>
                <td className="p-2">{c.fields?.nome || ''}</td>
                <td className="p-2">{c.fields?.telefone ? <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://wa.me/55${c.fields.telefone.replace(/\D/g, '').replace(/^55/, '')}`}>{c.fields.telefone}</a> : ''}</td>
                <td className="p-2">{c.fields?.email || ''}</td>
                <td className="p-2"><div className="flex flex-wrap gap-1">{(c.tags || []).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div></td>
                <td className="p-2 text-xs text-muted-foreground">{c.flow_name || ''}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum contato ainda.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

export default function PulseDirect() {
  // a lista segue a cidade escolhida no topo (Minaçu/Uruaçu) e os clientes globais (trabalho em conjunto)
  const { activeCity } = useCity();
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [tab, setTab] = useState<'funis' | 'inbox' | 'contatos' | 'rapidas' | 'google'>('funis');
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [editing, setEditing] = useState<Flow | null>(null);

  useEffect(() => {
    setClientId('');
    api<{ clients: ClientOpt[] }>('social-posts/accounts-overview', { method: 'GET' })
      .then((d) => {
        // todos os clientes ativos: o Google e a conexão das redes também ficam aqui (quem ainda não conectou vê como conectar)
        const withUp = d.clients;
        setClients(withUp);
        if (withUp[0]) setClientId(withUp[0].id);
      }).catch((err) => toast.error(err.message));
  }, [activeCity]);

  const loadFlows = async () => {
    if (!clientId) return;
    setFlows(null);
    try { setFlows((await api<{ flows: Flow[] }>('flows', { method: 'GET', body: { client_id: clientId } })).flows); }
    catch (err) { toast.error((err as Error).message); setFlows([]); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setEditing(null); loadFlows(); }, [clientId]);

  const client = clients.find((c) => c.id === clientId);
  const igName = client?.accounts.find((a) => a.platform === 'instagram')?.username || client?.name || 'perfil';

  const toggle = async (f: Flow) => {
    try { await api(`flows/${clientId}/${f.id}`, { method: 'PUT', body: { ...f, active: !f.active } }); loadFlows(); }
    catch (err) { toast.error((err as Error).message); }
  };
  const remove = async (f: Flow) => {
    if (!window.confirm(`Apagar o funil "${f.name}"?`)) return;
    try { await api(`flows/item/${f.id}`, { method: 'DELETE' }); loadFlows(); } catch (err) { toast.error((err as Error).message); }
  };

  const tabBtn = (id: typeof tab, label: string, Icon: typeof Zap) => (
    <button type="button" onClick={() => { setTab(id); setEditing(null); }}
      className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Zap size={22} className="text-primary" /> Pulse Direct</h1>
          <p className="text-sm text-muted-foreground">{CITY_LABELS[activeCity]} · Funis no direct do Instagram: botões de link e de resposta, perguntas que guardam o contato e a equipe entrando quando precisa.</p>
        </div>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Escolha o cliente" /></SelectTrigger>
          <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </header>

      {!clients.length ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {tabBtn('funis', 'Funis', Workflow)}
            {tabBtn('inbox', 'Caixa de entrada', MessagesSquare)}
            {tabBtn('contatos', 'Contatos', Users)}
            {tabBtn('rapidas', 'Automações rápidas', Zap)}
            {tabBtn('google', 'Google e avaliações', MapPin)}
          </div>

          {tab === 'inbox' && clientId && <DirectInbox clientId={clientId} />}
          {tab === 'contatos' && clientId && <ContactsPanel clientId={clientId} />}
          {tab === 'rapidas' && <AutomationsPanel clientId={clientId || undefined} />}
          {tab === 'google' && clientId && <GooglePanel clientId={clientId} />}
          {tab === 'funis' && (editing ? (
            <FlowEditor clientId={clientId} accountName={igName} initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); loadFlows(); }} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button className="gap-1" onClick={() => setEditing({ name: 'Novo funil', active: true, trigger: { type: 'comment_keyword', keywords: [], post_ids: [] }, public_reply: null, steps: [{ id: 's1', text: '', buttons: [], replies: [] }] })}><Plus size={14} /> Funil em branco</Button>
                {flowTemplates().map((t) => <Button key={t.id} variant="outline" size="sm" className="gap-1" onClick={() => setEditing(t.flow)}><Zap size={12} /> {t.label}</Button>)}
              </div>
              {!flows ? <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div> : flows.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum funil ainda. Comece por um modelo acima.</CardContent></Card>
              ) : flows.map((f) => (
                <Card key={f.id}><CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <Switch checked={f.active} onCheckedChange={() => toggle(f)} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.trigger.type === 'comment_keyword' ? 'Comentário' : 'Direct'}: {f.trigger.keywords.join(', ') || 'qualquer comentário'}
                      {f.trigger.post_ids?.length ? ` · ${f.trigger.post_ids.length} post(s)` : ''} · {f.steps.length} etapa(s) · {f.runs || 0} pessoas entraram
                      {f.clicks && Object.keys(f.clicks).length ? ` · ${Object.values(f.clicks).reduce((a, b) => a + b, 0)} cliques em botões` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(f)}><Pencil size={13} /> Editar</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(f)}><Trash2 size={13} /></Button>
                </CardContent></Card>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

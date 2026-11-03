// Pulse Direct (usuário, 02/11/2026; refeito no mesmo dia: "muito confuso… aprimoramento total de usabilidade, filtros,
// mais cores… divisão das categorias organizada… como uma plataforma profissional"). Menu lateral com as áreas, cada
// uma na sua cor; o cliente escolhido no topo (com as redes conectadas); visão geral com os números e atalhos; funis com
// galeria de modelos e filtros; caixa de entrada; contatos com filtros; automações rápidas; Google e avaliações.
// Servidor: vps-api-server/lib/socialFlows.mjs, socialAutomations.mjs e socialHub.mjs.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronsUpDown, Download, Instagram, Link2, Loader2, MessageCircle, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import ClientLogo from '@/components/ClientLogo';
import { useCity, CITY_LABELS } from '@/contexts/CityContext';
import FlowEditor from '@/components/pulse-direct/FlowEditor';
import DirectInbox from '@/components/pulse-direct/DirectInbox';
import GooglePanel from '@/components/pulse-direct/GooglePanel';
import AutomationsPanel from '@/components/social/AutomationsPanel';
import { AREAS, areaOf, formatPhone, type Area } from '@/components/pulse-direct/theme';
import { flowTemplates, type Contact, type Flow } from '@/components/pulse-direct/types';

interface ClientOpt { id: string; name: string; city: string | null; logo_url?: string | null; accounts: { platform: string; username?: string | null; api_base?: string }[] }

async function api<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options as { body?: Record<string, unknown>; method?: string });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro');
  return data as T;
}

const TEMPLATE_INFO: Record<string, { help: string; color: string }> = {
  link: { help: 'Quem comentar a palavra recebe o link no direct. Ideal para produto, cardápio ou cupom.', color: '#7C5CFF' },
  whats: { help: 'Pergunta se quer ser chamado, guarda o WhatsApp e avisa a equipe. Ideal para gerar contatos.', color: '#10B981' },
  menu: { help: 'Quem manda "oi" no direct recebe um menu com botões. Ideal para atendimento.', color: '#3797F0' },
};
const NETWORK_NAMES: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', google_business: 'Google' };

function ClientPicker({ clients, value, onChange }: { clients: ClientOpt[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = clients.find((c) => c.id === value);
  const shown = clients.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const hasIg = (c: ClientOpt) => c.accounts.some((a) => a.platform === 'instagram' && a.api_base === 'upload_post');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-11 w-full justify-between gap-2 sm:w-72">
          <span className="flex min-w-0 items-center gap-2">
            {current ? <ClientLogo client={{ companyName: current.name, color: '', logoUrl: current.logo_url || undefined }} size="sm" /> : <span className="h-7 w-7 rounded-md bg-muted" />}
            <span className="truncate font-semibold">{current?.name || 'Escolha o cliente'}</span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="relative mb-2"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="h-9 pl-8" placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="max-h-72 overflow-y-auto">
          {shown.map((c) => (
            <button key={c.id} type="button" onClick={() => { onChange(c.id); setOpen(false); setQ(''); }}
              className={cn('flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted', c.id === value && 'bg-muted')}>
              <ClientLogo client={{ companyName: c.name, color: '', logoUrl: c.logo_url || undefined }} size="sm" />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {hasIg(c) ? <Instagram size={13} className="shrink-0 text-pink-500" aria-label="Instagram conectado" /> : <span className="shrink-0 text-[10px] text-muted-foreground">sem conexão</span>}
              {!c.city && <Badge variant="outline" className="shrink-0 px-1 text-[9px]">conjunto</Badge>}
              {c.id === value && <Check size={13} className="shrink-0" />}
            </button>
          ))}
          {!shown.length && <p className="p-3 text-center text-xs text-muted-foreground">Nenhum cliente com esse nome.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Stat({ label, value, color, onClick }: { label: string; value: number | string; color: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40" style={{ borderTop: `3px solid ${color}` }}>
      <p className="text-3xl font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </button>
  );
}

function ContactsArea({ clientId, contacts, flows, reload }: { clientId: string; contacts: Contact[] | null; flows: Flow[]; reload: () => void }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('todas');
  const [flowId, setFlowId] = useState('todos');
  const [onlyPhone, setOnlyPhone] = useState(false);
  useEffect(() => { setQ(''); setTag('todas'); setFlowId('todos'); setOnlyPhone(false); }, [clientId]);
  if (!contacts) return <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>;
  const tags = [...new Set(contacts.flatMap((c) => c.tags || []))];
  const shown = contacts.filter((c) => (tag === 'todas' || (c.tags || []).includes(tag))
    && (flowId === 'todos' || c.flow_id === flowId)
    && (!onlyPhone || c.fields?.telefone)
    && (!q || `${c.username} ${c.fields?.nome || ''} ${c.fields?.telefone || ''} ${c.fields?.email || ''}`.toLowerCase().includes(q.toLowerCase())));
  const exportCsv = () => {
    const rows = [['instagram', 'nome', 'whatsapp', 'email', 'etiquetas', 'funil', 'ultimo_contato'], ...shown.map((c) => [
      c.username || c.ext_id, c.fields?.nome || '', c.fields?.telefone || '', c.fields?.email || '', (c.tags || []).join(' | '), c.flow_name || '', c.last_in_at || '',
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
        <div className="relative w-full sm:w-64"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar @, nome, WhatsApp ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas as etiquetas</SelectItem>{tags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={flowId} onValueChange={setFlowId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os funis</SelectItem>{flows.map((f) => <SelectItem key={f.id} value={f.id!}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"><Switch checked={onlyPhone} onCheckedChange={setOnlyPhone} /> Com WhatsApp</label>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={reload}>Atualizar</Button>
        <Button size="sm" className="gap-1 bg-[#10B981] hover:bg-[#0e9f6e]" disabled={!shown.length} onClick={exportCsv}><Download size={14} /> Baixar planilha ({shown.length})</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr><th className="p-3 font-medium">Contato</th><th className="p-3 font-medium">WhatsApp</th><th className="p-3 font-medium">E-mail</th><th className="p-3 font-medium">Etiquetas</th><th className="p-3 font-medium">Funil</th></tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-3"><p className="font-medium">@{c.username || c.ext_id}</p>{c.fields?.nome && <p className="text-xs text-muted-foreground">{c.fields.nome}</p>}</td>
                <td className="p-3">{c.fields?.telefone ? <a className="inline-flex items-center gap-1 font-medium text-[#128C7E] hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/55${c.fields.telefone.replace(/\D/g, '').replace(/^55/, '')}`}><MessageCircle size={13} />{formatPhone(c.fields.telefone)}</a> : <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3">{c.fields?.email || <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3"><div className="flex flex-wrap gap-1">{(c.tags || []).map((t) => <span key={t} className="rounded-full bg-[#10B981]/15 px-2 py-0.5 text-xs font-medium text-[#0e9f6e]">{t}</span>)}</div></td>
                <td className="p-3 text-xs text-muted-foreground">{c.flow_name || '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{contacts.length ? 'Nenhum contato com esses filtros.' : 'Quando alguém passar por um funil, aparece aqui com os dados que deixou.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PulseDirect() {
  const { activeCity } = useCity();
  const [clients, setClients] = useState<ClientOpt[] | null>(null);
  const [clientId, setClientId] = useState('');
  const [area, setArea] = useState<Area>('inicio');
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [editing, setEditing] = useState<Flow | null>(null);
  const [flowQ, setFlowQ] = useState('');
  const [flowFilter, setFlowFilter] = useState<'todos' | 'ligados' | 'desligados' | 'comentario' | 'direct'>('todos');

  // a lista segue a cidade escolhida no topo (Minaçu/Uruaçu) e os clientes globais; conectados pela Upload-Post primeiro
  useEffect(() => {
    setClients(null); setClientId('');
    api<{ clients: ClientOpt[] }>('social-posts/accounts-overview', { method: 'GET' })
      .then((d) => {
        const connected = (c: ClientOpt) => Number(c.accounts.some((x) => x.api_base === 'upload_post'));
        const sorted = [...d.clients].sort((a, b) => connected(b) - connected(a) || a.name.localeCompare(b.name));
        setClients(sorted);
        if (sorted[0]) setClientId(sorted[0].id);
      }).catch((err) => { toast.error(err.message); setClients([]); });
  }, [activeCity]);

  const loadFlows = useCallback(async () => {
    if (!clientId) return;
    try { setFlows((await api<{ flows: Flow[] }>('flows', { method: 'GET', body: { client_id: clientId } })).flows); } catch { setFlows([]); }
  }, [clientId]);
  const loadContacts = useCallback(async () => {
    if (!clientId) return;
    try { setContacts((await api<{ contacts: Contact[] }>(`flows/contacts/${clientId}`, { method: 'GET' })).contacts); } catch { setContacts([]); }
  }, [clientId]);
  useEffect(() => { setFlows(null); setContacts(null); setEditing(null); loadFlows(); loadContacts(); }, [loadFlows, loadContacts]);

  const client = clients?.find((c) => c.id === clientId);
  const up = (client?.accounts || []).filter((a) => a.api_base === 'upload_post');
  const igName = up.find((a) => a.platform === 'instagram')?.username || client?.name || 'perfil';
  const hasIg = up.some((a) => a.platform === 'instagram');
  const unread = (contacts || []).reduce((n, c) => n + (c.unread || 0), 0);
  const counts: Partial<Record<Area, number>> = { funis: (flows || []).filter((f) => f.active).length, inbox: unread, contatos: (contacts || []).length };

  const toggle = async (f: Flow) => {
    try { await api(`flows/${clientId}/${f.id}`, { method: 'PUT', body: { ...f, active: !f.active } }); toast.success(f.active ? 'Funil desligado' : 'Funil ligado'); loadFlows(); }
    catch (err) { toast.error((err as Error).message); }
  };
  const remove = async (f: Flow) => {
    if (!window.confirm(`Apagar o funil "${f.name}"? Quem estiver no meio da conversa para de receber as próximas mensagens.`)) return;
    try { await api(`flows/item/${f.id}`, { method: 'DELETE' }); toast.success('Funil apagado'); loadFlows(); } catch (err) { toast.error((err as Error).message); }
  };
  const newFlow = (f?: Flow) => { setArea('funis'); setEditing(f || { name: 'Novo funil', active: true, trigger: { type: 'comment_keyword', keywords: [], post_ids: [] }, public_reply: null, steps: [{ id: 's1', text: '', buttons: [], replies: [] }] }); };

  const shownFlows = useMemo(() => (flows || []).filter((f) => (!flowQ || `${f.name} ${f.trigger.keywords.join(' ')}`.toLowerCase().includes(flowQ.toLowerCase()))
    && (flowFilter === 'todos' || (flowFilter === 'ligados' && f.active) || (flowFilter === 'desligados' && !f.active)
      || (flowFilter === 'comentario' && f.trigger.type === 'comment_keyword') || (flowFilter === 'direct' && f.trigger.type === 'dm_keyword'))), [flows, flowQ, flowFilter]);

  const current = areaOf(area);
  const templates = flowTemplates();

  return (
    <div className="min-h-full bg-muted/20">
      <header className="flex flex-col gap-3 border-b bg-background px-4 py-4 sm:flex-row sm:items-center md:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F15A24] to-[#7C5CFF] text-white"><MessageCircle size={20} /></span>
          <div>
            <h1 className="text-xl font-bold leading-tight">Pulse Direct</h1>
            <p className="text-xs text-muted-foreground">Pulse {CITY_LABELS[activeCity]}</p>
          </div>
        </div>
        <div className="flex-1" />
        {clients && clients.length > 0 && <ClientPicker clients={clients} value={clientId} onChange={setClientId} />}
      </header>

      {!clients ? <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div> : !clients.length ? (
        <p className="p-10 text-center text-muted-foreground">Nenhum cliente ativo em {CITY_LABELS[activeCity]}.</p>
      ) : (
        <div className="flex flex-col md:flex-row">
          <nav className="flex gap-1 overflow-x-auto border-b bg-background p-2 md:w-60 md:shrink-0 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3" aria-label="Áreas do Pulse Direct">
            {AREAS.map((a) => {
              const on = area === a.id;
              const n = counts[a.id];
              return (
                <button key={a.id} type="button" onClick={() => { setArea(a.id); setEditing(null); }} aria-current={on ? 'page' : undefined}
                  className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors md:w-full', on ? 'text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                  style={on ? { background: a.soft } : undefined}>
                  <a.Icon size={16} style={{ color: a.color }} />
                  <span className="whitespace-nowrap">{a.label}</span>
                  {!!n && <span className="ml-auto rounded-full px-1.5 text-[11px] font-semibold text-white" style={{ background: a.color }}>{n}</span>}
                </button>
              );
            })}
          </nav>

          <main className="min-w-0 flex-1 space-y-5 p-4 md:p-6">
            {!editing && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-bold"><current.Icon size={18} style={{ color: current.color }} /> {current.label}</h2>
                  <p className="text-sm text-muted-foreground">{current.hint}{client ? `: ${client.name}` : ''}</p>
                </div>
                <div className="flex-1" />
                {area === 'funis' && <Button className="gap-1.5 bg-[#7C5CFF] hover:bg-[#6a4cf0]" onClick={() => newFlow()}><Plus size={14} /> Funil em branco</Button>}
              </div>
            )}

            {!hasIg && area !== 'google' && !editing && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <AlertTriangle size={18} className="shrink-0 text-amber-600" />
                <p className="min-w-0 flex-1">O Instagram de {client?.name} ainda não está conectado. Sem ele, os funis e a caixa de entrada não funcionam.</p>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setArea('google')}><Link2 size={13} /> Conectar redes</Button>
              </div>
            )}

            {area === 'inicio' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label="funis ligados" value={counts.funis || 0} color="#7C5CFF" onClick={() => setArea('funis')} />
                  <Stat label="pessoas entraram nos funis" value={(flows || []).reduce((n, f) => n + (f.runs || 0), 0)} color="#F15A24" onClick={() => setArea('funis')} />
                  <Stat label="mensagens não lidas" value={unread} color="#3797F0" onClick={() => setArea('inbox')} />
                  <Stat label="contatos com WhatsApp" value={(contacts || []).filter((c) => c.fields?.telefone).length} color="#10B981" onClick={() => setArea('contatos')} />
                </div>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
                  <p className="mr-2 text-sm font-semibold">Redes conectadas</p>
                  {Object.keys(NETWORK_NAMES).map((p) => {
                    const on = up.some((a) => a.platform === p);
                    return <span key={p} className={cn('rounded-full px-2.5 py-1 text-xs font-medium', on ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{on && <Check size={11} className="mr-0.5 inline" />}{NETWORK_NAMES[p]}</span>;
                  })}
                  <Button size="sm" variant="ghost" className="ml-auto gap-1" onClick={() => setArea('google')}><Link2 size={13} /> Conectar mais</Button>
                </div>
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Comece por um modelo pronto</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {templates.map((t) => {
                      const info = TEMPLATE_INFO[t.id];
                      return (
                        <button key={t.id} type="button" onClick={() => newFlow(t.flow)} className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40" style={{ boxShadow: `inset 4px 0 0 ${info.color}` }}>
                          <p className="font-semibold">{t.label}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{info.help}</p>
                          <p className="mt-3 text-sm font-semibold" style={{ color: info.color }}>Usar este modelo</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {area === 'funis' && (editing ? (
              <FlowEditor clientId={clientId} accountName={igName} initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); loadFlows(); }} />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-64"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-8" placeholder="Buscar funil ou palavra" value={flowQ} onChange={(e) => setFlowQ(e.target.value)} /></div>
                  {([['todos', 'Todos'], ['ligados', 'Ligados'], ['desligados', 'Desligados'], ['comentario', 'Por comentário'], ['direct', 'Pelo direct']] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setFlowFilter(v)} aria-pressed={flowFilter === v} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', flowFilter === v ? 'border-[#7C5CFF] bg-[#7C5CFF] text-white' : 'hover:bg-muted')}>{label}</button>
                  ))}
                </div>
                {!flows ? <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div> : shownFlows.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-card p-8 text-center">
                    <p className="font-semibold">{flows.length ? 'Nenhum funil com esses filtros.' : 'Nenhum funil ainda.'}</p>
                    {!flows.length && <p className="mt-1 text-sm text-muted-foreground">Escolha um modelo para começar em um minuto.</p>}
                    {!flows.length && <div className="mt-4 flex flex-wrap justify-center gap-2">{templates.map((t) => <Button key={t.id} variant="outline" size="sm" onClick={() => newFlow(t.flow)}>{t.label}</Button>)}</div>}
                  </div>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {shownFlows.map((f) => {
                      const color = f.trigger.type === 'comment_keyword' ? '#7C5CFF' : '#3797F0';
                      const clicks = f.clicks ? Object.values(f.clicks).reduce((a, b) => a + b, 0) : 0;
                      return (
                        <div key={f.id} className={cn('rounded-xl border bg-card p-4', !f.active && 'opacity-70')} style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{f.name}</p>
                              <p className="text-xs text-muted-foreground">{f.trigger.type === 'comment_keyword' ? 'Comentou no post' : 'Mandou no direct'}{f.trigger.post_ids?.length ? `, em ${f.trigger.post_ids.length} post(s)` : ''}</p>
                            </div>
                            <Switch checked={f.active} onCheckedChange={() => toggle(f)} aria-label={f.active ? 'Desligar funil' : 'Ligar funil'} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(f.trigger.keywords.length ? f.trigger.keywords : ['qualquer comentário']).map((k) => <span key={k} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${color}1f`, color }}>{k}</span>)}
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-muted/50 p-2"><p className="text-lg font-bold tabular-nums">{f.runs || 0}</p><p className="text-[11px] text-muted-foreground">entraram</p></div>
                            <div className="rounded-lg bg-muted/50 p-2"><p className="text-lg font-bold tabular-nums">{clicks}</p><p className="text-[11px] text-muted-foreground">cliques</p></div>
                            <div className="rounded-lg bg-muted/50 p-2"><p className="text-lg font-bold tabular-nums">{f.steps.length}</p><p className="text-[11px] text-muted-foreground">mensagens</p></div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setEditing(f)}><Pencil size={13} /> Editar</Button>
                            <Button size="sm" variant="ghost" className="text-destructive" aria-label="Apagar funil" onClick={() => remove(f)}><Trash2 size={13} /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {flows && flows.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                    <span className="text-sm text-muted-foreground">Começar por um modelo:</span>
                    {templates.map((t) => <Button key={t.id} variant="ghost" size="sm" onClick={() => newFlow(t.flow)}>{t.label}</Button>)}
                  </div>
                )}
              </div>
            ))}

            {area === 'inbox' && clientId && <DirectInbox clientId={clientId} />}
            {area === 'contatos' && clientId && <ContactsArea clientId={clientId} contacts={contacts} flows={flows || []} reload={loadContacts} />}
            {area === 'rapidas' && <AutomationsPanel clientId={clientId || undefined} />}
            {area === 'google' && clientId && <GooglePanel clientId={clientId} />}
          </main>
        </div>
      )}
    </div>
  );
}

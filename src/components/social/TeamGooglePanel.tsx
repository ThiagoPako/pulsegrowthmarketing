import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, Loader2, LogIn, MapPin, Plus, Search, Star, Trash2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { nameMatch, normalizeName } from '@/lib/pageMatch';

// Google da equipe (pedido do Thiago, 04/11/2026): "conectar apenas o meu e-mail e todas as contas compartilhadas com ele
// configurar no sistema individualmente para cada cliente, e poder adicionar cliente novo que não faz parte dos clientes
// fixos". Um login do Google (um perfil na Upload-Post, um slot) traz todas as fichas que o e-mail administra. Cada
// ficha é ligada a um cliente (um cliente pode ter várias fichas) ou a um cliente só de monitoramento, e cada cliente
// tem a lista de WhatsApps que recebem o aviso de avaliação negativa. Só o Thiago vê.

interface Location { id: string; title: string; client_id: string | null; client_name: string | null; monitor_only: boolean }
interface TeamGoogle { id: string; name: string; connected: boolean; reauth: boolean; account: string | null; locations: Location[] }
interface ClientLite { id: string; name: string }
interface Monitor { active: boolean; numbers: { name: string; phone: string }[] }

/** Os WhatsApps que recebem o aviso de avaliação negativa do cliente (mesma rota da aba Google do Redes Pulse). */
function MonitorEditor({ clientId }: { clientId: string }) {
  const [m, setM] = useState<Monitor | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    invokeVpsFunction(`social-hub/review-monitor/${clientId}`, { method: 'GET' }).then(({ data }) => setM(data?.error ? { active: false, numbers: [] } : data));
  }, [clientId]);
  if (!m) return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
  const save = async () => {
    setSaving(true);
    const { data, error } = await invokeVpsFunction(`social-hub/review-monitor/${clientId}`, { method: 'PUT', body: m });
    setSaving(false);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    setM(data);
    toast.success(data.active ? 'Aviso de avaliação ligado' : 'Aviso salvo');
  };
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-2.5">
      <label className="flex items-center gap-2 text-xs font-medium">
        <Switch checked={m.active} onCheckedChange={(v) => setM({ ...m, active: v, numbers: v && !m.numbers.length ? [{ name: '', phone: '' }] : m.numbers })} />
        <BellRing size={13} /> Avisar no WhatsApp quando chegar avaliação negativa (3 estrelas ou menos)
      </label>
      {(m.active || m.numbers.length > 0) && (
        <div className="space-y-1.5">
          {m.numbers.map((n, i) => (
            <div key={i} className="flex flex-wrap gap-1.5">
              <Input className="h-8 w-36" placeholder="Nome (ex.: Dono)" value={n.name}
                onChange={(e) => setM({ ...m, numbers: m.numbers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <Input className="h-8 w-44" placeholder="WhatsApp com DDD" value={n.phone}
                onChange={(e) => setM({ ...m, numbers: m.numbers.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)) })} />
              <Button size="sm" variant="ghost" className="h-8" aria-label="Tirar este número" onClick={() => setM({ ...m, numbers: m.numbers.filter((_, j) => j !== i) })}><Trash2 size={13} /></Button>
            </div>
          ))}
          <div className="flex gap-1.5">
            {m.numbers.length < 10 && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setM({ ...m, numbers: [...m.numbers, { name: '', phone: '' }] })}><Plus size={12} /> Outro WhatsApp</Button>
            )}
            <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={save}>{saving ? <Loader2 size={12} className="animate-spin" /> : 'Salvar'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamGooglePanel({ clients }: { clients: ClientLite[] }) {
  const [teams, setTeams] = useState<TeamGoogle[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [openMonitor, setOpenMonitor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await invokeVpsFunction('upload-post/team-google', { method: 'GET' });
    if (/403|Só o Thiago/i.test(String(data?.error || error?.message || error || ''))) { setHidden(true); return; }
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Não deu para ler o Google da equipe'); setTeams([]); return; }
    setTeams(data.teams || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  // clientes para ligar: os da Pulse e os só de monitoramento já criados aqui (uma segunda ficha pode ir para eles)
  const allClients = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, { ...c, monitor: false }]));
    for (const t of teams || []) for (const l of t.locations) {
      if (l.client_id && !map.has(l.client_id)) map.set(l.client_id, { id: l.client_id, name: l.client_name || 'Cliente', monitor: true });
    }
    return [...map.values()];
  }, [clients, teams]);

  const call = async (key: string, path: string, body: Record<string, unknown>, ok: string) => {
    setBusy(key);
    const { data, error } = await invokeVpsFunction(path, { body });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return null; }
    toast.success(ok);
    return data;
  };

  const create = async () => {
    if (await call('novo', 'upload-post/team-google', { name: name.trim() || 'Google da Pulse' }, 'Google criado. Agora toque em Fazer login.')) { setName(''); load(); }
  };
  const login = async (t: TeamGoogle) => {
    setBusy(t.id);
    const { data, error } = await invokeVpsFunction(`upload-post/team-google/${t.id}/login`, { body: {} });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    window.location.href = data.url;
  };
  const assign = async (t: TeamGoogle, loc: Location, clientId: string | null) => {
    const body = clientId ? { location_id: loc.id, client_id: clientId } : { location_id: loc.id, new_client_name: newName.trim() || loc.title };
    const data = await call(loc.id, `upload-post/team-google/${t.id}/assign`, body,
      clientId ? `Ficha "${loc.title}" ligada` : `Cliente de monitoramento "${body.new_client_name}" criado e ligado`);
    if (data) { setPicking(null); setPickQuery(''); setNewName(''); load(); }
  };
  const unassign = async (loc: Location) => {
    if (!window.confirm(`Desligar a ficha "${loc.title}" de ${loc.client_name}? As avaliações dela param de chegar.`)) return;
    if (await call(loc.id, 'upload-post/team-google/unassign', { location_id: loc.id }, 'Ficha desligada')) load();
  };

  if (hidden) return null;
  const q = normalizeName(query);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-2 font-semibold"><Star size={16} className="text-yellow-500" /> Google da equipe · avaliações</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Faça login uma vez com o e-mail que administra as fichas do Google. Todas as fichas compartilhadas com ele aparecem aqui:
            ligue cada uma a um cliente (um cliente pode ter várias fichas) ou crie um cliente só para monitorar as avaliações.
            Usa um único perfil da Upload-Post.
          </p>
        </div>

        {teams === null ? <Loader2 className="animate-spin text-muted-foreground" /> : teams.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: Google Thiago)" className="max-w-xs" />
            <Button onClick={create} disabled={busy === 'novo'}>{busy === 'novo' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar</Button>
          </div>
        ) : teams.map((t) => {
          const visible = t.locations.filter((l) => !q || normalizeName(`${l.title} ${l.client_name || ''}`).includes(q));
          // fichas ligadas, agrupadas por cliente; as livres embaixo
          const groups = new Map<string, { name: string; monitor: boolean; locs: Location[] }>();
          for (const l of visible) if (l.client_id) {
            const g = groups.get(l.client_id) || { name: l.client_name || 'Cliente', monitor: l.monitor_only, locs: [] };
            g.locs.push(l); groups.set(l.client_id, g);
          }
          const free = visible.filter((l) => !l.client_id);
          return (
            <div key={t.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.connected ? <><CheckCircle2 size={12} className="mr-1 inline text-emerald-600" />{t.account || 'Conectado'} · {t.locations.length} ficha(s)</> : 'Login do Google ainda não feito'}
                    {t.reauth && ' · precisa fazer login de novo'}
                  </p>
                </div>
                <Button size="sm" variant={t.connected && !t.reauth ? 'outline' : 'default'} onClick={() => login(t)} disabled={busy === t.id}>
                  <LogIn size={14} /> {t.connected ? 'Fazer login de novo' : 'Fazer login'}
                </Button>
              </div>

              {t.locations.length > 0 && (
                <div className="relative max-w-xs">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar ficha ou cliente" className="pl-8" />
                </div>
              )}

              {[...groups.entries()].map(([clientId, g]) => (
                <div key={clientId} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{g.name}{g.monitor && <span className="ml-2 text-xs font-normal text-muted-foreground">só monitoramento</span>}</p>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setOpenMonitor(openMonitor === clientId ? null : clientId)}>
                      <BellRing size={13} /> Avisos no WhatsApp
                    </Button>
                  </div>
                  {g.locs.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5 text-muted-foreground"><MapPin size={13} />{l.title}</span>
                      <Button size="sm" variant="ghost" className="h-7" aria-label={`Desligar ${l.title}`} onClick={() => unassign(l)} disabled={busy === l.id}><Unlink size={13} /></Button>
                    </div>
                  ))}
                  {openMonitor === clientId && <MonitorEditor clientId={clientId} />}
                </div>
              ))}

              {free.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Fichas sem cliente ({free.length})</p>
                  <div className="divide-y rounded-lg border">
                    {free.map((l) => (
                      <div key={l.id} className="space-y-2 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-sm font-medium"><MapPin size={13} className="text-muted-foreground" />{l.title}</p>
                          <Button size="sm" variant="outline" className="h-7" onClick={() => { setPicking(picking === l.id ? null : l.id); setNewName(l.title); }}>Ligar a um cliente</Button>
                        </div>
                        {picking === l.id && (
                          <div className="space-y-2 rounded-lg bg-muted/40 p-2.5">
                            <Input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder="Buscar cliente" className="h-8" />
                            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                              {allClients.filter((c) => !pickQuery.trim() || normalizeName(c.name).includes(normalizeName(pickQuery)))
                                .sort((a, b) => nameMatch(l.title, b.name) - nameMatch(l.title, a.name) || a.name.localeCompare(b.name, 'pt-BR'))
                                .slice(0, 24)
                                .map((c) => (
                                  <Button key={c.id} size="sm" variant="secondary" className="h-7 text-xs" disabled={busy === l.id} onClick={() => assign(t, l, c.id)}>
                                    {c.name}{c.monitor ? ' · monitoramento' : ''}
                                  </Button>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                              <span className="text-xs text-muted-foreground">Não é cliente fixo?</span>
                              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do cliente" className="h-8 max-w-[220px]" />
                              <Button size="sm" className="h-8" disabled={busy === l.id || newName.trim().length < 2} onClick={() => assign(t, l, null)}>
                                Criar cliente só de monitoramento
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

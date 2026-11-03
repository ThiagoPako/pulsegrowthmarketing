import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Facebook, Link2, Loader2, LogIn, Plus, RefreshCw, Search, Sparkles, Unlink, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { nameMatch, normalizeName } from '@/lib/pageMatch';

// Facebooks da equipe (pedido do usuário, 03/11/2026), só para o Thiago: cada Facebook da equipe é um cartão com as
// páginas dele; tocando no cartão aparecem os clientes ligados a ele e as páginas ainda sem cliente, com a sugestão do
// cliente pelo nome da página. O post do Facebook do cliente sai por esse login, na página ligada.

interface TeamPage { id: string; name: string; picture?: string | null; instagram?: string | boolean | null; client_id: string | null; client_name: string | null }
interface TeamFacebook { id: string; name: string; connected: boolean; reauth: boolean; account: string | null; pages: TeamPage[]; instagram_known?: boolean; page_fields?: string[] }
interface ClientLite { id: string; name: string; logo_url?: string | null; has_facebook?: boolean }

const norm = normalizeName;

function Avatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img src={src} alt="" onError={() => setFailed(true)} className={cn('shrink-0 rounded-full bg-muted object-cover', className)} />
  ) : (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground', className)}>{name.charAt(0).toUpperCase()}</span>
  );
}

export default function TeamFacebookPanel({ clients }: { clients: ClientLite[] }) {
  const [teams, setTeams] = useState<TeamFacebook[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<TeamPage | null>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [showOthers, setShowOthers] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await invokeVpsFunction('upload-post/team-facebook', { method: 'GET' });
    // fora o dono, a área nem aparece
    if (/403|Só o Thiago/i.test(String(data?.error || error?.message || error || ''))) { setHidden(true); return; }
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Não deu para ler os Facebooks da equipe'); setTeams([]); return; }
    const list: TeamFacebook[] = data.teams || [];
    setTeams(list);
    setSelectedId((cur) => (cur && list.some((t) => t.id === cur) ? cur : list[0]?.id || null));
  }, []);

  useEffect(() => { load(); }, [load]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  // cliente → onde o Facebook dele está ligado (para avisar antes de trocar)
  const linkOf = useMemo(() => {
    const m = new Map<string, { team: string; page: string }>();
    for (const t of teams || []) for (const pg of t.pages) if (pg.client_id) m.set(pg.client_id, { team: t.name, page: pg.name });
    return m;
  }, [teams]);
  // só a página de cliente aparece (usuário, 03/11/2026): ligada a um cliente, ou com Instagram e com nome de um cliente.
  // Página que a Upload-Post diz não ter Instagram, ou sem cliente parecido, fica em "outras páginas", recolhida.
  const isClientPage = useCallback((pg: TeamPage, igKnown = false) => !!pg.client_id
    || (igKnown ? !!pg.instagram : pg.instagram !== false) && clients.some((c) => nameMatch(pg.name, c.name) >= 0.5), [clients]);
  const selected = teams?.find((t) => t.id === selectedId) || null;
  const q = norm(query);
  const linked = (selected?.pages || []).filter((pg) => pg.client_id && (!q || norm(`${pg.name} ${pg.client_name}`).includes(q)));
  const freeAll = (selected?.pages || []).filter((pg) => !pg.client_id && (!q || norm(pg.name).includes(q)));
  const igKnown = !!selected?.instagram_known;
  const free = freeAll.filter((pg) => isClientPage(pg, igKnown));
  const others = freeAll.filter((pg) => !isClientPage(pg, igKnown));
  // clientes sem Facebook em nenhum lugar (nem ligado a um Facebook da equipe, nem conectado pelo próprio cliente)
  const withoutFacebook = clients.filter((c) => !c.has_facebook && !linkOf.has(c.id));
  const [showWithout, setShowWithout] = useState(false);

  const suggestionFor = useCallback((page: TeamPage): ClientLite | null => {
    let best: ClientLite | null = null; let score = 0;
    for (const c of clients) {
      if (linkOf.has(c.id)) continue;
      const s = nameMatch(page.name, c.name);
      if (s > score) { score = s; best = c; }
    }
    return score >= 0.5 ? best : null;
  }, [clients, linkOf]);

  const create = async () => {
    setBusy('novo');
    const { data, error } = await invokeVpsFunction('upload-post/team-facebook', { body: { name: name.trim() } });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    setName(''); setAdding(false);
    toast.success(`"${data.name}" criado. Agora toque em Fazer login.`);
    await load();
    setSelectedId(data.id);
  };

  const login = async (t: TeamFacebook) => {
    setBusy(t.id);
    const { data, error } = await invokeVpsFunction(`upload-post/team-facebook/${t.id}/login`, { body: {} });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    window.location.href = data.url;
  };

  const link = async (page: TeamPage, client: ClientLite) => {
    if (!selected) return;
    const other = linkOf.get(client.id);
    if (other && !window.confirm(`${client.name} já está com a página "${other.page}" (${other.team}). Trocar para "${page.name}"?`)) return;
    setBusy(page.id);
    const { data, error } = await invokeVpsFunction(`upload-post/team-facebook/${selected.id}/assign`, { body: { page_id: page.id, client_id: client.id } });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    setPicking(null); setPickQuery('');
    toast.success(`${client.name} ligado à página "${page.name}"`);
    load();
  };

  const unlink = async (page: TeamPage) => {
    if (!page.client_id || !window.confirm(`Desligar ${page.client_name} da página "${page.name}"? Os posts do Facebook dele param de sair por esse login.`)) return;
    setBusy(page.id);
    const { data, error } = await invokeVpsFunction(`upload-post/clients/${page.client_id}/team-facebook/remove`, { body: {} });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    toast.success(`${page.client_name} desligado`);
    load();
  };

  if (hidden) return null;

  const pickList = clients
    .filter((c) => !pickQuery.trim() || norm(c.name).includes(norm(pickQuery)))
    .map((c) => ({ c, score: picking ? nameMatch(picking.name, c.name) : 0 }))
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, 'pt-BR'));

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#1877F2]/10 text-[#1877F2]"><Facebook size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Facebooks da equipe</p>
            <p className="text-xs text-muted-foreground">Escolha um Facebook e ligue cada página ao cliente dela. Os posts do Facebook do cliente saem por esse login.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Atualizar" aria-label="Atualizar" onClick={() => { setTeams(null); load(); }}>
            <RefreshCw size={14} />
          </Button>
        </div>

        {teams && teams.length > 0 && withoutFacebook.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
            <button type="button" onClick={() => setShowWithout((v) => !v)} className="flex w-full items-center gap-2 text-left text-xs">
              <AlertTriangle size={14} className="shrink-0 text-amber-500" />
              <span className="flex-1"><b className="tabular-nums">{withoutFacebook.length}</b> cliente{withoutFacebook.length === 1 ? '' : 's'} sem página do Facebook conectada a nenhum Facebook</span>
              <span className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">{showWithout ? 'Esconder' : 'Ver quais'}</span>
            </button>
            {showWithout && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {withoutFacebook.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px]">
                    <Avatar src={c.logo_url} name={c.name} className="h-4 w-4 text-[8px]" /> {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* cartões dos Facebooks */}
        {teams === null ? (
          <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => {
              const n = t.pages.filter((pg) => isClientPage(pg, !!t.instagram_known)).length; const m = t.pages.filter((pg) => pg.client_id).length;
              const on = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  aria-pressed={on}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2]',
                    on ? 'border-[#1877F2]/60 bg-[#1877F2]/[0.07] shadow-sm' : 'border-border hover:border-[#1877F2]/30 hover:bg-muted/40',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Facebook size={16} className="text-[#1877F2]" />
                    <span className="truncate text-sm font-semibold">{t.name}</span>
                  </div>
                  <p className={cn('mt-1 flex items-center gap-1 truncate text-xs', t.connected && !t.reauth ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                    {t.connected && !t.reauth ? <><CheckCircle2 size={12} /> {t.account || 'Conectado'}</> : <><AlertTriangle size={12} /> {t.reauth ? 'Login venceu' : 'Falta o login'}</>}
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <span className="text-2xl font-bold tabular-nums">{n}<span className="ml-1 text-xs font-medium text-muted-foreground">página{n === 1 ? '' : 's'} de cliente</span></span>
                    <span className="text-xs tabular-nums text-muted-foreground">{m} com cliente</span>
                  </div>
                  {n > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#1877F2] transition-all" style={{ width: `${Math.round((m / n) * 100)}%` }} />
                    </div>
                  )}
                </button>
              );
            })}
            {adding ? (
              <div className="space-y-2 rounded-2xl border border-dashed border-border p-4">
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim().length >= 2) create(); }} placeholder="Nome (ex.: Facebook Thiago)" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={create} disabled={busy === 'novo' || name.trim().length < 2} className="flex-1 gap-1">
                    {busy === 'novo' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Criar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setName(''); }} aria-label="Cancelar"><X size={14} /></Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-[#1877F2]/40 hover:text-foreground">
                <Plus size={18} /> Novo Facebook
              </button>
            )}
          </div>
        )}

        {/* páginas do Facebook escolhido */}
        {selected && (
          <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{selected.name}</p>
              <Button size="sm" variant={selected.connected && !selected.reauth ? 'outline' : 'default'} className="ml-auto h-8 gap-1 text-xs" disabled={busy === selected.id} onClick={() => login(selected)}>
                {busy === selected.id ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />} {selected.connected ? 'Entrar de novo' : 'Fazer login'}
              </Button>
            </div>
            {!selected.connected ? (
              <p className="text-sm text-muted-foreground">Toque em Fazer login, entre no Facebook que administra as páginas e marque as páginas dos clientes.</p>
            ) : selected.pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma página liberada. Toque em Entrar de novo e marque as páginas dos clientes na tela do Facebook.</p>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar página ou cliente" className="h-9 pl-8" />
                </div>
                {!igKnown && (
                  <p className="text-[11px] text-muted-foreground" title={selected.page_fields?.length ? `Campos recebidos: ${selected.page_fields.join(', ')}` : undefined}>
                    A Upload-Post não informou se cada página tem Instagram; aparecem as páginas com nome de cliente. Confira o Instagram antes de ligar.
                  </p>
                )}

                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">Clientes ligados · {linked.length}</h4>
                  {linked.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum cliente ligado ainda neste Facebook.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {linked.map((pg) => {
                        const c = pg.client_id ? clientById.get(pg.client_id) : null;
                        return (
                          <div key={pg.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                            <Avatar src={c?.logo_url} name={pg.client_name || '?'} className="h-10 w-10" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{pg.client_name}</p>
                              <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                <Avatar src={pg.picture} name={pg.name} className="h-4 w-4 text-[8px]" /> {pg.name}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Desligar" aria-label={`Desligar ${pg.client_name}`} disabled={busy === pg.id} onClick={() => unlink(pg)}>
                              {busy === pg.id ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {free.length === 0 && others.length > 0 && linked.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma página com cara de cliente neste Facebook.</p>
                )}
                {free.length > 0 && (
                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">Páginas sem cliente · {free.length}</h4>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {free.map((pg) => {
                        const sug = suggestionFor(pg);
                        return (
                          <div key={pg.id} className="space-y-2 rounded-xl border border-dashed border-border bg-card p-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar src={pg.picture} name={pg.name} className="h-9 w-9" />
                              <p className="min-w-0 flex-1 truncate text-sm font-medium">{pg.name}</p>
                              {typeof pg.instagram === 'string' && pg.instagram !== 'true' && <span className="truncate text-[10px] text-pink-600 dark:text-pink-400">@{pg.instagram}</span>}
                            </div>
                            <div className="flex gap-1.5">
                              {sug && (
                                <Button size="sm" className="h-8 min-w-0 flex-1 gap-1 text-xs" disabled={busy === pg.id} onClick={() => link(pg, sug)} title={`Ligar a ${sug.name}`}>
                                  {busy === pg.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} <span className="truncate">{sug.name}</span>
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className={cn('h-8 gap-1 text-xs', !sug && 'flex-1')} onClick={() => { setPicking(pg); setPickQuery(''); }}>
                                <Link2 size={12} /> {sug ? 'Outro' : 'Ligar a um cliente'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {others.length > 0 && (
                  <section className="space-y-2">
                    <button type="button" onClick={() => setShowOthers((v) => !v)} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                      {showOthers ? 'Esconder' : 'Mostrar'} outras {others.length} página{others.length === 1 ? '' : 's'} deste Facebook ({igKnown ? 'sem Instagram ou sem cliente' : 'sem cliente parecido'})
                    </button>
                    {showOthers && (
                      <div className="grid gap-2 opacity-80 sm:grid-cols-2 xl:grid-cols-3">
                        {others.map((pg) => (
                          <div key={pg.id} className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-card p-2.5">
                            <Avatar src={pg.picture} name={pg.name} className="h-7 w-7" />
                            <p className="min-w-0 flex-1 truncate text-xs">{pg.name}</p>
                            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => { setPicking(pg); setPickQuery(''); }}>
                              <Link2 size={11} /> Ligar
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Instagram: a Upload-Post liga um Instagram por cliente, então ele continua no botão Conectar de cada cliente.
        </p>
      </CardContent>

      {/* escolher o cliente da página */}
      <Dialog open={!!picking} onOpenChange={(o) => { if (!o) setPicking(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {picking && <Avatar src={picking.picture} name={picking.name} className="h-7 w-7" />} {picking?.name}
            </DialogTitle>
            <DialogDescription>Escolha o cliente dono desta página. Os mais parecidos com o nome da página vêm primeiro.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder="Buscar cliente" className="pl-8" />
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {pickList.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cliente com esse nome.</p>}
            {pickList.map(({ c, score }) => {
              const other = linkOf.get(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!!busy}
                  onClick={() => picking && link(picking, c)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Avatar src={c.logo_url} name={c.name} className="h-8 w-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    {other && <span className="block truncate text-[11px] text-amber-600 dark:text-amber-400">Já ligado a "{other.page}"</span>}
                  </span>
                  {score >= 0.5 && <span className="rounded-full bg-[#1877F2]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1877F2]">Sugestão</span>}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

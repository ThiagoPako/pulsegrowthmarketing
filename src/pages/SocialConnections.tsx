import { useEffect, useMemo, useRef, useState } from 'react';
import TeamFacebookPanel from '@/components/social/TeamFacebookPanel';
import { useLang, tr } from '@/lib/i18n';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { useCity } from '@/contexts/CityContext';
import ClientLogo from '@/components/ClientLogo';
import { setPortalInsightsEnabled, type ConnectedSocialAccount } from '@/services/socialPostsApi';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Instagram, Facebook, Search, Loader2, RefreshCw, Unlink, CheckCircle2, AlertTriangle, Copy, Music2, Linkedin, Youtube, KeyRound, Link2, MapPin, AtSign, Twitter, Pin } from 'lucide-react';

interface ClientConnection {
  id: string;
  name: string;
  logo_url?: string | null;
  city: string | null;
  accounts: ConnectedSocialAccount[];
  portal_insights_enabled?: boolean;
  /** redes que a Pulse cuida do cliente (cadastro → Redes sociais) */
  social_networks?: string[] | null;
}

// Conexões Sociais 100% pela Upload-Post (usuário, 03/11/2026): todas as redes que ela conecta, com filtro por rede
const NETWORKS = [
  { id: 'instagram', label: 'Instagram', Icon: Instagram },
  { id: 'facebook', label: 'Facebook', Icon: Facebook },
  { id: 'tiktok', label: 'TikTok', Icon: Music2 },
  { id: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { id: 'youtube', label: 'YouTube', Icon: Youtube },
  { id: 'threads', label: 'Threads', Icon: AtSign },
  { id: 'x', label: 'X', Icon: Twitter },
  { id: 'pinterest', label: 'Pinterest', Icon: Pin },
  { id: 'google_business', label: 'Google', Icon: MapPin },
] as const;
type NetworkId = typeof NETWORKS[number]['id'];
/** Redes do plano do cliente (sem cadastro: Instagram e Facebook) mais as que ele conectou por fora do plano. */
function clientNetworks(c: { social_networks?: string[] | null; accounts: ConnectedSocialAccount[] }): NetworkId[] {
  const plan = (c.social_networks?.length ? c.social_networks : ['instagram', 'facebook']) as string[];
  return NETWORKS.map((n) => n.id).filter((id) => plan.includes(id) || c.accounts.some((a) => a.platform === id));
}

interface UploadPostStatus { configured: boolean; key_end?: string; plan?: string | null; limit?: number | null; used?: number; error?: string }

export default function SocialConnections() {
  const { activeCity } = useCity();
  const { t } = useLang();
  const [clients, setClients] = useState<ClientConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'connected' | 'pending'>('all');
  const [net, setNet] = useState<'all' | NetworkId>('all');

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<{ client: ClientConnection; account: ConnectedSocialAccount } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const lastLoadRef = useRef(0);
  // Upload-Post (02/11/2026): chave (só admin), link de conexão por cliente e atualização das contas
  const [up, setUp] = useState<UploadPostStatus | null>(null);
  const [upKey, setUpKey] = useState('');
  const [upSaving, setUpSaving] = useState(false);
  const [upBusy, setUpBusy] = useState<string | null>(null);
  const [upLink, setUpLink] = useState<{ client: ClientConnection; url: string } | null>(null);

  const loadUploadPost = async () => {
    const { data, error } = await invokeVpsFunction('upload-post/config', { method: 'GET' });
    if (!error && data && !data.error) setUp(data as UploadPostStatus);
  };
  useEffect(() => { loadUploadPost(); }, []);

  const saveUploadPostKey = async () => {
    setUpSaving(true);
    try {
      const { data, error } = await invokeVpsFunction('upload-post/config', { method: 'PUT', body: { api_key: upKey.trim() } });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não deu para salvar a chave.');
      setUp(data as UploadPostStatus);
      setUpKey('');
      toast.success('Chave da Upload-Post salva e conferida.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpSaving(false);
    }
  };

  /** Link da página de conexão da Upload-Post do cliente (a equipe abre ou manda ao cliente; vale 48 h). */
  const uploadPostConnect = async (client: ClientConnection) => {
    setUpBusy(client.id);
    try {
      const { data, error } = await invokeVpsFunction(`upload-post/clients/${client.id}/connect`, { body: {} });
      if (error || data?.error || !data?.url) throw new Error(data?.error || error?.message || 'Não deu para gerar o link.');
      setUpLink({ client, url: data.url });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpBusy(null);
    }
  };

  const uploadPostSync = async (client: ClientConnection) => {
    setUpBusy(client.id);
    try {
      const { data, error } = await invokeVpsFunction(`upload-post/clients/${client.id}/sync`, { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Não deu para atualizar.');
      const n = (data?.accounts || []).length;
      if ((data?.facebook_pages || []).length > 1 && !data?.facebook_page_id) toast.warning('O Facebook tem mais de uma Página: fale com a Marcely para escolher a do cliente.');
      toast.success(n ? `${n} rede(s) conectada(s) pela Upload-Post.` : 'Nenhuma rede conectada ainda.');
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpBusy(null);
    }
  };






  /** Liga/desliga a aba de desempenho no portal daquele cliente. */
  const togglePortalInsights = async (client: ClientConnection, enabled: boolean) => {
    setTogglingId(client.id);
    try {
      await setPortalInsightsEnabled(client.id, enabled);
      setClients(prev => prev.map(c => (c.id === client.id ? { ...c, portal_insights_enabled: enabled } : c)));
      toast.success(enabled ? 'Desempenho liberado no portal' : 'Desempenho ocultado do portal');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTogglingId(null);
    }
  };


  /** silent: atualiza mantendo a lista na tela (volta à aba), sem "Carregando…" nem perder a rolagem. */
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    lastLoadRef.current = Date.now();
    try {
      const { data, error } = await invokeVpsFunction('social-posts/accounts-overview', { method: 'GET' });
      if (error) throw new Error(error.message);
      setClients((data?.clients ?? []) as ClientConnection[]);
    } catch (err) {
      if (!silent) toast.error('Erro ao carregar conexões: ' + (err as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // a lista segue a cidade escolhida no topo (o servidor filtra pela cidade e os clientes globais)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [activeCity]);

  // Após autorizar na Meta (outra aba/janela), atualiza a lista sozinho ao voltar.
  useEffect(() => {
    // Ao voltar para a aba: atualiza em silêncio e no máximo a cada 60 s
    // (o aviso 'pulse-social-connected' já cobre a autorização feita na mesma máquina).
    const refresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadRef.current > 60_000) load(true);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'pulse-social-connected') {
        toast.success(tr('Conta do Instagram conectada com sucesso.', 'Instagram Business account connected successfully via Meta API.'));
        load(true);
      }
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('message', onMessage);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel('pulse-social'); channel.onmessage = onMessage; } catch { /* navegador antigo */ }
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('message', onMessage);
      channel?.close();
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter(c => {
      if (term && !c.name.toLowerCase().includes(term)) return false;
      const nets = clientNetworks(c);
      // com uma rede escolhida, só os clientes que têm essa rede no plano (ou conectada)
      if (net !== 'all' && !nets.includes(net)) return false;
      const wanted = net === 'all' ? nets : [net];
      const connected = wanted.every((id) => c.accounts.some((a) => a.platform === id && a.status === 'connected'));
      if (filter === 'connected' && !connected) return false;
      if (filter === 'pending' && connected) return false;
      return true;
    });
  }, [clients, search, filter, net]);

  const stats = useMemo(() => {
    const done = (c: ClientConnection) => clientNetworks(c).every((id) => c.accounts.some((a) => a.platform === id && a.status === 'connected'));
    const perNet = Object.fromEntries(NETWORKS.map((n) => [n.id, {
      plan: clients.filter((c) => clientNetworks(c).includes(n.id)).length,
      connected: clients.filter((c) => c.accounts.some((a) => a.platform === n.id && a.status === 'connected')).length,
    }])) as Record<NetworkId, { plan: number; connected: number }>;
    return { total: clients.length, done: clients.filter(done).length, pending: clients.filter((c) => !done(c)).length, perNet };
  }, [clients]);





  const disconnect = async (client: ClientConnection, account: ConnectedSocialAccount) => {
    setDisconnecting(true);
    try {
      const { error } = await invokeVpsFunction('social-accounts/disconnect', {
        body: { client_id: client.id, platform: account.platform, account_id: account.id },
      });
      if (error) throw new Error(error.message);
      toast.success(tr('Conta desconectada', 'Account disconnected'));
      setConfirmDisconnect(null);
      await load(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDisconnecting(false);
    }
  };

  const accountLabel = (account: ConnectedSocialAccount) => (
    account.platform === 'instagram' && account.username
      ? `@${account.username.replace(/^@/, '')}`
      : account.account_name
  );

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('Conexões Sociais', 'Social Connections')}</h1>
          <p className="text-sm text-muted-foreground">{t('Conecte Instagram e Facebook de todos os clientes para postagem automática.', 'Connect Instagram Professional and Facebook accounts for automatic publishing.')}</p>
        </div>
        <Button variant="outline" onClick={() => load()} className="gap-2">
          <RefreshCw size={16} /> {t('Atualizar', 'Refresh')}
        </Button>
      </header>

      {up && (
        <Card className="border-primary/40">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <KeyRound size={18} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Upload-Post · postagem automática</p>
                <p className="text-xs text-muted-foreground">
                  {up.configured
                    ? `Chave ativa (final ${up.key_end}).${up.used != null ? ` Perfis usados: ${up.used}${up.limit ? ` de ${up.limit}` : ''}.` : ''}${up.plan ? ` Plano: ${up.plan}.` : ''}${up.error ? ` Aviso: ${up.error}` : ''}`
                    : 'Cole a chave da API (Upload-Post → API Keys) para os clientes conectarem Instagram, Facebook, TikTok, LinkedIn e YouTube.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Input type="password" autoComplete="off" value={upKey} onChange={e => setUpKey(e.target.value)}
                placeholder={up.configured ? 'Trocar a chave' : 'Chave da API da Upload-Post'} />
              <Button onClick={saveUploadPostKey} disabled={upSaving || upKey.trim().length < 16} className="shrink-0">
                {upSaving ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}
              </Button>
            </div>
            {up.configured && (
              <Button variant="outline" size="sm" className="gap-1" onClick={async () => {
                const { data, error } = await invokeVpsFunction('social-hub/webhook/register', { body: {} });
                if (error || data?.error) toast.error(data?.error || error?.message || 'Não deu para ligar os avisos.');
                else toast.success(data?.secret_saved ? 'Avisos em tempo real ligados (comentários, direct e contas).' : 'Avisos ligados, mas a Upload-Post não devolveu a chave de assinatura: confira no painel deles.');
              }}>
                <Link2 size={14} /> Ligar avisos em tempo real
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {up?.configured && <TeamFacebookPanel clients={clients.map(c => ({ id: c.id, name: c.name, logo_url: c.logo_url, has_facebook: c.accounts.some(a => a.platform === 'facebook' && a.status === 'connected'), accounts: c.accounts.map(a => ({ platform: a.platform, name: a.account_name, username: a.username || null, status: a.status })) }))} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Clientes', value: stats.total },
          { label: 'Todas as redes conectadas', value: stats.done },
          { label: 'Com rede pendente', value: stats.pending },
          { label: 'Instagram conectados', value: stats.perNet.instagram.connected },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente…" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v: 'all' | 'connected' | 'pending') => setFilter(v)}>
          <SelectTrigger className="w-full md:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="connected">Conectados</SelectItem>
            <SelectItem value="pending">Com rede pendente</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por rede" style={{ scrollbarWidth: 'none' }}>
        <Button size="sm" variant={net === 'all' ? 'default' : 'outline'} className="h-8 shrink-0 rounded-full" onClick={() => setNet('all')}>Todas as redes</Button>
        {NETWORKS.map(({ id, label, Icon }) => (
          <Button key={id} size="sm" variant={net === id ? 'default' : 'outline'} className="h-8 shrink-0 gap-1.5 rounded-full" aria-pressed={net === id} onClick={() => setNet(net === id ? 'all' : id)}>
            <Icon size={13} /> {label}
            <span className="tabular-nums opacity-70">{stats.perNet[id].connected}/{stats.perNet[id].plan}</span>
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="animate-spin" size={18} /> Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(client => {
            const ig = client.accounts.find(a => a.platform === 'instagram');
            const plan = client.social_networks?.length ? client.social_networks : ['instagram', 'facebook'];
            const rows = clientNetworks(client).filter((id) => net === 'all' || id === net).flatMap((plat) => {
              const list = client.accounts.filter(a => a.platform === plat);
              return list.length ? list.map(account => ({ plat, account, duplicated: list.length > 1 })) : [{ plat, account: undefined as ConnectedSocialAccount | undefined, duplicated: false }];
            });
            const duplicatedPlatforms = NETWORKS.map((n) => n.id).filter(plat => client.accounts.filter(a => a.platform === plat).length > 1);
            return (
              <Card key={client.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><ClientLogo client={{ companyName: client.name, color: '', logoUrl: client.logo_url || undefined }} size="sm" /><span className="truncate">{client.name}</span></span>
                    {client.city && <Badge variant="outline" className="shrink-0">{client.city}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {duplicatedPlatforms.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>
                        Mais de uma conta de {duplicatedPlatforms.join(' e ')} ligada a este cliente. A postagem automática fica parada
                        até sobrar só a dele: desconecte as que são de outros clientes.
                      </span>
                    </div>
                  )}
                  {rows.map(({ plat, account, duplicated }) => {
                    const meta = NETWORKS.find((n) => n.id === plat)!;
                    const Icon = meta.Icon;
                    const label = meta.label;
                    return (
                    <div key={account?.id || plat} className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${duplicated ? 'border-destructive/40' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {account?.profile_picture_url ? (
                          <img
                            src={account.profile_picture_url}
                            alt={`Foto do perfil ${account.username || account.account_name}`}
                            className="h-9 w-9 rounded-full object-cover shrink-0 border"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Icon size={16} className="text-muted-foreground" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate flex items-center gap-1.5">
                            {label}
                            {!plan.includes(plat) && <Badge variant="outline" className="h-4 px-1 text-[10px]">fora do plano</Badge>}
                          </p>
                          {account ? (
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <CheckCircle2 size={12} className="text-primary shrink-0" />
                              {accountLabel(account)}
                              {account.expiring_soon && (
                                <span className="text-destructive flex items-center gap-1"><AlertTriangle size={12} /> token expirando</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600 dark:text-amber-400">Não conectado</p>
                          )}
                        </div>
                      </div>
                      {account && (
                        <Button size="sm" variant="ghost" className="shrink-0" title="Desconectar" onClick={() => setConfirmDisconnect({ client, account })}>
                          <Unlink size={14} />
                        </Button>
                      )}


                    </div>
                    );
                  })}


                  {up?.configured !== false && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Conectar as redes do cliente</p>
                        <p className="text-xs text-muted-foreground">Abra aqui ou mande o link ao cliente. As redes são as marcadas no cadastro dele.</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" title="Atualizar contas da Upload-Post" disabled={upBusy === client.id} onClick={() => uploadPostSync(client)}>
                          <RefreshCw size={14} />
                        </Button>
                        <Button size="sm" className="gap-1" disabled={upBusy === client.id} onClick={() => uploadPostConnect(client)}>
                          {upBusy === client.id ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Conectar
                        </Button>
                      </div>
                    </div>
                  )}






                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Mostrar desempenho no portal</p>
                      <p className="text-xs text-muted-foreground">
                        O cliente vê alcance, seguidores e resultados das publicações.
                      </p>
                    </div>
                    <Switch
                      checked={!!client.portal_insights_enabled}
                      disabled={!ig || togglingId === client.id}
                      onCheckedChange={v => togglePortalInsights(client, v)}
                    />
                  </div>
                </CardContent>

              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!upLink} onOpenChange={o => { if (!o) { const c = upLink?.client; setUpLink(null); if (c) uploadPostSync(c); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar as redes · {upLink?.client.name}</DialogTitle>
            <DialogDescription>
              Abra o link e conecte cada rede do cliente, ou mande o link para ele fazer sozinho. A página é da Pulse e vale por 7 dias.
              Ao fechar esta janela, as contas conectadas aparecem no cartão do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={upLink?.url ?? ''} onFocus={e => e.currentTarget.select()} />
            <Button variant="outline" className="gap-1 shrink-0" onClick={async () => {
              if (!upLink) return;
              try { await navigator.clipboard.writeText(upLink.url); toast.success('Link copiado'); } catch { toast.error('Copie manualmente o link acima.'); }
            }}>
              <Copy size={14} /> Copiar
            </Button>
          </div>
          <DialogFooter className="gap-2">
            <Button asChild><a href={upLink?.url} target="_blank" rel="noreferrer">Abrir e conectar</a></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <AlertDialog open={!!confirmDisconnect} onOpenChange={o => { if (!o && !disconnecting) setConfirmDisconnect(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Desconectar {confirmDisconnect ? accountLabel(confirmDisconnect.account) : ''} de {confirmDisconnect?.client.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os posts agendados nessa rede vão falhar até ela ser conectada de novo pelo link de conexão do cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmDisconnect) disconnect(confirmDisconnect.client, confirmDisconnect.account);
              }}
            >
              {disconnecting && <Loader2 size={14} className="animate-spin mr-1" />}
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>




    </div>
  );
}

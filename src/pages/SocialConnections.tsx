import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang, tr } from '@/lib/i18n';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { setPortalInsightsEnabled, diagnoseClientConnection, type ConnectedSocialAccount, type DiagnosticCheck } from '@/services/socialPostsApi';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Instagram, Facebook, Search, Loader2, RefreshCw, Unlink, CheckCircle2, AlertTriangle, Share2, Copy, Stethoscope, XCircle } from 'lucide-react';

interface ClientConnection {
  id: string;
  name: string;
  city: string | null;
  accounts: ConnectedSocialAccount[];
  portal_insights_enabled?: boolean;
}

type Platform = 'instagram' | 'facebook';

export default function SocialConnections() {
  const { t } = useLang();
  const [clients, setClients] = useState<ClientConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'connected' | 'pending'>('all');

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ client: ClientConnection; url: string; expires: string; reused: boolean } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<{ client: ClientConnection; account: ConnectedSocialAccount } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const lastLoadRef = useRef(0);
  const [diagBusy, setDiagBusy] = useState<string | null>(null);
  const [diag, setDiag] = useState<{ name: string; checks: DiagnosticCheck[] } | null>(null);

  /** Roda o teste de conexão do cliente e mostra o resultado em linguagem simples. */
  const runDiagnostic = async (client: ClientConnection) => {
    setDiagBusy(client.id);
    try {
      const checks = await diagnoseClientConnection(client.id);
      setDiag({ name: client.name, checks });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDiagBusy(null);
    }
  };


  /**
   * Link público para o cliente autorizar sozinho as próprias contas.
   * Primeiro reaproveita o link que ainda vale (o cliente pode já ter recebido);
   * "Gerar novo" troca o link e o anterior para de funcionar.
   */
  const generateInviteLink = async (client: ClientConnection, forceNew = false) => {
    setLinkBusy(client.id);
    try {
      const { data, error } = await invokeVpsFunction('social-connect-links', {
        body: { client_id: client.id, reuse: !forceNew },
      });
      if (error || data?.error || !data?.path) {
        throw new Error(data?.error || error?.message || 'Não foi possível gerar o link.');
      }
      // O link precisa abrir no domínio de produção: o retorno do login da Meta
      // está cadastrado como https://agenciapulse.tech/ e só funciona lá.
      const url = `https://agenciapulse.tech${data.path}`;
      const reused = !!data.reused;
      setInviteLink({
        client,
        url,
        expires: new Date(data.expires_at).toLocaleDateString('pt-BR'),
        reused,
      });
      try {
        await navigator.clipboard.writeText(url);
        toast.success(reused ? 'Link atual copiado.' : 'Link gerado e copiado.');
      } catch {
        toast.success(reused ? 'Link atual aberto.' : 'Link gerado.');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLinkBusy(null);
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

  useEffect(() => { load(); }, []);

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
      const connected = c.accounts.length > 0;
      if (filter === 'connected' && !connected) return false;
      if (filter === 'pending' && connected) return false;
      return true;
    });
  }, [clients, search, filter]);

  const stats = useMemo(() => ({
    total: clients.length,
    ig: clients.filter(c => c.accounts.some(a => a.platform === 'instagram')).length,
    fb: clients.filter(c => c.accounts.some(a => a.platform === 'facebook')).length,
    pending: clients.filter(c => c.accounts.length === 0).length,
  }), [clients]);





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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Clientes', value: stats.total },
          { label: 'Com Instagram', value: stats.ig },
          { label: 'Com Facebook', value: stats.fb },
          { label: 'Sem conexão', value: stats.pending },
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
            <SelectItem value="pending">Sem conexão</SelectItem>
          </SelectContent>
        </Select>
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
            const rows = (['instagram', 'facebook'] as Platform[]).flatMap(plat => {
              const list = client.accounts.filter(a => a.platform === plat);
              return list.length ? list.map(account => ({ plat, account, duplicated: list.length > 1 })) : [{ plat, account: undefined, duplicated: false }];
            });
            const duplicatedPlatforms = (['instagram', 'facebook'] as Platform[]).filter(plat => client.accounts.filter(a => a.platform === plat).length > 1);
            return (
              <Card key={client.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span className="truncate">{client.name}</span>
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
                    const Icon = plat === 'instagram' ? Instagram : Facebook;
                    const label = plat === 'instagram' ? 'Instagram' : 'Facebook';
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
                          <p className="text-sm font-medium truncate">{label}</p>
                          {account ? (
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <CheckCircle2 size={12} className="text-primary shrink-0" />
                              {accountLabel(account)}
                              {account.expiring_soon && (
                                <span className="text-destructive flex items-center gap-1"><AlertTriangle size={12} /> token expirando</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Não conectado</p>
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

                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Link de autorização do cliente</p>
                      <p className="text-xs text-muted-foreground">
                        Gere um link e envie ao cliente para ele entrar na própria conta.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 shrink-0"
                      disabled={linkBusy === client.id}
                      onClick={() => generateInviteLink(client)}
                    >
                      {linkBusy === client.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Share2 size={14} />}
                      Gerar link
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t('Testar conexão', 'Test Connection')}</p>
                      <p className="text-xs text-muted-foreground">
                        Verifica o acesso ao perfil, o limite de postagens e as métricas.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 shrink-0"
                      disabled={diagBusy === client.id}
                      onClick={() => runDiagnostic(client)}
                    >
                      {diagBusy === client.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Stethoscope size={14} />}
                      Testar
                    </Button>
                  </div>




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

      <Dialog open={!!inviteLink} onOpenChange={o => !o && setInviteLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de autorização</DialogTitle>
            <DialogDescription>
              {inviteLink?.reused ? 'Este é o link atual de ' : 'Envie este link para '}{inviteLink?.client.name}. O cliente entra na conta dele
              na Meta e autoriza a agência. Válido até {inviteLink?.expires} (depois de usado, vale por mais 24 h).
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={inviteLink?.url ?? ''} onFocus={e => e.currentTarget.select()} />
            <Button
              variant="outline"
              className="gap-1 shrink-0"
              onClick={async () => {
                if (!inviteLink) return;
                try {
                  await navigator.clipboard.writeText(inviteLink.url);
                  toast.success('Link copiado');
                } catch {
                  toast.error('Copie manualmente o link acima.');
                }
              }}
            >
              <Copy size={14} /> Copiar
            </Button>
          </div>
          <DialogFooter className="gap-2">
            {inviteLink?.reused && (
              <Button
                variant="outline"
                disabled={linkBusy === inviteLink.client.id}
                onClick={() => {
                  if (!inviteLink) return;
                  if (!window.confirm('Gerar um novo link? O link enviado antes para o cliente deixa de funcionar.')) return;
                  generateInviteLink(inviteLink.client, true);
                }}
              >
                Gerar novo link
              </Button>
            )}
            <Button variant="outline" onClick={() => setInviteLink(null)}>Fechar</Button>
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
              As postagens automáticas agendadas nessa conta vão falhar até o cliente autorizar de novo pelo link.
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

      <Dialog open={!!diag} onOpenChange={o => !o && setDiag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teste de conexão · {diag?.name}</DialogTitle>
            <DialogDescription>
              Resultado da verificação feita agora direto na Meta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {diag?.checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
                {c.ok
                  ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                  : <XCircle size={16} className="mt-0.5 shrink-0 text-destructive" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  {c.detail && <p className="text-xs text-muted-foreground break-words">{c.detail}</p>}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiag(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



    </div>
  );
}

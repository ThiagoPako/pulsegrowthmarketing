import { useEffect, useMemo, useState } from 'react';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { setPortalInsightsEnabled, diagnoseClientConnection, type ConnectedSocialAccount, type DiagnosticCheck } from '@/services/socialPostsApi';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Instagram, Facebook, Search, Loader2, RefreshCw, Unlink, CheckCircle2, AlertTriangle, LogIn, Share2, Copy, Stethoscope, XCircle } from 'lucide-react';

interface ClientConnection {
  id: string;
  name: string;
  city: string | null;
  accounts: ConnectedSocialAccount[];
  portal_insights_enabled?: boolean;
}

type Platform = 'instagram' | 'facebook';

export default function SocialConnections() {
  const [clients, setClients] = useState<ClientConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'connected' | 'pending'>('all');

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ name: string; url: string; expires: string } | null>(null);
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


  /** Cria o link público para o cliente autorizar sozinho as próprias contas. */
  const generateInviteLink = async (client: ClientConnection) => {
    setLinkBusy(client.id);
    try {
      const { data, error } = await invokeVpsFunction('social-connect-links', {
        body: { client_id: client.id },
      });
      if (error || data?.error || !data?.path) {
        throw new Error(data?.error || error?.message || 'Não foi possível gerar o link.');
      }
      const url = `${window.location.origin}${data.path}`;
      setInviteLink({
        name: client.name,
        url,
        expires: new Date(data.expires_at).toLocaleDateString('pt-BR'),
      });
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link gerado e copiado.');
      } catch {
        toast.success('Link gerado.');
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


  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeVpsFunction('social-posts/accounts-overview', { method: 'GET' });
      if (error) throw new Error(error.message);
      setClients((data?.clients ?? []) as ClientConnection[]);
    } catch (err) {
      toast.error('Erro ao carregar conexões: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  /**
   * Login oficial pela Meta: abre a janela de autorização do Instagram/Facebook,
   * espera o retorno com o `code` e troca por token no backend da VPS.
   * Nenhum token passa pelo navegador — a troca acontece só no servidor.
   */
  const connectViaOAuth = async (client: ClientConnection, plat: Platform) => {
    const busyKey = `${client.id}:${plat}`;
    setOauthBusy(busyKey);
    const redirectUri = `${window.location.origin}/`;
    try {
      const { data, error } = await invokeVpsFunction('meta-oauth', {
        body: {
          action: plat === 'instagram' ? 'get_instagram_oauth_url' : 'get_oauth_url',
          client_id: client.id,
          redirect_uri: redirectUri,
        },
      });
      if (error || data?.error || !data?.oauth_url) {
        throw new Error(data?.error || error?.message || 'Configure o App da Meta em Configurações → Integração Meta.');
      }

      const popup = window.open(data.oauth_url, 'meta_oauth', 'width=600,height=760,scrollbars=yes');
      if (!popup) throw new Error('Permita janelas pop-up para concluir o login.');

      const code = await new Promise<string>((resolve, reject) => {
        const timer = window.setInterval(() => {
          try {
            if (popup.closed) {
              window.clearInterval(timer);
              reject(new Error('Janela de login fechada antes de concluir.'));
              return;
            }
            // Só conseguimos ler quando a Meta devolveu para o nosso domínio.
            const url = popup.location.href;
            if (!url.startsWith(window.location.origin)) return;
            const params = new URLSearchParams(popup.location.search);
            const returnedCode = params.get('code');
            const denied = params.get('error') || params.get('error_reason');
            if (returnedCode) {
              window.clearInterval(timer);
              popup.close();
              resolve(returnedCode);
            } else if (denied) {
              window.clearInterval(timer);
              popup.close();
              reject(new Error('Autorização recusada pelo usuário.'));
            }
          } catch {
            /* enquanto está no domínio da Meta a leitura é bloqueada — apenas aguarda */
          }
        }, 600);
      });

      toast.info('Conectando conta…');
      const { data: result, error: exchangeError } = await invokeVpsFunction('meta-oauth', {
        body: {
          action: plat === 'instagram' ? 'exchange_instagram_code' : 'exchange_code',
          code,
          redirect_uri: redirectUri,
          client_id: client.id,
        },
      });
      if (exchangeError || result?.error) {
        throw new Error(result?.error || exchangeError?.message || 'Falha ao concluir a conexão.');
      }
      toast.success(`Conectado: ${(result?.accounts ?? []).length} conta(s)`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOauthBusy(null);
    }
  };


  const disconnect = async (client: ClientConnection, plat: Platform) => {
    try {
      const { error } = await invokeVpsFunction('social-accounts/disconnect', {
        body: { client_id: client.id, platform: plat },
      });
      if (error) throw new Error(error.message);
      toast.success('Conta desconectada');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Conexões Sociais</h1>
          <p className="text-sm text-muted-foreground">Conecte Instagram e Facebook de todos os clientes para postagem automática.</p>
        </div>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw size={16} /> Atualizar
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
            const fb = client.accounts.find(a => a.platform === 'facebook');
            return (
              <Card key={client.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span className="truncate">{client.name}</span>
                    {client.city && <Badge variant="outline" className="shrink-0">{client.city}</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { plat: 'instagram' as Platform, icon: Instagram, label: 'Instagram', account: ig },
                    { plat: 'facebook' as Platform, icon: Facebook, label: 'Facebook', account: fb },
                  ].map(({ plat, icon: Icon, label, account }) => (
                    <div key={plat} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon size={16} className="shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{label}</p>
                          {account ? (
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <CheckCircle2 size={12} className="text-primary" />
                              {account.account_name}
                              {account.expiring_soon && (
                                <span className="text-destructive flex items-center gap-1"><AlertTriangle size={12} /> token expirando</span>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Não conectado</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant={account ? 'outline' : 'default'}
                          className="gap-1"
                          disabled={oauthBusy === `${client.id}:${plat}`}
                          onClick={() => connectViaOAuth(client, plat)}
                        >
                          {oauthBusy === `${client.id}:${plat}`
                            ? <Loader2 size={14} className="animate-spin" />
                            : <LogIn size={14} />}
                          {account ? 'Reconectar' : 'Entrar'}
                        </Button>
                        {account && (
                          <Button size="sm" variant="ghost" title="Desconectar" onClick={() => disconnect(client, plat)}>
                            <Unlink size={14} />
                          </Button>
                        )}
                      </div>

                    </div>
                  ))}

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
                      <p className="text-sm font-medium">Testar conexão</p>
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
              Envie este link para {inviteLink?.name}. O cliente entra na conta dele na Meta e autoriza a agência.
              Válido até {inviteLink?.expires}.
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteLink(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

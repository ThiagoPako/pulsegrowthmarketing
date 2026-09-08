import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Instagram, Facebook, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';

const API_BASE = 'https://agenciapulse.tech/api';

type Platform = 'instagram' | 'facebook';

interface LinkedAccount {
  platform: string;
  account_name: string;
  username?: string | null;
  profile_picture_url?: string | null;
}

interface InviteData {
  client_id: string;
  client_name: string;
  expires_at: string;
  accounts: LinkedAccount[];
}

/**
 * Página pública de autorização.
 * O próprio cliente abre este link e faz o login oficial na Meta.
 * A agência nunca vê senha nem token — a troca acontece só no servidor.
 */
export default function SocialConnectInvite() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Platform | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/social-connect/${token}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Link inválido.');
      setInvite(data as InviteData);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const authorize = async (platform: Platform) => {
    if (!invite) return;
    setBusy(platform);
    const redirectUri = `${window.location.origin}/`;
    try {
      const urlRes = await fetch(`${API_BASE}/meta-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: platform === 'instagram' ? 'get_instagram_oauth_url' : 'get_oauth_url',
          client_id: invite.client_id,
          redirect_uri: redirectUri,
        }),
      });
      const urlData = await urlRes.json().catch(() => null);
      if (!urlRes.ok || !urlData?.oauth_url) throw new Error(urlData?.error || 'Não foi possível abrir a autorização.');

      const popup = window.open(urlData.oauth_url, 'meta_oauth', 'width=600,height=760,scrollbars=yes');
      if (!popup) throw new Error('Permita janelas pop-up para continuar.');

      const code = await new Promise<string>((resolve, reject) => {
        const timer = window.setInterval(() => {
          try {
            if (popup.closed) {
              window.clearInterval(timer);
              reject(new Error('Janela fechada antes de concluir.'));
              return;
            }
            if (!popup.location.href.startsWith(window.location.origin)) return;
            const params = new URLSearchParams(popup.location.search);
            const returned = params.get('code');
            const denied = params.get('error') || params.get('error_reason');
            if (returned) {
              window.clearInterval(timer);
              popup.close();
              resolve(returned);
            } else if (denied) {
              window.clearInterval(timer);
              popup.close();
              reject(new Error('Autorização recusada.'));
            }
          } catch {
            /* enquanto está no domínio da Meta a leitura fica bloqueada */
          }
        }, 600);
      });

      const exchangeRes = await fetch(`${API_BASE}/meta-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: platform === 'instagram' ? 'exchange_instagram_code' : 'exchange_code',
          code,
          redirect_uri: redirectUri,
          client_id: invite.client_id,
        }),
      });
      const result = await exchangeRes.json().catch(() => null);
      if (!exchangeRes.ok || result?.error) throw new Error(result?.error || 'Falha ao concluir a autorização.');

      await fetch(`${API_BASE}/social-connect/${token}/complete`, { method: 'POST' });
      toast.success('Conta autorizada com sucesso!');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="animate-spin" size={18} /> Carregando…
      </main>
    );
  }

  if (error || !invite) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-2">
            <h1 className="text-lg font-semibold">Link indisponível</h1>
            <p className="text-sm text-muted-foreground">{error || 'Peça um novo link para a agência.'}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const connected = (plat: Platform) => invite.accounts.find(a => a.platform === plat);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="text-primary" size={24} />
          </div>
          <CardTitle className="text-xl">Autorizar publicações</CardTitle>
          <p className="text-sm text-muted-foreground">
            {invite.client_name} — conecte suas contas para que a agência publique os conteúdos aprovados.
            Você entra direto na Meta; sua senha nunca é vista pela agência.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {([
            { plat: 'instagram' as Platform, icon: Instagram, label: 'Instagram profissional' },
            { plat: 'facebook' as Platform, icon: Facebook, label: 'Página do Facebook' },
          ]).map(({ plat, icon: Icon, label }) => {
            const account = connected(plat);
            return (
              <div key={plat} className="flex items-center justify-between gap-3 rounded-lg border p-4">
                <div className="flex items-center gap-3 min-w-0">
                  {account?.profile_picture_url ? (
                    <img
                      src={account.profile_picture_url}
                      alt={`Foto do perfil ${account.username || account.account_name}`}
                      className="h-10 w-10 rounded-full object-cover shrink-0 border"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Icon size={20} className="text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    {account ? (
                      <p className="text-xs text-primary flex items-center gap-1 truncate">
                        <CheckCircle2 size={12} className="shrink-0" />
                        {plat === 'instagram' && account.username
                          ? `@${account.username.replace(/^@/, '')}`
                          : account.account_name} autorizado
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Ainda não autorizado</p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={account ? 'outline' : 'default'}
                  disabled={busy === plat}
                  onClick={() => authorize(plat)}
                  className="gap-1 shrink-0"
                >
                  {busy === plat && <Loader2 size={14} className="animate-spin" />}
                  {account ? 'Refazer' : 'Autorizar'}
                </Button>
              </div>
            );
          })}

          <p className="text-xs text-muted-foreground pt-2">
            A autorização pode ser cancelada a qualquer momento nas configurações da sua conta na Meta.
            A agência usa o acesso apenas para publicar conteúdos e ler métricas do próprio perfil.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

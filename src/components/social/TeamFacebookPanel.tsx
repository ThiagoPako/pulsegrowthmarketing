import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Facebook, Loader2, LogIn, Plus, RefreshCw, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

// Facebooks da equipe (pedido do usuário, 03/11/2026): "temos vários Facebook que usamos; dê opção para nomear o
// Facebook, fazer o login dele e setar manualmente os clientes". Cada login vira um perfil na Upload-Post; as páginas
// dele aparecem aqui e cada uma é ligada a um cliente. O post do Facebook do cliente sai por esse login, na página ligada.

interface TeamPage { id: string; name: string; picture?: string | null; client_id: string | null; client_name: string | null }
interface TeamFacebook { id: string; name: string; connected: boolean; reauth: boolean; account: string | null; pages: TeamPage[] }

export default function TeamFacebookPanel({ clients }: { clients: { id: string; name: string }[] }) {
  const [teams, setTeams] = useState<TeamFacebook[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // muitas páginas por login: busca pelo nome da página ou do cliente
  const [pageQuery, setPageQuery] = useState('');
  const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const matches = (pg: TeamPage) => !pageQuery.trim() || norm(`${pg.name} ${pg.client_name || ''}`).includes(norm(pageQuery.trim()));

  const load = useCallback(async () => {
    const { data, error } = await invokeVpsFunction('upload-post/team-facebook', { method: 'GET' });
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Não deu para ler os Facebooks da equipe'); setTeams([]); return; }
    setTeams(data.teams || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy('novo');
    const { data, error } = await invokeVpsFunction('upload-post/team-facebook', { body: { name: name.trim() } });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    setName('');
    toast.success(`"${data.name}" criado. Agora faça o login dele.`);
    load();
  };

  const login = async (t: TeamFacebook) => {
    setBusy(t.id);
    const { data, error } = await invokeVpsFunction(`upload-post/team-facebook/${t.id}/login`, { body: {} });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    window.location.href = data.url;
  };

  const assign = async (t: TeamFacebook, page: TeamPage, clientId: string) => {
    setBusy(`${t.id}:${page.id}`);
    const { data, error } = clientId
      ? await invokeVpsFunction(`upload-post/team-facebook/${t.id}/assign`, { body: { page_id: page.id, client_id: clientId } })
      : await invokeVpsFunction(`upload-post/clients/${page.client_id}/team-facebook/remove`, { body: {} });
    setBusy(null);
    if (error || data?.error) { toast.error(data?.error || error?.message); return; }
    toast.success(clientId ? `Página "${page.name}" ligada ao cliente` : `Página "${page.name}" desligada`);
    load();
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-2">
          <Facebook size={18} className="mt-0.5 shrink-0 text-[#1877F2]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Facebooks da equipe</p>
            <p className="text-xs text-muted-foreground">
              Faça o login de um Facebook da equipe que administra as páginas dos clientes e ligue cada página ao cliente dela.
              Os posts do Facebook do cliente saem por esse login, na página ligada.
            </p>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 shrink-0" title="Atualizar" onClick={() => { setTeams(null); load(); }}>
            <RefreshCw size={14} />
          </Button>
        </div>

        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do Facebook (ex.: Facebook Thiago, Facebook Agência)" />
          <Button onClick={create} disabled={busy === 'novo' || name.trim().length < 2} className="shrink-0 gap-1">
            {busy === 'novo' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
          </Button>
        </div>

        {teams && teams.some((t) => t.pages.length > 6) && (
          <Input value={pageQuery} onChange={(e) => setPageQuery(e.target.value)} placeholder="Buscar página ou cliente" className="h-9" />
        )}

        {teams === null ? (
          <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
        ) : teams.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum Facebook da equipe ainda. Dê um nome e toque em Adicionar.
          </p>
        ) : (
          <div className="space-y-3">
            {teams.map((t) => (
              <div key={t.id} className="rounded-xl border border-border">
                <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5">
                  <span className="text-sm font-semibold">{t.name}</span>
                  {t.connected && !t.reauth ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={12} /> {t.account || 'Conectado'}</span>
                  ) : (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">{t.reauth ? 'Login venceu: entre de novo' : 'Falta fazer o login'}</span>
                  )}
                  <Button size="sm" variant={t.connected && !t.reauth ? 'outline' : 'default'} className="ml-auto h-7 gap-1 text-xs" disabled={busy === t.id} onClick={() => login(t)}>
                    {busy === t.id ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />} {t.connected ? 'Entrar de novo' : 'Fazer login'}
                  </Button>
                </div>
                {t.connected && (
                  t.pages.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">Nenhuma página liberada. Toque em "Entrar de novo" e marque as páginas dos clientes na tela do Facebook.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {t.pages.filter(matches).map((pg) => (
                        <li key={pg.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                          {pg.picture ? <img src={pg.picture} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" /> : <Facebook size={16} className="shrink-0 text-[#1877F2]" />}
                          <span className="min-w-0 flex-1 truncate text-sm">{pg.name}</span>
                          <select
                            value={pg.client_id || ''}
                            disabled={busy === `${t.id}:${pg.id}`}
                            onChange={(e) => assign(t, pg, e.target.value)}
                            aria-label={`Cliente da página ${pg.name}`}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs sm:w-56"
                          >
                            <option value="">Sem cliente</option>
                            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          {pg.client_id && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Desligar do cliente" disabled={busy === `${t.id}:${pg.id}`} onClick={() => assign(t, pg, '')}>
                              <Unlink size={13} />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Instagram: a Upload-Post liga um Instagram por cliente, então ele continua sendo conectado no botão Conectar de cada cliente
          (entre com o Instagram dele ou pelo Facebook que administra a página).
        </p>
      </CardContent>
    </Card>
  );
}

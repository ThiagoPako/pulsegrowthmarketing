import { useEffect, useMemo, useState } from 'react';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import type { ConnectedSocialAccount } from '@/services/socialPostsApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Instagram, Facebook, Search, Link2, Loader2, RefreshCw, Unlink, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ClientConnection {
  id: string;
  name: string;
  city: string | null;
  accounts: ConnectedSocialAccount[];
}

type Platform = 'instagram' | 'facebook';

export default function SocialConnections() {
  const [clients, setClients] = useState<ClientConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'connected' | 'pending'>('all');

  const [target, setTarget] = useState<ClientConnection | null>(null);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

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

  const openConnect = (client: ClientConnection, plat: Platform) => {
    setTarget(client);
    setPlatform(plat);
    setToken('');
  };

  const saveToken = async () => {
    if (!target) return;
    if (!token.trim()) { toast.error('Cole o token gerado no painel da Meta.'); return; }
    setSaving(true);
    try {
      const { data, error } = await invokeVpsFunction('social-accounts/manual-token', {
        body: { client_id: target.id, platform, token: token.trim() },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro ao salvar token');
      toast.success(`Conectado: ${(data?.accounts ?? []).length} conta(s)`);
      setTarget(null);
      setToken('');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
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
                        <Button size="sm" variant={account ? 'outline' : 'default'} className="gap-1" onClick={() => openConnect(client, plat)}>
                          <Link2 size={14} /> {account ? 'Trocar' : 'Conectar'}
                        </Button>
                        {account && (
                          <Button size="sm" variant="ghost" onClick={() => disconnect(client, plat)}>
                            <Unlink size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!target} onOpenChange={o => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar {platform === 'instagram' ? 'Instagram' : 'Facebook'}</DialogTitle>
            <DialogDescription>
              {target?.name} — cole o token gerado no painel da Meta para esta conta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={platform} onValueChange={(v: Platform) => setPlatform(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram (login direto no perfil)</SelectItem>
                <SelectItem value="facebook">Facebook (Página + Instagram vinculado)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Cole aqui o token"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              {platform === 'instagram'
                ? 'A conta precisa ser Profissional (Comercial ou Criador). O token é validado na hora e trocado por um token longo.'
                : 'Use um token de usuário com acesso às Páginas. Todas as Páginas do token serão conectadas.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancelar</Button>
            <Button onClick={saveToken} disabled={saving} className="gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />} Salvar token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

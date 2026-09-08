import { useEffect, useMemo, useState } from 'react';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { fetchClientInsights, type ClientInsights, type ConnectedSocialAccount } from '@/services/socialPostsApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Instagram, TrendingUp, Users, Eye, MousePointerClick, Heart } from 'lucide-react';

interface ClientOption {
  id: string;
  name: string;
  accounts: ConnectedSocialAccount[];
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function monthRange(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();
  return { since: `${year}-${pad(month)}-01`, until: `${year}-${pad(month)}-${pad(last)}` };
}

const nf = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR');

export default function SocialInsights() {
  const now = new Date();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<ClientInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: res, error } = await invokeVpsFunction('social-posts/accounts-overview', { method: 'GET' });
        if (error) throw new Error(error.message);
        const list = ((res?.clients ?? []) as ClientOption[]).filter(c =>
          c.accounts.some(a => a.platform === 'instagram')
        );
        setClients(list);
        if (list.length) setClientId(list[0].id);
      } catch (err) {
        toast.error('Erro ao carregar clientes: ' + (err as Error).message);
      } finally {
        setLoadingClients(false);
      }
    })();
  }, []);

  const load = async (refresh = false) => {
    if (!clientId) return;
    setLoading(true);
    try {
      const { since, until } = monthRange(year, month);
      setData(await fetchClientInsights(clientId, since, until, refresh));
    } catch (err) {
      setData(null);
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId, month, year]);

  const years = useMemo(
    () => Array.from({ length: 4 }, (_, i) => now.getFullYear() - i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const cards = data ? [
    { label: 'Alcance', value: data.reach, icon: TrendingUp, hint: 'Contas alcançadas no período' },
    { label: 'Visualizações', value: data.views, icon: Eye, hint: 'Exibições do conteúdo' },
    { label: 'Seguidores', value: data.followers_total, icon: Users, hint: 'Total atual da conta' },
    { label: 'Novos seguidores', value: data.followers_gained, icon: Users, hint: 'Crescimento no período' },
    { label: 'Visitas ao perfil', value: data.profile_views, icon: Eye, hint: 'Pessoas que abriram o perfil' },
    { label: 'Cliques no link', value: data.website_clicks, icon: MousePointerClick, hint: 'Cliques no link da bio' },
    { label: 'Interações', value: data.interactions, icon: Heart, hint: 'Curtidas, comentários e salvamentos' },
    { label: 'Publicações', value: data.posts_count, icon: Instagram, hint: 'Postagens no período' },
  ] : [];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Desempenho</h1>
          <p className="text-sm text-muted-foreground">
            Números reais do Instagram de cada cliente para anexar ao relatório mensal.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => load(true)} disabled={loading || !clientId}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar dados
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Select value={clientId} onValueChange={setClientId} disabled={loadingClients}>
          <SelectTrigger><SelectValue placeholder={loadingClients ? 'Carregando…' : 'Selecione o cliente'} /></SelectTrigger>
          <SelectContent>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!clients.length && !loadingClients && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Nenhum cliente com Instagram conectado. Conecte em Conexões Sociais.
        </CardContent></Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="animate-spin" size={18} /> Buscando números no Instagram…
        </div>
      ) : data ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {data.account_name && <Badge variant="outline">@{data.account_name}</Badge>}
            <span>{MONTHS[month - 1]} de {year}</span>
            {data.cached && <span>• dados em cache</span>}
            {data.stale_error && <span className="text-destructive">• {data.stale_error}</span>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map(({ label, value, icon: Icon, hint }) => (
              <Card key={label}>
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon size={14} />
                    <p className="text-xs">{label}</p>
                  </div>
                  <p className="text-2xl font-bold">{nf(value)}</p>
                  <p className="text-[11px] text-muted-foreground">{hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Desempenho por publicação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.posts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma publicação no período.</p>
              ) : data.posts.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" loading="lazy" className="w-14 h-14 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded bg-muted shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{p.caption || 'Sem legenda'}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.media_type} · {p.timestamp ? new Date(p.timestamp).toLocaleDateString('pt-BR') : '—'}
                    </p>
                  </div>
                  <div className="hidden sm:grid grid-cols-4 gap-4 text-center text-xs shrink-0">
                    {[
                      { l: 'Alcance', v: p.reach },
                      { l: 'Curtidas', v: p.likes },
                      { l: 'Coment.', v: p.comments },
                      { l: 'Salvos', v: p.saved },
                    ].map(m => (
                      <div key={m.l}>
                        <p className="font-semibold text-foreground">{nf(m.v)}</p>
                        <p className="text-muted-foreground">{m.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

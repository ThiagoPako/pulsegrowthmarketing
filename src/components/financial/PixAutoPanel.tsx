// Financeiro → Pagamentos · Pix Automático (pedido do usuário, 02/11/2026): quem aderiu na página de pagamento, quem
// ainda não autorizou no banco e quem cancelou, com as cobranças de cada mês (paga, aberta ou "não debitou").
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchPixAuto, type PixAutoAdesao } from '@/lib/paymentAccounts';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const STATUS: Record<PixAutoAdesao['status'], string> = {
  ativo: 'ativo', aguardando: 'aguardando o banco', cancelado: 'cancelado', recusado: 'recusado', expirado: 'expirou',
};
const COBR: Record<string, string> = { paga: 'paga', aberta: 'agendada', falhou: 'não debitou' };

export function PixAutoPanel() {
  const query = useQuery({ queryKey: ['pix-automatico'], queryFn: fetchPixAuto });
  const list = query.data?.adesoes || [];
  if (!list.length) return null;
  const ativos = list.filter((a) => a.status === 'ativo');
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pix Automático</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ativos.length} {ativos.length === 1 ? 'cliente ativo' : 'clientes ativos'} · {brl(ativos.reduce((s, a) => s + Number(a.valor), 0))} por mês.
          Quem está ativo não recebe cobrança: a mensalidade é debitada no vencimento; se não debitar, a Ísis manda a cobrança no dia seguinte.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.map((a) => (
          <div key={a.id_rec} className="space-y-0.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={a.status === 'ativo' ? 'default' : 'outline'}>{STATUS[a.status]}</Badge>
              <span className="font-medium">{a.client || 'cliente'} · {brl(Number(a.valor))}/mês</span>
              <span className="text-muted-foreground">
                {a.city === 'uruacu' ? 'Uruaçu' : 'Minaçu'} · titular {a.devedor_nome}{a.devedor_doc_mask ? ` (${a.devedor_doc_mask})` : ''} · 1º débito {dataBr(a.data_inicial)}
              </span>
            </div>
            {!!a.cobrancas?.length && (
              <p className="text-muted-foreground">
                {a.cobrancas.map((c) => `${c.month.slice(5)}/${c.month.slice(0, 4)}: ${COBR[c.status] || c.status}`).join(' · ')}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

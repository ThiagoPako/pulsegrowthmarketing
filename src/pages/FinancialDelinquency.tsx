import { useMemo } from 'react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';

export default function FinancialDelinquency() {
  const navigate = useNavigate();
  const { revenues, billingMessages } = useFinancialData();
  const { clients } = useApp();

  const today = new Date();
  const inadimplentes = useMemo(() => {
    return revenues
      .filter(r => ['em_atraso', 'vencido'].includes(r.status))
      .map(r => {
        const client = clients.find(c => c.id === r.client_id);
        const diasAtraso = differenceInDays(today, new Date(r.due_date));
        const lastMsg = billingMessages
          .filter(m => m.client_id === r.client_id && m.revenue_id === r.id)
          .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
        return {
          ...r,
          clientName: client?.companyName || '—',
          diasAtraso,
          lastMessage: lastMsg ? new Date(lastMsg.sent_at).toLocaleDateString('pt-BR') : 'Nenhuma',
          lastMessageType: lastMsg?.message_type || '',
        };
      })
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [revenues, clients, billingMessages]);

  const totalAtraso = inadimplentes.reduce((s, r) => s + Number(r.amount), 0);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Inadimplência</h1>
          <p className="text-sm text-muted-foreground">{inadimplentes.length} clientes inadimplentes — Total: {fmt(totalAtraso)}</p>
        </div>
      </div>

      {inadimplentes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <p className="text-lg">🎉 Nenhum cliente inadimplente!</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Dias de Atraso</TableHead>
                  <TableHead>Última Cobrança</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inadimplentes.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.clientName}</TableCell>
                    <TableCell className="text-red-600 font-bold">{fmt(Number(r.amount))}</TableCell>
                    <TableCell>{r.due_date}</TableCell>
                    <TableCell>
                      <Badge variant={r.diasAtraso > 15 ? 'destructive' : 'outline'} className="flex items-center gap-1 w-fit">
                        {r.diasAtraso > 15 && <AlertTriangle size={12} />}
                        {r.diasAtraso} dias
                      </Badge>
                    </TableCell>
                    <TableCell>{r.lastMessage}</TableCell>
                    <TableCell><Badge variant="destructive">Em Atraso</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

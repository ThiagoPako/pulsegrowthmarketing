import { useState, useMemo, useEffect, useRef } from 'react';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, RefreshCw, CheckCircle, MessageCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { sendWhatsAppMessage } from '@/services/whatsappService';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' }> = {
  prevista: { label: 'Prevista', variant: 'secondary' },
  recebida: { label: 'Recebida', variant: 'default' },
  em_atraso: { label: 'Em Atraso', variant: 'destructive' },
};

export default function FinancialRevenues() {
  const navigate = useNavigate();
  const { revenues, updateRevenue, generateMonthlyRevenues, paymentConfig, loading } = useFinancialData();
  const { clients } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [sendingBilling, setSendingBilling] = useState<string | null>(null);

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = -6; i <= 3; i++) {
      const m = i === 0 ? new Date() : (i < 0 ? subMonths(new Date(), -i) : addMonths(new Date(), i));
      options.push({ value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy', { locale: ptBR }) });
    }
    return options;
  }, []);

  const refMonth = `${selectedMonth}-01`;
  const filtered = revenues.filter(r => r.reference_month === refMonth);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Auto-generate revenues when month has none and data is loaded
  const autoGenRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || autoGenRef.current === selectedMonth) return;
    if (filtered.length === 0 && clients.length > 0) {
      autoGenRef.current = selectedMonth;
      generateMonthlyRevenues(selectedMonth).then(count => {
        if (count > 0) toast.success(`${count} receitas geradas automaticamente`);
      });
    }
  }, [selectedMonth, loading, filtered.length, clients.length]);

  const handleGenerate = async () => {
    autoGenRef.current = selectedMonth;
    const count = await generateMonthlyRevenues(selectedMonth);
    toast.success(`${count} receitas geradas`);
  };

  const handleMarkPaid = async (id: string) => {
    const ok = await updateRevenue(id, { status: 'recebida', paid_at: new Date().toISOString().split('T')[0] });
    if (ok) toast.success('Marcada como recebida');
  };

  const handleMarkOverdue = async (id: string) => {
    const ok = await updateRevenue(id, { status: 'em_atraso' });
    if (ok) toast.success('Marcada como em atraso');
  };

  const handleSendBilling = async (revenueId: string) => {
    const revenue = filtered.find(r => r.id === revenueId);
    if (!revenue) return;

    const client = clients.find(c => c.id === revenue.client_id);
    if (!client) { toast.error('Cliente não encontrado'); return; }
    if (!client.whatsapp) { toast.error('Cliente sem WhatsApp cadastrado'); return; }

    setSendingBilling(revenueId);

    try {
      const value = fmt(Number(revenue.amount));
      const dueDay = revenue.due_date?.split('-')[2] || '—';

      let paymentInfo = '';
      if (paymentConfig && (paymentConfig.pix_key || paymentConfig.receiver_name)) {
        paymentInfo = '\n\n💳 *Dados para pagamento:*';
        if (paymentConfig.receiver_name) paymentInfo += `\nNome: ${paymentConfig.receiver_name}`;
        if (paymentConfig.bank) paymentInfo += `\nBanco: ${paymentConfig.bank}`;
        if (paymentConfig.pix_key) paymentInfo += `\nChave PIX: ${paymentConfig.pix_key}`;
        if (paymentConfig.document) paymentInfo += `\nCPF/CNPJ: ${paymentConfig.document}`;
      }

      const isOverdue = revenue.status === 'em_atraso';
      const template = isOverdue
        ? (paymentConfig?.msg_billing_overdue || 'Olá, {nome_cliente}! Lembrete de pendência: {valor}. {dados_pagamento}')
        : (paymentConfig?.msg_billing_due || 'Olá, {nome_cliente}! Mensalidade {valor} vence dia {dia_vencimento}. {dados_pagamento}');

      const message = template
        .replace(/\{nome_cliente\}/g, client.companyName)
        .replace(/\{valor\}/g, value)
        .replace(/\{dia_vencimento\}/g, dueDay)
        .replace(/\{dados_pagamento\}/g, paymentInfo)
        .replace(/\{relatorio_entregas\}/g, '');

      const result = await sendWhatsAppMessage({
        number: client.whatsapp,
        message,
        clientId: client.id,
        triggerType: 'manual',
      });

      if (result.success) {
        toast.success(`Cobrança enviada para ${client.companyName}`);
      } else {
        toast.error(result.error || 'Erro ao enviar cobrança');
      }
    } catch {
      toast.error('Erro ao enviar cobrança');
    } finally {
      setSendingBilling(null);
    }
  };

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);
  const recebida = filtered.filter(r => r.status === 'recebida').reduce((s, r) => s + Number(r.amount), 0);
  const atraso = filtered.filter(r => r.status === 'em_atraso').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Receitas</h1>
          <p className="text-sm text-muted-foreground">Total: {fmt(total)} | Recebida: {fmt(recebida)} | Atraso: {fmt(atraso)}</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={handleGenerate}><RefreshCw size={14} className="mr-1" /> Gerar Receitas</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pago em</TableHead>
                <TableHead className="w-48"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const client = clients.find(c => c.id === r.client_id);
                const st = STATUS_MAP[r.status] || { label: r.status, variant: 'secondary' as const };
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{client?.companyName || '—'}</TableCell>
                    <TableCell>{fmt(Number(r.amount))}</TableCell>
                    <TableCell>{r.due_date}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell>{r.paid_at || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.status !== 'recebida' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleMarkPaid(r.id)} title="Marcar como recebida">
                              <CheckCircle size={14} className="mr-1" /> Recebida
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary"
                              onClick={() => handleSendBilling(r.id)}
                              disabled={sendingBilling === r.id}
                              title="Enviar cobrança via WhatsApp"
                            >
                              {sendingBilling === r.id ? (
                                <Loader2 size={14} className="mr-1 animate-spin" />
                              ) : (
                                <MessageCircle size={14} className="mr-1" />
                              )}
                              Cobrar
                            </Button>
                          </>
                        )}
                        {r.status === 'prevista' && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleMarkOverdue(r.id)}>
                            Em Atraso
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma receita neste mês. Clique em "Gerar Receitas".</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useEndoContracts, useEndoTasks, useEndoMetrics, getCategoryLabel, getTaskTypeLabel } from '@/hooks/useEndomarketing';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { FileDown, FileText, BarChart3, DollarSign } from 'lucide-react';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function EndomarketingReports() {
  const { contracts } = useEndoContracts();
  const { tasks } = useEndoTasks();
  const metrics = useEndoMetrics(contracts, tasks);
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canSeeFinancials = isAdmin || profile?.role === 'endomarketing' || profile?.role === 'parceiro';
  const [filterClient, setFilterClient] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>();
    contracts.forEach(c => { if (c.clients) map.set(c.client_id, c.clients.company_name); });
    return [...map.entries()];
  }, [contracts]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterClient !== 'all' && t.client_id !== filterClient) return false;
      if (filterFrom && t.date < filterFrom) return false;
      if (filterTo && t.date > filterTo) return false;
      return true;
    });
  }, [tasks, filterClient, filterFrom, filterTo]);

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => filterClient === 'all' || c.client_id === filterClient);
  }, [contracts, filterClient]);

  // Delivery stats per client
  const deliveryStats = useMemo(() => {
    const map = new Map<string, { name: string; total: number; completed: number; pending: number; cancelled: number; package: string }>();
    filteredContracts.forEach(c => {
      const clientTasks = filteredTasks.filter(t => t.client_id === c.client_id);
      map.set(c.client_id, {
        name: c.clients?.company_name || '',
        total: clientTasks.length,
        completed: clientTasks.filter(t => t.status === 'concluida').length,
        pending: clientTasks.filter(t => t.status === 'pendente').length,
        cancelled: clientTasks.filter(t => t.status === 'cancelada').length,
        package: c.endomarketing_packages?.package_name || '',
      });
    });
    return [...map.values()];
  }, [filteredContracts, filteredTasks]);

  const exportPDF = (type: 'delivery' | 'financial' | 'general') => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(18);
    doc.text('Pulse Growth Marketing', pageW / 2, y, { align: 'center' });
    y += 8;
    doc.setFontSize(12);
    const titles = { delivery: 'Relatório de Entregas', financial: 'Relatório Financeiro', general: 'Relatório Geral' };
    doc.text(`Endomarketing - ${titles[type]}`, pageW / 2, y, { align: 'center' });
    y += 6;
    doc.setFontSize(9);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, pageW / 2, y, { align: 'center' });
    y += 12;
    doc.setDrawColor(200); doc.line(15, y, pageW - 15, y); y += 8;

    doc.setFontSize(10);

    if (type === 'delivery') {
      deliveryStats.forEach(s => {
        doc.setFont(undefined as any, 'bold');
        doc.text(s.name, 15, y); y += 5;
        doc.setFont(undefined as any, 'normal');
        doc.text(`Pacote: ${s.package}`, 15, y); y += 5;
        doc.text(`Total: ${s.total} | Concluídas: ${s.completed} | Pendentes: ${s.pending} | Canceladas: ${s.cancelled}`, 15, y); y += 5;
        const rate = s.total > 0 ? ((s.completed / s.total) * 100).toFixed(1) : '0';
        doc.text(`Taxa de conclusão: ${rate}%`, 15, y); y += 10;
      });
    } else if (type === 'financial') {
      filteredContracts.forEach(c => {
        const profit = c.sale_price - c.partner_cost;
        const margin = c.sale_price > 0 ? (profit / c.sale_price * 100) : 0;
        doc.setFont(undefined as any, 'bold');
        doc.text(c.clients?.company_name || '', 15, y); y += 5;
        doc.setFont(undefined as any, 'normal');
        doc.text(`Valor vendido: ${fmt(c.sale_price)} | Custo parceiro: ${fmt(c.partner_cost)}`, 15, y); y += 5;
        doc.text(`Lucro: ${fmt(profit)} | Margem: ${margin.toFixed(1)}%`, 15, y); y += 10;
      });
    } else {
      doc.setFont(undefined as any, 'bold');
      doc.text('Resumo Geral', 15, y); y += 8;
      doc.setFont(undefined as any, 'normal');
      doc.text(`Total faturado: ${fmt(metrics.monthlyRevenue)}`, 15, y); y += 5;
      doc.text(`Total pago a parceiros: ${fmt(metrics.monthlyCosts)}`, 15, y); y += 5;
      doc.text(`Lucro total: ${fmt(metrics.monthlyProfit)}`, 15, y); y += 5;
      doc.text(`Margem média: ${metrics.avgMargin.toFixed(1)}%`, 15, y); y += 5;
      doc.text(`Clientes ativos: ${metrics.totalClients}`, 15, y); y += 5;
    }

    doc.save(`endomarketing-${type}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF exportado!');
  };

  const exportCSV = (type: 'delivery' | 'financial') => {
    let csv = '';
    if (type === 'delivery') {
      csv = 'Cliente,Pacote,Total,Concluídas,Pendentes,Canceladas,Taxa\n';
      deliveryStats.forEach(s => {
        const rate = s.total > 0 ? ((s.completed / s.total) * 100).toFixed(1) : '0';
        csv += `"${s.name}","${s.package}",${s.total},${s.completed},${s.pending},${s.cancelled},${rate}%\n`;
      });
    } else {
      csv = 'Cliente,Valor Venda,Custo Parceiro,Lucro,Margem\n';
      filteredContracts.forEach(c => {
        const profit = c.sale_price - c.partner_cost;
        const margin = c.sale_price > 0 ? (profit / c.sale_price * 100) : 0;
        csv += `"${c.clients?.company_name}",${c.sale_price},${c.partner_cost},${profit},${margin.toFixed(1)}%\n`;
      });
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `endomarketing-${type}-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Relatórios Endomarketing</h1>
          <p className="text-sm text-muted-foreground">Entregas, financeiro e análises</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Cliente</Label>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {uniqueClients.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" className="w-[150px]" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" className="w-[150px]" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>
      </div>

      <Tabs defaultValue="delivery">
        <TabsList>
          <TabsTrigger value="delivery"><FileText size={14} className="mr-1" /> Entregas</TabsTrigger>
          {canSeeFinancials && <TabsTrigger value="financial"><DollarSign size={14} className="mr-1" /> Financeiro</TabsTrigger>}
          {canSeeFinancials && <TabsTrigger value="general"><BarChart3 size={14} className="mr-1" /> Geral</TabsTrigger>}
        </TabsList>

        <TabsContent value="delivery" className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportPDF('delivery')}><FileDown size={14} className="mr-1" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={() => exportCSV('delivery')}><FileDown size={14} className="mr-1" /> Excel (CSV)</Button>
          </div>
          <Card className="glass-card">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pacote</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Concluídas</TableHead>
                    <TableHead className="text-center">Pendentes</TableHead>
                    <TableHead className="text-center">Canceladas</TableHead>
                    <TableHead className="text-center">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryStats.map(s => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.package}</TableCell>
                      <TableCell className="text-center">{s.total}</TableCell>
                      <TableCell className="text-center text-emerald-600">{s.completed}</TableCell>
                      <TableCell className="text-center text-yellow-600">{s.pending}</TableCell>
                      <TableCell className="text-center text-red-400">{s.cancelled}</TableCell>
                      <TableCell className="text-center font-semibold">
                        {s.total > 0 ? ((s.completed / s.total) * 100).toFixed(0) : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportPDF('financial')}><FileDown size={14} className="mr-1" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={() => exportCSV('financial')}><FileDown size={14} className="mr-1" /> Excel (CSV)</Button>
          </div>
          <Card className="glass-card">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Valor Venda</TableHead>
                    <TableHead className="text-right">Custo Parceiro</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.map(c => {
                    const profit = c.sale_price - c.partner_cost;
                    const margin = c.sale_price > 0 ? (profit / c.sale_price * 100) : 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.clients?.company_name}</TableCell>
                        <TableCell className="text-right">{fmt(c.sale_price)}</TableCell>
                        <TableCell className="text-right">{fmt(c.partner_cost)}</TableCell>
                        <TableCell className={`text-right font-bold ${profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(profit)}</TableCell>
                        <TableCell className="text-right">{margin.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredContracts.length > 1 && (
                    <TableRow className="bg-muted/30 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right">{fmt(filteredContracts.reduce((s, c) => s + c.sale_price, 0))}</TableCell>
                      <TableCell className="text-right">{fmt(filteredContracts.reduce((s, c) => s + c.partner_cost, 0))}</TableCell>
                      <TableCell className="text-right text-emerald-600">{fmt(filteredContracts.reduce((s, c) => s + (c.sale_price - c.partner_cost), 0))}</TableCell>
                      <TableCell className="text-right">{metrics.avgMargin.toFixed(1)}%</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => exportPDF('general')}><FileDown size={14} className="mr-1" /> Exportar PDF</Button>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="glass-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Faturado</p>
              <p className="text-xl font-bold">{fmt(metrics.monthlyRevenue)}</p>
            </CardContent></Card>
            <Card className="glass-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Pago a Parceiros</p>
              <p className="text-xl font-bold">{fmt(metrics.monthlyCosts)}</p>
            </CardContent></Card>
            <Card className="glass-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Lucro Total</p>
              <p className={`text-xl font-bold ${metrics.monthlyProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(metrics.monthlyProfit)}</p>
            </CardContent></Card>
            <Card className="glass-card"><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Margem Média</p>
              <p className="text-xl font-bold">{metrics.avgMargin.toFixed(1)}%</p>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

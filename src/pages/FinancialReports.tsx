import { useState, useMemo, useRef } from 'react';
import { useFinancialData, normalizeDate } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

type ReportType = 'mensal' | 'despesas' | 'inadimplencia' | 'lucratividade';

export default function FinancialReports() {
  const navigate = useNavigate();
  const { contracts, revenues, expenses, categories } = useFinancialData();
  const { clients, recordings } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [reportType, setReportType] = useState<ReportType>('mensal');
  const tableRef = useRef<HTMLDivElement>(null);

  const monthStart = startOfMonth(new Date(selectedMonth + '-01'));
  const monthEnd = endOfMonth(monthStart);
  const refMonth = `${selectedMonth}-01`;

  const monthRevenues = revenues.filter(r => normalizeDate(r.reference_month) === refMonth);
  const monthExpenses = expenses.filter(e => { const d = new Date(e.date); return d >= monthStart && d <= monthEnd; });

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = -6; i <= 1; i++) {
      const m = i === 0 ? new Date() : (i < 0 ? subMonths(new Date(), -i) : addMonths(new Date(), i));
      options.push({ value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy', { locale: ptBR }) });
    }
    return options;
  }, []);

  // Export CSV
  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) { toast.error('Sem dados para exportar'); return; }
    const headers = Object.keys(data[0]);
    const csv = [headers.join(';'), ...data.map(row => headers.map(h => row[h]).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado!');
  };

  // Export PDF (simple approach)
  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Relatório Financeiro - ${format(monthStart, 'MMMM yyyy', { locale: ptBR })}`, 14, 20);
    doc.setFontSize(10);
    
    const totalRec = monthRevenues.reduce((s, r) => s + Number(r.amount), 0);
    const totalRecebida = monthRevenues.filter(r => r.status === 'recebida').reduce((s, r) => s + Number(r.amount), 0);
    const totalDesp = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
    
    let y = 35;
    doc.text(`Receita Total: ${fmt(totalRec)}`, 14, y); y += 7;
    doc.text(`Receita Recebida: ${fmt(totalRecebida)}`, 14, y); y += 7;
    doc.text(`Despesas: ${fmt(totalDesp)}`, 14, y); y += 7;
    doc.text(`Lucro Líquido: ${fmt(totalRecebida - totalDesp)}`, 14, y); y += 14;

    doc.setFontSize(12);
    doc.text('Receitas por Cliente', 14, y); y += 8;
    doc.setFontSize(9);
    monthRevenues.forEach(r => {
      const client = clients.find(c => c.id === r.client_id);
      doc.text(`${client?.companyName || '—'}: ${fmt(Number(r.amount))} — ${r.status}`, 14, y);
      y += 6;
      if (y > 270) { doc.addPage(); y = 20; }
    });

    y += 8;
    doc.setFontSize(12);
    doc.text('Despesas', 14, y); y += 8;
    doc.setFontSize(9);
    monthExpenses.forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      doc.text(`${e.date} — ${cat?.name || 'Outros'}: ${fmt(Number(e.amount))} — ${e.description}`, 14, y);
      y += 6;
      if (y > 270) { doc.addPage(); y = 20; }
    });

    doc.save(`relatorio-financeiro-${selectedMonth}.pdf`);
    toast.success('PDF exportado!');
  };

  // Report data
  const reportData = useMemo(() => {
    switch (reportType) {
      case 'mensal':
        return monthRevenues.map(r => ({
          Cliente: clients.find(c => c.id === r.client_id)?.companyName || '—',
          Valor: Number(r.amount),
          Vencimento: r.due_date,
          Status: r.status,
          'Pago em': r.paid_at || '—',
        }));
      case 'despesas':
        return monthExpenses.map(e => ({
          Data: e.date,
          Categoria: categories.find(c => c.id === e.category_id)?.name || '—',
          Descrição: e.description,
          Tipo: e.expense_type,
          Responsável: e.responsible,
          Valor: Number(e.amount),
        }));
      case 'inadimplencia':
        return revenues.filter(r => r.status === 'em_atraso').map(r => ({
          Cliente: clients.find(c => c.id === r.client_id)?.companyName || '—',
          Valor: Number(r.amount),
          Vencimento: r.due_date,
          Status: 'Em Atraso',
        }));
      case 'lucratividade': {
        const totalDesp = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
        const totalRecs = recordings.length || 1;
        return contracts.filter(c => c.status === 'ativo').map(c => {
          const client = clients.find(cl => cl.id === c.client_id);
          const clientRecs = recordings.filter(r => r.clientId === c.client_id);
          const proportion = clientRecs.length / totalRecs;
          const custo = totalDesp * proportion;
          const lucro = Number(c.contract_value) - custo;
          return {
            Cliente: client?.companyName || '—',
            Faturamento: Number(c.contract_value),
            Custo: Math.round(custo * 100) / 100,
            Lucro: Math.round(lucro * 100) / 100,
            'Margem (%)': Number(c.contract_value) > 0 ? Math.round(lucro / Number(c.contract_value) * 10000) / 100 : 0,
          };
        });
      }
      default: return [];
    }
  }, [reportType, monthRevenues, monthExpenses, revenues, contracts, clients, categories, recordings]);

  const columns = reportData.length > 0 ? Object.keys(reportData[0]) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/financeiro')}><ArrowLeft size={18} /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Relatórios Financeiros</h1>
        </div>
        <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mensal">Financeiro Mensal</SelectItem>
            <SelectItem value="despesas">Despesas</SelectItem>
            <SelectItem value="inadimplencia">Inadimplência</SelectItem>
            <SelectItem value="lucratividade">Lucratividade</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => exportCSV(reportData, `relatorio-${reportType}-${selectedMonth}`)}>
          <Download size={14} className="mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportPDF}>
          <FileText size={14} className="mr-1" /> PDF
        </Button>
      </div>

      <Card>
        <CardContent className="p-0" ref={tableRef}>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(col => <TableHead key={col}>{col}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.map((row, i) => (
                <TableRow key={i}>
                  {columns.map(col => (
                    <TableCell key={col}>
                      {typeof row[col as keyof typeof row] === 'number'
                        ? col.includes('Margem') ? `${row[col as keyof typeof row]}%` : fmt(row[col as keyof typeof row] as number)
                        : String(row[col as keyof typeof row])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {reportData.length === 0 && (
                <TableRow><TableCell colSpan={columns.length || 1} className="text-center text-muted-foreground py-8">Sem dados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

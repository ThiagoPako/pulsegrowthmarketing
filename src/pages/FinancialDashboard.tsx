import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Users, FileText, CreditCard, ArrowRight, BarChart3 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = ['hsl(0,72%,51%)', 'hsl(25,95%,53%)', 'hsl(45,93%,47%)', 'hsl(142,71%,45%)', 'hsl(187,85%,43%)', 'hsl(217,91%,60%)', 'hsl(262,83%,58%)', 'hsl(330,81%,60%)', 'hsl(25,50%,38%)'];

export default function FinancialDashboard() {
  const navigate = useNavigate();
  const { contracts, revenues, expenses, categories, loading } = useFinancialData();
  const { clients, recordings } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  const monthStart = useMemo(() => startOfMonth(new Date(selectedMonth + '-01')), [selectedMonth]);
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);

  // Filter data for selected month
  const monthRevenues = useMemo(() =>
    revenues.filter(r => r.reference_month === format(monthStart, 'yyyy-MM-dd')),
    [revenues, monthStart]
  );

  const monthExpenses = useMemo(() =>
    expenses.filter(e => {
      const d = new Date(e.date);
      return d >= monthStart && d <= monthEnd;
    }),
    [expenses, monthStart, monthEnd]
  );

  // KPIs
  const mrr = useMemo(() =>
    contracts.filter(c => c.status === 'ativo').reduce((sum, c) => sum + Number(c.contract_value), 0),
    [contracts]
  );

  const revenuePrevista = useMemo(() => monthRevenues.reduce((s, r) => s + Number(r.amount), 0), [monthRevenues]);
  const revenueRecebida = useMemo(() => monthRevenues.filter(r => r.status === 'recebida').reduce((s, r) => s + Number(r.amount), 0), [monthRevenues]);
  const revenueAtraso = useMemo(() => monthRevenues.filter(r => r.status === 'em_atraso').reduce((s, r) => s + Number(r.amount), 0), [monthRevenues]);
  const totalExpenses = useMemo(() => monthExpenses.reduce((s, e) => s + Number(e.amount), 0), [monthExpenses]);
  const lucro = revenueRecebida - totalExpenses;
  const activeClients = contracts.filter(c => c.status === 'ativo').length;
  const ticketMedio = activeClients > 0 ? mrr / activeClients : 0;
  const cancelados = contracts.filter(c => c.status === 'cancelado').length;
  const taxaCancelamento = contracts.length > 0 ? (cancelados / contracts.length * 100) : 0;

  // Expense by category chart
  const expenseByCat = useMemo(() => {
    const map: Record<string, number> = {};
    monthExpenses.forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      const name = cat?.name || 'Outros';
      map[name] = (map[name] || 0) + Number(e.amount);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [monthExpenses, categories]);

  // Revenue vs Expenses (last 6 months)
  const evolutionData = useMemo(() => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(new Date(), i);
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      const ref = format(mStart, 'yyyy-MM-dd');
      const label = format(m, 'MMM', { locale: ptBR });
      const rec = revenues.filter(r => r.reference_month === ref && r.status === 'recebida').reduce((s, r) => s + Number(r.amount), 0);
      const desp = expenses.filter(e => { const d = new Date(e.date); return d >= mStart && d <= mEnd; }).reduce((s, e) => s + Number(e.amount), 0);
      data.push({ name: label, receita: rec, despesa: desp, lucro: rec - desp });
    }
    return data;
  }, [revenues, expenses]);

  // Profitability per client
  const clientProfitability = useMemo(() => {
    const totalMonthExpenses = totalExpenses;
    const totalDeliveries = monthRevenues.length || 1;

    return contracts.filter(c => c.status === 'ativo').map(contract => {
      const client = clients.find(cl => cl.id === contract.client_id);
      const clientRevenues = monthRevenues.filter(r => r.client_id === contract.client_id);
      const faturamento = clientRevenues.reduce((s, r) => s + Number(r.amount), 0) || Number(contract.contract_value);

      // Proportional cost based on content volume
      const clientRecordings = recordings.filter(r => r.clientId === contract.client_id);
      const totalRecs = recordings.length || 1;
      const proportion = clientRecordings.length / totalRecs;
      const custo = totalMonthExpenses * proportion;
      const lucroCliente = faturamento - custo;
      const margem = faturamento > 0 ? (lucroCliente / faturamento * 100) : 0;

      return {
        clientId: contract.client_id,
        clientName: client?.companyName || 'Cliente',
        faturamento,
        custo: Math.round(custo * 100) / 100,
        lucro: Math.round(lucroCliente * 100) / 100,
        margem: Math.round(margem * 10) / 10,
      };
    }).sort((a, b) => b.lucro - a.lucro);
  }, [contracts, monthRevenues, clients, recordings, totalExpenses]);

  const clientsComPrejuizo = clientProfitability.filter(c => c.lucro < 0);

  // Cash forecast
  const previsaoCaixa = useMemo(() => {
    const nextMonth = addMonths(monthStart, 1);
    const nextRef = format(nextMonth, 'yyyy-MM-dd');
    const entradasPrevistas = contracts.filter(c => c.status === 'ativo').reduce((s, c) => s + Number(c.contract_value), 0);
    const saidasPrevistas = totalExpenses; // estimate same as current
    return { entradasPrevistas, saidasPrevistas, saldoProjetado: entradasPrevistas - saidasPrevistas };
  }, [contracts, totalExpenses, monthStart]);

  // Month options
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = -3; i <= 3; i++) {
      const m = i === 0 ? new Date() : (i < 0 ? subMonths(new Date(), -i) : addMonths(new Date(), i));
      options.push({ value: format(m, 'yyyy-MM'), label: format(m, 'MMMM yyyy', { locale: ptBR }) });
    }
    return options;
  }, []);

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (loading) return <p className="text-muted-foreground p-4">Carregando...</p>;

  const chartConfig = {
    receita: { label: 'Receita', color: 'hsl(142, 71%, 45%)' },
    despesa: { label: 'Despesa', color: 'hsl(0, 72%, 51%)' },
    lucro: { label: 'Lucro', color: 'hsl(217, 91%, 60%)' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Visão geral da saúde financeira</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign size={16} /> MRR</div>
          <p className="text-xl font-bold mt-1">{fmt(mrr)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp size={16} /> Recebida</div>
          <p className="text-xl font-bold mt-1 text-green-600">{fmt(revenueRecebida)}</p>
          <p className="text-xs text-muted-foreground">Prevista: {fmt(revenuePrevista)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown size={16} /> Despesas</div>
          <p className="text-xl font-bold mt-1 text-red-600">{fmt(totalExpenses)}</p>
        </CardContent></Card>
        <Card className={lucro < 0 ? 'border-red-500/50' : 'border-green-500/50'}><CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><BarChart3 size={16} /> Lucro Líquido</div>
          <p className={`text-xl font-bold mt-1 ${lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(lucro)}</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle size={16} /> Em Atraso</div>
          <p className="text-xl font-bold mt-1 text-orange-600">{fmt(revenueAtraso)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><CreditCard size={16} /> Ticket Médio</div>
          <p className="text-xl font-bold mt-1">{fmt(ticketMedio)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users size={16} /> Clientes Ativos</div>
          <p className="text-xl font-bold mt-1">{activeClients}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown size={16} /> Cancelamento</div>
          <p className="text-xl font-bold mt-1">{taxaCancelamento.toFixed(1)}%</p>
        </CardContent></Card>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Contratos', path: '/financeiro/contratos', icon: FileText },
          { label: 'Receitas', path: '/financeiro/receitas', icon: TrendingUp },
          { label: 'Despesas', path: '/financeiro/despesas', icon: TrendingDown },
          { label: 'Inadimplência', path: '/financeiro/inadimplencia', icon: AlertTriangle },
          { label: 'Configurações', path: '/financeiro/configuracoes', icon: CreditCard },
        ].map(item => (
          <Button key={item.path} variant="outline" className="h-auto py-3 flex flex-col gap-1" onClick={() => navigate(item.path)}>
            <item.icon size={18} />
            <span className="text-xs">{item.label}</span>
          </Button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            {expenseByCat.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenseByCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {expenseByCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-muted-foreground text-sm text-center py-8">Nenhuma despesa registrada neste mês</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Evolução Financeira (6 meses)</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64">
              <BarChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="receita" fill="var(--color-receita)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesa" fill="var(--color-despesa)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cash Forecast */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Previsão de Caixa (Próximo Mês)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Entradas Previstas</p>
              <p className="text-lg font-bold text-green-600">{fmt(previsaoCaixa.entradasPrevistas)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saídas Estimadas</p>
              <p className="text-lg font-bold text-red-600">{fmt(previsaoCaixa.saidasPrevistas)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo Projetado</p>
              <p className={`text-lg font-bold ${previsaoCaixa.saldoProjetado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(previsaoCaixa.saldoProjetado)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Profitability Ranking */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Ranking de Lucratividade por Cliente</CardTitle></CardHeader>
        <CardContent>
          {clientProfitability.length > 0 ? (
            <div className="space-y-2">
              {clientProfitability.slice(0, 10).map((cp, i) => (
                <div key={cp.clientId} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                    <span className="text-sm font-medium">{cp.clientName}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Fat: {fmt(cp.faturamento)}</span>
                    <span className="text-muted-foreground">Custo: {fmt(cp.custo)}</span>
                    <span className={cp.lucro >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {fmt(cp.lucro)}
                    </span>
                    <Badge variant={cp.margem >= 0 ? 'default' : 'destructive'} className="text-xs">
                      {cp.margem.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-muted-foreground text-sm text-center py-4">Nenhum contrato ativo</p>}
        </CardContent>
      </Card>

      {/* Loss Alerts */}
      {clientsComPrejuizo.length > 0 && (
        <Card className="border-red-500/50">
          <CardHeader><CardTitle className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle size={16} /> Clientes com Prejuízo</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {clientsComPrejuizo.map(cp => (
                <div key={cp.clientId} className="flex items-center justify-between p-2 rounded-lg bg-red-500/10">
                  <span className="text-sm font-medium">{cp.clientName}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span>Contrato: {fmt(cp.faturamento)}</span>
                    <span>Custo: {fmt(cp.custo)}</span>
                    <span className="text-red-600 font-bold">Prejuízo: {fmt(Math.abs(cp.lucro))}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

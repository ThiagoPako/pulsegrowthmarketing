import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/vpsDb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { UserMinus, TrendingDown, TrendingUp, Users, Target, AlertTriangle, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ClientLogo from '@/components/ClientLogo';

interface CancelledClient {
  id: string;
  company_name: string;
  status: string;
  cancellation_date: string | null;
  cancellation_reason: string | null;
  created_at: string;
  logo_url: string | null;
  color: string;
  plan_id: string | null;
}

interface ContractData {
  client_id: string;
  contract_value: number;
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const PIE_COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function CancellationReports() {
  const { clients } = useApp();
  const [cancelledClients, setCancelledClients] = useState<CancelledClient[]>([]);
  const [contracts, setContracts] = useState<ContractData[]>([]);
  const [growthTarget, setGrowthTarget] = useState(10); // default 10% growth
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [cancelledRes, contractsRes, goalsRes] = await Promise.all([
          supabase.from('clients').select('id, company_name, status, cancellation_date, cancellation_reason, created_at, logo_url, color, plan_id').eq('status', 'cancelado'),
          supabase.from('financial_contracts').select('client_id, contract_value'),
          supabase.from('goals').select('*').eq('type', 'crescimento').eq('status', 'em_andamento').limit(1),
        ]);
        if (cancelledRes.data) setCancelledClients(cancelledRes.data as any[]);
        if (contractsRes.data) setContracts(contractsRes.data as any[]);
        if (goalsRes.data && goalsRes.data.length > 0) {
          setGrowthTarget(Number((goalsRes.data[0] as any).target_value) || 10);
        }
      } catch (err) {
        console.error('Error fetching cancellation data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const activeClients = clients.filter(c => (c as any).status !== 'cancelado').length;
    const totalCancelled = cancelledClients.length;

    // Cancellation rate
    const totalEver = totalClients + totalCancelled;
    const cancellationRate = totalEver > 0 ? (totalCancelled / totalEver) * 100 : 0;

    // Average contract value
    const contractValues = contracts.map(c => c.contract_value).filter(v => v > 0);
    const avgContractValue = contractValues.length > 0
      ? contractValues.reduce((s, v) => s + v, 0) / contractValues.length
      : 0;

    // Monthly revenue from active clients
    const activeContracts = contracts.filter(c => {
      const client = clients.find(cl => cl.id === c.client_id);
      return client && (client as any).status !== 'cancelado';
    });
    const monthlyRevenue = activeContracts.reduce((s, c) => s + c.contract_value, 0);

    // Lost revenue from cancelled clients
    const cancelledContracts = contracts.filter(c => cancelledClients.some(cc => cc.id === c.client_id));
    const lostRevenue = cancelledContracts.reduce((s, c) => s + c.contract_value, 0);

    // Cancellations by month (last 12 months)
    const byMonth: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, 'MMM/yy', { locale: ptBR });
      byMonth[key] = 0;
    }
    cancelledClients.forEach(c => {
      if (c.cancellation_date) {
        const key = format(new Date(c.cancellation_date), 'MMM/yy', { locale: ptBR });
        if (byMonth[key] !== undefined) byMonth[key]++;
      }
    });

    // Reasons breakdown
    const byReason: Record<string, number> = {};
    cancelledClients.forEach(c => {
      const reason = c.cancellation_reason || 'Não informado';
      byReason[reason] = (byReason[reason] || 0) + 1;
    });

    // Recent cancellation rate (last 3 months)
    const threeMonthsAgo = subMonths(new Date(), 3);
    const recentCancelled = cancelledClients.filter(c => 
      c.cancellation_date && new Date(c.cancellation_date) >= threeMonthsAgo
    ).length;
    const recentRate = activeClients > 0 ? (recentCancelled / (activeClients + recentCancelled)) * 100 : 0;

    // Clients needed to maintain current revenue (replace cancelled)
    const avgMonthCancellations = totalCancelled > 0 ? recentCancelled / 3 : 0;
    const clientsToMaintain = Math.ceil(avgMonthCancellations);

    // Clients needed to grow
    const growthRevenueTarget = monthlyRevenue * (growthTarget / 100);
    const clientsToGrow = avgContractValue > 0
      ? Math.ceil((growthRevenueTarget / avgContractValue) + avgMonthCancellations)
      : 0;

    return {
      totalClients: activeClients,
      totalCancelled,
      cancellationRate,
      recentRate,
      avgContractValue,
      monthlyRevenue,
      lostRevenue,
      clientsToMaintain,
      clientsToGrow,
      avgMonthCancellations,
      byMonth: Object.entries(byMonth).map(([month, count]) => ({ month, count })),
      byReason: Object.entries(byReason).map(([name, value]) => ({ name, value })),
    };
  }, [clients, cancelledClients, contracts, growthTarget]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <UserMinus size={24} className="text-destructive" />
          Relatório de Cancelamentos
        </h1>
        <p className="text-sm text-muted-foreground">Análise de churn e projeções de crescimento</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Users size={20} className="mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{stats.totalClients}</p>
            <p className="text-xs text-muted-foreground">Clientes Ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <UserMinus size={20} className="mx-auto mb-1 text-destructive" />
            <p className="text-2xl font-bold">{stats.totalCancelled}</p>
            <p className="text-xs text-muted-foreground">Cancelados Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingDown size={20} className="mx-auto mb-1 text-amber-500" />
            <p className="text-2xl font-bold">{stats.cancellationRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Cancelamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign size={20} className="mx-auto mb-1 text-destructive" />
            <p className="text-2xl font-bold">R$ {stats.lostRevenue.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground">Receita Perdida</p>
          </CardContent>
        </Card>
      </div>

      {/* Targets Cards */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Para Manter a Receita</p>
                <p className="text-3xl font-bold mt-1">{stats.clientsToMaintain} <span className="text-base font-normal text-muted-foreground">clientes/mês</span></p>
                <p className="text-xs text-muted-foreground mt-1">
                  Baseado na média de {stats.avgMonthCancellations.toFixed(1)} cancelamentos/mês nos últimos 3 meses
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <TrendingUp size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Para Crescer {growthTarget}%</p>
                <p className="text-3xl font-bold mt-1">{stats.clientsToGrow} <span className="text-base font-normal text-muted-foreground">clientes/mês</span></p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ticket médio: R$ {stats.avgContractValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} · Meta: +R$ {(stats.monthlyRevenue * growthTarget / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}/mês
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Monthly cancellation chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cancelamentos por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.byMonth}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Cancelamentos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Reason distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Motivos de Cancelamento</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {stats.byReason.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={stats.byReason} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                    {stats.byReason.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-12">Nenhum cancelamento registrado</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancelled clients table */}
      {cancelledClients.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clientes Cancelados</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data Cancelamento</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Tempo Ativo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cancelledClients
                  .sort((a, b) => (b.cancellation_date || '').localeCompare(a.cancellation_date || ''))
                  .map(c => {
                    const createdAt = new Date(c.created_at);
                    const cancelledAt = c.cancellation_date ? new Date(c.cancellation_date) : new Date();
                    const months = Math.round((cancelledAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30));
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {c.logo_url ? (
                              <img src={c.logo_url} alt="" className="w-7 h-7 rounded object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold"
                                style={{ backgroundColor: `hsl(${c.color || '220 10% 50%'} / 0.15)`, color: `hsl(${c.color || '220 10% 50%'})` }}>
                                {c.company_name.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="text-sm font-medium">{c.company_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.cancellation_date ? format(new Date(c.cancellation_date), 'dd/MM/yyyy') : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{c.cancellation_reason || 'Não informado'}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {months > 0 ? `${months} meses` : '< 1 mês'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

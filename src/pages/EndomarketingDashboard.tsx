import { useEndoContracts, useEndoTasks, useEndoMetrics, getCategoryLabel } from '@/hooks/useEndomarketing';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, DollarSign, TrendingUp, Percent, Receipt, Plus, BarChart3, ArrowRight, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';

export default function EndomarketingDashboard() {
  const { contracts, loading: loadingC } = useEndoContracts();
  const { tasks, loading: loadingT } = useEndoTasks();
  const metrics = useEndoMetrics(contracts, tasks);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const metricCards = [
    { label: 'Clientes Ativos', value: String(metrics.totalClients), icon: Users, color: 'text-blue-500' },
    ...(isAdmin ? [
      { label: 'Faturamento Mensal', value: fmt(metrics.monthlyRevenue), icon: DollarSign, color: 'text-green-500' },
      { label: 'Custos Parceiros', value: fmt(metrics.monthlyCosts), icon: Receipt, color: 'text-orange-500' },
      { label: 'Lucro Mensal', value: fmt(metrics.monthlyProfit), icon: TrendingUp, color: metrics.monthlyProfit >= 0 ? 'text-emerald-500' : 'text-red-500' },
      { label: 'Margem Média', value: `${metrics.avgMargin.toFixed(1)}%`, icon: Percent, color: metrics.avgMargin >= 30 ? 'text-emerald-500' : metrics.avgMargin >= 15 ? 'text-yellow-500' : 'text-red-500' },
    ] : []),
  ];

  // Grid cols based on number of cards
  const gridCols = isAdmin ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-1 md:grid-cols-1';

  if (loadingC || loadingT) return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Endomarketing</h1>
          <p className="text-sm text-muted-foreground">Gestão de pacotes e parceiros</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/endomarketing/calendario')}>
            <CalendarDays size={16} className="mr-1" /> Calendário
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/endomarketing/relatorios')}>
            <BarChart3 size={16} className="mr-1" /> Relatórios
          </Button>
          <Button size="sm" onClick={() => navigate('/endomarketing/contratos')}>
            <Plus size={16} className="mr-1" /> Novo Contrato
          </Button>
        </div>
      </div>

      <div className={`grid ${gridCols} gap-3`}>
        {metricCards.map(m => (
          <Card key={m.label} className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <m.icon size={16} className={m.color} />
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-lg font-bold">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Contratos Ativos</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/endomarketing/contratos')}>
                Ver todos <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.activeContracts.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhum contrato ativo</p>}
            {metrics.activeContracts.slice(0, 6).map(c => {
              const profit = c.sale_price - c.partner_cost;
              const margin = c.sale_price > 0 ? (profit / c.sale_price * 100) : 0;
              return (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 rounded-full" style={{ backgroundColor: `hsl(${c.clients?.color || '217 91% 60%'})` }} />
                    <div>
                      <p className="text-sm font-medium">{c.clients?.company_name || 'Cliente'}</p>
                      <p className="text-xs text-muted-foreground">{c.endomarketing_packages?.package_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-600">{fmt(profit)}</p>
                    <p className="text-xs text-muted-foreground">Margem: {margin.toFixed(0)}%</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Tarefas de Hoje</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/endomarketing/tarefas')}>
                Ver todas <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.todayTasks.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma tarefa para hoje</p>}
            {metrics.todayTasks.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-8 rounded-full" style={{ backgroundColor: `hsl(${t.clients?.color || '217 91% 60%'})` }} />
                  <div>
                    <p className="text-sm font-medium">{t.clients?.company_name}</p>
                    <p className="text-xs text-muted-foreground">{t.duration_minutes}min</p>
                  </div>
                </div>
                <Badge variant={t.status === 'concluida' ? 'default' : t.status === 'cancelada' ? 'destructive' : 'secondary'}>
                  {t.status === 'concluida' ? '✅ Concluída' : t.status === 'cancelada' ? 'Cancelada' : 'Pendente'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {metrics.activeContracts.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-3"><CardTitle className="text-base">🏆 Ranking de Lucratividade</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[...metrics.activeContracts].sort((a, b) => (b.sale_price - b.partner_cost) - (a.sale_price - a.partner_cost)).slice(0, 3).map((c, i) => {
                const profit = c.sale_price - c.partner_cost;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                    <span className="text-2xl">{medals[i]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.clients?.company_name}</p>
                      <p className="text-xs text-muted-foreground">{getCategoryLabel(c.endomarketing_packages?.category || '')}</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-600">{fmt(profit)}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useEndoContracts, useEndoTasks, useEndoMetrics, getCategoryLabel } from '@/hooks/useEndomarketing';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, DollarSign, TrendingUp, Percent, Receipt, Plus, BarChart3, ArrowRight, CalendarDays, Megaphone } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

export default function EndomarketingDashboard() {
  const { contracts, loading: loadingC } = useEndoContracts();
  const { tasks, loading: loadingT } = useEndoTasks();
  const metrics = useEndoMetrics(contracts, tasks);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canSeeFinancials = isAdmin || profile?.role === 'endomarketing' || profile?.role === 'parceiro';

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const ticketMedio = metrics.totalClients > 0 ? metrics.monthlyCosts / metrics.totalClients : 0;
  const ganhoTotal = metrics.monthlyCosts;

  const metricCards = [
    { label: 'Clientes Ativos', value: String(metrics.totalClients), icon: Users, color: 'bg-info/15 text-info', border: 'border-info/30' },
    ...(canSeeFinancials ? (isAdmin ? [
      { label: 'Faturamento Mensal', value: fmt(metrics.monthlyRevenue), icon: DollarSign, color: 'bg-success/15 text-success', border: 'border-success/30' },
      { label: 'Custos Parceiros', value: fmt(metrics.monthlyCosts), icon: Receipt, color: 'bg-warning/15 text-warning', border: 'border-warning/30' },
      { label: 'Lucro Mensal', value: fmt(metrics.monthlyProfit), icon: TrendingUp, color: metrics.monthlyProfit >= 0 ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive', border: metrics.monthlyProfit >= 0 ? 'border-success/30' : 'border-destructive/30' },
      { label: 'Margem Média', value: `${metrics.avgMargin.toFixed(1)}%`, icon: Percent, color: metrics.avgMargin >= 30 ? 'bg-success/15 text-success' : metrics.avgMargin >= 15 ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive', border: 'border-border' },
    ] : [
      { label: 'Faturamento', value: fmt(metrics.monthlyCosts), icon: DollarSign, color: 'bg-success/15 text-success', border: 'border-success/30' },
      { label: 'Ticket Médio', value: fmt(ticketMedio), icon: Receipt, color: 'bg-warning/15 text-warning', border: 'border-warning/30' },
      { label: 'Ganho Total', value: fmt(ganhoTotal), icon: TrendingUp, color: 'bg-success/15 text-success', border: 'border-success/30' },
    ]) : []),
  ];

  const gridCols = isAdmin ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5' : canSeeFinancials ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1';

  if (loadingC || loadingT) return (
    <div className="flex items-center justify-center p-12">
      <Megaphone size={28} className="text-primary animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-5 px-1 sm:px-0">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Megaphone size={20} className="text-primary shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-display font-bold truncate">Endomarketing</h1>
            <p className="text-[10px] sm:text-sm text-muted-foreground">Gestão de pacotes e parceiros</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/endomarketing/calendario')} className="text-[10px] sm:text-sm h-8 px-2 sm:px-3 gap-1">
            <CalendarDays size={13} /> <span className="truncate">Calendário</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/endomarketing/relatorios')} className="text-[10px] sm:text-sm h-8 px-2 sm:px-3 gap-1">
            <BarChart3 size={13} /> <span className="truncate">Relatórios</span>
          </Button>
          <Button size="sm" onClick={() => navigate('/endomarketing/contratos')} className="text-[10px] sm:text-sm h-8 px-2 sm:px-3 gap-1">
            <Plus size={13} /> <span className="truncate">Contrato</span>
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className={`grid ${gridCols} gap-2 sm:gap-3`}>
        {metricCards.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.03 }}
          >
            <Card className={`glass-card border ${m.border} relative overflow-hidden`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.color}`}>
                    <m.icon size={14} />
                  </div>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{m.label}</span>
                </div>
                <p className="text-base sm:text-lg font-bold">{m.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Active Contracts */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
          <Card className="glass-card">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt size={14} className="text-primary" />
                  <CardTitle className="text-sm sm:text-base">Contratos Ativos</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/endomarketing/contratos')} className="text-xs">
                  Ver todos <ArrowRight size={12} className="ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-3 sm:px-6 pb-3 sm:pb-6">
              {metrics.activeContracts.length === 0 && (
                <div className="text-center py-6">
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                    <Rocket size={24} className="text-muted-foreground/30 -rotate-45 mx-auto" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground mt-2">Nenhum contrato ativo</p>
                </div>
              )}
              {metrics.activeContracts.slice(0, 6).map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl border-2 border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: `hsl(${c.clients?.color || '217 91% 60%'})` }} />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">{c.clients?.company_name || 'Cliente'}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{c.endomarketing_packages?.package_name}</p>
                    </div>
                  </div>
                  {canSeeFinancials && (
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs sm:text-sm font-semibold text-success">{fmt(c.sale_price - c.partner_cost)}</p>
                      <p className="text-[10px] text-muted-foreground">{c.sale_price > 0 ? ((c.sale_price - c.partner_cost) / c.sale_price * 100).toFixed(0) : 0}%</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Today's Tasks */}
        <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
          <Card className="glass-card">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                    <Rocket size={14} className="text-warning -rotate-45" />
                  </motion.div>
                  <CardTitle className="text-sm sm:text-base">Tarefas de Hoje</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/endomarketing/tarefas')} className="text-xs">
                  Ver todas <ArrowRight size={12} className="ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-3 sm:px-6 pb-3 sm:pb-6">
              {metrics.todayTasks.length === 0 && (
                <div className="text-center py-6">
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                    <Rocket size={24} className="text-muted-foreground/30 -rotate-45 mx-auto" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground mt-2">Nenhuma tarefa para hoje</p>
                </div>
              )}
              {metrics.todayTasks.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl border-2 border-border bg-muted/20"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: `hsl(${t.clients?.color || '217 91% 60%'})` }} />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">{t.clients?.company_name}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{t.duration_minutes}min</p>
                    </div>
                  </div>
                  <Badge
                    variant={t.status === 'concluida' ? 'default' : t.status === 'cancelada' ? 'destructive' : 'secondary'}
                    className="text-[10px] sm:text-xs shrink-0"
                  >
                    {t.status === 'concluida' ? '✅ Concluída' : t.status === 'cancelada' ? 'Cancelada' : '⏳ Pendente'}
                  </Badge>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Ranking */}
      {canSeeFinancials && metrics.activeContracts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="glass-card">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
              <div className="flex items-center gap-2">
                <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  <Rocket size={16} className="text-warning -rotate-45" />
                </motion.div>
                <CardTitle className="text-sm sm:text-base">Ranking de Lucratividade</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                {[...metrics.activeContracts].sort((a, b) => (b.sale_price - b.partner_cost) - (a.sale_price - a.partner_cost)).slice(0, 3).map((c, i) => {
                  const profit = c.sale_price - c.partner_cost;
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      whileHover={{ scale: 1.03 }}
                      className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl border-2 border-border bg-muted/20"
                    >
                      <span className="text-xl sm:text-2xl">{medals[i]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate">{c.clients?.company_name}</p>
                        <p className="text-[10px] text-muted-foreground">{getCategoryLabel(c.endomarketing_packages?.category || '')}</p>
                      </div>
                      <p className="text-xs sm:text-sm font-bold text-success shrink-0">{fmt(profit)}</p>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, UserPlus, AlertTriangle, Rocket, Package } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import type { EndoContract, EndoTask } from '@/hooks/useEndomarketing';

const MAX_HOURS_PER_DAY = 8;
const WEEKDAYS = 5;

interface Props {
  contracts: EndoContract[];
  tasks: EndoTask[];
}

export default function EndoCapacityWidget({ contracts, tasks }: Props) {
  const activeContracts = contracts.filter(c => c.status === 'ativo');

  // Calculate contracted weekly hours from packages
  const contractedWeeklyHours = useMemo(() => {
    return activeContracts.reduce((total, c) => {
      const pkg = c.endomarketing_packages;
      if (!pkg) return total;
      return total + (Number(pkg.sessions_per_week || 0) * Number(pkg.duration_hours || 1));
    }, 0);
  }, [activeContracts]);

  // Per-contract breakdown
  const contractBreakdown = useMemo(() => {
    return activeContracts.map(c => {
      const pkg = c.endomarketing_packages;
      const sessionsPerWeek = Number(pkg?.sessions_per_week || 0);
      const durationHours = Number(pkg?.duration_hours || 1);
      return {
        id: c.id,
        clientName: c.clients?.company_name || 'Cliente',
        color: c.clients?.color || '217 91% 60%',
        packageName: pkg?.package_name || '—',
        sessionsPerWeek,
        durationHours,
        weeklyHours: sessionsPerWeek * durationHours,
      };
    }).sort((a, b) => b.weeklyHours - a.weeklyHours);
  }, [activeContracts]);

  // Task-based daily analysis for current week
  const weeklyTaskAnalysis = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const dailyHours: Record<string, number> = {};
    for (let i = 0; i < 5; i++) {
      dailyHours[format(addDays(weekStart, i), 'yyyy-MM-dd')] = 0;
    }
    const weekEnd = addDays(weekStart, 4);
    const wsStr = format(weekStart, 'yyyy-MM-dd');
    const weStr = format(weekEnd, 'yyyy-MM-dd');
    tasks
      .filter(t => t.date >= wsStr && t.date <= weStr && t.status !== 'cancelada')
      .forEach(t => {
        if (dailyHours[t.date] !== undefined) {
          dailyHours[t.date] += Number(t.duration_minutes || 0) / 60;
        }
      });
    return Object.entries(dailyHours).map(([date, hours]) => ({
      date,
      hours,
      capacity: MAX_HOURS_PER_DAY,
      percentage: Math.min((hours / MAX_HOURS_PER_DAY) * 100, 100),
    }));
  }, [tasks]);

  const totalWeeklyCapacity = MAX_HOURS_PER_DAY * WEEKDAYS;
  const totalWeeklyTasked = weeklyTaskAnalysis.reduce((s, d) => s + d.hours, 0);
  const contractedPct = totalWeeklyCapacity > 0 ? (contractedWeeklyHours / totalWeeklyCapacity) * 100 : 0;
  const remainingWeekly = Math.max(totalWeeklyCapacity - contractedWeeklyHours, 0);

  const avgHoursPerContract = activeContracts.length > 0 && contractedWeeklyHours > 0
    ? contractedWeeklyHours / activeContracts.length : 4;
  const additionalClients = avgHoursPerContract > 0 ? Math.floor(remainingWeekly / avgHoursPerContract) : 0;

  const statusColor = (pct: number) =>
    pct >= 95 ? 'text-destructive' : pct >= 75 ? 'text-warning' : 'text-success';
  const progressColor = (pct: number) =>
    pct >= 95 ? '[&>div]:bg-destructive' : pct >= 75 ? '[&>div]:bg-warning' : '[&>div]:bg-success';
  const getDayLabel = (d: string) => format(new Date(d + 'T12:00:00'), 'EEEE', { locale: ptBR });

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-card border border-info/30 overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-info/15 text-info"><Users size={14} /></div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Clientes Ativos</span>
              </div>
              <p className="text-base sm:text-lg font-bold">{activeContracts.length}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className={`glass-card border overflow-hidden ${contractedPct >= 95 ? 'border-destructive/30' : contractedPct >= 75 ? 'border-warning/30' : 'border-success/30'}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${contractedPct >= 95 ? 'bg-destructive/15 text-destructive' : contractedPct >= 75 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
                  <Package size={14} />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Contratado/Sem</span>
              </div>
              <p className={`text-base sm:text-lg font-bold ${statusColor(contractedPct)}`}>
                {contractedWeeklyHours.toFixed(0)}h <span className="text-[10px] font-normal text-muted-foreground">/ {totalWeeklyCapacity}h</span>
              </p>
              <Progress value={Math.min(contractedPct, 100)} className={`h-1.5 mt-1 ${progressColor(contractedPct)}`} />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="glass-card border border-border overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-muted text-muted-foreground"><Clock size={14} /></div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Disponível/Sem</span>
              </div>
              <p className="text-base sm:text-lg font-bold">{remainingWeekly.toFixed(1)}h</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="glass-card border border-success/30 overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-success/15 text-success"><UserPlus size={14} /></div>
                <span className="text-[10px] sm:text-xs text-muted-foreground">Cabe + Clientes</span>
              </div>
              <p className="text-base sm:text-lg font-bold text-success">+{additionalClients}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Contract breakdown */}
      {contractBreakdown.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-2 px-3 sm:px-6">
            <CardTitle className="text-sm flex items-center gap-2">
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                <Rocket size={14} className="text-primary -rotate-45" />
              </motion.div>
              Ocupação por Contrato
              <Badge variant="outline" className="text-[10px]">{contractedWeeklyHours}h contratadas</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-3 sm:px-6 pb-3 sm:pb-6">
            {contractBreakdown.map((cb, i) => {
              const pct = totalWeeklyCapacity > 0 ? (cb.weeklyHours / totalWeeklyCapacity) * 100 : 0;
              return (
                <motion.div key={cb.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-5 rounded-full shrink-0" style={{ backgroundColor: `hsl(${cb.color})` }} />
                      <span className="text-xs font-medium truncate">{cb.clientName}</span>
                      <Badge variant="outline" className="text-[9px] px-1 shrink-0">{cb.packageName}</Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{cb.sessionsPerWeek}x {cb.durationHours}h</span>
                      <span className="text-xs font-bold">{cb.weeklyHours}h/sem</span>
                    </div>
                  </div>
                  <Progress value={pct} className={`h-1.5 ${progressColor(pct * 2.5)}`} />
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Daily task breakdown */}
      <Card className="glass-card">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm flex items-center gap-2">
            📊 Tarefas da Semana
            <Badge variant="outline" className="text-[10px]">{totalWeeklyTasked.toFixed(1)}h agendadas</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-3 sm:px-6 pb-3 sm:pb-6">
          {weeklyTaskAnalysis.map((day, i) => (
            <motion.div key={day.date} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium capitalize w-24 text-xs">{getDayLabel(day.date)}</span>
                <div className="flex items-center gap-2">
                  {day.percentage >= 95 && <AlertTriangle size={12} className="text-destructive" />}
                  <span className="text-[10px] text-muted-foreground">{day.hours.toFixed(1)}h / {day.capacity}h</span>
                  <span className={`text-xs font-semibold ${statusColor(day.percentage)}`}>{day.percentage.toFixed(0)}%</span>
                </div>
              </div>
              <Progress value={day.percentage} className={`h-2 ${progressColor(day.percentage)}`} />
            </motion.div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
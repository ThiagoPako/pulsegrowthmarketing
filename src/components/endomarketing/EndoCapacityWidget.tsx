import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, UserPlus, AlertTriangle } from 'lucide-react';
import { format, startOfWeek, addDays, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { EndoContract, EndoTask } from '@/hooks/useEndomarketing';

const MAX_HOURS_PER_DAY = 4;
const WEEKDAYS = 5;

interface Props {
  contracts: EndoContract[];
  tasks: EndoTask[];
}

export default function EndoCapacityWidget({ contracts, tasks }: Props) {
  const activeContracts = contracts.filter(c => c.status === 'ativo');

  // Calculate daily committed hours from active contracts
  const weeklyAnalysis = useMemo(() => {
    const dailyHours: Record<string, number> = {};
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

    // Initialize weekdays
    for (let i = 0; i < 5; i++) {
      const d = format(addDays(weekStart, i), 'yyyy-MM-dd');
      dailyHours[d] = 0;
    }

    // Count task hours per day this week
    const weekEnd = addDays(weekStart, 4);
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    tasks
      .filter(t => t.date >= weekStartStr && t.date <= weekEndStr && t.status !== 'cancelada')
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
      remaining: Math.max(MAX_HOURS_PER_DAY - hours, 0),
    }));
  }, [tasks]);

  // Calculate total weekly capacity
  const totalWeeklyCapacity = MAX_HOURS_PER_DAY * WEEKDAYS;
  const totalWeeklyUsed = weeklyAnalysis.reduce((s, d) => s + d.hours, 0);
  const weeklyPercentage = (totalWeeklyUsed / totalWeeklyCapacity) * 100;
  const remainingWeekly = totalWeeklyCapacity - totalWeeklyUsed;

  // Estimate how many more clients we can take (avg hours per contract per week)
  const avgHoursPerContract = activeContracts.length > 0
    ? totalWeeklyUsed / activeContracts.length
    : 4; // default assumption: 4h/week per client
  const additionalClients = avgHoursPerContract > 0 ? Math.floor(remainingWeekly / avgHoursPerContract) : 0;

  const getStatusColor = (pct: number) => {
    if (pct >= 95) return 'text-red-500';
    if (pct >= 75) return 'text-yellow-500';
    return 'text-emerald-500';
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 95) return '[&>div]:bg-red-500';
    if (pct >= 75) return '[&>div]:bg-yellow-500';
    return '[&>div]:bg-emerald-500';
  };

  const getDayLabel = (dateStr: string) => {
    return format(new Date(dateStr + 'T12:00:00'), 'EEEE', { locale: ptBR });
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} className="text-blue-500" />
              <span className="text-xs text-muted-foreground">Clientes Ativos</span>
            </div>
            <p className="text-xl font-bold">{activeContracts.length}</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className={getStatusColor(weeklyPercentage)} />
              <span className="text-xs text-muted-foreground">Ocupação Semanal</span>
            </div>
            <p className={`text-xl font-bold ${getStatusColor(weeklyPercentage)}`}>
              {weeklyPercentage.toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Horas Restantes/Sem</span>
            </div>
            <p className="text-xl font-bold">{remainingWeekly.toFixed(1)}h</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <UserPlus size={16} className="text-emerald-500" />
              <span className="text-xs text-muted-foreground">Clientes a Mais</span>
            </div>
            <p className="text-xl font-bold text-emerald-500">+{additionalClients}</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily breakdown */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            📊 Capacidade Diária
            <Badge variant="outline" className="text-[10px]">{MAX_HOURS_PER_DAY}h/dia</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {weeklyAnalysis.map(day => (
            <div key={day.date} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium capitalize w-20">{getDayLabel(day.date)}</span>
                <div className="flex items-center gap-2">
                  {day.percentage >= 95 && <AlertTriangle size={12} className="text-red-500" />}
                  <span className="text-xs text-muted-foreground">
                    {day.hours.toFixed(1)}h / {day.capacity}h
                  </span>
                  <span className={`text-xs font-semibold ${getStatusColor(day.percentage)}`}>
                    {day.percentage.toFixed(0)}%
                  </span>
                </div>
              </div>
              <Progress value={day.percentage} className={`h-2 ${getProgressColor(day.percentage)}`} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

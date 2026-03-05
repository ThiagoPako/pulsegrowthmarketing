import { useMemo } from 'react';
import type { Client, CompanySettings, User } from '@/types';
import type { Recording } from '@/types';
import { Video, Users, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  clients: Client[];
  users: User[];
  recordings: Recording[];
  settings: CompanySettings;
  compact?: boolean;
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export default function AgencyCapacityWidget({ clients, users, recordings, settings, compact = false }: Props) {
  const capacity = useMemo(() => {
    const videomakers = users.filter(u => u.role === 'videomaker');
    const duration = settings.recordingDuration;
    const shiftAStart = timeToMinutes(settings.shiftAStart);
    const shiftAEnd = timeToMinutes(settings.shiftAEnd);
    const shiftBStart = timeToMinutes(settings.shiftBStart);
    const shiftBEnd = timeToMinutes(settings.shiftBEnd);
    const workDaysCount = settings.workDays.length;

    // Calculate slots per day per videomaker
    let slotsPerDay = 0;
    for (let t = shiftAStart; t + duration <= shiftAEnd; t += duration + 30) slotsPerDay++;
    for (let t = shiftBStart; t + duration <= shiftBEnd; t += duration + 30) slotsPerDay++;

    // Total monthly slots (approx 4.3 weeks/month)
    const weeksPerMonth = 4.3;
    const totalMonthlySlots = Math.floor(slotsPerDay * workDaysCount * weeksPerMonth * videomakers.length);

    // Total monthly hours available
    const totalMonthlyHours = (slotsPerDay * duration * workDaysCount * weeksPerMonth * videomakers.length) / 60;

    // Demand: sum of all clients' monthly_recordings
    const totalMonthlyDemand = clients.reduce((sum, c) => sum + (c.monthlyRecordings || 4), 0);

    // Current month actual recordings
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const monthRecs = recordings.filter(r => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start: monthStart, end: monthEnd }) && r.status !== 'cancelada';
    });
    const monthDone = monthRecs.filter(r => r.status === 'concluida').length;
    const monthScheduled = monthRecs.filter(r => r.status === 'agendada').length;

    // Occupation percentage
    const occupationPct = totalMonthlySlots > 0 ? Math.round((totalMonthlyDemand / totalMonthlySlots) * 100) : 0;

    // Available slots remaining
    const availableSlots = Math.max(0, totalMonthlySlots - totalMonthlyDemand);

    // Per-videomaker stats
    const vmStats = videomakers.map(vm => {
      const vmClients = clients.filter(c => c.videomaker === vm.id);
      const vmDemand = vmClients.reduce((sum, c) => sum + (c.monthlyRecordings || 4), 0);
      const vmCapacity = Math.floor(slotsPerDay * workDaysCount * weeksPerMonth);
      const vmOccupation = vmCapacity > 0 ? Math.round((vmDemand / vmCapacity) * 100) : 0;
      return { vm, demand: vmDemand, capacity: vmCapacity, occupation: vmOccupation, clientCount: vmClients.length };
    });

    return {
      videomakerCount: videomakers.length,
      slotsPerDay,
      totalMonthlySlots,
      totalMonthlyHours: Math.round(totalMonthlyHours),
      totalMonthlyDemand,
      monthDone,
      monthScheduled,
      occupationPct,
      availableSlots,
      vmStats,
    };
  }, [clients, users, recordings, settings]);

  const getStatusColor = (pct: number) => {
    if (pct >= 90) return 'text-destructive';
    if (pct >= 70) return 'text-warning';
    return 'text-success';
  };

  const getStatusBg = (pct: number) => {
    if (pct >= 90) return 'bg-destructive/15';
    if (pct >= 70) return 'bg-warning/15';
    return 'bg-success/15';
  };

  const getStatusLabel = (pct: number) => {
    if (pct >= 95) return 'Capacidade Esgotada';
    if (pct >= 80) return 'Próximo do Limite';
    if (pct >= 60) return 'Ocupação Moderada';
    return 'Capacidade Disponível';
  };

  if (compact) {
    return (
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> Capacidade da Agência
          </h3>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getStatusBg(capacity.occupationPct)} ${getStatusColor(capacity.occupationPct)}`}>
            {capacity.occupationPct}% ocupada
          </span>
        </div>
        <Progress value={capacity.occupationPct} className="h-2" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-display font-bold">{capacity.totalMonthlySlots}</p>
            <p className="text-[10px] text-muted-foreground">Slots/mês</p>
          </div>
          <div>
            <p className="text-lg font-display font-bold">{capacity.totalMonthlyDemand}</p>
            <p className="text-[10px] text-muted-foreground">Demanda</p>
          </div>
          <div>
            <p className={`text-lg font-display font-bold ${getStatusColor(capacity.occupationPct)}`}>{capacity.availableSlots}</p>
            <p className="text-[10px] text-muted-foreground">Disponíveis</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" /> Capacidade de Captação
        </h3>
        <div className="flex items-center gap-2">
          {capacity.occupationPct >= 90 ? (
            <AlertTriangle size={14} className="text-destructive" />
          ) : (
            <CheckCircle size={14} className="text-success" />
          )}
          <span className={`text-xs font-bold ${getStatusColor(capacity.occupationPct)}`}>
            {getStatusLabel(capacity.occupationPct)}
          </span>
        </div>
      </div>

      <Progress value={capacity.occupationPct} className="h-2.5" />

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <Video size={16} className="mx-auto mb-1 text-primary" />
          <p className="text-xl font-display font-bold">{capacity.slotsPerDay}</p>
          <p className="text-[10px] text-muted-foreground">Slots/dia/VM</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <Users size={16} className="mx-auto mb-1 text-primary" />
          <p className="text-xl font-display font-bold">{capacity.totalMonthlySlots}</p>
          <p className="text-[10px] text-muted-foreground">Capacidade/mês</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <TrendingUp size={16} className="mx-auto mb-1 text-warning" />
          <p className="text-xl font-display font-bold">{capacity.totalMonthlyDemand}</p>
          <p className="text-[10px] text-muted-foreground">Demanda/mês</p>
        </div>
        <div className={`rounded-xl p-3 text-center ${getStatusBg(capacity.occupationPct)}`}>
          <p className={`text-xl font-display font-bold ${getStatusColor(capacity.occupationPct)}`}>{capacity.availableSlots}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Vagas livres</p>
        </div>
      </div>

      {/* Month progress */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })}</span>
        <span>{capacity.monthDone} concluídas · {capacity.monthScheduled} agendadas</span>
      </div>

      {/* Per-videomaker breakdown */}
      {capacity.vmStats.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Por Videomaker</p>
          {capacity.vmStats.map(({ vm, demand, capacity: cap, occupation, clientCount }) => (
            <div key={vm.id} className="flex items-center gap-3">
              <span className="text-sm font-medium w-24 truncate">{vm.name}</span>
              <div className="flex-1">
                <Progress value={occupation} className="h-1.5" />
              </div>
              <span className={`text-xs font-bold w-10 text-right ${getStatusColor(occupation)}`}>{occupation}%</span>
              <span className="text-[10px] text-muted-foreground w-20 text-right">{demand}/{cap} ({clientCount} cli)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

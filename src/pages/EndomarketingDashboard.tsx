import { useMemo, useState } from 'react';
import { useEndoClientes, useEndoAgendamentos, useEndoProfissionais } from '@/hooks/useEndomarketing';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import {
  Users, Calendar, Clock, TrendingUp, AlertTriangle, CheckCircle,
  Building2, BarChart3, Plus
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, addDays, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const DAY_LABELS_SHORT: Record<string, string> = {
  segunda: 'Seg', terca: 'Ter', quarta: 'Qua', quinta: 'Qui', sexta: 'Sex',
};

export default function EndomarketingDashboard() {
  const { clientes } = useEndoClientes();
  const { agendamentos, getDailyOccupation } = useEndoAgendamentos();
  const { profissionais } = useEndoProfissionais();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const today = format(new Date(), 'yyyy-MM-dd');
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const stats = useMemo(() => {
    const activeClients = clientes.filter(c => c.active).length;
    const weekSchedules = agendamentos.filter(a => {
      try {
        const d = parseISO(a.date);
        return isWithinInterval(d, { start: weekStart, end: weekEnd }) && a.status !== 'cancelado';
      } catch { return false; }
    });
    const clientsWithRecordingThisWeek = new Set(weekSchedules.map(a => a.cliente_id)).size;
    const todaySchedules = agendamentos.filter(a => a.date === today && a.status !== 'cancelado');
    const hoursToday = todaySchedules.reduce((sum, a) => sum + a.duration, 0) / 60;

    // Calculate available hours today for all professionals
    const totalAvailableToday = profissionais.reduce((sum, p) => sum + p.max_hours_per_day, 0);
    const availableHoursToday = totalAvailableToday - hoursToday;

    // Days analysis for the week
    const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
    let almostFullDays = 0;
    let freeDays = 0;
    weekDays.forEach(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const totalOccupied = profissionais.reduce((sum, p) => sum + getDailyOccupation(p.id, dateStr), 0);
      const totalCapacity = profissionais.reduce((sum, p) => sum + p.max_hours_per_day * 60, 0);
      const pct = totalCapacity > 0 ? totalOccupied / totalCapacity : 0;
      if (pct >= 0.7) almostFullDays++;
      if (pct === 0) freeDays++;
    });

    return { activeClients, clientsWithRecordingThisWeek, hoursToday, availableHoursToday, almostFullDays, freeDays };
  }, [clientes, agendamentos, profissionais, today, weekStart, weekEnd, getDailyOccupation]);

  const activeClientes = clientes.filter(c => c.active);

  const getWeekStatus = (clienteId: string) => {
    const weekSchedules = agendamentos.filter(a => {
      try {
        const d = parseISO(a.date);
        return a.cliente_id === clienteId && isWithinInterval(d, { start: weekStart, end: weekEnd }) && a.status !== 'cancelado';
      } catch { return false; }
    });
    return weekSchedules.length > 0 ? 'agendado' : 'pendente';
  };

  const statCards = [
    { label: 'Clientes Ativos', value: stats.activeClients, icon: Building2, color: 'text-primary' },
    { label: 'Gravando esta semana', value: stats.clientsWithRecordingThisWeek, icon: CheckCircle, color: 'text-emerald-500' },
    { label: 'Horas agendadas hoje', value: `${stats.hoursToday.toFixed(1)}h`, icon: Clock, color: 'text-blue-500' },
    { label: 'Horas disponíveis hoje', value: `${stats.availableHoursToday.toFixed(1)}h`, icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Dias quase lotados', value: stats.almostFullDays, icon: AlertTriangle, color: 'text-amber-500' },
    { label: 'Dias livres', value: stats.freeDays, icon: Calendar, color: 'text-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Endomarketing</h1>
          <p className="text-muted-foreground text-sm">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate('/endomarketing/agenda')}>
            <Calendar size={16} className="mr-1.5" /> Agenda
          </Button>
          <Button size="sm" onClick={() => navigate('/endomarketing/clientes')}>
            <Plus size={16} className="mr-1.5" /> Novo Cliente
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCards.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon size={16} className={stat.color} />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className="text-2xl font-bold font-display">{stat.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Client cards */}
      <div>
        <h2 className="text-lg font-semibold font-display mb-3">Clientes Ativos</h2>
        {activeClientes.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>Nenhum cliente de endomarketing cadastrado.</p>
            <Button size="sm" className="mt-3" onClick={() => navigate('/endomarketing/clientes')}>
              <Plus size={16} className="mr-1.5" /> Adicionar Cliente
            </Button>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeClientes.map((cliente, i) => {
              const weekStatus = getWeekStatus(cliente.id);
              return (
                <motion.div key={cliente.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Card
                    className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
                    style={{ borderLeftColor: `hsl(${cliente.color})` }}
                    onClick={() => navigate(`/endomarketing/clientes?detail=${cliente.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold truncate">{cliente.company_name}</h3>
                        <Badge variant={weekStatus === 'agendado' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                          {weekStatus === 'agendado' ? 'Agendado' : 'Pendente'}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>📱 {cliente.stories_per_week} stories/semana</p>
                        <p>📅 {cliente.presence_days_per_week} dias/semana</p>
                        <p>🎯 {cliente.plan_type === 'gravacao_concentrada' ? 'Gravação concentrada' : 'Presencial recorrente'}</p>
                        <p>⏱ {cliente.session_duration}min por sessão</p>
                      </div>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {cliente.selected_days.map(d => (
                          <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary">{DAY_LABELS_SHORT[d] || d}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alerts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Alertas Operacionais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AlertsList clientes={activeClientes} agendamentos={agendamentos} profissionais={profissionais} weekStart={weekStart} weekEnd={weekEnd} />
        </CardContent>
      </Card>
    </div>
  );
}

function AlertsList({ clientes, agendamentos, profissionais, weekStart, weekEnd }: {
  clientes: any[]; agendamentos: any[]; profissionais: any[]; weekStart: Date; weekEnd: Date;
}) {
  const alerts: { type: 'warning' | 'error' | 'info'; message: string }[] = [];

  // Clients without schedule this week
  clientes.forEach(c => {
    const hasSchedule = agendamentos.some(a => {
      try {
        const d = parseISO(a.date);
        return a.cliente_id === c.id && isWithinInterval(d, { start: weekStart, end: weekEnd }) && a.status !== 'cancelado';
      } catch { return false; }
    });
    if (!hasSchedule) {
      alerts.push({ type: 'warning', message: `${c.company_name} sem agendamento esta semana` });
    }
  });

  // Overloaded professionals
  const today = format(new Date(), 'yyyy-MM-dd');
  profissionais.forEach(p => {
    const todayMinutes = agendamentos
      .filter(a => a.profissional_id === p.id && a.date === today && a.status !== 'cancelado')
      .reduce((sum: number, a: any) => sum + a.duration, 0);
    if (todayMinutes > p.max_hours_per_day * 60) {
      alerts.push({ type: 'error', message: `Profissional acima do limite hoje (${(todayMinutes / 60).toFixed(1)}h / ${p.max_hours_per_day}h)` });
    }
  });

  if (alerts.length === 0) {
    return <p className="text-sm text-muted-foreground">✅ Nenhum alerta no momento.</p>;
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div key={i} className={`flex items-center gap-2 text-sm p-2 rounded-lg ${
          alert.type === 'error' ? 'bg-destructive/10 text-destructive' :
          alert.type === 'warning' ? 'bg-amber-500/10 text-amber-700' :
          'bg-blue-500/10 text-blue-700'
        }`}>
          <AlertTriangle size={14} />
          {alert.message}
        </div>
      ))}
    </div>
  );
}

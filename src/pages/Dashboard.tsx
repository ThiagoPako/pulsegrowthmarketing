import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { Video, Plus, XCircle, RefreshCw, TrendingUp, Users, Calendar } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="stat-card">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold">{value}</p>
    </motion.div>
  );
}

export default function Dashboard() {
  const { currentUser, recordings, clients, users } = useApp();
  const today = format(new Date(), 'yyyy-MM-dd');

  const stats = useMemo(() => {
    const todayRecs = recordings.filter(r => r.date === today);
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    const weekRecs = recordings.filter(r => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    });
    const monthRecs = recordings.filter(r => {
      const d = parseISO(r.date);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });

    const relevantToday = currentUser?.role === 'videomaker'
      ? todayRecs.filter(r => r.videomakerId === currentUser.id)
      : todayRecs;
    const relevantWeek = currentUser?.role === 'videomaker'
      ? weekRecs.filter(r => r.videomakerId === currentUser.id)
      : weekRecs;
    const relevantMonth = currentUser?.role === 'videomaker'
      ? monthRecs.filter(r => r.videomakerId === currentUser.id)
      : monthRecs;

    return {
      todayTotal: relevantToday.filter(r => r.status === 'concluida').length,
      todayExtras: relevantToday.filter(r => r.type === 'extra' && r.status === 'concluida').length,
      todayCancelled: relevantToday.filter(r => r.status === 'cancelada').length,
      todaySecondary: relevantToday.filter(r => r.type === 'secundaria').length,
      weekTotal: relevantWeek.filter(r => r.status === 'concluida').length,
      weekExtras: relevantWeek.filter(r => r.type === 'extra' && r.status === 'concluida').length,
      monthTotal: relevantMonth.filter(r => r.status === 'concluida').length,
      weekScheduled: relevantWeek.filter(r => r.status === 'agendada').length,
    };
  }, [recordings, today, currentUser]);

  const todayRecordings = useMemo(() => {
    let recs = recordings.filter(r => r.date === today && r.status !== 'cancelada');
    if (currentUser?.role === 'videomaker') recs = recs.filter(r => r.videomakerId === currentUser.id);
    return recs.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [recordings, today, currentUser]);

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getVideomakerName = (id: string) => users.find(u => u.id === id)?.name || '—';

  const typeLabels = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Secundária' };
  const typeColors = { fixa: 'bg-info/20 text-info', extra: 'bg-warning/20 text-warning', secundaria: 'bg-primary/20 text-primary' };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">
          {currentUser?.role === 'videomaker' ? `Olá, ${currentUser.name}` : 'Dashboard'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
      </div>

      {/* Today stats */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Hoje</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Video} label="Gravados" value={stats.todayTotal} color="bg-success/20 text-success" />
          <StatCard icon={Plus} label="Extras" value={stats.todayExtras} color="bg-warning/20 text-warning" />
          <StatCard icon={XCircle} label="Cancelados" value={stats.todayCancelled} color="bg-destructive/20 text-destructive" />
          <StatCard icon={RefreshCw} label="Secundários" value={stats.todaySecondary} color="bg-primary/20 text-primary" />
        </div>
      </div>

      {/* Week stats */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Semana</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard icon={TrendingUp} label="Gravados" value={stats.weekTotal} color="bg-success/20 text-success" />
          <StatCard icon={Plus} label="Extras" value={stats.weekExtras} color="bg-warning/20 text-warning" />
          <StatCard icon={Calendar} label="Agendados" value={stats.weekScheduled} color="bg-info/20 text-info" />
        </div>
      </div>

      {/* Month */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Mês</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={Video} label="Total Mensal" value={stats.monthTotal} color="bg-primary/20 text-primary" />
          <StatCard icon={Users} label="Clientes Ativos" value={clients.length} color="bg-info/20 text-info" />
        </div>
      </div>

      {/* Today's Schedule */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Gravações de Hoje</h3>
        {todayRecordings.length === 0 ? (
          <div className="glass-card p-8 text-center text-muted-foreground">
            Nenhuma gravação agendada para hoje
          </div>
        ) : (
          <div className="space-y-2">
            {todayRecordings.map(rec => (
              <motion.div key={rec.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="glass-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-lg font-display font-bold text-primary">{rec.startTime}</div>
                  <div>
                    <p className="font-medium">{getClientName(rec.clientId)}</p>
                    <p className="text-xs text-muted-foreground">{getVideomakerName(rec.videomakerId)}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeColors[rec.type]}`}>
                  {typeLabels[rec.type]}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

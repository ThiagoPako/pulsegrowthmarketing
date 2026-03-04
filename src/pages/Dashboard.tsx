import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { ROLE_LABELS } from '@/types';
import { motion } from 'framer-motion';
import { Video, Plus, XCircle, RefreshCw, TrendingUp, Users as UsersIcon, Calendar, ArrowUpRight } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

function StatCard({ icon: Icon, label, value, accent, delay = 0 }: { icon: any; label: string; value: number | string; accent: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon size={18} />
        </div>
        <ArrowUpRight size={14} className="text-muted-foreground" />
      </div>
      <p className="text-2xl font-display font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </motion.div>
  );
}

export default function Dashboard() {
  const { currentUser, recordings, clients, users, tasks } = useApp();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  const stats = useMemo(() => {
    const todayRecs = recordings.filter(r => r.date === today);
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    const weekRecs = recordings.filter(r => { const d = parseISO(r.date); return isWithinInterval(d, { start: weekStart, end: weekEnd }); });
    const monthRecs = recordings.filter(r => { const d = parseISO(r.date); return isWithinInterval(d, { start: monthStart, end: monthEnd }); });

    const rel = (recs: typeof recordings) => currentUser?.role === 'videomaker' ? recs.filter(r => r.videomakerId === currentUser.id) : recs;

    const rToday = rel(todayRecs);
    const rWeek = rel(weekRecs);
    const rMonth = rel(monthRecs);

    return {
      todayTotal: rToday.filter(r => r.status === 'concluida').length,
      todayExtras: rToday.filter(r => r.type === 'extra' && r.status === 'concluida').length,
      todayCancelled: rToday.filter(r => r.status === 'cancelada').length,
      todaySecondary: rToday.filter(r => r.type === 'secundaria').length,
      weekTotal: rWeek.filter(r => r.status === 'concluida').length,
      weekExtras: rWeek.filter(r => r.type === 'extra' && r.status === 'concluida').length,
      monthTotal: rMonth.filter(r => r.status === 'concluida').length,
      weekScheduled: rWeek.filter(r => r.status === 'agendada').length,
    };
  }, [recordings, today, currentUser]);

  const todayRecordings = useMemo(() => {
    let recs = recordings.filter(r => r.date === today && r.status !== 'cancelada');
    if (currentUser?.role === 'videomaker') recs = recs.filter(r => r.videomakerId === currentUser.id);
    return recs.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [recordings, today, currentUser]);

  const videomakers = users.filter(u => u.role === 'videomaker');
  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';
  const getVideomakerName = (id: string) => users.find(u => u.id === id)?.name || '—';

  const typeLabels = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Secundária' };
  const typeColors = { fixa: 'bg-info/10 text-info', extra: 'bg-warning/10 text-warning', secundaria: 'bg-primary/10 text-primary' };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold">
          {currentUser?.role === 'videomaker' ? `Olá, ${currentUser.name} 👋` : 'Bem-vindo ao Pulse 👋'}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* Team avatars */}
      {currentUser?.role === 'admin' && videomakers.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Meu Time</h3>
          <div className="flex gap-6 overflow-x-auto pb-1">
            <button onClick={() => navigate('/equipe')} className="flex flex-col items-center gap-2 shrink-0">
              <div className="w-14 h-14 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center text-primary">
                <Plus size={20} />
              </div>
              <span className="text-[11px] text-primary font-medium">Convidar</span>
            </button>
            {videomakers.map(v => (
              <div key={v.id} className="flex flex-col items-center gap-2 shrink-0">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-border flex items-center justify-center text-foreground font-bold text-lg">
                  {v.name.charAt(0)}
                </div>
                <span className="text-[11px] text-muted-foreground font-medium max-w-[80px] text-center truncate">{v.name}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Indicadores do Dia</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Video} label="Gravados Hoje" value={stats.todayTotal} accent="bg-success/15 text-success" delay={0} />
          <StatCard icon={Plus} label="Extras Hoje" value={stats.todayExtras} accent="bg-warning/15 text-warning" delay={0.05} />
          <StatCard icon={XCircle} label="Cancelados" value={stats.todayCancelled} accent="bg-destructive/15 text-destructive" delay={0.1} />
          <StatCard icon={RefreshCw} label="Secundários" value={stats.todaySecondary} accent="bg-info/15 text-info" delay={0.15} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={TrendingUp} label="Gravados na Semana" value={stats.weekTotal} accent="bg-success/15 text-success" />
        <StatCard icon={Calendar} label="Agendados Semana" value={stats.weekScheduled} accent="bg-info/15 text-info" />
        <StatCard icon={UsersIcon} label="Clientes Ativos" value={clients.length} accent="bg-primary/15 text-primary" />
      </div>

      {/* Today schedule */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gravações de Hoje</h3>
          <button onClick={() => navigate('/agenda')} className="text-xs text-primary font-semibold hover:underline">VER AGENDA</button>
        </div>
        {todayRecordings.length === 0 ? (
          <div className="glass-card p-10 text-center text-muted-foreground text-sm">
            Nenhuma gravação agendada para hoje
          </div>
        ) : (
          <div className="grid gap-2">
            {todayRecordings.map((rec, i) => (
              <motion.div key={rec.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                className="glass-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-lg font-display font-bold text-primary w-14">{rec.startTime}</div>
                  <div>
                    <p className="font-medium text-sm">{getClientName(rec.clientId)}</p>
                    <p className="text-xs text-muted-foreground">{getVideomakerName(rec.videomakerId)}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${typeColors[rec.type]}`}>
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

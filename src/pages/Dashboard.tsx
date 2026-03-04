import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { DAY_LABELS } from '@/types';
import { motion } from 'framer-motion';
import {
  Video, Plus, XCircle, RefreshCw, TrendingUp, Calendar, Check,
  ChevronLeft, ChevronRight, Clock, Users as UsersIcon
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { currentUser, recordings, clients, users, tasks, cancelRecording, updateRecording, getSuggestionsForCancellation, activeRecordings } = useApp();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const currentWeekStr = format(weekStart, 'yyyy-MM-dd');

  // ── Stats ──
  const stats = useMemo(() => {
    const todayRecs = recordings.filter(r => r.date === today);
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());
    const weekRecs = recordings.filter(r => { const d = parseISO(r.date); return isWithinInterval(d, { start: weekStart, end: weekEnd }); });
    const monthRecs = recordings.filter(r => { const d = parseISO(r.date); return isWithinInterval(d, { start: monthStart, end: monthEnd }); });

    return {
      todayDone: todayRecs.filter(r => r.status === 'concluida').length,
      todayExtras: todayRecs.filter(r => r.type === 'extra' && r.status !== 'cancelada').length,
      todayCancelled: todayRecs.filter(r => r.status === 'cancelada').length,
      todaySecondary: todayRecs.filter(r => r.type === 'secundaria' && r.status !== 'cancelada').length,
      todayScheduled: todayRecs.filter(r => r.status === 'agendada').length,
      weekDone: weekRecs.filter(r => r.status === 'concluida').length,
      weekScheduled: weekRecs.filter(r => r.status === 'agendada').length,
      monthDone: monthRecs.filter(r => r.status === 'concluida').length,
      totalClients: clients.length,
    };
  }, [recordings, today, weekStart, weekEnd, clients]);

  // ── Today recordings ──
  const todayRecordings = useMemo(() => {
    let recs = recordings.filter(r => r.date === today && r.status !== 'cancelada');
    if (currentUser?.role === 'videomaker') recs = recs.filter(r => r.videomakerId === currentUser.id);
    return recs.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [recordings, today, currentUser]);

  // ── Videomaker progress ──
  const videomakers = users.filter(u => u.role === 'videomaker');
  const videomakerStats = useMemo(() => {
    return videomakers.map(vm => {
      const weekRecs = recordings.filter(r => r.videomakerId === vm.id && isWithinInterval(parseISO(r.date), { start: weekStart, end: weekEnd }));
      const done = weekRecs.filter(r => r.status === 'concluida').length;
      const total = weekRecs.length;
      const todayRecs = weekRecs.filter(r => r.date === today);
      const todayDone = todayRecs.filter(r => r.status === 'concluida').length;
      const todayTotal = todayRecs.filter(r => r.status !== 'cancelada').length;
      return { vm, weekDone: done, weekTotal: total, todayDone, todayTotal };
    });
  }, [videomakers, recordings, weekStart, weekEnd, today]);

  // ── Client progress ──
  const clientProgress = useMemo(() => {
    return clients.map(client => {
      const weekTasks = tasks.filter(t => t.clientId === client.id && t.weekStart === currentWeekStr);
      const done = weekTasks.filter(t => t.column === 'finalizado').length;
      const goal = client.weeklyGoal || 10;
      const weekRecs = recordings.filter(r => r.clientId === client.id && isWithinInterval(parseISO(r.date), { start: weekStart, end: weekEnd }));
      const recsDone = weekRecs.filter(r => r.status === 'concluida').length;
      const recsTotal = weekRecs.filter(r => r.status !== 'cancelada').length;
      return { client, tasksDone: done, tasksTotal: weekTasks.length, goal, recsDone, recsTotal, progress: Math.min(100, Math.round((done / goal) * 100)) };
    });
  }, [clients, tasks, recordings, currentWeekStr, weekStart, weekEnd]);

  // ── Week agenda ──
  const getRecsForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return recordings.filter(r => r.date === dateStr && r.status !== 'cancelada').sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const getClient = (id: string) => clients.find(c => c.id === id);
  const getClientName = (id: string) => getClient(id)?.companyName || '—';
  const getClientColor = (id: string) => getClient(id)?.color || '220 10% 50%';
  const getVideomakerName = (id: string) => users.find(u => u.id === id)?.name || '—';

  const typeLabels: Record<string, string> = { fixa: 'Fixa', extra: 'Extra', secundaria: 'Sec.' };
  const statusIcons: Record<string, React.ReactNode> = {
    agendada: <Clock size={12} className="text-info" />,
    concluida: <Check size={12} className="text-success" />,
  };

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">
            {currentUser?.role === 'videomaker' ? `Olá, ${currentUser.name} 👋` : 'Painel de Controle'}
          </h1>
          <p className="text-muted-foreground text-sm">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        </div>
      </div>

      {/* ── ROW 1: Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Gravados Hoje', value: stats.todayDone, icon: Video, color: 'bg-success/15 text-success' },
          { label: 'Agendados Hoje', value: stats.todayScheduled, icon: Clock, color: 'bg-info/15 text-info' },
          { label: 'Extras', value: stats.todayExtras, icon: Plus, color: 'bg-warning/15 text-warning' },
          { label: 'Cancelados', value: stats.todayCancelled, icon: XCircle, color: 'bg-destructive/15 text-destructive' },
          { label: 'Semana', value: stats.weekDone, icon: TrendingUp, color: 'bg-primary/15 text-primary' },
          { label: 'Clientes', value: stats.totalClients, icon: UsersIcon, color: 'bg-info/15 text-info' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="stat-card">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${s.color}`}>
              <s.icon size={16} />
            </div>
            <p className="text-xl font-display font-bold">{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── ROW 2: Today Schedule + Videomaker Progress ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today schedule - 2 cols */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm">Gravações de Hoje</h3>
            <span className="text-xs text-muted-foreground">{todayRecordings.length} gravações</span>
          </div>
          {todayRecordings.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma gravação hoje</div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {todayRecordings.map((rec, i) => {
                const clientColor = getClientColor(rec.clientId);
                return (
                  <motion.div key={rec.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 group">
                    <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: `hsl(${clientColor})` }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{getClientName(rec.clientId)}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ backgroundColor: `hsl(${clientColor} / 0.12)`, color: `hsl(${clientColor})` }}>
                          {typeLabels[rec.type]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{getVideomakerName(rec.videomakerId)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display font-bold text-sm">{rec.startTime}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">{statusIcons[rec.status]}<span className="text-[10px] text-muted-foreground capitalize">{rec.status}</span></div>
                    </div>
                    {rec.status === 'agendada' && (
                      <div className="hidden group-hover:flex gap-1 shrink-0">
                        <button onClick={() => updateRecording({ ...rec, status: 'concluida' })} className="w-7 h-7 rounded-md bg-success/15 text-success flex items-center justify-center hover:bg-success/25"><Check size={14} /></button>
                        <button onClick={() => cancelRecording(rec.id)} className="w-7 h-7 rounded-md bg-destructive/15 text-destructive flex items-center justify-center hover:bg-destructive/25"><XCircle size={14} /></button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Videomaker progress - 1 col */}
        <div className="glass-card p-5">
          <h3 className="font-display font-semibold text-sm mb-4">Progresso do Time</h3>
          {videomakerStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Cadastre videomakers</p>
          ) : (
            <div className="space-y-4">
              {videomakerStats.map(({ vm, weekDone, weekTotal, todayDone, todayTotal }) => {
                const activeRec = activeRecordings.find(a => a.videomarkerId === vm.id);
                const activeClientName = activeRec ? getClientName(activeRec.clientId) : null;
                return (
                  <div key={vm.id} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${activeRec ? 'bg-success/20 text-success ring-2 ring-success/40 animate-pulse' : 'bg-primary/15 text-primary'}`}>
                        {vm.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{vm.name}</p>
                        {activeRec ? (
                          <p className="text-[11px] text-success font-medium">● Gravando — {activeClientName}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Hoje: {todayDone}/{todayTotal} · Semana: {weekDone}/{weekTotal}</p>
                        )}
                      </div>
                    </div>
                    <Progress value={weekTotal > 0 ? (weekDone / weekTotal) * 100 : 0} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 3: Week Agenda ── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-sm">Agenda Semanal</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"><ChevronLeft size={14} /></button>
            <span className="text-xs font-medium min-w-[160px] text-center">
              {format(weekDays[0], "d MMM", { locale: ptBR })} — {format(weekDays[6], "d MMM", { locale: ptBR })}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"><ChevronRight size={14} /></button>
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-[11px] text-primary font-medium ml-1">Hoje</button>}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 min-h-[160px]">
          {weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isToday = dateStr === today;
            const dayRecs = getRecsForDay(day);
            return (
              <div key={dateStr} className={`rounded-lg p-2 min-h-[140px] ${isToday ? 'bg-primary/5 ring-1 ring-primary/30' : 'bg-secondary/40'}`}>
                <p className={`text-[11px] font-semibold mb-1.5 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {format(day, 'EEE d', { locale: ptBR })}
                </p>
                <div className="space-y-1">
                  {dayRecs.slice(0, 5).map(rec => {
                    const color = getClientColor(rec.clientId);
                    return (
                      <div key={rec.id} className="rounded px-1.5 py-1 text-[10px] leading-tight" style={{ backgroundColor: `hsl(${color} / 0.1)`, borderLeft: `2px solid hsl(${color})` }}>
                        <p className="font-medium truncate" style={{ color: `hsl(${color})` }}>{getClientName(rec.clientId)}</p>
                        <p className="text-muted-foreground">{rec.startTime}</p>
                      </div>
                    );
                  })}
                  {dayRecs.length > 5 && <p className="text-[10px] text-muted-foreground text-center">+{dayRecs.length - 5}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ROW 4: Client Progress ── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-sm">Progresso por Cliente</h3>
          <button onClick={() => navigate('/metas')} className="text-[11px] text-primary font-semibold hover:underline">VER METAS</button>
        </div>
        {clientProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum cliente cadastrado</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {clientProgress.map(({ client, tasksDone, goal, recsDone, recsTotal, progress }) => (
              <div key={client.id} className="rounded-xl p-4 border border-border bg-secondary/30" style={{ borderLeftWidth: 3, borderLeftColor: `hsl(${client.color || '220 10% 50%'})` }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: `hsl(${client.color || '220 10% 50%'} / 0.15)`, color: `hsl(${client.color || '220 10% 50%'})` }}>
                    {client.companyName.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{client.companyName}</p>
                    <p className="text-[11px] text-muted-foreground">{DAY_LABELS[client.fixedDay]} · {client.fixedTime}</p>
                  </div>
                  <span className="text-lg font-display font-bold" style={{ color: progress >= 80 ? 'hsl(var(--success))' : progress >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))' }}>
                    {progress}%
                  </span>
                </div>
                <Progress value={progress} className="h-1.5 mb-2" />
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <span>Meta: {goal}</span>
                  <span>Feitas: {tasksDone}</span>
                  <span>Gravações: {recsDone}/{recsTotal}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

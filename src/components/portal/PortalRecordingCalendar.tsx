import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, parseISO, isAfter, isBefore, isToday as isDateToday } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, Video,
  ArrowRight, Check, X, Loader2, RefreshCw, Clapperboard, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface Recording {
  id: string;
  client_id: string;
  videomaker_id: string;
  videomaker_name: string;
  date: string;
  start_time: string;
  status: string;
  type: string;
  confirmation_status: string;
}

interface Props {
  clientId: string;
  clientColor: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; glow: string }> = {
  agendado: { label: 'Agendada', color: 'text-sky-300', bg: 'bg-sky-500/20', glow: 'shadow-sky-500/20' },
  gravado: { label: 'Gravada', color: 'text-emerald-300', bg: 'bg-emerald-500/20', glow: 'shadow-emerald-500/20' },
  cancelada: { label: 'Cancelada', color: 'text-red-300', bg: 'bg-red-500/20', glow: 'shadow-red-500/20' },
};

const TYPE_MAP: Record<string, { label: string; emoji: string }> = {
  fixa: { label: 'Fixa', emoji: '📹' },
  backup: { label: 'Backup', emoji: '🔄' },
  extra: { label: 'Extra', emoji: '⭐' },
};

export default function PortalRecordingCalendar({ clientId, clientColor }: Props) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [rescheduleRec, setRescheduleRec] = useState<Recording | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedNewDate, setSelectedNewDate] = useState<string>('');
  const [selectedNewTime, setSelectedNewTime] = useState<string>('');
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [vmName, setVmName] = useState('');
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  useEffect(() => { loadRecordings(); }, [clientId]);

  const loadRecordings = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke('portal-recordings', {
      body: { action: 'list', client_id: clientId },
    });
    if (data?.recordings) setRecordings(data.recordings);
    setLoading(false);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const recordingsByDate = useMemo(() => {
    const map: Record<string, Recording[]> = {};
    recordings.forEach(r => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }, [recordings]);

  const dayRecordings = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, 'yyyy-MM-dd');
    return recordingsByDate[key] || [];
  }, [selectedDay, recordingsByDate]);

  const upcomingRecordings = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return recordings
      .filter(r => r.date >= today && r.status === 'agendado')
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
      .slice(0, 3);
  }, [recordings]);

  const totalThisMonth = useMemo(() => {
    const prefix = format(currentMonth, 'yyyy-MM');
    return recordings.filter(r => r.date.startsWith(prefix)).length;
  }, [recordings, currentMonth]);

  const handleCheckAvailability = async (date: string) => {
    setCheckingAvailability(true);
    setAvailableSlots([]);
    setSelectedNewTime('');
    setSelectedNewDate(date);
    const { data } = await supabase.functions.invoke('portal-recordings', {
      body: { action: 'check_availability', client_id: clientId, new_date: date },
    });
    if (data?.available_slots) {
      setAvailableSlots(data.available_slots);
      setVmName(data.videomaker_name || '');
    } else {
      toast.error(data?.error || 'Erro ao verificar disponibilidade');
    }
    setCheckingAvailability(false);
  };

  const handleReschedule = async () => {
    if (!rescheduleRec || !selectedNewDate || !selectedNewTime) return;
    setRescheduling(true);
    const { data } = await supabase.functions.invoke('portal-recordings', {
      body: { action: 'reschedule', client_id: clientId, recording_id: rescheduleRec.id, new_date: selectedNewDate, new_time: selectedNewTime },
    });
    if (data?.success) {
      toast.success('Gravação reagendada com sucesso!');
      setRescheduleRec(null);
      setSelectedNewDate('');
      setSelectedNewTime('');
      setAvailableSlots([]);
      await loadRecordings();
    } else {
      toast.error(data?.error || 'Erro ao reagendar');
    }
    setRescheduling(false);
  };

  const nextDays = useMemo(() => {
    const days: string[] = [];
    const today = new Date();
    for (let i = 1; i <= 21; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(format(d, 'yyyy-MM-dd'));
    }
    return days;
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}>
          <Clapperboard size={28} className="text-white/30" />
        </motion.div>
        <p className="text-sm text-white/30">Carregando agenda...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <motion.div
            className="p-3 rounded-2xl relative overflow-hidden"
            style={{ background: `hsl(${clientColor} / 0.15)` }}
            whileHover={{ scale: 1.05 }}
          >
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{ background: `hsl(${clientColor} / 0.1)` }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ repeat: Infinity, duration: 3 }}
            />
            <CalendarDays size={22} style={{ color: `hsl(${clientColor})` }} className="relative z-10" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Agenda de Gravações</h2>
            <p className="text-sm text-white/40">Acompanhe e reagende suas sessões</p>
          </div>
        </div>
      </motion.div>

      {/* Upcoming recordings - glass cards */}
      {upcomingRecordings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={14} style={{ color: `hsl(${clientColor})` }} />
            <h3 className="text-xs font-bold text-white/50 uppercase tracking-[0.15em]">Próximas gravações</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {upcomingRecordings.map((rec, i) => {
              const typeInfo = TYPE_MAP[rec.type] || { label: rec.type, emoji: '🎬' };
              return (
                <motion.div
                  key={rec.id}
                  initial={{ opacity: 0, y: 15, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.08 * i, type: 'spring', stiffness: 200 }}
                  whileHover={{ y: -4, scale: 1.02 }}
                  className="relative group rounded-2xl overflow-hidden cursor-pointer"
                >
                  {/* Gradient border */}
                  <div className="absolute inset-0 rounded-2xl p-[1px]"
                    style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.4), hsl(${clientColor} / 0.05))` }}
                  >
                    <div className="w-full h-full rounded-2xl bg-[#0d0d18]" />
                  </div>

                  <div className="relative p-4">
                    {/* Date pill */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{typeInfo.emoji}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{typeInfo.label}</span>
                      </div>
                      <motion.button
                        onClick={() => {
                          setRescheduleRec(rec);
                          setSelectedNewDate('');
                          setSelectedNewTime('');
                          setAvailableSlots([]);
                        }}
                        whileHover={{ rotate: 180 }}
                        transition={{ duration: 0.3 }}
                        className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-white/30 hover:text-white/70"
                        title="Reagendar"
                      >
                        <RefreshCw size={13} />
                      </motion.button>
                    </div>

                    <p className="text-xl font-extrabold capitalize leading-tight">
                      {format(parseISO(rec.date), "dd MMM", { locale: pt })}
                    </p>
                    <p className="text-[11px] text-white/40 capitalize mt-0.5">
                      {format(parseISO(rec.date), "EEEE", { locale: pt })}
                    </p>

                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                      <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: `hsl(${clientColor})` }}>
                        <Clock size={13} />
                        <span>{rec.start_time}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-white/35">
                        <Video size={11} />
                        <span>{rec.videomaker_name}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
        {/* Calendar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        >
          {/* Subtle glow */}
          <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-[0.05] pointer-events-none"
            style={{ background: `hsl(${clientColor})` }}
          />

          {/* Month nav */}
          <div className="flex items-center justify-between mb-6">
            <motion.button
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2.5 rounded-xl hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={18} />
            </motion.button>
            <div className="text-center">
              <h3 className="text-lg font-bold capitalize">
                {format(currentMonth, 'MMMM', { locale: pt })}
              </h3>
              <p className="text-[11px] text-white/30 font-medium">
                {format(currentMonth, 'yyyy')} • {totalThisMonth} gravação{totalThisMonth !== 1 ? 'ões' : ''}
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2.5 rounded-xl hover:bg-white/10 transition-colors"
            >
              <ChevronRight size={18} />
            </motion.button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-white/25 uppercase tracking-wider py-1.5">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}

            {daysInMonth.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const recs = recordingsByDate[dateStr] || [];
              const hasRecording = recs.length > 0;
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isToday = isDateToday(day);
              const isPast = isBefore(day, new Date()) && !isToday;
              const isHovered = hoveredDay === dateStr;
              const firstRec = recs[0];

              return (
                <motion.button
                  key={dateStr}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.008, type: 'spring', stiffness: 300, damping: 25 }}
                  onClick={() => setSelectedDay(day)}
                  onMouseEnter={() => setHoveredDay(dateStr)}
                  onMouseLeave={() => setHoveredDay(null)}
                  whileHover={!isPast ? { scale: 1.08 } : {}}
                  whileTap={!isPast ? { scale: 0.95 } : {}}
                  className={`
                    aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200
                    ${isToday && !isSelected ? 'ring-1 ring-white/20' : ''}
                    ${isPast ? 'text-white/20' : 'text-white/70'}
                    ${hasRecording && !isPast ? 'text-white' : ''}
                  `}
                  style={{
                    background: isSelected
                      ? `hsl(${clientColor} / 0.25)`
                      : hasRecording && !isPast
                        ? `hsl(${clientColor} / 0.08)`
                        : isHovered && !isPast
                          ? 'rgba(255,255,255,0.05)'
                          : 'transparent',
                    boxShadow: isSelected
                      ? `0 0 0 2px hsl(${clientColor}), 0 4px 20px hsl(${clientColor} / 0.2)`
                      : hasRecording && !isPast
                        ? `inset 0 0 0 1px hsl(${clientColor} / 0.2)`
                        : 'none',
                  }}
                >
                  {/* Day number */}
                  <span className={`text-sm leading-none ${isToday ? 'font-extrabold' : hasRecording ? 'font-bold' : 'font-medium'}`}>
                    {format(day, 'd')}
                  </span>

                  {/* Recording time shown directly */}
                  {hasRecording && (
                    <motion.div
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center mt-0.5"
                    >
                      <span
                        className="text-[9px] font-bold leading-none"
                        style={{ color: firstRec.status === 'gravado' ? '#6ee7b7' : `hsl(${clientColor})` }}
                      >
                        {firstRec.start_time}
                      </span>
                      {recs.length > 1 && (
                        <span className="text-[7px] text-white/30 font-bold mt-px">+{recs.length - 1}</span>
                      )}
                    </motion.div>
                  )}

                  {/* Today indicator dot */}
                  {isToday && !hasRecording && (
                    <motion.div
                      className="w-1 h-1 rounded-full bg-white/50 mt-0.5"
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                  )}

                  {/* Hover tooltip with recording info */}
                  <AnimatePresence>
                    {isHovered && hasRecording && !isSelected && (
                      <motion.div
                        initial={{ opacity: 0, y: 5, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.9 }}
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full z-30 pointer-events-none"
                      >
                        <div className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                          <p className="text-[10px] font-bold text-white/80">
                            {firstRec.start_time} — {firstRec.videomaker_name}
                          </p>
                          <p className="text-[9px] text-white/40 mt-0.5">
                            {(STATUS_MAP[firstRec.status] || STATUS_MAP.agendado).label} • {(TYPE_MAP[firstRec.type] || { label: firstRec.type }).label}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-5 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <div className="w-3 h-3 rounded-md" style={{ background: `hsl(${clientColor} / 0.3)`, boxShadow: `inset 0 0 0 1px hsl(${clientColor} / 0.4)` }} />
              Agendada
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <div className="w-3 h-3 rounded-md bg-emerald-500/30" style={{ boxShadow: 'inset 0 0 0 1px rgba(52,211,153,0.4)' }} />
              Gravada
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <div className="w-3 h-3 rounded-md ring-1 ring-white/20" />
              Hoje
            </div>
          </div>
        </motion.div>

        {/* Sidebar: selected day detail */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <AnimatePresence mode="wait">
            {selectedDay ? (
              <motion.div
                key={format(selectedDay, 'yyyy-MM-dd')}
                initial={{ opacity: 0, x: 20, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden"
              >
                {/* Accent stripe */}
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `hsl(${clientColor})` }} />

                <div className="flex items-center gap-3 mb-4 mt-1">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-extrabold"
                    style={{ background: `hsl(${clientColor} / 0.15)`, color: `hsl(${clientColor})` }}
                  >
                    {format(selectedDay, 'd')}
                  </div>
                  <div>
                    <p className="text-sm font-bold capitalize">
                      {format(selectedDay, "EEEE", { locale: pt })}
                    </p>
                    <p className="text-xs text-white/40 capitalize">
                      {format(selectedDay, "MMMM 'de' yyyy", { locale: pt })}
                    </p>
                  </div>
                </div>

                {dayRecordings.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-10"
                  >
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    >
                      <CalendarDays size={36} className="mx-auto text-white/[0.07] mb-3" />
                    </motion.div>
                    <p className="text-sm text-white/25 font-medium">Nenhuma gravação</p>
                    <p className="text-[11px] text-white/15 mt-1">Dia livre 🎉</p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {dayRecordings.map((rec, i) => {
                      const st = STATUS_MAP[rec.status] || STATUS_MAP.agendado;
                      const typeInfo = TYPE_MAP[rec.type] || { label: rec.type, emoji: '🎬' };
                      const canReschedule = rec.status === 'agendado' && isAfter(parseISO(rec.date), new Date());
                      return (
                        <motion.div
                          key={rec.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="rounded-xl overflow-hidden"
                        >
                          {/* Status color bar */}
                          <div className="h-0.5" style={{
                            background: rec.status === 'gravado' ? '#34d399' : rec.status === 'cancelada' ? '#f87171' : `hsl(${clientColor})`
                          }} />

                          <div className="bg-white/[0.04] border border-white/[0.06] border-t-0 rounded-b-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                                  style={{ background: `hsl(${clientColor} / 0.1)` }}
                                >
                                  {typeInfo.emoji}
                                </div>
                                <div>
                                  <p className="text-base font-extrabold tabular-nums" style={{ color: `hsl(${clientColor})` }}>
                                    {rec.start_time}
                                  </p>
                                  <p className="text-[10px] text-white/35 font-medium">{typeInfo.label}</p>
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>
                                {st.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-white/40 bg-white/[0.03] rounded-lg px-3 py-2">
                              <Video size={12} className="shrink-0" />
                              <span className="font-medium">{rec.videomaker_name}</span>
                            </div>

                            {canReschedule && (
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                  setRescheduleRec(rec);
                                  setSelectedNewDate('');
                                  setSelectedNewTime('');
                                  setAvailableSlots([]);
                                }}
                                className="w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                                style={{ background: `hsl(${clientColor} / 0.12)`, color: `hsl(${clientColor})` }}
                              >
                                <RefreshCw size={12} />
                                Reagendar esta gravação
                              </motion.button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 text-center py-16"
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                >
                  <Clapperboard size={36} className="mx-auto text-white/[0.07] mb-4" />
                </motion.div>
                <p className="text-sm text-white/25 font-medium">Selecione um dia</p>
                <p className="text-[11px] text-white/15 mt-1">Toque em um dia para ver detalhes</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Reschedule Modal */}
      <AnimatePresence>
        {rescheduleRec && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setRescheduleRec(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="bg-[#12121e] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto relative"
              onClick={e => e.stopPropagation()}
            >
              {/* Top accent */}
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `hsl(${clientColor})` }} />

              <div className="flex items-center justify-between mb-6 mt-1">
                <div className="flex items-center gap-2.5">
                  <RefreshCw size={18} style={{ color: `hsl(${clientColor})` }} />
                  <h3 className="text-lg font-bold">Reagendar</h3>
                </div>
                <motion.button
                  whileHover={{ rotate: 90 }}
                  onClick={() => setRescheduleRec(null)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </motion.button>
              </div>

              {/* Current info */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-6">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">Gravação atual</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-extrabold"
                    style={{ background: `hsl(${clientColor} / 0.15)`, color: `hsl(${clientColor})` }}
                  >
                    {format(parseISO(rescheduleRec.date), 'dd')}
                  </div>
                  <div>
                    <p className="font-bold capitalize text-sm">
                      {format(parseISO(rescheduleRec.date), "EEEE, dd 'de' MMMM", { locale: pt })}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {rescheduleRec.start_time} • {rescheduleRec.videomaker_name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 1 */}
              <div className="mb-6">
                <p className="text-sm font-bold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ background: `hsl(${clientColor})` }}>1</span>
                  Nova data
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                  {nextDays.map((d, i) => (
                    <motion.button
                      key={d}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.02 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setSelectedNewDate(d);
                        setSelectedNewTime('');
                        handleCheckAvailability(d);
                      }}
                      className={`py-3 px-2 rounded-xl text-xs font-medium transition-all border ${
                        selectedNewDate === d
                          ? 'border-transparent text-white shadow-lg'
                          : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/60'
                      }`}
                      style={selectedNewDate === d ? { background: `hsl(${clientColor})`, boxShadow: `0 4px 15px hsl(${clientColor} / 0.3)` } : {}}
                    >
                      <div className="capitalize font-bold">{format(parseISO(d), 'EEE', { locale: pt })}</div>
                      <div className="text-sm font-extrabold mt-0.5">{format(parseISO(d), 'dd/MM')}</div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Step 2 */}
              {selectedNewDate && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                  <p className="text-sm font-bold mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ background: `hsl(${clientColor})` }}>2</span>
                    Horário {vmName && <span className="font-normal text-white/40">— {vmName}</span>}
                  </p>

                  {checkingAvailability ? (
                    <div className="flex items-center justify-center py-8 gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: `hsl(${clientColor})` }} />
                      <span className="text-sm text-white/40">Verificando...</span>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-center py-8 bg-white/[0.03] rounded-xl">
                      <X size={24} className="mx-auto text-white/15 mb-2" />
                      <p className="text-sm text-white/35">Nenhum horário disponível</p>
                      <p className="text-[11px] text-white/20 mt-1">Tente outra data</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {availableSlots.map((slot, i) => (
                        <motion.button
                          key={slot}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.03 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedNewTime(slot)}
                          className={`py-3 rounded-xl text-sm font-bold transition-all border ${
                            selectedNewTime === slot
                              ? 'border-transparent text-white shadow-lg'
                              : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/60'
                          }`}
                          style={selectedNewTime === slot ? { background: `hsl(${clientColor})`, boxShadow: `0 4px 15px hsl(${clientColor} / 0.3)` } : {}}
                        >
                          {slot}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Confirm */}
              {selectedNewDate && selectedNewTime && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-4 justify-center text-sm">
                      <div className="text-center text-white/40">
                        <p className="text-xs font-medium mb-0.5">De</p>
                        <p className="font-bold">{format(parseISO(rescheduleRec.date), "dd/MM")}</p>
                        <p className="text-xs">{rescheduleRec.start_time}</p>
                      </div>
                      <motion.div animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                        <ArrowRight size={18} className="text-white/20" />
                      </motion.div>
                      <div className="text-center" style={{ color: `hsl(${clientColor})` }}>
                        <p className="text-xs font-medium mb-0.5">Para</p>
                        <p className="font-bold">{format(parseISO(selectedNewDate), "dd/MM")}</p>
                        <p className="text-xs">{selectedNewTime}</p>
                      </div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleReschedule}
                    disabled={rescheduling}
                    className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: `hsl(${clientColor})`, boxShadow: `0 4px 20px hsl(${clientColor} / 0.3)` }}
                  >
                    {rescheduling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check size={16} />
                        Confirmar Reagendamento
                      </>
                    )}
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

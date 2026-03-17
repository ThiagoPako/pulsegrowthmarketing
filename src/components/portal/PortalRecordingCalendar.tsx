import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, parseISO, isAfter, isBefore } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, Video, MapPin,
  ArrowRight, Check, X, Loader2, RefreshCw
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

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  agendado: { label: 'Agendada', color: 'text-sky-400', bg: 'bg-sky-500/15' },
  gravado: { label: 'Gravada', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  cancelada: { label: 'Cancelada', color: 'text-red-400', bg: 'bg-red-500/15' },
};

const TYPE_MAP: Record<string, string> = {
  fixa: 'Fixa', backup: 'Backup', extra: 'Extra',
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

  useEffect(() => {
    loadRecordings();
  }, [clientId]);

  const loadRecordings = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('portal-recordings', {
      body: { action: 'list', client_id: clientId },
    });
    if (data?.recordings) setRecordings(data.recordings);
    setLoading(false);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0=Sun

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

  const handleCheckAvailability = async (date: string) => {
    setCheckingAvailability(true);
    setAvailableSlots([]);
    setSelectedNewTime('');
    setSelectedNewDate(date);

    const { data, error } = await supabase.functions.invoke('portal-recordings', {
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

    const { data, error } = await supabase.functions.invoke('portal-recordings', {
      body: {
        action: 'reschedule',
        client_id: clientId,
        recording_id: rescheduleRec.id,
        new_date: selectedNewDate,
        new_time: selectedNewTime,
      },
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

  // Generate next 14 days for date picker
  const nextDays = useMemo(() => {
    const days: string[] = [];
    const today = new Date();
    for (let i = 1; i <= 21; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      // Skip weekends
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        days.push(format(d, 'yyyy-MM-dd'));
      }
    }
    return days;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl" style={{ background: `hsl(${clientColor} / 0.15)` }}>
            <CalendarDays size={20} style={{ color: `hsl(${clientColor})` }} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Agenda de Gravações</h2>
            <p className="text-sm text-white/40">Acompanhe e reagende suas gravações</p>
          </div>
        </div>
      </motion.div>

      {/* Upcoming recordings cards */}
      {upcomingRecordings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Próximas gravações</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {upcomingRecordings.map((rec, i) => (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 hover:bg-white/[0.06] transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold capitalize">
                      {format(parseISO(rec.date), "dd 'de' MMMM", { locale: pt })}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-white/50 text-sm">
                      <Clock size={13} />
                      <span>{rec.start_time}</span>
                      <span className="text-white/20">•</span>
                      <span>{TYPE_MAP[rec.type] || rec.type}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-white/40 text-xs">
                      <Video size={11} />
                      <span>{rec.videomaker_name}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setRescheduleRec(rec);
                      setSelectedNewDate('');
                      setSelectedNewTime('');
                      setAvailableSlots([]);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-white/10 transition-all text-white/50 hover:text-white"
                    title="Reagendar"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-6">
        {/* Calendar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5"
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <h3 className="text-base font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: pt })}
            </h3>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-white/30 py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for padding */}
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}

            {daysInMonth.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const recs = recordingsByDate[dateStr] || [];
              const hasRecording = recs.length > 0;
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isToday = isSameDay(day, new Date());
              const isPast = isBefore(day, new Date()) && !isToday;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDay(day)}
                  className={`
                    aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all text-sm
                    ${isSelected ? 'ring-2 ring-offset-1 ring-offset-transparent' : ''}
                    ${isToday ? 'font-bold' : ''}
                    ${isPast ? 'text-white/25' : 'text-white/80 hover:bg-white/[0.08]'}
                    ${hasRecording && !isPast ? 'font-semibold' : ''}
                  `}
                  style={isSelected ? { background: `hsl(${clientColor} / 0.2)`, ringColor: `hsl(${clientColor})` } : {}}
                >
                  <span>{format(day, 'd')}</span>
                  {hasRecording && (
                    <div className="flex gap-0.5 mt-0.5">
                      {recs.slice(0, 3).map((r, i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background: r.status === 'gravado' ? '#34d399' : `hsl(${clientColor})`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <div className="w-2 h-2 rounded-full" style={{ background: `hsl(${clientColor})` }} />
              Agendada
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              Gravada
            </div>
          </div>
        </motion.div>

        {/* Sidebar: selected day detail */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <AnimatePresence mode="wait">
            {selectedDay ? (
              <motion.div
                key={format(selectedDay, 'yyyy-MM-dd')}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5"
              >
                <h4 className="text-sm font-semibold text-white/50 mb-1">Gravações em</h4>
                <p className="text-lg font-bold capitalize mb-4">
                  {format(selectedDay, "EEEE, dd 'de' MMMM", { locale: pt })}
                </p>

                {dayRecordings.length === 0 ? (
                  <div className="text-center py-8">
                    <CalendarDays size={32} className="mx-auto text-white/10 mb-2" />
                    <p className="text-sm text-white/30">Nenhuma gravação neste dia</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dayRecordings.map(rec => {
                      const st = STATUS_MAP[rec.status] || STATUS_MAP.agendado;
                      const canReschedule = rec.status === 'agendado' && isAfter(parseISO(rec.date), new Date());
                      return (
                        <div key={rec.id} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-white/40" />
                              <span className="font-semibold">{rec.start_time}</span>
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>
                              {st.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-white/40">
                            <Video size={12} />
                            <span>{rec.videomaker_name}</span>
                            <span className="text-white/15">•</span>
                            <span>{TYPE_MAP[rec.type] || rec.type}</span>
                          </div>
                          {canReschedule && (
                            <button
                              onClick={() => {
                                setRescheduleRec(rec);
                                setSelectedNewDate('');
                                setSelectedNewTime('');
                                setAvailableSlots([]);
                              }}
                              className="w-full mt-1 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90 flex items-center justify-center gap-1.5"
                              style={{ background: `hsl(${clientColor} / 0.15)`, color: `hsl(${clientColor})` }}
                            >
                              <RefreshCw size={12} />
                              Reagendar
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 text-center py-12"
              >
                <CalendarDays size={32} className="mx-auto text-white/10 mb-3" />
                <p className="text-sm text-white/30">Selecione um dia no calendário</p>
                <p className="text-xs text-white/20 mt-1">para ver detalhes da gravação</p>
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
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setRescheduleRec(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#14141f] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Reagendar Gravação</h3>
                <button onClick={() => setRescheduleRec(null)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Current recording info */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-5">
                <p className="text-xs text-white/40 mb-1">Gravação atual</p>
                <p className="font-semibold capitalize">
                  {format(parseISO(rescheduleRec.date), "dd 'de' MMMM, EEEE", { locale: pt })}
                </p>
                <p className="text-sm text-white/50 mt-0.5">
                  {rescheduleRec.start_time} • {rescheduleRec.videomaker_name}
                </p>
              </div>

              {/* Step 1: Choose new date */}
              <div className="mb-5">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: `hsl(${clientColor})` }}>1</span>
                  Escolha a nova data
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {nextDays.map(d => (
                    <button
                      key={d}
                      onClick={() => {
                        setSelectedNewDate(d);
                        setSelectedNewTime('');
                        handleCheckAvailability(d);
                      }}
                      className={`py-2.5 px-2 rounded-xl text-xs font-medium transition-all border ${
                        selectedNewDate === d
                          ? 'border-transparent text-white'
                          : 'border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] text-white/70'
                      }`}
                      style={selectedNewDate === d ? { background: `hsl(${clientColor})` } : {}}
                    >
                      <div className="capitalize">{format(parseISO(d), 'EEE', { locale: pt })}</div>
                      <div className="text-sm font-bold mt-0.5">{format(parseISO(d), 'dd/MM')}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Choose time */}
              {selectedNewDate && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center" style={{ background: `hsl(${clientColor})` }}>2</span>
                    Horários disponíveis {vmName && `— ${vmName}`}
                  </p>

                  {checkingAvailability ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                      <span className="ml-2 text-sm text-white/40">Verificando...</span>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-center py-6 bg-white/[0.03] rounded-xl">
                      <p className="text-sm text-white/40">Nenhum horário disponível nesta data</p>
                      <p className="text-xs text-white/25 mt-1">Tente outra data</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {availableSlots.map(slot => (
                        <button
                          key={slot}
                          onClick={() => setSelectedNewTime(slot)}
                          className={`py-2.5 rounded-xl text-sm font-medium transition-all border ${
                            selectedNewTime === slot
                              ? 'border-transparent text-white'
                              : 'border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] text-white/70'
                          }`}
                          style={selectedNewTime === slot ? { background: `hsl(${clientColor})` } : {}}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Confirm */}
              {selectedNewDate && selectedNewTime && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="text-white/40">
                        <p className="capitalize">{format(parseISO(rescheduleRec.date), "dd/MM", { locale: pt })}</p>
                        <p>{rescheduleRec.start_time}</p>
                      </div>
                      <ArrowRight size={16} className="text-white/30" />
                      <div className="font-semibold" style={{ color: `hsl(${clientColor})` }}>
                        <p className="capitalize">{format(parseISO(selectedNewDate), "dd/MM", { locale: pt })}</p>
                        <p>{selectedNewTime}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleReschedule}
                    disabled={rescheduling}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: `hsl(${clientColor})` }}
                  >
                    {rescheduling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check size={16} />
                        Confirmar Reagendamento
                      </>
                    )}
                  </button>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

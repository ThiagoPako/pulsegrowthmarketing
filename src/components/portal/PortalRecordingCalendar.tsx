import { useState, useEffect, useMemo } from 'react';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { supabase } from '@/lib/vpsDb';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, parseISO, isAfter, isBefore, isToday as isDateToday } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, Video,
  ArrowRight, Check, X, Loader2, RefreshCw, Clapperboard, Sparkles,
  MessageSquarePlus, Send, AlertTriangle, Film, Palette, Image, Scissors, Upload
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

interface ContentEvent {
  id: string;
  title: string;
  content_type: string;
  kanban_column: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  editing_started_at: string | null;
  approved_at: string | null;
}

interface DeliveryEvent {
  id: string;
  title: string;
  content_type: string;
  status: string;
  delivered_at: string;
  posted_at: string | null;
  scheduled_time: string | null;
}

interface DayEvent {
  type: 'recording' | 'content' | 'delivery';
  icon: string;
  label: string;
  color: string;
  time?: string;
  detail?: string;
}

interface Props {
  clientId: string;
  clientColor: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  agendada: { label: 'Agendada', color: 'text-amber-300', bg: 'bg-amber-500/20' },
  agendado: { label: 'Agendada', color: 'text-amber-300', bg: 'bg-amber-500/20' },
  concluida: { label: 'Gravada', color: 'text-emerald-300', bg: 'bg-emerald-500/20' },
  gravado: { label: 'Gravada', color: 'text-emerald-300', bg: 'bg-emerald-500/20' },
  cancelada: { label: 'Cancelada', color: 'text-red-300', bg: 'bg-red-500/20' },
  solicitada: { label: 'Solicitada', color: 'text-violet-300', bg: 'bg-violet-500/20' },
};

const TYPE_MAP: Record<string, { label: string; emoji: string }> = {
  fixa: { label: 'Fixa', emoji: '📹' },
  backup: { label: 'Backup', emoji: '🔄' },
  secundaria: { label: 'Backup', emoji: '🔄' },
  extra: { label: 'Extra', emoji: '⭐' },
};

/* ── Rocket + Fire particles ── */
function RocketFireIndicator({ small = false }: { small?: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute z-10"
        style={{ top: small ? '-6px' : '-8px', right: small ? '-2px' : '-4px' }}
        animate={{ y: [0, -3, 0], rotate: [0, 5, -5, 0] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      >
        <span className={small ? 'text-[11px]' : 'text-[14px]'}>🚀</span>
      </motion.div>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute z-0"
          style={{ bottom: small ? '-4px' : '-6px', left: `${20 + i * 25}%` }}
          animate={{ opacity: [0, 0.9, 0.6, 0], y: [0, -8, -16, -24], scale: [0.4, 0.8, 0.6, 0.2] }}
          transition={{ repeat: Infinity, duration: 1.2 + i * 0.3, delay: i * 0.25, ease: 'easeOut' }}
        >
          <span className={small ? 'text-[8px]' : 'text-[10px]'}>🔥</span>
        </motion.div>
      ))}
    </div>
  );
}

function FireBorder({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-2xl pointer-events-none z-0"
      animate={{ opacity: [0.4, 0.8, 0.4] }}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      style={{ boxShadow: `0 0 15px hsl(${color} / 0.3), 0 0 30px hsl(25 100% 50% / 0.15)` }}
    />
  );
}

interface AlternativeVideomaker {
  id: string;
  name: string;
  date: string;
  available_slots: string[];
  total_free: number;
}

type CancelFlow = null | { step: 'confirming'; rec: Recording } | { step: 'result'; rec: Recording; backupAvailable: boolean; backupSlot: { date: string; time: string } | null; nextFixedDate: string | null; alternativeVideomakers: AlternativeVideomaker[] };

export default function PortalRecordingCalendar({ clientId, clientColor }: Props) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [rescheduleRec, setRescheduleRec] = useState<Recording | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedNewDate, setSelectedNewDate] = useState('');
  const [selectedNewTime, setSelectedNewTime] = useState('');
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [vmName, setVmName] = useState('');
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [cancelFlow, setCancelFlow] = useState<CancelFlow>(null);
  const [cancelling, setCancelling] = useState(false);
  const [acceptingBackup, setAcceptingBackup] = useState(false);
  // Alternative videomaker selection
  const [selectedAltVm, setSelectedAltVm] = useState<AlternativeVideomaker | null>(null);
  const [selectedAltTime, setSelectedAltTime] = useState('');
  // Special request
  const [showSpecialRequest, setShowSpecialRequest] = useState(false);
  const [specialDate, setSpecialDate] = useState('');
  const [specialTime, setSpecialTime] = useState('');
  const [specialComment, setSpecialComment] = useState('');
  const [sendingSpecial, setSendingSpecial] = useState(false);
  // Explore videomaker slots
  const [showExploreSlots, setShowExploreSlots] = useState(false);
  const [exploreSlotsDate, setExploreSlotsDate] = useState('');
  const [exploreSlotsData, setExploreSlotsData] = useState<string[]>([]);
  const [exploringSlots, setExploringSlots] = useState(false);
  const [exploreVmName, setExploreVmName] = useState('');
  // Additional data for activity calendar
  const [contentTasks, setContentTasks] = useState<ContentEvent[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryEvent[]>([]);

  useEffect(() => { loadAllData(); }, [clientId]);

  const loadAllData = async () => {
    setLoading(true);
    // Fetch recordings, content tasks, and deliveries in parallel
    const [recResult, ctResult, delResult] = await Promise.all([
      invokeVpsFunction('portal-recordings', { body: { action: 'list', client_id: clientId } }),
      supabase.from('content_tasks').select('id,title,content_type,kanban_column,scheduled_recording_date,scheduled_recording_time,editing_started_at,approved_at').eq('client_id', clientId),
      supabase.from('social_media_deliveries').select('id,title,content_type,status,delivered_at,posted_at,scheduled_time').eq('client_id', clientId),
    ]);
    if (recResult.data?.recordings) setRecordings(recResult.data.recordings);
    if (ctResult.data) setContentTasks(ctResult.data.map((ct: any) => ({
      id: ct.id, title: ct.title, content_type: ct.content_type,
      kanban_column: ct.kanban_column, scheduled_date: ct.scheduled_recording_date,
      scheduled_time: ct.scheduled_recording_time, editing_started_at: ct.editing_started_at,
      approved_at: ct.approved_at,
    })));
    if (delResult.data) setDeliveries(delResult.data.map((d: any) => ({
      id: d.id, title: d.title, content_type: d.content_type,
      status: d.status, delivered_at: d.delivered_at,
      posted_at: d.posted_at, scheduled_time: d.scheduled_time,
    })));
    setLoading(false);
  };

  const loadRecordings = async () => {
    const { data } = await invokeVpsFunction('portal-recordings', { body: { action: 'list', client_id: clientId } });
    if (data?.recordings) setRecordings(data.recordings);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const recordingsByDate = useMemo(() => {
    const map: Record<string, Recording[]> = {};
    recordings.forEach(r => { if (!map[r.date]) map[r.date] = []; map[r.date].push(r); });
    return map;
  }, [recordings]);

  // Build unified events map by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, DayEvent[]> = {};
    const addEvent = (date: string, event: DayEvent) => {
      if (!date) return;
      const key = date.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    };

    // Recording events
    recordings.forEach(r => {
      if (r.status === 'cancelada') {
        addEvent(r.date, { type: 'recording', icon: '❌', label: 'Cancelada', color: 'text-red-400', time: r.start_time, detail: `Gravação cancelada` });
      } else if (r.status === 'concluida' || r.status === 'gravado') {
        addEvent(r.date, { type: 'recording', icon: '🎬', label: 'Gravado', color: 'text-emerald-400', time: r.start_time, detail: `Gravação realizada` });
      } else if (r.status === 'agendada' || r.status === 'agendado') {
        const typeInfo = TYPE_MAP[r.type] || { label: r.type, emoji: '📹' };
        if (r.type === 'extra') {
          addEvent(r.date, { type: 'recording', icon: '⭐', label: 'Extra', color: 'text-yellow-400', time: r.start_time, detail: `Conteúdo extra agendado` });
        } else if (r.type === 'backup' || r.type === 'secundaria') {
          addEvent(r.date, { type: 'recording', icon: '🔄', label: 'Remarcada', color: 'text-blue-400', time: r.start_time, detail: `Gravação remarcada` });
        } else {
          addEvent(r.date, { type: 'recording', icon: '📹', label: 'Agendada', color: 'text-amber-400', time: r.start_time, detail: `Gravação ${typeInfo.label}` });
        }
      } else if (r.status === 'solicitada') {
        addEvent(r.date, { type: 'recording', icon: '📨', label: 'Solicitada', color: 'text-violet-400', time: r.start_time, detail: `Solicitação especial` });
      }
    });

    // Content task events (editing, scheduled)
    contentTasks.forEach(ct => {
      if (ct.kanban_column === 'edicao' && ct.editing_started_at) {
        const date = ct.editing_started_at.substring(0, 10);
        addEvent(date, { type: 'content', icon: '✂️', label: 'Em edição', color: 'text-blue-400', detail: ct.title });
      }
      if (ct.kanban_column === 'revisao') {
        const date = ct.scheduled_date || (ct.editing_started_at?.substring(0, 10) || '');
        if (date) addEvent(date, { type: 'content', icon: '👁', label: 'Em revisão', color: 'text-cyan-400', detail: ct.title });
      }
      if (ct.approved_at) {
        const date = ct.approved_at.substring(0, 10);
        addEvent(date, { type: 'content', icon: '✅', label: 'Aprovado', color: 'text-emerald-400', detail: ct.title });
      }
    });

    // Delivery events (posted)
    deliveries.forEach(d => {
      if (d.posted_at) {
        const date = d.posted_at.substring(0, 10);
        addEvent(date, { type: 'delivery', icon: '📱', label: 'Postado', color: 'text-pink-400', detail: d.title });
      } else if (d.status === 'agendado' && d.scheduled_time) {
        const date = d.delivered_at.substring(0, 10);
        addEvent(date, { type: 'delivery', icon: '📅', label: 'Agendado p/ postar', color: 'text-indigo-400', time: d.scheduled_time, detail: d.title });
      }
    });

    return map;
  }, [recordings, contentTasks, deliveries]);

  const dayRecordings = useMemo(() => {
    if (!selectedDay) return [];
    return recordingsByDate[format(selectedDay, 'yyyy-MM-dd')] || [];
  }, [selectedDay, recordingsByDate]);

  const upcomingRecordings = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return recordings
      .filter(r => r.date >= today && (r.status === 'agendada' || r.status === 'agendado'))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
      .slice(0, 3);
  }, [recordings]);

  const totalThisMonth = useMemo(() => {
    const prefix = format(currentMonth, 'yyyy-MM');
    return recordings.filter(r => r.date.startsWith(prefix)).length;
  }, [recordings, currentMonth]);

  const nextDays = useMemo(() => {
    const days: string[] = [];
    const today = new Date();
    for (let i = 1; i <= 21; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(format(d, 'yyyy-MM-dd'));
    }
    return days;
  }, []);

  /* ── Actions ── */
  const handleConfirm = async (rec: Recording) => {
    const { data } = await invokeVpsFunction('portal-recordings', { body: { action: 'confirm', client_id: clientId, recording_id: rec.id } });
    if (data?.success) { toast.success('✅ Gravação confirmada!'); await loadRecordings(); }
    else toast.error('Erro ao confirmar');
  };

  const handleCancel = async (rec: Recording) => {
    setCancelling(true);
    const { data } = await invokeVpsFunction('portal-recordings', { body: { action: 'cancel', client_id: clientId, recording_id: rec.id } });
    if (data?.success) {
      setCancelFlow({ step: 'result', rec, backupAvailable: data.backup_available, backupSlot: data.backup_slot, nextFixedDate: data.next_fixed_date, alternativeVideomakers: data.alternative_videomakers || [] });
      await loadRecordings();
    } else toast.error('Erro ao cancelar');
    setCancelling(false);
  };

  const handleAcceptBackup = async (altVmId?: string, altDate?: string, altTime?: string) => {
    const useAlt = !!altVmId;
    const date = useAlt ? altDate! : cancelFlow && cancelFlow.step === 'result' ? cancelFlow.backupSlot?.date : undefined;
    const time = useAlt ? altTime! : cancelFlow && cancelFlow.step === 'result' ? cancelFlow.backupSlot?.time : undefined;
    if (!date || !time) return;
    setAcceptingBackup(true);
    const body: any = { action: 'accept_backup', client_id: clientId, backup_date: date, backup_time: time };
    if (altVmId) body.videomaker_id = altVmId;
    const { data } = await invokeVpsFunction('portal-recordings', { body });
    if (data?.success) { toast.success('🚀 Gravação remarcada com sucesso!'); setCancelFlow(null); setSelectedAltVm(null); setSelectedAltTime(''); await loadRecordings(); }
    else toast.error(data?.error || 'Erro ao remarcar');
    setAcceptingBackup(false);
  };

  const handleCheckAvailability = async (date: string) => {
    setCheckingAvailability(true); setAvailableSlots([]); setSelectedNewTime(''); setSelectedNewDate(date);
    const { data } = await invokeVpsFunction('portal-recordings', { body: { action: 'check_availability', client_id: clientId, new_date: date } });
    if (data?.available_slots) { setAvailableSlots(data.available_slots); setVmName(data.videomaker_name || ''); }
    else toast.error(data?.error || 'Erro ao verificar');
    setCheckingAvailability(false);
  };

  const handleExploreSlots = async (date: string) => {
    setExploringSlots(true); setExploreSlotsDate(date); setExploreSlotsData([]);
    const { data } = await invokeVpsFunction('portal-recordings', { body: { action: 'check_availability', client_id: clientId, new_date: date } });
    if (data?.available_slots) { setExploreSlotsData(data.available_slots); setExploreVmName(data.videomaker_name || ''); }
    setExploringSlots(false);
  };

  const handleReschedule = async () => {
    if (!rescheduleRec || !selectedNewDate || !selectedNewTime) return;
    setRescheduling(true);
    const { data } = await invokeVpsFunction('portal-recordings', { body: { action: 'reschedule', client_id: clientId, recording_id: rescheduleRec.id, new_date: selectedNewDate, new_time: selectedNewTime } });
    if (data?.success) { toast.success('🚀 Gravação reagendada!'); setRescheduleRec(null); await loadRecordings(); }
    else toast.error(data?.error || 'Erro ao reagendar');
    setRescheduling(false);
  };

  const handleSendSpecialRequest = async () => {
    if (!specialDate || !specialComment.trim()) { toast.error('Preencha data e comentário'); return; }
    setSendingSpecial(true);
    const { data } = await invokeVpsFunction('portal-recordings', { body: { action: 'request_special', client_id: clientId, requested_date: specialDate, requested_time: specialTime || null, comment: specialComment } });
    if (data?.success) { toast.success('📹 Solicitação enviada! A equipe vai confirmar em breve.'); setShowSpecialRequest(false); setSpecialDate(''); setSpecialTime(''); setSpecialComment(''); await loadRecordings(); }
    else toast.error(data?.error || 'Erro ao enviar');
    setSendingSpecial(false);
  };

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

  const isScheduled = (s: string) => s === 'agendada' || s === 'agendado';

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div className="p-3 rounded-2xl relative overflow-hidden" style={{ background: `hsl(${clientColor} / 0.15)` }} whileHover={{ scale: 1.05 }}>
              <CalendarDays size={22} style={{ color: `hsl(${clientColor})` }} className="relative z-10" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                Agenda de Gravações
                <motion.span animate={{ y: [0, -4, 0], rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2.5 }}>🚀</motion.span>
              </h2>
              <p className="text-sm text-white/40">Confirme, cancele ou solicite gravações especiais</p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setShowSpecialRequest(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.2), hsl(280 80% 60% / 0.15))`, border: `1px solid hsl(${clientColor} / 0.3)`, color: `hsl(${clientColor})` }}
          >
            <MessageSquarePlus size={14} />
            Solicitar gravação especial
          </motion.button>
        </div>
      </motion.div>

      {/* Upcoming recordings with fire effects */}
      {upcomingRecordings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>🔥</motion.span>
            <h3 className="text-xs font-bold text-white/50 uppercase tracking-[0.15em]">Próximas gravações</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {upcomingRecordings.map((rec, i) => {
              const typeInfo = TYPE_MAP[rec.type] || { label: rec.type, emoji: '🎬' };
              const isConfirmed = rec.confirmation_status === 'confirmada';
              return (
                <motion.div
                  key={rec.id}
                  initial={{ opacity: 0, y: 15, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.08 * i, type: 'spring', stiffness: 200 }}
                  className="relative group rounded-2xl overflow-hidden"
                >
                  <FireBorder color={clientColor} />
                  <div className="absolute inset-0 rounded-2xl p-[1px] z-[1]"
                    style={{ background: `linear-gradient(135deg, hsl(25 100% 50% / 0.5), hsl(${clientColor} / 0.4), hsl(25 100% 50% / 0.3))` }}>
                    <div className="w-full h-full rounded-2xl bg-[#0d0d18]" />
                  </div>
                  <div className="relative p-4 z-[2]">
                    <RocketFireIndicator />
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{typeInfo.emoji}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{typeInfo.label}</span>
                      </div>
                      {isConfirmed && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">✓ Confirmada</span>
                      )}
                    </div>
                    <p className="text-xl font-extrabold capitalize leading-tight">{format(parseISO(rec.date), "dd MMM", { locale: pt })}</p>
                    <p className="text-[11px] text-white/40 capitalize mt-0.5">{format(parseISO(rec.date), "EEEE", { locale: pt })}</p>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                      <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: `hsl(${clientColor})` }}>
                        <Clock size={13} />
                        <span className="tabular-nums">{rec.start_time}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-white/35">
                        <Video size={11} />
                        <span>{rec.videomaker_name}</span>
                      </div>
                    </div>
                    {/* Confirm / Cancel buttons */}
                    {!isConfirmed && (
                      <div className="flex gap-2 mt-3">
                        <motion.button whileTap={{ scale: 0.95 }}
                          onClick={() => handleConfirm(rec)}
                          className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all"
                        >
                          <Check size={12} /> Confirmar
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.95 }}
                          onClick={() => setCancelFlow({ step: 'confirming', rec })}
                          className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-red-500/10 text-red-300 border border-red-500/15 hover:bg-red-500/20 transition-all"
                        >
                          <X size={12} /> Cancelar
                        </motion.button>
                      </div>
                    )}
                    {isConfirmed && (
                      <div className="flex gap-2 mt-3">
                        <motion.button whileTap={{ scale: 0.95 }}
                          onClick={() => { setRescheduleRec(rec); setSelectedNewDate(''); setSelectedNewTime(''); setAvailableSlots([]); }}
                          className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 transition-all"
                        >
                          <RefreshCw size={10} /> Reagendar
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.95 }}
                          onClick={() => setCancelFlow({ step: 'confirming', rec })}
                          className="py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 bg-red-500/10 text-red-300 border border-red-500/15 hover:bg-red-500/20 transition-all"
                        >
                          <X size={10} />
                        </motion.button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Mobile special request button */}
      <motion.button
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowSpecialRequest(true)}
        className="sm:hidden w-full mb-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all"
        style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.2), hsl(280 80% 60% / 0.15))`, border: `1px solid hsl(${clientColor} / 0.3)`, color: `hsl(${clientColor})` }}
      >
        <MessageSquarePlus size={14} /> Solicitar gravação especial
      </motion.button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
        {/* Calendar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 sm:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2.5 rounded-xl hover:bg-white/10 transition-colors">
              <ChevronLeft size={18} />
            </motion.button>
            <div className="text-center">
              <h3 className="text-lg font-bold capitalize">{format(currentMonth, 'MMMM', { locale: pt })}</h3>
              <p className="text-[11px] text-white/30 font-medium">{format(currentMonth, 'yyyy')} • {totalThisMonth} gravações</p>
            </div>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2.5 rounded-xl hover:bg-white/10 transition-colors">
              <ChevronRight size={18} />
            </motion.button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-white/25 uppercase tracking-wider py-1.5">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
            {daysInMonth.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const recs = recordingsByDate[dateStr] || [];
              const hasRecording = recs.length > 0;
              const hasUpcoming = recs.some(r => isScheduled(r.status));
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isToday = isDateToday(day);
              const isPast = isBefore(day, new Date()) && !isToday;
              const isHovered = hoveredDay === dateStr;
              const firstRec = recs[0];

              return (
                <motion.button
                  key={dateStr}
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.008, type: 'spring', stiffness: 300, damping: 25 }}
                  onClick={() => setSelectedDay(day)}
                  onMouseEnter={() => setHoveredDay(dateStr)}
                  onMouseLeave={() => setHoveredDay(null)}
                  whileHover={!isPast ? { scale: 1.08 } : {}}
                  whileTap={!isPast ? { scale: 0.95 } : {}}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200
                    ${isToday && !isSelected ? 'ring-1 ring-white/20' : ''}
                    ${isPast ? 'text-white/20' : 'text-white/70'}
                    ${hasRecording && !isPast ? 'text-white' : ''}`}
                  style={{
                    background: isSelected ? `hsl(${clientColor} / 0.25)`
                      : hasRecording && !isPast ? hasUpcoming ? `linear-gradient(135deg, hsl(25 100% 50% / 0.12), hsl(${clientColor} / 0.12))` : `hsl(${clientColor} / 0.08)`
                      : isHovered && !isPast ? 'rgba(255,255,255,0.05)' : 'transparent',
                    boxShadow: isSelected ? `0 0 0 2px hsl(${clientColor}), 0 4px 20px hsl(${clientColor} / 0.2)`
                      : hasRecording && !isPast && hasUpcoming ? `inset 0 0 0 1px hsl(25 100% 50% / 0.3), 0 0 12px hsl(25 100% 50% / 0.1)`
                      : hasRecording && !isPast ? `inset 0 0 0 1px hsl(${clientColor} / 0.2)` : 'none',
                  }}
                >
                  {hasRecording && !isPast && hasUpcoming && <RocketFireIndicator small />}
                  <span className={`text-sm leading-none relative z-10 ${isToday ? 'font-extrabold' : hasRecording ? 'font-bold' : 'font-medium'}`}>
                    {format(day, 'd')}
                  </span>
                  {hasRecording && (
                    <motion.div initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center mt-0.5 relative z-10">
                      <span className="text-[9px] font-bold leading-none tabular-nums"
                        style={{ color: recs.some(r => r.status === 'concluida' || r.status === 'gravado') ? '#6ee7b7' : isScheduled(firstRec.status) ? '#fb923c' : `hsl(${clientColor})` }}>
                        {firstRec.start_time}
                      </span>
                      {recs.length > 1 && <span className="text-[7px] text-white/30 font-bold mt-px">+{recs.length - 1}</span>}
                    </motion.div>
                  )}
                  {isToday && !hasRecording && (
                    <motion.div className="w-1 h-1 rounded-full bg-white/50 mt-0.5" animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 2 }} />
                  )}
                  {/* Hover tooltip */}
                  <AnimatePresence>
                    {isHovered && hasRecording && !isSelected && (
                      <motion.div initial={{ opacity: 0, y: 5, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.9 }}
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full z-30 pointer-events-none">
                        <div className="bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                          <p className="text-[10px] font-bold text-white/80 flex items-center gap-1">🚀 {firstRec.start_time} — {firstRec.videomaker_name}</p>
                          <p className="text-[9px] text-white/40 mt-0.5">{(STATUS_MAP[firstRec.status] || STATUS_MAP.agendada).label} • {(TYPE_MAP[firstRec.type] || { label: firstRec.type }).label}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-5 mt-5 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <div className="w-3 h-3 rounded-md relative overflow-hidden" style={{ background: `linear-gradient(135deg, hsl(25 100% 50% / 0.4), hsl(${clientColor} / 0.3))` }}>
                <span className="absolute -top-0.5 -right-0.5 text-[6px]">🚀</span>
              </div>
              Agendada
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <div className="w-3 h-3 rounded-md bg-emerald-500/30" /> Gravada
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <div className="w-3 h-3 rounded-md ring-1 ring-white/20" /> Hoje
            </div>
          </div>
        </motion.div>

        {/* Sidebar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <AnimatePresence mode="wait">
            {selectedDay ? (
              <motion.div key={format(selectedDay, 'yyyy-MM-dd')}
                initial={{ opacity: 0, x: 20, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -20, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `hsl(${clientColor})` }} />
                <div className="flex items-center gap-3 mb-4 mt-1">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-extrabold relative"
                    style={{ background: `hsl(${clientColor} / 0.15)`, color: `hsl(${clientColor})` }}>
                    {format(selectedDay, 'd')}
                    {dayRecordings.some(r => isScheduled(r.status)) && (
                      <motion.span className="absolute -top-1 -right-1 text-[10px]" animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>🚀</motion.span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold capitalize">{format(selectedDay, "EEEE", { locale: pt })}</p>
                    <p className="text-xs text-white/40 capitalize">{format(selectedDay, "MMMM 'de' yyyy", { locale: pt })}</p>
                  </div>
                </div>

                {dayRecordings.length === 0 ? (
                  <div className="text-center py-10">
                    <CalendarDays size={36} className="mx-auto text-white/[0.07] mb-3" />
                    <p className="text-sm text-white/25 font-medium">Nenhuma gravação</p>
                    <p className="text-[11px] text-white/15 mt-1">Dia livre 🎉</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dayRecordings.map((rec, i) => {
                      const st = STATUS_MAP[rec.status] || STATUS_MAP.agendada;
                      const typeInfo = TYPE_MAP[rec.type] || { label: rec.type, emoji: '🎬' };
                      const canAct = isScheduled(rec.status) && isAfter(parseISO(rec.date), new Date());
                      const isConfirmed = rec.confirmation_status === 'confirmada';
                      return (
                        <motion.div key={rec.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-xl overflow-hidden relative">
                          <div className="h-0.5 relative z-[1]" style={{
                            background: rec.status === 'concluida' || rec.status === 'gravado' ? '#34d399' : rec.status === 'cancelada' ? '#f87171' : `linear-gradient(90deg, hsl(25 100% 50%), hsl(${clientColor}))`
                          }} />
                          <div className="bg-white/[0.04] border border-white/[0.06] border-t-0 rounded-b-xl p-4 space-y-3 relative z-[1]">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg relative" style={{ background: `hsl(${clientColor} / 0.1)` }}>
                                  {canAct ? <motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }}>🚀</motion.span> : typeInfo.emoji}
                                </div>
                                <div>
                                  <p className="text-base font-extrabold tabular-nums" style={{ color: `hsl(${clientColor})` }}>{rec.start_time}</p>
                                  <p className="text-[10px] text-white/35 font-medium">{typeInfo.label}</p>
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-white/40 bg-white/[0.03] rounded-lg px-3 py-2">
                              <Video size={12} className="shrink-0" />
                              <span className="font-medium">{rec.videomaker_name}</span>
                              {isConfirmed && <span className="ml-auto text-[9px] text-emerald-400 font-bold">✓ Confirmada</span>}
                            </div>
                            {canAct && (
                              <div className="flex gap-2">
                                {!isConfirmed && (
                                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleConfirm(rec)}
                                    className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all">
                                    <Check size={12} /> Confirmar
                                  </motion.button>
                                )}
                                <motion.button whileTap={{ scale: 0.95 }}
                                  onClick={() => setCancelFlow({ step: 'confirming', rec })}
                                  className={`${isConfirmed ? 'flex-1' : ''} py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-red-500/10 text-red-300 border border-red-500/15 hover:bg-red-500/20 transition-all`}>
                                  <X size={12} /> Cancelar
                                </motion.button>
                                <motion.button whileTap={{ scale: 0.95 }}
                                  onClick={() => { setRescheduleRec(rec); setSelectedNewDate(''); setSelectedNewTime(''); setAvailableSlots([]); }}
                                  className="py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 transition-all">
                                  <RefreshCw size={10} />
                                </motion.button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 text-center py-16">
                <Clapperboard size={36} className="mx-auto text-white/[0.07] mb-4" />
                <p className="text-sm text-white/25 font-medium">Selecione um dia</p>
                <p className="text-[11px] text-white/15 mt-1">Toque em um dia para ver detalhes</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── Cancel Flow Modal ── */}
      <AnimatePresence>
        {cancelFlow && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setCancelFlow(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#12121e] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md relative" onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-red-500 to-orange-500" />
              <motion.button whileHover={{ rotate: 90 }} onClick={() => setCancelFlow(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10">
                <X size={16} />
              </motion.button>

              {cancelFlow.step === 'confirming' && (
                <div className="mt-2">
                  <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle size={20} className="text-red-400" />
                    <h3 className="text-lg font-bold">Cancelar gravação?</h3>
                  </div>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-6">
                    <p className="text-sm font-bold capitalize">{format(parseISO(cancelFlow.rec.date), "EEEE, dd 'de' MMMM", { locale: pt })}</p>
                    <p className="text-xs text-white/40 mt-1">🕐 {cancelFlow.rec.start_time} • 🎬 {cancelFlow.rec.videomaker_name}</p>
                  </div>
                  <p className="text-sm text-white/50 mb-6">Ao cancelar, verificaremos se há vaga disponível no seu dia de backup.</p>
                  <div className="flex gap-3">
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => setCancelFlow(null)}
                      className="flex-1 py-3 rounded-xl text-sm font-bold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all">
                      Manter
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleCancel(cancelFlow.rec)} disabled={cancelling}
                      className="flex-1 py-3 rounded-xl text-sm font-bold bg-red-500/20 text-red-300 border border-red-500/20 hover:bg-red-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                      {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <><X size={14} /> Cancelar</>}
                    </motion.button>
                  </div>
                </div>
              )}

              {cancelFlow.step === 'result' && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-4">
                    <Check size={20} className="text-amber-400" />
                    <h3 className="text-lg font-bold">Gravação cancelada</h3>
                  </div>

                  {cancelFlow.backupAvailable && cancelFlow.backupSlot ? (
                    <div className="space-y-4">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                        <p className="text-sm font-bold text-emerald-300 flex items-center gap-2 mb-2">🎉 Vaga disponível no seu backup!</p>
                        <p className="text-xs text-white/50">
                          <strong className="text-white/70">{format(parseISO(cancelFlow.backupSlot.date), "EEEE, dd/MM", { locale: pt })}</strong> às <strong className="text-white/70">{cancelFlow.backupSlot.time}</strong>
                        </p>
                      </div>
                      <div className="flex gap-3">
                         <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleAcceptBackup()} disabled={acceptingBackup}
                          className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          style={{ background: `linear-gradient(135deg, hsl(25 100% 50%), hsl(${clientColor}))` }}>
                          {acceptingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check size={14} /> Aceitar backup</>}
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setCancelFlow(null)}
                          className="py-3 px-4 rounded-xl text-sm font-bold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all text-white/50 flex items-center gap-2">
                          <CalendarDays size={13} /> Deixar para a próxima
                        </motion.button>
                      </div>
                      <p className="text-[11px] text-white/30 text-center">Ao recusar, sua gravação fica para a próxima data fixa.</p>
                    </div>
                   ) : (
                    <div className="space-y-4">
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                        <p className="text-sm text-amber-300 font-medium">Seu videomaker não tem vaga no dia de backup.</p>
                      </div>

                      {/* Alternative videomakers */}
                      {cancelFlow.alternativeVideomakers.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs text-white/50 font-medium">🎬 Outros videomakers disponíveis no dia <strong className="text-white/70">{format(parseISO(cancelFlow.alternativeVideomakers[0].date), "dd/MM (EEEE)", { locale: pt })}</strong>:</p>
                          {cancelFlow.alternativeVideomakers.map(vm => (
                            <div key={vm.id} className={`rounded-xl border p-3 transition-all cursor-pointer ${selectedAltVm?.id === vm.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'}`}
                              onClick={() => { setSelectedAltVm(vm); setSelectedAltTime(''); }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-white/80 flex items-center gap-2">
                                  <Video size={13} style={{ color: `hsl(${clientColor})` }} />
                                  {vm.name}
                                </span>
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">{vm.total_free} horário{vm.total_free > 1 ? 's' : ''}</span>
                              </div>
                              {selectedAltVm?.id === vm.id && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                                  <p className="text-[11px] text-white/40 mb-2">Escolha o horário:</p>
                                  <div className="grid grid-cols-3 gap-1.5">
                                    {vm.available_slots.map(slot => (
                                      <motion.button key={slot} whileTap={{ scale: 0.95 }}
                                        onClick={(e) => { e.stopPropagation(); setSelectedAltTime(slot); }}
                                        className={`py-2 rounded-lg text-xs font-bold transition-all ${selectedAltTime === slot ? 'text-white' : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.1] border border-white/[0.06]'}`}
                                        style={selectedAltTime === slot ? { background: `hsl(${clientColor})` } : {}}>
                                        {slot}
                                      </motion.button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          ))}
                          {selectedAltVm && selectedAltTime && (
                            <motion.button initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleAcceptBackup(selectedAltVm.id, selectedAltVm.date, selectedAltTime)}
                              disabled={acceptingBackup}
                              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              style={{ background: `linear-gradient(135deg, hsl(25 100% 50%), hsl(${clientColor}))` }}>
                              {acceptingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check size={14} /> Gravar com {selectedAltVm.name} às {selectedAltTime}</>}
                            </motion.button>
                          )}
                        </div>
                      )}

                      {/* Option to wait for next recording */}
                      <div className="border-t border-white/[0.06] pt-4">
                        <p className="text-xs text-white/40 mb-2">Ou prefira aguardar:</p>
                        {cancelFlow.nextFixedDate && (
                          <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 mb-3">
                            <p className="text-xs text-white/50">
                              Sua próxima gravação fixa será em <strong className="text-white/70 capitalize">{format(parseISO(cancelFlow.nextFixedDate), "EEEE, dd/MM", { locale: pt })}</strong>.
                            </p>
                          </div>
                        )}
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setCancelFlow(null); setSelectedAltVm(null); setSelectedAltTime(''); }}
                          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all text-white/50">
                          <CalendarDays size={14} /> Deixar para a próxima gravação
                        </motion.button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Explore Videomaker Slots Modal ── */}
      <AnimatePresence>
        {showExploreSlots && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowExploreSlots(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#12121e] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `hsl(${clientColor})` }} />
              <div className="flex items-center justify-between mb-5 mt-1">
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} style={{ color: `hsl(${clientColor})` }} />
                  <h3 className="text-lg font-bold">Horários disponíveis</h3>
                </div>
                <motion.button whileHover={{ rotate: 90 }} onClick={() => setShowExploreSlots(false)} className="p-2 rounded-full hover:bg-white/10">
                  <X size={16} />
                </motion.button>
              </div>
              <p className="text-xs text-white/40 mb-4">Escolha uma data para ver horários vagos do videomaker:</p>
              <div className="grid grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
                {nextDays.map((d, i) => (
                  <motion.button key={d} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => handleExploreSlots(d)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-medium transition-all border ${exploreSlotsDate === d ? 'border-transparent text-white' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/60'}`}
                    style={exploreSlotsDate === d ? { background: `hsl(${clientColor})` } : {}}>
                    <div className="capitalize font-bold">{format(parseISO(d), 'EEE', { locale: pt })}</div>
                    <div className="text-sm font-extrabold mt-0.5">{format(parseISO(d), 'dd/MM')}</div>
                  </motion.button>
                ))}
              </div>
              {exploringSlots && (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: `hsl(${clientColor})` }} />
                  <span className="text-sm text-white/40">Verificando...</span>
                </div>
              )}
              {exploreSlotsDate && !exploringSlots && (
                <div>
                  {exploreVmName && <p className="text-xs text-white/40 mb-2">🎬 {exploreVmName}</p>}
                  {exploreSlotsData.length === 0 ? (
                    <div className="text-center py-6 bg-white/[0.03] rounded-xl">
                      <p className="text-sm text-white/30">Sem horários vagos neste dia</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {exploreSlotsData.map(slot => (
                        <motion.button key={slot} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => { setShowExploreSlots(false); setShowSpecialRequest(true); setSpecialDate(exploreSlotsDate); setSpecialTime(slot); }}
                          className="py-3 rounded-xl text-sm font-bold border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/70 hover:text-white transition-all">
                          {slot}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reschedule Modal ── */}
      <AnimatePresence>
        {rescheduleRec && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setRescheduleRec(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#12121e] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `linear-gradient(90deg, hsl(25 100% 50%), hsl(${clientColor}))` }} />
              <div className="flex items-center justify-between mb-6 mt-1">
                <div className="flex items-center gap-2.5">
                  <motion.span animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2 }}>🚀</motion.span>
                  <h3 className="text-lg font-bold">Reagendar Gravação</h3>
                </div>
                <motion.button whileHover={{ rotate: 90 }} onClick={() => setRescheduleRec(null)} className="p-2 rounded-full hover:bg-white/10"><X size={16} /></motion.button>
              </div>

              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-6">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">Gravação atual</p>
                <p className="font-bold capitalize text-sm">{format(parseISO(rescheduleRec.date), "EEEE, dd 'de' MMMM", { locale: pt })}</p>
                <p className="text-xs text-white/40 mt-0.5">🕐 {rescheduleRec.start_time} • 🎬 {rescheduleRec.videomaker_name}</p>
              </div>

              <div className="mb-6">
                <p className="text-sm font-bold mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ background: `hsl(${clientColor})` }}>1</span>
                  Nova data
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                  {nextDays.map((d, i) => (
                    <motion.button key={d} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => { setSelectedNewDate(d); setSelectedNewTime(''); handleCheckAvailability(d); }}
                      className={`py-3 px-2 rounded-xl text-xs font-medium transition-all border ${selectedNewDate === d ? 'border-transparent text-white shadow-lg' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/60'}`}
                      style={selectedNewDate === d ? { background: `hsl(${clientColor})`, boxShadow: `0 4px 15px hsl(${clientColor} / 0.3)` } : {}}>
                      <div className="capitalize font-bold">{format(parseISO(d), 'EEE', { locale: pt })}</div>
                      <div className="text-sm font-extrabold mt-0.5">{format(parseISO(d), 'dd/MM')}</div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {selectedNewDate && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                  <p className="text-sm font-bold mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ background: `hsl(${clientColor})` }}>2</span>
                    Horário {vmName && <span className="font-normal text-white/40">— 🎬 {vmName}</span>}
                  </p>
                  {checkingAvailability ? (
                    <div className="flex items-center justify-center py-8 gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: `hsl(${clientColor})` }} />
                      <span className="text-sm text-white/40">Verificando...</span>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="text-center py-8 bg-white/[0.03] rounded-xl">
                      <p className="text-sm text-white/35">Nenhum horário disponível</p>
                      <p className="text-[11px] text-white/20 mt-1">Tente outra data</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {availableSlots.map((slot, i) => (
                        <motion.button key={slot} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
                          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedNewTime(slot)}
                          className={`py-3 rounded-xl text-sm font-bold transition-all border ${selectedNewTime === slot ? 'border-transparent text-white shadow-lg' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/60'}`}
                          style={selectedNewTime === slot ? { background: `hsl(${clientColor})`, boxShadow: `0 4px 15px hsl(${clientColor} / 0.3)` } : {}}>
                          {slot}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

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
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleReschedule} disabled={rescheduling}
                    className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: `linear-gradient(135deg, hsl(25 100% 50%), hsl(${clientColor}))`, boxShadow: `0 4px 20px hsl(${clientColor} / 0.3)` }}>
                    {rescheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <>🚀 Confirmar Reagendamento 🔥</>}
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Special Request Modal ── */}
      <AnimatePresence>
        {showSpecialRequest && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowSpecialRequest(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#12121e] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md relative" onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `linear-gradient(90deg, hsl(${clientColor}), hsl(280 80% 60%))` }} />
              <div className="flex items-center justify-between mb-5 mt-1">
                <div className="flex items-center gap-2.5">
                  <Sparkles size={18} style={{ color: `hsl(${clientColor})` }} />
                  <h3 className="text-lg font-bold">Solicitar gravação especial</h3>
                </div>
                <motion.button whileHover={{ rotate: 90 }} onClick={() => setShowSpecialRequest(false)} className="p-2 rounded-full hover:bg-white/10">
                  <X size={16} />
                </motion.button>
              </div>

              <p className="text-xs text-white/40 mb-5">Quer gravar algo especial? Um evento, café da manhã, inauguração... Envie sua solicitação e a equipe vai confirmar!</p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1.5 block">Data desejada</label>
                  <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                    {nextDays.slice(0, 15).map(d => (
                      <motion.button key={d} whileTap={{ scale: 0.95 }}
                        onClick={() => setSpecialDate(d)}
                        className={`py-2 px-2 rounded-xl text-xs font-medium transition-all border ${specialDate === d ? 'border-transparent text-white' : 'border-white/[0.06] bg-white/[0.03] text-white/60'}`}
                        style={specialDate === d ? { background: `hsl(${clientColor})` } : {}}>
                        <div className="capitalize font-bold">{format(parseISO(d), 'EEE', { locale: pt })}</div>
                        <div className="font-extrabold mt-0.5">{format(parseISO(d), 'dd/MM')}</div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-white/50 mb-1.5 block">Horário preferido (opcional)</label>
                  <input type="time" value={specialTime} onChange={e => setSpecialTime(e.target.value)}
                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-white/20" />
                </div>

                <div>
                  <label className="text-xs font-bold text-white/50 mb-1.5 block">O que você deseja gravar? *</label>
                  <textarea value={specialComment} onChange={e => setSpecialComment(e.target.value)} rows={3}
                    placeholder="Ex: Dia 25 vai ter um café da manhã na loja, gostaria de solicitar a equipe para gravar..."
                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none" />
                </div>

                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleSendSpecialRequest} disabled={sendingSpecial || !specialDate || !specialComment.trim()}
                  className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(135deg, hsl(${clientColor}), hsl(280 80% 60%))`, boxShadow: `0 4px 20px hsl(${clientColor} / 0.3)` }}>
                  {sendingSpecial ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send size={14} /> Enviar solicitação</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

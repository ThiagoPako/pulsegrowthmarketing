import { useState, useEffect, useMemo, useCallback } from 'react';
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import { portalAction } from '@/lib/portalApi';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, parseISO, isAfter, isBefore, isToday as isDateToday, addDays } from 'date-fns';
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
  editing_deadline: string | null;
  approval_sent_at: string | null;
  approved_at: string | null;
  adjustment_notes: string | null;
  recording_id: string | null;
  script_id: string | null;
  drive_link: string | null;
  updated_at: string;
  created_at: string;
}

interface DeliveryEvent {
  id: string;
  title: string;
  content_type: string;
  status: string;
  delivered_at: string;
  posted_at: string | null;
  scheduled_time: string | null;
  platform: string | null;
}

interface TaskHistoryEntry {
  id: string;
  task_id: string;
  action: string;
  details: string | null;
  created_at: string;
}

interface DayEvent {
  type: 'recording' | 'content' | 'delivery' | 'deadline' | 'history';
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  time?: string;
  detail?: string;
  animationType?: 'pulse' | 'bounce' | 'glow' | 'shake' | 'spin' | 'wave' | 'none';
  contentTitle?: string;
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

// Event type visual config
const EVENT_STYLES: Record<string, { icon: string; label: string; color: string; bgColor: string; borderColor: string; animationType: DayEvent['animationType'] }> = {
  agendada:       { icon: '📹', label: 'Gravação agendada',     color: 'text-amber-400',   bgColor: 'bg-amber-500/15',   borderColor: 'border-amber-500/30',   animationType: 'bounce' },
  gravada:        { icon: '🎬', label: 'Gravação realizada',    color: 'text-emerald-400',  bgColor: 'bg-emerald-500/15',  borderColor: 'border-emerald-500/30',  animationType: 'glow' },
  cancelada:      { icon: '❌', label: 'Gravação cancelada',    color: 'text-red-400',      bgColor: 'bg-red-500/15',      borderColor: 'border-red-500/30',      animationType: 'shake' },
  remarcada:      { icon: '🔄', label: 'Gravação remarcada',    color: 'text-blue-400',     bgColor: 'bg-blue-500/15',     borderColor: 'border-blue-500/30',     animationType: 'spin' },
  extra:          { icon: '⭐', label: 'Conteúdo extra',        color: 'text-yellow-400',   bgColor: 'bg-yellow-500/15',   borderColor: 'border-yellow-500/30',   animationType: 'bounce' },
  solicitada:     { icon: '📨', label: 'Solicitação especial',  color: 'text-violet-400',   bgColor: 'bg-violet-500/15',   borderColor: 'border-violet-500/30',   animationType: 'pulse' },
  material_sent:  { icon: '📤', label: 'Material enviado p/ edição', color: 'text-sky-400', bgColor: 'bg-sky-500/15',     borderColor: 'border-sky-500/30',      animationType: 'wave' },
  editing:        { icon: '✂️', label: 'Edição iniciada',       color: 'text-blue-300',     bgColor: 'bg-blue-400/15',     borderColor: 'border-blue-400/30',     animationType: 'pulse' },
  deadline:       { icon: '⏰', label: 'Prazo de entrega',      color: 'text-orange-400',   bgColor: 'bg-orange-500/15',   borderColor: 'border-orange-500/30',   animationType: 'shake' },
  review:         { icon: '👁', label: 'Enviado p/ revisão',    color: 'text-cyan-400',     bgColor: 'bg-cyan-500/15',     borderColor: 'border-cyan-500/30',     animationType: 'glow' },
  approval_sent:  { icon: '📩', label: 'Enviado p/ aprovação',  color: 'text-purple-400',   bgColor: 'bg-purple-500/15',   borderColor: 'border-purple-500/30',   animationType: 'bounce' },
  approved:       { icon: '✅', label: 'Aprovado pelo cliente', color: 'text-emerald-300',  bgColor: 'bg-emerald-400/15',  borderColor: 'border-emerald-400/30',  animationType: 'glow' },
  adjustment:     { icon: '🔧', label: 'Ajuste solicitado',     color: 'text-orange-300',   bgColor: 'bg-orange-400/15',   borderColor: 'border-orange-400/30',   animationType: 'shake' },
  completed:      { icon: '🏁', label: 'Concluído',             color: 'text-emerald-200',  bgColor: 'bg-emerald-300/15',  borderColor: 'border-emerald-300/30',  animationType: 'glow' },
  delivered:      { icon: '📦', label: 'Entregue ao cliente',   color: 'text-amber-300',    bgColor: 'bg-amber-400/15',    borderColor: 'border-amber-400/30',    animationType: 'bounce' },
  posted:         { icon: '📱', label: 'Postado',               color: 'text-pink-400',     bgColor: 'bg-pink-500/15',     borderColor: 'border-pink-500/30',     animationType: 'wave' },
  scheduled_post: { icon: '📅', label: 'Agendado p/ postagem',  color: 'text-indigo-400',   bgColor: 'bg-indigo-500/15',   borderColor: 'border-indigo-500/30',   animationType: 'pulse' },
  in_review:      { icon: '🔍', label: 'Em revisão interna',    color: 'text-teal-400',     bgColor: 'bg-teal-500/15',     borderColor: 'border-teal-500/30',     animationType: 'pulse' },
};

/** Calculate business days deadline: 48h = 2 business days (Mon-Fri).
 *  Result NEVER falls on Saturday or Sunday. */
function addBusinessHoursDate(fromDateStr: string, hours: number): string {
  const HOURS_PER_DAY = 24;
  let daysToAdd = Math.ceil(hours / HOURS_PER_DAY);
  let current = parseISO(fromDateStr.substring(0, 10));

  while (daysToAdd > 0) {
    current = addDays(current, 1);
    const dow = getDay(current);
    if (dow !== 0 && dow !== 6) {
      daysToAdd--;
    }
  }
  return format(current, 'yyyy-MM-dd');
}

/* ── Animated event indicator for calendar cells ── */
function EventIndicator({ event, small = false }: { event: DayEvent; small?: boolean }) {
  const size = small ? 'text-sm' : 'text-base';
  
  const animProps = (() => {
    switch (event.animationType) {
      case 'pulse': return { animate: { scale: [1, 1.35, 1], opacity: [0.8, 1, 0.8] }, transition: { repeat: Infinity, duration: 2 } };
      case 'bounce': return { animate: { y: [0, -3, 0] }, transition: { repeat: Infinity, duration: 1.2 } };
      case 'glow': return { animate: { opacity: [0.6, 1, 0.6], scale: [0.95, 1.1, 0.95] }, transition: { repeat: Infinity, duration: 2.5 } };
      case 'shake': return { animate: { x: [-2, 2, -2, 0] }, transition: { repeat: Infinity, duration: 1.5 } };
      case 'spin': return { animate: { rotate: [0, 360] }, transition: { repeat: Infinity, duration: 3, ease: 'linear' as const } };
      case 'wave': return { animate: { y: [0, -2, 0, 2, 0], rotate: [0, 5, 0, -5, 0] }, transition: { repeat: Infinity, duration: 2 } };
      default: return {};
    }
  })();

  return (
    <motion.span className={`${size} leading-none inline-block drop-shadow-lg`} {...animProps}>
      {event.icon}
    </motion.span>
  );
}

/* ── Rocket + Fire particles ── */
function RocketFireIndicator({ small = false }: { small?: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div className="absolute z-10" style={{ top: small ? '-6px' : '-8px', right: small ? '-2px' : '-4px' }}
        animate={{ y: [0, -3, 0], rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}>
        <span className={small ? 'text-[11px]' : 'text-[14px]'}>🚀</span>
      </motion.div>
      {[0, 1, 2].map(i => (
        <motion.div key={i} className="absolute z-0" style={{ bottom: small ? '-4px' : '-6px', left: `${20 + i * 25}%` }}
          animate={{ opacity: [0, 0.9, 0.6, 0], y: [0, -8, -16, -24], scale: [0.4, 0.8, 0.6, 0.2] }}
          transition={{ repeat: Infinity, duration: 1.2 + i * 0.3, delay: i * 0.25, ease: 'easeOut' }}>
          <span className={small ? 'text-[8px]' : 'text-[10px]'}>🔥</span>
        </motion.div>
      ))}
    </div>
  );
}

function FireBorder({ color }: { color: string }) {
  return (
    <motion.div className="absolute inset-0 rounded-2xl pointer-events-none z-0"
      animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      style={{ boxShadow: `0 0 15px hsl(${color} / 0.3), 0 0 30px hsl(25 100% 50% / 0.15)` }} />
  );
}

interface AlternativeVideomaker {
  id: string; name: string; date: string; available_slots: string[]; total_free: number;
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
  const [selectedAltVm, setSelectedAltVm] = useState<AlternativeVideomaker | null>(null);
  const [selectedAltTime, setSelectedAltTime] = useState('');
  const [showSpecialRequest, setShowSpecialRequest] = useState(false);
  const [specialDate, setSpecialDate] = useState('');
  const [specialTime, setSpecialTime] = useState('');
  const [specialComment, setSpecialComment] = useState('');
  const [sendingSpecial, setSendingSpecial] = useState(false);
  const [specialStep, setSpecialStep] = useState<'date' | 'checking' | 'availability' | 'outside_hours' | 'comment'>('date');
  const [specialAvailability, setSpecialAvailability] = useState<any>(null);
  const [selectedSpecialVm, setSelectedSpecialVm] = useState<string>('');
  const [selectedSpecialSlot, setSelectedSpecialSlot] = useState('');
  const [showExploreSlots, setShowExploreSlots] = useState(false);
  const [exploreSlotsDate, setExploreSlotsDate] = useState('');
  const [exploreSlotsData, setExploreSlotsData] = useState<string[]>([]);
  const [exploringSlots, setExploringSlots] = useState(false);
  const [exploreVmName, setExploreVmName] = useState('');
  const [contentTasks, setContentTasks] = useState<ContentEvent[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryEvent[]>([]);
  const [taskHistory, setTaskHistory] = useState<TaskHistoryEntry[]>([]);

  useEffect(() => { loadAllData(); }, [clientId]);

  const loadAllData = async () => {
    setLoading(true);
    const [recResult, ctResult, delResult] = await Promise.all([
      invokeVpsFunction('portal-recordings', { body: { action: 'list', client_id: clientId } }),
      portalAction({ action: 'get_content_tasks', client_id: clientId }),
      portalAction({ action: 'get_deliveries', client_id: clientId }),
    ]);
    if (recResult.data?.recordings) setRecordings(recResult.data.recordings);
    
    const tasks: ContentEvent[] = [];
    if (ctResult?.tasks) {
      ctResult.tasks.forEach((ct: any) => {
        tasks.push({
          id: ct.id, title: ct.title, content_type: ct.content_type,
          kanban_column: ct.kanban_column, scheduled_date: ct.scheduled_recording_date,
          scheduled_time: ct.scheduled_recording_time, editing_started_at: ct.editing_started_at,
          editing_deadline: ct.editing_deadline, approval_sent_at: ct.approval_sent_at,
          approved_at: ct.approved_at, adjustment_notes: ct.adjustment_notes,
          recording_id: ct.recording_id, script_id: ct.script_id, drive_link: ct.drive_link,
          updated_at: ct.updated_at, created_at: ct.created_at,
        });
      });
      setContentTasks(tasks);
      if (ctResult.history) setTaskHistory(ctResult.history);
    }
    
    if (delResult?.deliveries) setDeliveries(delResult.deliveries.map((d: any) => ({
      id: d.id, title: d.title, content_type: d.content_type,
      status: d.status, delivered_at: d.delivered_at,
      posted_at: d.posted_at, scheduled_time: d.scheduled_time, platform: d.platform,
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

  // Build unified events map
  const eventsByDate = useMemo(() => {
    const map: Record<string, DayEvent[]> = {};
    const addEvent = (date: string, event: DayEvent) => {
      if (!date) return;
      const key = date.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    };

    const makeEvt = (styleKey: string, opts: Partial<DayEvent> = {}): DayEvent => {
      const s = EVENT_STYLES[styleKey] || EVENT_STYLES.agendada;
      return { type: 'recording', icon: s.icon, label: s.label, color: s.color, bgColor: s.bgColor, borderColor: s.borderColor, animationType: s.animationType, ...opts };
    };

    // Recording events
    recordings.forEach(r => {
      if (r.status === 'cancelada') {
        addEvent(r.date, makeEvt('cancelada', { time: r.start_time, detail: `Gravação cancelada` }));
      } else if (r.status === 'concluida' || r.status === 'gravado') {
        addEvent(r.date, makeEvt('gravada', { time: r.start_time, detail: `Gravação realizada às ${r.start_time}` }));
      } else if (r.status === 'agendada' || r.status === 'agendado') {
        if (r.type === 'extra') {
          addEvent(r.date, makeEvt('extra', { time: r.start_time, detail: `Gravação extra agendada` }));
        } else if (r.type === 'backup' || r.type === 'secundaria') {
          addEvent(r.date, makeEvt('remarcada', { time: r.start_time, detail: `Gravação remarcada` }));
        } else {
          addEvent(r.date, makeEvt('agendada', { time: r.start_time, detail: `Gravação fixa às ${r.start_time}` }));
        }
      } else if (r.status === 'solicitada') {
        addEvent(r.date, makeEvt('solicitada', { time: r.start_time, detail: `Solicitação especial pendente` }));
      }
    });

    // Content task full lifecycle
    contentTasks.forEach(ct => {
      // When recording was completed, material was sent for editing
      if (ct.recording_id && ct.drive_link) {
        const rec = recordings.find(r => r.id === ct.recording_id && (r.status === 'concluida' || r.status === 'gravado'));
        if (rec) {
          addEvent(rec.date, makeEvt('material_sent', { type: 'content', detail: `"${ct.title}" — material enviado p/ edição`, contentTitle: ct.title }));
        }
      }

      // Editing started
      if (ct.editing_started_at) {
        addEvent(ct.editing_started_at.substring(0, 10), makeEvt('editing', { type: 'content', detail: `"${ct.title}" — edição iniciada`, contentTitle: ct.title }));
      }

      // Editing deadline (predicted delivery)
      if (ct.editing_deadline) {
        const dlDate = ct.editing_deadline.substring(0, 10);
        addEvent(dlDate, makeEvt('deadline', { type: 'deadline', detail: `"${ct.title}" — prazo máximo de entrega`, contentTitle: ct.title }));
      } else if (ct.recording_id && !ct.editing_deadline) {
        // If no explicit deadline but recording exists and is done, calculate 48 biz hours
        const rec = recordings.find(r => r.id === ct.recording_id && (r.status === 'concluida' || r.status === 'gravado'));
        if (rec) {
          const predictedDate = addBusinessHoursDate(rec.date, 48);
          addEvent(predictedDate, makeEvt('deadline', { type: 'deadline', detail: `"${ct.title}" — previsão de entrega (48h úteis)`, contentTitle: ct.title }));
        }
      }

      // Sent for review (internal)
      if (ct.kanban_column === 'revisao' && !ct.approval_sent_at) {
        addEvent(ct.updated_at.substring(0, 10), makeEvt('in_review', { type: 'content', detail: `"${ct.title}" — em revisão interna`, contentTitle: ct.title }));
      }

      // Sent for client approval
      if (ct.approval_sent_at) {
        addEvent(ct.approval_sent_at.substring(0, 10), makeEvt('approval_sent', { type: 'content', detail: `"${ct.title}" — enviado p/ sua aprovação`, contentTitle: ct.title }));
      }

      // Approved
      if (ct.approved_at) {
        addEvent(ct.approved_at.substring(0, 10), makeEvt('approved', { type: 'content', detail: `"${ct.title}" — aprovado ✅`, contentTitle: ct.title }));
      }

      // Adjustment requested
      if (ct.adjustment_notes && ct.kanban_column === 'alteracao') {
        addEvent(ct.updated_at.substring(0, 10), makeEvt('adjustment', { type: 'content', detail: `"${ct.title}" — ajuste: ${ct.adjustment_notes.substring(0, 50)}`, contentTitle: ct.title }));
      }

      // Completed
      if (ct.kanban_column === 'concluido') {
        addEvent(ct.updated_at.substring(0, 10), makeEvt('completed', { type: 'content', detail: `"${ct.title}" — conteúdo finalizado`, contentTitle: ct.title }));
      }
    });

    // Delivery events
    deliveries.forEach(d => {
      if (d.status === 'entregue' && d.delivered_at) {
        addEvent(d.delivered_at.substring(0, 10), makeEvt('delivered', { type: 'delivery', detail: `"${d.title}" — entregue`, contentTitle: d.title }));
      }
      if (d.posted_at) {
        const plat = d.platform ? ` no ${d.platform}` : '';
        addEvent(d.posted_at.substring(0, 10), makeEvt('posted', { type: 'delivery', detail: `"${d.title}" — postado${plat}`, contentTitle: d.title }));
      } else if (d.status === 'agendado' && d.scheduled_time) {
        addEvent(d.delivered_at?.substring(0, 10) || '', makeEvt('scheduled_post', { type: 'delivery', time: d.scheduled_time, detail: `"${d.title}" — agendado p/ postagem`, contentTitle: d.title }));
      }
      if (d.status === 'revisao' && d.delivered_at) {
        addEvent(d.delivered_at.substring(0, 10), makeEvt('in_review', { type: 'delivery', detail: `"${d.title}" — em revisão`, contentTitle: d.title }));
      }
    });

    return map;
  }, [recordings, contentTasks, deliveries]);

  // Day detail data
  const dayRecordings = useMemo(() => {
    if (!selectedDay) return [];
    return recordingsByDate[format(selectedDay, 'yyyy-MM-dd')] || [];
  }, [selectedDay, recordingsByDate]);

  const upcomingRecordings = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return recordings.filter(r => r.date >= today && (r.status === 'agendada' || r.status === 'agendado'))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)).slice(0, 3);
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
    const { data, error } = await invokeVpsFunction('portal-recordings', { body: { action: 'confirm', client_id: clientId, recording_id: rec.id } });
    if (data?.success) {
      toast.success('✅ Gravação confirmada!');
      await loadRecordings();
      return;
    }
    toast.error(error?.message || data?.error || 'Erro ao confirmar');
  };

  const handleCancel = async (rec: Recording) => {
    setCancelling(true);
    const { data, error } = await invokeVpsFunction('portal-recordings', { body: { action: 'cancel', client_id: clientId, recording_id: rec.id } });
    if (data?.success) {
      setCancelFlow({ step: 'result', rec, backupAvailable: data.backup_available, backupSlot: data.backup_slot, nextFixedDate: data.next_fixed_date, alternativeVideomakers: data.alternative_videomakers || [] });
      await loadRecordings();
    } else {
      toast.error(error?.message || data?.error || 'Erro ao cancelar');
    }
    setCancelling(false);
  };

  const handleAcceptBackup = async (altVmId?: string, altDate?: string, altTime?: string) => {
    const date = altVmId ? altDate! : cancelFlow?.step === 'result' ? cancelFlow.backupSlot?.date : undefined;
    const time = altVmId ? altTime! : cancelFlow?.step === 'result' ? cancelFlow.backupSlot?.time : undefined;
    if (!date || !time) return;
    setAcceptingBackup(true);
    const body: any = { action: 'accept_backup', client_id: clientId, backup_date: date, backup_time: time };
    if (altVmId) body.videomaker_id = altVmId;
    const { data, error } = await invokeVpsFunction('portal-recordings', { body });
    if (data?.success) {
      toast.success('🚀 Gravação remarcada!');
      setCancelFlow(null);
      setSelectedAltVm(null);
      setSelectedAltTime('');
      await loadRecordings();
    } else {
      toast.error(error?.message || data?.error || 'Erro ao remarcar');
    }
    setAcceptingBackup(false);
  };

  const handleCheckAvailability = async (date: string) => {
    setCheckingAvailability(true);
    setAvailableSlots([]);
    setSelectedNewTime('');
    setSelectedNewDate(date);
    const { data, error } = await invokeVpsFunction('portal-recordings', { body: { action: 'check_availability', client_id: clientId, new_date: date } });
    if (data?.available_slots) {
      setAvailableSlots(data.available_slots);
      setVmName(data.videomaker_name || '');
    } else {
      toast.error(error?.message || data?.error || 'Erro ao verificar');
    }
    setCheckingAvailability(false);
  };

  const handleExploreSlots = async (date: string) => {
    setExploringSlots(true);
    setExploreSlotsDate(date);
    setExploreSlotsData([]);
    const { data, error } = await invokeVpsFunction('portal-recordings', { body: { action: 'check_availability', client_id: clientId, new_date: date } });
    if (data?.available_slots) {
      setExploreSlotsData(data.available_slots);
      setExploreVmName(data.videomaker_name || '');
    } else {
      toast.error(error?.message || data?.error || 'Erro ao verificar horários');
    }
    setExploringSlots(false);
  };

  const handleReschedule = async () => {
    if (!rescheduleRec || !selectedNewDate || !selectedNewTime) return;
    setRescheduling(true);
    const { data, error } = await invokeVpsFunction('portal-recordings', { body: { action: 'reschedule', client_id: clientId, recording_id: rescheduleRec.id, new_date: selectedNewDate, new_time: selectedNewTime } });
    if (data?.success) {
      toast.success('🚀 Gravação reagendada!');
      setRescheduleRec(null);
      await loadRecordings();
    } else {
      toast.error(error?.message || data?.error || 'Erro ao reagendar');
    }
    setRescheduling(false);
  };

  const handleSendSpecialRequest = async () => {
    if (!specialDate || !specialComment.trim()) {
      toast.error('Preencha data e comentário');
      return;
    }
    setSendingSpecial(true);
    const { data, error } = await invokeVpsFunction('portal-recordings', { body: { action: 'request_special', client_id: clientId, requested_date: specialDate, requested_time: specialTime || null, comment: specialComment } });
    if (data?.success) {
      toast.success('📹 Solicitação enviada!');
      setShowSpecialRequest(false);
      setSpecialDate('');
      setSpecialTime('');
      setSpecialComment('');
      await loadRecordings();
    } else {
      toast.error(error?.message || data?.error || 'Erro ao enviar');
    }
    setSendingSpecial(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}>
          <Clapperboard size={28} className="text-white/30" />
        </motion.div>
        <p className="text-sm text-white/30">Carregando calendário...</p>
      </div>
    );
  }

  const isScheduled = (s: string) => s === 'agendada' || s === 'agendado';

  // Get dominant color for a day cell
  const getDayStyle = (dateStr: string) => {
    const evts = eventsByDate[dateStr] || [];
    if (evts.length === 0) return {};
    // Priority: cancelled > deadline > upcoming recording > content
    const hasCancelled = evts.some(e => e.icon === '❌');
    const hasDeadline = evts.some(e => e.icon === '⏰');
    const hasUpcoming = evts.some(e => e.icon === '📹');
    const hasRecorded = evts.some(e => e.icon === '🎬');
    const hasApproved = evts.some(e => e.icon === '✅');
    const hasPosted = evts.some(e => e.icon === '📱');
    
    if (hasCancelled) return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' };
    if (hasDeadline) return { bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' };
    if (hasUpcoming) return { bg: `linear-gradient(135deg, hsl(25 100% 50% / 0.12), hsl(${clientColor} / 0.12))`, border: `hsl(25 100% 50% / 0.3)` };
    if (hasRecorded) return { bg: `hsl(${clientColor} / 0.1)`, border: `hsl(${clientColor} / 0.25)` };
    if (hasApproved) return { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' };
    if (hasPosted) return { bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.2)' };
    return { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)' };
  };

  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-8 py-4 sm:py-8 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-4 sm:mb-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <motion.div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl relative overflow-hidden shrink-0" style={{ background: `hsl(${clientColor} / 0.15)` }} whileHover={{ scale: 1.05 }}>
              <CalendarDays size={18} style={{ color: `hsl(${clientColor})` }} className="relative z-10 sm:w-[22px] sm:h-[22px]" />
            </motion.div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                Meu Calendário
                <motion.span animate={{ y: [0, -4, 0], rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2.5 }} className="text-sm sm:text-base">🚀</motion.span>
              </h2>
              <p className="text-[10px] sm:text-sm text-white/40 truncate">Acompanhe em tempo real sua operação</p>
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setShowSpecialRequest(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0"
            style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.2), hsl(280 80% 60% / 0.15))`, border: `1px solid hsl(${clientColor} / 0.3)`, color: `hsl(${clientColor})` }}>
            <MessageSquarePlus size={14} /> Solicitar gravação especial
          </motion.button>
        </div>
      </motion.div>

      {/* Upcoming recordings */}
      {upcomingRecordings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-4 sm:mb-8">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>🔥</motion.span>
            <h3 className="text-[10px] sm:text-xs font-bold text-white/50 uppercase tracking-[0.15em]">Próximas gravações</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none' }}>
            {upcomingRecordings.map((rec, i) => {
              const typeInfo = TYPE_MAP[rec.type] || { label: rec.type, emoji: '🎬' };
              const isConfirmed = rec.confirmation_status === 'confirmada';
              return (
                <motion.div key={rec.id} initial={{ opacity: 0, y: 15, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.08 * i, type: 'spring', stiffness: 200 }} className="relative group rounded-2xl overflow-hidden min-w-[260px] sm:min-w-0 snap-center">
                  <FireBorder color={clientColor} />
                  <div className="absolute inset-0 rounded-2xl p-[1px] z-[1]" style={{ background: `linear-gradient(135deg, hsl(25 100% 50% / 0.5), hsl(${clientColor} / 0.4), hsl(25 100% 50% / 0.3))` }}>
                    <div className="w-full h-full rounded-2xl bg-[#0d0d18]" />
                  </div>
                  <div className="relative p-4 z-[2]">
                    <RocketFireIndicator />
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{typeInfo.emoji}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{typeInfo.label}</span>
                      </div>
                      {isConfirmed && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">✓ Confirmada</span>}
                    </div>
                    <p className="text-xl font-extrabold capitalize leading-tight">{format(parseISO(rec.date), "dd MMM", { locale: pt })}</p>
                    <p className="text-[11px] text-white/40 capitalize mt-0.5">{format(parseISO(rec.date), "EEEE", { locale: pt })}</p>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                      <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: `hsl(${clientColor})` }}>
                        <Clock size={13} /><span className="tabular-nums">{rec.start_time}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-white/35">
                        <Video size={11} /><span>{rec.videomaker_name}</span>
                      </div>
                    </div>
                    {!isConfirmed ? (
                      <div className="flex gap-2 mt-3">
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleConfirm(rec)}
                          className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all">
                          <Check size={12} /> Confirmar
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setCancelFlow({ step: 'confirming', rec })}
                          className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-red-500/10 text-red-300 border border-red-500/15 hover:bg-red-500/20 transition-all">
                          <X size={12} /> Cancelar
                        </motion.button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-3">
                        <motion.button whileTap={{ scale: 0.95 }}
                          onClick={() => { setRescheduleRec(rec); setSelectedNewDate(''); setSelectedNewTime(''); setAvailableSlots([]); }}
                          className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/80 transition-all">
                          <RefreshCw size={10} /> Reagendar
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setCancelFlow({ step: 'confirming', rec })}
                          className="py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 bg-red-500/10 text-red-300 border border-red-500/15 hover:bg-red-500/20 transition-all">
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

      {/* Mobile special request */}
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileTap={{ scale: 0.95 }} onClick={() => setShowSpecialRequest(true)}
        className="sm:hidden w-full mb-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all"
        style={{ background: `linear-gradient(135deg, hsl(${clientColor} / 0.2), hsl(280 80% 60% / 0.15))`, border: `1px solid hsl(${clientColor} / 0.3)`, color: `hsl(${clientColor})` }}>
        <MessageSquarePlus size={14} /> Solicitar gravação especial
      </motion.button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-4 sm:gap-6">
        {/* Calendar Grid */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 sm:p-6 relative overflow-visible">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 sm:p-2.5 rounded-xl hover:bg-white/10 transition-colors">
              <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
            </motion.button>
            <div className="text-center">
              <h3 className="text-base sm:text-lg font-bold capitalize">{format(currentMonth, 'MMMM', { locale: pt })}</h3>
              <p className="text-[10px] sm:text-[11px] text-white/30 font-medium">{format(currentMonth, 'yyyy')} • {totalThisMonth} gravações</p>
            </div>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 sm:p-2.5 rounded-xl hover:bg-white/10 transition-colors">
              <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
            </motion.button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5 mb-1 sm:mb-2">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => {
              const fullNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
              return (
                <div key={`${d}-${i}`} className="text-center text-[9px] sm:text-[10px] font-bold text-white/25 uppercase tracking-wider py-1 sm:py-1.5">
                  <span className="hidden sm:inline">{fullNames[i]}</span>
                  <span className="sm:hidden">{d}</span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2 relative z-10 overflow-visible">
            {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
            {daysInMonth.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const recs = recordingsByDate[dateStr] || [];
              const dayEvents = eventsByDate[dateStr] || [];
              const hasAnyEvent = dayEvents.length > 0;
              const hasUpcoming = recs.some(r => isScheduled(r.status));
              const hasCancelled = recs.some(r => r.status === 'cancelada');
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isToday = isDateToday(day);
              const isPast = isBefore(day, new Date()) && !isToday;
              const isHovered = hoveredDay === dateStr;
              const dayStyle = getDayStyle(dateStr);
              const rowIndex = Math.floor((startPad + idx) / 7);
              const columnIndex = (startPad + idx) % 7;
              const tooltipOnTop = rowIndex >= 3;
              const tooltipVerticalClass = tooltipOnTop ? 'bottom-full mb-2' : 'top-full mt-2';
              const tooltipHorizontalClass = columnIndex <= 1
                ? 'left-0'
                : columnIndex >= 5
                  ? 'right-0'
                  : 'left-1/2 -translate-x-1/2';

              const uniqueEvents = dayEvents.reduce((acc: DayEvent[], e) => {
                if (!acc.find(a => a.icon === e.icon)) acc.push(e);
                return acc;
              }, []).slice(0, 3);

              const glowColor = hasCancelled ? 'rgba(239,68,68,0.4)'
                : hasUpcoming ? `hsl(25 100% 50% / 0.4)`
                : dayEvents.some(e => e.icon === '✅') ? 'rgba(52,211,153,0.4)'
                : dayEvents.some(e => e.icon === '📱') ? 'rgba(236,72,153,0.4)'
                : dayEvents.some(e => e.icon === '⏰') ? 'rgba(249,115,22,0.4)'
                : dayEvents.some(e => e.icon === '✂️') ? 'rgba(96,165,250,0.4)'
                : hasAnyEvent ? 'rgba(255,255,255,0.15)' : 'none';

              return (
                <motion.button key={dateStr}
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.006, type: 'spring', stiffness: 300, damping: 25 }}
                  onClick={() => setSelectedDay(day)}
                  onMouseEnter={() => setHoveredDay(dateStr)} onMouseLeave={() => setHoveredDay(null)}
                  whileHover={!isPast ? { scale: 1.06, zIndex: 20 } : {}} whileTap={!isPast ? { scale: 0.95 } : {}}
                  className={`aspect-square rounded-lg sm:rounded-2xl flex flex-col items-center justify-center relative transition-all duration-300 overflow-visible
                    ${isToday && !isSelected ? 'ring-1 sm:ring-2 ring-white/30' : ''}
                    ${isPast ? 'text-white/25' : 'text-white/80'}
                    ${hasAnyEvent && !isPast ? 'text-white shadow-lg' : ''}`}
                  style={{
                    background: isSelected ? `hsl(${clientColor} / 0.3)`
                      : !isPast && hasAnyEvent ? (dayStyle.bg || 'transparent')
                      : isHovered && !isPast ? 'rgba(255,255,255,0.06)' : 'transparent',
                    boxShadow: isSelected
                      ? `0 0 0 2px hsl(${clientColor}), 0 4px 25px hsl(${clientColor} / 0.3), 0 0 40px hsl(${clientColor} / 0.15)`
                      : !isPast && hasAnyEvent
                        ? `inset 0 0 0 1.5px ${dayStyle.border || 'transparent'}, 0 0 20px ${glowColor}`
                        : 'none',
                  }}>
                  {hasAnyEvent && !isPast && (
                    <motion.div
                      className="absolute inset-0 rounded-2xl pointer-events-none"
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                      style={{ background: `radial-gradient(circle at 50% 50%, ${glowColor}, transparent 70%)` }}
                    />
                  )}
                  {hasCancelled && !isPast && (
                    <motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }}
                      className="absolute inset-0 flex items-center justify-center text-red-500/30 text-xl sm:text-3xl font-black z-0 pointer-events-none">✕</motion.span>
                  )}
                  {recs.length > 0 && !isPast && hasUpcoming && !hasCancelled && <RocketFireIndicator small />}
                  <span className={`text-xs sm:text-sm leading-none relative z-10 ${isToday ? 'font-extrabold text-white' : hasAnyEvent ? 'font-bold' : 'font-medium'}`}>
                    {format(day, 'd')}
                  </span>
                  {uniqueEvents.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-0.5 mt-1 relative z-10">
                      {uniqueEvents.map((evt, i) => (
                        <EventIndicator key={i} event={evt} small />
                      ))}
                      {dayEvents.length > 3 && (
                        <motion.span
                          className="text-[9px] text-white/60 font-extrabold ml-0.5 bg-white/10 rounded-full w-4 h-4 flex items-center justify-center"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >+{dayEvents.length - 3}</motion.span>
                      )}
                    </motion.div>
                  )}
                  {isToday && !hasAnyEvent && (
                    <motion.div className="w-1.5 h-1.5 rounded-full mt-1 relative z-10"
                      style={{ background: `hsl(${clientColor})` }}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }} />
                  )}
                  <AnimatePresence>
                    {isHovered && hasAnyEvent && !isSelected && (
                      <motion.div initial={{ opacity: 0, y: 5, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.9 }}
                        className={`hidden sm:block absolute ${tooltipVerticalClass} ${tooltipHorizontalClass} z-40 pointer-events-none`}>
                        <div className="bg-[#12122a]/95 backdrop-blur-xl border border-white/15 rounded-xl px-4 py-2.5 shadow-2xl max-w-[220px] sm:max-w-[280px] whitespace-normal text-left space-y-1">
                          {dayEvents.slice(0, 5).map((ev, i) => (
                            <p key={i} className={`text-xs font-bold flex items-start gap-1.5 ${ev.color}`}>
                              <span className="text-sm leading-none mt-0.5">{ev.icon}</span>
                              <span>{ev.label}{ev.time ? ` • ${ev.time}` : ''}</span>
                            </p>
                          ))}
                          {dayEvents.length > 5 && <p className="text-[10px] text-white/40 font-medium">+{dayEvents.length - 5} mais</p>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

        </motion.div>

        {/* Sidebar — Day Detail */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <AnimatePresence mode="wait">
            {selectedDay ? (
              <motion.div key={format(selectedDay, 'yyyy-MM-dd')}
                initial={{ opacity: 0, x: 20, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -20, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 sm:p-5 relative overflow-hidden max-h-[60vh] lg:max-h-[80vh] overflow-y-auto">
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
                    <p className="text-xs text-white/40 capitalize">{format(selectedDay, "dd 'de' MMMM 'de' yyyy", { locale: pt })}</p>
                  </div>
                </div>

                {(() => {
                  const dateStr = format(selectedDay, 'yyyy-MM-dd');
                  const dayEvts = eventsByDate[dateStr] || [];
                  const hasContent = dayRecordings.length > 0 || dayEvts.length > 0;

                  if (!hasContent) return (
                    <div className="text-center py-10">
                      <CalendarDays size={36} className="mx-auto text-white/[0.07] mb-3" />
                      <p className="text-sm text-white/25 font-medium">Nenhuma atividade</p>
                      <p className="text-[11px] text-white/15 mt-1">Dia livre 🎉</p>
                    </div>
                  );

                  // Group events by type for a timeline view
                  const recordingEvts = dayEvts.filter(e => e.type === 'recording');
                  const contentEvts = dayEvts.filter(e => e.type === 'content' || e.type === 'deadline');
                  const deliveryEvts = dayEvts.filter(e => e.type === 'delivery');

                  return (
                    <div className="space-y-3">
                      {/* Recording cards with actions */}
                      {dayRecordings.map((rec, i) => {
                        const st = STATUS_MAP[rec.status] || STATUS_MAP.agendada;
                        const typeInfo = TYPE_MAP[rec.type] || { label: rec.type, emoji: '🎬' };
                        const canAct = isScheduled(rec.status) && isAfter(parseISO(rec.date), new Date());
                        const isConfirmed = rec.confirmation_status === 'confirmada';
                        
                        // Find related content tasks for this recording
                        const relatedTasks = contentTasks.filter(ct => ct.recording_id === rec.id);
                        
                        return (
                          <motion.div key={rec.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-xl overflow-hidden relative">
                            <div className="h-1 relative z-[1]" style={{
                              background: rec.status === 'concluida' || rec.status === 'gravado' ? 'linear-gradient(90deg, #34d399, #10b981)' : rec.status === 'cancelada' ? 'linear-gradient(90deg, #f87171, #ef4444)' : `linear-gradient(90deg, hsl(25 100% 50%), hsl(${clientColor}))`
                            }} />
                            <div className="bg-white/[0.04] border border-white/[0.06] border-t-0 rounded-b-xl p-4 space-y-3 relative z-[1]">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg relative" style={{ background: `hsl(${clientColor} / 0.1)` }}>
                                    {rec.status === 'cancelada' ? <span className="text-red-400 text-xl font-black">✕</span> : canAct ? <motion.span animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }}>🚀</motion.span> : typeInfo.emoji}
                                  </div>
                                  <div>
                                    <p className="text-base font-extrabold tabular-nums" style={{ color: rec.status === 'cancelada' ? '#f87171' : `hsl(${clientColor})` }}>{rec.start_time}</p>
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

                              {/* Related content info */}
                              {relatedTasks.length > 0 && (rec.status === 'concluida' || rec.status === 'gravado') && (
                                <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 space-y-2">
                                  <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider">Roteiros gravados</p>
                                  {relatedTasks.map(ct => (
                                    <div key={ct.id} className="flex items-center gap-2">
                                      <span className="text-[10px]">🎬</span>
                                      <span className="text-[11px] text-white/60 font-medium truncate flex-1">{ct.title}</span>
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                                        ct.kanban_column === 'concluido' ? 'bg-emerald-500/15 text-emerald-300' :
                                        ct.kanban_column === 'edicao' ? 'bg-blue-500/15 text-blue-300' :
                                        ct.kanban_column === 'revisao' ? 'bg-cyan-500/15 text-cyan-300' :
                                        ct.kanban_column === 'envio' || ct.kanban_column === 'agendamentos' ? 'bg-purple-500/15 text-purple-300' :
                                        'bg-white/10 text-white/40'
                                      }`}>{ct.kanban_column}</span>
                                    </div>
                                  ))}
                                  {relatedTasks[0]?.drive_link && (
                                    <p className="text-[10px] text-sky-400/60 flex items-center gap-1 mt-1">📤 Material enviado p/ edição</p>
                                  )}
                                </div>
                              )}

                              {canAct && (
                                <div className="flex gap-2">
                                  {!isConfirmed && (
                                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleConfirm(rec)}
                                      className="flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all">
                                      <Check size={12} /> Confirmar
                                    </motion.button>
                                  )}
                                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => setCancelFlow({ step: 'confirming', rec })}
                                    className={`${isConfirmed ? '' : ''} py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 bg-red-500/10 text-red-300 border border-red-500/15 hover:bg-red-500/20 transition-all`}>
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

                      {/* Content & Deadline events — timeline style */}
                      {(contentEvts.length > 0 || deliveryEvts.length > 0) && (
                        <>
                          {dayRecordings.length > 0 && (
                            <div className="flex items-center gap-2 pt-2">
                              <div className="h-px flex-1 bg-white/[0.06]" />
                              <span className="text-[9px] font-bold text-white/25 uppercase tracking-wider">Atividades do dia</span>
                              <div className="h-px flex-1 bg-white/[0.06]" />
                            </div>
                          )}
                          {[...contentEvts, ...deliveryEvts].map((evt, i) => (
                            <motion.div key={`evt-${i}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: (dayRecordings.length + i) * 0.04 }}
                              className={`flex items-start gap-3 ${evt.bgColor} border ${evt.borderColor} rounded-xl px-4 py-3 relative overflow-hidden`}>
                              {/* Animated left accent */}
                              <motion.div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                                style={{ background: `currentColor` }}
                                animate={evt.animationType === 'pulse' ? { opacity: [0.3, 1, 0.3] } : evt.animationType === 'glow' ? { opacity: [0.5, 1, 0.5] } : {}}
                                transition={{ repeat: Infinity, duration: 2 }} />
                              <EventIndicator event={evt} />
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold ${evt.color}`}>{evt.label}</p>
                                {evt.detail && <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed">{evt.detail}</p>}
                              </div>
                              {evt.time && <span className="text-[10px] font-bold text-white/30 tabular-nums shrink-0">{evt.time}</span>}
                            </motion.div>
                          ))}
                        </>
                      )}

                      {/* Task history for this day */}
                      {(() => {
                        const dayHist = taskHistory.filter(h => h.created_at.substring(0, 10) === dateStr);
                        if (dayHist.length === 0) return null;
                        return (
                          <>
                            <div className="flex items-center gap-2 pt-2">
                              <div className="h-px flex-1 bg-white/[0.06]" />
                              <span className="text-[9px] font-bold text-white/25 uppercase tracking-wider">Histórico</span>
                              <div className="h-px flex-1 bg-white/[0.06]" />
                            </div>
                            {dayHist.map((h, i) => (
                              <motion.div key={h.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                                className="flex items-start gap-2 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                                <span className="text-[9px] text-white/20 tabular-nums shrink-0 pt-0.5">{h.created_at.substring(11, 16)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] text-white/50 leading-relaxed">{h.action}</p>
                                  {h.details && <p className="text-[9px] text-white/30 mt-0.5 truncate">{h.details}</p>}
                                </div>
                              </motion.div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  );
                })()}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 text-center py-16">
                <Clapperboard size={36} className="mx-auto text-white/[0.07] mb-4" />
                <p className="text-sm text-white/25 font-medium">Selecione um dia</p>
                <p className="text-[11px] text-white/15 mt-1">Toque em um dia para ver o rastro de atividades</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Legend — always at the bottom */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="mt-4 sm:mt-6 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3 sm:p-5 space-y-3">
        <h4 className="text-[10px] sm:text-xs font-bold text-white/40 uppercase tracking-widest">Legenda dos ícones</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="space-y-1.5">
            <span className="text-[9px] sm:text-[10px] font-bold text-white/30 uppercase tracking-widest">Gravações</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {['agendada', 'gravada', 'cancelada', 'remarcada', 'extra', 'solicitada'].map(k => {
                const s = EVENT_STYLES[k];
                return (
                  <div key={k} className="flex items-center gap-1.5 text-[11px] sm:text-xs text-white/50 font-medium">
                    <span className="text-sm sm:text-base drop-shadow-md">{s.icon}</span>{s.label.replace('Gravação ', '')}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-[9px] sm:text-[10px] font-bold text-white/30 uppercase tracking-widest">Produção</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {['material_sent', 'editing', 'deadline', 'in_review', 'approval_sent', 'approved', 'adjustment', 'completed'].map(k => {
                const s = EVENT_STYLES[k];
                return (
                  <div key={k} className="flex items-center gap-1.5 text-[11px] sm:text-xs text-white/50 font-medium">
                    <span className="text-sm sm:text-base drop-shadow-md">{s.icon}</span>{s.label.split(' — ')[0]}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-[9px] sm:text-[10px] font-bold text-white/30 uppercase tracking-widest">Entrega</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {['delivered', 'posted', 'scheduled_post'].map(k => {
                const s = EVENT_STYLES[k];
                return (
                  <div key={k} className="flex items-center gap-1.5 text-[11px] sm:text-xs text-white/50 font-medium">
                    <span className="text-sm sm:text-base drop-shadow-md">{s.icon}</span>{s.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Cancel Flow Modal ── */}
      <AnimatePresence>
        {cancelFlow && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setCancelFlow(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#12121e] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md relative" onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-red-500 to-orange-500" />
              <motion.button whileHover={{ rotate: 90 }} onClick={() => setCancelFlow(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10"><X size={16} /></motion.button>

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
                      className="flex-1 py-3 rounded-xl text-sm font-bold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all">Manter</motion.button>
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
                          <CalendarDays size={13} /> Próxima
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                        <p className="text-sm text-amber-300 font-medium">Seu videomaker não tem vaga no dia de backup.</p>
                      </div>
                      {cancelFlow.alternativeVideomakers.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs text-white/50 font-medium">🎬 Outros videomakers disponíveis:</p>
                          {cancelFlow.alternativeVideomakers.map(vm => (
                            <div key={vm.id} className={`rounded-xl border p-3 transition-all cursor-pointer ${selectedAltVm?.id === vm.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'}`}
                              onClick={() => { setSelectedAltVm(vm); setSelectedAltTime(''); }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-white/80 flex items-center gap-2">
                                  <Video size={13} style={{ color: `hsl(${clientColor})` }} />{vm.name}
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
                                        style={selectedAltTime === slot ? { background: `hsl(${clientColor})` } : {}}>{slot}</motion.button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </div>
                          ))}
                          {selectedAltVm && selectedAltTime && (
                            <motion.button initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.95 }}
                              onClick={() => handleAcceptBackup(selectedAltVm.id, selectedAltVm.date, selectedAltTime)} disabled={acceptingBackup}
                              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                              style={{ background: `linear-gradient(135deg, hsl(25 100% 50%), hsl(${clientColor}))` }}>
                              {acceptingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check size={14} /> Gravar com {selectedAltVm.name} às {selectedAltTime}</>}
                            </motion.button>
                          )}
                        </div>
                      )}
                      <div className="border-t border-white/[0.06] pt-4">
                        <p className="text-xs text-white/40 mb-2">Ou prefira aguardar:</p>
                        {cancelFlow.nextFixedDate && (
                          <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 mb-3">
                            <p className="text-xs text-white/50">Próxima gravação fixa: <strong className="text-white/70 capitalize">{format(parseISO(cancelFlow.nextFixedDate), "EEEE, dd/MM", { locale: pt })}</strong></p>
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

      {/* ── Explore Slots Modal ── */}
      <AnimatePresence>
        {showExploreSlots && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowExploreSlots(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="bg-[#12121e] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
              <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `hsl(${clientColor})` }} />
              <div className="flex items-center justify-between mb-5 mt-1">
                <div className="flex items-center gap-2"><CalendarDays size={18} style={{ color: `hsl(${clientColor})` }} /><h3 className="text-lg font-bold">Horários disponíveis</h3></div>
                <motion.button whileHover={{ rotate: 90 }} onClick={() => setShowExploreSlots(false)} className="p-2 rounded-full hover:bg-white/10"><X size={16} /></motion.button>
              </div>
              <p className="text-xs text-white/40 mb-4">Escolha uma data para ver horários vagos:</p>
              <div className="grid grid-cols-3 gap-2 mb-4 max-h-40 overflow-y-auto">
                {nextDays.map(d => (
                  <motion.button key={d} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleExploreSlots(d)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-medium transition-all border ${exploreSlotsDate === d ? 'border-transparent text-white' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/60'}`}
                    style={exploreSlotsDate === d ? { background: `hsl(${clientColor})` } : {}}>
                    <div className="capitalize font-bold">{format(parseISO(d), 'EEE', { locale: pt })}</div>
                    <div className="text-sm font-extrabold mt-0.5">{format(parseISO(d), 'dd/MM')}</div>
                  </motion.button>
                ))}
              </div>
              {exploringSlots && (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: `hsl(${clientColor})` }} /><span className="text-sm text-white/40">Verificando...</span>
                </div>
              )}
              {exploreSlotsDate && !exploringSlots && (
                <div>
                  {exploreVmName && <p className="text-xs text-white/40 mb-2">🎬 {exploreVmName}</p>}
                  {exploreSlotsData.length === 0 ? (
                    <div className="text-center py-6 bg-white/[0.03] rounded-xl"><p className="text-sm text-white/30">Sem horários vagos</p></div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {exploreSlotsData.map(slot => (
                        <motion.button key={slot} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => { setShowExploreSlots(false); setShowSpecialRequest(true); setSpecialDate(exploreSlotsDate); setSpecialTime(slot); }}
                          className="py-3 rounded-xl text-sm font-bold border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/70 hover:text-white transition-all">{slot}</motion.button>
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
                  <span className="w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ background: `hsl(${clientColor})` }}>1</span> Nova data
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
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: `hsl(${clientColor})` }} /><span className="text-sm text-white/40">Verificando...</span>
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
                          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setSelectedNewTime(slot)}
                          className={`py-3 rounded-xl text-sm font-bold transition-all border ${selectedNewTime === slot ? 'border-transparent text-white shadow-lg' : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] text-white/60'}`}
                          style={selectedNewTime === slot ? { background: `hsl(${clientColor})`, boxShadow: `0 4px 15px hsl(${clientColor} / 0.3)` } : {}}>{slot}</motion.button>
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
                <motion.button whileHover={{ rotate: 90 }} onClick={() => setShowSpecialRequest(false)} className="p-2 rounded-full hover:bg-white/10"><X size={16} /></motion.button>
              </div>
              <p className="text-xs text-white/40 mb-5">Quer gravar algo especial? Envie sua solicitação e a equipe vai confirmar!</p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-white/50 mb-1.5 block">Data desejada</label>
                  <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                    {nextDays.slice(0, 15).map(d => (
                      <motion.button key={d} whileTap={{ scale: 0.95 }} onClick={() => setSpecialDate(d)}
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
                    placeholder="Ex: Dia 25 vai ter um café da manhã na loja..."
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

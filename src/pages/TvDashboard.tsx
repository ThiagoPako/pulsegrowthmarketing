import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  Monitor, Clock, Coffee, Camera, Film, Palette, Megaphone, Image, Users,
  Wifi, WifiOff, Activity, CalendarDays, MapPin, CheckCircle2, Circle,
  XCircle, Rocket, Zap, TrendingUp
} from 'lucide-react';

const VPS = 'https://agenciapulse.tech/api';

/* ─── Types ─────────────────────────────────────────────── */
interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
  isOnline: boolean;
  activity?: string;
  clientName?: string;
  taskTitle?: string;
  timeOnTask?: number;
  taskType?: string;
}

interface ScheduleItem {
  id: string;
  type: 'recording' | 'event';
  clientName: string;
  clientLogo?: string | null;
  clientColor?: string | null;
  videomakerName?: string | null;
  startTime: string;
  endTime?: string;
  recordingType?: string;
  status: string;
  confirmationStatus?: string;
  title?: string;
  address?: string;
}

/* ─── Brand colors (Pulse identity) ─────────────────────── */
const PULSE_ORANGE = 'hsl(16, 82%, 51%)';
const PULSE_DARK = '#0c0a14';
const PULSE_DARK_CARD = 'rgba(255,255,255,0.04)';

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: any; gradient: string }> = {
  admin:         { label: 'Administração',  color: PULSE_ORANGE, icon: Monitor,   gradient: 'from-orange-500/20 to-orange-600/5' },
  social_media:  { label: 'Social Media',   color: '#22c55e',    icon: Users,     gradient: 'from-green-500/15 to-green-600/5' },
  videomaker:    { label: 'Videomaker',      color: '#3b82f6',    icon: Camera,    gradient: 'from-blue-500/15 to-blue-600/5' },
  editor:        { label: 'Editor',          color: '#8b5cf6',    icon: Film,      gradient: 'from-violet-500/15 to-violet-600/5' },
  designer:      { label: 'Designer',        color: '#f97316',    icon: Palette,   gradient: 'from-orange-400/15 to-orange-500/5' },
  fotografo:     { label: 'Fotógrafo',       color: '#ec4899',    icon: Image,     gradient: 'from-pink-500/15 to-pink-600/5' },
  endomarketing: { label: 'Endomarketing',   color: '#06b6d4',    icon: Megaphone, gradient: 'from-cyan-500/15 to-cyan-600/5' },
  parceiro:      { label: 'Parceiro',        color: '#14b8a6',    icon: Megaphone, gradient: 'from-teal-500/15 to-teal-600/5' },
};

const ACTIVITY_LABELS: Record<string, string> = {
  recording: '🎬 Gravando',
  editing: '🎞️ Editando',
  reviewing: '🔍 Revisando',
  designing: '🎨 Criando Arte',
  idle: '☕ Disponível',
  paused: '⏸️ Pausado',
  management: '📋 Gestão',
};

/* ─── Utils ─────────────────────────────────────────────── */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

/* ─── Animation variants ────────────────────────────────── */
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.06, duration: 0.5, ease: 'easeOut' as const },
  }),
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.3 } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const pulseGlow = {
  animate: {
    boxShadow: [
      '0 0 20px rgba(234, 88, 12, 0)',
      '0 0 30px rgba(234, 88, 12, 0.15)',
      '0 0 20px rgba(234, 88, 12, 0)',
    ],
  },
  transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const },
};

/* ─── Animated number (imperceptible transitions) ────── */
function AnimatedNumber({ value }: { value: number }) {
  const motionVal = useMotionValue(value);
  const rounded = useTransform(motionVal, v => Math.round(v));
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(motionVal, value, { duration: 0.8, ease: 'easeOut' });
    const unsub = rounded.on('change', v => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [value]);

  return <span>{display}</span>;
}

/* ─── Member Card ───────────────────────────────────────── */
function MemberCard({ member, index }: { member: TeamMember; index: number }) {
  const config = ROLE_CONFIG[member.role] || ROLE_CONFIG.admin;
  const Icon = config.icon;
  const activityLabel = member.activity ? (ACTIVITY_LABELS[member.activity] || member.activity) : '☕ Disponível';
  const isWorking = member.activity && member.activity !== 'idle' && member.activity !== 'paused';

  return (
    <motion.div
      layout
      layoutId={`member-${member.id}`}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`relative rounded-2xl border overflow-hidden backdrop-blur-sm bg-gradient-to-br ${config.gradient}`}
      style={{
        borderColor: `${config.color}33`,
        background: `linear-gradient(135deg, ${config.color}11, transparent 70%)`,
      }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
    >
      {/* Working glow effect */}
      {isWorking && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          animate={{
            boxShadow: [
              `inset 0 0 30px ${config.color}11`,
              `inset 0 0 40px ${config.color}22`,
              `inset 0 0 30px ${config.color}11`,
            ],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Animated top accent bar */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, transparent, ${config.color}, transparent)` }}
        animate={isWorking ? { opacity: [0.3, 1, 0.3] } : { opacity: 0.4 }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      <div className="p-4 flex items-start gap-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {member.avatarUrl ? (
            <motion.img
              src={member.avatarUrl}
              alt={member.name}
              className="w-14 h-14 rounded-xl object-cover border-2"
              style={{ borderColor: config.color }}
              layoutId={`avatar-${member.id}`}
            />
          ) : (
            <motion.div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold border-2"
              style={{ borderColor: config.color, backgroundColor: `${config.color}18`, color: config.color }}
              layoutId={`avatar-${member.id}`}
            >
              {getInitials(member.name)}
            </motion.div>
          )}
          {/* Online indicator */}
          <motion.div
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2"
            style={{
              borderColor: PULSE_DARK,
              backgroundColor: member.isOnline ? '#22c55e' : '#6b7280',
            }}
            animate={member.isOnline ? { scale: [1, 1.15, 1], opacity: [1, 0.8, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-white truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {member.name}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Icon className="w-3 h-3" style={{ color: config.color }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: config.color }}>
              {config.label}
            </span>
          </div>

          {/* Activity */}
          <motion.div
            className="mt-2 flex items-center gap-2"
            key={member.activity}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            {isWorking && (
              <motion.div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: config.color }}
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            <span className={`text-sm font-semibold ${isWorking ? 'text-white' : 'text-white/40'}`}>
              {activityLabel}
            </span>
          </motion.div>

          {/* Task info */}
          <AnimatePresence mode="wait">
            {member.taskTitle && (
              <motion.div
                key={member.taskTitle}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-1.5 bg-black/20 rounded-lg px-3 py-1.5 border border-white/5"
              >
                <p className="text-xs text-white/60 truncate">📌 {member.taskTitle}</p>
                {member.clientName && (
                  <p className="text-[11px] text-white/40 truncate">🏢 {member.clientName}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Timer */}
          {isWorking && member.timeOnTask != null && member.timeOnTask > 0 && (
            <motion.div
              className="mt-2 flex items-center gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Clock className="w-3.5 h-3.5 text-white/50" />
              <span className="text-sm font-mono font-bold text-white/70 tabular-nums">
                {formatDuration(member.timeOnTask)}
              </span>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Status Summary Bar ────────────────────────────────── */
function StatusSummary({ members }: { members: TeamMember[] }) {
  const online = members.filter(m => m.isOnline).length;
  const working = members.filter(m => m.isOnline && m.activity && m.activity !== 'idle' && m.activity !== 'paused').length;
  const idle = online - working;

  return (
    <motion.div
      className="flex items-center gap-5"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
    >
      {[
        { icon: <div className="w-2.5 h-2.5 rounded-full bg-green-500" />, label: 'Online', value: online, color: '#22c55e' },
        { icon: <Zap className="w-3.5 h-3.5 text-orange-400" />, label: 'Produzindo', value: working, color: PULSE_ORANGE },
        { icon: <Coffee className="w-3.5 h-3.5 text-white/40" />, label: 'Disponível', value: idle, color: '#94a3b8' },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          {item.icon}
          <span className="text-xs text-white/50 font-medium">{item.label}:</span>
          <span className="text-sm font-bold" style={{ color: item.color }}>
            <AnimatedNumber value={item.value} />
          </span>
        </div>
      ))}
    </motion.div>
  );
}

/* ─── Schedule Card ─────────────────────────────────────── */
function ScheduleCard({ item, index }: { item: ScheduleItem; index: number }) {
  const now = new Date();
  const [h, m] = item.startTime.split(':').map(Number);
  const startDate = new Date(); startDate.setHours(h, m, 0, 0);
  const isNow = item.status === 'em_andamento' || (item.status === 'agendada' && now >= startDate && now <= new Date(startDate.getTime() + 90 * 60000));
  const isDone = item.status === 'concluida';
  const isCancelled = item.status === 'cancelada';

  const borderColor = isCancelled
    ? 'rgba(239,68,68,0.25)'
    : isDone
    ? 'rgba(34,197,94,0.25)'
    : isNow
    ? `${PULSE_ORANGE}55`
    : 'rgba(255,255,255,0.08)';

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
      className={`relative rounded-xl overflow-hidden backdrop-blur-sm ${
        isCancelled ? 'opacity-35' : ''
      }`}
      style={{
        border: `1px solid ${borderColor}`,
        background: isNow
          ? `linear-gradient(135deg, ${PULSE_ORANGE}11, transparent)`
          : isDone
          ? 'linear-gradient(135deg, rgba(34,197,94,0.05), transparent)'
          : PULSE_DARK_CARD,
      }}
    >
      {/* Live glow */}
      {isNow && (
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          animate={{
            boxShadow: [
              `inset 0 0 15px ${PULSE_ORANGE}11`,
              `inset 0 0 25px ${PULSE_ORANGE}22`,
              `inset 0 0 15px ${PULSE_ORANGE}11`,
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-lg font-mono font-bold text-white/85 tabular-nums">{item.startTime}</span>
          <div className="flex items-center gap-1.5">
            {isDone && <CheckCircle2 className="w-4 h-4 text-green-400" />}
            {isCancelled && <XCircle className="w-4 h-4 text-red-400" />}
            {isNow && (
              <motion.div
                className="flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{ backgroundColor: `${PULSE_ORANGE}22` }}
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: PULSE_ORANGE }}
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-[10px] font-bold" style={{ color: PULSE_ORANGE }}>AO VIVO</span>
              </motion.div>
            )}
            {!isDone && !isCancelled && !isNow && <Circle className="w-3.5 h-3.5 text-white/15" />}
            {item.type === 'event' && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: `${PULSE_ORANGE}18`, color: PULSE_ORANGE }}>
                Evento
              </span>
            )}
            {item.recordingType === 'extra' && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">Extra</span>
            )}
            {item.recordingType === 'backup' && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Backup</span>
            )}
          </div>
        </div>
        <p className="text-sm font-semibold text-white truncate">{item.clientName}</p>
        {item.videomakerName && (
          <div className="flex items-center gap-1 mt-1">
            <Camera className="w-3 h-3 text-blue-400/50" />
            <span className="text-xs text-white/45">{item.videomakerName}</span>
          </div>
        )}
        {item.address && (
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3" style={{ color: `${PULSE_ORANGE}66` }} />
            <span className="text-[11px] text-white/35 truncate">{item.address}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Floating Particles Background ─────────────────────── */
function FloatingParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 10,
    })),
  []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `${PULSE_ORANGE}`,
          }}
          animate={{
            y: [0, -40, 0],
            x: [0, 15, -10, 0],
            opacity: [0, 0.25, 0.15, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Main TV Dashboard ─────────────────────────────────── */
export default function TvDashboard() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [connected, setConnected] = useState(true);
  const [clock, setClock] = useState(new Date());
  const timerRef = useRef<number>();
  const isFirstLoad = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${VPS}/tv-dashboard`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setMembers(data.members || []);
      setSchedule(data.todaySchedule || []);
      setConnected(true);
      isFirstLoad.current = false;
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 10_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // Clock tick
  useEffect(() => {
    timerRef.current = window.setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Increment local timers
  useEffect(() => {
    const iv = setInterval(() => {
      setMembers(prev => prev.map(m => {
        if (m.isOnline && m.activity && m.activity !== 'idle' && m.activity !== 'paused' && m.timeOnTask != null) {
          return { ...m, timeOnTask: m.timeOnTask + 1 };
        }
        return m;
      }));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const onlineMembers = members.filter(m => m.isOnline);
  const offlineMembers = members.filter(m => !m.isOnline);
  const hasLoaded = !isFirstLoad.current;

  const timeStr = clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = clock.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div
      className="min-h-screen text-white p-6 overflow-hidden relative"
      style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", backgroundColor: PULSE_DARK }}
    >
      <FloatingParticles />

      {/* Gradient overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${PULSE_ORANGE}08, transparent 70%)`,
        }}
      />

      <div className="relative z-10">
        {/* ─── Header ────────────────────────────────────── */}
        <motion.div
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="flex items-center gap-5">
            {/* Logo / Brand */}
            <motion.div
              className="flex items-center gap-3"
              {...pulseGlow}
            >
              <motion.div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${PULSE_ORANGE}, hsl(16, 82%, 40%))`,
                  boxShadow: `0 4px 20px ${PULSE_ORANGE}44`,
                }}
                animate={{ rotate: [0, 3, -3, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Rocket className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <h1 className="text-2xl font-black tracking-tight" style={{ color: PULSE_ORANGE }}>
                  PULSE
                </h1>
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 font-medium -mt-0.5">
                  Growth Marketing
                </p>
              </div>
            </motion.div>

            <div className="h-10 w-px bg-white/10" />

            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
            >
              <TrendingUp className="w-3.5 h-3.5" style={{ color: PULSE_ORANGE }} />
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Painel Operacional</span>
            </motion.div>
          </div>

          <div className="flex items-center gap-6">
            <StatusSummary members={members} />

            <div className="h-8 w-px bg-white/10" />

            {/* Connection */}
            <motion.div
              animate={{ opacity: connected ? 1 : 0.5 }}
              className="flex items-center gap-1.5"
            >
              {connected ? (
                <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                  <Wifi className="w-4 h-4 text-green-400" />
                </motion.div>
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
              <span className="text-[10px] text-white/30 font-medium">{connected ? 'LIVE' : 'OFFLINE'}</span>
            </motion.div>

            {/* Clock */}
            <div className="text-right">
              <motion.div
                key={timeStr}
                className="text-2xl font-mono font-bold tabular-nums text-white/90"
                initial={false}
                animate={{ opacity: 1 }}
              >
                {timeStr}
              </motion.div>
              <div className="text-[11px] text-white/30 capitalize font-medium">{dateStr}</div>
            </div>
          </div>
        </motion.div>

        {/* ─── Online Members ────────────────────────────── */}
        {onlineMembers.length > 0 && (
          <motion.div
            className="mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <motion.div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: '#22c55e' }}
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <h2 className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Equipe Online
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              <span className="text-xs font-mono text-white/25">{onlineMembers.length} membros</span>
            </div>
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {onlineMembers.map((m, i) => (
                  <MemberCard key={m.id} member={m} index={i} />
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}

        {/* ─── Schedule ──────────────────────────────────── */}
        {schedule.length > 0 && (
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <CalendarDays className="w-4 h-4" style={{ color: PULSE_ORANGE }} />
              <h2 className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Agenda do Dia
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
              <span className="text-xs font-mono text-white/25">{schedule.length} gravações</span>
            </div>
            <motion.div
              className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {schedule.map((item, idx) => (
                  <ScheduleCard key={item.id} item={item} index={idx} />
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}

        {/* ─── Offline Members ───────────────────────────── */}
        {offlineMembers.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
              <h2 className="text-xs font-bold text-white/25 uppercase tracking-[0.2em]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Offline
              </h2>
              <div className="flex-1 h-px bg-white/5" />
            </div>
            <motion.div
              className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {offlineMembers.map((m, i) => {
                  const config = ROLE_CONFIG[m.role] || ROLE_CONFIG.admin;
                  return (
                    <motion.div
                      key={m.id}
                      layout
                      layoutId={`member-${m.id}`}
                      custom={i}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/5"
                      style={{ background: 'rgba(255,255,255,0.02)' }}
                    >
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.name} className="w-8 h-8 rounded-lg object-cover grayscale opacity-40" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-white/5 text-white/25">
                          {getInitials(m.name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-white/35 truncate font-medium">{m.name}</p>
                        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: `${config.color}55` }}>
                          {config.label}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}

        {/* ─── Empty state ───────────────────────────────── */}
        {members.length === 0 && (
          <motion.div
            className="flex flex-col items-center justify-center h-[60vh] gap-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0], y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Rocket className="w-16 h-16" style={{ color: `${PULSE_ORANGE}44` }} />
            </motion.div>
            <p className="text-white/25 text-lg font-medium" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Carregando equipe...
            </p>
            <motion.div
              className="w-32 h-1 rounded-full overflow-hidden bg-white/5"
            >
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: PULSE_ORANGE }}
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

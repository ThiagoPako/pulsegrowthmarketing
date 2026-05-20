// Last Updated: 2026-05-20T14:45:00Z
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
import {
  Monitor, Clock, Coffee, Camera, Film, Palette, Megaphone, Image, Users,
  Wifi, WifiOff, Activity, CalendarDays, MapPin, CheckCircle2, Circle,
  XCircle, Rocket, Zap, TrendingUp, Music, Settings, Link as LinkIcon,
  Flame, Sparkles, AlertTriangle, Gift, Star, Send, Play, Pause,
  Eye, Scissors, FileVideo, Instagram, Facebook, Youtube, Globe, Save
} from 'lucide-react';
import { fetchAISeasonalAlerts, AISeasonalAlert } from '@/lib/seasonalDates';
import { fetchLatestCommand, fetchTvSettings, TvRemoteCommand, VISIBILITY_KEYS, VisibilityKey } from '@/lib/tvRemote';

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
  videomakerAvatar?: string | null;
  scriptwriterName?: string | null;
  scriptwriterAvatar?: string | null;
  startTime: string;
  endTime?: string;
  recordingType?: string;
  status: string;
  confirmationStatus?: string;
  title?: string;
  address?: string;
}

interface EditingTask {
  id: string;
  title: string;
  column: string;
  contentType: string;
  clientName: string;
  clientLogo?: string | null;
  clientColor?: string | null;
  editorName?: string | null;
  editorAvatar?: string | null;
  reviewerName?: string | null;
  reviewerAvatar?: string | null;
  timeOnTask: number;
  isPaused: boolean;
}

interface DesignActivityTask {
  id: string;
  title: string;
  column: string;
  clientName: string;
  clientLogo?: string | null;
  clientColor?: string | null;
  designerName?: string | null;
  designerAvatar?: string | null;
  timeOnTask: number;
  isPaused: boolean;
}

interface ScheduledPost {
  id: string;
  title: string;
  contentType: string;
  platform?: string;
  status: string;
  scheduledTime?: string;
  clientName: string;
  clientLogo?: string | null;
  clientColor?: string | null;
}

interface SeasonalSlide {
  label: string;
  date: string;
  daysUntil: number;
  urgency: 'high' | 'medium' | 'low';
  suggestion: string;
  clients: { name: string; niche: string; logoUrl?: string | null; color?: string | null }[];
}

/* ─── Brand ─────────────────────────────────────────────── */
const PULSE_ORANGE = 'hsl(16, 82%, 51%)';
const PULSE_DARK = '#0c0a14';
const PULSE_CARD = 'rgba(255,255,255,0.035)';
const SPACE = "'Space Grotesk', sans-serif";
const MINUTE_HEIGHT = 1.3; // Reduzido de 1.6 para 1.3 para compactar ainda mais o visual
const OPERATIONAL_START = 8 * 60; // 08:00
const OPERATIONAL_END = 19 * 60;   // 19:00
const TIMELINE_HEIGHT = (OPERATIONAL_END - OPERATIONAL_START) * MINUTE_HEIGHT;

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  admin:         { label: 'ADMINISTRAÇÃO',  color: PULSE_ORANGE, icon: Monitor },
  social_media:  { label: 'SOCIAL MEDIA',   color: '#22c55e',    icon: Users },
  videomaker:    { label: 'VIDEOMAKER',      color: '#3b82f6',    icon: Camera },
  editor:        { label: 'EDITOR',          color: '#8b5cf6',    icon: Film },
  designer:      { label: 'DESIGNER',        color: '#f97316',    icon: Palette },
  fotografo:     { label: 'FOTÓGRAFO',       color: '#ec4899',    icon: Image },
  endomarketing: { label: 'ENDOMARKETING',   color: '#06b6d4',    icon: Megaphone },
  parceiro:      { label: 'PARCEIRO',        color: '#14b8a6',    icon: Megaphone },
};

const ACTIVITY_LABELS: Record<string, string> = {
  recording: '🎬 Ao Vivo',
  editing: '🎞️ Editando',
  reviewing: '🔍 Revisando',
  designing: '🎨 Criando Arte',
  fieldwork: '📍 Em Campo',
  idle: '☕ Disponível',
  paused: '⏸️ Pausado',
  management: '📋 Gestão',
};

const COLUMN_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  edicao:    { label: 'Editando',  color: '#8b5cf6', icon: Scissors },
  revisao:   { label: 'Em Revisão', color: '#f59e0b', icon: Eye },
  alteracao: { label: 'Alteração', color: '#ef4444', icon: FileVideo },
};

const DESIGN_COLUMN_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  executando: { label: 'Criando', color: 'hsl(330 85% 62%)', icon: Palette },
  em_analise: { label: 'Em análise', color: 'hsl(32 95% 58%)', icon: Eye },
  ajustes: { label: 'Ajustes', color: 'hsl(356 84% 62%)', icon: Sparkles },
  em_andamento: { label: 'Criando', color: 'hsl(330 85% 62%)', icon: Palette },
  revisao_interna: { label: 'Em análise', color: 'hsl(32 95% 58%)', icon: Eye },
};

/* ─── Utils ─────────────────────────────────────────────── */
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function formatElapsedTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

function SectionHeader({ icon: Icon, iconColor, title, badge, children }: {
  icon: any; iconColor?: string; title: string; badge?: string | number; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <Icon className="w-4 h-4" style={{ color: iconColor || PULSE_ORANGE }} />
      <h2 className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]" style={{ fontFamily: SPACE }}>
        {title}
      </h2>
      <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
      {badge !== undefined && <span className="text-xs font-mono text-white/25">{badge}</span>}
      {children}
    </div>
  );
}

/* ─── Animated Number ───────────────────────────────────── */
function AnimatedNumber({ value }: { value: number }) {
  const shouldReduceMotion = useReducedMotion();
  const mv = useMotionValue(value);
  const rounded = useTransform(mv, v => Math.round(v));
  const [d, setD] = useState(value);

  useEffect(() => {
    if (shouldReduceMotion) {
      setD(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.2, ease: 'easeOut' }); // Reduzido drasticamente para TV
    const u = rounded.on('change', v => setD(v));
    return () => { c.stop(); u(); };
  }, [value, shouldReduceMotion]);
  return <span>{d}</span>;
}

/* ─── Floating Particles ────────────────────────────────── */
function FloatingParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => ({ // Reduzido de 15 para 5
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      size: Math.random() * 2 + 1, duration: Math.random() * 20 + 20, delay: Math.random() * 10,
    })), []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map(p => (
        <motion.div key={p.id} className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: PULSE_ORANGE, willChange: 'transform' }}
          animate={{ y: [0, -40, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  );
}

/* ─── Time Marker Line ───────────────────────────────────── */
function TimeMarker() {
  const [topPx, setTopPx] = useState(-1);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const totalMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

      if (totalMinutes < OPERATIONAL_START || totalMinutes > OPERATIONAL_END) {
        setTopPx(-1);
      } else {
        setTopPx((totalMinutes - OPERATIONAL_START) * MINUTE_HEIGHT);
      }
      setCurrentTime(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    };

    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (topPx < 0) return null;

  return (
    <motion.div 
      className="absolute left-0 right-0 z-[100] flex items-center pointer-events-none"
      style={{ top: `${topPx}px` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex-1 h-[2px] bg-red-500/30" />
      <div className="absolute right-0 flex items-center gap-1 bg-red-600 px-2 py-1 rounded-l-md shadow-lg">
        <Clock className="w-3 h-3 text-white" />
        <span className="text-[10px] font-bold text-white tabular-nums tracking-wider">{currentTime}</span>
      </div>
    </motion.div>
  );
}

function BufferCard({ startTime, type = 'pulse', height }: { startTime: string; type?: 'pulse' | 'prep'; height?: number }) {
  const isPulse = type === 'pulse';
  return (
    <motion.div
      className="relative rounded-xl border border-dashed border-orange-500/20 px-3 flex items-center justify-center gap-2 overflow-hidden"
      style={{ 
        background: 'rgba(249,115,22,0.03)',
        height: height ? `${height}px` : 'auto',
        minHeight: isPulse ? '40px' : '36px'
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="absolute inset-0 bg-orange-500/5 pointer-events-none" />
      <div className="flex items-center gap-2 relative z-10">
        <Rocket className="w-3.5 h-3.5 text-orange-500 animate-bounce" />
        <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.3em] font-mono">PULSE</span>
        <span className="text-[9px] font-bold text-white/30 uppercase tracking-wider font-mono">
          {isPulse ? 'Organização' : 'Preparação'}
        </span>
        <span className="text-[9px] font-bold text-orange-500/40 px-1.5 py-0.5 rounded border border-orange-500/20">{startTime}</span>
      </div>
    </motion.div>
  );
}

function LunchCard({ startTime, height }: { startTime: string; height?: number }) {
  return (
    <motion.div
      className="relative rounded-xl border border-dashed border-amber-500/20 p-2.5 flex items-center justify-center gap-2 overflow-hidden"
      style={{ 
        background: 'rgba(245,158,11,0.03)',
        height: height ? `${height}px` : 'auto'
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <Coffee className="w-3.5 h-3.5 text-amber-500/40 animate-pulse" />
      <span className="text-[10px] font-black text-amber-500/30 uppercase tracking-[0.3em] font-mono">HORÁRIO DE ALMOÇO</span>
      <span className="text-[9px] font-bold text-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/10 font-mono">{startTime}</span>
    </motion.div>
  );
}

function TimelineSpacer({ minutes }: { minutes: number }) {
  if (minutes <= 0) return null;
  return <div style={{ height: `${minutes * MINUTE_HEIGHT}px` }} className="w-full" />;
}




/* ─── Status Summary ────────────────────────────────────── */


function StatusSummary({ members }: { members: TeamMember[] }) {
  const online = members.filter(m => m.isOnline).length;
  const working = members.filter(m => m.isOnline && m.activity && m.activity !== 'idle' && m.activity !== 'paused').length;
  const idle = online - working;

  return (
    <div className="flex items-center gap-5">
      {[
        { icon: <div className="w-2 h-2 rounded-full bg-green-500" />, label: 'Online', value: online, color: '#22c55e' },
        { icon: <Zap className="w-3.5 h-3.5 text-orange-400" />, label: 'Produzindo', value: working, color: PULSE_ORANGE },
        { icon: <Coffee className="w-3.5 h-3.5 text-white/40" />, label: 'Disponível', value: idle, color: '#94a3b8' },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          {item.icon}
          <span className="text-[10px] text-white/40 font-medium">{item.label}:</span>
          <span className="text-sm font-bold" style={{ color: item.color }}><AnimatedNumber value={item.value} /></span>
        </div>
      ))}
    </div>
  );
}

/* ─── Member Card (compact) ─────────────────────────────── */
function MemberCard({ member }: { member: TeamMember }) {
  const config = ROLE_CONFIG[member.role] || ROLE_CONFIG.admin;
  const isWorking = member.activity && member.activity !== 'idle' && member.activity !== 'paused';
  const isFieldwork = member.activity === 'fieldwork';
  const activityLabel = isFieldwork && member.taskTitle
    ? member.taskTitle
    : member.activity ? (ACTIVITY_LABELS[member.activity] || member.activity) : '☕ Disponível';

  return (
    <motion.div
      className="relative rounded-xl border overflow-hidden"
      style={{
        borderColor: `${config.color}25`,
        background: `linear-gradient(135deg, ${config.color}0a, transparent 70%)`,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }} // Reduzido de 0.4 para 0.2
    >
      {isWorking && (
        <motion.div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, transparent, ${config.color}, transparent)` }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <div className="p-2 flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt={member.name}
              className="w-10 h-10 rounded-lg object-cover border"
              style={{ borderColor: `${config.color}55` }}
            />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold border"
              style={{ borderColor: `${config.color}55`, backgroundColor: `${config.color}15`, color: config.color }}>
              {getInitials(member.name)}
            </div>
          )}
          <motion.div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
            style={{ borderColor: PULSE_DARK, backgroundColor: member.isOnline ? '#22c55e' : '#6b7280' }}
            animate={member.isOnline ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{member.name}</h3>
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: config.color }}>
            {config.label}
          </span>
          <motion.div className="flex items-center gap-1.5 mt-0.5" key={member.activity}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            {isWorking && (
              <motion.div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }}
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            <span className={`text-[11px] font-medium ${isWorking ? 'text-white/70' : 'text-white/30'}`}>
              {activityLabel}
            </span>
          </motion.div>
          {member.clientName && (
            <p className="text-[10px] text-white/35 truncate mt-0.5">🏢 {member.clientName}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Schedule Card (enhanced with logo + avatar) ───────── */
function ScheduleCard({ item, isLive, height }: { item: ScheduleItem; isLive: boolean; height?: number }) {
  const now = new Date();
  const [h, m] = item.startTime.split(':').map(Number);
  const startDate = new Date(); startDate.setHours(h, m, 0, 0);
  const isNow = isLive;
  const isDone = item.status === 'concluida';
  const isCancelled = item.status === 'cancelada';
  const isRescheduled = item.status === 'remarcada' || item.status === 'remarcado';

  const borderColor = isCancelled ? 'rgba(239,68,68,0.2)' : isRescheduled ? 'rgba(245,158,11,0.3)' : isDone ? 'rgba(34,197,94,0.2)' : isNow ? `${PULSE_ORANGE}44` : 'rgba(255,255,255,0.06)';

  return (
    <motion.div
      className="relative rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${borderColor}`,
        background: isNow ? `linear-gradient(135deg, ${PULSE_ORANGE}0c, transparent)` : isRescheduled ? 'linear-gradient(135deg, rgba(245,158,11,0.06), transparent)' : isDone ? 'linear-gradient(135deg, rgba(34,197,94,0.04), transparent)' : PULSE_CARD,
        opacity: isCancelled ? 0.35 : 1,
        height: height ? `${height}px` : 'auto'
      }}
      initial={false}
      animate={{ opacity: isCancelled ? 0.35 : 1, y: 0 }}
      transition={{ duration: 0.1 }}
    >
      {isNow && (
        <motion.div className="absolute inset-0 rounded-xl pointer-events-none"
          animate={{ opacity: [0.1, 0.4, 0.1] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}

      <div className="p-2 flex items-center gap-2">
        {/* Client Logo */}
        <div className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden border flex items-center justify-center"
          style={{
            borderColor: item.clientColor ? `hsl(${item.clientColor} / 0.3)` : 'rgba(255,255,255,0.1)',
            backgroundColor: item.clientColor ? `hsl(${item.clientColor} / 0.1)` : 'rgba(255,255,255,0.03)',
          }}>
          {item.clientLogo ? (
            <img src={item.clientLogo} alt="" className="w-full h-full object-contain p-1" />
          ) : (
            <span className="text-[9px] font-bold text-white/40">{getInitials(item.clientName)}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-white/85 tabular-nums">{item.startTime}</span>
            {isNow && (
              <motion.div className="flex items-center gap-1 rounded-full px-1.5 py-0.5" style={{ backgroundColor: `${PULSE_ORANGE}1a` }}
                animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <motion.div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PULSE_ORANGE }}
                  animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                <span className="text-[9px] font-bold" style={{ color: PULSE_ORANGE }}>AO VIVO</span>
              </motion.div>
            )}
            {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
            {isCancelled && <XCircle className="w-3.5 h-3.5 text-red-400" />}
            {isRescheduled && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Remarcado
              </span>
            )}
            {item.type === 'event' && (
              <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: `${PULSE_ORANGE}15`, color: PULSE_ORANGE }}>Evento</span>
            )}
            {item.recordingType === 'extra' && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300">Extra</span>}
            {item.recordingType === 'backup' && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">Backup</span>}
          </div>
          <p className="text-[13px] font-semibold text-white truncate leading-tight">
            {isRescheduled && <span className="text-amber-500 mr-1">REMARCADO:</span>}
            {item.clientName}
          </p>
          
          {isNow && item.scriptwriterName && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                <Users className="w-2.5 h-2.5 text-white/40" />
                <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Roteiro:</span>
                <span className="text-[10px] font-bold text-white/80">{item.scriptwriterName}</span>
              </div>
            </div>
          )}

          {item.address && !isNow && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-2.5 h-2.5" style={{ color: `${PULSE_ORANGE}55` }} />
              <span className="text-[10px] text-white/30 truncate">{item.address}</span>
            </div>
          )}
        </div>

        {/* Videomaker Avatar */}
        {item.videomakerName && (
          <div className="flex-shrink-0 flex flex-col items-center gap-0.5">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-blue-500/40 bg-blue-500/10 flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.15)]">
              {item.videomakerAvatar ? (
                <img src={item.videomakerAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-4 h-4 text-blue-400/60" />
              )}
            </div>
            <span className="text-[10px] font-bold text-white/40 truncate max-w-[70px] uppercase tracking-tighter">{item.videomakerName.split(' ')[0]}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Rotating Schedule Card for overlaps ───────────────── */
function RotatingScheduleCard({ items, isLive, height }: { items: ScheduleItem[]; isLive: (id: string) => boolean; height?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) {
      setIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % items.length);
    }, 6000); // 6 seconds per slide
    return () => clearInterval(interval);
  }, [items.length]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Top Pagination Bar */}
      {items.length > 1 && (
        <div className="absolute top-0 left-0 right-0 z-[60] flex h-1.5 gap-1.5 px-3 pt-1">
          {items.map((_, i) => (
            <div key={i} className="flex-1 h-1 overflow-hidden rounded-full bg-white/10">
              <motion.div 
                className="h-full bg-orange-500"
                initial={{ width: "0%" }}
                animate={{ width: i === index ? "100%" : i < index ? "100%" : "0%" }}
                transition={{ 
                  duration: i === index ? 6 : 0.4, 
                  ease: i === index ? "linear" : "easeInOut" 
                }}
              />
            </div>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={items[index]?.id || 'empty'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ 
            duration: 0.3, // Reduzido de 0.8 para 0.3
            ease: "easeOut" // Simplificado para easeOut
          }}
          className="absolute inset-0"
        >
          <ScheduleCard item={items[index]} isLive={isLive(items[index].id)} height={height} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ─── Editing Pipeline Card ─────────────────────────────── */
function EditingCard({ task }: { task: EditingTask }) {
  const col = COLUMN_CONFIG[task.column] || COLUMN_CONFIG.edicao;
  const ColIcon = col.icon;
  const personName = task.column === 'revisao' ? task.reviewerName : task.editorName;
  const personAvatar = task.column === 'revisao' ? task.reviewerAvatar : task.editorAvatar;

  return (
    <motion.div
      className="rounded-xl overflow-hidden border"
      style={{
        borderColor: `${col.color}22`,
        background: `linear-gradient(135deg, ${col.color}08, transparent 70%)`,
      }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="p-2.5">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ backgroundColor: `${col.color}18` }}>
            <ColIcon className="w-3 h-3" style={{ color: col.color }} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span>
          </div>
          {task.isPaused && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15">
              <Pause className="w-2.5 h-2.5 text-amber-400" />
              <span className="text-[8px] font-bold text-amber-400">PAUSADO</span>
            </div>
          )}
          {!task.isPaused && task.column === 'edicao' && (
            <motion.div className="flex items-center gap-1"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}>
              <Play className="w-2.5 h-2.5 text-green-400" />
            </motion.div>
          )}
        </div>

        <p className="text-sm font-semibold text-white truncate">{task.title}</p>

        <div className="flex items-center gap-2 mt-2">
          {/* Client */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {task.clientLogo ? (
              <img src={task.clientLogo} alt="" className="w-5 h-5 rounded object-contain" />
            ) : (
              <div className="w-5 h-5 rounded flex items-center justify-center text-[7px] font-bold"
                style={{ backgroundColor: task.clientColor ? `hsl(${task.clientColor} / 0.15)` : 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                {getInitials(task.clientName)}
              </div>
            )}
            <span className="text-[11px] text-white/45 truncate">{task.clientName}</span>
          </div>

          {/* Editor/Reviewer */}
          {personName && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-6 h-6 rounded-full overflow-hidden border flex items-center justify-center"
                style={{ borderColor: `${col.color}33`, backgroundColor: `${col.color}10` }}>
                {personAvatar ? (
                  <img src={personAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[8px] font-bold" style={{ color: col.color }}>{getInitials(personName)}</span>
                )}
              </div>
              <span className="text-[10px] text-white/35">{personName.split(' ')[0]}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 mt-1.5">
          <span className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)' }}>
            {task.contentType}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function DesignActivityCard({ task }: { task: DesignActivityTask }) {
  const col = DESIGN_COLUMN_CONFIG[task.column] || DESIGN_COLUMN_CONFIG.executando;
  const ColIcon = col.icon;

  return (
    <motion.div
      className="rounded-xl overflow-hidden border"
      style={{
        borderColor: `${col.color}33`,
        background: `linear-gradient(135deg, ${col.color}12, transparent 72%)`,
      }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ backgroundColor: `${col.color}18` }}>
            <ColIcon className="w-3 h-3" style={{ color: col.color }} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: col.color }}>{col.label}</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/5 text-white/35">
            {task.isPaused ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" style={{ color: col.color }} />}
            <span className="text-[8px] font-bold uppercase">{formatElapsedTime(task.timeOnTask)}</span>
          </div>
        </div>

        <p className="text-sm font-semibold text-white truncate">{task.title}</p>

        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {task.clientLogo ? (
              <img src={task.clientLogo} alt={task.clientName} className="w-6 h-6 rounded object-contain" />
            ) : (
              <div className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold"
                style={{ backgroundColor: task.clientColor ? `hsl(${task.clientColor} / 0.14)` : 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}>
                {getInitials(task.clientName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] text-white/75 truncate">{task.clientName}</p>
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Atividade da designer</p>
            </div>
          </div>

          {task.designerName && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="w-7 h-7 rounded-full overflow-hidden border flex items-center justify-center"
                style={{ borderColor: `${col.color}30`, backgroundColor: `${col.color}12` }}>
                {task.designerAvatar ? (
                  <img src={task.designerAvatar} alt={task.designerName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[8px] font-bold" style={{ color: col.color }}>{getInitials(task.designerName)}</span>
                )}
              </div>
              <span className="text-[10px] text-white/45">{task.designerName.split(' ')[0]}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Scheduled Post Card ───────────────────────────────── */
function PostCard({ post }: { post: ScheduledPost }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    entregue:    { color: '#22c55e', label: 'Entregue' },
    agendado:    { color: '#3b82f6', label: 'Agendado' },
    publicado:   { color: '#22c55e', label: 'Publicado' },
    revisao:     { color: '#f59e0b', label: 'Revisão' },
    pendente:    { color: '#6b7280', label: 'Pendente' },
    rascunho:    { color: '#6b7280', label: 'Rascunho' },
  };
  const st = statusConfig[post.status] || statusConfig.pendente;

  return (
    <motion.div className="rounded-lg border p-2.5 flex items-center gap-2.5"
      style={{ borderColor: 'rgba(255,255,255,0.06)', background: PULSE_CARD }}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {post.clientLogo ? (
        <img src={post.clientLogo} alt="" className="w-7 h-7 rounded object-contain flex-shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded flex items-center justify-center text-[8px] font-bold flex-shrink-0"
          style={{ backgroundColor: post.clientColor ? `hsl(${post.clientColor} / 0.12)` : 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)' }}>
          {getInitials(post.clientName)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-white/70 truncate">{post.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[9px] text-white/25">{post.clientName}</span>
          <span className="text-[9px] uppercase font-bold px-1 py-0.5 rounded"
            style={{ backgroundColor: `${st.color}15`, color: st.color }}>{st.label}</span>
        </div>
      </div>
      <div className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/5 text-white/25">
        {post.contentType}
      </div>
    </motion.div>
  );
}

/* ─── YouTube Player (com controle remoto via postMessage) ────────────── */
function YouTubePlayer({ url, command }: { url: string; command: TvRemoteCommand | null }) {
  const [unmuted, setUnmuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const embedUrl = useMemo(() => {
    if (!url) return '';
    const mute = unmuted ? 0 : 1;
    const listMatch = url.match(/[?&]list=([^&]+)/);
    if (listMatch) return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}&autoplay=1&mute=${mute}&loop=1&controls=1&showinfo=0&rel=0&enablejsapi=1`;
    const videoMatch = url.match(/(?:watch\?v=|youtu\.be\/|embed\/)([^&?]+)/);
    if (videoMatch) return `https://www.youtube.com/embed/${videoMatch[1]}?autoplay=1&mute=${mute}&loop=1&controls=1&showinfo=0&rel=0&enablejsapi=1&playlist=${videoMatch[1]}`;
    return '';
  }, [url, unmuted]);

  const sendYTCommand = useCallback((func: string, args: any[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }, []);

  // Handle remote commands
  useEffect(() => {
    if (!command) return;
    switch (command.action) {
      case 'play': sendYTCommand('playVideo'); setIsPlaying(true); break;
      case 'pause': sendYTCommand('pauseVideo'); setIsPlaying(false); break;
      case 'next': sendYTCommand('nextVideo'); break;
      case 'mute': sendYTCommand('mute'); setUnmuted(false); break;
      case 'unmute': sendYTCommand('unMute'); setUnmuted(true); break;
    }
  }, [command, sendYTCommand]);

  // Handle interaction to start playing if needed
  const handleInteraction = () => {
    if (!unmuted) {
      setUnmuted(true);
      sendYTCommand('unMute');
      sendYTCommand('playVideo');
      setIsPlaying(true);
    }
  };

  if (!embedUrl) return null;
  return (
    <motion.div 
      className="rounded-xl overflow-hidden border cursor-pointer group relative" 
      style={{ borderColor: `${PULSE_ORANGE}22` }}
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.5 }}
      onClick={handleInteraction}
    >
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <Music className="w-3 h-3" style={{ color: PULSE_ORANGE }} />
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-[0.15em]">Pulse Radio</span>
        <motion.div className="flex gap-0.5 ml-1" animate={{ opacity: isPlaying ? [0.4, 1, 0.4] : 0.4 }} transition={{ duration: 1.5, repeat: Infinity }}>
          {[3, 5, 2, 4, 3].map((h, i) => (
            <motion.div key={i} className="w-[2px] rounded-full" style={{ backgroundColor: PULSE_ORANGE, height: h * 2 }}
              animate={isPlaying ? { height: [h * 2, h * 3.5, h * 2] } : { height: h * 2 }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }} />
          ))}
        </motion.div>
        <div className="flex-1" />
        <button onClick={(e) => { e.stopPropagation(); setUnmuted(prev => !prev); }}
          className="flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full transition-all hover:scale-105"
          style={{ backgroundColor: `${PULSE_ORANGE}1a`, color: PULSE_ORANGE, border: `1px solid ${PULSE_ORANGE}33` }}>
          {unmuted ? '🔊 Ativado' : '🔇 Mudo'}
        </button>
      </div>

      <div className="aspect-video relative">
        <iframe 
          ref={iframeRef} 
          key={unmuted ? 'unmuted' : 'muted'} 
          src={embedUrl} 
          className="w-full h-full" 
          allow="autoplay; encrypted-media" 
          allowFullScreen 
          style={{ border: 0 }} 
        />
        
        {!unmuted && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 transition-colors group-hover:bg-black/40">
            <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Play className="w-6 h-6 text-white fill-white ml-1" />
            </div>
            <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">Clique para ativar o áudio</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Playlist Editor ───────────────────────────────────── */
function PlaylistEditor({ url, onSave }: { url: string; onSave: (url: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);

  if (!editing) {
    return (
      <button onClick={() => { setDraft(url); setEditing(true); }}
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg transition-all hover:scale-105"
        style={{ backgroundColor: `${PULSE_ORANGE}18`, color: PULSE_ORANGE, border: `1px solid ${PULSE_ORANGE}33` }}>
        <LinkIcon className="w-3 h-3" />
        <span>{url ? 'Trocar' : 'Adicionar Link'}</span>
      </button>
    );
  }

  return (
    <motion.div className="flex items-center gap-2" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
      <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
        placeholder="Link da playlist YouTube"
        className="text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-white/80 placeholder:text-white/20 w-72 outline-none focus:border-orange-500/50"
        autoFocus
        onKeyDown={e => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
      />
      <motion.button onClick={() => { onSave(draft); setEditing(false); }}
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        className="flex items-center gap-1 text-[9px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all"
        style={{ background: `linear-gradient(135deg, ${PULSE_ORANGE}, ${PULSE_ORANGE}cc)`, color: '#fff', boxShadow: `0 2px 8px ${PULSE_ORANGE}40` }}>
        <Save className="w-3 h-3" />
        Salvar como padrão
      </motion.button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-white/30 hover:text-white/60">✕</button>
    </motion.div>
  );
}

/* ─── Seasonal Banner ───────────────────────────────────── */
function SeasonalBanner({ slides }: { slides: SeasonalSlide[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const iv = setInterval(() => setCurrent(p => (p + 1) % slides.length), 8000);
    return () => clearInterval(iv);
  }, [slides.length]);

  if (!slides.length) return null;

  const urgencyConfig = {
    high:   { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: Flame, label: 'URGENTE', glow: 'rgba(239,68,68,0.25)' },
    medium: { color: PULSE_ORANGE, bg: `${PULSE_ORANGE}14`, icon: AlertTriangle, label: 'EM BREVE', glow: `${PULSE_ORANGE}28` },
    low:    { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   icon: Gift, label: 'PLANEJE-SE', glow: 'rgba(34,197,94,0.18)' },
  };

  return (
    <motion.div className="relative overflow-hidden rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-orange-500/20" />

      <div className="flex items-center gap-3 px-5 pt-3 pb-1.5">
        <div>
          <Sparkles className="w-3.5 h-3.5" style={{ color: PULSE_ORANGE }} />
        </div>
        <h2 className="text-[10px] font-bold text-white/45 uppercase tracking-[0.2em]" style={{ fontFamily: SPACE }}>Datas Sazonais</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-white/8 to-transparent" />
        <div className="flex gap-1">
          {slides.map((_, i) => (
            <motion.div key={i} className="rounded-full cursor-pointer"
              style={{ width: current === i ? 14 : 5, height: 5, backgroundColor: current === i ? PULSE_ORANGE : 'rgba(255,255,255,0.12)' }}
              animate={{ width: current === i ? 14 : 5 }} transition={{ duration: 0.2 }}
              onClick={() => setCurrent(i)} />
          ))}
        </div>
      </div>

      <div className="relative h-[120px] px-4 pb-2">
        <AnimatePresence mode="wait">
          {slides.map((slide, i) => {
            if (i !== current) return null;
            const urg = urgencyConfig[slide.urgency];
            const UrgIcon = urg.icon;

            return (
              <motion.div key={`${slide.label}-${i}`} className="absolute inset-x-5 top-0 bottom-3 flex gap-4"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                style={{ willChange: 'transform, opacity' }}
                transition={{ duration: 0.3, ease: 'easeOut' }}>
                {/* Countdown */}
                <motion.div className="flex-shrink-0 w-[110px] rounded-xl flex flex-col items-center justify-center"
                  style={{ background: urg.bg, border: `1px solid ${urg.color}28` }}>
                  <span className="text-3xl font-black tabular-nums" style={{ color: urg.color, fontFamily: SPACE }}>
                    {slide.daysUntil}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: `${urg.color}bb` }}>
                    {slide.daysUntil === 1 ? 'dia' : 'dias'}
                  </span>
                  <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full" style={{ backgroundColor: `${urg.color}1a` }}>
                    <UrgIcon className="w-2.5 h-2.5" style={{ color: urg.color }} />
                    <span className="text-[8px] font-bold uppercase" style={{ color: urg.color }}>{urg.label}</span>
                  </div>
                </motion.div>

                {/* Info */}
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <h3 className="text-lg font-bold text-white truncate" style={{ fontFamily: SPACE }}>{slide.label}</h3>
                  <p className="text-[10px] text-white/35 mt-0.5 font-mono">
                    📅 {new Date(slide.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                  </p>
                  {slide.suggestion && (
                    <p className="text-[10px] text-white/40 mt-1.5 line-clamp-2">💡 {slide.suggestion}</p>
                  )}
                </div>

                {/* Clients */}
                <div className="flex-shrink-0 flex flex-col justify-center gap-1.5 w-[340px]">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-white/20 mb-0.5">Clientes do nicho</span>
                  <div className="grid grid-cols-2 gap-2">
                    {slide.clients.slice(0, 4).map((c, ci) => (
                      <motion.div key={`${c.name}-${ci}`} className="rounded-xl px-2.5 py-2 flex items-center gap-2"
                        style={{ background: `${urg.color}0c`, border: `1px solid ${urg.color}1a` }}
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}>
                        {c.logoUrl ? (
                          <div className="w-8 h-8 rounded-lg overflow-hidden border flex items-center justify-center"
                            style={{ borderColor: c.color ? `hsl(${c.color} / 0.26)` : `${urg.color}33`, backgroundColor: c.color ? `hsl(${c.color} / 0.12)` : `${urg.color}14` }}>
                            <img src={c.logoUrl} alt={c.name} className="w-full h-full object-contain p-1" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-bold"
                            style={{ backgroundColor: c.color ? `hsl(${c.color} / 0.14)` : `${urg.color}14`, color: 'rgba(255,255,255,0.6)' }}>
                            {getInitials(c.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-white/70 truncate">{c.name}</p>
                          <p className="text-[8px] uppercase tracking-wider text-white/30 truncate">{c.niche.replace(/_/g, ' ')}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {slide.clients.length > 4 && <span className="text-[9px] text-white/20 px-1">+{slide.clients.length - 4} clientes relacionados</span>}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN TV DASHBOARD
   ═══════════════════════════════════════════════════════════ */
export default function TvDashboard() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [editingPipeline, setEditingPipeline] = useState<EditingTask[]>([]);
  const [designPipeline, setDesignPipeline] = useState<DesignActivityTask[]>([]);
  const [todayPosts, setTodayPosts] = useState<ScheduledPost[]>([]);
  const [activeRecordingIds, setActiveRecordingIds] = useState<string[]>([]);
  const [connected, setConnected] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [seasonalSlides, setSeasonalSlides] = useState<SeasonalSlide[]>([]);
  const [visibility, setVisibility] = useState<Record<VisibilityKey, boolean>>({
    show_radio: true, show_schedule: true, show_pipeline: true,
    show_banners: true, show_team: true, show_posts: true,
  });
  const [latestCommand, setLatestCommand] = useState<TvRemoteCommand | null>(null);
  const [alert, setAlert] = useState<{ message: string; tone: string } | null>(null);
  const lastCommandIdRef = useRef<number>(0);
  const isFirstLoad = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${VPS}/tv-dashboard`);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      setMembers(data.members || []);
      setSchedule(data.todaySchedule || []);
      setEditingPipeline(data.editingPipeline || []);
      setDesignPipeline(data.designPipeline || []);
      setActiveRecordingIds(data.activeRecordingIds || []);
      setTodayPosts(data.todayPosts || []);
      if (Array.isArray(data.seasonalSlides) && data.seasonalSlides.length > 0) {
        setSeasonalSlides(data.seasonalSlides);
      }
      setConnected(true);
      isFirstLoad.current = false;
    } catch {
      isFirstLoad.current = false;
      setConnected(false);
    }
  }, []);

  const fetchPlaylist = useCallback(async () => {
    // Always load from localStorage first for instant playback
    const saved = localStorage.getItem('pulse_radio_url');
    if (saved) setPlaylistUrl(saved);
    try {
      const res = await fetch(`${VPS}/data/tv_settings?key=eq.youtube_playlist_url`);
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0 && rows[0].value) {
          setPlaylistUrl(rows[0].value);
          localStorage.setItem('pulse_radio_url', rows[0].value);
        }
      }
    } catch {}
  }, []);

  const savePlaylist = useCallback(async (url: string) => {
    setPlaylistUrl(url);
    localStorage.setItem('pulse_radio_url', url);
    try {
      await fetch(`${VPS}/data/tv_settings?key=eq.youtube_playlist_url`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: url, updated_at: new Date().toISOString() }),
      });
    } catch {}
  }, []);

  const fetchSeasonal = useCallback(async () => {
    try {
      // Try edge function first, then fallback
      let alerts = await fetchAISeasonalAlerts();
      
      // If edge function returned nothing, try VPS endpoint
      if (!alerts.length) {
        try {
          const res = await fetch(`${VPS}/seasonal-alerts`);
          if (res.ok) {
            const data = await res.json();
            alerts = data.alerts || [];
          }
        } catch {}
      }

      if (!alerts.length) return;
      const dateMap = new Map<string, SeasonalSlide>();
      for (const alert of alerts) {
        for (const d of alert.dates) {
          const key = `${d.label}|${d.date}`;
          if (!dateMap.has(key)) {
            dateMap.set(key, { label: d.label, date: d.date, daysUntil: d.days_until, urgency: d.urgency, suggestion: d.suggestion, clients: [] });
          }
          const entry = dateMap.get(key)!;
          if (!entry.clients.find(c => c.name === alert.clientName)) {
            entry.clients.push({ name: alert.clientName, niche: alert.niche || '', logoUrl: alert.clientLogo || null, color: alert.clientColor || null });
          }
        }
      }
      setSeasonalSlides(Array.from(dateMap.values()).sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 15));
    } catch (e) { console.error('Seasonal fetch error:', e); }
  }, []);

  // Apply visibility settings + load latest command
  const applySettings = useCallback((settings: Record<string, string>) => {
    setVisibility(prev => {
      const next = { ...prev };
      for (const k of VISIBILITY_KEYS) {
        if (settings[k] !== undefined) next[k] = settings[k] !== 'false';
      }
      return next;
    });
    if (settings.youtube_playlist_url) {
      setPlaylistUrl(settings.youtube_playlist_url);
      localStorage.setItem('pulse_radio_url', settings.youtube_playlist_url);
    }
  }, []);

  // Execute remote command
  const executeCommand = useCallback((cmd: TvRemoteCommand) => {
    if (cmd.id <= lastCommandIdRef.current) return;
    lastCommandIdRef.current = cmd.id;
    setLatestCommand(cmd);
    if (cmd.action === 'set_playlist' && cmd.payload?.url) {
      setPlaylistUrl(cmd.payload.url);
      localStorage.setItem('pulse_radio_url', cmd.payload.url);
    } else if (cmd.action === 'set_visibility' && cmd.payload?.key) {
      setVisibility(prev => ({ ...prev, [cmd.payload!.key]: !!cmd.payload!.visible }));
    } else if (cmd.action === 'show_alert' && cmd.payload?.message) {
      setAlert({ message: cmd.payload.message, tone: cmd.payload.tone || 'info' });
      const dur = cmd.payload.durationMs || 15000;
      window.setTimeout(() => setAlert(null), dur);
    } else if (cmd.action === 'clear_alert') {
      setAlert(null);
    } else if (cmd.action === 'reload') {
      window.location.reload();
    }
  }, []);

  // Poll commands + settings
  const pollRemote = useCallback(async () => {
    const [settings, cmd] = await Promise.all([fetchTvSettings(), fetchLatestCommand()]);
    applySettings(settings);
    if (cmd) executeCommand(cmd);
  }, [applySettings, executeCommand]);

  // Listen for sync broadcasts (same browser, instant)
  useEffect(() => {
    let bc1: BroadcastChannel | null = null;
    let bc2: BroadcastChannel | null = null;
    try {
      bc1 = new BroadcastChannel('pulse_tv_sync');
      bc1.onmessage = (event) => {
        if (event.data?.action === 'reload') {
          if (event.data.playlistUrl) {
            localStorage.setItem('pulse_radio_url', event.data.playlistUrl);
          }
          window.location.reload();
        }
      };
      bc2 = new BroadcastChannel('pulse_tv_remote');
      bc2.onmessage = (event) => {
        if (event.data && typeof event.data === 'object') {
          executeCommand(event.data as TvRemoteCommand);
        }
      };
    } catch {
      // ignore
    }
    return () => { try { bc1?.close(); bc2?.close(); } catch {} };
  }, [executeCommand]);

  useEffect(() => {
    fetchData(); fetchPlaylist(); fetchSeasonal(); pollRemote();
    const iv = setInterval(fetchData, 10_000);
    const ivCmd = setInterval(pollRemote, 2_500);
    return () => { clearInterval(iv); clearInterval(ivCmd); };
  }, [fetchData, fetchPlaylist, fetchSeasonal, pollRemote]);

  useEffect(() => {
    const iv = window.setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const onlineMembers = members.filter(m => m.isOnline);
  const offlineMembers = members.filter(m => !m.isOnline);
  const designerMembers = members.filter(m => m.role === 'designer');
  const hasAnyData = members.length > 0 || schedule.length > 0 || editingPipeline.length > 0 || designPipeline.length > 0 || todayPosts.length > 0 || seasonalSlides.length > 0;
  const timeStr = clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = clock.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="h-screen text-white overflow-hidden relative flex flex-col p-2" style={{ fontFamily: `${SPACE}, 'Inter', sans-serif`, backgroundColor: PULSE_DARK }}>
      <FloatingParticles />
      <div className="fixed inset-0 pointer-events-none z-0" style={{ background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${PULSE_ORANGE}06, transparent 70%)` }} />

      <div className="relative z-10 px-4 py-3 flex flex-col flex-1 min-h-0">
        {/* ─── Header ───────────────────────────────────── */}
        <motion.div className="flex items-center justify-between mb-3 flex-shrink-0"
          initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${PULSE_ORANGE}, hsl(16, 82%, 40%))`, boxShadow: `0 4px 15px ${PULSE_ORANGE}40` }}>
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight" style={{ color: PULSE_ORANGE }}>PULSE</h1>
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/25 font-medium -mt-0.5">Growth Marketing</p>
              </div>
            </div>
            <div className="h-8 w-px bg-white/8" />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/8 bg-white/3">
              <TrendingUp className="w-3 h-3" style={{ color: PULSE_ORANGE }} />
              <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Painel Operacional</span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <StatusSummary members={members} />
            <div className="h-7 w-px bg-white/8" />
            <motion.div className="flex items-center gap-1.5" animate={{ opacity: connected ? 1 : 0.5 }}>
              {connected ? (
                <div>
                  <Wifi className="w-3.5 h-3.5 text-green-400" />
                </div>
              ) : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
              <span className="text-[9px] text-white/25 font-medium">{connected ? 'LIVE' : 'OFF'}</span>
            </motion.div>
            <div className="text-right">
              <div className="text-xl font-mono font-bold tabular-nums text-white/85">{timeStr}</div>
              <div className="text-[10px] text-white/25 capitalize">{dateStr}</div>
            </div>
          </div>
        </motion.div>

        {/* ─── Remote Alert Banner ──────────────────────── */}
        <AnimatePresence>
          {alert && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="mb-3 flex-shrink-0 relative overflow-hidden rounded-2xl border-2"
              style={{
                borderColor: alert.tone === 'warning' ? '#ef4444' : alert.tone === 'success' ? '#22c55e' : PULSE_ORANGE,
                background: `linear-gradient(135deg, ${alert.tone === 'warning' ? 'rgba(239,68,68,0.18)' : alert.tone === 'success' ? 'rgba(34,197,94,0.18)' : `${PULSE_ORANGE}30`}, transparent 80%)`,
                boxShadow: `0 10px 30px rgba(0,0,0,0.5)`,
              }}
            >
              <div className="absolute inset-0 bg-white/5 pointer-events-none" />
              <div className="relative px-6 py-4 flex items-center gap-4">
                <div>
                  <Megaphone className="w-7 h-7" style={{ color: alert.tone === 'warning' ? '#ef4444' : alert.tone === 'success' ? '#22c55e' : PULSE_ORANGE }} />
                </div>
                <p className="text-lg font-bold text-white flex-1" style={{ fontFamily: SPACE }}>{alert.message}</p>
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">Mensagem ao vivo</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Seasonal Banner ──────────────────────────── */}
        {visibility.show_banners && seasonalSlides.length > 0 && (
          <div className="mb-3 flex-shrink-0">
            <SeasonalBanner slides={seasonalSlides} />
          </div>
        )}

        {/* ─── Main Grid: 3 columns ────────────────────── */}
        <div className="grid grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden">
          {/* LEFT COLUMN: Team Online + Offline */}
          <div className="col-span-3 space-y-2.5 overflow-y-auto scrollbar-hide pr-1">
            {/* Online */}
            {visibility.show_team && (
              <div>
                <SectionHeader icon={() => (
                  <motion.div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }}
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                )} title="Equipe Online" badge={`${onlineMembers.length} membros`} />
                <div className="grid grid-cols-1 gap-2">
                  <AnimatePresence>
                    {onlineMembers.map(m => <MemberCard key={m.id} member={m} />)}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Pulse Radio */}
            {visibility.show_radio && (
              <div>
                <SectionHeader icon={Music} title="Pulse Radio">
                  <PlaylistEditor url={playlistUrl} onSave={savePlaylist} />
                </SectionHeader>
                {playlistUrl ? (
                  <YouTubePlayer url={playlistUrl} command={latestCommand} />
                ) : (
                  <div className="rounded-xl border border-dashed border-white/8 p-3 text-center" style={{ background: 'rgba(255,255,255,0.015)' }}>
                    <Music className="w-6 h-6 mx-auto mb-1.5" style={{ color: `${PULSE_ORANGE}28` }} />
                    <p className="text-[10px] text-white/20">Adicione um link acima</p>
                  </div>
                )}
              </div>
            )}

            {visibility.show_team && offlineMembers.length > 0 && (
              <div>
                <SectionHeader icon={() => <div className="w-2.5 h-2.5 rounded-full bg-white/12" />} title="Offline" iconColor="#6b7280" />
                <div className="grid grid-cols-2 gap-2">
                  {offlineMembers.map(m => {
                    const config = ROLE_CONFIG[m.role] || ROLE_CONFIG.admin;
                    return (
                      <div key={m.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 border border-white/4"
                        style={{ background: 'rgba(255,255,255,0.015)' }}>
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" className="w-6 h-6 rounded object-cover grayscale opacity-35" />
                        ) : (
                          <div className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold bg-white/4 text-white/20">
                            {getInitials(m.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[11px] text-white/30 truncate font-medium">{m.name}</p>
                          <p className="text-[8px] uppercase tracking-wider font-bold" style={{ color: `${config.color}44` }}>{config.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* CENTER COLUMN: Schedule + Posts */}
          <div className="col-span-5 space-y-2.5 overflow-y-auto scrollbar-hide px-1">
            {/* Schedule */}
            {visibility.show_schedule && (
              <div className="relative">
                <SectionHeader icon={CalendarDays} title="Gravações do Dia" badge={`${schedule.length} gravações`} />
                {schedule.length > 0 ? (
                  <div className="relative" style={{ height: `${TIMELINE_HEIGHT}px` }}>
                    {/* Linha do Tempo (Clock Marker) — pixel-aligned to the timeline */}
                    <div className="absolute inset-0 pointer-events-none z-[100] hidden sm:block">
                      <TimeMarker />
                    </div>

                    {(() => {
                      const items: React.ReactNode[] = [];
                      const addedBuffers = new Set<string>();

                      // Initial Prep block: 08:00 - 08:30
                      const initialPrepStartPx = (8 * 60 - OPERATIONAL_START) * MINUTE_HEIGHT;
                      const initialPrepHeightPx = 30 * MINUTE_HEIGHT;
                      items.push(
                        <div key="prep-08-break" className="absolute left-0 right-0 pr-1" style={{ top: `${initialPrepStartPx}px`, height: `${initialPrepHeightPx}px` }}>
                          <BufferCard startTime="08:00" type="prep" height={initialPrepHeightPx} />
                        </div>
                      );
                      addedBuffers.add("08:00");

                      // Lunch block: fixed 12:00 - 14:00
                      const lunchStartPx = (12 * 60 - OPERATIONAL_START) * MINUTE_HEIGHT;
                      const lunchHeightPx = 120 * MINUTE_HEIGHT;
                      items.push(
                        <div key="lunch-break" className="absolute left-0 right-0" style={{ top: `${lunchStartPx}px`, height: `${lunchHeightPx}px` }}>
                          <LunchCard startTime="12:00 - 14:00" height={lunchHeightPx} />
                        </div>
                      );

                      // Fixed 14:00 - 14:30 Prep block
                      const prep14StartPx = (14 * 60 - OPERATIONAL_START) * MINUTE_HEIGHT;
                      const prep14HeightPx = 30 * MINUTE_HEIGHT;
                      items.push(
                        <div key="prep-14-break" className="absolute left-0 right-0 pr-1" style={{ top: `${prep14StartPx}px`, height: `${prep14HeightPx}px` }}>
                          <BufferCard startTime="14:00" type="prep" height={prep14HeightPx} />
                        </div>
                      );
                      addedBuffers.add("14:00");

                      // Fixed 16:00 - 16:30 Prep block
                      const prep16StartPx = (16 * 60 - OPERATIONAL_START) * MINUTE_HEIGHT;
                      const prep16HeightPx = 30 * MINUTE_HEIGHT;
                      items.push(
                        <div key="prep-16-break" className="absolute left-0 right-0 pr-1" style={{ top: `${prep16StartPx}px`, height: `${prep16HeightPx}px` }}>
                          <BufferCard startTime="16:00" type="prep" height={prep16HeightPx} />
                        </div>
                      );
                      addedBuffers.add("16:00");

                      const timelineSchedule = schedule.filter(item => {
                        const [h, m] = item.startTime.split(':').map(Number);
                        const t = h * 60 + m;
                        return t >= OPERATIONAL_START && t < OPERATIONAL_END && !(t >= 12 * 60 && t < 14 * 60);
                      });

                      // Group by startTime to handle simultaneous recordings (different videomakers)
                      const groupedSchedule = timelineSchedule.reduce((acc, item) => {
                        const key = item.startTime;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(item);
                        return acc;
                      }, {} as Record<string, ScheduleItem[]>);

                      Object.entries(groupedSchedule).forEach(([startTime, itemsGroup]) => {
                        const [h, m] = startTime.split(':').map(Number);
                        const startMin = h * 60 + m;

                        // Use duration of first item in group
                        let duration = 90;
                        const firstItem = itemsGroup[0];
                        if (firstItem.endTime) {
                          const [eh, em] = firstItem.endTime.split(':').map(Number);
                          const endMin = eh * 60 + em;
                          if (endMin > startMin) duration = endMin - startMin;
                        }

                        const topPx = (startMin - OPERATIONAL_START) * MINUTE_HEIGHT;
                        const heightPx = duration * MINUTE_HEIGHT;

                        if (itemsGroup.length > 1) {
                          items.push(
                            <div key={`group-${startTime}`} className="absolute left-0 right-0 pr-1" style={{ top: `${topPx}px`, height: `${heightPx}px` }}>
                              <RotatingScheduleCard 
                                items={itemsGroup} 
                                isLive={(id) => activeRecordingIds.includes(id) || itemsGroup.some(it => it.id === id && it.status === 'recording')} 
                                height={heightPx} 
                              />
                            </div>
                          );
                        } else {
                          items.push(
                            <div key={firstItem.id} className="absolute left-0 right-0 pr-1" style={{ top: `${topPx}px`, height: `${heightPx}px` }}>
                              <ScheduleCard item={firstItem} isLive={activeRecordingIds.includes(firstItem.id) || firstItem.status === 'recording'} height={heightPx} />
                            </div>
                          );
                        }

                        // Pulse buffer right after this recording (if at least one in group is not cancelled)
                        const hasActiveInGroup = itemsGroup.some(it => it.status !== 'cancelada');
                        if (hasActiveInGroup) {
                          const bufferStart = startMin + duration;
                          const bufferEnd = bufferStart + 30;
                          const bufferTime = `${String(Math.floor(bufferStart / 60)).padStart(2, '0')}:${String(bufferStart % 60).padStart(2, '0')}`;
                          const overlapsLunch = bufferStart < 14 * 60 && bufferEnd > 12 * 60;
                          if (!overlapsLunch && bufferEnd <= OPERATIONAL_END && !addedBuffers.has(bufferTime)) {
                            addedBuffers.add(bufferTime);
                            const isPrep = bufferTime === '14:00' || bufferTime === '16:00';
                            const bTop = (bufferStart - OPERATIONAL_START) * MINUTE_HEIGHT;
                            const bH = 30 * MINUTE_HEIGHT;
                            items.push(
                              <div key={`buffer-${bufferTime}`} className="absolute left-0 right-0 pr-1" style={{ top: `${bTop}px`, height: `${bH}px` }}>
                                <BufferCard startTime={bufferTime} type={isPrep ? 'prep' : 'pulse'} height={bH} />
                              </div>
                            );
                          }
                        }
                      });


                      return items;
                    })()}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/8 p-3 text-center" style={{ background: 'rgba(255,255,255,0.015)' }}>
                    <Camera className="w-6 h-6 mx-auto mb-1.5 text-white/15" />
                    <p className="text-[10px] text-white/20">Nenhuma gravação hoje</p>
                  </div>
                )}
              </div>
            )}


            {/* Scheduled Posts */}
            {visibility.show_posts && (
              <div>
                <SectionHeader icon={Send} iconColor="#3b82f6" title="Posts do Dia" badge={`${todayPosts.length} posts`} />
                {todayPosts.length > 0 ? (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {todayPosts.map(post => <PostCard key={post.id} post={post} />)}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/8 p-3 text-center" style={{ background: 'rgba(255,255,255,0.015)' }}>
                    <Send className="w-6 h-6 mx-auto mb-1.5 text-white/15" />
                    <p className="text-[10px] text-white/20">Nenhum post agendado hoje</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Designer + Editing */}
          <div className="col-span-4 space-y-2.5 overflow-y-auto scrollbar-hide pl-1">
            {visibility.show_pipeline && (
              <>
                <div>
                  <SectionHeader icon={Palette} iconColor="hsl(330 85% 62%)" title="Designer" badge={designPipeline.length > 0 ? `${designPipeline.length} artes` : `${designerMembers.length} designers`} />
                  {designPipeline.length > 0 ? (
                    <div className="space-y-2">
                      <AnimatePresence>
                        {designPipeline.map(task => <DesignActivityCard key={task.id} task={task} />)}
                      </AnimatePresence>
                    </div>
                  ) : designerMembers.length > 0 ? (
                    <div className="space-y-2">
                      {designerMembers.map(member => <MemberCard key={member.id} member={member} />)}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/8 p-3 text-center" style={{ background: 'rgba(255,255,255,0.015)' }}>
                      <Palette className="w-6 h-6 mx-auto mb-1.5 text-white/15" />
                      <p className="text-[10px] text-white/20">Nenhuma designer em atividade agora</p>
                    </div>
                  )}
                </div>

                <div>
                  <SectionHeader icon={Film} iconColor="#8b5cf6" title="Pós-Produção" badge={`${editingPipeline.length} vídeos`} />
                  {editingPipeline.length > 0 ? (
                    <div className="space-y-2">
                      <AnimatePresence>
                        {editingPipeline.map(task => <EditingCard key={task.id} task={task} />)}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/8 p-3 text-center" style={{ background: 'rgba(255,255,255,0.015)' }}>
                      <Film className="w-6 h-6 mx-auto mb-1.5 text-white/15" />
                      <p className="text-[10px] text-white/20">Nenhum vídeo em edição</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Empty state ──────────────────────────────── */}
        {!hasAnyData && (
          <motion.div className="flex flex-col items-center justify-center h-[60vh] gap-5"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
            <motion.div
              animate={connected || isFirstLoad.current ? { rotate: [0, 10, -10, 0], y: [0, -8, 0] } : { opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              {connected || isFirstLoad.current ? (
                <Rocket className="w-14 h-14" style={{ color: `${PULSE_ORANGE}40` }} />
              ) : (
                <WifiOff className="w-14 h-14 text-red-400/70" />
              )}
            </motion.div>
            <p className="text-white/20 text-base font-medium" style={{ fontFamily: SPACE }}>
              {isFirstLoad.current ? 'Carregando painel operacional...' : connected ? 'Nenhuma atividade no momento.' : 'Não foi possível carregar o painel operacional.'}
            </p>
            {isFirstLoad.current ? (
              <motion.div className="w-28 h-1 rounded-full overflow-hidden bg-white/5">
                <motion.div className="h-full rounded-full" style={{ backgroundColor: PULSE_ORANGE }}
                  animate={{ x: ['-100%', '100%'] }} transition={{ duration: 1.5, repeat: Infinity }} />
              </motion.div>
            ) : (
              <p className="text-[11px] text-white/30">{connected ? 'Aguardando novos dados da operação.' : 'Verifique a API da VPS e recarregue a tela.'}</p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Clock, Coffee, Camera, Film, Palette, Megaphone, Image, Users, Wifi, WifiOff, Activity } from 'lucide-react';

const VPS = 'https://agenciapulse.tech/api';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
  isOnline: boolean;
  activity?: string;
  clientName?: string;
  taskTitle?: string;
  timeOnTask?: number; // seconds
  taskType?: string;
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: any; gradient: string }> = {
  admin:          { label: 'Administração',  color: '#f59e0b', icon: Monitor,   gradient: 'from-amber-500/20 to-amber-600/10' },
  social_media:   { label: 'Social Media',   color: '#22c55e', icon: Users,     gradient: 'from-green-500/20 to-green-600/10' },
  videomaker:     { label: 'Videomaker',      color: '#3b82f6', icon: Camera,    gradient: 'from-blue-500/20 to-blue-600/10' },
  editor:         { label: 'Editor',          color: '#8b5cf6', icon: Film,      gradient: 'from-violet-500/20 to-violet-600/10' },
  designer:       { label: 'Designer',        color: '#f97316', icon: Palette,   gradient: 'from-orange-500/20 to-orange-600/10' },
  fotografo:      { label: 'Fotógrafo',       color: '#ec4899', icon: Image,     gradient: 'from-pink-500/20 to-pink-600/10' },
  endomarketing:  { label: 'Endomarketing',   color: '#06b6d4', icon: Megaphone, gradient: 'from-cyan-500/20 to-cyan-600/10' },
  parceiro:       { label: 'Parceiro',        color: '#14b8a6', icon: Megaphone, gradient: 'from-teal-500/20 to-teal-600/10' },
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

function MemberCard({ member }: { member: TeamMember }) {
  const config = ROLE_CONFIG[member.role] || ROLE_CONFIG.admin;
  const Icon = config.icon;
  const activityLabel = member.activity ? (ACTIVITY_LABELS[member.activity] || member.activity) : '☕ Disponível';
  const isWorking = member.activity && member.activity !== 'idle' && member.activity !== 'paused';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`relative rounded-2xl border overflow-hidden bg-gradient-to-br ${config.gradient}`}
      style={{ borderColor: `${config.color}44` }}
    >
      {/* Pulse glow when working */}
      {isWorking && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          animate={{ opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ boxShadow: `inset 0 0 30px ${config.color}33` }}
        />
      )}

      <div className="p-4 flex items-start gap-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt={member.name} className="w-16 h-16 rounded-xl object-cover border-2" style={{ borderColor: config.color }} />
          ) : (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold border-2" style={{ borderColor: config.color, backgroundColor: `${config.color}22`, color: config.color }}>
              {getInitials(member.name)}
            </div>
          )}
          {/* Online indicator */}
          <motion.div
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0f0f17]"
            style={{ backgroundColor: member.isOnline ? '#22c55e' : '#6b7280' }}
            animate={member.isOnline ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white truncate">{member.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
            <span className="text-xs font-medium" style={{ color: config.color }}>{config.label}</span>
          </div>

          {/* Activity */}
          <div className="mt-2 flex items-center gap-2">
            <span className={`text-sm font-semibold ${isWorking ? 'text-white' : 'text-white/50'}`}>
              {activityLabel}
            </span>
          </div>

          {/* Task info */}
          {member.taskTitle && (
            <div className="mt-1.5 bg-black/30 rounded-lg px-3 py-1.5">
              <p className="text-xs text-white/70 truncate">📌 {member.taskTitle}</p>
              {member.clientName && (
                <p className="text-[11px] text-white/50 truncate">🏢 {member.clientName}</p>
              )}
            </div>
          )}

          {/* Timer */}
          {isWorking && member.timeOnTask != null && member.timeOnTask > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-white/60" />
              <span className="text-sm font-mono font-bold text-white/80">
                {formatDuration(member.timeOnTask)}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatusSummary({ members }: { members: TeamMember[] }) {
  const online = members.filter(m => m.isOnline).length;
  const working = members.filter(m => m.isOnline && m.activity && m.activity !== 'idle' && m.activity !== 'paused').length;
  const idle = online - working;

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-green-500" />
        <span className="text-sm text-white/70">Online: <strong className="text-white">{online}</strong></span>
      </div>
      <div className="flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-blue-400" />
        <span className="text-sm text-white/70">Trabalhando: <strong className="text-white">{working}</strong></span>
      </div>
      <div className="flex items-center gap-2">
        <Coffee className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-sm text-white/70">Disponível: <strong className="text-white">{idle}</strong></span>
      </div>
    </div>
  );
}

export default function TvDashboard() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [connected, setConnected] = useState(true);
  const [clock, setClock] = useState(new Date());
  const timerRef = useRef<number>();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${VPS}/tv-dashboard`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setMembers(data.members || []);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 10_000); // Poll every 10s
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

  const timeStr = clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = clock.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white p-6 overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="text-3xl font-black tracking-tight bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            PULSE GROWTH
          </div>
          <div className="h-8 w-px bg-white/20" />
          <span className="text-sm text-white/50 uppercase tracking-widest">Painel da Equipe</span>
        </div>

        <div className="flex items-center gap-6">
          <StatusSummary members={members} />
          <div className="h-8 w-px bg-white/20" />
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-bold tabular-nums">{timeStr}</div>
            <div className="text-xs text-white/40 capitalize">{dateStr}</div>
          </div>
        </div>
      </div>

      {/* Online members grid */}
      {onlineMembers.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <motion.div className="w-2.5 h-2.5 rounded-full bg-green-500" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Online Agora</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {onlineMembers.map(m => (
                <MemberCard key={m.id} member={m} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Offline members */}
      {offlineMembers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-gray-600" />
            <h2 className="text-sm font-bold text-white/30 uppercase tracking-widest">Offline</h2>
          </div>
          <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <AnimatePresence mode="popLayout">
              {offlineMembers.map(m => {
                const config = ROLE_CONFIG[m.role] || ROLE_CONFIG.admin;
                return (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2"
                  >
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt={m.name} className="w-8 h-8 rounded-lg object-cover grayscale opacity-60" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-white/10 text-white/40">
                        {getInitials(m.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-white/50 truncate">{m.name}</p>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: `${config.color}88` }}>{config.label}</p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Empty state */}
      {members.length === 0 && (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Monitor className="w-16 h-16 text-white/20" />
          <p className="text-white/30 text-lg">Carregando dados da equipe...</p>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { supabase as supabaseReal } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { UserRole } from '@/types';

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

interface TeamMember {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  lastSeenAt: string | null;
  isOnline: boolean;
  activity?: string; // current activity description
}

/* ─── Pixel character colors by role ─── */
const ROLE_STYLE: Record<string, { hair: string; shirt: string; action: string; deskItems: string }> = {
  admin:        { hair: '#2c1810', shirt: '#3b82f6', action: '💼', deskItems: '📊' },
  videomaker:   { hair: '#1a1a2e', shirt: '#22c55e', action: '🎬', deskItems: '📹' },
  editor:       { hair: '#4a2c17', shirt: '#8b5cf6', action: '🎞️', deskItems: '🖥️' },
  designer:     { hair: '#c0392b', shirt: '#f97316', action: '🎨', deskItems: '✏️' },
  social_media: { hair: '#2d1b69', shirt: '#ec4899', action: '📱', deskItems: '📲' },
  fotografo:    { hair: '#d4a574', shirt: '#eab308', action: '📷', deskItems: '🔦' },
  parceiro:     { hair: '#1e3a5f', shirt: '#14b8a6', action: '🤝', deskItems: '📋' },
  endomarketing:{ hair: '#5b2c6f', shirt: '#06b6d4', action: '📣', deskItems: '📢' },
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administração',
  videomaker: 'Estúdio',
  editor: 'Sala de Edição',
  designer: 'Ateliê',
  social_media: 'Mídia Social',
  fotografo: 'Estúdio Foto',
  parceiro: 'Parceiros',
  endomarketing: 'Endomarketing',
};

const ACTIVITY_LABELS: Record<string, string> = {
  gravando: '🔴 Gravando',
  edicao: '✂️ Editando',
  revisao: '👁️ Revisando',
  alteracao: '🔧 Alteração',
  aprovacao: '✅ Aprovando',
  designing: '🎨 Criando arte',
  idle: '',
};

/* ─── Pixel Art Character (pure CSS) ─── */
function PixelCharacter({ member, style, onClick }: { member: TeamMember; style: typeof ROLE_STYLE.admin; onClick: () => void }) {
  const isOnline = member.isOnline;
  
  return (
    <motion.div
      className="relative cursor-pointer group"
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Name tag */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap z-10">
        <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]' : 'bg-red-400/60'}`} />
        <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] tracking-wide">
          {member.name.split(' ')[0]}
        </span>
      </div>

      {/* Activity badge */}
      {isOnline && member.activity && ACTIVITY_LABELS[member.activity] && (
        <motion.div
          className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap z-20"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-[8px] bg-black/70 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
            {ACTIVITY_LABELS[member.activity]}
          </span>
        </motion.div>
      )}

      {/* Character body - pixel art style */}
      <motion.div
        animate={isOnline ? { y: [0, -2, 0, -1, 0] } : {}}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative w-10 h-14"
      >
        {/* Head */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-sm overflow-hidden" style={{ imageRendering: 'pixelated' }}>
          <div className="w-full h-full bg-[#f4c99a] rounded-sm relative">
            <div className="absolute top-0 left-0 right-0 h-3 rounded-t-sm" style={{ backgroundColor: style.hair }} />
            <motion.div
              className="absolute top-3.5 flex gap-1.5 justify-center w-full"
              animate={isOnline ? { scaleY: [1, 1, 0.1, 1, 1] } : {}}
              transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }}
            >
              <div className="w-1 h-1 bg-[#1a1a1a] rounded-full" />
              <div className="w-1 h-1 bg-[#1a1a1a] rounded-full" />
            </motion.div>
            {isOnline && <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-2 h-0.5 bg-[#c0392b] rounded-full" />}
          </div>
        </div>

        {/* Body/shirt */}
        <div
          className="absolute top-7 left-1/2 -translate-x-1/2 w-9 h-7 rounded-b-sm"
          style={{ backgroundColor: style.shirt }}
        >
          {isOnline && (
            <>
              <motion.div
                className="absolute -left-1 top-1 w-2 h-4 rounded-sm"
                style={{ backgroundColor: style.shirt, filter: 'brightness(0.85)' }}
                animate={{ rotate: [-5, 5, -5] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <motion.div
                className="absolute -right-1 top-1 w-2 h-4 rounded-sm"
                style={{ backgroundColor: style.shirt, filter: 'brightness(0.85)' }}
                animate={{ rotate: [5, -5, 5] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
              />
            </>
          )}
        </div>
      </motion.div>

      {/* Action bubble for online users */}
      {isOnline && (
        <motion.div
          className="absolute -top-9 -right-3 text-sm"
          animate={{ y: [0, -3, 0], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="bg-white/90 rounded-lg px-1 py-0.5 shadow-md text-xs">
            {style.action}
          </div>
        </motion.div>
      )}

      {/* Offline overlay */}
      {!isOnline && (
        <div className="absolute inset-0 opacity-40" style={{ filter: 'grayscale(1)' }} />
      )}
    </motion.div>
  );
}

/* ─── Desk with monitor ─── */
function Desk({ hasMonitor = true }: { hasMonitor?: boolean }) {
  return (
    <div className="relative w-14 h-8">
      <div className="absolute bottom-0 w-full h-3 bg-[#8B6914] rounded-sm shadow-inner" style={{ imageRendering: 'pixelated' }}>
        <div className="absolute inset-x-0.5 top-0 h-0.5 bg-[#a67c1e]" />
      </div>
      {hasMonitor && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2">
          <div className="w-7 h-5 bg-[#2a2a2a] rounded-sm border border-[#444] relative">
            <motion.div
              className="absolute inset-0.5 rounded-sm"
              animate={{ backgroundColor: ['#1e3a5f', '#1e5f3a', '#3a1e5f', '#1e3a5f'] }}
              transition={{ duration: 4, repeat: Infinity }}
              style={{ opacity: 0.6 }}
            />
          </div>
          <div className="w-2 h-1 bg-[#333] mx-auto" />
          <div className="w-4 h-0.5 bg-[#333] mx-auto rounded-sm" />
        </div>
      )}
    </div>
  );
}

/* ─── Workstation: character + desk ─── */
function Workstation({ member, onChat }: { member: TeamMember; onChat: (m: TeamMember) => void }) {
  const style = ROLE_STYLE[member.role] || ROLE_STYLE.admin;
  
  return (
    <div className="flex flex-col items-center gap-0 relative">
      <PixelCharacter member={member} style={style} onClick={() => onChat(member)} />
      <Desk hasMonitor={member.role !== 'videomaker' && member.role !== 'fotografo'} />
    </div>
  );
}

/* ─── Quick Chat Dialog ─── */
function QuickChatDialog({ member, currentUserId, onClose }: { member: TeamMember; currentUserId: string; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadMessages = async () => {
      const { data } = await supabase
        .from('team_messages')
        .select('*')
        .or(`and(from_user_id.eq.${currentUserId},to_user_id.eq.${member.id}),and(from_user_id.eq.${member.id},to_user_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true })
        .limit(50) as any;
      if (data) setMessages(data);
    };
    loadMessages();

    const channel = supabaseReal
      .channel(`chat-${member.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, (payload) => {
        const msg = payload.new as any;
        if ((msg.from_user_id === currentUserId && msg.to_user_id === member.id) ||
            (msg.from_user_id === member.id && msg.to_user_id === currentUserId)) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();

    return () => { supabaseReal.removeChannel(channel); };
  }, [member.id, currentUserId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from('team_messages').insert({
      from_user_id: currentUserId,
      to_user_id: member.id,
      message: message.trim(),
    } as any) as any;
    if (error) toast.error('Erro ao enviar');
    else setMessage('');
    setSending(false);
  };

  const style = ROLE_STYLE[member.role] || ROLE_STYLE.admin;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-3 border-b border-border/50 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${style.shirt}22, ${style.shirt}11)` }}>
          <div className="relative">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: `${style.shirt}33` }}>
              {style.action}
            </div>
            {member.isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-card" />}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">{member.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {ROLE_LABEL[member.role] || member.role}
              {member.isOnline && <span className="text-green-400 ml-1">• Online</span>}
              {member.activity && ACTIVITY_LABELS[member.activity] && (
                <span className="ml-1 text-yellow-400">— {ACTIVITY_LABELS[member.activity]}</span>
              )}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X size={16} /></Button>
        </div>

        <div ref={scrollRef} className="h-56 overflow-y-auto p-3 space-y-2 bg-background/50">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs">
              Envie a primeira mensagem 💬
            </div>
          )}
          {messages.map((msg: any) => (
            <div key={msg.id} className={`flex ${msg.from_user_id === currentUserId ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs ${
                msg.from_user_id === currentUserId
                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                  : 'bg-secondary text-secondary-foreground rounded-bl-sm'
              }`}>
                {msg.message}
                <div className={`text-[8px] mt-0.5 ${msg.from_user_id === currentUserId ? 'text-primary-foreground/60' : 'text-muted-foreground/60'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-border/50 flex gap-2">
          <Input value={message} onChange={e => setMessage(e.target.value)} placeholder="Mensagem rápida..." className="text-xs h-9" onKeyDown={e => e.key === 'Enter' && sendMessage()} />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={sendMessage} disabled={sending || !message.trim()}>
            <Send size={14} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Decorations ─── */
function OfficeDecor() {
  return (
    <>
      <div className="absolute top-2 right-4 flex gap-0.5">
        {['#8B4513', '#2E86C1', '#C0392B', '#27AE60', '#8E44AD', '#D35400'].map((c, i) => (
          <div key={i} className="w-2 h-5 rounded-sm" style={{ backgroundColor: c, opacity: 0.7 }} />
        ))}
      </div>
      <motion.div
        className="absolute bottom-4 left-4 text-xl"
        animate={{ rotate: [-2, 2, -2] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        🪴
      </motion.div>
      <div className="absolute top-4 left-4 text-lg">☕</div>
      <motion.div
        className="absolute top-3 left-1/2 -translate-x-1/2 text-lg"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        🕐
      </motion.div>
    </>
  );
}

/* ─── Floor pattern ─── */
function FloorPattern() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl" style={{ imageRendering: 'pixelated' }}>
      <div className="absolute inset-0" style={{
        background: `
          repeating-linear-gradient(
            90deg,
            #5C3D2E 0px, #5C3D2E 60px,
            #4E3425 60px, #4E3425 61px
          ),
          repeating-linear-gradient(
            0deg,
            transparent 0px, transparent 15px,
            rgba(0,0,0,0.08) 15px, rgba(0,0,0,0.08) 16px
          )
        `,
      }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30" />
    </div>
  );
}

/* ─── Main Component ─── */
export default function VirtualOffice() {
  const { currentUser } = useApp();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activities, setActivities] = useState<Record<string, string>>({});
  const [chatTarget, setChatTarget] = useState<TeamMember | null>(null);
  const membersRef = useRef<TeamMember[]>([]);

  // Build isOnline from a profile row
  const profileToMember = useCallback((p: any, now: number): TeamMember => ({
    id: p.id,
    name: p.name || 'Usuário',
    role: p.role as UserRole,
    avatarUrl: p.avatar_url,
    lastSeenAt: p.last_seen_at,
    isOnline: p.last_seen_at ? (now - new Date(p.last_seen_at).getTime()) < ONLINE_THRESHOLD_MS : false,
  }), []);

  const sortMembers = useCallback((list: TeamMember[]) => {
    return [...list].sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.role.localeCompare(b.role);
    });
  }, []);

  // Fetch activities (content_tasks being edited, active_recordings, design_tasks in progress)
  const fetchActivities = useCallback(async () => {
    const actMap: Record<string, string> = {};

    // Active recordings → videomaker is "gravando"
    const { data: activeRecs } = await supabase.from('active_recordings').select('videomaker_id');
    activeRecs?.forEach((r: any) => { actMap[r.videomaker_id] = 'gravando'; });

    // Content tasks being edited/reviewed
    const { data: contentTasks } = await supabase
      .from('content_tasks')
      .select('assigned_to, edited_by, reviewing_by, kanban_column')
      .in('kanban_column', ['edicao', 'revisao', 'alteracao', 'aprovacao']);
    contentTasks?.forEach((t: any) => {
      if (t.kanban_column === 'edicao' && t.edited_by) actMap[t.edited_by] = 'edicao';
      if (t.kanban_column === 'edicao' && t.assigned_to && !t.edited_by) actMap[t.assigned_to] = 'edicao';
      if (t.kanban_column === 'revisao' && t.reviewing_by) actMap[t.reviewing_by] = 'revisao';
      if (t.kanban_column === 'alteracao' && (t.edited_by || t.assigned_to)) actMap[t.edited_by || t.assigned_to] = 'alteracao';
      if (t.kanban_column === 'aprovacao' && t.assigned_to) actMap[t.assigned_to] = 'aprovacao';
    });

    // Design tasks in progress
    const { data: designTasks } = await supabase
      .from('design_tasks')
      .select('assigned_to, kanban_column')
      .in('kanban_column', ['em_andamento', 'revisao']);
    designTasks?.forEach((t: any) => {
      if (t.assigned_to && !actMap[t.assigned_to]) actMap[t.assigned_to] = 'designing';
    });

    setActivities(actMap);
  }, []);

  // Full fetch profiles
  const fetchProfiles = useCallback(async () => {
    const now = Date.now();
    const { data: profiles } = await supabase.from('profiles').select('id, name, role, avatar_url, last_seen_at') as any;
    if (profiles) {
      const mapped = sortMembers(profiles.map((p: any) => profileToMember(p, now)));
      membersRef.current = mapped;
      setMembers(mapped);
    }
  }, [profileToMember, sortMembers]);

  // Handle a single profile update from realtime
  const handleProfileChange = useCallback((payload: any) => {
    const now = Date.now();
    if (payload.eventType === 'DELETE' && payload.old) {
      setMembers(prev => {
        const updated = prev.filter(m => m.id !== payload.old.id);
        membersRef.current = updated;
        return updated;
      });
      return;
    }

    const p = payload.new;
    if (!p) return;

    setMembers(prev => {
      const idx = prev.findIndex(m => m.id === p.id);
      const member = profileToMember(p, now);
      let updated: TeamMember[];
      if (idx > -1) {
        updated = [...prev];
        updated[idx] = { ...member, activity: updated[idx].activity };
      } else {
        updated = [...prev, member];
      }
      const sorted = sortMembers(updated);
      membersRef.current = sorted;
      return sorted;
    });
  }, [profileToMember, sortMembers]);

  useEffect(() => {
    // Initial fetch
    fetchProfiles();
    fetchActivities();

    // Realtime for profiles — listen to ALL events
    const profileChannel = supabase
      .channel('vo-presence-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, handleProfileChange)
      .subscribe();

    // Realtime for active_recordings changes → update activities
    const activityChannel = supabase
      .channel('vo-activity-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_recordings' }, () => fetchActivities())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'content_tasks' }, () => fetchActivities())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'design_tasks' }, () => fetchActivities())
      .subscribe();

    // Refresh online threshold every 30s (to mark stale users offline)
    const thresholdInterval = setInterval(() => {
      setMembers(prev => {
        const now = Date.now();
        const updated = prev.map(m => ({
          ...m,
          isOnline: m.lastSeenAt ? (now - new Date(m.lastSeenAt).getTime()) < ONLINE_THRESHOLD_MS : false,
        }));
        return sortMembers(updated);
      });
    }, 30_000);

    // Refresh activities every 30s as a fallback
    const activityInterval = setInterval(fetchActivities, 30_000);

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(activityChannel);
      clearInterval(thresholdInterval);
      clearInterval(activityInterval);
    };
  }, [fetchProfiles, fetchActivities, handleProfileChange, sortMembers]);

  // Merge activities into members
  const membersWithActivity = useMemo(() => {
    return members.map(m => ({
      ...m,
      activity: activities[m.id] || undefined,
    }));
  }, [members, activities]);

  const onlineCount = membersWithActivity.filter(m => m.isOnline).length;

  // Group by role
  const grouped = useMemo(() => {
    const groups: Record<string, TeamMember[]> = {};
    membersWithActivity.forEach(m => {
      if (!groups[m.role]) groups[m.role] = [];
      groups[m.role].push(m);
    });
    return groups;
  }, [membersWithActivity]);

  const roleOrder = ['admin', 'videomaker', 'editor', 'designer', 'social_media', 'fotografo', 'parceiro', 'endomarketing'];
  const activeRoles = roleOrder.filter(r => grouped[r]?.length);

  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card/80 backdrop-blur-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-3 bg-card">
        <motion.span
          className="text-xl"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          🏢
        </motion.span>
        <div className="flex-1">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            Escritório Virtual Pulse
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
              🟢 {onlineCount} online
            </Badge>
            <span className="text-[9px] text-muted-foreground/50 font-mono">ao vivo</span>
          </h3>
          <p className="text-[10px] text-muted-foreground">Acompanhe em tempo real o que cada membro da equipe está fazendo</p>
        </div>
      </div>

      {/* Office floor */}
      <div className="relative min-h-[350px] sm:min-h-[400px]" style={{ imageRendering: 'auto' }}>
        <FloorPattern />
        <OfficeDecor />

        {/* Room areas */}
        <div className="relative z-10 p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8">
          {activeRoles.map((role) => {
            const roleMembers = grouped[role] || [];
            const hasOnline = roleMembers.some(m => m.isOnline);
            const style = ROLE_STYLE[role] || ROLE_STYLE.admin;

            return (
              <div key={role} className="relative">
                {/* Room label */}
                <div className="flex items-center gap-1.5 mb-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${hasOnline ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]' : 'bg-muted-foreground/30'}`} />
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                    {ROLE_LABEL[role] || role}
                  </span>
                  <span className="text-sm">{style.deskItems}</span>
                </div>

                {/* Room border */}
                <div className="rounded-lg border border-white/10 bg-black/10 backdrop-blur-[2px] p-3 sm:p-4">
                  <div className="flex flex-wrap gap-4 sm:gap-5 justify-center">
                    {roleMembers.map(member => (
                      <Workstation key={member.id} member={member} onChat={setChatTarget} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ambient particles */}
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-yellow-400/20"
            style={{ left: `${15 + i * 18}%`, top: `${20 + (i % 3) * 25}%` }}
            animate={{ y: [0, -10, 0], opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 3 + i, repeat: Infinity, delay: i * 0.5 }}
          />
        ))}
      </div>

      {/* Quick chat overlay */}
      <AnimatePresence>
        {chatTarget && currentUser && (
          <QuickChatDialog
            member={chatTarget}
            currentUserId={currentUser.id}
            onClose={() => setChatTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

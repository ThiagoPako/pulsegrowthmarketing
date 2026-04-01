import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Video, Palette, Share2, Camera, Users, Briefcase, Send, X, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { UserRole } from '@/types';

interface TeamMember {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  lastSeenAt: string | null;
  isOnline: boolean;
  currentTask?: string;
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ReactNode; deskColor: string; emoji: string }> = {
  admin: { label: 'Admin', icon: <Briefcase size={16} />, deskColor: 'from-blue-500/20 to-blue-600/20', emoji: '👔' },
  videomaker: { label: 'Videomaker', icon: <Video size={16} />, deskColor: 'from-green-500/20 to-green-600/20', emoji: '🎬' },
  editor: { label: 'Editor', icon: <Monitor size={16} />, deskColor: 'from-purple-500/20 to-purple-600/20', emoji: '🎞️' },
  designer: { label: 'Designer', icon: <Palette size={16} />, deskColor: 'from-orange-500/20 to-orange-600/20', emoji: '🎨' },
  social_media: { label: 'Social Media', icon: <Share2 size={16} />, deskColor: 'from-pink-500/20 to-pink-600/20', emoji: '📱' },
  fotografo: { label: 'Fotógrafo', icon: <Camera size={16} />, deskColor: 'from-yellow-500/20 to-yellow-600/20', emoji: '📷' },
  parceiro: { label: 'Parceiro', icon: <Users size={16} />, deskColor: 'from-teal-500/20 to-teal-600/20', emoji: '🤝' },
  endomarketing: { label: 'Endomarketing', icon: <Users size={16} />, deskColor: 'from-cyan-500/20 to-cyan-600/20', emoji: '📣' },
};

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function DeskCard({ member, onChat }: { member: TeamMember; onChat: (m: TeamMember) => void }) {
  const config = ROLE_CONFIG[member.role] || ROLE_CONFIG.admin;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03, y: -4 }}
      className="relative group cursor-pointer"
      onClick={() => onChat(member)}
    >
      {/* Desk surface */}
      <div className={`relative rounded-xl border border-border/60 bg-gradient-to-br ${config.deskColor} backdrop-blur-sm p-3 sm:p-4 transition-all duration-300 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-primary/10`}>
        {/* Online indicator */}
        <div className="absolute -top-1.5 -right-1.5 z-10">
          {member.isOnline ? (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-background shadow-lg shadow-green-500/50"
            />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full bg-muted-foreground/30 border-2 border-background" />
          )}
        </div>

        {/* Avatar area */}
        <div className="flex flex-col items-center gap-2">
          {/* Character */}
          <div className="relative">
            {member.avatarUrl ? (
              <img src={member.avatarUrl} alt={member.name} className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-primary/30" />
            ) : (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
                <span className="text-sm sm:text-base font-bold text-primary">{getInitials(member.name)}</span>
              </div>
            )}
            {/* Role emoji floating */}
            <motion.span
              animate={member.isOnline ? { y: [0, -3, 0], rotate: [0, 5, -5, 0] } : {}}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -bottom-1 -right-1 text-lg"
            >
              {config.emoji}
            </motion.span>
          </div>

          {/* Info */}
          <div className="text-center w-full">
            <p className="text-[11px] sm:text-xs font-semibold truncate max-w-[100px]">{member.name.split(' ')[0]}</p>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              {config.icon}
              <span className="text-[9px] sm:text-[10px] text-muted-foreground">{config.label}</span>
            </div>
          </div>

          {/* Status */}
          {member.isOnline ? (
            <Badge variant="default" className="text-[8px] sm:text-[9px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30">
              🟢 Online
            </Badge>
          ) : member.lastSeenAt ? (
            <span className="text-[8px] sm:text-[9px] text-muted-foreground/60">
              {formatDistanceToNow(new Date(member.lastSeenAt), { addSuffix: true, locale: ptBR })}
            </span>
          ) : (
            <span className="text-[8px] sm:text-[9px] text-muted-foreground/40">Offline</span>
          )}
        </div>

        {/* Chat hint on hover */}
        <div className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1">
          <span className="text-[9px] text-primary/70 flex items-center gap-1">
            <MessageSquare size={10} /> Chat rápido
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function QuickChatDialog({ member, currentUserId, onClose }: { member: TeamMember; currentUserId: string; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Load recent messages
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

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${member.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, (payload) => {
        const msg = payload.new as any;
        if ((msg.from_user_id === currentUserId && msg.to_user_id === member.id) ||
            (msg.from_user_id === member.id && msg.to_user_id === currentUserId)) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [member.id, currentUserId]);

  const sendMessage = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    const { error } = await supabase.from('team_messages').insert({
      from_user_id: currentUserId,
      to_user_id: member.id,
      message: message.trim(),
    } as any) as any;
    if (error) {
      toast.error('Erro ao enviar mensagem');
    } else {
      setMessage('');
    }
    setSending(false);
  };

  const config = ROLE_CONFIG[member.role] || ROLE_CONFIG.admin;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-4 bg-gradient-to-r ${config.deskColor} border-b border-border/50 flex items-center gap-3`}>
          <div className="relative">
            {member.avatarUrl ? (
              <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover border-2 border-primary/30" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{getInitials(member.name)}</span>
              </div>
            )}
            {member.isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-card" />
            )}
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">{member.name}</p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              {config.icon} {config.label}
              {member.isOnline && <span className="text-green-400 ml-1">• Online</span>}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {/* Messages */}
        <div className="h-64 overflow-y-auto p-3 space-y-2 bg-background/50">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs">
              Envie a primeira mensagem para {member.name.split(' ')[0]} 💬
            </div>
          )}
          {messages.map((msg: any) => (
            <div key={msg.id} className={`flex ${msg.from_user_id === currentUserId ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
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

        {/* Input */}
        <div className="p-3 border-t border-border/50 flex gap-2">
          <Input
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Mensagem rápida..."
            className="text-xs h-9"
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={sendMessage} disabled={sending || !message.trim()}>
            <Send size={14} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default function VirtualOffice() {
  const { currentUser, users } = useApp();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [chatTarget, setChatTarget] = useState<TeamMember | null>(null);

  useEffect(() => {
    const fetchPresence = async () => {
      const { data: profiles } = await supabase.from('profiles').select('id, name, role, avatar_url, last_seen_at') as any;
      if (!profiles) return;

      const now = Date.now();
      const mapped: TeamMember[] = profiles.map((p: any) => ({
        id: p.id,
        name: p.name || 'Usuário',
        role: p.role as UserRole,
        avatarUrl: p.avatar_url,
        lastSeenAt: p.last_seen_at,
        isOnline: p.last_seen_at ? (now - new Date(p.last_seen_at).getTime()) < 5 * 60 * 1000 : false,
      }));

      // Sort: online first, then by role
      mapped.sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return a.role.localeCompare(b.role);
      });

      setMembers(mapped);
    };

    fetchPresence();
    const interval = setInterval(fetchPresence, 30_000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = members.filter(m => m.isOnline).length;

  // Group by role
  const grouped = useMemo(() => {
    const groups: Record<string, TeamMember[]> = {};
    members.forEach(m => {
      if (!groups[m.role]) groups[m.role] = [];
      groups[m.role].push(m);
    });
    return groups;
  }, [members]);

  return (
    <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center gap-3">
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="text-2xl"
        >
          🏢
        </motion.div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            Escritório Virtual
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {onlineCount} online
            </Badge>
          </h3>
          <p className="text-[10px] text-muted-foreground">Veja quem está trabalhando agora</p>
        </div>
      </div>

      {/* Office floor */}
      <div className="p-4 space-y-4">
        {Object.entries(grouped).map(([role, roleMembers]) => {
          const config = ROLE_CONFIG[role] || ROLE_CONFIG.admin;
          const hasOnline = roleMembers.some(m => m.isOnline);
          return (
            <div key={role}>
              {/* Section label */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-1.5 h-1.5 rounded-full ${hasOnline ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  {config.icon} {config.label}
                </span>
              </div>
              {/* Desks grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
                {roleMembers.map(member => (
                  <DeskCard key={member.id} member={member} onChat={setChatTarget} />
                ))}
              </div>
            </div>
          );
        })}
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

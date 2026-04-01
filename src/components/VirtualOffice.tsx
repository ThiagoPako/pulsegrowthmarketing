import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import { createVirtualOfficeChannel, getConversationKey, type QuickMessage } from '@/lib/virtualOfficeRealtime';

const ONLINE_THRESHOLD_MS = 25_000;

interface TeamMember {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  lastSeenAt: string | null;
  isOnline: boolean;
  activity?: string;
}

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

const ROLE_EMOJI: Record<string, string> = {
  admin: '💼',
  videomaker: '🎬',
  editor: '✂️',
  designer: '🎨',
  social_media: '📱',
  fotografo: '📷',
  parceiro: '🤝',
  endomarketing: '📣',
};

const ACTIVITY_LABELS: Record<string, string> = {
  gravando: '🔴 Gravando',
  edicao: '✂️ Editando',
  revisao: '👁️ Revisando',
  alteracao: '🔧 Alteração',
  aprovacao: '✅ Aprovando',
  designing: '🎨 Criando arte',
};

function normalizeQuickMessage(payload: unknown): QuickMessage | null {
  if (!payload || typeof payload !== 'object') return null;

  const source = payload as Record<string, unknown>;
  const message: QuickMessage = {
    id: typeof source.id === 'string' ? source.id : crypto.randomUUID(),
    fromUserId: typeof source.fromUserId === 'string' ? source.fromUserId : '',
    toUserId: typeof source.toUserId === 'string' ? source.toUserId : '',
    message: typeof source.message === 'string' ? source.message : '',
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString(),
  };

  if (!message.fromUserId || !message.toUserId || !message.message.trim()) return null;
  return message;
}

function PixelAvatar({ member, onClick }: { member: TeamMember; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.06, y: -2 }}
      className="group relative flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card/85 px-3 py-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-card"
    >
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <span className={`h-2.5 w-2.5 rounded-full ${member.isOnline ? 'bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.65)]' : 'bg-muted-foreground/40'}`} />
      </div>

      <motion.div
        animate={member.isOnline ? { y: [0, -3, 0] } : {}}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-border/70 bg-secondary/60 text-3xl"
      >
        <span className={member.isOnline ? '' : 'grayscale opacity-50'}>{ROLE_EMOJI[member.role] || '👤'}</span>
      </motion.div>

      <div className="space-y-1 text-center">
        <p className="text-xs font-semibold leading-none text-foreground">{member.name.split(' ')[0]}</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{ROLE_LABEL[member.role] || member.role}</p>
        <div className="min-h-4 text-[10px] text-primary">
          {member.isOnline && member.activity ? ACTIVITY_LABELS[member.activity] : member.isOnline ? 'Online agora' : 'Offline'}
        </div>
      </div>
    </motion.button>
  );
}

function QuickChatDialog({
  member,
  currentUserId,
  messages,
  onSend,
  onClose,
}: {
  member: TeamMember;
  currentUserId: string;
  messages: QuickMessage[];
  onSend: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;

    setSending(true);
    const ok = await onSend(message.trim());
    if (ok) setMessage('');
    else toast.error('Erro ao enviar mensagem rápida.');
    setSending(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

      <motion.div
        initial={{ y: 16, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 16, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border/60 bg-secondary/40 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-lg">
            {ROLE_EMOJI[member.role] || '👤'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {ROLE_LABEL[member.role] || member.role}
              {member.isOnline ? ' • online ao vivo' : ' • offline'}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div ref={scrollRef} className="h-72 space-y-2 overflow-y-auto bg-background/50 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageCircle size={18} className="opacity-60" />
              <p className="text-xs">Envie uma mensagem rápida ao vivo.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.fromUserId === currentUserId ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs ${msg.fromUserId === currentUserId ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                  <p>{msg.message}</p>
                  <p className={`mt-1 text-[10px] ${msg.fromUserId === currentUserId ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 border-t border-border/60 px-4 py-3">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void handleSend()}
            placeholder={member.isOnline ? 'Mensagem rápida...' : 'Pessoa offline'}
            className="h-10 text-sm"
            disabled={!member.isOnline || sending}
          />
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => void handleSend()} disabled={!member.isOnline || sending || !message.trim()}>
            <Send size={14} />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function VirtualOffice() {
  const { currentUser } = useApp();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activities, setActivities] = useState<Record<string, string>>({});
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<Record<string, QuickMessage[]>>({});
  const [chatTarget, setChatTarget] = useState<TeamMember | null>(null);
  const [now, setNow] = useState(Date.now());
  const channelRef = useRef<any>(null);
  const membersRef = useRef<TeamMember[]>([]);

  const profileToMember = useCallback((profile: any): TeamMember => ({
    id: profile.id,
    name: profile.name || 'Usuário',
    role: profile.role as UserRole,
    avatarUrl: profile.avatar_url || undefined,
    lastSeenAt: null,
    isOnline: false,
  }), []);

  const sortMembers = useCallback((list: TeamMember[]) => {
    return [...list].sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, []);

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, name, role, avatar_url') as any;
    if (!data) return;

    const mapped = data.map(profileToMember);
    membersRef.current = mapped;
    setMembers(mapped);
  }, [profileToMember]);

  const fetchActivities = useCallback(async () => {
    const nextActivities: Record<string, string> = {};

    const [{ data: activeRecordings }, { data: contentTasks }, { data: designTasks }] = await Promise.all([
      supabase.from('active_recordings').select('videomaker_id'),
      supabase.from('content_tasks').select('assigned_to, edited_by, reviewing_by, kanban_column').in('kanban_column', ['edicao', 'revisao', 'alteracao', 'aprovacao']),
      supabase.from('design_tasks').select('assigned_to, kanban_column').in('kanban_column', ['em_andamento', 'revisao']),
    ]) as any;

    activeRecordings?.forEach((item: any) => {
      if (item.videomaker_id) nextActivities[item.videomaker_id] = 'gravando';
    });

    contentTasks?.forEach((task: any) => {
      if (task.kanban_column === 'edicao' && (task.edited_by || task.assigned_to)) nextActivities[task.edited_by || task.assigned_to] = 'edicao';
      if (task.kanban_column === 'revisao' && task.reviewing_by) nextActivities[task.reviewing_by] = 'revisao';
      if (task.kanban_column === 'alteracao' && (task.edited_by || task.assigned_to)) nextActivities[task.edited_by || task.assigned_to] = 'alteracao';
      if (task.kanban_column === 'aprovacao' && task.assigned_to) nextActivities[task.assigned_to] = 'aprovacao';
    });

    designTasks?.forEach((task: any) => {
      if (task.assigned_to && !nextActivities[task.assigned_to]) nextActivities[task.assigned_to] = 'designing';
    });

    setActivities(nextActivities);
  }, []);

  const syncPresenceState = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;

    const state = channel.presenceState() as Record<string, any[]>;
    const nextPresence: Record<string, string> = {};

    Object.values(state).forEach((entries) => {
      if (!Array.isArray(entries)) return;

      entries.forEach((entry) => {
        const userId = typeof entry?.userId === 'string' ? entry.userId : null;
        const heartbeatAt = typeof entry?.heartbeatAt === 'string' ? entry.heartbeatAt : new Date().toISOString();
        if (!userId) return;

        if (!nextPresence[userId] || new Date(heartbeatAt).getTime() > new Date(nextPresence[userId]).getTime()) {
          nextPresence[userId] = heartbeatAt;
        }
      });
    });

    setPresenceByUserId(nextPresence);
    setNow(Date.now());
  }, []);

  const appendChatMessage = useCallback((message: QuickMessage) => {
    setChatMessages((prev) => {
      const key = getConversationKey(message.fromUserId, message.toUserId);
      const current = prev[key] || [];
      if (current.some((item) => item.id === message.id)) return prev;

      return {
        ...prev,
        [key]: [...current, message].slice(-50),
      };
    });
  }, []);

  const handleIncomingMessage = useCallback((payload: unknown) => {
    const message = normalizeQuickMessage(payload);
    if (!message || !currentUser) return;
    if (message.fromUserId !== currentUser.id && message.toUserId !== currentUser.id) return;

    appendChatMessage(message);

    if (message.toUserId === currentUser.id && chatTarget?.id !== message.fromUserId) {
      const sender = membersRef.current.find((member) => member.id === message.fromUserId);
      toast.message(`Mensagem rápida de ${sender?.name || 'alguém'}`, {
        description: message.message,
      });
    }
  }, [appendChatMessage, chatTarget?.id, currentUser]);

  const sendQuickMessage = useCallback(async (text: string) => {
    if (!currentUser || !chatTarget || !chatTarget.isOnline) {
      toast.error('A pessoa precisa estar online para receber a mensagem rápida.');
      return false;
    }

    const channel = channelRef.current;
    if (!channel) return false;

    const message: QuickMessage = {
      id: crypto.randomUUID(),
      fromUserId: currentUser.id,
      toUserId: chatTarget.id,
      message: text,
      createdAt: new Date().toISOString(),
    };

    const result = await channel.send({
      type: 'broadcast',
      event: 'quick_message',
      payload: message,
    });

    if (result !== 'ok') return false;
    appendChatMessage(message);
    return true;
  }, [appendChatMessage, chatTarget, currentUser]);

  useEffect(() => {
    void fetchProfiles();
    void fetchActivities();

    const channel = createVirtualOfficeChannel(
      currentUser?.id
        ? `office-view-${currentUser.id}-${Math.random().toString(36).slice(2, 8)}`
        : `office-view-${Math.random().toString(36).slice(2, 8)}`,
    );
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, syncPresenceState)
      .on('presence', { event: 'join' }, syncPresenceState)
      .on('presence', { event: 'leave' }, syncPresenceState)
      .on('broadcast', { event: 'quick_message' }, ({ payload }: any) => handleIncomingMessage(payload))
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') syncPresenceState();
      });

    const activitiesInterval = window.setInterval(() => {
      void fetchActivities();
    }, 5_000);

    const profilesInterval = window.setInterval(() => {
      void fetchProfiles();
    }, 60_000);

    const clockInterval = window.setInterval(() => {
      setNow(Date.now());
    }, 5_000);

    return () => {
      if (channelRef.current === channel) channelRef.current = null;
      window.clearInterval(activitiesInterval);
      window.clearInterval(profilesInterval);
      window.clearInterval(clockInterval);
      void channel.unsubscribe();
    };
  }, [currentUser?.id, fetchActivities, fetchProfiles, handleIncomingMessage, syncPresenceState]);

  const membersWithActivity = useMemo(() => {
    const enriched = members.map((member) => {
      const lastSeenAt = presenceByUserId[member.id] || null;
      const isOnline = Boolean(lastSeenAt) && now - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;

      return {
        ...member,
        lastSeenAt,
        isOnline,
        activity: activities[member.id] || undefined,
      };
    });

    const sorted = sortMembers(enriched);
    membersRef.current = sorted;
    return sorted;
  }, [activities, members, now, presenceByUserId, sortMembers]);

  const groupedMembers = useMemo(() => {
    const groups: Record<string, TeamMember[]> = {};
    membersWithActivity.forEach((member) => {
      if (!groups[member.role]) groups[member.role] = [];
      groups[member.role].push(member);
    });
    return groups;
  }, [membersWithActivity]);

  const roleOrder = ['admin', 'videomaker', 'editor', 'designer', 'social_media', 'fotografo', 'parceiro', 'endomarketing'];
  const activeRoles = roleOrder.filter((role) => groupedMembers[role]?.length);
  const onlineCount = membersWithActivity.filter((member) => member.isOnline).length;
  const currentConversation = useMemo(() => {
    if (!currentUser || !chatTarget) return [];
    return chatMessages[getConversationKey(currentUser.id, chatTarget.id)] || [];
  }, [chatMessages, chatTarget, currentUser]);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="border-b border-border/60 bg-secondary/30 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <motion.div animate={{ y: [0, -2, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-2xl">
            🏢
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground sm:text-base">Escritório Virtual Pulse</h3>
              <Badge variant="secondary" className="text-[10px] font-mono">
                🟢 {onlineCount} online
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Agora o online e a mensagem rápida usam canal ao vivo compartilhado.</p>
          </div>
        </div>
      </div>

      <div className="bg-[radial-gradient(circle_at_top,hsl(var(--secondary))_0%,transparent_55%)] px-4 py-5 sm:px-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {activeRoles.map((role) => (
            <div key={role} className="rounded-2xl border border-border/70 bg-background/70 p-4 backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{ROLE_LABEL[role] || role}</p>
                  <p className="text-[11px] text-muted-foreground">{groupedMembers[role].filter((member) => member.isOnline).length} ao vivo</p>
                </div>
                <div className="text-xl">{ROLE_EMOJI[role] || '👤'}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {groupedMembers[role].map((member) => (
                  <PixelAvatar key={member.id} member={member} onClick={() => setChatTarget(member)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {chatTarget && currentUser && (
          <QuickChatDialog
            member={chatTarget}
            currentUserId={currentUser.id}
            messages={currentConversation}
            onSend={sendQuickMessage}
            onClose={() => setChatTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

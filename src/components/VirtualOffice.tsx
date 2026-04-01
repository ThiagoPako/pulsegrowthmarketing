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
import {
  subscribeOfficeChannel,
  unsubscribeOfficeChannel,
  onPresenceSync,
  onQuickMessage,
  getPresenceState,
  sendBroadcast,
  getConversationKey,
  type QuickMessage,
} from '@/lib/virtualOfficeRealtime';

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
  admin: 'Administração', videomaker: 'Estúdio', editor: 'Sala de Edição',
  designer: 'Ateliê', social_media: 'Mídia Social', fotografo: 'Estúdio Foto',
  parceiro: 'Parceiros', endomarketing: 'Endomarketing',
};

const ROLE_EMOJI: Record<string, string> = {
  admin: '💼', videomaker: '🎬', editor: '✂️', designer: '🎨',
  social_media: '📱', fotografo: '📷', parceiro: '🤝', endomarketing: '📣',
};

const ACTIVITY_LABELS: Record<string, string> = {
  gravando: '🔴 Gravando', edicao: '✂️ Editando', revisao: '👁️ Revisando',
  alteracao: '🔧 Alteração', aprovacao: '✅ Aprovando', designing: '🎨 Criando arte',
};

function normalizeQuickMessage(payload: unknown): QuickMessage | null {
  if (!payload || typeof payload !== 'object') return null;
  const s = payload as Record<string, unknown>;
  const m: QuickMessage = {
    id: typeof s.id === 'string' ? s.id : crypto.randomUUID(),
    fromUserId: typeof s.fromUserId === 'string' ? s.fromUserId : '',
    toUserId: typeof s.toUserId === 'string' ? s.toUserId : '',
    message: typeof s.message === 'string' ? s.message : '',
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
  };
  if (!m.fromUserId || !m.toUserId || !m.message.trim()) return null;
  return m;
}

function PixelAvatar({ member, onClick }: { member: TeamMember; onClick: () => void }) {
  return (
    <motion.button type="button" onClick={onClick} whileHover={{ scale: 1.06, y: -2 }}
      className="group relative flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card/85 px-3 py-3 shadow-sm transition-colors hover:border-primary/40 hover:bg-card">
      <div className="absolute right-2 top-2">
        <span className={`block h-2.5 w-2.5 rounded-full ${member.isOnline ? 'bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.65)]' : 'bg-muted-foreground/40'}`} />
      </div>
      <motion.div animate={member.isOnline ? { y: [0, -3, 0] } : {}} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/70 bg-secondary/60 text-3xl">
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

function QuickChatDialog({ member, currentUserId, messages, onSend, onClose }: {
  member: TeamMember; currentUserId: string; messages: QuickMessage[];
  onSend: (text: string) => Promise<boolean>; onClose: () => void;
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <motion.div initial={{ y: 16, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, scale: 0.96 }}
        transition={{ duration: 0.18 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X size={16} /></Button>
        </div>
        <div ref={scrollRef} className="h-72 space-y-2 overflow-y-auto bg-background/50 px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageCircle size={18} className="opacity-60" />
              <p className="text-xs">Envie uma mensagem rápida ao vivo.</p>
            </div>
          ) : messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.fromUserId === currentUserId ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs ${msg.fromUserId === currentUserId ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                <p>{msg.message}</p>
                <p className={`mt-1 text-[10px] ${msg.fromUserId === currentUserId ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-border/60 px-4 py-3">
          <Input value={message} onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleSend()}
            placeholder={member.isOnline ? 'Mensagem rápida...' : 'Pessoa offline'}
            className="h-10 text-sm" disabled={!member.isOnline || sending} />
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={() => void handleSend()}
            disabled={!member.isOnline || sending || !message.trim()}>
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
  const membersRef = useRef<TeamMember[]>([]);
  const chatTargetRef = useRef<TeamMember | null>(null);
  chatTargetRef.current = chatTarget;

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, name, role, avatar_url') as any;
    if (!data) return;
    setMembers(data.map((p: any) => ({
      id: p.id, name: p.name || 'Usuário', role: p.role as UserRole,
      avatarUrl: p.avatar_url, lastSeenAt: null, isOnline: false,
    })));
  }, []);

  const fetchActivities = useCallback(async () => {
    const act: Record<string, string> = {};
    const [{ data: recs }, { data: ct }, { data: dt }] = await Promise.all([
      supabase.from('active_recordings').select('videomaker_id'),
      supabase.from('content_tasks').select('assigned_to, edited_by, reviewing_by, kanban_column').in('kanban_column', ['edicao', 'revisao', 'alteracao', 'aprovacao']),
      supabase.from('design_tasks').select('assigned_to, kanban_column').in('kanban_column', ['em_andamento', 'revisao']),
    ]) as any;
    recs?.forEach((r: any) => { if (r.videomaker_id) act[r.videomaker_id] = 'gravando'; });
    ct?.forEach((t: any) => {
      if (t.kanban_column === 'edicao' && (t.edited_by || t.assigned_to)) act[t.edited_by || t.assigned_to] = 'edicao';
      if (t.kanban_column === 'revisao' && t.reviewing_by) act[t.reviewing_by] = 'revisao';
      if (t.kanban_column === 'alteracao' && (t.edited_by || t.assigned_to)) act[t.edited_by || t.assigned_to] = 'alteracao';
      if (t.kanban_column === 'aprovacao' && t.assigned_to) act[t.assigned_to] = 'aprovacao';
    });
    dt?.forEach((t: any) => { if (t.assigned_to && !act[t.assigned_to]) act[t.assigned_to] = 'designing'; });
    setActivities(act);
  }, []);

  const syncPresence = useCallback(() => {
    const state = getPresenceState();
    const next: Record<string, string> = {};
    Object.values(state).forEach(entries => {
      if (!Array.isArray(entries)) return;
      entries.forEach(entry => {
        const uid = typeof entry?.userId === 'string' ? entry.userId : null;
        const hb = typeof entry?.heartbeatAt === 'string' ? entry.heartbeatAt : new Date().toISOString();
        if (!uid) return;
        if (!next[uid] || new Date(hb).getTime() > new Date(next[uid]).getTime()) next[uid] = hb;
      });
    });
    setPresenceByUserId(next);
    setNow(Date.now());
  }, []);

  const appendChat = useCallback((msg: QuickMessage) => {
    setChatMessages(prev => {
      const key = getConversationKey(msg.fromUserId, msg.toUserId);
      const curr = prev[key] || [];
      if (curr.some(m => m.id === msg.id)) return prev;
      return { ...prev, [key]: [...curr, msg].slice(-50) };
    });
  }, []);

  useEffect(() => {
    void fetchProfiles();
    void fetchActivities();

    subscribeOfficeChannel();

    const unsyncPresence = onPresenceSync(syncPresence);
    const unsubMessage = onQuickMessage((payload: any) => {
      const msg = normalizeQuickMessage(payload);
      if (!msg || !currentUser) return;
      if (msg.fromUserId !== currentUser.id && msg.toUserId !== currentUser.id) return;
      appendChat(msg);
      if (msg.toUserId === currentUser.id && chatTargetRef.current?.id !== msg.fromUserId) {
        const sender = membersRef.current.find(m => m.id === msg.fromUserId);
        toast.message(`Mensagem de ${sender?.name || 'alguém'}`, { description: msg.message });
      }
    });

    const actInterval = window.setInterval(() => void fetchActivities(), 5_000);
    const profInterval = window.setInterval(() => void fetchProfiles(), 60_000);
    const clockInterval = window.setInterval(() => setNow(Date.now()), 5_000);

    return () => {
      unsyncPresence();
      unsubMessage();
      window.clearInterval(actInterval);
      window.clearInterval(profInterval);
      window.clearInterval(clockInterval);
      unsubscribeOfficeChannel();
    };
  }, [currentUser, fetchActivities, fetchProfiles, syncPresence, appendChat]);

  const sendQuickMessage = useCallback(async (text: string) => {
    if (!currentUser || !chatTarget?.isOnline) {
      toast.error('A pessoa precisa estar online.');
      return false;
    }
    const msg: QuickMessage = {
      id: crypto.randomUUID(),
      fromUserId: currentUser.id,
      toUserId: chatTarget.id,
      message: text,
      createdAt: new Date().toISOString(),
    };
    const ok = await sendBroadcast(msg);
    if (!ok) return false;
    appendChat(msg);
    return true;
  }, [appendChat, chatTarget, currentUser]);

  const membersWithActivity = useMemo(() => {
    const enriched = members.map(m => ({
      ...m,
      lastSeenAt: presenceByUserId[m.id] || null,
      isOnline: Boolean(presenceByUserId[m.id]) && now - new Date(presenceByUserId[m.id]).getTime() < ONLINE_THRESHOLD_MS,
      activity: activities[m.id] || undefined,
    }));
    const sorted = [...enriched].sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    membersRef.current = sorted;
    return sorted;
  }, [activities, members, now, presenceByUserId]);

  const grouped = useMemo(() => {
    const g: Record<string, TeamMember[]> = {};
    membersWithActivity.forEach(m => { if (!g[m.role]) g[m.role] = []; g[m.role].push(m); });
    return g;
  }, [membersWithActivity]);

  const roleOrder = ['admin', 'videomaker', 'editor', 'designer', 'social_media', 'fotografo', 'parceiro', 'endomarketing'];
  const activeRoles = roleOrder.filter(r => grouped[r]?.length);
  const onlineCount = membersWithActivity.filter(m => m.isOnline).length;
  const conversation = useMemo(() => {
    if (!currentUser || !chatTarget) return [];
    return chatMessages[getConversationKey(currentUser.id, chatTarget.id)] || [];
  }, [chatMessages, chatTarget, currentUser]);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="border-b border-border/60 bg-secondary/30 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <motion.div animate={{ y: [0, -2, 0] }} transition={{ duration: 2, repeat: Infinity }} className="text-2xl">🏢</motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground sm:text-base">Escritório Virtual Pulse</h3>
              <Badge variant="secondary" className="text-[10px] font-mono">🟢 {onlineCount} online</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Acompanhe em tempo real quem está online e o que está fazendo</p>
          </div>
        </div>
      </div>
      <div className="bg-[radial-gradient(circle_at_top,hsl(var(--secondary))_0%,transparent_55%)] px-4 py-5 sm:px-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {activeRoles.map(role => (
            <div key={role} className="rounded-2xl border border-border/70 bg-background/70 p-4 backdrop-blur-sm">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{ROLE_LABEL[role] || role}</p>
                  <p className="text-[11px] text-muted-foreground">{grouped[role].filter(m => m.isOnline).length} ao vivo</p>
                </div>
                <div className="text-xl">{ROLE_EMOJI[role] || '👤'}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {grouped[role].map(m => (
                  <PixelAvatar key={m.id} member={m} onClick={() => setChatTarget(m)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {chatTarget && currentUser && (
          <QuickChatDialog member={chatTarget} currentUserId={currentUser.id}
            messages={conversation} onSend={sendQuickMessage}
            onClose={() => setChatTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

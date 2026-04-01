import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
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
import { ROOMS, shouldBeInCoffeeRoom, type OfficeMember } from './virtual-office/types';
import RpgRoom from './virtual-office/RpgRoom';
import QuickChatDialog from './virtual-office/QuickChatDialog';

const ONLINE_THRESHOLD_MS = 25_000;

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

export default function VirtualOffice() {
  const { currentUser } = useApp();
  const [members, setMembers] = useState<OfficeMember[]>([]);
  const [activities, setActivities] = useState<Record<string, string>>({});
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<Record<string, QuickMessage[]>>({});
  const [chatTarget, setChatTarget] = useState<OfficeMember | null>(null);
  const [now, setNow] = useState(Date.now());
  const membersRef = useRef<OfficeMember[]>([]);
  const chatTargetRef = useRef<OfficeMember | null>(null);
  chatTargetRef.current = chatTarget;

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, name, role, avatar_url') as any;
    if (!data) return;
    setMembers(data.map((p: any) => ({
      id: p.id, name: p.name || 'Usuário', role: p.role as UserRole,
      avatarUrl: p.avatar_url, isOnline: false,
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

  // Enrich members with presence + activity
  const enrichedMembers = useMemo(() => {
    return members.map(m => ({
      ...m,
      isOnline: Boolean(presenceByUserId[m.id]) && now - new Date(presenceByUserId[m.id]).getTime() < ONLINE_THRESHOLD_MS,
      activity: activities[m.id] || undefined,
    }));
  }, [activities, members, now, presenceByUserId]);

  // Sort: online first
  const sortedMembers = useMemo(() => {
    const sorted = [...enrichedMembers].sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    membersRef.current = sorted;
    return sorted;
  }, [enrichedMembers]);

  // Assign members to rooms
  const roomAssignments = useMemo(() => {
    const assignments: Record<string, OfficeMember[]> = {};
    ROOMS.forEach(r => { assignments[r.id] = []; });

    sortedMembers.forEach(m => {
      if (m.isOnline && shouldBeInCoffeeRoom(m)) {
        assignments['coffee'].push(m);
      } else {
        const room = ROOMS.find(r => r.roles.includes(m.role));
        if (room) assignments[room.id].push(m);
      }
    });

    return assignments;
  }, [sortedMembers]);

  const onlineCount = sortedMembers.filter(m => m.isOnline).length;

  const conversation = useMemo(() => {
    if (!currentUser || !chatTarget) return [];
    return chatMessages[getConversationKey(currentUser.id, chatTarget.id)] || [];
  }, [chatMessages, chatTarget, currentUser]);

  // Which rooms have members?
  const activeRooms = ROOMS.filter(r => (roomAssignments[r.id]?.length ?? 0) > 0);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="border-b border-border/60 bg-secondary/30 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-2xl"
          >
            🏰
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-foreground sm:text-base">
                Escritório Virtual Pulse
              </h3>
              <Badge variant="secondary" className="text-[10px] font-mono">
                🟢 {onlineCount} online
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              RPG 2D • Acompanhe a equipe ao vivo
            </p>
          </div>
        </div>
      </div>

      {/* RPG World */}
      <div className="bg-[radial-gradient(ellipse_at_top,hsl(var(--secondary)/0.5)_0%,transparent_70%)] px-3 py-4 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {activeRooms.map(room => (
            <RpgRoom
              key={room.id}
              config={room}
              members={roomAssignments[room.id]}
              onMemberClick={m => setChatTarget(m)}
              isCoffeeRoom={room.id === 'coffee'}
            />
          ))}
        </div>

        {activeRooms.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <span className="text-4xl">🏚️</span>
            <p className="text-sm">Nenhum membro cadastrado no escritório</p>
          </div>
        )}
      </div>

      {/* Quick Chat */}
      <AnimatePresence>
        {chatTarget && currentUser && (
          <QuickChatDialog
            member={chatTarget}
            currentUserId={currentUser.id}
            messages={conversation}
            onSend={sendQuickMessage}
            onClose={() => setChatTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

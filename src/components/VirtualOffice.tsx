import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { useApp } from '@/contexts/AppContext';
import { AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { UserRole } from '@/types';
import {
  subscribeOfficeChannel,
  onPresenceSync,
  onQuickMessage,
  getPresenceState,
  sendBroadcast,
  getConversationKey,
  type QuickMessage,
} from '@/lib/virtualOfficeRealtime';
import { ROOMS, shouldBeInCoffeeRoom, type OfficeMember } from './virtual-office/types';
import PixelRoom from './virtual-office/PixelRoom';
import QuickChatDialog from './virtual-office/QuickChatDialog';

const ONLINE_MS = 120_000;

function normalizeMsg(p: unknown): QuickMessage | null {
  if (!p || typeof p !== 'object') return null;
  const s = p as Record<string, unknown>;
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
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [chatMsgs, setChatMsgs] = useState<Record<string, QuickMessage[]>>({});
  const [chatTarget, setChatTarget] = useState<OfficeMember | null>(null);
  const [now, setNow] = useState(Date.now());
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const membersRef = useRef<OfficeMember[]>([]);
  const chatRef = useRef<OfficeMember | null>(null);
  const prevOnlineRef = useRef<Set<string>>(new Set());
  chatRef.current = chatTarget;

  // Names known to be female
  const FEMALE_NAMES = ['rayssa', 'adrielly', 'naraely', 'priscylla', 'ana', 'mariana', 'thaís', 'thais'];

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, name, role, avatar_url') as any;
    if (!data) return;
    setMembers(data.map((p: any) => {
      const firstName = (p.name || '').split(' ')[0].toLowerCase();
      const gender = FEMALE_NAMES.includes(firstName) ? 'female' as const : 'male' as const;
      return {
        id: p.id, name: p.name || 'Usuário', role: p.role as UserRole,
        avatarUrl: p.avatar_url, isOnline: false, gender,
      };
    }));
  }, []);

  const fetchActivities = useCallback(async () => {
    const act: Record<string, string> = {};
    const [{ data: recs }, { data: ct }, { data: dt }, { data: profiles }] = await Promise.all([
      supabase.from('active_recordings').select('videomaker_id'),
      supabase.from('content_tasks').select('assigned_to, edited_by, reviewing_by, kanban_column').in('kanban_column', ['edicao', 'revisao', 'alteracao', 'aprovacao']),
      supabase.from('design_tasks').select('assigned_to, kanban_column').in('kanban_column', ['em_andamento', 'revisao']),
      supabase.from('profiles').select('id, role'),
    ]) as any;

    // Get current presence to check who actually has heartbeat
    const presState = getPresenceState();
    const activeUserIds = new Set<string>();
    Object.values(presState).forEach(entries => {
      if (!Array.isArray(entries)) return;
      entries.forEach(e => {
        const uid = typeof e?.userId === 'string' ? e.userId : null;
        const hb = typeof e?.heartbeatAt === 'string' ? e.heartbeatAt : null;
        if (uid && hb && (Date.now() - new Date(hb).getTime() < ONLINE_MS)) {
          activeUserIds.add(uid);
        }
      });
    });

    // Social Media e Admin: considerar "gestão" SOMENTE se tiver heartbeat ativo
    profiles?.forEach((p: any) => {
      if ((p.role === 'social_media' || p.role === 'admin') && activeUserIds.has(p.id)) {
        act[p.id] = 'gestao';
      }
    });
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
      entries.forEach(e => {
        const uid = typeof e?.userId === 'string' ? e.userId : null;
        const hb = typeof e?.heartbeatAt === 'string' ? e.heartbeatAt : new Date().toISOString();
        if (!uid) return;
        if (!next[uid] || new Date(hb).getTime() > new Date(next[uid]).getTime()) next[uid] = hb;
      });
    });
    setPresence(next);
    setNow(Date.now());
  }, []);

  const appendChat = useCallback((msg: QuickMessage) => {
    setChatMsgs(prev => {
      const key = getConversationKey(msg.fromUserId, msg.toUserId);
      const cur = prev[key] || [];
      if (cur.some(m => m.id === msg.id)) return prev;
      return { ...prev, [key]: [...cur, msg].slice(-50) };
    });
  }, []);

  useEffect(() => {
    void fetchProfiles();
    void fetchActivities();
    subscribeOfficeChannel();

    const unsync = onPresenceSync(syncPresence);
    const unmsg = onQuickMessage((payload: any) => {
      const msg = normalizeMsg(payload);
      if (!msg || !currentUser) return;
      if (msg.fromUserId !== currentUser.id && msg.toUserId !== currentUser.id) return;
      appendChat(msg);
      if (msg.toUserId === currentUser.id && chatRef.current?.id !== msg.fromUserId) {
        const sender = membersRef.current.find(m => m.id === msg.fromUserId);
        toast.message(`Mensagem de ${sender?.name || 'alguém'}`, { description: msg.message });
      }
    });

    const iv1 = setInterval(() => void fetchActivities(), 5_000);
    const iv2 = setInterval(() => void fetchProfiles(), 60_000);
    const iv3 = setInterval(() => setNow(Date.now()), 5_000);

    return () => { unsync(); unmsg(); clearInterval(iv1); clearInterval(iv2); clearInterval(iv3); };
  }, [currentUser, fetchActivities, fetchProfiles, syncPresence, appendChat]);

  const sendMsg = useCallback(async (text: string) => {
    if (!currentUser || !chatTarget?.isOnline) { toast.error('Pessoa precisa estar online.'); return false; }
    const msg: QuickMessage = { id: crypto.randomUUID(), fromUserId: currentUser.id, toUserId: chatTarget.id, message: text, createdAt: new Date().toISOString() };
    const ok = await sendBroadcast(msg);
    if (!ok) return false;
    appendChat(msg);
    return true;
  }, [appendChat, chatTarget, currentUser]);

  const enriched = useMemo(() => {
    const list = members.map(m => {
      const hasHeartbeat = Boolean(presence[m.id]) && now - new Date(presence[m.id]).getTime() < ONLINE_MS;
      const hasActivity = Boolean(activities[m.id]);
      return {
        ...m,
        isOnline: hasHeartbeat || hasActivity,
        activity: activities[m.id] || undefined,
      };
    });
    list.sort((a, b) => (a.isOnline !== b.isOnline ? (a.isOnline ? -1 : 1) : a.name.localeCompare(b.name)));
    membersRef.current = list;

    // Detect new joins
    const currentOnline = new Set(list.filter(m => m.isOnline).map(m => m.id));
    const prev = prevOnlineRef.current;
    const newJoins = new Set<string>();
    currentOnline.forEach(id => {
      if (!prev.has(id) && id !== currentUser?.id) {
        newJoins.add(id);
        const member = list.find(m => m.id === id);
        if (member) {
          toast.message(`🏰 ${member.name} entrou no escritório!`, { duration: 3000 });
        }
      }
    });
    if (newJoins.size > 0) {
      setJoinedIds(s => {
        const next = new Set(s);
        newJoins.forEach(id => next.add(id));
        // Clear after 3s
        setTimeout(() => setJoinedIds(s2 => {
          const n2 = new Set(s2);
          newJoins.forEach(id => n2.delete(id));
          return n2;
        }), 3000);
        return next;
      });
    }
    prevOnlineRef.current = currentOnline;

    return list;
  }, [activities, members, now, presence, currentUser]);

  const roomAssign = useMemo(() => {
    const a: Record<string, OfficeMember[]> = {};
    ROOMS.forEach(r => { a[r.id] = []; });
    enriched.forEach(m => {
      if (m.isOnline && shouldBeInCoffeeRoom(m)) { a['coffee'].push(m); }
      else { const room = ROOMS.find(r => r.roles.includes(m.role)); if (room) a[room.id].push(m); }
    });
    return a;
  }, [enriched]);

  const onlineCount = enriched.filter(m => m.isOnline).length;
  const activeRooms = ROOMS.filter(r => (roomAssign[r.id]?.length ?? 0) > 0);
  const convo = useMemo(() => {
    if (!currentUser || !chatTarget) return [];
    return chatMsgs[getConversationKey(currentUser.id, chatTarget.id)] || [];
  }, [chatMsgs, chatTarget, currentUser]);

  return (
    <div className="overflow-hidden rounded-2xl" style={{ border: '4px solid #6b4423', backgroundColor: '#c4a56e', boxShadow: '0 4px 0 #4a2d10' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: '#6b4423', borderBottom: '3px solid #4a2d10' }}>
        <div className="flex items-center gap-2">
          <span className="text-xl">🏰</span>
          <div>
            <h3 className="text-sm font-bold" style={{ color: '#e5d5b5' }}>Escritório Virtual Pulse</h3>
            <p className="text-[10px]" style={{ color: '#b5a585' }}>Pixel World • Equipe ao vivo</p>
          </div>
        </div>
        <Badge className="text-[10px] font-mono border-0" style={{ backgroundColor: '#22c55e22', color: '#86efac' }}>
          🟢 {onlineCount} online
        </Badge>
      </div>

      {/* World grid */}
      <div className="p-3" style={{
        backgroundImage: `
          repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(0,0,0,0.06) 19px, rgba(0,0,0,0.06) 20px),
          repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(0,0,0,0.06) 19px, rgba(0,0,0,0.06) 20px)
        `,
      }}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {activeRooms.map(room => (
            <PixelRoom key={room.id} config={room} members={roomAssign[room.id]} onMemberClick={setChatTarget} isCoffeeRoom={room.id === 'coffee'} joinedIds={joinedIds} />
          ))}
        </div>
        {activeRooms.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <span className="text-3xl">🏚️</span>
            <p className="text-xs" style={{ color: '#8a7a5a' }}>Nenhum membro no escritório</p>
          </div>
        )}
      </div>

      {/* Quick Chat */}
      <AnimatePresence>
        {chatTarget && currentUser && (
          <QuickChatDialog member={chatTarget} currentUserId={currentUser.id} messages={convo} onSend={sendMsg} onClose={() => setChatTarget(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

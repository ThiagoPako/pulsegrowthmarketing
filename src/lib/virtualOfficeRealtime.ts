import { supabase as supabaseReal } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimeChannelSendResponse } from '@supabase/supabase-js';

export interface QuickMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  createdAt: string;
}

type ChannelStatus = 'closed' | 'subscribing' | 'subscribed';

const CHANNEL_NAME = 'vo-presence';
const PRESENCE_KEY = `vo-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`}`;

let _channel: RealtimeChannel | null = null;
let _refCount = 0;
let _status: ChannelStatus = 'closed';
let _pendingPresence:
  | {
      userId: string;
      heartbeatAt: string;
    }
  | null = null;

const _onSyncCallbacks = new Set<() => void>();
const _onBroadcastCallbacks = new Set<(payload: any) => void>();

function notifyPresenceSync() {
  _onSyncCallbacks.forEach(cb => cb());
}

function ensureChannel(): RealtimeChannel {
  if (_channel) return _channel;

  _channel = supabaseReal.channel(CHANNEL_NAME, {
    config: {
      presence: { key: PRESENCE_KEY },
      broadcast: { self: false, ack: true },
    },
  });

  _channel
    .on('presence', { event: 'sync' }, notifyPresenceSync)
    .on('presence', { event: 'join' }, notifyPresenceSync)
    .on('presence', { event: 'leave' }, notifyPresenceSync)
    .on('broadcast', { event: 'quick_message' }, ({ payload }) => {
      _onBroadcastCallbacks.forEach(cb => cb(payload));
    });

  return _channel;
}

function startSubscription() {
  const ch = ensureChannel();
  if (_status === 'subscribed' || _status === 'subscribing') return ch;

  _status = 'subscribing';
  ch.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      _status = 'subscribed';
      if (_pendingPresence) {
        try {
          await ch.track(_pendingPresence);
        } catch {
          // ignore track race and rely on next heartbeat
        }
      }
      notifyPresenceSync();
      return;
    }

    if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      _status = 'closed';
    }
  });

  return ch;
}

function isSubscribed() {
  return _status === 'subscribed';
}

async function waitForSubscribed(timeoutMs = 4000) {
  if (isSubscribed()) return true;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (isSubscribed()) return true;
    await new Promise(resolve => window.setTimeout(resolve, 50));
  }

  return isSubscribed();
}

export function subscribeOfficeChannel(): RealtimeChannel {
  const ch = startSubscription();
  _refCount++;
  return ch;
}

export function unsubscribeOfficeChannel() {
  _refCount--;
  if (_refCount <= 0 && _channel) {
    _status = 'closed';
    void supabaseReal.removeChannel(_channel);
    _channel = null;
    _refCount = 0;
    _pendingPresence = null;
    _onSyncCallbacks.clear();
    _onBroadcastCallbacks.clear();
  }
}

export function onPresenceSync(cb: () => void) {
  ensureChannel();
  _onSyncCallbacks.add(cb);
  return () => {
    _onSyncCallbacks.delete(cb);
  };
}

export function onQuickMessage(cb: (payload: any) => void) {
  ensureChannel();
  _onBroadcastCallbacks.add(cb);
  return () => {
    _onBroadcastCallbacks.delete(cb);
  };
}

export function getPresenceState(): Record<string, any[]> {
  if (!_channel) return {};
  return _channel.presenceState() as Record<string, any[]>;
}

export async function trackPresence(userId: string) {
  const ch = startSubscription();
  const payload = {
    userId,
    heartbeatAt: new Date().toISOString(),
  };

  _pendingPresence = payload;

  const ready = await waitForSubscribed();
  if (!ready) return false;

  try {
    await ch.track(payload);
    notifyPresenceSync();
    return true;
  } catch {
    return false;
  }
}

export async function untrackPresence() {
  if (!_channel) return;
  try {
    await _channel.untrack();
    _pendingPresence = null;
    notifyPresenceSync();
  } catch {
    // ignore
  }
}

export async function sendBroadcast(payload: any): Promise<boolean> {
  const ch = startSubscription();
  const ready = await waitForSubscribed();
  if (!ready) return false;

  const result: RealtimeChannelSendResponse = await ch.send({
    type: 'broadcast',
    event: 'quick_message',
    payload,
  });

  return result === 'ok';
}

export function getConversationKey(userA: string, userB: string) {
  return [userA, userB].sort().join(':');
}

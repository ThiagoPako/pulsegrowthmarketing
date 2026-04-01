import { supabase as supabaseReal } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface QuickMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  createdAt: string;
}

const CHANNEL_NAME = 'vo-presence';

let _channel: RealtimeChannel | null = null;
let _refCount = 0;
let _subscribed = false;
const _onSyncCallbacks = new Set<() => void>();
const _onBroadcastCallbacks = new Set<(payload: any) => void>();

function ensureChannel(): RealtimeChannel {
  if (_channel) return _channel;

  _channel = supabaseReal.channel(CHANNEL_NAME, {
    config: {
      presence: { key: '' },
      broadcast: { self: false, ack: true },
    },
  });

  _channel
    .on('presence', { event: 'sync' }, () => {
      _onSyncCallbacks.forEach(cb => cb());
    })
    .on('presence', { event: 'join' }, () => {
      _onSyncCallbacks.forEach(cb => cb());
    })
    .on('presence', { event: 'leave' }, () => {
      _onSyncCallbacks.forEach(cb => cb());
    })
    .on('broadcast', { event: 'quick_message' }, ({ payload }) => {
      _onBroadcastCallbacks.forEach(cb => cb(payload));
    });

  return _channel;
}

export function subscribeOfficeChannel(): RealtimeChannel {
  const ch = ensureChannel();
  _refCount++;

  if (!_subscribed) {
    _subscribed = true;
    ch.subscribe();
  }

  return ch;
}

export function unsubscribeOfficeChannel() {
  _refCount--;
  if (_refCount <= 0 && _channel) {
    _subscribed = false;
    void supabaseReal.removeChannel(_channel);
    _channel = null;
    _refCount = 0;
    _onSyncCallbacks.clear();
    _onBroadcastCallbacks.clear();
  }
}

export function onPresenceSync(cb: () => void) {
  ensureChannel();
  _onSyncCallbacks.add(cb);
  return () => { _onSyncCallbacks.delete(cb); };
}

export function onQuickMessage(cb: (payload: any) => void) {
  ensureChannel();
  _onBroadcastCallbacks.add(cb);
  return () => { _onBroadcastCallbacks.delete(cb); };
}

export function getPresenceState(): Record<string, any[]> {
  if (!_channel) return {};
  return _channel.presenceState() as Record<string, any[]>;
}

export async function trackPresence(userId: string) {
  const ch = ensureChannel();
  try {
    await ch.track({
      userId,
      heartbeatAt: new Date().toISOString(),
    });
  } catch {
    // ignore
  }
}

export async function untrackPresence() {
  if (!_channel) return;
  try {
    await _channel.untrack();
  } catch {
    // ignore
  }
}

export async function sendBroadcast(payload: any): Promise<boolean> {
  if (!_channel) return false;
  const result = await _channel.send({
    type: 'broadcast',
    event: 'quick_message',
    payload,
  });
  return result === 'ok';
}

export function getConversationKey(userA: string, userB: string) {
  return [userA, userB].sort().join(':');
}

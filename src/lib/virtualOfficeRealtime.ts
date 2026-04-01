import { supabase as supabaseReal } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimeChannelSendResponse } from '@supabase/supabase-js';

export interface QuickMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  createdAt: string;
}

const CHANNEL_NAME = 'vo-shared';

let _channel: RealtimeChannel | null = null;
let _subscribed = false;
let _subscribing = false;

const _onSyncCallbacks = new Set<() => void>();
const _onBroadcastCallbacks = new Set<(payload: any) => void>();

function fireSyncCallbacks() {
  _onSyncCallbacks.forEach(cb => {
    try { cb(); } catch { /* ignore */ }
  });
}

function getOrCreateChannel(): RealtimeChannel {
  if (_channel) return _channel;

  _channel = supabaseReal.channel(CHANNEL_NAME, {
    config: {
      presence: { key: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      broadcast: { self: false, ack: true },
    },
  });

  // Register ALL event handlers BEFORE subscribe
  _channel
    .on('presence', { event: 'sync' }, fireSyncCallbacks)
    .on('presence', { event: 'join' }, fireSyncCallbacks)
    .on('presence', { event: 'leave' }, fireSyncCallbacks)
    .on('broadcast', { event: 'quick_message' }, ({ payload }) => {
      _onBroadcastCallbacks.forEach(cb => {
        try { cb(payload); } catch { /* ignore */ }
      });
    });

  return _channel;
}

function doSubscribe() {
  if (_subscribed || _subscribing) return;
  const ch = getOrCreateChannel();
  _subscribing = true;

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      _subscribed = true;
      _subscribing = false;
      fireSyncCallbacks();
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      _subscribed = false;
      _subscribing = false;
    }
  });
}

async function waitReady(ms = 5000): Promise<boolean> {
  if (_subscribed) return true;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (_subscribed) return true;
    await new Promise(r => setTimeout(r, 60));
  }
  return _subscribed;
}

// ── Public API ──

/** Ensure the shared channel is alive and subscribed. Safe to call many times. */
export function subscribeOfficeChannel() {
  doSubscribe();
}

/** No-op — channel is kept alive for the app lifetime. */
export function unsubscribeOfficeChannel() {
  // intentionally kept alive as a true singleton
}

export function onPresenceSync(cb: () => void) {
  _onSyncCallbacks.add(cb);
  return () => { _onSyncCallbacks.delete(cb); };
}

export function onQuickMessage(cb: (payload: any) => void) {
  _onBroadcastCallbacks.add(cb);
  return () => { _onBroadcastCallbacks.delete(cb); };
}

export function getPresenceState(): Record<string, any[]> {
  if (!_channel) return {};
  try { return _channel.presenceState() as Record<string, any[]>; } catch { return {}; }
}

export async function trackPresence(userId: string) {
  doSubscribe();
  const ready = await waitReady();
  if (!ready || !_channel) return false;
  try {
    await _channel.track({ userId, heartbeatAt: new Date().toISOString() });
    fireSyncCallbacks();
    return true;
  } catch { return false; }
}

export async function untrackPresence() {
  if (!_channel) return;
  try { await _channel.untrack(); } catch { /* ignore */ }
}

export async function sendBroadcast(payload: any): Promise<boolean> {
  doSubscribe();
  const ready = await waitReady();
  if (!ready || !_channel) return false;
  try {
    const r: RealtimeChannelSendResponse = await _channel.send({
      type: 'broadcast', event: 'quick_message', payload,
    });
    return r === 'ok';
  } catch { return false; }
}

export function getConversationKey(a: string, b: string) {
  return [a, b].sort().join(':');
}

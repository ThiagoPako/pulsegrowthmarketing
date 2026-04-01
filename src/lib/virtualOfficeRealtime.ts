/**
 * Virtual Office Realtime — VPS WebSocket-based presence & quick chat
 * Connects to wss://agenciapulse.tech/ws/office
 */

export interface QuickMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  createdAt: string;
}

const WS_URL = 'wss://agenciapulse.tech/ws/office';
const REST_BASE = 'https://agenciapulse.tech/api';

let _ws: WebSocket | null = null;
let _connecting = false;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _currentUserId: string | null = null;

const _onSyncCallbacks = new Set<() => void>();
const _onBroadcastCallbacks = new Set<(payload: any) => void>();

// In-memory presence state (updated from server broadcasts)
let _presenceUsers: Array<{ userId: string; heartbeatAt: string }> = [];

function fireSyncCallbacks() {
  _onSyncCallbacks.forEach(cb => {
    try { cb(); } catch { /* ignore */ }
  });
}

function scheduleReconnect() {
  if (_reconnectTimer) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    connectWs();
  }, 3000);
}

function connectWs() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
  if (_connecting) return;
  _connecting = true;

  try {
    _ws = new WebSocket(WS_URL);
  } catch {
    _connecting = false;
    scheduleReconnect();
    return;
  }

  _ws.onopen = () => {
    _connecting = false;
    // If we have a userId, immediately send heartbeat
    if (_currentUserId) {
      _ws?.send(JSON.stringify({ type: 'heartbeat', userId: _currentUserId }));
    }
  };

  _ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'presence_sync') {
        _presenceUsers = data.users || [];
        fireSyncCallbacks();
      } else if (data.type === 'quick_message') {
        _onBroadcastCallbacks.forEach(cb => {
          try { cb(data.payload); } catch { /* ignore */ }
        });
      }
    } catch { /* ignore */ }
  };

  _ws.onclose = () => {
    _connecting = false;
    _ws = null;
    scheduleReconnect();
  };

  _ws.onerror = () => {
    _connecting = false;
    try { _ws?.close(); } catch { /* ignore */ }
    _ws = null;
    scheduleReconnect();
  };
}

// ── REST polling fallback ──
let _pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollPresenceRest() {
  try {
    const res = await fetch(`${REST_BASE}/presence`);
    if (!res.ok) return;
    const data = await res.json();
    _presenceUsers = data.users || [];
    fireSyncCallbacks();
  } catch { /* ignore */ }
}

function startPolling() {
  if (_pollTimer) return;
  // Initial poll
  void pollPresenceRest();
  // Poll every 5 seconds as fallback
  _pollTimer = setInterval(() => {
    // If WS is connected, skip REST poll
    if (_ws && _ws.readyState === WebSocket.OPEN) return;
    void pollPresenceRest();
  }, 5_000);
}

// ── Public API ──

/** Ensure WebSocket connection is alive. Safe to call many times. */
export function subscribeOfficeChannel() {
  connectWs();
  startPolling(); // Always start polling as fallback
}

/** No-op — connection is kept alive for the app lifetime. */
export function unsubscribeOfficeChannel() {
  // intentionally kept alive
}

export function onPresenceSync(cb: () => void) {
  _onSyncCallbacks.add(cb);
  return () => { _onSyncCallbacks.delete(cb); };
}

export function onQuickMessage(cb: (payload: any) => void) {
  _onBroadcastCallbacks.add(cb);
  return () => { _onBroadcastCallbacks.delete(cb); };
}

/** Get current presence state as a map compatible with previous API */
export function getPresenceState(): Record<string, any[]> {
  const state: Record<string, any[]> = {};
  for (const user of _presenceUsers) {
    const key = `user-${user.userId}`;
    state[key] = [user];
  }
  return state;
}

export async function trackPresence(userId: string): Promise<boolean> {
  _currentUserId = userId;
  connectWs();

  // Try WebSocket first
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    try {
      _ws.send(JSON.stringify({ type: 'heartbeat', userId }));
      return true;
    } catch { /* fall through to REST */ }
  }

  // REST fallback
  try {
    const token = localStorage.getItem('pulse_jwt');
    await fetch(`${REST_BASE}/presence/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ userId }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function untrackPresence(): Promise<void> {
  const userId = _currentUserId;
  _currentUserId = null;

  if (_ws && _ws.readyState === WebSocket.OPEN && userId) {
    try { _ws.send(JSON.stringify({ type: 'leave', userId })); } catch { /* ignore */ }
  }

  // Also REST fallback
  if (userId) {
    try {
      const token = localStorage.getItem('pulse_jwt');
      await fetch(`${REST_BASE}/presence/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId }),
      });
    } catch { /* ignore */ }
  }
}

export async function sendBroadcast(payload: any): Promise<boolean> {
  connectWs();

  if (_ws && _ws.readyState === WebSocket.OPEN) {
    try {
      _ws.send(JSON.stringify({ type: 'quick_message', payload }));
      return true;
    } catch { /* fall through */ }
  }

  // REST fallback
  try {
    const token = localStorage.getItem('pulse_jwt');
    await fetch(`${REST_BASE}/quick-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    return true;
  } catch {
    return false;
  }
}

export function getConversationKey(a: string, b: string) {
  return [a, b].sort().join(':');
}

/** Send leave signal via sendBeacon — works reliably on tab/browser close */
export function sendLeaveBeacon(userId: string) {
  try {
    const url = `${REST_BASE}/presence/leave`;
    const body = JSON.stringify({ userId });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    } else {
      // Fallback: fire-and-forget fetch
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* ignore */ }
}

/** Fetch presence via REST (polling fallback when WS is down) */
export async function fetchPresenceRest(): Promise<any[]> {
  try {
    const res = await fetch(`${REST_BASE}/presence`);
    const data = await res.json();
    return data.users || [];
  } catch {
    return [];
  }
}

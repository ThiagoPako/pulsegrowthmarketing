// Sistema de controle remoto da TV operacional
// Usa a tabela tv_settings (chave 'remote_command') como canal de comandos.
// O TvDashboard faz polling a cada 2s e executa comandos novos (id maior que último).

const VPS = 'https://agenciapulse.tech/api';

export type TvRemoteAction =
  | 'play'
  | 'pause'
  | 'next'
  | 'mute'
  | 'unmute'
  | 'set_playlist'
  | 'set_visibility'
  | 'show_alert'
  | 'clear_alert'
  | 'reload';

export interface TvRemoteCommand {
  id: number; // timestamp (ms)
  action: TvRemoteAction;
  payload?: Record<string, any>;
  ts: string;
}

export const VISIBILITY_KEYS = [
  'show_radio',
  'show_schedule',
  'show_pipeline',
  'show_banners',
  'show_team',
  'show_posts',
] as const;

export type VisibilityKey = typeof VISIBILITY_KEYS[number];

async function upsertSetting(key: string, value: string) {
  const body = { value, updated_at: new Date().toISOString() };
  // Try patch first, fallback to insert
  const patch = await fetch(`${VPS}/data/tv_settings?key=eq.${key}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (patch.ok) {
    const text = await patch.text();
    if (text && text !== '[]') return;
  }
  await fetch(`${VPS}/data/tv_settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, ...body }),
  });
}

export async function sendTvCommand(action: TvRemoteAction, payload?: Record<string, any>) {
  const cmd: TvRemoteCommand = {
    id: Date.now(),
    action,
    payload,
    ts: new Date().toISOString(),
  };
  await upsertSetting('remote_command', JSON.stringify(cmd));
  // Local broadcast (mesmo navegador) — instantâneo
  try {
    const bc = new BroadcastChannel('pulse_tv_remote');
    bc.postMessage(cmd);
    bc.close();
  } catch {}
  return cmd;
}

export async function fetchTvSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${VPS}/data/tv_settings`);
    if (!res.ok) return {};
    const rows: { key: string; value: string }[] = await res.json();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  } catch {
    return {};
  }
}

export async function fetchLatestCommand(): Promise<TvRemoteCommand | null> {
  try {
    const res = await fetch(`${VPS}/data/tv_settings?key=eq.remote_command`);
    if (!res.ok) return null;
    const rows: { value: string }[] = await res.json();
    if (!rows.length) return null;
    return JSON.parse(rows[0].value) as TvRemoteCommand;
  } catch {
    return null;
  }
}

export async function saveVisibility(key: VisibilityKey, visible: boolean) {
  await upsertSetting(key, String(visible));
  await sendTvCommand('set_visibility', { key, visible });
}

export async function savePlaylistAndBroadcast(url: string) {
  await upsertSetting('youtube_playlist_url', url);
  await sendTvCommand('set_playlist', { url });
}

export async function broadcastAlert(message: string, durationMs = 15000, tone: 'info' | 'success' | 'warning' = 'info') {
  await sendTvCommand('show_alert', { message, durationMs, tone });
}

// Sistema de controle remoto da TV operacional
// Usa a tabela tv_settings (chave 'remote_command') como canal de comandos, pela rota
// /api/tv/settings: o /painel-tv grava (só admin) e o TvDashboard lê a cada 2,5 s e
// executa comandos novos (id maior que o último).

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

// Chave da TV (/tv?tv_token=...) e login da equipe guardado no navegador: os mesmos do /api/tv-dashboard.
function tvToken(): string {
  try { return new URLSearchParams(window.location.search).get('tv_token') || ''; } catch { return ''; }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  let token: string | null = null;
  try { token = localStorage.getItem('pulse_jwt'); } catch { /* storage bloqueado */ }
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// Lança erro quando o servidor não gravou: o painel mostra a falha em vez de "enviado".
async function upsertSetting(key: string, value: string) {
  const res = await fetch(`${VPS}/tv/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Falha ao salvar na TV (HTTP ${res.status})`);
  }
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

export interface TvRemoteState {
  settings: Record<string, string>;
  command: TvRemoteCommand | null;
}

/** Configurações e último comando numa leitura só. null quando a API não respondeu. */
export async function fetchTvRemoteState(): Promise<TvRemoteState | null> {
  try {
    const token = tvToken();
    const url = token ? `${VPS}/tv/settings?tv_token=${encodeURIComponent(token)}` : `${VPS}/tv/settings`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return null;
    const data = await res.json();
    const settings: Record<string, string> = data?.settings && typeof data.settings === 'object' ? data.settings : {};
    let command: TvRemoteCommand | null = null;
    if (settings.remote_command) {
      try { command = JSON.parse(settings.remote_command) as TvRemoteCommand; } catch { command = null; }
    }
    return { settings, command };
  } catch {
    return null;
  }
}

export async function fetchTvSettings(): Promise<Record<string, string>> {
  return (await fetchTvRemoteState())?.settings || {};
}

export async function fetchLatestCommand(): Promise<TvRemoteCommand | null> {
  return (await fetchTvRemoteState())?.command || null;
}

/** Playlist salva pela própria TV: só grava para todas quando quem abriu a TV é admin. */
export async function saveTvPlaylist(url: string) {
  await upsertSetting('youtube_playlist_url', url);
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

/**
 * Registro de tempo de espera do videomaker (cliente atrasado).
 *
 * Estratégia defensiva: o cronômetro local SEMPRE inicia, mesmo que a
 * persistência na VPS falhe no momento do clique (rede, tabela ausente etc.).
 * Ao encerrar, se o registro inicial não foi persistido, tentamos inserir o
 * log completo (início + fim) de uma vez. O estado é espelhado em localStorage
 * para sobreviver a re-renderizações/recarregamentos da página.
 */
import { supabase } from '@/lib/vpsDb';

export interface WaitSession {
  logId: string;
  recordingId: string;
  videomakerId: string;
  clientId: string;
  startedAt: string; // ISO
  persisted: boolean;
}

const STORAGE_PREFIX = 'pulse_wait_session:';

function storageKey(recordingId: string) {
  return `${STORAGE_PREFIX}${recordingId}`;
}

export function loadWaitSession(recordingId: string): WaitSession | null {
  try {
    const raw = localStorage.getItem(storageKey(recordingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WaitSession;
    if (!parsed?.logId || !parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveWaitSession(session: WaitSession) {
  try { localStorage.setItem(storageKey(session.recordingId), JSON.stringify(session)); } catch { /* ignore */ }
}

export function clearWaitSession(recordingId: string) {
  try { localStorage.removeItem(storageKey(recordingId)); } catch { /* ignore */ }
}

/** Inicia uma espera. Nunca lança — retorna a sessão (persistida ou não). */
export async function startWaitSession(params: {
  recordingId: string;
  videomakerId: string;
  clientId: string;
}): Promise<WaitSession> {
  const existing = loadWaitSession(params.recordingId);
  if (existing) return existing;

  const session: WaitSession = {
    logId: crypto.randomUUID(),
    recordingId: params.recordingId,
    videomakerId: params.videomakerId,
    clientId: params.clientId,
    startedAt: new Date().toISOString(),
    persisted: false,
  };

  try {
    const { error } = await supabase.from('recording_wait_logs').insert({
      id: session.logId,
      recording_id: session.recordingId,
      videomaker_id: session.videomakerId,
      client_id: session.clientId,
      started_at: session.startedAt,
    } as any);
    if (error) {
      console.warn('[recordingWait] insert falhou, mantendo cronômetro local:', error.message || error);
    } else {
      session.persisted = true;
    }
  } catch (err) {
    console.warn('[recordingWait] insert exception:', err);
  }

  saveWaitSession(session);
  return session;
}

export function waitElapsedSeconds(session: WaitSession | null, now: number = Date.now()): number {
  if (!session) return 0;
  return Math.max(0, Math.floor((now - new Date(session.startedAt).getTime()) / 1000));
}

/** Encerra a espera e grava a duração. Retorna segundos de espera. */
export async function stopWaitSession(session: WaitSession): Promise<{ seconds: number; persisted: boolean }> {
  const endedAt = new Date();
  const seconds = waitElapsedSeconds(session, endedAt.getTime());
  let persisted = false;

  try {
    if (session.persisted) {
      const { error } = await supabase
        .from('recording_wait_logs')
        .update({ ended_at: endedAt.toISOString(), wait_duration_seconds: seconds } as any)
        .eq('id', session.logId);
      persisted = !error;
      if (error) console.warn('[recordingWait] update falhou:', error.message || error);
    }
    if (!persisted) {
      // Insert completo (fallback quando o start não persistiu ou o update falhou)
      const { error } = await supabase.from('recording_wait_logs').insert({
        id: session.persisted ? crypto.randomUUID() : session.logId,
        recording_id: session.recordingId,
        videomaker_id: session.videomakerId,
        client_id: session.clientId,
        started_at: session.startedAt,
        ended_at: endedAt.toISOString(),
        wait_duration_seconds: seconds,
      } as any);
      persisted = !error;
      if (error) console.error('[recordingWait] fallback insert falhou:', error.message || error);
    }
  } catch (err) {
    console.error('[recordingWait] stop exception:', err);
  }

  clearWaitSession(session.recordingId);
  return { seconds, persisted };
}

export function formatWaitDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

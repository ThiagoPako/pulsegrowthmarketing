/**
 * Versão leve dos vídeos para assistir.
 *
 * A VPS grava ao lado de cada vídeo enviado uma cópia leve (<nome>.web.mp4: H.264 ~6 Mbps com
 * faststart). Os players perguntam a /api/media/playback qual arquivo tocar, uma vez antes de dar
 * o play, e tocam direto do nginx. Sem versão leve (ainda convertendo, vídeo externo, sem login) o
 * player toca o original. A URL escolhida não muda no meio da reprodução.
 *
 * Baixar, postar (scheduled_posts.media_url), enviar ao cliente: sempre o original, que é o que
 * está gravado no banco. Nada aqui altera URL gravada.
 */
import { portalHeaders } from '@/lib/portalApi';

const API_BASE = 'https://agenciapulse.tech/api';
const SITE_ORIGIN = 'https://agenciapulse.tech';
const VIDEO_PATH_RE = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i;
const BATCH_DELAY_MS = 30;
const BATCH_MAX = 60;
const REQUEST_TIMEOUT_MS = 6000;
// Versão leve achada: vale por bastante tempo. "Ainda não tem": pergunta de novo logo.
const WEB_TTL_MS = 30 * 60_000;
const ORIGINAL_TTL_MS = 15_000;

export type PlaybackVariant = 'web' | 'original';
export interface Playback {
  url: string;
  variant: PlaybackVariant;
}

/** Vídeo gravado na VPS (/uploads/...) que pode ter versão leve. */
export function canHaveWebVariant(url: string | null | undefined): boolean {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('blob:') || raw.startsWith('data:')) return false;
  if (!raw.startsWith('/uploads/') && !raw.startsWith(`${SITE_ORIGIN}/uploads/`)) return false;
  let pathname: string;
  try {
    pathname = new URL(raw, SITE_ORIGIN).pathname;
  } catch {
    return false;
  }
  if (!pathname.startsWith('/uploads/') || pathname.startsWith('/uploads/training-videos/')) return false;
  if (/\.web\.mp4$/i.test(pathname)) return false;
  return VIDEO_PATH_RE.test(pathname);
}

const original = (url: string): Playback => ({ url, variant: 'original' });
const cache = new Map<string, { playback: Playback; until: number }>();

function cacheKey(url: string, avulsoTaskId?: string) {
  return `${avulsoTaskId || ''}|${url}`;
}

function remember(key: string, playback: Playback) {
  cache.set(key, { playback, until: Date.now() + (playback.variant === 'web' ? WEB_TTL_MS : ORIGINAL_TTL_MS) });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
}

function sessionHeaders(): Record<string, string> {
  const headers = portalHeaders();
  delete headers['Content-Type'];
  return headers;
}

function hasSession(avulsoTaskId?: string) {
  if (avulsoTaskId) return true;
  const headers = sessionHeaders();
  return !!headers.Authorization || !!headers['x-portal-token'];
}

/**
 * Decisão sem rede: o próprio original (não é vídeo da VPS, sem login) ou a resposta guardada.
 * null quando precisa perguntar ao servidor.
 */
export function peekPlayback(url: string | null | undefined, options: { avulsoTaskId?: string } = {}): Playback | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (!canHaveWebVariant(raw) || !hasSession(options.avulsoTaskId)) return original(raw);
  const hit = cache.get(cacheKey(raw, options.avulsoTaskId));
  if (hit && hit.until > Date.now()) return hit.playback;
  return null;
}

// Pedidos juntados em lote: a biblioteca do portal abre vários cards de uma vez.
type Waiter = (playback: Playback) => void;
const batches = new Map<string, { waiters: Map<string, Waiter[]>; timer: ReturnType<typeof setTimeout> }>();

async function flush(avulsoTaskId: string) {
  const batch = batches.get(avulsoTaskId);
  batches.delete(avulsoTaskId);
  if (!batch) return;
  const urls = [...batch.waiters.keys()];
  for (let i = 0; i < urls.length; i += BATCH_MAX) {
    const chunk = urls.slice(i, i + BATCH_MAX);
    const answers = new Map<string, Playback>();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}/media/playback`, {
        method: 'POST',
        headers: { ...sessionHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: chunk, ...(avulsoTaskId ? { avulso: avulsoTaskId } : {}) }),
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        for (const item of Array.isArray(data?.items) ? data.items : []) {
          if (typeof item?.url !== 'string') continue;
          const playback: Playback = item.variant === 'web' && typeof item.playback === 'string'
            ? { url: item.playback, variant: 'web' }
            : original(item.url);
          answers.set(item.url, playback);
          remember(cacheKey(item.url, avulsoTaskId), playback);
        }
      }
    } catch {
      // rede/servidor fora: toca o original
    } finally {
      clearTimeout(timer);
    }
    for (const url of chunk) {
      const playback = answers.get(url) || original(url);
      for (const done of batch.waiters.get(url) || []) done(playback);
    }
  }
}

function ask(url: string, avulsoTaskId: string): Promise<Playback> {
  return new Promise((resolve) => {
    let batch = batches.get(avulsoTaskId);
    if (!batch) {
      batch = { waiters: new Map(), timer: setTimeout(() => void flush(avulsoTaskId), BATCH_DELAY_MS) };
      batches.set(avulsoTaskId, batch);
    }
    const list = batch.waiters.get(url) || [];
    list.push(resolve);
    batch.waiters.set(url, list);
  });
}

/**
 * Qual arquivo tocar para assistir `url`. Resolve sempre (nunca rejeita): sem resposta em
 * `timeoutMs`, toca o original. Chame uma vez por reprodução e não troque o src depois.
 */
export function resolvePlayback(
  url: string,
  options: { avulsoTaskId?: string; timeoutMs?: number } = {},
): Promise<Playback> {
  const raw = String(url || '').trim();
  const decided = peekPlayback(raw, options);
  if (decided) return Promise.resolve(decided);
  const { avulsoTaskId = '', timeoutMs = 2500 } = options;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(original(raw)), timeoutMs);
    ask(raw, avulsoTaskId).then((playback) => {
      clearTimeout(timer);
      resolve(playback);
    });
  });
}

/** Só para os testes. */
export function __resetPlaybackCache() {
  cache.clear();
  for (const batch of batches.values()) clearTimeout(batch.timer);
  batches.clear();
}

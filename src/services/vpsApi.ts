/**
 * VPS API Service - Hybrid approach
 * Uses agenciapulse.tech for file uploads/media serving
 * Keeps Supabase/Lovable Cloud for auth, database, realtime
 */

const VPS_BASE_URL = 'https://agenciapulse.tech/api';
const VPS_UPLOADS_URL = 'https://agenciapulse.tech/uploads';

function normalizeVpsPath(path: string) {
  return path.replace(/^\/+/, '').replace(/^uploads\//, '');
}

function buildPublicVpsUrl(path: string) {
  return `${VPS_UPLOADS_URL}/${normalizeVpsPath(path)}`;
}

function resolveUploadUrl(data: any, folder?: string) {
  if (typeof data?.path === 'string' && data.path.trim()) {
    return buildPublicVpsUrl(data.path.trim());
  }

  if (typeof data?.url === 'string' && data.url.trim()) {
    const rawUrl = data.url.trim();

    if (rawUrl.startsWith(VPS_UPLOADS_URL)) return rawUrl;
    if (rawUrl.startsWith('/uploads/')) return `https://agenciapulse.tech${rawUrl}`;
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return rawUrl;

    return buildPublicVpsUrl(rawUrl);
  }

  if (typeof data?.filename === 'string' && data.filename.trim()) {
    const baseFolder = folder ? `${normalizeVpsPath(folder)}/` : '';
    return buildPublicVpsUrl(`${baseFolder}${data.filename.trim()}`);
  }

  throw new Error('Upload succeeded but no public URL was returned');
}

const VERIFY_UPLOAD_ATTEMPTS = 6;
const VERIFY_UPLOAD_TIMEOUT_MS = 12000;
const VERIFY_UPLOAD_DELAY_MS = 1500;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withCacheBust(url: string, attempt: number) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_verify=${Date.now()}-${attempt}`;
}

/**
 * Verify a URL is accessible via a lightweight HEAD check.
 * Works for any file type (images, videos, documents).
 */
async function verifyUrlAccessible(url: string): Promise<void> {
  const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Arquivo não acessível publicamente (HTTP ${response.status}).`);
  }
}

async function verifyWithRetry(url: string, verifier: (url: string) => Promise<void>): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= VERIFY_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      await verifier(withCacheBust(url, attempt));
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Falha ao validar arquivo enviado.');

      if (attempt < VERIFY_UPLOAD_ATTEMPTS) {
        await wait(VERIFY_UPLOAD_DELAY_MS * attempt);
      }
    }
  }

  throw lastError ?? new Error('Falha ao validar arquivo enviado.');
}

function isVpsAssetUrl(url: string) {
  try {
    return new URL(url).origin === new URL(VPS_UPLOADS_URL).origin;
  } catch {
    return false;
  }
}

function isBrowserBlockedFetch(error: unknown) {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return /failed to fetch|load failed|networkerror/i.test(error.message);
}

async function verifyUploadedFile(url: string, file: File): Promise<void> {
  if (typeof window === 'undefined') return;

  // Skip verification for VPS assets — the upload server already confirmed success
  // and cross-origin HEAD checks are unreliable due to CORS/ORB policies
  if (isVpsAssetUrl(url)) {
    console.info('[vpsApi] Upload confirmado pelo servidor, pulando verificação pública.', { url });
    return;
  }

  try {
    await verifyWithRetry(url, verifyUrlAccessible);
  } catch (error) {
    if (isBrowserBlockedFetch(error)) {
      console.warn('[vpsApi] Verificação pública bloqueada pelo navegador; mantendo upload.', {
        url,
        fileType: file.type,
        error,
      });
      return;
    }

    throw error;
  }
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
  speedBps: number;
  etaSeconds: number;
}

export interface UploadOptions {
  folder?: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  /** Number of automatic retries on transient/network errors (default 2) */
  retries?: number;
}

/** Internal: single XHR upload attempt with progress + abort support. */
function uploadOnce(
  file: File,
  normalizedFolder: string | undefined,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    if (normalizedFolder) formData.append('folder', normalizedFolder);
    formData.append('file', file);

    const startedAt = Date.now();

    const onAbort = () => {
      try { xhr.abort(); } catch {}
      reject(new DOMException('Upload cancelado', 'AbortError'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.upload.onprogress = (ev) => {
      if (!onProgress || !ev.lengthComputable) return;
      const elapsed = Math.max(0.001, (Date.now() - startedAt) / 1000);
      const speedBps = ev.loaded / elapsed;
      const remaining = Math.max(0, ev.total - ev.loaded);
      const etaSeconds = speedBps > 0 ? remaining / speedBps : 0;
      onProgress({
        loaded: ev.loaded,
        total: ev.total,
        percent: Math.min(100, (ev.loaded / ev.total) * 100),
        speedBps,
        etaSeconds,
      });
    };

    xhr.onerror = () => reject(new Error('NETWORK'));
    xhr.ontimeout = () => reject(new Error('TIMEOUT'));
    xhr.onload = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      const ct = xhr.getResponseHeader('content-type') || '';
      if (xhr.status < 200 || xhr.status >= 300) {
        if (!ct.includes('application/json')) {
          return reject(new Error(`Servidor indisponível (HTTP ${xhr.status}).`));
        }
        return reject(new Error(`Falha no upload: ${xhr.responseText}`));
      }
      if (!ct.includes('application/json')) {
        return reject(new Error('Resposta inesperada do servidor de upload.'));
      }
      try {
        const data = JSON.parse(xhr.responseText);
        resolve(resolveUploadUrl(data, normalizedFolder));
      } catch (e: any) {
        reject(new Error('Resposta inválida do servidor de upload.'));
      }
    };

    xhr.open('POST', `${VPS_BASE_URL}/upload`);
    // Long timeout for big videos (30 min)
    xhr.timeout = 30 * 60 * 1000;
    xhr.send(formData);
  });
}

/**
 * Upload a file to the VPS with progress tracking, retries and abort support.
 *
 * Two call signatures are supported (backwards-compatible):
 *   uploadFileToVps(file, 'folder')              // legacy
 *   uploadFileToVps(file, { folder, onProgress, signal, retries })
 */
export async function uploadFileToVps(
  file: File,
  folderOrOptions?: string | UploadOptions,
): Promise<string> {
  const opts: UploadOptions =
    typeof folderOrOptions === 'string' || folderOrOptions == null
      ? { folder: folderOrOptions as string | undefined }
      : folderOrOptions;

  const normalizedFolder = opts.folder?.trim().replace(/^\/+|\/+$/g, '');
  const maxRetries = Math.max(0, opts.retries ?? 2);

  let attempt = 0;
  let lastError: any;

  while (attempt <= maxRetries) {
    try {
      const publicUrl = await uploadOnce(file, normalizedFolder, opts.onProgress, opts.signal);
      await verifyUploadedFile(publicUrl, file);
      return publicUrl;
    } catch (err: any) {
      lastError = err;
      // Don't retry user-initiated cancellation
      if (err?.name === 'AbortError') throw err;

      const msg = String(err?.message || '');
      const isTransient =
        msg === 'NETWORK' ||
        msg === 'TIMEOUT' ||
        /Servidor indisponível|indisponível|HTTP 5\d\d|HTTP 429/i.test(msg);

      if (!isTransient || attempt === maxRetries) {
        // Translate technical messages into friendly ones on final failure
        if (msg === 'NETWORK') {
          throw new Error('Conexão instável. Verifique sua internet e tente novamente.');
        }
        if (msg === 'TIMEOUT') {
          throw new Error('O envio demorou demais. Tente novamente com uma conexão mais estável.');
        }
        throw err;
      }

      // Exponential backoff: 1s, 2s, 4s...
      await wait(1000 * Math.pow(2, attempt));
      attempt += 1;
    }
  }

  throw lastError ?? new Error('Falha no upload.');
}

/**
 * Upload a Blob (e.g. generated thumbnail) to the VPS
 */
export async function uploadBlobToVps(
  blob: Blob,
  filename: string,
  folder?: string,
): Promise<string> {
  const file = new File([blob], filename, { type: blob.type });
  return uploadFileToVps(file, folder);
}

/**
 * Get the public URL for a file on the VPS
 * @param path - Relative path of the file
 */
export function getVpsMediaUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return buildPublicVpsUrl(path);
}

/**
 * Delete a file from the VPS
 */
export async function deleteFileFromVps(path: string): Promise<void> {
  const response = await fetch(`${VPS_BASE_URL}/upload`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: normalizeVpsPath(path) }),
  });
  if (!response.ok) {
    console.error('Delete failed:', await response.text());
  }
}

export { VPS_BASE_URL, VPS_UPLOADS_URL };

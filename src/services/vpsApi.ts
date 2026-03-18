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

  try {
    await verifyWithRetry(url, verifyUrlAccessible);
  } catch (error) {
    if (isVpsAssetUrl(url) && isBrowserBlockedFetch(error)) {
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

/**
 * Upload a file to the VPS
 * @param file - File object to upload
 * @param folder - Optional subfolder (e.g. 'logos', 'content', 'design')
 * @returns The public URL of the uploaded file
 */
export async function uploadFileToVps(
  file: File,
  folder?: string,
): Promise<string> {
  const normalizedFolder = folder?.trim().replace(/^\/+|\/+$/g, '');
  const formData = new FormData();

  // Multer resolve o destino do arquivo durante o parsing multipart.
  // O campo `folder` precisa chegar antes do `file` para evitar fallback em `general`.
  if (normalizedFolder) formData.append('folder', normalizedFolder);
  formData.append('file', file);

  const response = await fetch(`${VPS_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Upload failed: ${err}`);
  }

  const data = await response.json();
  const publicUrl = resolveUploadUrl(data, normalizedFolder);
  await verifyUploadedFile(publicUrl, file);
  return publicUrl;
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

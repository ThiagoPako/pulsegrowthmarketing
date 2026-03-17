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

function verifyImageUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Upload concluído, mas a imagem pública não ficou acessível.'));
    image.src = url;
  });
}

function verifyVideoUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
      callback();
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => finish(resolve);
    video.onerror = () => finish(() => reject(new Error('Upload concluído, mas o vídeo público não ficou acessível.')));
    video.src = url;
  });
}

async function verifyUploadedFile(url: string, file: File): Promise<void> {
  if (typeof window === 'undefined') return;
  if (file.type.startsWith('video/')) {
    await verifyVideoUrl(url);
    return;
  }
  if (file.type.startsWith('image/')) {
    await verifyImageUrl(url);
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
  const formData = new FormData();
  formData.append('file', file);
  if (folder) formData.append('folder', folder);

  const response = await fetch(`${VPS_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Upload failed: ${err}`);
  }

  const data = await response.json();
  const publicUrl = resolveUploadUrl(data, folder);
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

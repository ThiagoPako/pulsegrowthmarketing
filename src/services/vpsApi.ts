/**
 * VPS API Service - Hybrid approach
 * Uses agenciapulse.tech for file uploads/media serving
 * Keeps Supabase/Lovable Cloud for auth, database, realtime
 */

const VPS_BASE_URL = 'https://agenciapulse.tech/api';
const VPS_UPLOADS_URL = 'https://agenciapulse.tech/uploads';

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
    // Do NOT set Content-Type — browser sets it with boundary for multipart
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Upload failed: ${err}`);
  }

  const data = await response.json();
  // Expects response: { filename: "...", url: "..." } or { path: "..." }
  return data.url || `${VPS_UPLOADS_URL}/${data.path || data.filename}`;
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
  // If already a full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${VPS_UPLOADS_URL}/${path}`;
}

/**
 * Delete a file from the VPS
 */
export async function deleteFileFromVps(path: string): Promise<void> {
  const response = await fetch(`${VPS_BASE_URL}/upload`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    console.error('Delete failed:', await response.text());
  }
}

export { VPS_BASE_URL, VPS_UPLOADS_URL };

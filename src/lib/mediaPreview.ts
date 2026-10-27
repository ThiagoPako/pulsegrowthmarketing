/**
 * Miniatura e prévia animada leves dos vídeos gravados na VPS (vps-api-server/lib/postCaption.mjs).
 *
 * - thumb: um quadro JPEG (~20 KB), gerado na primeira vez.
 * - preview: 5 s em 320 px, sem áudio (~200 KB). Enquanto não existe a rota responde 404 e gera em
 *   segundo plano; quem mostra fica na miniatura.
 *
 * Os cards tocavam o vídeo inteiro (dezenas de MB por card) em loop: com muitos cards a página travava.
 */
import { canHaveWebVariant } from '@/lib/playbackUrl';

const API_BASE = 'https://agenciapulse.tech/api';
const SITE_ORIGIN = 'https://agenciapulse.tech';

function uploadsPath(url: string | null | undefined): string | null {
  if (!url || !canHaveWebVariant(url)) return null;
  try {
    return new URL(url, SITE_ORIGIN).pathname;
  } catch {
    return null;
  }
}

/** JPEG de um quadro do vídeo, ou null quando o vídeo não está na VPS. */
export function videoThumbUrl(url: string | null | undefined): string | null {
  const path = uploadsPath(url);
  return path ? `${API_BASE}/media/thumb?src=${encodeURIComponent(path)}` : null;
}

/** MP4 curto e leve para a prévia animada, ou null quando o vídeo não está na VPS. */
export function videoPreviewUrl(url: string | null | undefined): string | null {
  const path = uploadsPath(url);
  return path ? `${API_BASE}/media/preview?src=${encodeURIComponent(path)}` : null;
}

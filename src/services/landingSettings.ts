/**
 * Configurações da landing page guardadas na VPS (Pixel da Meta).
 * A leitura é pública (a landing é anônima); salvar é só do admin.
 */
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

const VPS_API_BASE = 'https://agenciapulse.tech/api';

// o Pixel vai dentro de um <script> da landing: só números
export const isValidPixelId = (value: string) => /^\d{5,20}$/.test(value);

export async function getLandingPixelId(): Promise<string | null> {
  try {
    const response = await fetch(`${VPS_API_BASE}/public/landing-settings?section=facebook_pixel`);
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    const pixelId = String(data?.title || '').trim();
    return pixelId && isValidPixelId(pixelId) ? pixelId : null;
  } catch {
    return null;
  }
}

export async function saveLandingPixelId(pixelId: string): Promise<{ error?: string }> {
  const { error } = await invokeVpsFunction('landing-settings/facebook-pixel', { method: 'PUT', body: { pixelId } });
  return error ? { error: error.message || 'Erro ao salvar pixel' } : {};
}

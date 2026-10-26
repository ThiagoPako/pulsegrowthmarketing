/**
 * Configurações e conteúdo da landing page guardados na VPS (Pixel da Meta,
 * Quem somos, vídeos dos planos, depoimentos e logos).
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

// ─── Conteúdo público da landing (depoimentos aprovados, vídeos dos planos, logos) ───
// A landing é anônima: lê da rota pública, não do /api/db/query (que exige login).

export interface PublicTestimonial { client_name: string; client_role: string; message: string; rating: number }
export interface PublicLanding {
  testimonials: PublicTestimonial[];
  plan_videos: { plan_name: string; video_url: string }[];
  client_logos: { company_name: string; logo_url: string; color: string | null }[];
}

const EMPTY_LANDING: PublicLanding = { testimonials: [], plan_videos: [], client_logos: [] };
let publicLandingPromise: Promise<PublicLanding> | null = null;

/** Uma requisição por carga da página (as seções da landing dividem o resultado); fresh refaz. */
export function getPublicLanding(options?: { fresh?: boolean }): Promise<PublicLanding> {
  if (!publicLandingPromise || options?.fresh) {
    publicLandingPromise = fetch(`${VPS_API_BASE}/public/landing`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => ({
        testimonials: Array.isArray(data?.testimonials) ? data.testimonials : [],
        plan_videos: Array.isArray(data?.plan_videos) ? data.plan_videos : [],
        client_logos: Array.isArray(data?.client_logos) ? data.client_logos : [],
      }))
      .catch(() => {
        publicLandingPromise = null;
        return EMPTY_LANDING;
      });
  }
  return publicLandingPromise;
}

export interface LandingSection { section: string; video_url: string | null; title: string | null; description: string | null }

export async function getLandingSection(section: 'quem_somos'): Promise<LandingSection | null> {
  try {
    const response = await fetch(`${VPS_API_BASE}/public/landing-settings?section=${section}`);
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function saveQuemSomos(body: { video_url: string | null; title: string; description: string }): Promise<{ error?: string }> {
  const { error } = await invokeVpsFunction('landing-settings/quem-somos', { method: 'PUT', body });
  return error ? { error: error.message || 'Erro ao salvar' } : {};
}

export async function savePlanVideo(planName: string, videoUrl: string | null): Promise<{ error?: string }> {
  const { error } = await invokeVpsFunction('landing-settings/plan-video', { method: 'PUT', body: { plan_name: planName, video_url: videoUrl } });
  return error ? { error: error.message || 'Erro ao salvar o vídeo' } : {};
}

// ─── Link de depoimento (/feedback?token=), público ───

/** true/false = link pendente ou não; null = falha de conexão. */
export async function checkFeedbackToken(token: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${VPS_API_BASE}/public/testimonials/${encodeURIComponent(token)}`);
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return !!data?.valid;
  } catch {
    return null;
  }
}

export async function submitFeedback(
  token: string,
  body: { client_name: string; client_role: string; message: string; rating: number },
): Promise<{ error?: string }> {
  try {
    const response = await fetch(`${VPS_API_BASE}/public/testimonials/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return {};
    const data = await response.json().catch(() => null);
    return { error: data?.error || 'Erro ao enviar feedback' };
  } catch {
    return { error: 'Sem conexão. Verifique a internet e tente de novo.' };
  }
}

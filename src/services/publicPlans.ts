/**
 * Promoções e oferta 6+6 da apresentação de planos (/p/planos é pública).
 * Rotas públicas da VPS: o /api/db/query exige login, então o cliente sem
 * login nunca via a promoção, o link exclusivo nem o valor combinado no CRM.
 */
const VPS_API_BASE = 'https://agenciapulse.tech/api';

async function getJson(path: string): Promise<any | null> {
  try {
    const response = await fetch(`${VPS_API_BASE}${path}`);
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

/** Promoções gerais ativas, no período e com vaga, da cidade e do plano. */
export async function fetchPublicPromotions(city: string, planKey: string): Promise<any[]> {
  const qs = new URLSearchParams({ city, plan: planKey });
  const data = await getJson(`/public/plan-promotions?${qs.toString()}`);
  return Array.isArray(data?.promotions) ? data.promotions : [];
}

/** Promoção do link exclusivo (?promo=); null fora do período, sem vaga ou de outro plano. */
export async function fetchPublicPromotion(id: string, planKey: string): Promise<any | null> {
  const qs = new URLSearchParams({ plan: planKey });
  const data = await getJson(`/public/plan-promotions/${encodeURIComponent(id)}?${qs.toString()}`);
  return data?.promotion || null;
}

/** Oferta 6+6 ativa no lead (?lead=): só o valor promocional, ou null. */
export async function fetchPublicPlanOffer(leadId: string): Promise<{ promo_value: number | null } | null> {
  const data = await getJson(`/public/plan-offer/${encodeURIComponent(leadId)}`);
  return data?.offer || null;
}

/** Código da cidade ('minacu' | 'uruacu') a partir do nome salvo no lead ('Minaçu', 'uruacu'...). */
export function cityCodeFrom(value: string | null | undefined): 'minacu' | 'uruacu' | null {
  const v = String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (v.includes('uruac')) return 'uruacu';
  if (v.includes('minac')) return 'minacu';
  return null;
}

/** Oferta 6+6 do lead: referral_info.promo_66 (novo) ou source_tag 'promo_6_6' (leads antigos). */
export function hasPromo66(lead: { source_tag?: string | null; referral_info?: any } | null | undefined): boolean {
  const flag = lead?.referral_info?.promo_66;
  if (flag === true || flag === false) return flag;
  return lead?.source_tag === 'promo_6_6';
}

/**
 * Sorteios de Prêmios — comunicação com a API da VPS.
 * Endpoints públicos (jogo e validação) não exigem token; os administrativos usam o JWT do sistema.
 */

const API_BASE = 'https://agenciapulse.tech/api';
const TOKEN_KEY = 'pulse_jwt';

export interface PromoCampaign {
  id: string;
  title: string;
  slug: string;
  rules_text: string;
  require_lead_capture: boolean;
  require_document: boolean;
  lgpd_terms_text: string;
  banner_url: string | null;
  logo_url: string | null;
  accent_color: string;
  code_prefix?: string;
  validation_pin?: string;
  is_active: boolean;
  created_at?: string;
  tickets_total?: string | number;
  tickets_opened?: string | number;
  prizes_drawn?: string | number;
  prizes_redeemed?: string | number;
  leads_total?: string | number;
}

export interface PromoPrize {
  id: string;
  campaign_id: string;
  name: string;
  description: string;
  image_url: string | null;
  total_quantity: number;
  remaining_quantity: number;
  win_probability_percent: number | string;
  is_active: boolean;
}

export interface PromoTicket {
  id: string;
  token: string;
  batch_label: string | null;
  status: string;
  created_at: string;
}

export interface PromoBatch {
  batch_label: string;
  total: number;
  created_at: string;
}

export interface PromoLead {
  participant_name: string | null;
  participant_phone: string | null;
  participant_document: string | null;
  lgpd_accepted: boolean;
  status: string;
  redemption_code: string | null;
  revealed_at: string | null;
  redeemed_at: string | null;
  prize_name: string | null;
}

export interface PromoPublicState {
  campaign: PromoCampaign;
  prizes?: Array<{ id: string; name: string; image_url: string | null }>;
  ticket:
    | null
    | {
        status: string;
        game_type?: string | null;
        redemption_code?: string | null;
        participant_name?: string | null;
        revealed_at?: string | null;
        prize?: { name: string; description: string; image_url: string | null } | null;
      };
  reason?: string;
}

export interface PromoPlayResult {
  won: boolean;
  prize: { id: string; name: string; description: string; image_url: string | null } | null;
  redemption_code: string | null;
}

async function request<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.auth) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init?.headers as any) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error: any = new Error(payload?.error || `Erro ${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

// ─── Público ────────────────────────────────────────────────
export const fetchPromoTicketState = (slug: string, token: string) =>
  request<PromoPublicState>(`/promo/public/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`);

export const playPromoTicket = (body: {
  slug: string;
  token: string;
  game_type: 'roulette' | 'scratch';
  name?: string;
  phone?: string;
  document?: string;
  lgpd_accepted?: boolean;
}) => request<PromoPlayResult>('/promo/play', { method: 'POST', body: JSON.stringify(body) });

export const validatePromoCode = (body: {
  slug: string;
  pin: string;
  code: string;
  operator_name?: string;
  confirm?: boolean;
}) => request<any>('/promo/validate', { method: 'POST', body: JSON.stringify(body) });

// ─── Administrativo ─────────────────────────────────────────
export const listPromoCampaigns = () =>
  request<{ campaigns: PromoCampaign[] }>('/promo/campaigns', { auth: true });

export const savePromoCampaign = (body: Partial<PromoCampaign>) =>
  request<{ campaign: PromoCampaign }>('/promo/campaigns', { method: 'POST', auth: true, body: JSON.stringify(body) });

export const deletePromoCampaign = (id: string) =>
  request<{ success: boolean }>(`/promo/campaigns/${id}`, { method: 'DELETE', auth: true });

export const listPromoPrizes = (campaignId: string) =>
  request<{ prizes: PromoPrize[] }>(`/promo/campaigns/${campaignId}/prizes`, { auth: true });

export const savePromoPrize = (body: Partial<PromoPrize> & { campaign_id: string }) =>
  request<{ prize: PromoPrize }>('/promo/prizes', { method: 'POST', auth: true, body: JSON.stringify(body) });

export const deletePromoPrize = (id: string) =>
  request<{ success: boolean }>(`/promo/prizes/${id}`, { method: 'DELETE', auth: true });

export const generatePromoTickets = (campaignId: string, quantity: number) =>
  request<{ batch_label: string; tickets: PromoTicket[] }>('/promo/tickets/generate', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ campaign_id: campaignId, quantity }),
  });

export const listPromoTickets = (campaignId: string, batch?: string) =>
  request<{ tickets: PromoTicket[]; batches: PromoBatch[] }>(
    `/promo/campaigns/${campaignId}/tickets${batch ? `?batch=${encodeURIComponent(batch)}` : ''}`,
    { auth: true }
  );

export const listPromoLeads = (campaignId: string) =>
  request<{ leads: PromoLead[] }>(`/promo/campaigns/${campaignId}/leads`, { auth: true });

/** Upload de imagem (banner / foto de prêmio) reutilizando o fluxo padrão da VPS. */
export async function uploadPromoImage(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  body.append('folder', 'sorteios');
  body.append('path', 'sorteios');
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body,
  });
  const result = await response.json().catch(() => null);
  const url = result?.url || result?.path;
  if (!response.ok || !url) throw new Error(result?.error || 'Falha no upload da imagem');
  return url;
}

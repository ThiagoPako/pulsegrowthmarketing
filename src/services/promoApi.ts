/**
 * Sorteios de Prêmios — comunicação com a API da VPS.
 * Endpoints públicos (jogo e validação) não exigem token; os administrativos usam o JWT do sistema.
 */

import { uploadFileToVps } from '@/services/vpsApi';

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
  /** Nome do cliente informado pelo operador na hora da entrega. */
  winner_name?: string;
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

/**
 * Converte caminhos relativos de upload (`/uploads/...`) em URL absoluta da VPS.
 * Sem isso as fotos quebram quando o app roda em outro domínio (preview).
 */
export function promoAssetUrl(url?: string | null): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const normalized = raw.startsWith('/') ? raw : `/uploads/${raw.replace(/^uploads\//, '')}`;
  return `https://agenciapulse.tech${normalized}`;
}

/** Regulamento padrão gerado quando o usuário não escreve um. */
export function defaultPromoRules(title: string, prizes: string[] = []): string {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const lista = prizes.length ? prizes.map((p, i) => `   ${i + 1}. ${p}`).join('\n') : '   Prêmios divulgados no ponto de venda.';
  return `REGULAMENTO — ${title || 'Promoção'}
Vigência a partir de ${hoje}.

1. PARTICIPAÇÃO
1.1. A cada compra/abastecimento que atenda ao valor mínimo divulgado no ponto de venda, o cliente recebe 1 (um) cupom com QR Code exclusivo.
1.2. Cada QR Code é pessoal, de uso único e perde a validade imediatamente após ser aberto.
1.3. Podem participar pessoas físicas maiores de 18 anos.

2. COMO JOGAR
2.1. Ao ler o QR Code, o participante escolhe entre Roleta ou Raspadinha e descobre na hora o resultado.
2.2. O sorteio é eletrônico e o resultado é definido pelo sistema no momento da jogada, não sendo possível repetir a tentativa.

3. PRÊMIOS
${lista}
3.1. Os prêmios são limitados ao estoque cadastrado e não são trocáveis por dinheiro.

4. RETIRADA
4.1. O ganhador deve apresentar o código de resgate exibido na tela ao caixa/atendente do estabelecimento.
4.2. Sem o código de resgate válido não há entrega do prêmio.
4.3. Cada código pode ser utilizado uma única vez; após a confirmação da entrega ele é invalidado.

5. DADOS PESSOAIS (LGPD)
5.1. Os dados informados são utilizados exclusivamente para identificação do ganhador e comunicações promocionais, conforme a Lei 13.709/2018.
5.2. O participante pode solicitar exclusão dos seus dados a qualquer momento junto ao estabelecimento.

6. DISPOSIÇÕES GERAIS
6.1. Colaboradores do estabelecimento não podem participar.
6.2. Cupons rasurados, copiados ou já utilizados serão automaticamente invalidados.
6.3. A participação implica aceitação integral deste regulamento.`;
}

/**
 * Upload de imagem reutilizando o helper oficial da VPS
 * (com retentativas e verificação de que o arquivo já está acessível).
 */
export async function uploadPromoImage(file: File): Promise<string> {
  const url = await uploadFileToVps(file, { folder: 'sorteios', retries: 2 });
  return promoAssetUrl(url);
}

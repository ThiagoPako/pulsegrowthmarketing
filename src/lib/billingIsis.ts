import { vpsAuthedFetch } from '@/lib/vpsDb';

/** Cobranças da Ísis pelo Assistente PULSE (vps-api-server/billingIsisRoutes.mjs). */

export type BillingStep = 'relatorio_mensal' | 'pre_vencimento' | 'cobranca' | 'lembrete';
export type BillingMode = 'desligado' | 'previa' | 'ativo';

export const BILLING_STEPS: BillingStep[] = ['relatorio_mensal', 'pre_vencimento', 'cobranca', 'lembrete'];
export const STEP_LABELS: Record<BillingStep, string> = {
  relatorio_mensal: 'Dia 1 · relatório',
  pre_vencimento: 'D−5 · agradecimento',
  cobranca: 'Dia D · cobrança',
  lembrete: 'D+3 · lembrete',
};
export const MODE_LABELS: Record<BillingMode, string> = {
  desligado: 'Desligado (cobrança antiga)',
  previa: 'Prévia (monta, ninguém recebe)',
  ativo: 'Ativo (envia pelo Assistente PULSE)',
};
export const STEP_STATUS_LABELS: Record<string, string> = {
  previsto: 'Previsto',
  passou: 'Passou',
  previa: 'Prévia',
  enviada: 'Enviada',
  pago: 'Pago',
  aguardando_relatorio: 'Relatório não aprovado',
  sem_whatsapp: 'Sem WhatsApp',
  pulado: 'Pulado',
  conferir: 'Conferir dados',
};
export const TEMPLATE_VARS: Record<BillingStep, string[]> = {
  relatorio_mensal: ['nome_cliente', 'mes_anterior', 'mes_atual', 'qtd_videos', 'qtd_artes', 'qtd_posts', 'qtd_gravacoes', 'horas_dedicadas', 'resumo_rede', 'sugestoes', 'link_relatorio'],
  pre_vencimento: ['nome_cliente', 'mes_ref', 'gravacoes_feitas', 'gravacoes_marcadas', 'media_videos', 'dica_assiduidade', 'dia_vencimento'],
  cobranca: ['nome_cliente', 'plano', 'valor', 'pix_copia_cola', 'chave_pix', 'nome_recebedor', 'link_infinitepay'],
  lembrete: ['nome_cliente', 'mes_ref', 'valor', 'pix_copia_cola', 'link_infinitepay'],
};

export interface BillingConfig {
  mode: BillingMode;
  card_fee_percent: number;
  has_pix: boolean;
  infinitepay_handle: string;
  templates: Record<BillingStep, string>;
  defaults: Record<BillingStep, string>;
  /** rodapé de mensagem automática em todas as mensagens ao cliente (vazio = sem rodapé) */
  footer: string;
  default_footer: string;
  /** contato do rodapé por cidade; resolved = o que sai na mensagem (telefone do Assistente PULSE se vazio) */
  contacts: Record<'uruacu' | 'minacu', CityContact>;
}

export interface CityContact {
  name: string;
  phone: string;
  resolved: { city: string; name: string; phone: string | null };
}

export interface BillingAgendaItem {
  contract_id: string;
  client_id: string;
  client: string;
  plan: string | null;
  amount: number;
  due_date: string;
  paid: boolean;
  has_whatsapp: boolean;
  billing_enabled: boolean;
  mode: BillingMode;
  steps: { step: BillingStep; date: string; status: string; body: string | null; pdf_url: string | null }[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não deu certo. Tente de novo.');
  return body as T;
}

export const fetchBillingConfig = () => call<BillingConfig>('/billing-isis/config');
export const saveBillingConfig = (patch: Partial<Pick<BillingConfig, 'mode' | 'card_fee_percent' | 'infinitepay_handle' | 'footer'>> & {
  templates?: Partial<Record<BillingStep, string>>;
  contacts?: Partial<Record<'uruacu' | 'minacu', { name: string; phone: string }>>;
}) =>
  call<{ success: boolean }>('/billing-isis/config', { method: 'PUT', body: JSON.stringify(patch) });
export const fetchBillingAgenda = (month: string) =>
  call<{ month: string; today: string; items: BillingAgendaItem[] }>(`/billing-isis/agenda?month=${encodeURIComponent(month)}`);
export const fetchBillingPreview = (contractId: string, step: BillingStep, date: string, month: string) =>
  call<{ body: string | null; skip: string | null; problems: string[] | null }>(
    `/billing-isis/preview?contract_id=${contractId}&step=${step}&date=${date}&month=${month}`,
  );

/** O PDF que sairia (gerado na hora, nada é guardado): abre numa aba. */
export async function openBillingPdfPreview(contractId: string, step: BillingStep, date: string, month: string) {
  const response = await vpsAuthedFetch(`/billing-isis/preview?contract_id=${contractId}&step=${step}&date=${date}&month=${month}&pdf=1`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || 'Não deu para montar o PDF.');
  }
  const url = URL.createObjectURL(await response.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface PaymentLinkRow {
  id: string; order_nsu: string; month: string | null; amount: number; url: string; status: string; client: string | null;
  capture_method: string | null; paid_at: string | null; receipt_url: string | null;
}
export const fetchPaymentLinks = (month: string) =>
  call<{ handle: string | null; webhook_url: string; links: PaymentLinkRow[] }>(`/infinitepay/links?month=${encodeURIComponent(month)}`);
export const createTestLink = () =>
  call<{ url: string }>('/infinitepay/test-link', { method: 'POST', body: JSON.stringify({ amount: 1 }) });
export const recheckPaymentLink = (id: string) =>
  call<{ paid: boolean; marked?: boolean }>(`/infinitepay/check/${id}`, { method: 'POST', body: '{}' });

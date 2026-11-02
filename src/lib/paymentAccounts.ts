import { vpsAuthedFetch } from '@/lib/vpsDb';

/**
 * Financeiro → Pagamentos · InfinitePay (vps-api-server/paymentAccountsRoutes.mjs): a conta de cada cidade, única
 * fonte da InfiniteTag, da chave Pix e do recebedor (link do cartão, Pix copia e cola, PDF, /pagar e mensagens).
 */
export type PaymentCity = 'uruacu' | 'minacu';
export type PaymentAccountStatus = 'conectado' | 'com_erro' | 'testar' | 'desativado' | 'nao_configurado';

export interface PaymentAccount {
  city: PaymentCity;
  label: string;
  infinitepay_handle: string;
  pix_key: string;
  receiver_name: string;
  document: string;
  bank: string;
  active: boolean;
  api_client_id: string;
  has_api_secret: boolean;
  api_secret_last4: string;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  updated_at: string | null;
  updated_by: string | null;
  status: PaymentAccountStatus;
}

export const STATUS_LABELS: Record<PaymentAccountStatus, string> = {
  conectado: 'Conectado',
  com_erro: 'Com erro',
  testar: 'Salvo · falta testar',
  desativado: 'Desativado',
  nao_configurado: 'Não configurado',
};

export type PaymentAccountPatch = Partial<Pick<PaymentAccount,
  'infinitepay_handle' | 'pix_key' | 'receiver_name' | 'document' | 'bank' | 'active' | 'api_client_id'>> & {
  /** só escrita: vai cifrado para o servidor e nunca volta */
  api_secret?: string;
  clear_api_secret?: boolean;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não deu certo. Tente de novo.');
  return body as T;
}

export const fetchPaymentAccounts = () => call<{ accounts: PaymentAccount[]; webhook_url: string }>('/payment-accounts');

export const savePaymentAccount = (city: PaymentCity, patch: PaymentAccountPatch) =>
  call<{ account: PaymentAccount }>(`/payment-accounts/${city}`, { method: 'PUT', body: JSON.stringify(patch) });

export const testPaymentAccount = (city: PaymentCity) =>
  call<{ ok: boolean; url?: string; error?: string; account: PaymentAccount }>(`/payment-accounts/${city}/test`, { method: 'POST', body: '{}' });

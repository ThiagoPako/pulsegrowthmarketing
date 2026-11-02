import { vpsAuthedFetch } from '@/lib/vpsDb';

/**
 * Financeiro → Pagamentos · Efí Bank (vps-api-server/paymentAccountsRoutes.mjs, efiPixRoutes.mjs, efiCardRoutes.mjs): a
 * conta de cada cidade, única fonte da chave Pix, do recebedor e da conta Efí (Pix, cartão, PDF, /pagar e mensagens).
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
  efi: EfiAccount;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  updated_at: string | null;
  updated_by: string | null;
  status: PaymentAccountStatus;
}

export type EfiStatus = 'nao_configurado' | 'incompleto' | 'testar' | 'com_erro' | 'pronto' | 'ligado';

/** A conta Efí da cidade como a tela vê: segredos e certificado nunca voltam, só se existem e os 4 últimos caracteres. */
export interface EfiAccount {
  active: boolean;
  env: 'producao' | 'homologacao';
  pix_key: string;
  has_client_id: boolean;
  client_id_last4: string;
  has_client_secret: boolean;
  client_secret_last4: string;
  has_cert: boolean;
  cert_name: string;
  cert_uploaded_at: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  scopes_missing: string[];
  webhook_at: string | null;
  webhook_error: string | null;
  status: EfiStatus;
  /** cartão pelo link da Efí (API Cobranças) */
  card_active: boolean;
  card_test_at: string | null;
  card_test_ok: boolean | null;
  card_test_error: string | null;
}

export const EFI_STATUS_LABELS: Record<EfiStatus, string> = {
  nao_configurado: 'Não configurada',
  incompleto: 'Incompleta',
  testar: 'Falta testar',
  com_erro: 'Com erro',
  pronto: 'Testada · desligada',
  ligado: 'Ligada',
};

export const STATUS_LABELS: Record<PaymentAccountStatus, string> = {
  conectado: 'Conectado',
  com_erro: 'Com erro',
  testar: 'Salvo · falta testar',
  desativado: 'Desativado',
  nao_configurado: 'Não configurado',
};

export type PaymentAccountPatch = Partial<Pick<PaymentAccount,
  'infinitepay_handle' | 'pix_key' | 'receiver_name' | 'document' | 'bank' | 'active'>>;

/** Campos da Efí; client_id, client_secret e cert_base64 são só escrita (vão cifrados e nunca voltam). */
export interface EfiPatch {
  efi_env?: 'producao' | 'homologacao';
  efi_pix_key?: string;
  efi_active?: boolean;
  client_id?: string;
  client_secret?: string;
  cert_base64?: string;
  cert_name?: string;
  clear?: boolean;
}

export interface EfiMovement {
  e2e_id: string;
  city: PaymentCity;
  env: string;
  txid: string | null;
  amount: string | number;
  received_at: string | null;
  payer_name: string | null;
  info_pagador: string | null;
  status: 'conciliado' | 'conferir' | 'conferido';
  refunded: boolean;
  client: string | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não deu certo. Tente de novo.');
  return body as T;
}

export const fetchPaymentAccounts = () => call<{ accounts: PaymentAccount[]; webhook_url: string }>('/payment-accounts');

export const savePaymentAccount = (city: PaymentCity, patch: PaymentAccountPatch) =>
  call<{ account: PaymentAccount }>(`/payment-accounts/${city}`, { method: 'PUT', body: JSON.stringify(patch) });

export const saveEfiAccount = (city: PaymentCity, patch: EfiPatch) =>
  call<{ account: PaymentAccount }>(`/payment-accounts/${city}/efi`, { method: 'PUT', body: JSON.stringify(patch) });

export const testEfiAccount = (city: PaymentCity) =>
  call<{ ok: boolean; error?: string; saldo?: string | null; account: PaymentAccount }>(`/payment-accounts/${city}/efi/test`, { method: 'POST', body: '{}' });

export const registerEfiWebhook = (city: PaymentCity) =>
  call<{ ok: boolean; error?: string | null; account: PaymentAccount }>(`/payment-accounts/${city}/efi/webhook`, { method: 'POST', body: '{}' });

export const fetchEfiMovements = (month: string) =>
  call<{ month: string; movements: EfiMovement[]; saldo: Partial<Record<PaymentCity, number | null>> }>(`/efi/movements?month=${month}`);

export const markEfiConferido = (e2e: string) =>
  call<{ success: boolean }>(`/efi/movements/${encodeURIComponent(e2e)}/conferido`, { method: 'POST', body: '{}' });

/** Lê o .p12 escolhido na tela como base64 (vai cifrado para o servidor). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('Não deu para ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

export const testEfiCard = (city: PaymentCity) =>
  call<{ ok: boolean; error?: string; account: PaymentAccount }>(`/payment-accounts/${city}/efi/card-test`, { method: 'POST', body: '{}' });

export const setEfiCard = (city: PaymentCity, active: boolean) =>
  call<{ success: boolean; account: PaymentAccount }>(`/payment-accounts/${city}/efi/card`, { method: 'PUT', body: JSON.stringify({ active }) });

export interface EfiCardLink {
  charge_id: string;
  city: PaymentCity;
  env: string;
  month: string;
  amount: string | number;
  card_amount: string | number;
  url: string;
  status: string;
  paid_value: string | number | null;
  paid_at: string | null;
  created_at: string;
  client: string | null;
}

export const fetchEfiCardLinks = (month: string) => call<{ month: string; links: EfiCardLink[] }>(`/efi/card-links?month=${month}`);

export const recheckEfiCardLink = (chargeId: string) =>
  call<{ paid: boolean; marked?: boolean; status?: string }>(`/efi/card-links/${encodeURIComponent(chargeId)}/check`, { method: 'POST', body: '{}' });

export const testPaymentAccount = (city: PaymentCity) =>
  call<{ ok: boolean; url?: string; error?: string; account: PaymentAccount }>(`/payment-accounts/${city}/test`, { method: 'POST', body: '{}' });

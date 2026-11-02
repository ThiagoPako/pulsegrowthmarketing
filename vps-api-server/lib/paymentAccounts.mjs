// ─── Pagamentos · InfinitePay: a conta de cada cidade (pedido do usuário, 01/11/2026) ─────────────────────────
// "Crie um módulo no financeiro apenas para conexão da API da Infinit, certinho para conectar cada cidade, e vamos
// usar só ele para módulo de pagamentos e informações de pagamento": uma conta por cidade (Uruaçu e Minaçu) com a
// InfiniteTag, a chave Pix, o recebedor, ativo sim/não e o resultado do último teste de conexão. É a única fonte dos
// dados de pagamento: paymentConfigForCity (server.mjs) põe estes campos por cima da configuração antiga, então o
// link da InfinitePay, o Pix copia e cola, o PDF, a página /pagar e as mensagens leem daqui.
// API Key do Checkout InfinitePay (opcional, começa com inchk_; corrigido em 02/11/2026: o Checkout não tem client_id
// nem secret): só no servidor, cifrada (AES-256-GCM), e a tela mostra só os 4 últimos caracteres. Com ela, o link sai
// com validade e pagamento único (lib/infinitePay.mjs); sem ela, o link básico com a InfiniteTag.

import crypto from 'node:crypto';
import { normalizeHandle, isCheckoutApiKey } from './infinitePay.mjs';

export const CITIES = ['uruacu', 'minacu'];
export const CITY_LABELS = { uruacu: 'Uruaçu', minacu: 'Minaçu' };

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

/** Campos editáveis que vieram da tela (só os que vieram). */
export function normalizeAccountInput(body = {}) {
  const out = {};
  if (body.infinitepay_handle !== undefined) out.infinitepay_handle = normalizeHandle(body.infinitepay_handle) || null;
  if (body.pix_key !== undefined) out.pix_key = clip(body.pix_key, 120) || null;
  if (body.receiver_name !== undefined) out.receiver_name = clip(body.receiver_name, 80) || null;
  if (body.document !== undefined) out.document = clip(body.document, 30) || null;
  if (body.bank !== undefined) out.bank = clip(body.bank, 60) || null;
  if (body.active !== undefined) out.active = !!body.active;
  return out;
}

/** conectado / com_erro / testar (salvo, sem teste) / desativado / nao_configurado */
export function accountStatus(acc) {
  if (!acc || (!acc.infinitepay_handle && !acc.pix_key)) return 'nao_configurado';
  if (acc.active === false) return 'desativado';
  if (acc.last_test_ok === false) return 'com_erro';
  if (acc.last_test_ok === true) return 'conectado';
  return 'testar';
}

/** O que a tela vê: nada do segredo, só se existe e os 4 últimos caracteres. */
export function publicAccount(acc, city) {
  const a = acc || { city };
  return {
    city: a.city || city,
    label: CITY_LABELS[a.city || city] || city,
    infinitepay_handle: a.infinitepay_handle || '',
    pix_key: a.pix_key || '',
    receiver_name: a.receiver_name || '',
    document: a.document || '',
    bank: a.bank || '',
    active: a.active !== false,
    has_api_key: !!a.api_key_enc,
    api_key_last4: a.api_key_last4 || '',
    last_test_at: a.last_test_at || null,
    last_test_ok: a.last_test_ok ?? null,
    last_test_error: a.last_test_error || null,
    updated_at: a.updated_at || null,
    updated_by: a.updated_by || null,
    status: accountStatus(acc),
  };
}

/**
 * A configuração de pagamento de uma cidade com a conta do módulo por cima (a conta manda). Sem conta salva, a
 * configuração antiga como está; conta desativada: sem Pix e sem InfiniteTag (a cobrança vai para "Conferir dados").
 */
export function overlayConfig(configRow, acc, city) {
  if (!acc) return configRow;
  const on = acc.active !== false;
  return {
    ...(configRow || {}),
    city,
    infinitepay_handle: on ? acc.infinitepay_handle || null : null,
    pix_key: on ? acc.pix_key || null : null,
    receiver_name: acc.receiver_name || null,
    document: acc.document || null,
    bank: acc.bank || null,
    payment_account_active: on,
  };
}

/** Chave de 32 bytes da cifra: PAYMENT_SECRET_KEY, ou derivada do JWT_SECRET do servidor. */
export function secretKey(env = process.env) {
  const base = env.PAYMENT_SECRET_KEY || `pulse-payments:${env.JWT_SECRET || ''}`;
  return crypto.createHash('sha256').update(base).digest();
}

export function encryptSecret(plain, key = secretKey()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(enc, key = secretKey()) {
  const [v, iv, tag, data] = String(enc || '').split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Segredo em formato desconhecido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export const last4 = (s) => String(s || '').slice(-4);

/** API Key que veio da tela: só "inchk_…"; outra coisa (client secret, senha) é recusada. */
export function checkApiKeyInput(value) {
  const key = String(value || '').trim();
  if (!isCheckoutApiKey(key)) throw Object.assign(new Error('A API Key do Checkout começa com inchk_ (crie em Configurações do Checkout, no app da InfinitePay)'), { status: 400 });
  return key;
}

/** A API Key decifrada da conta (só no servidor); conta desativada, sem key ou key ilegível: null. */
export function accountApiKey(acc, key = secretKey()) {
  if (!acc?.api_key_enc || acc.active === false) return null;
  try { return decryptSecret(acc.api_key_enc, key); } catch { return null; }
}

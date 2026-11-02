// ─── Pagamentos · InfinitePay: a conta de cada cidade (pedido do usuário, 01/11/2026) ─────────────────────────
// "Crie um módulo no financeiro apenas para conexão da API da Infinit, certinho para conectar cada cidade, e vamos
// usar só ele para módulo de pagamentos e informações de pagamento": uma conta por cidade (Uruaçu e Minaçu) com a
// InfiniteTag, a chave Pix, o recebedor, ativo sim/não e o resultado do último teste de conexão. É a única fonte dos
// dados de pagamento: paymentConfigForCity (server.mjs) põe estes campos por cima da configuração antiga, então o
// link da InfinitePay, o Pix copia e cola, o PDF, a página /pagar e as mensagens leem daqui.
// Efí Bank (02/11/2026, "Vou trocar de banco, usar o Efí"): cada cidade pode ligar a sua conta Efí (Client ID, Client
// Secret e certificado .p12, só no servidor e cifrados com AES-256-GCM; a tela vê só os 4 últimos caracteres e o nome do
// arquivo). Com a Efí ligada, o Pix da cobrança é dinâmico (lib/efi.mjs) e a chave Pix da conta é a da Efí; a
// InfinitePay fica só para o cartão. Enquanto a Efí de uma cidade não está ligada, ela segue como antes.
// Só a Efí (02/11/2026, "em pagamentos ainda tem coisas da Infinity, deixe tudo preparado apenas para a Efí"): a
// InfiniteTag sai (overlayConfig não a repassa, então nenhum link da InfinitePay é criado); o cartão vai pelo link da
// Efí (efiCardRoutes.mjs) e a chave Pix é uma só, a da conta Efí: com a Efí ligada, Pix dinâmico com baixa automática;
// desligada, Pix pela chave e o comprovante na página de pagamento (pixReceiptRoutes.mjs).

import crypto from 'node:crypto';
import { normalizeHandle } from './infinitePay.mjs';
import { EFI_ENVS, EFI_SCOPES_REQUIRED } from './efi.mjs';

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
  if (!acc || !efiKey(acc)) return 'nao_configurado';
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
    efi: publicEfi(a),
    last_test_at: a.last_test_at || null,
    last_test_ok: a.last_test_ok ?? null,
    last_test_error: a.last_test_error || null,
    updated_at: a.updated_at || null,
    updated_by: a.updated_by || null,
    status: accountStatus(acc),
  };
}

/** Campos da Efí que vieram da tela (só os que vieram; segredos e certificado vão à parte, cifrados). */
export function normalizeEfiInput(body = {}) {
  const out = {};
  if (body.efi_env !== undefined) {
    if (!EFI_ENVS.includes(body.efi_env)) throw Object.assign(new Error('Ambiente da Efí: producao ou homologacao'), { status: 400 });
    out.efi_env = body.efi_env;
  }
  if (body.efi_pix_key !== undefined) out.efi_pix_key = clip(body.efi_pix_key, 120) || null;
  if (body.efi_active !== undefined) out.efi_active = !!body.efi_active;
  return out;
}

/** A chave Pix da conta Efí (a da Efí; quem salvou antes só na chave geral da cidade usa essa). */
export const efiKey = (acc) => acc?.efi_pix_key || acc?.pix_key || null;

/** Tem tudo para ligar: Client ID, Secret, certificado e chave Pix. */
export const efiComplete = (acc) => !!(acc?.efi_client_id_enc && acc?.efi_client_secret_enc && acc?.efi_cert_enc && efiKey(acc));

/** Cartão pela Efí: Client ID/Secret salvos e o teste da API Cobranças passou. */
export const efiCardReady = (acc) => !!(acc?.efi_client_id_enc && acc?.efi_client_secret_enc && acc?.efi_card_test_ok === true);

/** O cartão da Efí está valendo nesta cidade (conta ativa, cartão ligado e testado). */
export const efiCardOn = (acc) => !!(acc && acc.active !== false && acc.efi_card_active && efiCardReady(acc));

/**
 * Dá para consultar a conta Efí (conta ativa, completa e testada), mesmo com o Pix dinâmico desligado: é assim que o
 * Pix pela chave é conferido na API sem gerar cobrança (usuário, 02/11/2026).
 */
export const efiReadable = (acc) => !!(acc && acc.active !== false && efiComplete(acc) && acc.efi_last_test_ok === true);

/** A Efí está valendo nesta cidade (conta ativa, Efí ligada e completa). */
export const efiOn = (acc) => !!(acc && acc.active !== false && acc.efi_active && efiComplete(acc));

/** nao_configurado / incompleto / testar / com_erro / pronto (testado, desligado) / ligado */
export function efiStatus(acc) {
  if (!acc || !(acc.efi_client_id_enc || acc.efi_client_secret_enc || acc.efi_cert_enc)) return 'nao_configurado';
  if (!efiComplete(acc)) return 'incompleto';
  if (acc.efi_last_test_ok === false) return 'com_erro';
  if (acc.efi_last_test_ok !== true) return 'testar';
  return efiOn(acc) ? 'ligado' : 'pronto';
}

/** O que a tela vê da Efí: nada dos segredos nem do certificado, só se existem e os 4 últimos caracteres. */
export function publicEfi(a = {}) {
  const granted = String(a.efi_scopes || '').split(/\s+/).filter(Boolean);
  return {
    active: !!a.efi_active,
    env: a.efi_env || 'producao',
    pix_key: efiKey(a) || '',
    has_client_id: !!a.efi_client_id_enc,
    client_id_last4: a.efi_client_id_last4 || '',
    has_client_secret: !!a.efi_client_secret_enc,
    client_secret_last4: a.efi_client_secret_last4 || '',
    has_cert: !!a.efi_cert_enc,
    cert_name: a.efi_cert_name || '',
    cert_uploaded_at: a.efi_cert_uploaded_at || null,
    last_test_at: a.efi_last_test_at || null,
    last_test_ok: a.efi_last_test_ok ?? null,
    last_test_error: a.efi_last_test_error || null,
    scopes_missing: a.efi_scopes ? EFI_SCOPES_REQUIRED.filter((s) => !granted.includes(s)) : [],
    webhook_at: a.efi_webhook_at || null,
    webhook_error: a.efi_webhook_error || null,
    card_active: !!a.efi_card_active,
    card_test_at: a.efi_card_test_at || null,
    card_test_ok: a.efi_card_test_ok ?? null,
    card_test_error: a.efi_card_test_error || null,
    status: efiStatus(a.city ? a : null),
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
    // só a Efí: nenhum link da InfinitePay (o cartão vem do efiCardRoutes)
    infinitepay_handle: null,
    pix_key: on ? efiKey(acc) : null,
    receiver_name: acc.receiver_name || null,
    document: acc.document || null,
    bank: acc.bank || null,
    payment_account_active: on,
    // Efí ligada: o Pix sai dinâmico pela Efí, com a chave Pix da conta Efí
    ...(on && efiOn(acc) ? { pix_key: efiKey(acc), pix_provider: 'efi' } : { pix_provider: 'estatico' }),
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

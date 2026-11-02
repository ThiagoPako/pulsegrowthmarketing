// ─── InfinitePay: link de pagamento das mensalidades (pedido do usuário, 01/11/2026) ───────────────────────────
// Documentação: https://www.infinitepay.io/checkout-documentacao
//   POST https://api.checkout.infinitepay.io/links           { handle, items[{ quantity, price (centavos), description }],
//                                                             order_nsu, redirect_url, webhook_url }  → link
//   POST https://api.checkout.infinitepay.io/payment_check   { handle, order_nsu, transaction_nsu, slug }
//                                                             → { success, paid, amount, paid_amount, capture_method… }
// Criar link só precisa da InfiniteTag (handle). O webhook não é assinado: o pagamento só vale depois do
// payment_check (servidor a servidor). Cartão sempre ligado no checkout (até 12x); o valor do link já leva a taxa.
// É o Checkout InfinitePay (link hospedado), não checkout transparente: não há API que devolva o código Pix ou o QR
// (o Pix copia e cola da cobrança é gerado pela Pulse com a chave Pix da cidade). Sem sandbox: criar link não cobra.
// API Key do Checkout (opcional, começa com inchk_, header X-Api-Key, só no servidor): libera o objeto "options" do
// link. Usamos valid_until (vencimento + alguns dias) e single_payment (o link fecha depois de um pagamento). Com a
// key, a InfiniteTag do payload tem de ser da mesma conta (senão 403).

export const INFINITEPAY_BASE = 'https://api.checkout.infinitepay.io';

/** InfiniteTag sem "$" nem espaços (ex.: "$agenciapulse" → "agenciapulse"). */
export function normalizeHandle(value) {
  return String(value || '').trim().replace(/^\$/, '').replace(/\s+/g, '').slice(0, 60);
}

/** Identificador da mensalidade no checkout (dá para achar a receita de volta pelo webhook). */
export function orderNsuFor({ revenueId, contractId, month }) {
  return `pulse-${revenueId || `c${contractId}`}-${month}`.slice(0, 120);
}

export const toCents = (value) => Math.round(Number(value || 0) * 100);

/** API Key do Checkout: "inchk_" + o resto, sem espaços. */
export const isCheckoutApiKey = (value) => /^inchk_\S{8,}$/.test(String(value || '').trim());

const DAY = 86400000;
/**
 * valid_until do link (ISO 8601 no horário de Brasília): o fim do dia do vencimento + graceDays. Cobrança já vencida
 * conta a partir de hoje. A InfinitePay exige data no futuro e em até um ano.
 */
export function validUntilFor(dueDate, { graceDays = 10, now = new Date() } = {}) {
  const today = new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10); // dia em Brasília (UTC−3)
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || '')) && dueDate > today ? dueDate : today;
  const day = new Date(Date.parse(`${base}T12:00:00Z`) + graceDays * DAY).toISOString().slice(0, 10);
  const limit = new Date(Date.parse(`${today}T12:00:00Z`) + 360 * DAY).toISOString().slice(0, 10);
  return `${day < limit ? day : limit}T23:59:59-03:00`;
}

export function linkPayload({ handle, amount, description, orderNsu, webhookUrl, redirectUrl, options }) {
  const cents = toCents(amount);
  if (!normalizeHandle(handle)) throw new Error('Falta a InfiniteTag');
  if (cents < 100) throw new Error('Valor do link abaixo de R$ 1,00');
  return {
    handle: normalizeHandle(handle),
    items: [{ quantity: 1, price: cents, description: String(description || 'Mensalidade Pulse').slice(0, 120) }],
    order_nsu: orderNsu,
    ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
    ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
    ...(options && Object.keys(options).length ? { options } : {}),
  };
}

/** A documentação não traz o exemplo da resposta: aceita os nomes prováveis do campo com a URL. */
export function extractLinkUrl(response) {
  const r = response || {};
  const candidates = [r.url, r.link, r.checkout_url, r.payment_url, r.data?.url, r.data?.link, r.data?.checkout_url];
  return candidates.find((u) => typeof u === 'string' && /^https?:\/\//.test(u)) || null;
}

export function extractSlug(response, url) {
  const r = response || {};
  return r.slug || r.invoice_slug || r.data?.slug || (url ? String(url).split('?')[0].split('/').filter(Boolean).pop() : null) || null;
}

/** Campos do webhook (nomes de acordo com a documentação; aceita as duas grafias do slug). */
export function readWebhook(body) {
  const b = body || {};
  return {
    orderNsu: String(b.order_nsu || '').trim() || null,
    slug: String(b.invoice_slug || b.slug || '').trim() || null,
    transactionNsu: String(b.transaction_nsu || '').trim() || null,
    captureMethod: b.capture_method || null,
    receiptUrl: b.receipt_url || null,
    paidAmount: b.paid_amount ?? b.amount ?? null,
  };
}

/** Resposta do payment_check: só pago com success e paid. */
export function isPaidCheck(response) {
  return !!(response && response.success !== false && response.paid === true);
}

async function postJson(fetchImpl, path, body, apiKey = null) {
  const r = await fetchImpl(`${INFINITEPAY_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(apiKey ? { 'X-Api-Key': apiKey } : {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!r.ok) throw Object.assign(new Error(`InfinitePay ${r.status}: ${data?.message || data?.error || text.slice(0, 200)}`), { status: r.status });
  return data;
}

/**
 * Cria o link. Com apiKey, manda X-Api-Key e as options; sem ela, o link básico (options seriam recusadas).
 * fallback (padrão): se o link com a key falhar (key apagada, de outra conta…), tenta o básico, para a cobrança não
 * sair sem link; o "Testar conexão" desliga o fallback para mostrar o erro da key.
 */
export async function createCheckoutLink({ apiKey = null, options = null, fallback = true, ...params }, fetchImpl = fetch) {
  const key = isCheckoutApiKey(apiKey) ? String(apiKey).trim() : null;
  const once = async (withKey) => {
    const payload = linkPayload({ ...params, options: withKey ? options : null });
    const response = await postJson(fetchImpl, '/links', payload, withKey ? key : null);
    const url = extractLinkUrl(response);
    if (!url) throw Object.assign(new Error('A InfinitePay não devolveu a URL do link'), { response });
    return { url, slug: extractSlug(response, url), response, payload, withApiKey: withKey };
  };
  if (!key) return once(false);
  try {
    return await once(true);
  } catch (error) {
    if (!fallback || error.response) throw error;
    const link = await once(false);
    return { ...link, apiKeyError: error.message };
  }
}

export function checkPayment({ handle, orderNsu, transactionNsu, slug }, fetchImpl = fetch) {
  return postJson(fetchImpl, '/payment_check', {
    handle: normalizeHandle(handle), order_nsu: orderNsu,
    ...(transactionNsu ? { transaction_nsu: transactionNsu } : {}),
    ...(slug ? { slug } : {}),
  });
}

// ─── InfinitePay: link de pagamento das mensalidades (pedido do usuário, 01/11/2026) ───────────────────────────
// Documentação: https://www.infinitepay.io/checkout-documentacao
//   POST https://api.checkout.infinitepay.io/links           { handle, items[{ quantity, price (centavos), description }],
//                                                             order_nsu, redirect_url, webhook_url }  → link
//   POST https://api.checkout.infinitepay.io/payment_check   { handle, order_nsu, transaction_nsu, slug }
//                                                             → { success, paid, amount, paid_amount, capture_method… }
// Criar link só precisa da InfiniteTag (handle). O webhook não é assinado: o pagamento só vale depois do
// payment_check (servidor a servidor). Cartão sempre ligado no checkout (até 12x); o valor do link já leva a taxa.

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

export function linkPayload({ handle, amount, description, orderNsu, webhookUrl, redirectUrl }) {
  const cents = toCents(amount);
  if (!normalizeHandle(handle)) throw new Error('Falta a InfiniteTag');
  if (cents < 100) throw new Error('Valor do link abaixo de R$ 1,00');
  return {
    handle: normalizeHandle(handle),
    items: [{ quantity: 1, price: cents, description: String(description || 'Mensalidade Pulse').slice(0, 120) }],
    order_nsu: orderNsu,
    ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
    ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
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

async function postJson(fetchImpl, path, body) {
  const r = await fetchImpl(`${INFINITEPAY_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!r.ok) throw new Error(`InfinitePay ${r.status}: ${data?.message || data?.error || text.slice(0, 200)}`);
  return data;
}

export async function createCheckoutLink(params, fetchImpl = fetch) {
  const payload = linkPayload(params);
  const response = await postJson(fetchImpl, '/links', payload);
  const url = extractLinkUrl(response);
  if (!url) throw Object.assign(new Error('A InfinitePay não devolveu a URL do link'), { response });
  return { url, slug: extractSlug(response, url), response, payload };
}

export function checkPayment({ handle, orderNsu, transactionNsu, slug }, fetchImpl = fetch) {
  return postJson(fetchImpl, '/payment_check', {
    handle: normalizeHandle(handle), order_nsu: orderNsu,
    ...(transactionNsu ? { transaction_nsu: transactionNsu } : {}),
    ...(slug ? { slug } : {}),
  });
}

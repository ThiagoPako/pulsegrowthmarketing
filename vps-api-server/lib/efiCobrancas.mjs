// ─── Efí Bank · API Cobranças: cartão pelo link de pagamento (pedido do usuário, 02/11/2026: "o cartão vamos passar
// pela Efí também"; "deixe tudo preparado apenas para a Efí"). Documentação oficial: https://dev.efipay.com.br/docs/api-cobrancas
// (credenciais, link de pagamento, notificações, status). O que vale daqui:
//   Base: produção https://cobrancas.api.efipay.com.br · homologação https://cobrancas-h.api.efipay.com.br (sem certificado)
//   POST /v1/authorize  Basic base64(client_id:client_secret), { grant_type: 'client_credentials' } → access_token (600 s)
//                       Mesmo par Client ID/Secret da API Pix, com a "API de Emissões" ligada na aplicação.
//   POST /v1/charge/one-step/link { items: [{ name, value (centavos), amount }], metadata: { custom_id, notification_url },
//                       settings: { payment_method: 'credit_card' | 'banking_billet' | 'all', expire_at: 'aaaa-mm-dd',
//                       request_delivery_address, message (até 80) } } → data { charge_id, status: 'link', payment_url, total }
//   GET  /v1/charge/:id → data { status, total, custom_id, ... }
//   GET  /v1/notification/:token → data [{ id, type, custom_id, identifiers: { charge_id }, status: { current, previous },
//                       value?, received_by_bank_at? }]   (a Efí faz POST na notification_url com o form "notification=<token>")
//   Status pago: paid (confirmado). settled = "marcado como pago" à mão no painel da Efí: também vale como pago.
//   identified/approved: pago, ainda não creditado (espera o paid). refunded/canceled/unpaid/expired: não pago.

export const EFI_COBRANCAS_BASE = {
  producao: 'https://cobrancas.api.efipay.com.br',
  homologacao: 'https://cobrancas-h.api.efipay.com.br',
};

export const PAID_STATUS = ['paid', 'settled'];
export const chargePaid = (status) => PAID_STATUS.includes(String(status || '').toLowerCase());

const toCents = (reais) => Math.round(Number(reais || 0) * 100);
const ascii = (s, max) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .,\-/]/g, '').trim().slice(0, max);

/** custom_id da mensalidade: o mesmo para o mesmo contrato, mês e valor no cartão (até 80 caracteres). */
export function customIdFor({ contractId, month, cardAmount }) {
  return `pulse-${String(month || '').replace(/\D/g, '')}-${String(contractId || '').slice(0, 36)}-${toCents(cardAmount)}`.slice(0, 80);
}

/** Corpo do link de pagamento só no cartão, já com a taxa repassada no valor. */
export function linkBody({ description, cardAmount, customId, notificationUrl, expireAt, message }) {
  return {
    items: [{ name: ascii(description, 255) || 'Mensalidade Agencia Pulse', value: toCents(cardAmount), amount: 1 }],
    metadata: { custom_id: customId, ...(notificationUrl ? { notification_url: notificationUrl } : {}) },
    settings: {
      payment_method: 'credit_card',
      expire_at: expireAt,
      request_delivery_address: false,
      ...(message ? { message: ascii(message, 80) } : {}),
    },
  };
}

/** Vence no vencimento + 30 dias (nunca antes de amanhã), no formato aaaa-mm-dd. */
export function expireAtFor(dueDate, { now = new Date() } = {}) {
  const base = dueDate ? Date.parse(`${dueDate}T12:00:00-03:00`) : now.getTime();
  const at = Math.max(base + 30 * 86400000, now.getTime() + 86400000);
  return new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Eventos de pagamento de uma notificação: [{ chargeId, customId, status, value (reais), at }] dos que dizem pago. */
export function paidEvents(data) {
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return list
    .filter((e) => e?.type === 'charge' && chargePaid(e?.status?.current))
    .map((e) => ({
      chargeId: e.identifiers?.charge_id != null ? String(e.identifiers.charge_id) : null,
      customId: e.custom_id || null,
      status: e.status.current,
      value: e.value != null ? Number(e.value) / 100 : null,
      at: e.received_by_bank_at || e.created_at || null,
    }))
    .filter((e) => e.chargeId);
}

/** Cliente da API Cobranças de uma conta (sem certificado; token renovado antes de vencer). */
export function createEfiCobrancasClient({ clientId, clientSecret, env = 'producao', fetchImpl = fetch, now = () => Date.now() }) {
  const base = EFI_COBRANCAS_BASE[env] || EFI_COBRANCAS_BASE.producao;
  let token = null;

  async function call(method, path, body, auth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = `Bearer ${await authorize()}`;
    else headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    const r = await fetchImpl(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!r.ok) {
      const msg = json?.error_description?.message || json?.error_description || json?.message || json?.error || text || `HTTP ${r.status}`;
      throw Object.assign(new Error(`Efí Cobranças ${r.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`.slice(0, 400)), { status: r.status, body: json });
    }
    return json;
  }

  async function authorize(force = false) {
    if (!force && token && token.until > now() + 30000) return token.value;
    const r = await call('POST', '/v1/authorize', { grant_type: 'client_credentials' }, false);
    token = { value: r.access_token, until: now() + (Number(r.expires_in) || 600) * 1000 };
    return token.value;
  }

  return {
    authorize,
    createLink: (body) => call('POST', '/v1/charge/one-step/link', body).then((r) => r?.data || r),
    getCharge: (id) => call('GET', `/v1/charge/${encodeURIComponent(id)}`).then((r) => r?.data || r),
    getNotification: (token) => call('GET', `/v1/notification/${encodeURIComponent(token)}`),
  };
}

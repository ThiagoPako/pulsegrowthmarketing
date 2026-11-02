// ─── Financeiro → Pagamentos · cartão pela Efí (pedido do usuário, 02/11/2026: "o cartão vamos passar pela Efí também";
// "deixe tudo preparado apenas para a Efí"). Substitui o link da InfinitePay. Com o cartão da Efí ligado na cidade:
//   - cada mensalidade ganha um link de pagamento da Efí só no cartão (até 12x), no valor com a taxa repassada
//     (cardAmount: a Pulse recebe a mensalidade inteira) e o aviso discreto de sempre na página e no PDF;
//   - pago: a Efí faz POST na notification_url (com hmac por cidade), o servidor consulta a notificação e a cobrança
//     (status paid/settled) e dá a mesma baixa do Pix (receita recebida, caixa e o obrigado com recibo);
//   - a cada 30 min confere os links abertos dos últimos 45 dias (pega o pagamento mesmo sem a notificação).
// Usa o mesmo Client ID/Secret da conta Efí da cidade (API Cobranças não pede certificado).
//
//   POST /api/payment-accounts/:city/efi/card-test   token da API Cobranças                             (admin)
//   PUT  /api/payment-accounts/:city/efi/card        { active }                                          (admin)
//   GET  /api/efi/card-links?month=aaaa-mm            links do mês com o status                           (admin)
//   POST /api/efi/card-links/:charge/check            confere de novo na Efí                              (admin)
//   POST /api/webhooks/efi-cobranca/:city?hmac=…      público (a Efí chama, form "notification")

import express from 'express';
import { createEfiCobrancasClient, chargePaid, customIdFor, expireAtFor, linkBody, paidEvents } from './lib/efiCobrancas.mjs';
import { cardAmount as withCardFee } from './lib/billingIsis.mjs';
import { newWebhookSecret, sameSecret } from './lib/efi.mjs';
import { CITIES, CITY_LABELS, efiCardOn, efiCardReady, publicAccount, decryptSecret } from './lib/paymentAccounts.mjs';
import { normalizeCityValue } from './lib/cityResolution.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const SWEEP_MS = 30 * 60 * 1000;

export function registerEfiCardRoutes(app, {
  pool, verifyAdmin, accountFor, ensureAccountsSchema, paymentConfigFor, markRevenuePaid, publicApiUrl,
  makeClient = createEfiCobrancasClient, logger = console, sweepEvery = SWEEP_MS, now = () => new Date(),
}) {
  const apiBase = String(publicApiUrl || 'https://agenciapulse.tech').replace(/\/+$/, '');

  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await ensureAccountsSchema();
        await pool.query(`
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_card_active BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_card_test_at TIMESTAMPTZ;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_card_test_ok BOOLEAN;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_card_test_error TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_card_secret TEXT;
          ALTER TABLE billing_pay_pages ADD COLUMN IF NOT EXISTS card_amount NUMERIC;
          CREATE TABLE IF NOT EXISTS efi_card_links (
            charge_id TEXT PRIMARY KEY,
            city TEXT NOT NULL,
            env TEXT NOT NULL,
            custom_id TEXT NOT NULL,
            contract_id UUID,
            client_id UUID,
            revenue_id UUID,
            month TEXT,
            amount NUMERIC NOT NULL,
            card_amount NUMERIC NOT NULL,
            url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'link',
            expire_at DATE,
            paid_value NUMERIC,
            paid_at TIMESTAMPTZ,
            raw JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS idx_efi_card_links_custom ON efi_card_links(custom_id);
          CREATE INDEX IF NOT EXISTS idx_efi_card_links_revenue ON efi_card_links(revenue_id);
        `);
      })().catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[efi-cartao] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status && error.status < 500 && !error.body ? error.status
      : error?.message === 'Unauthorized' ? 401 : error?.message === 'Admin access required' ? 403 : error?.body ? 502 : 500;
    if (status >= 500) logger.error('[efi-cartao] erro:', error.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  const cityParam = (req) => {
    const city = normalizeCityValue(req.params.city);
    if (!CITIES.includes(city)) throw httpError(400, 'Cidade inválida (uruacu ou minacu)');
    return city;
  };

  const clients = new Map();
  function clientFor(acc) {
    const stamp = `${acc.updated_at}|${acc.efi_env}`;
    const cached = clients.get(acc.city);
    if (cached?.stamp === stamp) return cached.client;
    const client = makeClient({
      clientId: decryptSecret(acc.efi_client_id_enc), clientSecret: decryptSecret(acc.efi_client_secret_enc), env: acc.efi_env || 'producao',
    });
    clients.set(acc.city, { stamp, client });
    return client;
  }

  const notificationUrl = (city, secret) => `${apiBase}/api/webhooks/efi-cobranca/${city}?hmac=${secret}`;

  // ── tela: testar e ligar ────────────────────────────────────────────────────────────────────────────────────
  app.post('/api/payment-accounts/:city/efi/card-test', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const city = cityParam(req);
      const acc = await accountFor(city);
      if (!acc?.efi_client_id_enc || !acc?.efi_client_secret_enc) throw httpError(400, `Salve o Client ID e o Client Secret da Efí de ${CITY_LABELS[city]} antes`);
      let result;
      try {
        await clientFor(acc).authorize(true);
        result = { ok: true };
      } catch (error) {
        result = {
          ok: false,
          error: error?.status === 401 || error?.status === 403
            ? 'A Efí recusou o acesso à API Cobranças. Na aplicação da Efí, ligue a "API Cobranças" (Emissões) e confira se o Client ID/Secret são do mesmo ambiente'
            : String(error?.message || 'Erro na Efí').slice(0, 300),
        };
      }
      await pool.query(
        `UPDATE payment_accounts SET efi_card_test_at = now(), efi_card_test_ok = $2, efi_card_test_error = $3,
                efi_card_active = CASE WHEN $2 THEN efi_card_active ELSE false END WHERE city = $1`,
        [city, result.ok, result.error || null]
      );
      clients.delete(city);
      res.json({ ...result, account: publicAccount(await accountFor(city), city) });
    } catch (error) { sendError(res, error); }
  });

  app.put('/api/payment-accounts/:city/efi/card', async (req, res) => {
    try {
      const { user } = await verifyAdmin(req);
      await ensureSchema();
      const city = cityParam(req);
      const on = !!req.body?.active;
      const acc = await accountFor(city);
      if (on && !efiCardReady(acc)) throw httpError(400, 'Teste o cartão da Efí antes de ligar');
      const who = String(user?.user_metadata?.name || user?.email || 'admin').slice(0, 80);
      await pool.query(
        `UPDATE payment_accounts SET efi_card_active = $2, efi_card_secret = coalesce(efi_card_secret, $3), updated_at = now(), updated_by = $4 WHERE city = $1`,
        [city, on, newWebhookSecret(), who]
      );
      clients.delete(city);
      res.json({ success: true, account: publicAccount(await accountFor(city), city) });
    } catch (error) { sendError(res, error); }
  });

  // ── cobrança: link do cartão da mensalidade ─────────────────────────────────────────────────────────────────
  /**
   * Link do cartão (billingIsisRoutes paymentLink). Cidade sem o cartão da Efí ligado: null (a cobrança sai só com o
   * Pix). Mesma mensalidade e mesmo valor, ainda aberto: o mesmo link. Devolve { url, cardAmount }.
   */
  async function paymentLink({ contract, revenue, amount, month, dueDate }) {
    await ensureSchema();
    const city = normalizeCityValue(contract.client_city || contract.city) || 'minacu';
    const acc = await accountFor(city);
    if (!efiCardOn(acc)) return null;
    const config = await paymentConfigFor(city).catch(() => null);
    const cardAmount = withCardFee(amount, config?.card_fee_percent);
    const customId = customIdFor({ contractId: contract.id, month, cardAmount });
    const today = now().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const { rows: [open] } = await pool.query(
      `SELECT * FROM efi_card_links WHERE custom_id = $1 AND env = $2 AND status IN ('new', 'link', 'waiting', 'paid', 'settled')
          AND (expire_at IS NULL OR expire_at >= $3::date) ORDER BY created_at DESC LIMIT 1`,
      [customId, acc.efi_env, today]
    );
    if (open) return { url: open.url, cardAmount: Number(open.card_amount), paid: chargePaid(open.status) };
    const name = String(contract.company_name || '').trim();
    const expireAt = expireAtFor(dueDate, { now: now() });
    const secret = acc.efi_card_secret || newWebhookSecret();
    if (!acc.efi_card_secret) await pool.query(`UPDATE payment_accounts SET efi_card_secret = $2 WHERE city = $1`, [city, secret]);
    const data = await clientFor(acc).createLink(linkBody({
      description: `Mensalidade Agencia Pulse ${month.split('-').reverse().join('/')}${name ? ` - ${name}` : ''}`,
      cardAmount, customId, notificationUrl: notificationUrl(city, secret), expireAt,
      message: `Mensalidade ${month.split('-').reverse().join('/')}`,
    }));
    if (!data?.payment_url || data?.charge_id == null) throw new Error('A Efí não devolveu o link de pagamento');
    await pool.query(
      `INSERT INTO efi_card_links (charge_id, city, env, custom_id, contract_id, client_id, revenue_id, month, amount, card_amount, url, status, expire_at, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (charge_id) DO UPDATE SET url = EXCLUDED.url, status = EXCLUDED.status, raw = EXCLUDED.raw, updated_at = now()`,
      [String(data.charge_id), city, acc.efi_env, customId, contract.id || null, contract.client_id || null, revenue?.id || null, month,
        amount, cardAmount, data.payment_url, data.status || 'link', expireAt, JSON.stringify(data)]
    );
    return { url: data.payment_url, cardAmount };
  }

  // ── pagamento: conferir na Efí e dar baixa ───────────────────────────────────────────────────────────────────
  async function confirmLink(link, hint = {}) {
    const acc = await accountFor(link.city);
    if (!acc?.efi_client_id_enc) return { paid: false, reason: 'sem_conta' };
    const charge = await clientFor(acc).getCharge(link.charge_id);
    const status = String(charge?.status || link.status);
    if (!chargePaid(status)) {
      await pool.query(`UPDATE efi_card_links SET status = $2, raw = $3, updated_at = now() WHERE charge_id = $1`, [link.charge_id, status, JSON.stringify(charge)]);
      return { paid: false, status };
    }
    const { rows: [updated] } = await pool.query(
      `UPDATE efi_card_links SET status = $2, paid_value = coalesce($3, paid_value), paid_at = coalesce(paid_at, $4::timestamptz, now()),
              raw = $5, updated_at = now() WHERE charge_id = $1 AND paid_at IS NULL RETURNING *`,
      [link.charge_id, status, hint.value ?? (charge?.total != null ? Number(charge.total) / 100 : null), hint.at || null, JSON.stringify(charge)]
    );
    const marked = updated && link.revenue_id ? await markRevenuePaid(link.revenue_id) : false;
    logger.log?.(`[efi-cartao] pago: ${link.charge_id}${marked ? ' (receita baixada)' : ''}`);
    return { paid: true, marked };
  }

  // notificação: form "notification=<token>"; responde 200 na hora, confere depois (o corpo não vale como prova)
  app.post('/api/webhooks/efi-cobranca/:city', express.urlencoded({ extended: false }), async (req, res) => {
    const city = normalizeCityValue(req.params.city);
    if (!CITIES.includes(city)) return res.status(404).json({ error: 'cidade' });
    let acc = null;
    try {
      await ensureSchema();
      acc = await accountFor(city);
    } catch { /* sem banco: recusa abaixo */ }
    if (!acc?.efi_card_secret || !sameSecret(req.query?.hmac, acc.efi_card_secret)) return res.status(401).json({ error: 'hmac' });
    res.status(200).send('200');
    const token = String(req.body?.notification || '').trim();
    if (!token || !acc.efi_client_id_enc) return;
    try {
      const events = paidEvents(await clientFor(acc).getNotification(token));
      for (const e of events) {
        const { rows: [link] } = await pool.query(`SELECT * FROM efi_card_links WHERE charge_id = $1`, [e.chargeId]);
        if (link && !link.paid_at) await confirmLink(link, { value: e.value, at: e.at });
      }
    } catch (error) {
      logger.error('[efi-cartao] notificação:', error.message);
    }
  });

  // ── varredura: links abertos dos últimos 45 dias ────────────────────────────────────────────────────────────
  let sweeping = false;
  async function sweep() {
    if (sweeping) return { skipped: true };
    sweeping = true;
    let paid = 0;
    try {
      await ensureSchema();
      const { rows } = await pool.query(
        `SELECT * FROM efi_card_links WHERE paid_at IS NULL AND status NOT IN ('canceled', 'refunded', 'expired')
            AND created_at > now() - interval '45 days' AND updated_at < now() - interval '20 minutes' ORDER BY updated_at LIMIT 30`
      );
      for (const link of rows) {
        const r = await confirmLink(link).catch((error) => { logger.error('[efi-cartao] varredura', link.charge_id, error.message); return null; });
        if (r?.paid) paid += 1;
      }
      return { conferidos: rows.length, pagos: paid };
    } finally {
      sweeping = false;
    }
  }
  if (sweepEvery > 0) {
    const timer = setInterval(() => sweep().catch((e) => logger.error('[efi-cartao] varredura:', e.message)), sweepEvery);
    timer.unref?.();
  }

  app.get('/api/efi/card-links', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : now().toISOString().slice(0, 7);
      const { rows } = await pool.query(
        `SELECT l.charge_id, l.city, l.env, l.month, l.amount, l.card_amount, l.url, l.status, l.paid_value, l.paid_at, l.created_at,
                c.company_name AS client
           FROM efi_card_links l LEFT JOIN clients c ON c.id = l.client_id
          WHERE l.month = $1 ORDER BY l.created_at DESC`, [month]
      );
      res.json({ month, links: rows });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/efi/card-links/:charge/check', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const { rows: [link] } = await pool.query(`SELECT * FROM efi_card_links WHERE charge_id = $1`, [String(req.params.charge)]);
      if (!link) throw httpError(404, 'Link não encontrado');
      res.json(await confirmLink(link));
    } catch (error) { sendError(res, error); }
  });

  return { paymentLink, confirmLink, sweep, ensureSchema };
}

// ─── InfinitePay: links das mensalidades e baixa automática (pedido do usuário, 01/11/2026) ─────────────────────
// A InfiniteTag fica em payment_config.infinitepay_handle (Financeiro → Cobranças → Mensagens e modo; o Thiago
// cadastra). Cada mensalidade ganha um link (payment_links, reaproveitado enquanto o valor não muda) que entra na
// cobrança da Ísis. Pagou: a InfinitePay chama o webhook, o servidor confere no payment_check e só então a receita
// fica "recebida" e entra no saldo (como o "Marcar como paga" do Financeiro).
//
// Rotas:
//   POST /api/webhooks/infinitepay               (público; a InfinitePay chama) responde 200 na hora e confere depois
//   GET  /api/infinitepay/links?month=AAAA-MM    (admin) links do mês com o status
//   POST /api/infinitepay/test-link              (admin) { amount } cria um link de teste de R$ 1,00+ (não cobra ninguém)
//   POST /api/infinitepay/check/:id              (admin) confere de novo um link na InfinitePay

import { createCheckoutLink, checkPayment, isPaidCheck, normalizeHandle, orderNsuFor, readWebhook } from './lib/infinitePay.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const todayBr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export function registerInfinitePayRoutes(app, {
  pool, verifyAdmin, paymentConfigFor, publicApiUrl, tableHasCityColumn, fetchImpl = fetch, logger = console, onRevenuePaid = null,
}) {
  const webhookUrl = `${String(publicApiUrl || 'https://agenciapulse.tech').replace(/\/+$/, '')}/api/webhooks/infinitepay`;

  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS infinitepay_handle TEXT;
        ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS handle TEXT;
        ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS city TEXT;
        CREATE TABLE IF NOT EXISTS payment_links (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider TEXT NOT NULL DEFAULT 'infinitepay',
          order_nsu TEXT NOT NULL,
          revenue_id UUID,
          contract_id UUID,
          client_id UUID,
          month TEXT,
          amount NUMERIC NOT NULL,
          url TEXT NOT NULL,
          slug TEXT,
          status TEXT NOT NULL DEFAULT 'aberto',
          capture_method TEXT,
          transaction_nsu TEXT,
          receipt_url TEXT,
          paid_amount NUMERIC,
          paid_at TIMESTAMPTZ,
          raw JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_payment_links_order ON payment_links(order_nsu);
      `).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[infinitepay] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : error?.message === 'Admin access required' ? 403 : 500);
    if (status >= 500) logger.error('[infinitepay] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  /**
   * Link da mensalidade para a cobrança da Ísis (billingIsisRoutes paymentLink). Sem InfiniteTag cadastrada: null
   * (a cobrança sai só com o Pix). Mesmo valor e mesma mensalidade: o mesmo link.
   */
  async function paymentLink({ contract, revenue, amount, month }) {
    await ensureSchema();
    const config = await paymentConfigFor(contract.city || contract.client_city);
    const handle = normalizeHandle(config?.infinitepay_handle);
    if (!handle) return null;
    const orderNsu = orderNsuFor({ revenueId: revenue?.id, contractId: contract.id, month });
    const { rows: [open] } = await pool.query(
      `SELECT * FROM payment_links WHERE order_nsu = $1 AND amount = $2 AND status <> 'cancelado' ORDER BY created_at DESC LIMIT 1`,
      [orderNsu, amount]
    );
    if (open) return open.url;
    const name = String(contract.company_name || '').trim();
    const link = await createCheckoutLink({
      handle, amount, orderNsu, webhookUrl,
      description: `Mensalidade Pulse ${month.split('-').reverse().join('/')} · ${name}`,
    }, fetchImpl);
    // a conta (InfiniteTag) da cidade do cliente fica no link: o pagamento é conferido na mesma conta
    await pool.query(
      `INSERT INTO payment_links (order_nsu, revenue_id, contract_id, client_id, month, amount, url, slug, raw, handle, city)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [orderNsu, revenue?.id || null, contract.id, contract.client_id, month, amount, link.url, link.slug, JSON.stringify(link.response),
        handle, contract.client_city || contract.city || null]
    );
    return link.url;
  }

  // receita paga: status, data e a entrada no saldo (mesma descrição do Financeiro, para reverter depois)
  async function markRevenuePaid(revenueId) {
    const { rows: [rev] } = await pool.query(
      `SELECT r.*, c.company_name, c.city AS client_city FROM revenues r LEFT JOIN clients c ON c.id = r.client_id WHERE r.id = $1`, [revenueId]
    );
    if (!rev || rev.status === 'recebida' || rev.status === 'pago') return false;
    const today = todayBr();
    await pool.query(`UPDATE revenues SET status = 'recebida', paid_at = $2, updated_at = now() WHERE id = $1`, [revenueId, today]);
    const amount = Number(rev.amount) || 0;
    const label = `${String(rev.company_name || 'Receita avulsa').trim()} - ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    const withCity = await tableHasCityColumn('cash_reserve_movements').catch(() => false);
    await pool.query(
      withCity
        ? `INSERT INTO cash_reserve_movements (amount, type, description, date, is_reserve, city) VALUES ($1, 'entrada', $2, $3, false, coalesce($4, 'minacu'))`
        : `INSERT INTO cash_reserve_movements (amount, type, description, date, is_reserve) VALUES ($1, 'entrada', $2, $3, false)`,
      withCity ? [amount, `[Receita] ${label} - ID: ${revenueId}`, today, rev.city || rev.client_city || null]
        : [amount, `[Receita] ${label} - ID: ${revenueId}`, today]
    );
    // obrigado ao cliente (billingIsisRoutes.mjs), sem travar a baixa
    Promise.resolve().then(() => onRevenuePaid?.(revenueId)).catch((error) => console.error('[infinitepay] obrigado:', error.message));
    return true;
  }

  /** Confere o link na InfinitePay e dá baixa se pago. */
  async function verify(link, hint = {}) {
    // confere na conta que criou o link (cada cidade tem a sua)
    const handle = normalizeHandle(link.handle) || normalizeHandle((await paymentConfigFor(link.city || null))?.infinitepay_handle);
    if (!handle) throw httpError(400, 'Sem InfiniteTag cadastrada');
    const check = await checkPayment({ handle, orderNsu: link.order_nsu, transactionNsu: hint.transactionNsu || link.transaction_nsu, slug: hint.slug || link.slug }, fetchImpl);
    if (!isPaidCheck(check)) {
      await pool.query(`UPDATE payment_links SET raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('last_check', $2::jsonb), updated_at = now() WHERE id = $1`, [link.id, JSON.stringify(check)]);
      return { paid: false, check };
    }
    await pool.query(
      `UPDATE payment_links SET status = 'pago', paid_at = coalesce(paid_at, now()), capture_method = coalesce($2, capture_method),
              transaction_nsu = coalesce($3, transaction_nsu), receipt_url = coalesce($4, receipt_url), paid_amount = coalesce($5, paid_amount),
              updated_at = now() WHERE id = $1`,
      [link.id, check.capture_method || hint.captureMethod || null, hint.transactionNsu || null, hint.receiptUrl || null,
        check.paid_amount != null ? Number(check.paid_amount) / 100 : null]
    );
    const marked = link.revenue_id ? await markRevenuePaid(link.revenue_id) : false;
    logger.log?.(`[infinitepay] pago: ${link.order_nsu}${marked ? ' (receita baixada)' : ''}`);
    return { paid: true, marked, check };
  }

  app.post('/api/webhooks/infinitepay', async (req, res) => {
    const hook = readWebhook(req.body);
    // responder rápido (a documentação pede < 1 s); a conferência roda depois
    res.status(200).json({ success: true });
    if (!hook.orderNsu) return;
    try {
      await ensureSchema();
      const { rows: [link] } = await pool.query(`SELECT * FROM payment_links WHERE order_nsu = $1 ORDER BY created_at DESC LIMIT 1`, [hook.orderNsu]);
      if (!link || link.status === 'pago') return;
      await verify(link, hook);
    } catch (error) {
      logger.error('[infinitepay] webhook:', hook.orderNsu, error.message);
    }
  });

  app.get('/api/infinitepay/links', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : todayBr().slice(0, 7);
      const { rows } = await pool.query(
        `SELECT l.id, l.order_nsu, l.month, l.amount, l.url, l.status, l.capture_method, l.paid_amount, l.paid_at, l.receipt_url, l.created_at,
                l.handle, l.city, c.company_name AS client
           FROM payment_links l LEFT JOIN clients c ON c.id = l.client_id
          WHERE l.month = $1 OR l.month IS NULL ORDER BY l.created_at DESC`,
        [month]
      );
      const handles = {};
      for (const city of ['uruacu', 'minacu']) handles[city] = normalizeHandle((await paymentConfigFor(city))?.infinitepay_handle) || null;
      res.json({ handle: handles.uruacu || handles.minacu || null, handles, webhook_url: webhookUrl, links: rows });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/infinitepay/test-link', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const city = ['uruacu', 'minacu'].includes(req.body?.city) ? req.body.city : 'uruacu';
      const handle = normalizeHandle((await paymentConfigFor(city))?.infinitepay_handle);
      if (!handle) throw httpError(400, `Cadastre a InfiniteTag de ${city === 'uruacu' ? 'Uruaçu' : 'Minaçu'} antes`);
      const amount = Math.max(1, Number(req.body?.amount) || 1);
      const orderNsu = `pulse-teste-${Date.now()}`;
      const link = await createCheckoutLink({ handle, amount, orderNsu, webhookUrl, description: 'Teste de link Pulse' }, fetchImpl);
      await pool.query(
        `INSERT INTO payment_links (order_nsu, month, amount, url, slug, raw, handle, city) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)`,
        [orderNsu, amount, link.url, link.slug, JSON.stringify(link.response), handle, city]
      );
      res.json({ success: true, url: link.url, response: link.response });
    } catch (error) {
      if (error.response) return res.status(502).json({ error: error.message, response: error.response });
      sendError(res, error);
    }
  });

  app.post('/api/infinitepay/check/:id', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const { rows: [link] } = await pool.query(`SELECT * FROM payment_links WHERE id::text = $1`, [String(req.params.id)]);
      if (!link) throw httpError(404, 'Link não encontrado');
      res.json(await verify(link));
    } catch (error) { sendError(res, error); }
  });

  return { paymentLink, ensureSchema };
}

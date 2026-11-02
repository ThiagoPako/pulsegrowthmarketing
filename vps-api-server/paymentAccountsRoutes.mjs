// ─── Financeiro → Pagamentos · InfinitePay (pedido do usuário, 01/11/2026) ────────────────────────────────────
// Uma conta por cidade (tabela payment_accounts), só para admin. A tela edita a InfiniteTag, a chave Pix, o recebedor,
// documento, banco e "ativo"; "Testar conexão" cria um link de R$ 1,00 na InfinitePay com a tag (ninguém é cobrado) e
// guarda ok/erro. É a única fonte dos dados de pagamento: overlay() vai por cima de paymentConfigForCity (server.mjs).
// Ao salvar, os mesmos campos são copiados para a linha da cidade em payment_config, para as telas e a cobrança antigas
// lerem o mesmo valor (ninguém edita lá: a Config só mostra e leva para cá).
// Migração: na primeira vez, cada cidade nasce com o que já estava na linha dela em payment_config.
//
//   GET  /api/payment-accounts                 → { accounts: [...], webhook_url }
//   PUT  /api/payment-accounts/:city           { infinitepay_handle, pix_key, receiver_name, document, bank, active,
//                                                api_key (inchk_…, só escrita), clear_api_key }
//   POST /api/payment-accounts/:city/test      → { ok, url?, error?, with_api_key } (link de teste de R$ 1,00)
// É o Checkout InfinitePay (link de pagamento hospedado), não checkout transparente.

import {
  CITIES, CITY_LABELS, normalizeAccountInput, publicAccount, overlayConfig, encryptSecret, last4, checkApiKeyInput, accountApiKey,
} from './lib/paymentAccounts.mjs';
import { normalizeHandle, createCheckoutLink, validUntilFor } from './lib/infinitePay.mjs';
import { normalizeCityValue } from './lib/cityResolution.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });

export function registerPaymentAccountsRoutes(app, {
  pool, verifyAdmin, legacyConfigFor, tableHasCityColumn, publicApiUrl, fetchImpl = fetch, logger = console,
}) {
  const webhookUrl = `${String(publicApiUrl || 'https://agenciapulse.tech').replace(/\/+$/, '')}/api/webhooks/infinitepay`;

  /** A linha da própria cidade em payment_config (sem coluna de cidade: a única linha, tratada como Minaçu). */
  async function ownConfigRow(city) {
    const hasCity = await tableHasCityColumn('payment_config').catch(() => false);
    const { rows } = await pool.query('SELECT * FROM payment_config').catch(() => ({ rows: [] }));
    return rows.find((r) => (hasCity ? normalizeCityValue(r.city) || 'minacu' : 'minacu') === city) || null;
  }

  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS payment_accounts (
            city TEXT PRIMARY KEY,
            infinitepay_handle TEXT,
            pix_key TEXT,
            receiver_name TEXT,
            document TEXT,
            bank TEXT,
            active BOOLEAN NOT NULL DEFAULT true,
            api_key_enc TEXT,
            api_key_last4 TEXT,
            last_test_at TIMESTAMPTZ,
            last_test_ok BOOLEAN,
            last_test_error TEXT,
            last_test_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by TEXT
          );
          -- 02/11/2026: o Checkout InfinitePay não tem client_id/secret; no lugar, a API Key (inchk_…)
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS api_key_enc TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS api_key_last4 TEXT;
          ALTER TABLE payment_accounts DROP COLUMN IF EXISTS api_client_id;
          ALTER TABLE payment_accounts DROP COLUMN IF EXISTS api_secret_enc;
          ALTER TABLE payment_accounts DROP COLUMN IF EXISTS api_secret_last4;
        `);
        // migração: cada cidade nasce com o que já estava salvo na linha dela (nada se perde)
        for (const city of CITIES) {
          const row = await ownConfigRow(city);
          if (!row) continue;
          await pool.query(
            `INSERT INTO payment_accounts (city, infinitepay_handle, pix_key, receiver_name, document, bank, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'migração da Config') ON CONFLICT (city) DO NOTHING`,
            [city, normalizeHandle(row.infinitepay_handle) || null, row.pix_key || null, row.receiver_name || null, row.document || null, row.bank || null]
          );
        }
      })().catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[pagamentos] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : error?.message === 'Admin access required' ? 403 : 500);
    if (status >= 500) logger.error('[pagamentos] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  const cityParam = (req) => {
    const city = normalizeCityValue(req.params.city);
    if (!CITIES.includes(city)) throw httpError(400, 'Cidade inválida (uruacu ou minacu)');
    return city;
  };

  async function accountFor(city) {
    await ensureSchema();
    const { rows: [acc] } = await pool.query(`SELECT * FROM payment_accounts WHERE city = $1`, [city]);
    return acc || null;
  }

  /** paymentConfigForCity com a conta do módulo por cima (a conta manda). */
  async function overlay(city, configRow) {
    const key = normalizeCityValue(city) || 'minacu';
    const acc = await accountFor(key).catch(() => null);
    return overlayConfig(configRow, acc, key);
  }

  /** Copia os dados da conta para a linha da cidade em payment_config (leitores antigos veem o mesmo valor). */
  async function mirror(city, acc) {
    const row = await ownConfigRow(city);
    if (!row?.id) return;
    await pool.query(
      `UPDATE payment_config SET pix_key = $2, receiver_name = $3, document = $4, bank = $5, infinitepay_handle = $6 WHERE id = $1`,
      // conta desativada: sem Pix e sem tag também para a cobrança antiga
      [row.id, acc.active === false ? '' : acc.pix_key || '', acc.receiver_name || '', acc.document || '', acc.bank || '',
        acc.active === false ? null : acc.infinitepay_handle || null]
    ).catch((error) => logger.error('[pagamentos] cópia na Config:', error.message));
  }

  app.get('/api/payment-accounts', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const { rows } = await pool.query(`SELECT * FROM payment_accounts`);
      res.json({
        accounts: CITIES.map((city) => publicAccount(rows.find((r) => r.city === city), city)),
        webhook_url: webhookUrl,
      });
    } catch (error) { sendError(res, error); }
  });

  app.put('/api/payment-accounts/:city', async (req, res) => {
    try {
      const { user } = await verifyAdmin(req);
      await ensureSchema();
      const city = cityParam(req);
      const patch = normalizeAccountInput(req.body || {});
      const before = await accountFor(city);
      // API Key do Checkout: só escrita, cifrada; a tela recebe só os 4 últimos caracteres
      if (typeof req.body?.api_key === 'string' && req.body.api_key.trim()) {
        const key = checkApiKeyInput(req.body.api_key);
        patch.api_key_enc = encryptSecret(key);
        patch.api_key_last4 = last4(key);
      } else if (req.body?.clear_api_key) {
        patch.api_key_enc = null;
        patch.api_key_last4 = null;
      }
      // mudou a tag ou a key: o teste anterior não vale mais
      if ((patch.infinitepay_handle !== undefined && patch.infinitepay_handle !== (before?.infinitepay_handle || null))
        || patch.api_key_enc !== undefined) {
        patch.last_test_ok = null;
        patch.last_test_error = null;
        patch.last_test_at = null;
      }
      const cols = Object.keys(patch);
      const who = String(user?.user_metadata?.name || user?.email || 'admin').slice(0, 80);
      await pool.query(
        `INSERT INTO payment_accounts (city, ${cols.join(', ')}${cols.length ? ', ' : ''}updated_at, updated_by)
         VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join('')}, now(), $${cols.length + 2})
         ON CONFLICT (city) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}${cols.length ? ', ' : ''}updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [city, ...cols.map((c) => patch[c]), who]
      );
      const acc = await accountFor(city);
      await mirror(city, acc);
      res.json({ success: true, account: publicAccount(acc, city) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/payment-accounts/:city/test', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const city = cityParam(req);
      const acc = await accountFor(city);
      const handle = normalizeHandle(acc?.infinitepay_handle);
      if (!handle) throw httpError(400, `Cadastre a InfiniteTag de ${CITY_LABELS[city]} antes de testar`);
      const orderNsu = `pulse-teste-${city}-${Date.now()}`;
      const apiKey = accountApiKey(acc);
      let result;
      try {
        // link de R$ 1,00: só cria o link (ninguém é cobrado); prova que a tag existe e a API responde. Com a API Key,
        // vai com as mesmas options da cobrança e sem fallback, para mostrar se a key foi aceita.
        const link = await createCheckoutLink({
          handle, amount: 1, orderNsu, webhookUrl, description: `Teste de conexão Pulse · ${CITY_LABELS[city]}`,
          apiKey, options: apiKey ? { single_payment: true, valid_until: validUntilFor(null, { graceDays: 1 }) } : null, fallback: false,
        }, fetchImpl);
        await pool.query(
          `INSERT INTO payment_links (order_nsu, month, amount, url, slug, raw, handle, city) VALUES ($1, NULL, 1, $2, $3, $4, $5, $6)`,
          [orderNsu, link.url, link.slug, JSON.stringify(link.response), handle, city]
        ).catch(() => {});
        result = { ok: true, url: link.url, with_api_key: !!apiKey };
      } catch (error) {
        const msg = String(error?.message || 'Erro na InfinitePay').slice(0, 300);
        result = {
          ok: false, with_api_key: !!apiKey,
          error: apiKey && (error?.status === 401 || error?.status === 403)
            ? `A InfinitePay recusou a API Key (${error.status}): confira se ela está ativa e se é da mesma conta da InfiniteTag $${handle}`
            : msg,
        };
      }
      await pool.query(
        `UPDATE payment_accounts SET last_test_at = now(), last_test_ok = $2, last_test_error = $3, last_test_url = $4 WHERE city = $1`,
        [city, result.ok, result.error || null, result.url || null]
      );
      res.json({ ...result, account: publicAccount(await accountFor(city), city) });
    } catch (error) { sendError(res, error); }
  });

  /** API Key do Checkout da cidade, decifrada (só para o servidor mandar no X-Api-Key); sem key: null. */
  async function checkoutApiKeyFor(city) {
    const acc = await accountFor(normalizeCityValue(city) || 'minacu').catch(() => null);
    return accountApiKey(acc);
  }

  return { overlay, accountFor, checkoutApiKeyFor, ensureSchema };
}

// ─── Financeiro → Pagamentos · Efí Bank (pedido do usuário, 02/11/2026: "Vou trocar de banco, usar o Efí") ──────────
// A conta Efí de cada cidade fica em payment_accounts (paymentAccountsRoutes.mjs), com Client ID, Client Secret e o
// certificado .p12 cifrados. Com a Efí ligada numa cidade:
//   - cada mensalidade ganha um Pix dinâmico (cob da Efí, txid ligado ao contrato + mês + valor); o copia e cola da
//     mensagem, do PDF e da página /pagar passa a ser o da Efí, já com o valor (pixCharge);
//   - pago: o webhook Pix da Efí avisa e o servidor confere a cobrança pelo txid (GET /v2/cob/:txid, status CONCLUIDA)
//     antes de dar baixa (a mesma baixa da InfinitePay: receita recebida, entrada no caixa e o obrigado com recibo);
//   - a cada 10 min a varredura busca os Pix recebidos das últimas 48 h (GET /v2/pix): pega o pagamento mesmo sem o
//     webhook (o webhook exige mTLS no nginx) e guarda as movimentações; Pix sem cobrança nossa fica "conferir".
// Cidade sem a Efí ligada: Pix pela chave + comprovante (pixReceiptRoutes). O cartão vai pela Efí (efiCardRoutes).
//
//   PUT  /api/payment-accounts/:city/efi          { efi_env, efi_pix_key, efi_active, client_id, client_secret,
//                                                   cert_base64, cert_name, clear }                    (admin)
//   POST /api/payment-accounts/:city/efi/test     token OAuth + lista as cobranças das últimas 24 h + saldo   (admin)
//   POST /api/payment-accounts/:city/efi/webhook  cadastra a URL do webhook na chave Pix (PUT /v2/webhook)   (admin)
//   GET  /api/efi/movements?month=aaaa-mm         Pix recebidos das cidades, conciliados ou "conferir", e saldo (admin)
//   POST /api/efi/movements/:e2e/conferido        marca um Pix sem cobrança como conferido                   (admin)
//   POST /api/webhooks/efi/:city[/pix]?hmac=…     público (a Efí chama), responde 200 na hora e confere depois

import {
  createEfiClient, checkCertificate, cobBody, cobPaid, readEfiWebhook, payerName, txidFor, newWebhookSecret, sameSecret,
  webhookUrlFor, EFI_SCOPES_REQUIRED, EFI_WEBHOOK_IP,
} from './lib/efi.mjs';
import {
  CITIES, CITY_LABELS, normalizeEfiInput, efiOn, efiComplete, efiKey, publicAccount, encryptSecret, decryptSecret, last4,
} from './lib/paymentAccounts.mjs';
import { normalizeCityValue } from './lib/cityResolution.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const SWEEP_MS = 10 * 60 * 1000;

export function registerEfiPixRoutes(app, {
  pool, verifyAdmin, accountFor, ensureAccountsSchema, markRevenuePaid, publicApiUrl, mirrorAccount = async () => {},
  makeClient = createEfiClient, logger = console, sweepEvery = SWEEP_MS, now = () => new Date(),
}) {
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await ensureAccountsSchema();
        await pool.query(`
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_active BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_env TEXT NOT NULL DEFAULT 'producao';
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_pix_key TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_client_id_enc TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_client_id_last4 TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_client_secret_enc TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_client_secret_last4 TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_cert_enc TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_cert_name TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_cert_uploaded_at TIMESTAMPTZ;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_scopes TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_last_test_at TIMESTAMPTZ;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_last_test_ok BOOLEAN;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_last_test_error TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_webhook_secret TEXT;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_webhook_at TIMESTAMPTZ;
          ALTER TABLE payment_accounts ADD COLUMN IF NOT EXISTS efi_webhook_error TEXT;
          -- a "credencial da API" da InfinitePay (client_id/secret) não existe: o Checkout dela não tem; sai
          ALTER TABLE payment_accounts DROP COLUMN IF EXISTS api_client_id;
          ALTER TABLE payment_accounts DROP COLUMN IF EXISTS api_secret_enc;
          ALTER TABLE payment_accounts DROP COLUMN IF EXISTS api_secret_last4;
          CREATE TABLE IF NOT EXISTS efi_charges (
            txid TEXT PRIMARY KEY,
            city TEXT NOT NULL,
            env TEXT NOT NULL,
            contract_id UUID,
            client_id UUID,
            revenue_id UUID,
            month TEXT,
            amount NUMERIC NOT NULL,
            loc_id TEXT,
            pix_copia_e_cola TEXT,
            status TEXT NOT NULL DEFAULT 'ATIVA',
            expires_at TIMESTAMPTZ,
            e2e_id TEXT,
            paid_amount NUMERIC,
            paid_at TIMESTAMPTZ,
            raw JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS idx_efi_charges_revenue ON efi_charges(revenue_id);
          CREATE TABLE IF NOT EXISTS efi_pix_received (
            e2e_id TEXT PRIMARY KEY,
            city TEXT NOT NULL,
            env TEXT NOT NULL,
            txid TEXT,
            amount NUMERIC NOT NULL,
            received_at TIMESTAMPTZ,
            payer_name TEXT,
            info_pagador TEXT,
            status TEXT NOT NULL DEFAULT 'conferir',
            revenue_id UUID,
            refunded BOOLEAN NOT NULL DEFAULT false,
            raw JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS idx_efi_pix_received_at ON efi_pix_received(city, received_at);
        `);
      })().catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[efi] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status && error.status < 500 && !error.body ? error.status
      : error?.message === 'Unauthorized' ? 401 : error?.message === 'Admin access required' ? 403 : error?.body ? 502 : 500;
    if (status >= 500) logger.error('[efi] erro:', error.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  const cityParam = (req) => {
    const city = normalizeCityValue(req.params.city);
    if (!CITIES.includes(city)) throw httpError(400, 'Cidade inválida (uruacu ou minacu)');
    return city;
  };

  // cliente da Efí por cidade, refeito quando a conta muda (updated_at)
  const clients = new Map();
  function clientFor(acc) {
    const stamp = `${acc.updated_at}|${acc.efi_env}`;
    const cached = clients.get(acc.city);
    if (cached?.stamp === stamp) return cached.client;
    const client = makeClient({
      clientId: decryptSecret(acc.efi_client_id_enc),
      clientSecret: decryptSecret(acc.efi_client_secret_enc),
      p12: Buffer.from(decryptSecret(acc.efi_cert_enc), 'base64'),
      env: acc.efi_env || 'producao',
    });
    clients.set(acc.city, { stamp, client });
    return client;
  }

  async function activeAccount(city) {
    await ensureSchema();
    const acc = await accountFor(normalizeCityValue(city) || 'minacu');
    return efiOn(acc) ? acc : null;
  }

  // ── tela: salvar, testar, webhook ───────────────────────────────────────────────────────────────────────────
  app.put('/api/payment-accounts/:city/efi', async (req, res) => {
    try {
      const { user } = await verifyAdmin(req);
      await ensureSchema();
      const city = cityParam(req);
      const body = req.body || {};
      const patch = normalizeEfiInput(body);
      const before = await accountFor(city);
      let credentialsChanged = patch.efi_env !== undefined && patch.efi_env !== (before?.efi_env || 'producao');
      if (patch.efi_pix_key !== undefined && patch.efi_pix_key !== (before?.efi_pix_key || null)) credentialsChanged = true;
      // segredos: só escrita, cifrados; a tela recebe só os 4 últimos caracteres
      for (const [field, col] of [['client_id', 'efi_client_id'], ['client_secret', 'efi_client_secret']]) {
        const v = typeof body[field] === 'string' ? body[field].trim() : '';
        if (!v) continue;
        if (v.length < 8 || /\s/.test(v)) throw httpError(400, `${field === 'client_id' ? 'Client ID' : 'Client Secret'} da Efí inválido`);
        patch[`${col}_enc`] = encryptSecret(v);
        patch[`${col}_last4`] = last4(v);
        credentialsChanged = true;
      }
      if (typeof body.cert_base64 === 'string' && body.cert_base64) {
        const buf = checkCertificate(body.cert_base64.replace(/^data:[^,]*,/, ''));
        patch.efi_cert_enc = encryptSecret(buf.toString('base64'));
        patch.efi_cert_name = String(body.cert_name || 'certificado.p12').replace(/[^\w.\- ]/g, '').slice(0, 80) || 'certificado.p12';
        patch.efi_cert_uploaded_at = now();
        credentialsChanged = true;
      }
      if (body.clear) {
        Object.assign(patch, {
          efi_active: false, efi_client_id_enc: null, efi_client_id_last4: null, efi_client_secret_enc: null, efi_client_secret_last4: null,
          efi_cert_enc: null, efi_cert_name: null, efi_cert_uploaded_at: null, efi_scopes: null, efi_webhook_at: null, efi_webhook_error: null,
        });
        credentialsChanged = true;
      }
      // credencial nova: o teste anterior não vale mais e a Efí desliga até passar no teste de novo
      if (credentialsChanged) Object.assign(patch, { efi_last_test_at: null, efi_last_test_ok: null, efi_last_test_error: null, efi_active: false });
      if (patch.efi_active) {
        const merged = { ...(before || {}), ...patch };
        if (!efiComplete(merged)) throw httpError(400, 'Para ligar a Efí: Client ID, Client Secret, certificado e chave Pix');
        if (merged.efi_last_test_ok !== true) throw httpError(400, 'Teste a conexão com a Efí antes de ligar');
      }
      const cols = Object.keys(patch);
      if (!cols.length) return res.json({ success: true, account: publicAccount(before, city) });
      const who = String(user?.user_metadata?.name || user?.email || 'admin').slice(0, 80);
      await pool.query(
        `INSERT INTO payment_accounts (city, ${cols.join(', ')}, updated_at, updated_by)
         VALUES ($1${cols.map((_, i) => `, $${i + 2}`).join('')}, now(), $${cols.length + 2})
         ON CONFLICT (city) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [city, ...cols.map((c) => patch[c]), who]
      );
      clients.delete(city);
      const acc = await accountFor(city);
      await mirrorAccount(city, acc);
      res.json({ success: true, account: publicAccount(acc, city) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/payment-accounts/:city/efi/test', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const city = cityParam(req);
      const acc = await accountFor(city);
      if (!efiComplete(acc)) throw httpError(400, `Preencha Client ID, Client Secret, certificado e chave Pix da Efí de ${CITY_LABELS[city]}`);
      let result;
      let scopes = null;
      try {
        const client = clientFor(acc);
        // token OAuth (prova o par Client ID/Secret e o certificado) + algo inofensivo: as cobranças das últimas 24 h
        scopes = (await client.auth(true)).scopes;
        const fim = now();
        const inicio = new Date(fim.getTime() - 86400000);
        await client.listCob(inicio.toISOString(), fim.toISOString());
        const saldo = await client.saldo().then((s) => s?.saldo ?? null).catch(() => null);
        const missing = EFI_SCOPES_REQUIRED.filter((s) => !scopes.includes(s));
        result = missing.length
          ? { ok: false, error: `Conectou, mas a aplicação da Efí está sem os escopos: ${missing.join(', ')}` }
          : { ok: true, saldo };
      } catch (error) {
        const msg = String(error?.message || 'Erro na Efí');
        result = {
          ok: false,
          error: /certificate|ssl|tls|handshake|ECONNRESET|socket/i.test(msg)
            ? `A Efí recusou o certificado (${msg.slice(0, 120)}). Confira se o .p12 é do mesmo ambiente (${acc.efi_env === 'homologacao' ? 'homologação' : 'produção'}) da aplicação`
            : error?.status === 401 ? 'A Efí recusou o Client ID/Client Secret (401). Confira se são do mesmo ambiente do certificado' : msg.slice(0, 300),
        };
      }
      await pool.query(
        `UPDATE payment_accounts SET efi_last_test_at = now(), efi_last_test_ok = $2, efi_last_test_error = $3,
                efi_scopes = coalesce($4, efi_scopes), efi_active = CASE WHEN $2 THEN efi_active ELSE false END WHERE city = $1`,
        [city, result.ok, result.error || null, scopes ? scopes.join(' ') : null]
      );
      clients.delete(city);
      res.json({ ...result, account: publicAccount(await accountFor(city), city) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/payment-accounts/:city/efi/webhook', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const city = cityParam(req);
      const acc = await accountFor(city);
      if (!efiComplete(acc) || acc.efi_last_test_ok !== true) throw httpError(400, 'Teste a conexão com a Efí antes de cadastrar o webhook');
      const secret = acc.efi_webhook_secret || newWebhookSecret();
      const url = webhookUrlFor(publicApiUrl, city, secret);
      let ok = true;
      let error = null;
      try {
        await clientFor(acc).putWebhook(efiKey(acc), url);
      } catch (e) {
        ok = false;
        error = /TLS m[uú]tuo/i.test(e.message)
          ? 'A Efí exige TLS mútuo (mTLS) na URL do webhook: falta configurar o nginx do servidor (ver o PR). Enquanto isso, a varredura de 10 em 10 min confere os pagamentos'
          : e.message.slice(0, 300);
      }
      await pool.query(
        `UPDATE payment_accounts SET efi_webhook_secret = $2, efi_webhook_at = CASE WHEN $3 THEN now() ELSE efi_webhook_at END, efi_webhook_error = $4 WHERE city = $1`,
        [city, secret, ok, error]
      );
      res.json({ ok, error, account: publicAccount(await accountFor(city), city) });
    } catch (error) { sendError(res, error); }
  });

  // ── cobrança: Pix dinâmico da mensalidade ────────────────────────────────────────────────────────────────────
  /**
   * Pix da Efí para a mensalidade (billingIsisRoutes). Cidade sem a Efí ligada: null (segue o Pix estático). Mesma
   * mensalidade e mesmo valor, ainda ativa: a mesma cobrança. Erro na Efí: lança (a cobrança vai para "conferir").
   */
  async function pixCharge({ contract, revenue, amount, month, dueDate }) {
    const city = normalizeCityValue(contract.client_city || contract.city) || 'minacu';
    const acc = await activeAccount(city);
    if (!acc) return null;
    const txid = txidFor({ contractId: contract.id, month, amount });
    const { rows: [open] } = await pool.query(`SELECT * FROM efi_charges WHERE txid = $1`, [txid]);
    if (open && open.status === 'ATIVA' && open.pix_copia_e_cola && (!open.expires_at || new Date(open.expires_at) > now())) {
      return { provider: 'efi', txid, pixCopiaECola: open.pix_copia_e_cola, locId: open.loc_id };
    }
    if (open && open.status === 'CONCLUIDA') return { provider: 'efi', txid, pixCopiaECola: open.pix_copia_e_cola, paid: true };
    const name = String(contract.company_name || '').trim();
    const body = cobBody({
      chave: efiKey(acc), amount, dueDate, now: now(),
      solicitacao: `Mensalidade Agência Pulse ${month.split('-').reverse().join('/')}`,
      info: [{ nome: 'Cliente', valor: name || 'Cliente Pulse' }, ...(dueDate ? [{ nome: 'Vencimento', valor: dueDate.split('-').reverse().join('/') }] : [])],
    });
    const client = clientFor(acc);
    // txid já usado (cobrança vencida ou removida): a Efí não aceita de novo; consulta e, se ainda vale, usa
    const cob = await client.putCob(txid, body).catch(async (error) => {
      const existing = await client.getCob(txid).catch(() => null);
      if (existing?.pixCopiaECola && existing.status === 'ATIVA') return existing;
      throw error;
    });
    if (!cob?.pixCopiaECola) throw new Error('A Efí não devolveu o Pix copia e cola');
    const expiresAt = new Date(now().getTime() + Number(cob.calendario?.expiracao || body.calendario.expiracao) * 1000);
    await pool.query(
      `INSERT INTO efi_charges (txid, city, env, contract_id, client_id, revenue_id, month, amount, loc_id, pix_copia_e_cola, status, expires_at, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (txid) DO UPDATE SET pix_copia_e_cola = EXCLUDED.pix_copia_e_cola, loc_id = EXCLUDED.loc_id, status = EXCLUDED.status,
             expires_at = EXCLUDED.expires_at, revenue_id = coalesce(EXCLUDED.revenue_id, efi_charges.revenue_id), raw = EXCLUDED.raw, updated_at = now()`,
      [txid, city, acc.efi_env, contract.id || null, contract.client_id || null, revenue?.id || null, month, amount,
        cob.loc?.id != null ? String(cob.loc.id) : null, cob.pixCopiaECola, cob.status || 'ATIVA', expiresAt, JSON.stringify(cob)]
    );
    return { provider: 'efi', txid, pixCopiaECola: cob.pixCopiaECola, locId: cob.loc?.id ?? null };
  }

  // ── pagamento: conferir na Efí e dar baixa ───────────────────────────────────────────────────────────────────
  /** Confere a cobrança pelo txid (GET /v2/cob) e dá baixa se CONCLUIDA. */
  async function confirmCharge(charge) {
    const acc = await activeAccount(charge.city);
    if (!acc) return { paid: false, reason: 'efi_desligada' };
    const cob = await clientFor(acc).getCob(charge.txid);
    const check = cobPaid(cob);
    if (!check.paid) {
      await pool.query(`UPDATE efi_charges SET status = $2, raw = $3, updated_at = now() WHERE txid = $1`, [charge.txid, cob?.status || charge.status, JSON.stringify(cob)]);
      return { paid: false, status: cob?.status };
    }
    const { rows: [updated] } = await pool.query(
      `UPDATE efi_charges SET status = 'CONCLUIDA', e2e_id = coalesce($2, e2e_id), paid_amount = $3, paid_at = coalesce(paid_at, $4::timestamptz, now()),
              raw = $5, updated_at = now() WHERE txid = $1 AND status <> 'CONCLUIDA' RETURNING *`,
      [charge.txid, check.e2e, check.amount, check.at, JSON.stringify(cob)]
    );
    if (check.e2e) await pool.query(`UPDATE efi_pix_received SET status = 'conciliado', revenue_id = $2, updated_at = now() WHERE e2e_id = $1`, [check.e2e, charge.revenue_id]).catch(() => {});
    const marked = updated && charge.revenue_id ? await markRevenuePaid(charge.revenue_id) : false;
    logger.log?.(`[efi] pago: ${charge.txid}${marked ? ' (receita baixada)' : ''}`);
    return { paid: true, marked };
  }

  /** Guarda um Pix recebido; se tem txid nosso, confere a cobrança. */
  async function recordPix(city, env, p) {
    const e2e = String(p.endToEndId || p.e2e || '');
    if (!e2e) return null;
    const txid = p.txid ? String(p.txid) : null;
    const { rows: [charge] } = txid ? await pool.query(`SELECT * FROM efi_charges WHERE txid = $1`, [txid]) : { rows: [] };
    const refunded = Array.isArray(p.devolucoes) && p.devolucoes.some((d) => d.status === 'DEVOLVIDO');
    await pool.query(
      `INSERT INTO efi_pix_received (e2e_id, city, env, txid, amount, received_at, payer_name, info_pagador, status, revenue_id, refunded, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (e2e_id) DO UPDATE SET refunded = EXCLUDED.refunded, raw = EXCLUDED.raw,
             payer_name = coalesce(EXCLUDED.payer_name, efi_pix_received.payer_name), updated_at = now()`,
      [e2e, city, env, txid, Number(p.valor || 0), p.horario || null, payerName(p), p.infoPagador || p.info || null,
        charge ? 'conciliado' : 'conferir', charge?.revenue_id || null, refunded, JSON.stringify(p)]
    );
    if (charge && charge.status !== 'CONCLUIDA') return confirmCharge(charge);
    return { paid: false, conferir: !charge };
  }

  // webhook: a Efí manda POST <url>/pix (ou <url> com "ignorar="); responde 200 na hora, confere depois
  const webhook = async (req, res) => {
    const city = normalizeCityValue(req.params.city);
    if (!CITIES.includes(city)) return res.status(404).json({ error: 'cidade' });
    let acc = null;
    try {
      await ensureSchema();
      acc = await accountFor(city);
    } catch { /* sem banco: recusa abaixo */ }
    // hmac da URL (recomendação da doc da Efí); sem ele, recusa
    if (!acc?.efi_webhook_secret || !sameSecret(req.query?.hmac, acc.efi_webhook_secret)) return res.status(401).json({ error: 'hmac' });
    res.status(200).send('200');
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (ip && !ip.endsWith(EFI_WEBHOOK_IP)) logger.log?.(`[efi] webhook de ${ip} (a Efí usa ${EFI_WEBHOOK_IP}); a baixa só sai depois da consulta na Efí`);
    if (!efiOn(acc)) return;
    for (const p of readEfiWebhook(req.body)) {
      // o corpo não vale como prova: recordPix confere na Efí pelo txid antes da baixa
      await recordPix(city, acc.efi_env, { endToEndId: p.e2e, txid: p.txid, valor: p.valor, horario: p.horario, infoPagador: p.info })
        .catch((error) => logger.error('[efi] webhook:', p.e2e, error.message));
    }
  };
  app.post('/api/webhooks/efi/:city', webhook);
  app.post('/api/webhooks/efi/:city/pix', webhook);

  // ── varredura: Pix recebidos das últimas 48 h de cada cidade com a Efí ligada ────────────────────────────────
  let sweeping = false;
  async function sweep() {
    if (sweeping) return { skipped: true };
    sweeping = true;
    const out = {};
    try {
      await ensureSchema();
      for (const city of CITIES) {
        const acc = await activeAccount(city).catch(() => null);
        if (!acc) continue;
        try {
          const fim = now();
          const inicio = new Date(fim.getTime() - 48 * 3600000);
          const list = await clientFor(acc).listPix(inicio.toISOString(), fim.toISOString());
          let paid = 0;
          for (const p of list) {
            const r = await recordPix(city, acc.efi_env, p).catch((error) => { logger.error('[efi] pix', p.endToEndId, error.message); return null; });
            if (r?.paid) paid += 1;
          }
          // cobranças ainda abertas que venceram a varredura (Pix sem txid na lista): consulta direta, as dos últimos 3 dias
          const { rows: open } = await pool.query(
            `SELECT * FROM efi_charges WHERE city = $1 AND status = 'ATIVA' AND updated_at < now() - interval '30 minutes'
               AND created_at > now() - interval '45 days' ORDER BY updated_at LIMIT 20`, [city]
          );
          for (const c of open) await confirmCharge(c).then((r) => { if (r.paid) paid += 1; }).catch(() => {});
          out[city] = { pix: list.length, pagos: paid };
        } catch (error) {
          logger.error(`[efi] varredura ${city}:`, error.message);
          out[city] = { error: error.message };
        }
      }
    } finally {
      sweeping = false;
    }
    return out;
  }
  if (sweepEvery > 0) {
    const timer = setInterval(() => sweep().catch((e) => logger.error('[efi] varredura:', e.message)), sweepEvery);
    timer.unref?.();
  }

  // ── movimentações para o Financeiro e o resumo do dia ────────────────────────────────────────────────────────
  app.get('/api/efi/movements', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : now().toISOString().slice(0, 7);
      const { rows } = await pool.query(
        `SELECT p.e2e_id, p.city, p.env, p.txid, p.amount, p.received_at, p.payer_name, p.info_pagador, p.status, p.refunded,
                c.company_name AS client
           FROM efi_pix_received p
           LEFT JOIN revenues r ON r.id = p.revenue_id
           LEFT JOIN clients c ON c.id = r.client_id
          WHERE to_char(p.received_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $1
          ORDER BY p.received_at DESC`, [month]
      );
      const saldo = {};
      for (const city of CITIES) {
        const acc = await activeAccount(city).catch(() => null);
        if (acc) saldo[city] = await clientFor(acc).saldo().then((s) => Number(s?.saldo ?? NaN)).catch(() => null);
      }
      res.json({ month, movements: rows, saldo });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/efi/movements/:e2e/conferido', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const { rowCount } = await pool.query(
        `UPDATE efi_pix_received SET status = 'conferido', updated_at = now() WHERE e2e_id = $1 AND status = 'conferir'`, [String(req.params.e2e)]
      );
      res.json({ success: rowCount > 0 });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/efi/sweep', async (req, res) => {
    try {
      await verifyAdmin(req);
      res.json(await sweep());
    } catch (error) { sendError(res, error); }
  });

  return { pixCharge, confirmCharge, recordPix, sweep, ensureSchema };
}

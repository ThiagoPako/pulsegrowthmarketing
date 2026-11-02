// ─── Pix Automático da mensalidade (pedido do usuário, 02/11/2026) ──────────────────────────────────────────────────
// Regras em lib/pixAutomatico.mjs. Fluxo (jornada 2 da Efí):
//   - na página /pagar o cliente toca em "Ativar Pix Automático", informa o CPF/CNPJ e o nome do titular da conta que
//     vai pagar, e recebe o código para autorizar no app do banco (débitos a partir do vencimento do mês seguinte);
//   - de 15 em 15 min a Pulse confere as autorizações: aprovou = adesão (aviso à equipe da cidade); cancelada pelo
//     cliente no banco = volta para a cobrança de sempre (aviso também);
//   - de 2 a 8 dias antes de cada vencimento, a Pulse cria a cobrança recorrente do mês (POST /v2/cobr), e a Efí debita
//     no vencimento; pago, dá a mesma baixa (receita, caixa e o obrigado com recibo). Não debitou (sem saldo): no dia
//     seguinte a Ísis manda a cobrança de sempre (billingIsisRoutes).
// O documento do titular fica cifrado (a tela vê mascarado).
//
//   POST /api/public/cobranca/:token/pix-automatico { documento, nome }   gera o código de autorização     público
//   GET  /api/pix-automatico                                              adesões (tela do Financeiro)     admin

import { cobrBody, cobrState, cobrWindow, devedorDoc, dueDateOf, firstDebitDate, maskDoc, recBody, recState } from './lib/pixAutomatico.mjs';
import { encryptSecret } from './lib/paymentAccounts.mjs';
import { alertTeam, brl, CITY_NAME } from './lib/teamAlerts.mjs';
import { normalizeCityValue } from './lib/cityResolution.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const TICK_MS = 15 * 60 * 1000;
const todayBr = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export function registerPixAutomaticoRoutes(app, {
  pool, verifyAdmin, pixClient, monthInfo, markRevenuePaid, alert = alertTeam, logger = console, tickEvery = TICK_MS, now = () => new Date(),
}) {
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS pix_auto (
          id_rec TEXT PRIMARY KEY,
          contract_id UUID NOT NULL,
          client_id UUID,
          city TEXT NOT NULL,
          env TEXT NOT NULL,
          loc_id TEXT,
          status TEXT NOT NULL DEFAULT 'aguardando',
          efi_status TEXT,
          devedor_nome TEXT,
          devedor_doc_enc TEXT,
          devedor_doc_mask TEXT,
          valor NUMERIC NOT NULL,
          data_inicial DATE,
          pix_copia_e_cola TEXT,
          raw JSONB,
          approved_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ,
          checked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_pix_auto_contract ON pix_auto(contract_id, status);
        CREATE TABLE IF NOT EXISTS pix_auto_cobr (
          txid TEXT PRIMARY KEY,
          id_rec TEXT NOT NULL,
          contract_id UUID NOT NULL,
          revenue_id UUID,
          month TEXT NOT NULL,
          due_date DATE NOT NULL,
          amount NUMERIC NOT NULL,
          status TEXT NOT NULL DEFAULT 'aberta',
          efi_status TEXT,
          e2e_id TEXT,
          paid_at TIMESTAMPTZ,
          failed_at TIMESTAMPTZ,
          raw JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (id_rec, month)
        );
      `).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[pix-automatico] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status && error.status < 500 && !error.body ? error.status
      : error?.message === 'Unauthorized' ? 401 : error?.message === 'Admin access required' ? 403 : error?.body ? 502 : 500;
    if (status >= 500) logger.error('[pix-automatico] erro:', error.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function contractOf(id) {
    const { rows: [c] } = await pool.query(
      `SELECT fc.*, c.company_name, c.city AS client_city FROM financial_contracts fc JOIN clients c ON c.id = fc.client_id WHERE fc.id = $1`, [id]
    );
    return c || null;
  }

  /** Adesão que vale para o contrato (a mais nova que não acabou). */
  async function current(contractId) {
    await ensureSchema();
    const { rows: [r] } = await pool.query(
      `SELECT * FROM pix_auto WHERE contract_id = $1 AND status IN ('aguardando', 'ativo') ORDER BY created_at DESC LIMIT 1`, [contractId]
    );
    return r || null;
  }

  /** Para a Ísis e a página: { status: 'ativo'|'aguardando'|null, desde, cobrança do mês } */
  async function autoDebitFor(contractId, month = null) {
    const r = await current(contractId).catch(() => null);
    if (!r) return { status: null };
    let cobr = null;
    if (month) {
      const { rows: [c] } = await pool.query(`SELECT * FROM pix_auto_cobr WHERE id_rec = $1 AND month = $2`, [r.id_rec, month]).catch(() => ({ rows: [] }));
      cobr = c || null;
    }
    return {
      status: r.status, dataInicial: r.data_inicial ? String(r.data_inicial instanceof Date ? r.data_inicial.toISOString() : r.data_inicial).slice(0, 10) : null,
      copiaECola: r.status === 'aguardando' ? r.pix_copia_e_cola : null, cobr: cobr ? { status: cobr.status, dueDate: cobr.due_date } : null,
    };
  }

  // ── página: ativar ─────────────────────────────────────────────────────────────────────────────────────────
  app.post('/api/public/cobranca/:token/pix-automatico', async (req, res) => {
    try {
      const token = String(req.params.token || '');
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw httpError(404, 'Cobrança não encontrada');
      await ensureSchema();
      const { rows: [page] } = await pool.query(`SELECT * FROM billing_pay_pages WHERE token = $1`, [token]);
      if (!page) throw httpError(404, 'Cobrança não encontrada');
      const existing = await current(page.contract_id);
      if (existing?.status === 'ativo') return res.json({ status: 'ativo', dataInicial: existing.data_inicial });
      if (existing?.status === 'aguardando' && existing.pix_copia_e_cola) {
        return res.json({ status: 'aguardando', copiaECola: existing.pix_copia_e_cola, dataInicial: existing.data_inicial });
      }
      const devedor = devedorDoc(req.body?.documento);
      if (!devedor) throw httpError(400, 'Confira o CPF ou o CNPJ do titular da conta que vai pagar');
      const nome = String(req.body?.nome || '').trim();
      if (nome.length < 3) throw httpError(400, 'Escreva o nome do titular da conta');
      const contract = await contractOf(page.contract_id);
      if (!contract) throw httpError(404, 'Contrato não encontrado');
      const city = normalizeCityValue(contract.client_city || contract.city || page.city) || 'minacu';
      const pc = await pixClient(city);
      if (!pc) throw httpError(409, 'O Pix Automático ainda não está disponível. Pague pelo Pix desta página.');
      const { acc, client } = pc;
      const dataInicial = firstDebitDate(todayBr(now()), contract.due_day);
      const valor = Number(contract.contract_value) || Number(page.amount);
      const loc = await client.postLocrec();
      const rec = await client.postRec(recBody({
        contractId: contract.id, devedor, nome, objeto: `Mensalidade Agência Pulse · ${String(contract.company_name || '').trim()}`,
        dataInicial, valor, loc: loc?.id,
      }));
      if (!rec?.idRec) throw new Error('A Efí não devolveu a recorrência');
      // o código de autorização vem na consulta da recorrência (dadosQR.pixCopiaECola); às vezes demora um instante
      let detail = null;
      for (let i = 0; i < 3 && !detail?.dadosQR?.pixCopiaECola; i += 1) {
        if (i) await new Promise((r) => setTimeout(r, 1200));
        detail = await client.getRec(rec.idRec).catch(() => null);
      }
      const copia = detail?.dadosQR?.pixCopiaECola || null;
      const digitsDoc = devedor.cpf || devedor.cnpj;
      await pool.query(
        `INSERT INTO pix_auto (id_rec, contract_id, client_id, city, env, loc_id, status, efi_status, devedor_nome, devedor_doc_enc, devedor_doc_mask,
                               valor, data_inicial, pix_copia_e_cola, raw)
         VALUES ($1,$2,$3,$4,$5,$6,'aguardando',$7,$8,$9,$10,$11,$12,$13,$14)`,
        [rec.idRec, contract.id, contract.client_id, city, acc.efi_env, loc?.id != null ? String(loc.id) : null, rec.status || 'CRIADA',
          nome.slice(0, 140), encryptSecret(digitsDoc), maskDoc(digitsDoc), valor, dataInicial, copia, JSON.stringify(detail || rec)]
      );
      if (!copia) throw httpError(502, 'A Efí ainda não gerou o código. Toque de novo em alguns segundos.');
      res.json({ status: 'aguardando', copiaECola: copia, dataInicial });
    } catch (error) { sendError(res, error); }
  });

  // ── conferência: autorizações, cobranças do mês e débitos ────────────────────────────────────────────────────
  async function checkRecs() {
    const { rows } = await pool.query(
      `SELECT * FROM pix_auto WHERE (status = 'aguardando' AND created_at > now() - interval '30 days')
          OR (status = 'ativo' AND (checked_at IS NULL OR checked_at < now() - interval '6 hours')) ORDER BY checked_at NULLS FIRST LIMIT 40`
    );
    for (const r of rows) {
      try {
        const pc = await pixClient(r.city);
        if (!pc) continue;
        const rec = await pc.client.getRec(r.id_rec);
        const state = recState(rec?.status);
        await pool.query(`UPDATE pix_auto SET efi_status = $2, checked_at = now(), raw = $3, updated_at = now() WHERE id_rec = $1`,
          [r.id_rec, rec?.status || null, JSON.stringify(rec)]);
        if (state === r.status || state === 'aguardando') continue;
        await pool.query(
          `UPDATE pix_auto SET status = $2, approved_at = CASE WHEN $2 = 'ativo' THEN now() ELSE approved_at END,
                  ended_at = CASE WHEN $2 <> 'ativo' THEN now() ELSE ended_at END, updated_at = now() WHERE id_rec = $1`, [r.id_rec, state]
        );
        const c = await contractOf(r.contract_id);
        const nome = String(c?.company_name || 'Cliente').trim();
        const text = state === 'ativo'
          ? `🔁 Pix Automático · ${CITY_NAME[r.city]}\n${nome} aderiu: ${brl(r.valor)} por mês, debitado no vencimento a partir de ${String(r.data_inicial instanceof Date ? r.data_inicial.toISOString() : r.data_inicial).slice(0, 10).split('-').reverse().join('/')}.`
          : r.status === 'ativo'
            ? `⚠️ Pix Automático · ${CITY_NAME[r.city]}\n${nome} cancelou o Pix Automático no banco. As próximas mensalidades voltam para a cobrança de sempre.`
            : null;
        if (text) await alert(pool, r.city, text, { logger });
      } catch (error) {
        logger.error('[pix-automatico] recorrência', r.id_rec, error.message);
      }
    }
  }

  async function createCobrs(today) {
    const { rows } = await pool.query(`SELECT * FROM pix_auto WHERE status = 'ativo'`);
    for (const r of rows) {
      try {
        const contract = await contractOf(r.contract_id);
        if (!contract || contract.status !== 'ativo') continue;
        const startMonth = String(r.data_inicial instanceof Date ? r.data_inicial.toISOString() : r.data_inicial).slice(0, 7);
        for (const month of [today.slice(0, 7), nextMonth(today.slice(0, 7))]) {
          if (month < startMonth) continue;
          const info = await monthInfo(contract, month);
          const dueDate = info?.dueDate || dueDateOf(month, contract.due_day);
          if (!cobrWindow(today, dueDate) || info?.paid) continue;
          const { rows: [had] } = await pool.query(`SELECT 1 FROM pix_auto_cobr WHERE id_rec = $1 AND month = $2`, [r.id_rec, month]);
          if (had) continue;
          const pc = await pixClient(r.city);
          if (!pc) continue;
          const amount = Number(info?.amount) || Number(r.valor);
          const cobr = await pc.client.postCobr(cobrBody({
            idRec: r.id_rec, dueDate, amount, info: `Mensalidade ${month.split('-').reverse().join('/')} · Agência Pulse`,
            agencia: pc.acc.efi_agencia, conta: pc.acc.efi_conta,
          }));
          if (!cobr?.txid) throw new Error('A Efí não devolveu o txid da cobrança recorrente');
          await pool.query(
            `INSERT INTO pix_auto_cobr (txid, id_rec, contract_id, revenue_id, month, due_date, amount, efi_status, raw)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
            [cobr.txid, r.id_rec, r.contract_id, info?.revenue?.id || null, month, dueDate, amount, cobr.status || null, JSON.stringify(cobr)]
          );
          logger.log?.(`[pix-automatico] cobrança de ${month} criada: ${contract.company_name} (${cobr.txid})`);
        }
      } catch (error) {
        logger.error('[pix-automatico] cobrança do mês', r.id_rec, error.message);
      }
    }
  }

  async function checkCobrs(today) {
    const { rows } = await pool.query(`SELECT * FROM pix_auto_cobr WHERE status = 'aberta' AND due_date <= $1::date + 1`, [today]);
    for (const cb of rows) {
      try {
        const { rows: [r] } = await pool.query(`SELECT * FROM pix_auto WHERE id_rec = $1`, [cb.id_rec]);
        const pc = r && await pixClient(r.city);
        if (!pc) continue;
        const cobr = await pc.client.getCobr(cb.txid);
        const { state, e2e } = cobrState(cobr);
        const due = String(cb.due_date instanceof Date ? cb.due_date.toISOString() : cb.due_date).slice(0, 10);
        // passou o vencimento sem pagar = não debitou (sem saldo ou recusado): a Ísis cobra no dia seguinte
        const failed = state === 'falhou' || (state === 'aberta' && today > due);
        if (state === 'pago') {
          await pool.query(`UPDATE pix_auto_cobr SET status = 'paga', efi_status = $2, e2e_id = $3, paid_at = now(), raw = $4, updated_at = now() WHERE txid = $1`,
            [cb.txid, cobr?.status || null, e2e, JSON.stringify(cobr)]);
          if (e2e) await pool.query(`UPDATE efi_pix_received SET status = 'conciliado', revenue_id = $2, updated_at = now() WHERE e2e_id = $1`, [e2e, cb.revenue_id]).catch(() => {});
          const revenueId = cb.revenue_id || (await monthInfo(await contractOf(cb.contract_id), cb.month))?.revenue?.id;
          if (revenueId) await markRevenuePaid(revenueId);
        } else if (failed) {
          await pool.query(`UPDATE pix_auto_cobr SET status = 'falhou', efi_status = $2, failed_at = now(), raw = $3, updated_at = now() WHERE txid = $1`,
            [cb.txid, cobr?.status || null, JSON.stringify(cobr)]);
          const c = await contractOf(cb.contract_id);
          await alert(pool, r.city, `⚠️ Pix Automático · ${CITY_NAME[r.city]}\nNão deu para debitar a mensalidade de ${String(c?.company_name || 'cliente').trim()} (${brl(cb.amount)}). A Ísis manda a cobrança de sempre.`, { logger });
        } else {
          await pool.query(`UPDATE pix_auto_cobr SET efi_status = $2, raw = $3, updated_at = now() WHERE txid = $1`, [cb.txid, cobr?.status || null, JSON.stringify(cobr)]);
        }
      } catch (error) {
        logger.error('[pix-automatico] débito', cb.txid, error.message);
      }
    }
  }

  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      await ensureSchema();
      const today = todayBr(now());
      await checkRecs();
      await createCobrs(today);
      await checkCobrs(today);
    } finally {
      ticking = false;
    }
  }
  if (tickEvery > 0) {
    const timer = setInterval(() => tick().catch((e) => logger.error('[pix-automatico]', e.message)), tickEvery);
    timer.unref?.();
  }

  app.get('/api/pix-automatico', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const { rows } = await pool.query(
        `SELECT p.id_rec, p.city, p.status, p.efi_status, p.devedor_nome, p.devedor_doc_mask, p.valor, p.data_inicial, p.approved_at,
                p.ended_at, p.created_at, c.company_name AS client,
                (SELECT json_agg(json_build_object('month', b.month, 'status', b.status, 'due_date', b.due_date) ORDER BY b.month DESC)
                   FROM pix_auto_cobr b WHERE b.id_rec = p.id_rec) AS cobrancas
           FROM pix_auto p LEFT JOIN clients c ON c.id = p.client_id
          ORDER BY (p.status = 'ativo') DESC, p.created_at DESC LIMIT 200`
      );
      res.json({ adesoes: rows });
    } catch (error) { sendError(res, error); }
  });

  return { autoDebitFor, tick, ensureSchema };
}

function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

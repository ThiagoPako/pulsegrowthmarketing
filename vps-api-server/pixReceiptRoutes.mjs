// ─── Pix pela chave: comprovante na página /pagar e confirmação no Financeiro (pedido do usuário, 02/11/2026) ─────────
// "Para pagamentos Pix vamos adicionar a chave Pix para evitar taxas e crie uma forma de autenticar esse pagamento para
// confirmar no sistema que foi pago." Regras em lib/pixReceipt.mjs. Fluxo:
//   - o cliente paga pela chave (copia e cola estático, sem taxa) e manda o comprovante na própria página /pagar;
//   - a IA lê o comprovante e o servidor confere valor, recebedor, o ID da transação (E2E) e se ele já foi usado;
//   - a baixa (receita recebida, entrada no caixa e o obrigado com recibo) só sai com o dinheiro visto:
//       • extrato do banco (.ofx) importado no Financeiro → casa sozinho pelo ID ou pelo valor; ou
//       • a gestão olha o app do banco e toca em "Confirmar recebimento".
// Os arquivos ficam fora da pasta pública de uploads (PRIVATE_FILES_ROOT); só o admin abre.
//
//   POST /api/public/cobranca/:token/comprovante   multipart "arquivo" (imagem ou PDF, até 8 MB)       público
//   GET  /api/pix-receipts?status=pendentes|todos  comprovantes com as conferências                       admin
//   GET  /api/pix-receipts/:id/arquivo             o arquivo enviado                                       admin
//   POST /api/pix-receipts/:id/confirmar           baixa a receita (o dinheiro foi visto no banco)         admin
//   POST /api/pix-receipts/:id/recusar { motivo }                                                         admin
//   POST /api/pix-receipts/extrato { city, ofx }   texto do extrato .ofx → casa e dá baixa                admin

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { RECEIPT_PROMPT, checkReceipt, matchStatement, parseAiReceipt, parseOfx } from './lib/pixReceipt.mjs';
import { normalizeCityValue } from './lib/cityResolution.mjs';
import { CITIES } from './lib/paymentAccounts.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const MIMES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
const MAX_PER_DAY = 6;

export function registerPixReceiptRoutes(app, {
  pool, verifyAdmin, paymentConfigFor, markRevenuePaid, readReceipt, privateRoot, logger = console, now = () => new Date(),
}) {
  const dir = path.resolve(privateRoot, 'comprovantes');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } }).single('arquivo');
  const runUpload = (req, res) => new Promise((resolve, reject) => upload(req, res, (e) => (e ? reject(httpError(400, e.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais (até 8 MB)' : e.message)) : resolve())));

  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS pix_receipts (
          id UUID PRIMARY KEY,
          token TEXT NOT NULL,
          revenue_id UUID,
          client_name TEXT,
          month TEXT,
          city TEXT,
          amount NUMERIC NOT NULL,
          file_name TEXT NOT NULL,
          mime TEXT NOT NULL,
          ai JSONB,
          checks JSONB,
          verdict TEXT NOT NULL DEFAULT 'conferir',
          e2e_id TEXT,
          paid_at TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'aguardando',
          confirmed_by TEXT,
          confirmed_at TIMESTAMPTZ,
          reason TEXT,
          statement_fitid TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_pix_receipts_status ON pix_receipts(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_pix_receipts_token ON pix_receipts(token);
        -- um ID de transação vale para um comprovante só (o mesmo print não paga duas mensalidades)
        CREATE UNIQUE INDEX IF NOT EXISTS uq_pix_receipts_e2e ON pix_receipts(e2e_id) WHERE e2e_id IS NOT NULL AND status <> 'recusado';
        CREATE TABLE IF NOT EXISTS pix_statement_lines (
          city TEXT NOT NULL,
          fitid TEXT NOT NULL,
          date DATE,
          amount NUMERIC NOT NULL,
          memo TEXT,
          receipt_id UUID,
          imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (city, fitid)
        );
      `).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[comprovante] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : error?.message === 'Admin access required' ? 403 : 500);
    if (status >= 500) logger.error('[comprovante] erro:', error.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  const revenuePaid = async (revenueId) => {
    if (!revenueId) return false;
    const { rows: [r] } = await pool.query(`SELECT status FROM revenues WHERE id = $1`, [revenueId]);
    return ['recebida', 'pago'].includes(r?.status);
  };

  async function confirm(receipt, by, fitid = null) {
    await pool.query(
      `UPDATE pix_receipts SET status = 'confirmado', confirmed_by = $2, confirmed_at = now(), statement_fitid = coalesce($3, statement_fitid) WHERE id = $1`,
      [receipt.id, by, fitid]
    );
    const marked = receipt.revenue_id ? await markRevenuePaid(receipt.revenue_id) : false;
    logger.log?.(`[comprovante] confirmado ${receipt.id} por ${by}${marked ? ' (receita baixada)' : ''}`);
    return marked;
  }

  // ── público: o cliente manda o comprovante ────────────────────────────────────────────────────────────────────
  app.post('/api/public/cobranca/:token/comprovante', async (req, res) => {
    try {
      const token = String(req.params.token || '');
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw httpError(404, 'Cobrança não encontrada');
      await ensureSchema();
      const { rows: [page] } = await pool.query(`SELECT * FROM billing_pay_pages WHERE token = $1`, [token]);
      if (!page) throw httpError(404, 'Cobrança não encontrada');
      if (await revenuePaid(page.revenue_id)) return res.json({ status: 'pago', message: 'Esta mensalidade já está paga. Obrigada!' });
      const { rows: [{ n }] } = await pool.query(
        `SELECT count(*)::int AS n FROM pix_receipts WHERE token = $1 AND created_at > now() - interval '1 day'`, [token]
      );
      if (n >= MAX_PER_DAY) throw httpError(429, 'Recebemos vários envios hoje. Fale com a gente pelo WhatsApp.');

      await runUpload(req, res);
      const file = req.file;
      if (!file) throw httpError(400, 'Escolha a foto ou o PDF do comprovante');
      const ext = MIMES[file.mimetype];
      if (!ext) throw httpError(400, 'Envie uma foto (print) ou o PDF do comprovante');

      const id = crypto.randomUUID();
      const fileName = `${id}.${ext}`;
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, fileName), file.buffer);

      // leitura pela IA; se falhar, o comprovante fica para a gestão conferir
      let read = null;
      try {
        read = parseAiReceipt(await readReceipt({ data: file.buffer.toString('base64'), mime: file.mimetype, prompt: RECEIPT_PROMPT }));
      } catch (error) {
        logger.error('[comprovante] leitura:', error.message);
      }
      const config = await paymentConfigFor(page.city || null).catch(() => null);
      let result = { verdict: 'conferir', checks: [{ id: 'leitura', ok: false, label: 'Comprovante lido', detail: 'a leitura falhou' }], e2e: null, paidAt: null };
      if (read) {
        const expected = {
          amount: page.amount, pixKey: config?.pix_key || page.pix_key, document: config?.document,
          receiverName: config?.receiver_name || page.receiver_name, createdAt: page.created_at,
        };
        result = checkReceipt(read, expected, { now: now() });
        if (result.e2e) {
          const { rows: [dup] } = await pool.query(`SELECT client_name, month FROM pix_receipts WHERE e2e_id = $1 AND status <> 'recusado' LIMIT 1`, [result.e2e]);
          if (dup) result = checkReceipt(read, expected, { now: now(), usedBy: `${dup.client_name || 'outro cliente'} · ${dup.month || ''}` });
        }
      }

      await pool.query(
        `INSERT INTO pix_receipts (id, token, revenue_id, client_name, month, city, amount, file_name, mime, ai, checks, verdict, e2e_id, paid_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [id, token, page.revenue_id, page.client_name, page.month, page.city, page.amount, fileName, file.mimetype,
          read ? JSON.stringify(read) : null, JSON.stringify(result.checks), result.verdict,
          result.verdict === 'recusado' ? null : result.e2e, result.paidAt, result.verdict === 'recusado' ? 'recusado' : 'aguardando']
      );

      // para o cliente, sem detalhe da conferência
      const valorErrado = result.checks.some((c) => c.id === 'valor' && !c.ok) && read?.valor;
      res.json({
        status: result.verdict === 'recusado' ? 'revisar' : 'recebido',
        message: result.verdict === 'recusado'
          ? (valorErrado ? `O valor do comprovante não é o da mensalidade (${Number(page.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Se pagou outro valor, fale com a gente pelo WhatsApp.`
            : 'Não conseguimos validar este comprovante. Confira se é o do Pix desta mensalidade ou fale com a gente pelo WhatsApp.')
          : 'Comprovante recebido. Assim que o pagamento for confirmado, você recebe o recibo pelo WhatsApp.',
      });
    } catch (error) { sendError(res, error); }
  });

  // ── Financeiro → Pagamentos: comprovantes ─────────────────────────────────────────────────────────────────────
  app.get('/api/pix-receipts', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const all = req.query.status === 'todos';
      const { rows } = await pool.query(
        `SELECT p.id, p.client_name, p.month, p.city, p.amount, p.mime, p.ai, p.checks, p.verdict, p.e2e_id, p.paid_at, p.status,
                p.confirmed_by, p.confirmed_at, p.reason, p.created_at, r.status AS revenue_status
           FROM pix_receipts p LEFT JOIN revenues r ON r.id = p.revenue_id
          WHERE ${all ? `p.created_at > now() - interval '60 days'` : `p.status = 'aguardando'`}
          ORDER BY p.created_at DESC LIMIT 200`
      );
      res.json({ receipts: rows });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/pix-receipts/:id/arquivo', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const { rows: [r] } = await pool.query(`SELECT file_name, mime FROM pix_receipts WHERE id = $1`, [String(req.params.id)]);
      if (!r) throw httpError(404, 'Comprovante não encontrado');
      res.set('Content-Type', r.mime);
      res.set('Cache-Control', 'private, no-store');
      res.send(await fs.readFile(path.join(dir, path.basename(r.file_name))));
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/pix-receipts/:id/confirmar', async (req, res) => {
    try {
      const { user } = await verifyAdmin(req);
      await ensureSchema();
      const { rows: [r] } = await pool.query(`SELECT * FROM pix_receipts WHERE id = $1`, [String(req.params.id)]);
      if (!r) throw httpError(404, 'Comprovante não encontrado');
      if (r.status === 'confirmado') return res.json({ success: true, marked: false });
      const marked = await confirm(r, user?.email || 'gestão');
      res.json({ success: true, marked });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/pix-receipts/:id/recusar', async (req, res) => {
    try {
      const { user } = await verifyAdmin(req);
      await ensureSchema();
      const motivo = String(req.body?.motivo || '').trim().slice(0, 300) || null;
      const { rowCount } = await pool.query(
        `UPDATE pix_receipts SET status = 'recusado', reason = $2, confirmed_by = $3, confirmed_at = now() WHERE id = $1 AND status = 'aguardando'`,
        [String(req.params.id), motivo, user?.email || 'gestão']
      );
      res.json({ success: rowCount > 0 });
    } catch (error) { sendError(res, error); }
  });

  // ── extrato do banco (.ofx): casa os créditos com os comprovantes e dá baixa ──────────────────────────────────
  app.post('/api/pix-receipts/extrato', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const city = normalizeCityValue(req.body?.city);
      if (!CITIES.includes(city)) throw httpError(400, 'Escolha a cidade do extrato');
      if (!req.body?.ofx) throw httpError(400, 'Escolha o arquivo .ofx do extrato');
      const credits = parseOfx(String(req.body.ofx));
      if (!credits.length) throw httpError(400, 'Nenhum crédito no arquivo. Exporte o extrato em OFX no app ou no site do banco.');

      // créditos já importados antes não casam de novo
      const fresh = [];
      for (const c of credits) {
        const fitid = c.fitid || `${c.date}|${c.amount}|${c.memo}`;
        const { rowCount } = await pool.query(
          `INSERT INTO pix_statement_lines (city, fitid, date, amount, memo) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [city, fitid, c.date, c.amount, `${c.name} ${c.memo}`.trim().slice(0, 300)]
        );
        const { rows: [line] } = await pool.query(`SELECT receipt_id FROM pix_statement_lines WHERE city = $1 AND fitid = $2`, [city, fitid]);
        if (rowCount || !line?.receipt_id) fresh.push({ ...c, fitid });
      }
      const { rows: waiting } = await pool.query(
        `SELECT * FROM pix_receipts WHERE status = 'aguardando' AND verdict = 'conferido' AND coalesce(city, $1) = $1`, [city]
      );
      const matches = matchStatement(fresh, waiting.map((r) => ({ id: r.id, amount: Number(r.amount), e2e: r.e2e_id, paid_at: r.paid_at })));
      let baixadas = 0;
      for (const m of matches) {
        const r = waiting.find((w) => w.id === m.receiptId);
        if (await confirm(r, `extrato (${m.by})`, m.credit.fitid)) baixadas += 1;
        await pool.query(`UPDATE pix_statement_lines SET receipt_id = $3 WHERE city = $1 AND fitid = $2`, [city, m.credit.fitid, r.id]);
      }
      res.json({ creditos: credits.length, novos: fresh.length, confirmados: matches.length, baixadas, aguardando: waiting.length - matches.length });
    } catch (error) { sendError(res, error); }
  });

  /** Para a página /pagar: o último comprovante da cobrança (para mostrar "recebido" depois de recarregar). */
  async function lastReceipt(token) {
    await ensureSchema();
    const { rows: [r] } = await pool.query(
      `SELECT status, created_at FROM pix_receipts WHERE token = $1 AND status <> 'recusado' ORDER BY created_at DESC LIMIT 1`, [token]
    );
    return r || null;
  }

  return { ensureSchema, lastReceipt };
}

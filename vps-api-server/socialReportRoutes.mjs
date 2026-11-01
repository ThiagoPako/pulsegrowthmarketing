// ─── Relatório mensal da rede social de cada cliente (Ísis, social media; pedido do usuário, 01/11/2026) ───────
// Os números saem do banco na hora (lib/socialReport.mjs); o que fica guardado é o rascunho da Ísis (sugestões e
// observação) e a aprovação da equipe. Nada vai para o cliente aqui: o envio do dia 1 é a função de cobranças.
//
// Rotas da equipe (admin, social media, gestor de projetos):
//   GET  /api/social-reports?month=AAAA-MM               clientes ativos com o status do relatório do mês
//   GET  /api/social-reports/:clientId?month=AAAA-MM     números do mês + rede + rascunho + prévia da mensagem
//   PUT  /api/social-reports/:clientId                   { month, suggestions, note } edita o rascunho
//   POST /api/social-reports/:clientId/approve           { month, approved } aprova (ou volta para rascunho)
// Rotas do agente ("Authorization: Agent <chave>"):
//   GET  /api/agent/social-reports?month=                (social_media, chefe) a lista do mês
//   GET  /api/agent/social-report?client=&month=         (social_media, chefe) o relatório de um cliente
//   POST /api/agent/social-report                        (social_media, chefe) { client, month, suggestions, note }
//        grava o rascunho; relatório já aprovado não muda (a equipe volta para rascunho antes)

import { monthRange, previousMonthKey, buildMonthlyNumbers, summarizeNetwork, monthlyMessage } from './lib/socialReport.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpError = (status, message) => Object.assign(new Error(message), { status });
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// mês fechado quase não muda: métricas da Meta em cache por 3 dias (o mês corrente, 3 horas)
const CLOSED_MONTH_CACHE_MIN = 3 * 24 * 60;

export function registerSocialReportRoutes(app, {
  pool, verifyUser, canSeeReports, agentApi, getClientInsights, recordingMinutesFor, logger = console,
}) {
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS social_monthly_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL,
          month TEXT NOT NULL,
          suggestions TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'rascunho',
          drafted_by UUID,
          drafted_by_name TEXT,
          approved_by UUID,
          approved_by_name TEXT,
          approved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT social_monthly_reports_uniq UNIQUE (client_id, month)
        )
      `).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[relatorio-mensal] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status || error?.statusCode || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) logger.error('[relatorio-mensal] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function teamUser(req) {
    const { user } = await verifyUser(req);
    if (!(await canSeeReports(user))) throw httpError(403, 'Só admin, social media e gestor de projetos');
    const { rows: [me] } = await pool.query('SELECT name FROM profiles WHERE id = $1', [user.id]).catch(() => ({ rows: [] }));
    return { id: user.id, name: me?.name || user.email || null };
  }

  async function reportAgent(req) {
    const agent = await agentApi.verifyAgent(req);
    if (!['social_media', 'chefe'].includes(agent.role)) throw httpError(403, 'Só a social media e a chefe');
    return agent;
  }

  const monthOf = (value) => monthRange(String(value || '').trim() || previousMonthKey()).month;

  async function findClient(value) {
    const v = String(value || '').trim();
    if (!v) throw httpError(400, 'Diga o cliente');
    const { rows } = await pool.query(`SELECT id, company_name, niche, city, status, editorial FROM clients ORDER BY company_name`);
    if (UUID_RE.test(v)) {
      const hit = rows.find((c) => c.id === v);
      if (!hit) throw httpError(404, 'Cliente não encontrado');
      return hit;
    }
    const q = semAcento(v);
    const exact = rows.filter((c) => semAcento(c.company_name) === q);
    const list = exact.length ? exact : rows.filter((c) => semAcento(c.company_name).includes(q));
    if (!list.length) throw httpError(404, `Nenhum cliente com "${v}"`);
    if (list.length > 1) throw httpError(409, `"${v}" bate com ${list.map((c) => c.company_name.trim()).join(', ')}. Use o nome exato.`);
    return list[0];
  }

  async function stored(clientId, month) {
    await ensureSchema();
    const { rows } = await pool.query(`SELECT * FROM social_monthly_reports WHERE client_id = $1 AND month = $2`, [clientId, month]);
    return rows[0] || null;
  }

  async function insightsFor(clientId, since, until, closed) {
    try {
      return await getClientInsights(clientId, since, until, { maxAgeMinutes: closed ? CLOSED_MONTH_CACHE_MIN : 180 });
    } catch (error) {
      return { error: error.message };
    }
  }

  async function buildReport(client, month) {
    const r = monthRange(month);
    const q = (sql) => pool.query(sql, [client.id]).then((x) => x.rows).catch((error) => {
      logger.error('[relatorio-mensal] consulta:', error.message);
      return [];
    });
    const [contentTasks, designTasks, posts, recordings, deliveryRecords, minutes] = await Promise.all([
      q(`SELECT id, title, content_type, kanban_column, approved_at, updated_at, editing_started_at, editing_paused_seconds,
                reviewing_at, approval_sent_at FROM content_tasks WHERE client_id = $1`),
      q(`SELECT id, title, kanban_column, completed_at, client_approved_at, updated_at, time_spent_seconds FROM design_tasks WHERE client_id = $1`),
      q(`SELECT id, title, status, posted_at, delivered_at FROM social_media_deliveries WHERE client_id = $1`),
      q(`SELECT id, date, status FROM recordings WHERE client_id = $1`),
      q(`SELECT id, date, videos_recorded FROM delivery_records WHERE client_id = $1`),
      recordingMinutesFor(client.id).catch(() => 90),
    ]);
    const numbers = buildMonthlyNumbers({ month: r.month, contentTasks, designTasks, posts, recordings, deliveryRecords, recordingMinutes: minutes });
    const closed = r.until < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const [ins, prevIns] = await Promise.all([
      insightsFor(client.id, r.since, r.until, closed),
      insightsFor(client.id, r.prevSince, r.prevUntil, true),
    ]);
    const network = summarizeNetwork(ins, prevIns);
    const draft = await stored(client.id, r.month);
    const next = monthRange(nextMonth(r.month));
    return {
      client: { id: client.id, name: String(client.company_name || '').trim(), niche: client.niche, city: client.city },
      numbers,
      network,
      draft: draft
        ? { suggestions: draft.suggestions, note: draft.note, status: draft.status, drafted_by_name: draft.drafted_by_name,
            approved_by_name: draft.approved_by_name, approved_at: draft.approved_at, updated_at: draft.updated_at }
        : { suggestions: '', note: '', status: 'sem_rascunho' },
      message_preview: monthlyMessage({
        clientName: client.company_name, numbers, network, suggestions: draft?.suggestions || '', currentMonthName: next.name,
      }),
    };
  }

  function nextMonth(month) {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  async function listMonth(month) {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT c.id, c.company_name, c.niche, c.city, r.status, r.updated_at, r.drafted_by_name, r.approved_by_name
         FROM clients c LEFT JOIN social_monthly_reports r ON r.client_id = c.id AND r.month = $1
        WHERE coalesce(c.status, 'ativo') NOT IN ('cancelado', 'inativo')
        ORDER BY c.company_name`,
      [month]
    );
    return rows.map((c) => ({
      client_id: c.id, client: String(c.company_name || '').trim(), niche: c.niche, city: c.city,
      status: c.status || 'sem_rascunho', updated_at: c.updated_at, drafted_by_name: c.drafted_by_name, approved_by_name: c.approved_by_name,
    }));
  }

  async function saveDraft(clientId, month, { suggestions, note }, author) {
    await ensureSchema();
    const current = await stored(clientId, month);
    if (current?.status === 'aprovado') throw httpError(409, 'Relatório já aprovado: volte para rascunho antes de mudar');
    const { rows } = await pool.query(
      `INSERT INTO social_monthly_reports (client_id, month, suggestions, note, drafted_by, drafted_by_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT social_monthly_reports_uniq DO UPDATE
         SET suggestions = EXCLUDED.suggestions, note = EXCLUDED.note, drafted_by = EXCLUDED.drafted_by,
             drafted_by_name = EXCLUDED.drafted_by_name, status = 'rascunho', updated_at = now()
       RETURNING *`,
      [clientId, month, String(suggestions ?? current?.suggestions ?? '').slice(0, 4000), String(note ?? current?.note ?? '').slice(0, 2000),
        author.id || null, author.name || null]
    );
    return rows[0];
  }

  // ── equipe ──
  app.get('/api/social-reports', async (req, res) => {
    try {
      await teamUser(req);
      const month = monthOf(req.query.month);
      res.json({ month, label: monthRange(month).label, clients: await listMonth(month) });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/social-reports/:clientId', async (req, res) => {
    try {
      await teamUser(req);
      res.json({ report: await buildReport(await findClient(req.params.clientId), monthOf(req.query.month)) });
    } catch (error) { sendError(res, error); }
  });

  app.put('/api/social-reports/:clientId', async (req, res) => {
    try {
      const user = await teamUser(req);
      const client = await findClient(req.params.clientId);
      const row = await saveDraft(client.id, monthOf(req.body?.month), req.body || {}, user);
      res.json({ success: true, status: row.status });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/social-reports/:clientId/approve', async (req, res) => {
    try {
      const user = await teamUser(req);
      const client = await findClient(req.params.clientId);
      const month = monthOf(req.body?.month);
      const approved = req.body?.approved !== false;
      if (!(await stored(client.id, month))) throw httpError(400, 'Ainda não há rascunho para aprovar');
      await pool.query(
        approved
          ? `UPDATE social_monthly_reports SET status = 'aprovado', approved_by = $3, approved_by_name = $4, approved_at = now(), updated_at = now()
              WHERE client_id = $1 AND month = $2`
          : `UPDATE social_monthly_reports SET status = 'rascunho', approved_by = NULL, approved_by_name = NULL, approved_at = NULL, updated_at = now()
              WHERE client_id = $1 AND month = $2`,
        approved ? [client.id, month, user.id, user.name] : [client.id, month]
      );
      res.json({ success: true, status: approved ? 'aprovado' : 'rascunho' });
    } catch (error) { sendError(res, error); }
  });

  // ── agente (Ísis) ──
  app.get('/api/agent/social-reports', async (req, res) => {
    try {
      await reportAgent(req);
      const month = monthOf(req.query.month);
      res.json({ month, label: monthRange(month).label, clients: await listMonth(month) });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/agent/social-report', async (req, res) => {
    try {
      await reportAgent(req);
      const client = await findClient(req.query.client);
      res.json({ report: { ...(await buildReport(client, monthOf(req.query.month))), editorial: client.editorial || null } });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/agent/social-report', async (req, res) => {
    try {
      const agent = await reportAgent(req);
      const client = await findClient(req.body?.client);
      const month = monthOf(req.body?.month);
      if (!String(req.body?.suggestions || '').trim()) throw httpError(400, 'Escreva as sugestões (uma por linha)');
      await saveDraft(client.id, month, req.body, { id: agent.userId, name: agent.name || 'Ísis' });
      res.json({ success: true, client: String(client.company_name).trim(), month, status: 'rascunho' });
    } catch (error) { sendError(res, error); }
  });

  // Cobranças da Ísis (billingIsisRoutes.mjs): o relatório do mês e se a equipe já aprovou
  return {
    async reportFor(clientId, month) {
      const client = await findClient(clientId);
      return buildReport(client, monthOf(month));
    },
  };
}

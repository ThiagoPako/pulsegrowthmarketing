// Regras de cada cliente dentro do sistema (05/11/2026, pedido do Thiago: "as regras do cliente dentro da VPS, acho que
// seria interessante mesmo"). Fonte única do que cada cliente gosta, aprovou e recusou: a equipe lê e corrige na aba
// Regras do cliente, e os agentes leem e gravam pela API (o aprendizado de cada alteração entra sozinho).
//
// Rotas da equipe (login):
//   GET    /api/clients/:clientId/rules              regras ativas (e ?todas=1 para ver as desligadas)
//   POST   /api/clients/:clientId/rules              { area, text, origin? }
//   PATCH  /api/clients/:clientId/rules/:ruleId      { area?, text?, active? }
// Rotas dos agentes (chave de agente):
//   GET    /api/agent/clients/:clientId/rules        regras ativas, por área
//   POST   /api/agent/clients/:clientId/rules        { area, text, origin?, source_ref? }  grava com o nome do agente
//   POST   /api/agent/clients/:clientId/rules/import { rules: [{ area, text, origin, created_at? }] }  carga inicial (chefe)
export const RULE_AREAS = ['geral', 'video', 'legenda', 'audio', 'cor', 'design', 'social', 'aprovado', 'recusado'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerClientRulesRoutes(app, { pool, verifyUser, verifyAgent, logger = console }) {
  let ready = null;
  const ensureSchema = () => (ready ||= pool.query(`
    CREATE TABLE IF NOT EXISTS client_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL,
      area TEXT NOT NULL DEFAULT 'geral',
      text TEXT NOT NULL,
      origin TEXT,
      source_ref TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by_user UUID,
      created_by_agent TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_client_rules_client ON client_rules(client_id, active, area);
  `).catch((error) => { ready = null; throw error; }));

  const fail = (res, error) => {
    const status = error?.status || 500;
    if (status >= 500) logger.error('[regras do cliente]', error?.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  };
  const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

  async function clientOf(id) {
    if (!UUID_RE.test(String(id || ''))) throw bad('Cliente inválido');
    const { rows: [c] } = await pool.query('SELECT id, company_name FROM clients WHERE id = $1', [id]);
    if (!c) throw bad('Cliente não encontrado', 404);
    return c;
  }

  function readRule(body, { partial = false } = {}) {
    const out = {};
    if (body?.area !== undefined || !partial) {
      const area = String(body?.area || 'geral').toLowerCase();
      if (!RULE_AREAS.includes(area)) throw bad(`Área inválida (use: ${RULE_AREAS.join(', ')})`);
      out.area = area;
    }
    if (body?.text !== undefined || !partial) {
      const text = String(body?.text || '').trim();
      if (text.length < 5) throw bad('Escreva a regra');
      out.text = text.slice(0, 2000);
    }
    if (body?.origin !== undefined) out.origin = String(body.origin || '').trim().slice(0, 200) || null;
    if (body?.source_ref !== undefined) out.source_ref = String(body.source_ref || '').trim().slice(0, 200) || null;
    if (body?.active !== undefined) out.active = !!body.active;
    return out;
  }

  async function list(clientId, { all = false } = {}) {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, area, text, origin, source_ref, active, created_by_agent, updated_by, created_at, updated_at,
              (SELECT coalesce(nullif(btrim(p.display_name), ''), p.name) FROM profiles p WHERE p.id = r.created_by_user) AS created_by_name
         FROM client_rules r WHERE client_id = $1 AND ($2 OR active) ORDER BY area, created_at`,
      [clientId, all]
    );
    return rows;
  }

  async function add(clientId, rule, { userId = null, agentName = null } = {}) {
    await ensureSchema();
    const { rows: [r] } = await pool.query(
      `INSERT INTO client_rules (client_id, area, text, origin, source_ref, created_by_user, created_by_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [clientId, rule.area, rule.text, rule.origin || null, rule.source_ref || null, userId, agentName]
    );
    return r;
  }

  // ── Equipe ──
  const team = (fn) => async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      res.json(await fn(req, user));
    } catch (error) { fail(res, error); }
  };
  const userName = async (user) => {
    const { rows: [p] } = await pool.query(`SELECT coalesce(nullif(btrim(display_name), ''), name) AS name FROM profiles WHERE id = $1`, [user?.id]).catch(() => ({ rows: [] }));
    return p?.name || user?.email || 'equipe';
  };

  app.get('/api/clients/:clientId/rules', team(async (req) => {
    const c = await clientOf(req.params.clientId);
    return { client: c, areas: RULE_AREAS, rules: await list(c.id, { all: req.query.todas === '1' }) };
  }));
  app.post('/api/clients/:clientId/rules', team(async (req, user) => {
    const c = await clientOf(req.params.clientId);
    const rule = readRule(req.body);
    return { rule: await add(c.id, { ...rule, origin: rule.origin || await userName(user) }, { userId: user?.id || null }) };
  }));
  app.patch('/api/clients/:clientId/rules/:ruleId', team(async (req, user) => {
    const c = await clientOf(req.params.clientId);
    if (!UUID_RE.test(req.params.ruleId)) throw bad('Regra inválida');
    const r = readRule(req.body, { partial: true });
    await ensureSchema();
    const { rows: [row] } = await pool.query(
      `UPDATE client_rules SET area = coalesce($3, area), text = coalesce($4, text), active = coalesce($5, active),
              updated_by = $6, updated_at = now()
        WHERE id = $1 AND client_id = $2 RETURNING *`,
      [req.params.ruleId, c.id, r.area ?? null, r.text ?? null, r.active ?? null, await userName(user)]
    );
    if (!row) throw bad('Regra não encontrada', 404);
    return { rule: row };
  }));

  // ── Agentes ──
  const agentRoute = (fn) => async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      res.json(await fn(req, agent));
    } catch (error) { fail(res, error); }
  };
  app.get('/api/agent/clients/:clientId/rules', agentRoute(async (req) => {
    const c = await clientOf(req.params.clientId);
    return { client: c, rules: await list(c.id) };
  }));
  app.post('/api/agent/clients/:clientId/rules', agentRoute(async (req, agent) => {
    const c = await clientOf(req.params.clientId);
    const rule = readRule(req.body);
    // mesma regra já gravada: não duplica
    const { rows: [dup] } = await pool.query(
      `SELECT id FROM client_rules WHERE client_id = $1 AND active AND lower(text) = lower($2) LIMIT 1`, [c.id, rule.text]
    ).catch(() => ({ rows: [] }));
    if (dup) return { rule: { id: dup.id }, duplicada: true };
    return { rule: await add(c.id, rule, { userId: agent.userId, agentName: String(agent.name || agent.role || 'agente').trim() }) };
  }));
  app.post('/api/agent/clients/:clientId/rules/import', agentRoute(async (req, agent) => {
    if (agent.role !== 'chefe') throw bad('Só a chefe importa regras', 403);
    const c = await clientOf(req.params.clientId);
    const items = Array.isArray(req.body?.rules) ? req.body.rules.slice(0, 500) : [];
    await ensureSchema();
    let n = 0;
    for (const item of items) {
      const rule = readRule(item);
      const { rows: [dup] } = await pool.query(
        `SELECT 1 FROM client_rules WHERE client_id = $1 AND lower(text) = lower($2) LIMIT 1`, [c.id, rule.text]
      );
      if (dup) continue;
      const at = item.created_at && !Number.isNaN(Date.parse(item.created_at)) ? item.created_at : null;
      await pool.query(
        `INSERT INTO client_rules (client_id, area, text, origin, created_by_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()))`,
        [c.id, rule.area, rule.text, rule.origin || 'CLAUDE.md do cliente', String(agent.name || 'Marcely').trim(), at]
      );
      n += 1;
    }
    return { imported: n };
  }));

  return { list, add };
}

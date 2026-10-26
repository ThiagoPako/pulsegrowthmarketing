// Assistente PULSE — rotas da tela (Configurações → WhatsApp → Assistente PULSE). Só admin (verifyAdmin + papel admin).
//
//   GET    /api/assistant/overview        configuração, conexão "assistente", números, últimos comandos/ações/demandas/pedidos
//   PATCH  /api/assistant/settings        { enabled?, group_monitor_enabled? }
//   POST   /api/assistant/numbers         { name, phone, user_id?, cities[], permissions[], active? }
//   PATCH  /api/assistant/numbers/:id     os mesmos campos (parcial)
//   DELETE /api/assistant/numbers/:id

import { PERMISSIONS, CITIES, canonicalPhone, clip, phoneVariants, assistantConnection } from './common.mjs';
import { isUuid } from './actions.mjs';
import { whisperAvailable } from './transcribe.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });

export function registerAdminRoutes(app, { pool, verifyAdmin, isStrictAdmin, claude, ensureSchema }) {
  async function admin(req) {
    const ctx = await verifyAdmin(req);
    if (!(await isStrictAdmin(ctx.user))) throw httpError(403, 'Apenas administradores');
    await ensureSchema();
    return ctx;
  }
  const fail = (res, error) => {
    const status = error.status || (error.message === 'Admin access required' ? 403 : /Unauthorized|token/i.test(error.message) ? 401 : 500);
    if (status >= 500) console.error('[assistente] rota:', error);
    res.status(status).json({ error: error.message });
  };

  const publicNumber = (n) => ({
    id: n.id, name: n.name, phone: n.phone, user_id: n.user_id, user_name: n.user_name || null, cities: n.cities || [],
    permissions: n.permissions || [], active: n.active, created_at: n.created_at, last_command_at: n.last_command_at,
  });

  async function validNumber(body, current) {
    const name = body.name !== undefined ? clip(body.name, 60) : current?.name;
    if (!name) throw httpError(400, 'Dê um nome ao número (ex.: Thiago)');
    let phone = current?.phone;
    if (body.phone !== undefined) {
      phone = canonicalPhone(body.phone);
      if (!/^55\d{10,11}$/.test(phone)) throw httpError(400, 'Telefone com DDD, ex.: (62) 99999-8888');
    }
    const cities = body.cities !== undefined ? [...new Set((Array.isArray(body.cities) ? body.cities : []).map(String))] : current?.cities || [];
    if (cities.some((c) => !CITIES[c])) throw httpError(400, 'Cidade inválida');
    if (!cities.length) throw httpError(400, 'Marque ao menos uma cidade');
    const permissions = body.permissions !== undefined ? [...new Set((Array.isArray(body.permissions) ? body.permissions : []).map(String))] : current?.permissions || [];
    const unknown = permissions.filter((p) => !PERMISSIONS[p]);
    if (unknown.length) throw httpError(400, `Permissão desconhecida: ${unknown.join(', ')}`);
    let userId = body.user_id !== undefined ? (body.user_id || null) : current?.user_id || null;
    if (userId) {
      if (!isUuid(userId)) throw httpError(400, 'Usuário inválido');
      const { rows } = await pool.query('SELECT 1 FROM profiles WHERE id = $1', [userId]);
      if (!rows.length) throw httpError(400, 'Usuário da equipe não encontrado');
    } else userId = null;
    const active = body.active !== undefined ? !!body.active : current ? current.active : true;
    // o mesmo telefone (com ou sem 9º dígito) não pode estar em dois cadastros
    const { rows: clash } = await pool.query(
      `SELECT name FROM assistant_numbers WHERE phone = ANY($1) AND id IS DISTINCT FROM $2 LIMIT 1`, [phoneVariants(phone), current?.id || null]
    );
    if (clash.length) throw httpError(409, `Este telefone já está cadastrado (${clash[0].name})`);
    return { name, phone, cities, permissions, userId, active };
  }

  app.get('/api/assistant/overview', async (req, res) => {
    try {
      await admin(req);
      const [settings, numbers, log, actions, demands, jobs, team, connection, conn] = await Promise.all([
        pool.query('SELECT enabled, group_monitor_enabled, monitor_since, updated_at FROM assistant_settings WHERE id = 1'),
        pool.query(`SELECT n.*, p.name AS user_name FROM assistant_numbers n LEFT JOIN profiles p ON p.id = n.user_id ORDER BY n.active DESC, n.name`),
        pool.query(
          `SELECT l.id, l.kind, l.tool, l.text, l.phone, l.created_at, n.name AS number_name FROM assistant_log l
             LEFT JOIN assistant_numbers n ON n.id = l.number_id
            WHERE l.kind <> 'ferramenta' ORDER BY l.created_at DESC LIMIT 40`),
        pool.query(
          `SELECT a.id, a.kind, a.summary, a.status, a.source, a.created_at, a.decided_at, n.name AS number_name FROM assistant_pending_actions a
             LEFT JOIN assistant_numbers n ON n.id = a.number_id ORDER BY a.created_at DESC LIMIT 25`),
        pool.query(
          `SELECT d.id, d.kind, d.summary, d.status, d.cidade, d.alerted_count, d.created_at, c.company_name FROM assistant_demands d
             LEFT JOIN clients c ON c.id = d.client_id ORDER BY d.created_at DESC LIMIT 25`),
        pool.query(
          `SELECT j.id, j.type, j.status, j.params, j.requested_by_name, j.claimed_by_name, j.created_at, j.delivered_at, j.fail_reason, j.sent_to_client_at,
                  c.company_name FROM agent_jobs j LEFT JOIN clients c ON c.id = j.client_id ORDER BY j.created_at DESC LIMIT 15`),
        pool.query(`SELECT id, name FROM profiles WHERE name IS NOT NULL ORDER BY name`),
        assistantConnection(pool),
        claude.connection().catch(() => null),
      ]);
      res.json({
        settings: settings.rows[0] || { enabled: false, group_monitor_enabled: false },
        connection,
        numbers: numbers.rows.map(publicNumber),
        permissions: PERMISSIONS,
        cities: CITIES,
        team: team.rows,
        whisper: { available: await whisperAvailable() },
        claude: { configured: !!conn, model: conn?.model || null },
        log: log.rows,
        actions: actions.rows,
        demands: demands.rows,
        jobs: jobs.rows,
      });
    } catch (error) {
      fail(res, error);
    }
  });

  app.patch('/api/assistant/settings', async (req, res) => {
    try {
      const { user } = await admin(req);
      const body = req.body || {};
      const sets = [];
      const params = [];
      if (body.enabled !== undefined) {
        params.push(!!body.enabled);
        sets.push(`enabled = $${params.length}`);
      }
      if (body.group_monitor_enabled !== undefined) {
        params.push(!!body.group_monitor_enabled);
        sets.push(`group_monitor_enabled = $${params.length}`);
        // ao ligar, o monitor começa dali (não lê o histórico dos grupos)
        if (body.group_monitor_enabled) sets.push(`monitor_since = CASE WHEN group_monitor_enabled THEN monitor_since ELSE now() END`);
      }
      if (!sets.length) throw httpError(400, 'Nada para salvar');
      params.push(user.id);
      const { rows } = await pool.query(
        `UPDATE assistant_settings SET ${sets.join(', ')}, updated_by = $${params.length}, updated_at = now() WHERE id = 1
         RETURNING enabled, group_monitor_enabled, monitor_since, updated_at`, params
      );
      res.json({ settings: rows[0] });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/assistant/numbers', async (req, res) => {
    try {
      const { user } = await admin(req);
      const v = await validNumber(req.body || {}, null);
      const { rows } = await pool.query(
        `INSERT INTO assistant_numbers (name, phone, user_id, cities, permissions, active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [v.name, v.phone, v.userId, v.cities, v.permissions, v.active, user.id]
      );
      res.json({ number: publicNumber(rows[0]) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.patch('/api/assistant/numbers/:id', async (req, res) => {
    try {
      await admin(req);
      if (!isUuid(req.params.id)) throw httpError(404, 'Número não encontrado');
      const { rows: [current] } = await pool.query('SELECT * FROM assistant_numbers WHERE id = $1', [req.params.id]);
      if (!current) throw httpError(404, 'Número não encontrado');
      const v = await validNumber(req.body || {}, current);
      const { rows } = await pool.query(
        `UPDATE assistant_numbers SET name = $2, phone = $3, user_id = $4, cities = $5, permissions = $6, active = $7, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [current.id, v.name, v.phone, v.userId, v.cities, v.permissions, v.active]
      );
      res.json({ number: publicNumber(rows[0]) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete('/api/assistant/numbers/:id', async (req, res) => {
    try {
      await admin(req);
      if (!isUuid(req.params.id)) throw httpError(404, 'Número não encontrado');
      await pool.query(`UPDATE assistant_pending_actions SET status = 'cancelada', decided_at = now() WHERE number_id = $1 AND status = 'pendente'`, [req.params.id]);
      const { rowCount } = await pool.query('DELETE FROM assistant_numbers WHERE id = $1', [req.params.id]);
      if (!rowCount) throw httpError(404, 'Número não encontrado');
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });
}

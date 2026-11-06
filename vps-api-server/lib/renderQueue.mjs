// Fila de render do PC no sistema (pedido do Thiago, 06/11/2026: "um painel lá no sistema da Pulse para poder
// acompanhar, olhar a fila de renderização e poder trocar a ordem apenas arrastando").
//
// A fila roda no PC (OPEN CUT/ferramentas/render-fila/fila.mjs). A cada poucos segundos ela manda o estado dela para
// cá e recebe de volta a ordem que alguém arrastou na tela; aplica a ordem e confirma no envio seguinte.
//
//   POST /api/agent/render-queue          (chave de agente) { state } → { ordem: [ids] | null, ordem_id }
//                                         state = { atualizado, rodando: pedido|null, esperando: [pedido], recentes: [pedido],
//                                                   maquina, disco: { F, C } }
//   GET  /api/agents/render-queue         (admin) { state, updated_at, online, ordem_pendente }
//   PUT  /api/agents/render-queue/order   (admin) { ids: [id do pedido, …] } nova ordem dos que estão esperando

let schemaPronto = false;
async function garantirTabela(pool) {
  if (schemaPronto) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS render_queue (
    id int PRIMARY KEY DEFAULT 1,
    state jsonb,
    updated_at timestamptz,
    ordem jsonb,
    ordem_id bigint DEFAULT 0,
    ordem_por text,
    ordem_at timestamptz,
    ordem_aplicada bigint DEFAULT 0
  )`);
  await pool.query(`INSERT INTO render_queue (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  schemaPronto = true;
}

const ONLINE_MS = 30_000;

export function registerRenderQueueRoutes(app, { pool, verifyUser, verifyAgent, isStrictAdmin }) {
  app.post('/api/agent/render-queue', async (req, res) => {
    try {
      await verifyAgent(req);
      await garantirTabela(pool);
      const state = req.body?.state;
      if (!state || typeof state !== 'object') return res.status(400).json({ error: 'Informe state' });
      const texto = JSON.stringify(state);
      if (texto.length > 400_000) return res.status(413).json({ error: 'state grande demais' });
      const aplicada = Number(req.body?.ordem_aplicada) || 0;
      const { rows } = await pool.query(
        `UPDATE render_queue
            SET state = $1::jsonb, updated_at = now(),
                ordem_aplicada = GREATEST(ordem_aplicada, $2)
          WHERE id = 1
          RETURNING ordem, ordem_id, ordem_aplicada`,
        [texto, aplicada]
      );
      const r = rows[0] || {};
      const pendente = Number(r.ordem_id) > Number(r.ordem_aplicada);
      res.json({ ordem: pendente ? r.ordem : null, ordem_id: Number(r.ordem_id) || 0 });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // GET /api/agent/team (chave de agente): a equipe para o painel do app no PC (foto, função, card e etapa de cada um)
  app.get('/api/agent/team', async (req, res) => {
    try {
      await verifyAgent(req);
      const [{ rows: agentes }, { rows: atividade }, { rows: cards }] = await Promise.all([
        pool.query(
          `SELECT k.user_id, p.name, p.avatar_url, string_agg(DISTINCT k.role, ',') AS roles, MAX(k.last_used_at) AS last_used_at
             FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
            WHERE k.revoked_at IS NULL
            GROUP BY k.user_id, p.name, p.avatar_url
            ORDER BY p.name`
        ),
        pool.query(`SELECT user_id, status, updated_at FROM agent_activity WHERE updated_at > now() - interval '15 minutes'`),
        pool.query(
          `SELECT t.id, t.title, t.kanban_column, t.assigned_to, t.agent_step, t.agent_heartbeat_at, c.company_name AS client_name
             FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id
            WHERE t.kanban_column IN ('edicao', 'alteracao')
              AND t.assigned_to IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL)
            ORDER BY t.agent_heartbeat_at DESC NULLS LAST`
        ),
      ]);
      res.json({
        agentes: agentes.map((a) => ({
          ...a,
          status: atividade.find((x) => String(x.user_id) === String(a.user_id)) || null,
          cards: cards.filter((t) => String(t.assigned_to) === String(a.user_id)).slice(0, 5),
        })),
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.get('/api/agents/render-queue', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await garantirTabela(pool);
      const { rows } = await pool.query(`SELECT state, updated_at, ordem, ordem_id, ordem_aplicada, ordem_por, ordem_at FROM render_queue WHERE id = 1`);
      const r = rows[0] || {};
      const online = r.updated_at ? Date.now() - new Date(r.updated_at).getTime() < ONLINE_MS : false;
      res.json({
        state: r.state || null,
        updated_at: r.updated_at || null,
        online,
        ordem_pendente: Number(r.ordem_id) > Number(r.ordem_aplicada) ? r.ordem : null,
      });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.put('/api/agents/render-queue/order', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every((i) => typeof i === 'string' && /^[\w-]{4,60}$/.test(i))) {
        return res.status(400).json({ error: 'Informe ids: a lista dos pedidos na nova ordem' });
      }
      await garantirTabela(pool);
      const { rows: perfil } = await pool.query(`SELECT name FROM profiles WHERE id = $1`, [user.id]);
      const { rows } = await pool.query(
        `UPDATE render_queue SET ordem = $1::jsonb, ordem_id = ordem_id + 1, ordem_por = $2, ordem_at = now()
          WHERE id = 1 RETURNING ordem_id`,
        [JSON.stringify(ids), perfil[0]?.name || user.email || 'admin']
      );
      res.json({ ok: true, ordem_id: Number(rows[0]?.ordem_id) || 0 });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
}

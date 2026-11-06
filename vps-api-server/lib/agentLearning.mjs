// Rota do relatório semanal de aprendizado (pedido da Marcely, ordem do Thiago, 05/11/2026: "sistema de alto
// aprendizado e constante evolução"). Escrita pelo Juvenal no OPEN CUT; a Marcely leva para o vps-api-server e registra
// no server.mjs ao lado das outras rotas de agente:
//
//   import { registerLearningRoutes } from './agentLearningRoutes.mjs';
//   registerLearningRoutes(app, { pool, verifyAgent });
//
// GET /api/agent/learning/week?desde=AAAA-MM-DD[&dias=7]   (só a chefe)
// Devolve o que voltou na semana, para o ferramentas/aprendizado/semana.mjs agrupar por cliente, editor e motivo:
//   { desde, ate, cards: [{ id, title, client_name, content_type, kanban_column, editor, adjustment_notes,
//                           agent_review_verdict, agent_review_notes, agent_review_at,
//                           versoes: [{ version, created_at, por, notes }],
//                           historico: [{ action, details, created_at, por }] }] }
// Entra o card que, no período, teve no task_history alteração pedida/iniciada/devolvida, ajuste solicitado, ida para
// Alteração ou parecer da Análise.

const ACOES_DE_ALTERACAO = `(
  h.action ILIKE '%altera%' OR h.action ILIKE '%ajuste%' OR h.action ILIKE 'Parecer da Análise%'
)`;

export function registerLearningRoutes(app, { pool, verifyAgent }) {
  app.get('/api/agent/learning/week', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (agent.role !== 'chefe') return res.status(403).json({ error: 'Apenas a chefe' });
      const desde = String(req.query.desde || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return res.status(400).json({ error: 'Informe desde=AAAA-MM-DD' });
      const dias = Math.max(1, Math.min(31, Number(req.query.dias) || 7));
      const inicio = `${desde}T00:00:00-03:00`;

      const { rows: historico } = await pool.query(
        `SELECT h.task_id, h.action, h.details, h.created_at, p.name AS por
           FROM task_history h
           LEFT JOIN profiles p ON p.id = h.user_id
          WHERE h.created_at >= $1::timestamptz AND h.created_at < $1::timestamptz + ($2 || ' days')::interval
            AND ${ACOES_DE_ALTERACAO}
          ORDER BY h.created_at`,
        [inicio, String(dias)]
      );
      const ids = [...new Set(historico.map((h) => h.task_id))];
      if (!ids.length) return res.json({ desde, dias, cards: [] });

      const [{ rows: tasks }, { rows: versoes }] = await Promise.all([
        pool.query(
          `SELECT t.id, t.title, t.content_type, t.kanban_column, t.adjustment_notes,
                  t.agent_review_verdict, t.agent_review_notes, t.agent_review_at,
                  c.company_name AS client_name, pe.name AS editor
             FROM content_tasks t
             LEFT JOIN clients c ON c.id = t.client_id
             LEFT JOIN profiles pe ON pe.id = t.edited_by
            WHERE t.id = ANY($1::uuid[])`,
          [ids]
        ),
        pool.query(
          `SELECT v.task_id, v.version, v.created_at, left(coalesce(v.notes, ''), 600) AS notes, p.name AS por
             FROM edit_versions v
             LEFT JOIN profiles p ON p.id = v.created_by
            WHERE v.task_id = ANY($1::uuid[])
            ORDER BY v.task_id, v.version`,
          [ids]
        ),
      ]);

      const cards = tasks.map((t) => ({
        ...t,
        client_name: t.client_name?.trim() || null,
        editor: t.editor?.trim() || null,
        versoes: versoes.filter((v) => v.task_id === t.id).map(({ task_id, ...v }) => v),
        historico: historico.filter((h) => h.task_id === t.id).map(({ task_id, ...h }) => h),
      }));
      res.json({ desde, dias, cards });
    } catch (error) {
      const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
      if (status >= 500) console.error('[agent-learning] erro:', error);
      res.status(status).json({ error: error?.message || 'Erro' });
    }
  });
}

// ─── Agente de triagem do Drive ─────────────────────────────
// Função 'triagem' das chaves de agente (ex.: Severino): varre o Drive dos clientes e abre os cards
// do que encontrou — brutos novos viram card de Edição (Kanban de Conteúdo, coluna "edicao", na fila
// livre para editores e agentes) e pedidos de arte viram card de Design (coluna "nova_tarefa").
// Ele não edita, não pega e não move cards: só cria. A chefe também pode usar estas rotas.
// Autenticação: a mesma chave "Authorization: Agent <chave>" (verifyAgent de agentRoutes.mjs).
//
// O link do Drive é a identidade do achado: rodar a varredura de novo não duplica card. Já existe card do
// mesmo cliente com o mesmo link (drive_link no conteúdo, materials_link na arte, feito por gente ou agente)?
// A rota devolve esse card com { ja_existia: true } e não cria outro.
//
// Rotas do agente:
//   GET  /api/agent/triage/existing?link=   cards (conteúdo e design) que já usam esse link do Drive
//   POST /api/agent/triage/content-cards    { client_id, title, drive_link, content_type?, description?, script_id? }
//   POST /api/agent/triage/design-cards     { client_id, title, materials_link, format?, priority?, description?, copy_text?, due_date? }

import { DESIGN_FORMAT_PRESETS } from './lib/designBrief.mjs';

export const TRIAGE_ROLE = 'triagem';
const TRIAGE_ROUTE_ROLES = new Set([TRIAGE_ROLE, 'chefe']);
const CONTENT_TYPES = new Set(['reels', 'story', 'criativo']);
const DESIGN_PRIORITIES = new Set(['baixa', 'media', 'alta', 'urgente']);
const TZ = 'America/Sao_Paulo';
const WEEKDAY_TO_KEY = { Sun: 'domingo', Mon: 'segunda', Tue: 'terca', Wed: 'quarta', Thu: 'quinta', Fri: 'sexta', Sat: 'sabado' };

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** Mesmo cálculo de agentRoutes.mjs (addBusinessHours do front): soma dias úteis inteiros mantendo o horário. */
function addBusinessHours(from, hours, workDays) {
  let daysToAdd = Math.ceil(hours / 24);
  let current = new Date(from.getTime());
  while (daysToAdd > 0) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ }).format(current);
    if (workDays.includes(WEEKDAY_TO_KEY[short])) daysToAdd--;
  }
  return current;
}

function driveLink(value) {
  const link = String(value || '').trim();
  if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(link)) return null;
  return link.slice(0, 1000);
}

function text(value, max) {
  const v = String(value ?? '').trim();
  return v ? v.slice(0, max) : null;
}

export function registerAgentTriageRoutes(app, { pool, agentApi, designApi }) {
  const { verifyAgent, pauseStateFor } = agentApi;
  // materials_link e dimensions de design_tasks nascem no esquema dos agentes de design
  const { ensureDesignAgentSchema } = designApi;

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) console.error('[agent-triagem] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function triageAgent(req) {
    const agent = await verifyAgent(req);
    if (!TRIAGE_ROUTE_ROLES.has(agent.role)) {
      throw httpError(403, `Só a triagem ou a chefe cria cards por aqui (sua função: ${agent.role})`);
    }
    const pause = await pauseStateFor(agent.userId);
    if (pause.paused) {
      throw Object.assign(httpError(423, `Agentes pausados pelo sistema${pause.all ? '' : ` (${agent.name})`}. Não crie cards novos.`), { pause });
    }
    return agent;
  }

  async function findClient(clientId) {
    const id = String(clientId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw httpError(400, 'Informe o client_id (veja pulse clientes)');
    const { rows } = await pool.query('SELECT id, company_name FROM clients WHERE id = $1', [id]);
    if (!rows.length) throw httpError(404, 'Cliente não encontrado');
    return rows[0];
  }

  async function existingFor(link, clientId = null) {
    await ensureDesignAgentSchema();
    const [content, design] = await Promise.all([
      pool.query(
        `SELECT id, title, kanban_column, client_id FROM content_tasks
          WHERE drive_link = $1 AND ($2::uuid IS NULL OR client_id = $2) ORDER BY created_at LIMIT 5`,
        [link, clientId]
      ),
      pool.query(
        `SELECT id, title, kanban_column, client_id FROM design_tasks
          WHERE materials_link = $1 AND ($2::uuid IS NULL OR client_id = $2) ORDER BY created_at LIMIT 5`,
        [link, clientId]
      ),
    ]);
    return { content: content.rows, design: design.rows };
  }

  app.get('/api/agent/triage/existing', async (req, res) => {
    try {
      await triageAgent(req);
      const link = driveLink(req.query.link);
      if (!link) return res.status(400).json({ error: 'Informe um link do Google Drive' });
      res.json(await existingFor(link));
    } catch (error) {
      sendError(res, error);
    }
  });

  // Brutos achados no Drive → card de Edição, livre na fila (como a gravação concluída faz)
  app.post('/api/agent/triage/content-cards', async (req, res) => {
    try {
      const agent = await triageAgent(req);
      const client = await findClient(req.body?.client_id);
      const title = text(req.body?.title, 200);
      if (!title) return res.status(400).json({ error: 'Informe o título do card' });
      const link = driveLink(req.body?.drive_link);
      if (!link) return res.status(400).json({ error: 'Informe o link dos brutos no Google Drive (drive_link)' });
      const contentType = String(req.body?.content_type || 'reels').trim();
      if (!CONTENT_TYPES.has(contentType)) return res.status(400).json({ error: 'content_type: reels, story ou criativo' });
      const scriptId = text(req.body?.script_id, 36);

      const existing = await existingFor(link, client.id);
      if (existing.content.length) return res.json({ ja_existia: true, task: existing.content[0] });

      const { rows: settingsRows } = await pool.query('SELECT * FROM company_settings LIMIT 1');
      const settings = settingsRows[0] || {};
      let workDays = settings.work_days;
      if (typeof workDays === 'string') {
        try { workDays = JSON.parse(workDays); } catch { workDays = null; }
      }
      if (!Array.isArray(workDays) || !workDays.length) workDays = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
      const deadline = (settings.editing_deadline_enabled ?? true)
        ? addBusinessHours(new Date(), settings.editing_deadline_hours ?? 48, workDays).toISOString()
        : null;

      // a cidade vem do cliente (gatilho trg_global_client_city)
      const { rows: [task] } = await pool.query(
        `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, script_id, drive_link,
                                    editing_deadline, created_by, position, updated_at)
         VALUES ($1, $2, $3, 'edicao', $4, $5, $6, $7, $8,
                 (SELECT count(*) FROM content_tasks WHERE kanban_column = 'edicao'), now())
         RETURNING id, title, kanban_column, client_id, editing_deadline`,
        [client.id, title, contentType, text(req.body?.description, 4000), scriptId, link, deadline, agent.userId]
      );
      await pool.query('INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
        [task.id, agent.userId, 'Card criado', 'Brutos encontrados no Drive do cliente']).catch(() => {});
      res.json({ ja_existia: false, task: { ...task, client_name: client.company_name } });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Pedido de arte achado no Drive → card de Design em "Nova tarefa"
  app.post('/api/agent/triage/design-cards', async (req, res) => {
    try {
      const agent = await triageAgent(req);
      const client = await findClient(req.body?.client_id);
      const title = text(req.body?.title, 200);
      if (!title) return res.status(400).json({ error: 'Informe o título do card' });
      const link = driveLink(req.body?.materials_link);
      if (!link) return res.status(400).json({ error: 'Informe o link do material no Google Drive (materials_link)' });
      const formatKey = String(req.body?.format || 'feed').trim();
      const preset = DESIGN_FORMAT_PRESETS[formatKey];
      if (!preset || formatKey === 'personalizado') {
        return res.status(400).json({ error: `format: ${Object.keys(DESIGN_FORMAT_PRESETS).filter((k) => k !== 'personalizado').join(', ')}` });
      }
      const priority = String(req.body?.priority || 'media').trim();
      if (!DESIGN_PRIORITIES.has(priority)) return res.status(400).json({ error: 'priority: baixa, media, alta ou urgente' });
      const dueDate = text(req.body?.due_date, 10);
      if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: 'due_date no formato AAAA-MM-DD' });

      const existing = await existingFor(link, client.id);
      if (existing.design.length) return res.json({ ja_existia: true, task: existing.design[0] });

      const { rows: [task] } = await pool.query(
        `INSERT INTO design_tasks (client_id, title, format_type, dimensions, priority, copy_text, description, due_date,
                                   materials_link, created_by, kanban_column, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'nova_tarefa', 0)
         RETURNING id, title, kanban_column, client_id, due_date`,
        [client.id, title, preset.format_type, JSON.stringify({ preset: formatKey }), priority,
          text(req.body?.copy_text, 4000), text(req.body?.description, 4000),
          dueDate ? `${dueDate}T12:00:00-03:00` : null, link, agent.userId]
      );
      await pool.query('INSERT INTO design_task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)',
        [task.id, 'Card criado', 'Material encontrado no Drive do cliente', agent.userId]).catch(() => {});
      await pool.query(`SELECT notify_role('designer'::app_role, 'Nova tarefa de design', $1, 'design', '/designer')`, [`Nova tarefa: ${title}`])
        .catch((error) => console.error('[agent-triagem] aviso aos designers:', error.message));
      res.json({ ja_existia: false, task: { ...task, client_name: client.company_name } });
    } catch (error) {
      sendError(res, error);
    }
  });
}

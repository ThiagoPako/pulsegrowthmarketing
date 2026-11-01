// ─── Treino dos agentes (pedido do usuário, 01/11/2026) ─────────────────────────────
// "Quero poder dar a função para pessoas do time ajudar no treinamento dos agentes; no módulo agentes, poder clicar
// no agente e escrever falando com eles para ensinar como é feito, e que seja possível enviar texto, imagem, PDF e até
// vídeo." Cada mensagem vira um ensinamento (agent_trainings) do agente: quem ensinou, cliente (opcional), texto e
// anexos (arquivos já enviados para /uploads pela tela). O agente recebe um recado (agent_messages) na hora e lê com
// `pulse treino` (GET /api/agent/training), baixa os anexos e marca como lido; pode responder (aparece na conversa).
//
// Quem treina: quem tem Pulse Plus ou a permissão 'treino_agentes' (module_access), marcada por admin com Pulse Plus na
// tela Equipe. Rotas fora de /api/agents (a trava do Pulse Plus), porque quem só treina não tem Pulse Plus.
//
// Rotas da equipe (login):
//   GET    /api/agent-training/me                   { can_train, can_grant }
//   GET    /api/agent-training/agents               agentes com chave ativa + ensinamentos (total / não lidos)
//   GET    /api/agent-training/:agentId/messages    a conversa de treino com o agente
//   POST   /api/agent-training/:agentId/messages    { body, client_id?, attachments: [{ url, name, type, size }] }
//   GET    /api/team/agent-trainers                 (admin com Pulse Plus) ids de quem treina
//   POST   /api/team/:userId/agent-trainer          (admin com Pulse Plus) dá a função
//   DELETE /api/team/:userId/agent-trainer          (admin com Pulse Plus) tira a função
// Rotas do agente (Authorization: Agent <chave>):
//   GET    /api/agent/training[?todos=1]            ensinamentos não lidos (todos=1: os últimos 50, lidos ou não)
//   POST   /api/agent/training/read                 { ids: [...] } ou { all: true }
//   POST   /api/agent/training/reply                { body, reply_to? } resposta do agente na conversa

import {
  TRAINER_MODULE, MAX_TRAINING_TEXT, sanitizeAttachments, absoluteUploadUrl, trainingNotice,
} from './lib/agentTraining.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpError = (status, message) => Object.assign(new Error(message), { status });

export function registerAgentTrainingRoutes(app, {
  pool, verifyUser, isStrictAdmin, hasPulsePlus, getLinkedUserIds, agentApi, publicUploadsUrl, logger = console,
}) {
  const uploadsBase = (publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');

  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_trainings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_user_id UUID NOT NULL,
            author_id UUID,
            author_name TEXT,
            from_agent BOOLEAN NOT NULL DEFAULT false,
            client_id UUID,
            body TEXT NOT NULL DEFAULT '',
            attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
            reply_to UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            read_at TIMESTAMPTZ
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_trainings_agent ON agent_trainings(agent_user_id, created_at DESC)`).catch(() => {});
        // module_access nasce nos Agendamentos/Pulse Plus; aqui só garante para a função de treinar
        await pool.query(`
          CREATE TABLE IF NOT EXISTS module_access (
            module TEXT NOT NULL,
            user_id UUID NOT NULL,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (module, user_id)
          )
        `).catch(() => {});
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[treino] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status || error?.statusCode || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) logger.error('[treino] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function linkedIds(user) {
    const linked = getLinkedUserIds ? await getLinkedUserIds(user).catch(() => []) : [];
    return [...new Set([String(user.id), ...linked.map(String)])];
  }

  async function canTrain(user) {
    if (await hasPulsePlus(user)) return true;
    const { rows } = await pool.query(
      `SELECT 1 FROM module_access WHERE module = $1 AND user_id::text = ANY($2::text[]) LIMIT 1`,
      [TRAINER_MODULE, await linkedIds(user)]
    );
    return rows.length > 0;
  }

  async function canGrant(user) {
    return (await isStrictAdmin(user)) && (await hasPulsePlus(user));
  }

  async function requireTrainer(req) {
    const { user } = await verifyUser(req);
    await ensureSchema();
    if (!(await canTrain(user))) throw httpError(403, 'Sem a função de treinar os agentes');
    return user;
  }

  async function requireGranter(req) {
    const { user } = await verifyUser(req);
    await ensureSchema();
    if (!(await canGrant(user))) throw httpError(403, 'Só admin com Pulse Plus dá a função de treinar agentes');
    return user;
  }

  async function activeAgent(agentId) {
    if (!UUID_RE.test(String(agentId || ''))) throw httpError(400, 'Agente inválido');
    const { rows } = await pool.query(
      `SELECT k.user_id, p.name, string_agg(DISTINCT k.role, ',') AS roles
         FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
        WHERE k.user_id = $1 AND k.revoked_at IS NULL
        GROUP BY k.user_id, p.name`,
      [agentId]
    );
    if (!rows.length) throw httpError(404, 'Agente não encontrado (sem chave ativa)');
    return rows[0];
  }

  const withUrls = (rows) => rows.map((r) => ({
    ...r,
    attachments: (Array.isArray(r.attachments) ? r.attachments : []).map((a) => ({ ...a, url: absoluteUploadUrl(a.url, uploadsBase) })),
  }));

  // ── Equipe ──
  app.get('/api/agent-training/me', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      await ensureSchema();
      res.set('Cache-Control', 'no-store');
      res.json({ can_train: await canTrain(user), can_grant: await canGrant(user) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agent-training/agents', async (req, res) => {
    try {
      await requireTrainer(req);
      const { rows } = await pool.query(
        `SELECT k.user_id, p.name, p.avatar_url, string_agg(DISTINCT k.role, ',') AS roles,
                (SELECT count(*)::int FROM agent_trainings t WHERE t.agent_user_id = k.user_id AND NOT t.from_agent) AS lessons,
                (SELECT count(*)::int FROM agent_trainings t WHERE t.agent_user_id = k.user_id AND NOT t.from_agent AND t.read_at IS NULL) AS unread,
                (SELECT max(t.created_at) FROM agent_trainings t WHERE t.agent_user_id = k.user_id) AS last_at
           FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
          WHERE k.revoked_at IS NULL
          GROUP BY k.user_id, p.name, p.avatar_url
          ORDER BY p.name`
      );
      res.json({ agents: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agent-training/:agentId/messages', async (req, res) => {
    try {
      await requireTrainer(req);
      const agent = await activeAgent(req.params.agentId);
      const { rows } = await pool.query(
        `SELECT t.id, t.author_id, t.author_name, t.from_agent, t.client_id, c.company_name AS client_name,
                t.body, t.attachments, t.reply_to, t.created_at, t.read_at
           FROM agent_trainings t LEFT JOIN clients c ON c.id = t.client_id
          WHERE t.agent_user_id = $1
          ORDER BY t.created_at DESC
          LIMIT 200`,
        [agent.user_id]
      );
      res.json({ agent: { user_id: agent.user_id, name: agent.name, roles: agent.roles }, messages: withUrls(rows.reverse()) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent-training/:agentId/messages', async (req, res) => {
    try {
      const user = await requireTrainer(req);
      const agent = await activeAgent(req.params.agentId);
      const body = String(req.body?.body || '').trim();
      if (body.length > MAX_TRAINING_TEXT) throw httpError(400, `Texto longo demais (máximo ${MAX_TRAINING_TEXT} caracteres)`);
      const attachments = sanitizeAttachments(req.body?.attachments, uploadsBase);
      if (!body && !attachments.length) throw httpError(400, 'Escreva o ensinamento ou anexe um arquivo');
      let clientId = req.body?.client_id ? String(req.body.client_id) : null;
      let clientName = null;
      if (clientId) {
        if (!UUID_RE.test(clientId)) throw httpError(400, 'Cliente inválido');
        const { rows } = await pool.query('SELECT company_name FROM clients WHERE id = $1', [clientId]);
        if (!rows.length) throw httpError(404, 'Cliente não encontrado');
        clientName = rows[0].company_name;
      }
      const { rows: [author] } = await pool.query('SELECT name FROM profiles WHERE id = $1', [user.id]);
      const authorName = String(author?.name || user.email || 'Equipe').trim();
      const { rows: [saved] } = await pool.query(
        `INSERT INTO agent_trainings (agent_user_id, author_id, author_name, client_id, body, attachments)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id, author_id, author_name, from_agent, client_id, body, attachments, reply_to, created_at, read_at`,
        [agent.user_id, user.id, authorName, clientId, body, JSON.stringify(attachments)]
      );
      // o agente fica sabendo na hora (pulse caixa / pulse esperar)
      await pool.query(
        'INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)',
        [user.id, agent.user_id, trainingNotice({ authorName, clientName, body, attachments })]
      ).catch((error) => logger.error('[treino] recado ao agente:', error.message));
      logger.log(`[treino] ${authorName} ensinou ${String(agent.name || agent.user_id).trim()} (${attachments.length} anexo(s))`);
      res.json({ message: withUrls([{ ...saved, client_name: clientName }])[0] });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Quem pode treinar (tela Equipe) ──
  app.get('/api/team/agent-trainers', async (req, res) => {
    try {
      await requireGranter(req);
      const { rows } = await pool.query(
        `SELECT user_id::text AS user_id, created_by, created_at FROM module_access WHERE module = $1 ORDER BY created_at`,
        [TRAINER_MODULE]
      );
      res.set('Cache-Control', 'no-store');
      res.json({ members: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/team/:userId/agent-trainer', async (req, res) => {
    try {
      const user = await requireGranter(req);
      const target = String(req.params.userId || '');
      if (!UUID_RE.test(target)) throw httpError(400, 'Membro inválido');
      const { rows: profile } = await pool.query('SELECT id FROM profiles WHERE id = $1', [target]);
      if (!profile.length) throw httpError(404, 'Membro não encontrado');
      const { rows: [me] } = await pool.query('SELECT name FROM profiles WHERE id = $1', [user.id]);
      await pool.query(
        `INSERT INTO module_access (module, user_id, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [TRAINER_MODULE, target, `${String(me?.name || 'admin').trim()} (${user.id})`]
      );
      res.json({ ok: true, user_id: target, can_train: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/team/:userId/agent-trainer', async (req, res) => {
    try {
      await requireGranter(req);
      const target = String(req.params.userId || '');
      if (!UUID_RE.test(target)) throw httpError(400, 'Membro inválido');
      await pool.query('DELETE FROM module_access WHERE module = $1 AND user_id = $2', [TRAINER_MODULE, target]);
      res.json({ ok: true, user_id: target, can_train: false });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Agente ──
  app.get('/api/agent/training', async (req, res) => {
    try {
      const agent = await agentApi.verifyAgent(req);
      await ensureSchema();
      const all = ['1', 'true', 'sim'].includes(String(req.query.todos || req.query.all || '').toLowerCase());
      const { rows } = await pool.query(
        `SELECT t.id, t.author_name, t.client_id, c.company_name AS client_name, t.body, t.attachments,
                t.created_at, t.read_at
           FROM agent_trainings t LEFT JOIN clients c ON c.id = t.client_id
          WHERE t.agent_user_id = $1 AND NOT t.from_agent ${all ? '' : 'AND t.read_at IS NULL'}
          ORDER BY t.created_at ${all ? 'DESC' : 'ASC'}
          LIMIT 50`,
        [agent.userId]
      );
      if (all) rows.reverse();
      res.json({ trainings: withUrls(rows) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/training/read', async (req, res) => {
    try {
      const agent = await agentApi.verifyAgent(req);
      await ensureSchema();
      const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).filter((id) => UUID_RE.test(id));
      if (!ids.length && !req.body?.all) throw httpError(400, 'Diga quais ensinamentos (ids) ou all: true');
      const { rowCount } = await pool.query(
        `UPDATE agent_trainings SET read_at = now()
          WHERE agent_user_id = $1 AND NOT from_agent AND read_at IS NULL ${req.body?.all ? '' : 'AND id::text = ANY($2::text[])'}`,
        req.body?.all ? [agent.userId] : [agent.userId, ids]
      );
      res.json({ ok: true, marked: rowCount });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/training/reply', async (req, res) => {
    try {
      const agent = await agentApi.verifyAgent(req);
      await ensureSchema();
      const body = String(req.body?.body || '').trim().slice(0, MAX_TRAINING_TEXT);
      if (!body) throw httpError(400, 'Escreva a resposta');
      const replyTo = req.body?.reply_to && UUID_RE.test(String(req.body.reply_to)) ? String(req.body.reply_to) : null;
      const { rows: [saved] } = await pool.query(
        `INSERT INTO agent_trainings (agent_user_id, author_id, author_name, from_agent, body, reply_to)
         VALUES ($1, $1, $2, true, $3, $4) RETURNING id, created_at`,
        [agent.userId, String(agent.name || 'Agente').trim(), body, replyTo]
      );
      res.json({ ok: true, id: saved.id, created_at: saved.created_at });
    } catch (error) {
      sendError(res, error);
    }
  });

  return { canTrain, ensureSchema };
}

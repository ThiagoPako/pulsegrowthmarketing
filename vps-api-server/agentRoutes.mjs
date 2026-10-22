// ─── Agentes de edição (Fase 1) ─────────────────────────────
// Membros da equipe que trabalham por uma chave própria (não por login no navegador):
// editores (pegam e entregam vídeos), revisor e chefe. Cada chave pertence a um
// profile real, então "editado por", histórico e relatórios mostram o nome dele.
//
// Rotas de administração (JWT de admin):
//   GET    /api/agent-keys              lista as chaves (sem o segredo)
//   POST   /api/agent-keys              { user_id, role } → devolve a chave UMA vez
//   DELETE /api/agent-keys/:id          revoga
//   GET    /api/agents/overview         painel: agentes, card atual, entregas, fila, atividade
//   POST   /api/agents/pause|resume     { scope: 'all' | <user_id> } — pausado = não pega card novo
//
// Rotas do agente (cabeçalho "Authorization: Agent <chave>"):
//   GET  /api/agent/me
//   GET  /api/agent/queue               fila de edição (alterações primeiro)
//   POST /api/agent/tasks/:id/claim     assume o card (atômico)
//   POST /api/agent/tasks/:id/heartbeat { step }   sinal de vida + etapa atual
//   POST /api/agent/tasks/:id/release   { reason } devolve o card para a fila
//   POST /api/agent/tasks/:id/deliver   multipart: video (mp4), plan (json, opcional), notes
//   GET  /api/agent/stale?minutes=30    (chefe) cards de agentes sem sinal de vida
//   GET  /api/agent/clients?search=     nicho, linha editorial e links do cliente
//
// A entrega reproduz no servidor o que o navegador faz em
// src/lib/contentTaskSync.ts ao mover um card para "revisao".

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';

const AGENT_ROLES = new Set(['editor', 'revisor', 'chefe']);
const TZ = 'America/Sao_Paulo';
const WEEKDAY_TO_KEY = { Sun: 'domingo', Mon: 'segunda', Tue: 'terca', Wed: 'quarta', Thu: 'quinta', Fri: 'sexta', Sat: 'sabado' };

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function weekdayKeyInBrazil(date) {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ }).format(date);
  return WEEKDAY_TO_KEY[short];
}

function brazilDateString(date) {
  // yyyy-MM-dd no fuso de Brasília (igual ao format() do navegador da equipe)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Mesmo cálculo de addBusinessHours do front: soma dias úteis inteiros mantendo o horário. */
function addBusinessHours(from, hours, workDays) {
  let daysToAdd = Math.ceil(hours / 24);
  let current = new Date(from.getTime());
  while (daysToAdd > 0) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    if (workDays.includes(weekdayKeyInBrazil(current))) daysToAdd--;
  }
  return current;
}

export function registerAgentRoutes(app, { pool, uploadRoot, verifyUser, isStrictAdmin, publicUploadsUrl }) {
  const uploadsBase = (publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');

  // ── Esquema ───────────────────────────────────────────────
  let schemaPromise = null;
  function ensureAgentSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            role TEXT NOT NULL DEFAULT 'editor',
            key_hash TEXT NOT NULL UNIQUE,
            key_hint TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_used_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS edit_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id UUID NOT NULL,
            version INTEGER NOT NULL,
            video_url TEXT NOT NULL,
            plan JSONB,
            notes TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (task_id, version)
          )
        `);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_step TEXT`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_heartbeat_at TIMESTAMPTZ`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_edit_versions_task ON edit_versions(task_id, version DESC)`).catch(() => {});
        // pausa: scope = 'all' (todos) ou o user_id de um agente; existir a linha = pausado
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_pauses (
            scope TEXT PRIMARY KEY,
            paused_by UUID,
            paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            reason TEXT
          )
        `);
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }
  ensureAgentSchema().catch((error) => console.error('Failed to ensure agent schema:', error));

  // ── Autenticação do agente ────────────────────────────────
  async function verifyAgent(req) {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Agent ')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    const raw = header.slice('Agent '.length).trim();
    if (!raw) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    await ensureAgentSchema();
    const { rows } = await pool.query(
      `SELECT k.id, k.user_id, k.role, p.name, p.email
         FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
        WHERE k.key_hash = $1 AND k.revoked_at IS NULL
        LIMIT 1`,
      [hashKey(raw)]
    );
    if (!rows.length) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    pool.query('UPDATE agent_keys SET last_used_at = now() WHERE id = $1', [rows[0].id]).catch(() => {});
    return { keyId: rows[0].id, userId: rows[0].user_id, role: rows[0].role, name: rows[0].name, email: rows[0].email };
  }

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) console.error('[agent] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function logHistory(taskId, userId, action, details = null) {
    await pool.query(
      'INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [taskId, userId, action, details]
    ).catch((error) => console.error('[agent] task_history:', error.message));
  }

  async function pauseStateFor(userId) {
    const { rows } = await pool.query(
      `SELECT scope, paused_at, reason FROM agent_pauses WHERE scope = 'all' OR scope = $1`,
      [String(userId)]
    );
    const all = rows.find((r) => r.scope === 'all');
    const own = rows.find((r) => r.scope !== 'all');
    return { paused: rows.length > 0, all: !!all, own: !!own, reason: (all || own)?.reason || null };
  }

  // ── Administração das chaves ──────────────────────────────
  app.get('/api/agent-keys', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const { rows } = await pool.query(
        `SELECT k.id, k.user_id, k.role, k.key_hint, k.created_at, k.last_used_at, k.revoked_at, p.name, p.email
           FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
          ORDER BY k.revoked_at NULLS FIRST, k.created_at DESC`
      );
      res.json({ keys: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent-keys', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const userId = String(req.body?.user_id || '').trim();
      const role = String(req.body?.role || 'editor').trim();
      if (!userId) return res.status(400).json({ error: 'Escolha o membro da equipe' });
      if (!AGENT_ROLES.has(role)) return res.status(400).json({ error: 'Papel inválido' });
      const { rows: profiles } = await pool.query('SELECT id, name FROM profiles WHERE id = $1', [userId]);
      if (!profiles.length) return res.status(404).json({ error: 'Membro não encontrado' });

      const raw = `pa_${crypto.randomBytes(32).toString('base64url')}`;
      const { rows } = await pool.query(
        `INSERT INTO agent_keys (user_id, role, key_hash, key_hint, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [userId, role, hashKey(raw), raw.slice(-4), user.id]
      );
      res.json({ id: rows[0].id, key: raw, name: profiles[0].name, role });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/agent-keys/:id', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      await pool.query('UPDATE agent_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [req.params.id]);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Painel de agentes no sistema (admin) ──────────────────
  app.get('/api/agents/overview', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const [{ rows: agents }, { rows: pauses }, { rows: current }, { rows: delivered }, { rows: queue }, { rows: activity }] = await Promise.all([
        pool.query(
          `SELECT k.user_id, p.name, p.email,
                  string_agg(DISTINCT k.role, ',') AS roles,
                  MAX(k.last_used_at) AS last_used_at
             FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
            WHERE k.revoked_at IS NULL
            GROUP BY k.user_id, p.name, p.email
            ORDER BY p.name`
        ),
        pool.query(`SELECT scope, paused_at, reason, paused_by FROM agent_pauses`),
        pool.query(
          `SELECT t.id, t.title, t.kanban_column, t.assigned_to, t.agent_step, t.agent_heartbeat_at, t.editing_started_at,
                  c.company_name AS client_name
             FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id
            WHERE t.kanban_column IN ('edicao', 'alteracao')
              AND t.assigned_to IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL)`
        ),
        pool.query(
          `SELECT created_by,
                  COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AS today,
                  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS week,
                  COUNT(*) FILTER (WHERE version > 1 AND created_at >= now() - interval '7 days') AS week_alterations
             FROM edit_versions GROUP BY created_by`
        ),
        pool.query(
          `SELECT
              COUNT(*) FILTER (WHERE kanban_column = 'edicao' AND assigned_to IS NULL) AS waiting,
              COUNT(*) FILTER (WHERE kanban_column = 'edicao' AND assigned_to IS NULL AND COALESCE(drive_link, '') = '') AS without_footage,
              COUNT(*) FILTER (WHERE kanban_column = 'alteracao' AND edited_by IN (SELECT user_id FROM agent_keys)) AS agent_alterations,
              COUNT(*) FILTER (WHERE kanban_column = 'edicao' AND assigned_to IS NULL AND editing_deadline < now()) AS overdue
             FROM content_tasks
            WHERE content_type IS DISTINCT FROM 'otimizacao'`
        ),
        pool.query(
          `SELECT h.created_at, h.action, h.details, h.user_id, p.name AS agent_name, t.title, t.id AS task_id
             FROM task_history h
             JOIN profiles p ON p.id = h.user_id
             LEFT JOIN content_tasks t ON t.id = h.task_id
            WHERE h.user_id IN (SELECT user_id FROM agent_keys)
            ORDER BY h.created_at DESC
            LIMIT 20`
        ),
      ]);
      const allPause = pauses.find((p) => p.scope === 'all') || null;
      res.json({
        paused_all: allPause,
        queue: queue[0],
        agents: agents.map((a) => {
          const d = delivered.find((x) => x.created_by === a.user_id) || {};
          return {
            ...a,
            paused: pauses.find((p) => p.scope === String(a.user_id)) || null,
            current: current.filter((t) => t.assigned_to === a.user_id),
            delivered_today: Number(d.today || 0),
            delivered_week: Number(d.week || 0),
            alterations_week: Number(d.week_alterations || 0),
          };
        }),
        activity,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agents/pause', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const scope = String(req.body?.scope || 'all');
      const reason = String(req.body?.reason || '').slice(0, 300) || null;
      await pool.query(
        `INSERT INTO agent_pauses (scope, paused_by, reason) VALUES ($1, $2, $3)
         ON CONFLICT (scope) DO UPDATE SET paused_by = EXCLUDED.paused_by, reason = EXCLUDED.reason, paused_at = now()`,
        [scope, user.id, reason]
      );
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agents/resume', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      await pool.query('DELETE FROM agent_pauses WHERE scope = $1', [String(req.body?.scope || 'all')]);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Rotas do agente ───────────────────────────────────────
  app.get('/api/agent/me', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      res.json({ id: agent.userId, name: agent.name, email: agent.email, role: agent.role, pause: await pauseStateFor(agent.userId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  const TASK_FIELDS = `
    t.id, t.title, t.kanban_column, t.content_type, t.client_id, t.drive_link, t.description,
    t.adjustment_notes, t.script_alteration_notes, t.immediate_alteration, t.editing_priority,
    t.editing_deadline, t.alteration_deadline, t.assigned_to, t.edited_by, t.edited_video_link,
    t.editing_started_at, t.agent_step, t.agent_heartbeat_at, t.position, t.created_at,
    c.company_name AS client_name, c.niche AS client_niche, c.drive_link AS client_drive_link,
    c.drive_identidade_visual AS client_identity_link,
    s.title AS script_title, s.content AS script_content, s.video_type AS script_video_type,
    (SELECT COALESCE(MAX(v.version), 0) FROM edit_versions v WHERE v.task_id = t.id) AS last_version`;

  app.get('/api/agent/queue', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const { rows } = await pool.query(
        `SELECT ${TASK_FIELDS}
           FROM content_tasks t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN scripts s ON s.id = t.script_id
          WHERE t.content_type IS DISTINCT FROM 'otimizacao'
            AND (
              (t.kanban_column = 'edicao' AND (t.assigned_to IS NULL OR t.assigned_to = $1))
              -- alteração só de vídeo que o próprio agente editou (os de humanos não têm plano no OPEN CUT)
              OR (t.kanban_column = 'alteracao' AND t.edited_by = $1
                  AND (t.assigned_to IS NULL OR t.assigned_to = $1))
            )
          ORDER BY (t.kanban_column = 'alteracao') DESC,
                   t.immediate_alteration DESC NULLS LAST,
                   t.editing_priority DESC NULLS LAST,
                   COALESCE(t.alteration_deadline, t.editing_deadline) ASC NULLS LAST,
                   t.position ASC NULLS LAST,
                   t.created_at ASC`,
        [agent.userId]
      );
      res.json({ agent: { id: agent.userId, name: agent.name, role: agent.role }, pause: await pauseStateFor(agent.userId), tasks: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/tasks/:id/claim', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const pause = await pauseStateFor(agent.userId);
      if (pause.paused) {
        return res.status(423).json({ error: `Agentes pausados pelo sistema${pause.all ? '' : ` (${agent.name})`}. Não pegue cards novos.`, pause });
      }
      const { rows } = await pool.query(
        `UPDATE content_tasks SET
            assigned_to = $2,
            edited_by = $2,
            editing_started_at = CASE WHEN kanban_column = 'alteracao' OR editing_started_at IS NULL THEN now() ELSE editing_started_at END,
            editing_paused_at = NULL,
            agent_step = 'iniciado',
            agent_heartbeat_at = now(),
            updated_at = now()
          WHERE id = $1
            AND content_type IS DISTINCT FROM 'otimizacao'
            AND (assigned_to IS NULL OR assigned_to = $2)
            AND (
              kanban_column = 'edicao'
              OR (kanban_column = 'alteracao' AND edited_by = $2)
            )
          RETURNING id, kanban_column`,
        [req.params.id, agent.userId]
      );
      if (!rows.length) return res.status(409).json({ error: 'Card indisponível (já assumido, fora da fila ou de outro editor)' });
      await logHistory(rows[0].id, agent.userId, rows[0].kanban_column === 'alteracao' ? 'Alteração iniciada' : 'Edição iniciada');
      const { rows: full } = await pool.query(
        `SELECT ${TASK_FIELDS} FROM content_tasks t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN scripts s ON s.id = t.script_id
          WHERE t.id = $1`,
        [rows[0].id]
      );
      res.json({ task: full[0] });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/tasks/:id/heartbeat', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const step = String(req.body?.step || '').slice(0, 120) || null;
      const { rowCount } = await pool.query(
        `UPDATE content_tasks SET agent_step = COALESCE($3, agent_step), agent_heartbeat_at = now()
          WHERE id = $1 AND assigned_to = $2`,
        [req.params.id, agent.userId, step]
      );
      if (!rowCount) return res.status(409).json({ error: 'Este card não está com você' });
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/tasks/:id/release', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const reason = String(req.body?.reason || '').slice(0, 500) || null;
      const isChefe = agent.role === 'chefe';
      const { rows } = await pool.query(
        `UPDATE content_tasks SET
            assigned_to = NULL,
            editing_started_at = CASE WHEN kanban_column = 'edicao' THEN NULL ELSE editing_started_at END,
            edited_by = CASE WHEN kanban_column = 'edicao' THEN NULL ELSE edited_by END,
            agent_step = NULL,
            agent_heartbeat_at = NULL,
            updated_at = now()
          WHERE id = $1 AND kanban_column IN ('edicao', 'alteracao')
            AND (assigned_to = $2 OR ($3 AND assigned_to IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL)))
          RETURNING id`,
        [req.params.id, agent.userId, isChefe]
      );
      if (!rows.length) return res.status(409).json({ error: 'Nada a liberar' });
      await logHistory(rows[0].id, agent.userId, 'Card devolvido para a fila', reason);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Dados dos clientes para montar a estrutura no OPEN CUT (nicho, linha editorial, Drive, identidade)
  app.get('/api/agent/clients', async (req, res) => {
    try {
      await verifyAgent(req);
      const search = String(req.query.search || '').trim();
      const { rows } = await pool.query(
        `SELECT id, company_name, niche, city, editorial, color, logo_url,
                drive_link, drive_fotos, drive_identidade_visual
           FROM clients
          WHERE ($1 = '' OR company_name ILIKE '%' || $1 || '%')
          ORDER BY company_name`,
        [search]
      );
      res.json({ clients: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agent/stale', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (agent.role !== 'chefe') return res.status(403).json({ error: 'Apenas a chefe' });
      const minutes = Math.max(5, Math.min(24 * 60, Number(req.query.minutes) || 30));
      const { rows } = await pool.query(
        `SELECT t.id, t.title, t.kanban_column, t.agent_step, t.agent_heartbeat_at, t.assigned_to, p.name AS agent_name
           FROM content_tasks t
           LEFT JOIN profiles p ON p.id = t.assigned_to
          WHERE t.kanban_column IN ('edicao', 'alteracao')
            AND EXISTS (SELECT 1 FROM agent_keys k WHERE k.user_id = t.assigned_to AND k.revoked_at IS NULL)
            AND (t.agent_heartbeat_at IS NULL OR t.agent_heartbeat_at < now() - ($1 || ' minutes')::interval)
          ORDER BY t.agent_heartbeat_at ASC NULLS FIRST`,
        [String(minutes)]
      );
      res.json({ minutes, tasks: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Entrega ───────────────────────────────────────────────
  const deliverUpload = multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        try {
          fs.mkdirSync(req.agentUploadDir, { recursive: true });
          cb(null, req.agentUploadDir);
        } catch (error) {
          cb(error);
        }
      },
      filename(_req, file, cb) {
        const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
        cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 2 },
    fileFilter(_req, file, cb) {
      if (file.fieldname === 'video' && !/^video\//.test(file.mimetype) && !/\.(mp4|mov)$/i.test(file.originalname || '')) {
        return cb(Object.assign(new Error('O vídeo precisa ser MP4/MOV'), { status: 400 }));
      }
      cb(null, true);
    },
  }).fields([{ name: 'video', maxCount: 1 }, { name: 'plan', maxCount: 1 }]);

  function removeFiles(req) {
    for (const list of Object.values(req.files || {})) {
      for (const file of list) fs.promises.unlink(file.path).catch(() => {});
    }
  }

  app.post('/api/agent/tasks/:id/deliver', async (req, res) => {
    let agent;
    let task;
    try {
      agent = await verifyAgent(req);
      const { rows } = await pool.query(
        `SELECT t.*, c.company_name AS client_name FROM content_tasks t
           LEFT JOIN clients c ON c.id = t.client_id
          WHERE t.id = $1`,
        [req.params.id]
      );
      task = rows[0];
      if (!task) return res.status(404).json({ error: 'Card não encontrado' });
      if (task.assigned_to !== agent.userId || !['edicao', 'alteracao'].includes(task.kanban_column)) {
        return res.status(409).json({ error: 'Assuma o card (claim) antes de entregar' });
      }
      const folder = path.join('content', task.client_id || 'avulso', task.id);
      req.agentUploadDir = path.resolve(uploadRoot, folder);
      if (!req.agentUploadDir.startsWith(path.resolve(uploadRoot))) return res.status(400).json({ error: 'Pasta inválida' });
    } catch (error) {
      return sendError(res, error);
    }

    deliverUpload(req, res, async (uploadError) => {
      if (uploadError) {
        removeFiles(req);
        const status = uploadError.status || (uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : uploadError.code === 'ENOSPC' ? 507 : 500);
        return res.status(status).json({ error: uploadError.message || 'Falha no upload' });
      }
      const video = req.files?.video?.[0];
      if (!video) {
        removeFiles(req);
        return res.status(400).json({ error: 'Envie o vídeo no campo "video"' });
      }

      let plan = null;
      const planFile = req.files?.plan?.[0];
      if (planFile) {
        try {
          plan = JSON.parse(await fs.promises.readFile(planFile.path, 'utf8'));
        } catch {
          removeFiles(req);
          return res.status(400).json({ error: 'plan não é um JSON válido' });
        }
        fs.promises.unlink(planFile.path).catch(() => {});
      }

      const relative = path.relative(path.resolve(uploadRoot), video.path).split(path.sep).join('/');
      const videoUrl = `${uploadsBase}/${relative}`;
      const notes = String(req.body?.notes || '').slice(0, 4000) || null;
      const now = new Date();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Recheca dentro da transação: ninguém mexeu no card durante o upload
        const { rows: locked } = await client.query(
          `SELECT id FROM content_tasks WHERE id = $1 AND assigned_to = $2 AND kanban_column IN ('edicao', 'alteracao') FOR UPDATE`,
          [task.id, agent.userId]
        );
        if (!locked.length) throw Object.assign(new Error('O card mudou durante o envio; entrega cancelada'), { status: 409 });

        const { rows: versionRows } = await client.query(
          `INSERT INTO edit_versions (task_id, version, video_url, plan, notes, created_by)
           VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM edit_versions WHERE task_id = $1), $2, $3, $4, $5)
           RETURNING version`,
          [task.id, videoUrl, plan ? JSON.stringify(plan) : null, notes, agent.userId]
        );

        // Prazos iguais ao front (company_settings + dias úteis)
        // SELECT * porque colunas como review_deadline_enabled não existem em todo banco
        const { rows: settingsRows } = await client.query('SELECT * FROM company_settings LIMIT 1');
        const settings = settingsRows[0] || {};
        if (typeof settings.work_days === 'string') {
          try { settings.work_days = JSON.parse(settings.work_days); } catch { settings.work_days = null; }
        }
        const workDays = Array.isArray(settings.work_days) && settings.work_days.length
          ? settings.work_days
          : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
        const reviewDeadline = (settings.review_deadline_enabled ?? true)
          ? addBusinessHours(now, settings.review_deadline_hours ?? 24, workDays).toISOString()
          : null;

        await client.query(
          `UPDATE content_tasks SET
              kanban_column = 'revisao',
              edited_video_link = $2,
              edited_video_type = 'upload',
              edited_by = $3,
              assigned_to = NULL,
              reviewing_by = NULL, reviewing_by_name = NULL, reviewing_at = NULL,
              editing_deadline = NULL, alteration_deadline = NULL, approval_deadline = NULL,
              review_deadline = $4,
              approval_sent_at = $5,
              agent_step = 'entregue',
              agent_heartbeat_at = now(),
              updated_at = now()
            WHERE id = $1`,
          [task.id, videoUrl, agent.userId, reviewDeadline, now.toISOString()]
        );

        if (task.client_id) {
          const { rowCount } = await client.query(
            `UPDATE social_media_deliveries SET status = 'revisao' WHERE content_task_id = $1`,
            [task.id]
          );
          if (!rowCount) {
            await client.query(
              `INSERT INTO social_media_deliveries
                 (client_id, content_type, title, description, status, delivered_at, recording_id, script_id, created_by, content_task_id)
               VALUES ($1, $2, $3, $4, 'revisao', $5, $6, $7, $8, $9)`,
              [task.client_id, task.content_type, task.title, task.description || null, brazilDateString(now),
                task.recording_id || null, task.script_id || null, agent.userId, task.id]
            );
          }

          const { rows: portalRows } = await client.query(
            `SELECT id FROM client_portal_contents WHERE client_id = $1 AND title = $2 ORDER BY created_at DESC LIMIT 1`,
            [task.client_id, task.title]
          );
          if (portalRows.length) {
            await client.query(
              `UPDATE client_portal_contents SET file_url = $2, status = 'revisao_interna', updated_at = now() WHERE id = $1`,
              [portalRows[0].id, videoUrl]
            );
          } else {
            const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'numeric' }).format(now));
            const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric' }).format(now));
            await client.query(
              `INSERT INTO client_portal_contents (client_id, title, content_type, file_url, status, season_month, season_year, uploaded_by)
               VALUES ($1, $2, $3, $4, 'revisao_interna', $5, $6, $7)`,
              [task.client_id, task.title, task.content_type, videoUrl, month, year, agent.userId]
            );
          }

          await client.query(
            `INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)`,
            [task.client_id, '👁 Revisão interna', `"${task.title}" está em revisão interna de qualidade.`, 'internal_review']
          );
        }

        await client.query(
          `SELECT notify_role('social_media'::app_role, $1, $2, 'review', '/entregas-social')`,
          ['Vídeo para Revisão', `${task.title} (${task.client_name || ''}) está pronto para revisão`]
        );

        await client.query(
          'INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)',
          [task.id, agent.userId, 'Vídeo editado enviado via upload', videoUrl,
            'Enviado para Revisão', `Versão ${versionRows[0].version}${notes ? ` · ${notes}` : ''}`]
        );

        await client.query('COMMIT');
        res.json({ ok: true, version: versionRows[0].version, video_url: videoUrl, review_deadline: reviewDeadline });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        fs.promises.unlink(video.path).catch(() => {});
        sendError(res, error);
      } finally {
        client.release();
      }
    });
  });
}

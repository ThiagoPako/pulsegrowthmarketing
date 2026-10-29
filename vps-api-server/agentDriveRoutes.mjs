// ─── Severino: entrada de vídeos pelo Drive (módulo Agentes) ──────────
// Severino é o agente (nome dado pelo usuário em 29/10/2026) que transforma as pastas novas do Drive em cards.
// Antes, o videomaker criava à mão o card de edição: copiava o link da pasta do Drive, colava no card e
// escolhia o tipo. Aqui o sistema varre o Drive do cliente (clients.drive_link), acha as pastas de vídeo
// que ainda não têm card e cria os cards em Edição em lote, pelo tipo escolhido:
//   - reels / criativo: um card por pasta (título = nome da pasta, drive_link = a pasta);
//   - story: as pastas marcadas viram UM card de story (pacote); a edição divide depois
//     (POST /api/agent/tasks/:id/deliver-stories, em agentRoutes.mjs).
// Roteiro: se o card não tem roteiro (gravação improvisada ou o roteiro não foi achado pelo nome da
// pasta), o servidor transcreve os brutos (whisper.cpp da VPS, assistant/transcribe.mjs), a IA organiza
// a fala como roteiro (sem inventar nada) e o roteiro novo fica ligado ao card (content_tasks.script_id),
// para o portal mostrar o que foi gravado. Um vídeo por vez, em segundo plano.
//
// Já tem card = algum content_tasks do cliente cita a pasta (drive_link ou descrição), uma pasta de
// dentro dela, ou uma pasta de cima que não seja de organização (mês, REELS, STORY…); ou a pasta já foi
// enviada por esta tela (drive_intake_links, permanente: o pacote de story é apagado quando a edição
// divide os stories, e as pastas não podem voltar para a lista).
//
// Rotas (login de admin, como o resto do módulo Agentes):
//   GET  /api/drive-intake/clients                clientes com pasta no Drive
//   POST /api/drive-intake/scan    { client_id }  varredura: pastas de vídeo com e sem card, roteiros sem card
//   POST /api/drive-intake/ignore  { client_id, folder_ids, ignore }  esconder (ou voltar) pastas da lista
//   POST /api/drive-intake/create  { client_id, content_type, folders: [{ id, script_id }], title?, script_id? }
//                                  cria os cards (da última varredura do cliente); pasta já com card é pulada
//   GET  /api/drive-intake/jobs?client_id=        roteiros sendo montados (transcrição)
//   POST /api/drive-intake/jobs/:taskId/retry     tenta de novo um roteiro que falhou

import crypto from 'node:crypto';
import { normalizeCityValue } from './lib/cityResolution.mjs';
import {
  crawlDrive, videoUnits, driveIdFromLink, driveIdsInText, folderUrl, fileDownloadUrl, matchScript, cleanName,
} from './lib/driveFolders.mjs';
import { addBusinessHours } from './agentRoutes.mjs';

const TYPES = new Set(['reels', 'criativo', 'story']);
const TYPE_LABEL = { reels: 'Reels', criativo: 'Criativo', story: 'Story' };
const SCAN_TTL_MS = 60 * 60 * 1000;
// subpasta de imagem de apoio: não tem fala, não vai para a transcrição (se sobrar algo)
const NO_SPEECH_SUB = /b-?roll|apoio|imagens?|cenas?|drone|paisage|ambiente|fachada/i;
const MAX_FILES_PER_FOLDER = 10;
const MAX_SECONDS_PER_FILE = 240;

const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brDate = (d = new Date()) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d);

export function registerAgentDriveRoutes(app, { pool, verifyUser, isStrictAdmin, transcribeUrl, askAi, crawl = crawlDrive }) {
  // ── Esquema ───────────────────────────────────────────────
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS drive_intake_links (
            folder_id TEXT PRIMARY KEY,
            client_id UUID NOT NULL,
            task_id UUID,
            content_type TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_drive_intake_links_client ON drive_intake_links(client_id)`).catch(() => {});
        await pool.query(`
          CREATE TABLE IF NOT EXISTS drive_intake_ignored (
            client_id UUID NOT NULL,
            folder_id TEXT NOT NULL,
            ignored_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (client_id, folder_id)
          )
        `);
        // status: pendente → transcrevendo → pronto | sem_fala | falhou | sem_whisper
        await pool.query(`
          CREATE TABLE IF NOT EXISTS drive_script_jobs (
            task_id UUID PRIMARY KEY,
            client_id UUID NOT NULL,
            title TEXT NOT NULL,
            content_type TEXT NOT NULL,
            folders JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'pendente',
            error TEXT,
            script_id UUID,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        // o servidor reiniciou no meio de uma transcrição: volta para a fila
        await pool.query(`UPDATE drive_script_jobs SET status = 'pendente', updated_at = now() WHERE status = 'transcrevendo'`);
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }
  ensureSchema().then(() => kickWorker()).catch((error) => console.error('[drive-intake] esquema:', error.message));

  const columnCache = new Map();
  async function hasColumn(table, column) {
    const key = `${table}.${column}`;
    if (columnCache.get(key)) return true;
    const { rowCount } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column]
    ).catch(() => ({ rowCount: 0 }));
    if (rowCount) columnCache.set(key, true);
    return rowCount > 0;
  }

  async function requireAdmin(req) {
    const { user } = await verifyUser(req);
    if (!(await isStrictAdmin(user))) throw Object.assign(new Error('Apenas administradores'), { status: 403 });
    await ensureSchema();
    return user;
  }

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) console.error('[drive-intake] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function loadClient(clientId) {
    const { rows } = await pool.query(
      `SELECT id, company_name, city, drive_link, whatsapp FROM clients WHERE id = $1`, [clientId]
    );
    if (!rows[0]) throw Object.assign(new Error('Cliente não encontrado'), { status: 404 });
    return rows[0];
  }

  /** Ids de Drive já ligados a um card do cliente ou já enviados por esta tela. */
  async function linkedIdsOf(db, clientId) {
    const [{ rows: tasks }, { rows: sent }] = await Promise.all([
      db.query(`SELECT drive_link, description FROM content_tasks WHERE client_id = $1 AND (COALESCE(drive_link, '') <> '' OR description ILIKE '%drive.google%')`, [clientId]),
      db.query(`SELECT folder_id FROM drive_intake_links WHERE client_id = $1`, [clientId]),
    ]);
    const ids = new Set(sent.map((r) => r.folder_id));
    for (const t of tasks) {
      const id = driveIdFromLink(t.drive_link);
      if (id) ids.add(id);
      driveIdsInText(t.description).forEach((x) => ids.add(x));
    }
    return ids;
  }

  /** Roteiros do cliente que ainda não estão em card (candidatos para ligar à pasta). */
  async function freeScriptsOf(db, clientId) {
    const { rows } = await db.query(
      `SELECT s.id, s.title, s.content_format, s.created_at FROM scripts s
        WHERE s.client_id = $1 AND NOT EXISTS (SELECT 1 FROM content_tasks ct WHERE ct.script_id = s.id)
        ORDER BY s.created_at DESC LIMIT 300`,
      [clientId]
    );
    return rows;
  }

  // última varredura de cada cliente: a criação usa as pastas daqui (nome, caminho, vídeos), não as do navegador
  const scans = new Map();

  // ── Rotas ─────────────────────────────────────────────────
  app.get('/api/drive-intake/clients', async (req, res) => {
    try {
      await requireAdmin(req);
      const { rows } = await pool.query(
        `SELECT id, company_name, city, drive_link, logo_url FROM clients
          WHERE COALESCE(drive_link, '') ILIKE '%drive.google%' ORDER BY company_name`
      );
      res.json({ clients: rows.map((c) => ({ ...c, company_name: cleanName(c.company_name) })) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drive-intake/scan', async (req, res) => {
    try {
      await requireAdmin(req);
      const client = await loadClient(req.body?.client_id);
      const rootId = driveIdFromLink(client.drive_link);
      if (!rootId) return res.status(400).json({ error: 'O cliente não tem o link da pasta do Drive no cadastro' });
      let result;
      try {
        result = await crawl(rootId);
      } catch (error) {
        return res.status(422).json({ error: `Não deu para ler o Drive do cliente: ${error.message}` });
      }
      const [linked, scripts, { rows: ignoredRows }] = await Promise.all([
        linkedIdsOf(pool, client.id),
        freeScriptsOf(pool, client.id),
        pool.query(`SELECT folder_id FROM drive_intake_ignored WHERE client_id = $1`, [client.id]),
      ]);
      const ignored = new Set(ignoredRows.map((r) => r.folder_id));
      const units = videoUnits(result, linked).map((u) => {
        const script = u.covered ? null : matchScript(u.name, scripts);
        return { ...u, ignored: ignored.has(u.id), script: script ? { id: script.id, title: script.title } : null };
      });
      scans.set(client.id, { at: Date.now(), units: new Map(units.map((u) => [u.id, u])) });
      res.json({
        client: { id: client.id, company_name: cleanName(client.company_name), drive_link: client.drive_link },
        scanned_at: new Date().toISOString(),
        folders_read: result.folders.size,
        truncated: result.truncated,
        warning: result.error ? `Algumas pastas não abriram: ${result.error}` : null,
        units,
        scripts: scripts.map((s) => ({ id: s.id, title: s.title, content_format: s.content_format, created_at: s.created_at })),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drive-intake/ignore', async (req, res) => {
    try {
      const user = await requireAdmin(req);
      const clientId = req.body?.client_id;
      const ids = Array.isArray(req.body?.folder_ids) ? req.body.folder_ids.map(String).filter((x) => /^[A-Za-z0-9_-]{10,}$/.test(x)) : [];
      if (!clientId || !ids.length) return res.status(400).json({ error: 'Escolha as pastas' });
      if (req.body?.ignore === false) {
        await pool.query(`DELETE FROM drive_intake_ignored WHERE client_id = $1 AND folder_id = ANY($2)`, [clientId, ids]);
      } else {
        await pool.query(
          `INSERT INTO drive_intake_ignored (client_id, folder_id, ignored_by)
           SELECT $1, unnest($2::text[]), $3 ON CONFLICT DO NOTHING`,
          [clientId, ids, user.id]
        );
      }
      res.json({ ok: true, count: ids.length });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drive-intake/create', async (req, res) => {
    let db = null;
    try {
      const user = await requireAdmin(req);
      const type = String(req.body?.content_type || '');
      if (!TYPES.has(type)) return res.status(400).json({ error: 'Tipo deve ser reels, criativo ou story' });
      const client = await loadClient(req.body?.client_id);
      const scan = scans.get(client.id);
      if (!scan || Date.now() - scan.at > SCAN_TTL_MS) {
        return res.status(409).json({ error: 'Faça a varredura do Drive de novo antes de enviar (a última passou de 1 hora)' });
      }
      const picked = (Array.isArray(req.body?.folders) ? req.body.folders : [])
        .map((f) => ({ unit: scan.units.get(String(f?.id || '')), script_id: f?.script_id ? String(f.script_id) : null }))
        .filter((f) => f.unit);
      if (!picked.length) return res.status(400).json({ error: 'Nenhuma pasta da varredura foi escolhida' });

      const { rows: [settings] } = await pool.query(
        `SELECT editing_deadline_hours, editing_deadline_enabled, work_days FROM company_settings LIMIT 1`
      ).catch(() => ({ rows: [] }));
      const editingDeadline = (settings?.editing_deadline_enabled ?? true)
        ? addBusinessHours(new Date(), settings?.editing_deadline_hours ?? 48, settings?.work_days ?? ['segunda', 'terca', 'quarta', 'quinta', 'sexta']).toISOString()
        : null;
      const hasCity = await hasColumn('content_tasks', 'city');
      const scriptsHaveCity = await hasColumn('scripts', 'city');
      const city = normalizeCityValue(client.city) || null;
      const { rows: [profile] } = await pool.query(`SELECT name FROM profiles WHERE id = $1`, [user.id]).catch(() => ({ rows: [] }));
      const who = cleanName(profile?.name || user.email || 'equipe');

      db = await pool.connect();
      await db.query('BEGIN');
      // duas pessoas (ou dois cliques) enviando o mesmo cliente: uma de cada vez, e a segunda vê os cards da primeira
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`drive-intake:${client.id}`]);
      const linked = await linkedIdsOf(db, client.id);
      const free = await freeScriptsOf(db, client.id);
      const freeIds = new Set(free.map((s) => s.id));
      const skipped = [];
      const fresh = [];
      for (const p of picked) {
        if (linked.has(p.unit.id) || p.unit.covered) skipped.push({ id: p.unit.id, name: p.unit.name, reason: 'já tem card' });
        else fresh.push(p);
      }
      const { rows: [{ n: positionBase }] } = await db.query(`SELECT COUNT(*)::int AS n FROM content_tasks WHERE kanban_column = 'edicao'`);

      // um card por pasta (reels/criativo) ou um card para todas (story)
      const groups = type === 'story' && fresh.length ? [fresh] : fresh.map((p) => [p]);
      const created = [];
      const jobs = [];
      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const units = group.map((p) => p.unit);
        let title;
        let driveLink;
        let description;
        let scriptId;
        if (type === 'story') {
          // pasta de cima comum (ex.: "Story 15") só vira o link quando todas as pastas dela foram escolhidas
          const parentId = units[0].parent_id;
          const sameParent = parentId && !units[0].parent_is_organizer && units.every((u) => u.parent_id === parentId);
          const siblings = sameParent ? [...scan.units.values()].filter((u) => u.parent_id === parentId && !u.covered) : [];
          const wholeParent = sameParent && siblings.every((s) => units.some((u) => u.id === s.id));
          title = cleanName(req.body?.title) || (sameParent ? units[0].parent_name : `Stories ${brDate()}`);
          driveLink = wholeParent ? folderUrl(parentId) : units[0].url;
          description = [
            `📂 Pacote de ${units.length} stor${units.length === 1 ? 'y' : 'ies'} criado pelo Severino (entrada do Drive) a pedido de ${who}.`,
            'Cada pasta é um story:',
            ...units.map((u, i) => `${String(i + 1).padStart(2, '0')} ${u.name} — ${u.url}`),
          ].join('\n');
          const chosen = req.body?.script_id ? String(req.body.script_id) : null;
          scriptId = chosen && freeIds.has(chosen) ? chosen : null;
        } else {
          const u = units[0];
          title = u.name;
          driveLink = u.url;
          description = `📂 Criado pelo Severino (entrada do Drive) a pedido de ${who}.\nPasta: ${[...u.path, u.name].join(' / ')}`;
          scriptId = group[0].script_id && freeIds.has(group[0].script_id) ? group[0].script_id : null;
        }
        if (scriptId) freeIds.delete(scriptId);

        const id = crypto.randomUUID();
        await db.query(
          `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, description, script_id, drive_link,
             editing_deadline, created_by, position${hasCity ? ', city' : ''})
           VALUES ($1, $2, $3, $4, 'edicao', $5, $6, $7, $8, $9, $10${hasCity ? ', $11' : ''})`,
          [id, client.id, title.slice(0, 250), type, description, scriptId, driveLink, editingDeadline, user.id, positionBase + g,
            ...(hasCity ? [city] : [])]
        );
        if (scriptId) await db.query(`UPDATE scripts SET recorded = true WHERE id = $1`, [scriptId]);
        await db.query(
          `INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, 'Movido para Edição', $3)`,
          [id, user.id, `Card criado pelo Severino a partir do Drive: ${units.map((u) => u.name).join(', ')}`]
        );
        await db.query(
          `INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, 'editing_started')`,
          [client.id, '✂️ Vídeo em edição', `"${title}" foi enviado para edição.`]
        ).catch(() => {});
        for (const u of units) {
          await db.query(
            `INSERT INTO drive_intake_links (folder_id, client_id, task_id, content_type, created_by) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (folder_id) DO UPDATE SET task_id = EXCLUDED.task_id, content_type = EXCLUDED.content_type`,
            [u.id, client.id, id, type, user.id]
          );
        }
        if (!scriptId) {
          jobs.push([id, client.id, title, type, JSON.stringify(units.map((u) => ({ id: u.id, name: u.name, videos: u.videos }))), user.id]);
        }
        created.push({ id, title, content_type: type, folders: units.map((u) => u.name), script_id: scriptId, script_pending: !scriptId });
      }
      for (const job of jobs) {
        await db.query(
          `INSERT INTO drive_script_jobs (task_id, client_id, title, content_type, folders, created_by)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (task_id) DO NOTHING`,
          job
        );
      }
      await db.query('COMMIT');
      // a próxima varredura mostra estas pastas como "tem card"
      for (const p of fresh) p.unit.covered = true;
      if (jobs.length) kickWorker();
      res.json({ ok: true, created, skipped });
    } catch (error) {
      if (db) await db.query('ROLLBACK').catch(() => {});
      sendError(res, error);
    } finally {
      db?.release();
    }
  });

  app.get('/api/drive-intake/jobs', async (req, res) => {
    try {
      await requireAdmin(req);
      const clientId = req.query.client_id ? String(req.query.client_id) : null;
      const { rows } = await pool.query(
        `SELECT j.task_id, j.title, j.content_type, j.status, j.error, j.script_id, j.attempts, j.created_at, j.updated_at,
                c.company_name AS client_name
           FROM drive_script_jobs j LEFT JOIN clients c ON c.id = j.client_id
          WHERE ($1::uuid IS NULL OR j.client_id = $1::uuid)
            AND (j.status IN ('pendente', 'transcrevendo') OR j.updated_at > now() - interval '3 days')
          ORDER BY j.created_at DESC LIMIT 50`,
        [clientId]
      );
      res.json({ jobs: rows, working: workerRunning });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/drive-intake/jobs/:taskId/retry', async (req, res) => {
    try {
      await requireAdmin(req);
      const { rowCount } = await pool.query(
        `UPDATE drive_script_jobs SET status = 'pendente', error = NULL, updated_at = now()
          WHERE task_id = $1 AND status IN ('falhou', 'sem_fala', 'sem_whisper')`,
        [req.params.taskId]
      );
      if (!rowCount) return res.status(404).json({ error: 'Nada para tentar de novo' });
      kickWorker();
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Roteiro a partir do que foi gravado ───────────────────
  let workerRunning = false;
  async function kickWorker() {
    if (workerRunning) return;
    workerRunning = true;
    try {
      for (;;) {
        const { rows: [job] } = await pool.query(
          `UPDATE drive_script_jobs SET status = 'transcrevendo', attempts = attempts + 1, updated_at = now()
            WHERE task_id = (SELECT task_id FROM drive_script_jobs WHERE status = 'pendente' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING *`
        );
        if (!job) break;
        try {
          const result = await buildScript(job);
          await pool.query(
            `UPDATE drive_script_jobs SET status = $2, error = $3, script_id = $4, updated_at = now() WHERE task_id = $1`,
            [job.task_id, result.status, result.error || null, result.scriptId || null]
          );
        } catch (error) {
          console.error('[drive-intake] roteiro:', error);
          await pool.query(
            `UPDATE drive_script_jobs SET status = 'falhou', error = $2, updated_at = now() WHERE task_id = $1`,
            [job.task_id, String(error?.message || error).slice(0, 500)]
          ).catch(() => {});
        }
      }
    } catch (error) {
      console.error('[drive-intake] fila de roteiros:', error.message);
    } finally {
      workerRunning = false;
    }
  }

  /** Arquivos com fala de uma pasta: sem as subpastas de imagem de apoio (se sobrar algum). */
  function speechFiles(videos) {
    const sorted = [...(videos || [])].sort((a, b) => `${a.sub}/${a.name}`.localeCompare(`${b.sub}/${b.name}`, 'pt-BR', { numeric: true }));
    const talk = sorted.filter((v) => !NO_SPEECH_SUB.test(v.sub || ''));
    return (talk.length ? talk : sorted).slice(0, MAX_FILES_PER_FOLDER);
  }

  async function buildScript(job) {
    const { rows: [task] } = await pool.query(
      `SELECT t.id, t.script_id, t.client_id, t.city, c.company_name FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = $1`,
      [job.task_id]
    ).catch(async () => pool.query(
      `SELECT t.id, t.script_id, t.client_id, NULL AS city, c.company_name FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = $1`,
      [job.task_id]
    ));
    // pacote de story já dividido pela edição: o roteiro vai para os cards filhos
    const { rows: children } = await pool.query(
      `SELECT id FROM content_tasks WHERE parent_task_id = $1 AND script_id IS NULL`, [job.task_id]
    ).catch(() => ({ rows: [] }));
    if (!task && !children.length) return { status: 'falhou', error: 'o card foi apagado' };
    if (task?.script_id) return { status: 'pronto', scriptId: task.script_id };

    const folders = Array.isArray(job.folders) ? job.folders : [];
    const parts = [];
    let reason = null;
    for (const folder of folders) {
      for (const file of speechFiles(folder.videos)) {
        const r = await transcribeUrl(fileDownloadUrl(file.id), { maxSeconds: MAX_SECONDS_PER_FILE });
        if (r.ok) parts.push({ folder: folder.name, file: file.name, text: r.text });
        else if (r.reason === 'sem_whisper') return { status: 'sem_whisper', error: 'o Whisper não está instalado no servidor' };
        else if (r.reason !== 'vazio') reason = r.reason;
      }
    }
    if (!parts.length) {
      return reason ? { status: 'falhou', error: 'não deu para baixar ou transcrever os vídeos do Drive' } : { status: 'sem_fala', error: 'nenhuma fala nos vídeos' };
    }

    const organized = await organize(job, task?.company_name, parts).catch((error) => {
      console.error('[drive-intake] IA do roteiro:', error.message);
      return null;
    });
    const header = `<p><em>Roteiro do que foi gravado, montado pelo Severino: transcrição automática dos brutos do Drive em ${brDate()}${organized ? ', organizada pela IA' : ''}. Confira antes de usar.</em></p>`;
    const body = organized || rawScriptHtml(job, parts);
    const scriptId = crypto.randomUUID();
    const cityCol = task?.city && (await hasColumn('scripts', 'city'));
    await pool.query(
      `INSERT INTO scripts (id, client_id, title, video_type, content_format, content, recorded, created_by${cityCol ? ', city' : ''})
       VALUES ($1, $2, $3, 'institucional', $4, $5, true, $6${cityCol ? ', $7' : ''})`,
      [scriptId, job.client_id, job.title, job.content_type, header + body, job.created_by, ...(cityCol ? [task.city] : [])]
    );
    const ids = [task?.id, ...children.map((c) => c.id)].filter(Boolean);
    await pool.query(`UPDATE content_tasks SET script_id = $1 WHERE id = ANY($2::uuid[]) AND script_id IS NULL`, [scriptId, ids]);
    return { status: 'pronto', scriptId };
  }

  function rawScriptHtml(job, parts) {
    const story = job.content_type === 'story';
    const out = [];
    let lastFolder = null;
    for (const p of parts) {
      if (story && p.folder !== lastFolder) out.push(`<h3>${escapeHtml(p.folder)}</h3>`);
      lastFolder = p.folder;
      out.push(`<p><strong>${escapeHtml(p.file)}</strong></p><p>${escapeHtml(p.text)}</p>`);
    }
    return out.join('');
  }

  /** A IA organiza a fala como roteiro, sem inventar nada. Devolve HTML (mesmo formato dos roteiros) ou null. */
  async function organize(job, clientName, parts) {
    if (!askAi) return null;
    const story = job.content_type === 'story';
    const transcript = parts.map((p) => `### ${story ? `Story "${p.folder}" — ` : ''}arquivo ${p.file}\n${p.text}`).join('\n\n').slice(0, 60000);
    const system = [
      'Você organiza a transcrição automática dos brutos de um vídeo (tomadas gravadas no celular, com repetições, erros e falas de quem está atrás da câmera) como o roteiro do que foi gravado.',
      'Regras: use só o que foi dito; não invente fala, número, preço, data nem cena. Escolha a melhor tomada de cada fala e tire repetições, erros, contagens ("3, 2, 1") e instruções de quem grava.',
      'Mantenha as palavras de quem fala (corrija só erros óbvios da transcrição). Responda só com HTML simples: <h3> para cada parte e <p> para as falas, sem ``` e sem comentários.',
      story
        ? 'É um pacote de stories: um <h3> por story, com o nome da pasta, e as falas dele.'
        : 'Partes: <h3>GANCHO</h3>, <h3>DESENVOLVIMENTO</h3> e <h3>CTA</h3> (se não houver CTA dito, não crie).',
    ].join('\n');
    const user = `Cliente: ${cleanName(clientName) || '—'}\nVídeo: ${job.title} (${TYPE_LABEL[job.content_type] || job.content_type})\n\nTranscrição:\n${transcript}`;
    const answer = await askAi([{ role: 'system', content: system }, { role: 'user', content: user }], { max_tokens: 6000, temperature: 0.2 });
    const html = String(answer || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
    return /<(p|h3)\b/i.test(html) ? html : null;
  }

  return { kickWorker, ensureSchema };
}

// ─── Wallpaper: papel de parede igual em todos os computadores da empresa do cliente ───────────
// A equipe cadastra o cliente, sobe as imagens e escolhe qual vale agora ou a partir de quando.
// O cliente recebe um link (/wallpaper/:token) e instala em cada computador um agente pequeno
// (Windows: PowerShell + Agendador de Tarefas; Mac: bash + LaunchAgent), sem programa de terceiros.
// O agente pergunta ao servidor a cada AGENT_INTERVAL_MIN minutos qual imagem vale e troca o fundo
// quando muda (e de novo se alguém trocar à mão). Cadastro ou computador removido: o agente recebe
// 410 e se desinstala sozinho.
//
// Qual imagem vale: a programação com o início mais recente já passado e sem fim (ou com fim
// ainda à frente). "Aplicar agora" é uma programação que começa agora e não termina; uma com
// fim (ex.: Natal) volta para a anterior quando acaba. Não precisa de cron no servidor.
//
// Rotas da equipe (login + admin + cidade ativa):
//   GET    /api/wallpaper/clients                       clientes da cidade (registered: já tem cadastro)
//   GET    /api/wallpaper/accounts                      cadastros com contadores
//   POST   /api/wallpaper/accounts      { client_id, fit? }
//   GET    /api/wallpaper/accounts/:id                  cadastro, imagens, programações e computadores
//   PATCH  /api/wallpaper/accounts/:id  { fit?, notes? }
//   POST   /api/wallpaper/accounts/:id/token            link novo (o anterior para de instalar; quem já instalou segue)
//   DELETE /api/wallpaper/accounts/:id                  apaga tudo (os agentes se desinstalam)
//   POST   /api/wallpaper/accounts/:id/images   { file_url, title? }
//   DELETE /api/wallpaper/images/:id                    apaga a imagem e as programações dela
//   POST   /api/wallpaper/accounts/:id/schedules { image_id, starts_at?, ends_at? }  sem starts_at: agora
//   DELETE /api/wallpaper/schedules/:id
//   DELETE /api/wallpaper/devices/:id                   tira o computador (o agente se desinstala)
// Rotas públicas (link do cliente e agente):
//   GET  /api/wallpaper/public/:token                   nome do cliente e imagem atual (página do link)
//   GET  /api/wallpaper/install/:token/:kind            kind: windows (.ps1) | windows-bat | mac (.sh)
//   POST /api/wallpaper/agent/register  { token, hostname, os, user, os_version, device_id?, device_secret? }
//   GET  /api/wallpaper/agent/state                     cabeçalhos X-Device-Id e X-Device-Secret
//   POST /api/wallpaper/agent/report    { image_id?, error? }
// ?format=env nas rotas do agente responde chave=valor por linha (o agente do Mac não tem leitor de JSON).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENT_INTERVAL_MIN = 2;
export const AGENT_VERSION = '1';
const ONLINE_WINDOW_MS = AGENT_INTERVAL_MIN * 3 * 60_000;
const FITS = new Set(['fill', 'fit', 'stretch', 'center', 'tile', 'span']);
const OS_VALUES = new Set(['windows', 'mac']);
const MAX_DEVICES_PER_ACCOUNT = 500;
const IMAGE_RE = /\.(png|jpe?g|bmp|webp)(\?|#|$)/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{48}$/;
const AGENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'wallpaper-agent');

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const newToken = () => crypto.randomBytes(24).toString('hex');
const hashSecret = (secret) => crypto.createHash('sha256').update(String(secret)).digest('hex');
const clean = (value, max = 120) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

/** Imagem que vale no instante `now` (programações do cadastro, em qualquer ordem). */
export function activeSchedule(schedules, now = Date.now()) {
  let best = null;
  for (const s of schedules) {
    const start = new Date(s.starts_at).getTime();
    const end = s.ends_at ? new Date(s.ends_at).getTime() : Infinity;
    if (!(start <= now && now < end)) continue;
    if (!best || start > new Date(best.starts_at).getTime()) best = s;
  }
  return best;
}

/** chave=valor por linha (valores sem quebra de linha) */
export function toEnv(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v == null ? '' : String(v).replace(/[\r\n]+/g, ' ')}`)
    .join('\n') + '\n';
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function registerWallpaperRoutes(app, deps) {
  const { pool, verifyUser, isStrictAdmin, resolveActiveCity, cityVisibilityExpression, publicAppUrl, logger = console } = deps;
  const base = String(publicAppUrl || 'https://agenciapulse.tech').replace(/\/+$/, '');
  const absoluteUrl = (url) => (String(url || '').startsWith('/') ? `${base}${url}` : String(url || ''));

  // ── Esquema (aditivo, idempotente) ──
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = createSchema().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  async function createSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallpaper_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL UNIQUE,
        token TEXT NOT NULL UNIQUE,
        fit TEXT NOT NULL DEFAULT 'fill',
        notes TEXT NOT NULL DEFAULT '',
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallpaper_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES wallpaper_accounts(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        file_url TEXT NOT NULL,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallpaper_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES wallpaper_accounts(id) ON DELETE CASCADE,
        image_id UUID NOT NULL REFERENCES wallpaper_images(id) ON DELETE CASCADE,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (ends_at IS NULL OR ends_at > starts_at)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallpaper_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES wallpaper_accounts(id) ON DELETE CASCADE,
        secret_hash TEXT NOT NULL,
        hostname TEXT NOT NULL DEFAULT '',
        os TEXT NOT NULL DEFAULT '',
        os_version TEXT NOT NULL DEFAULT '',
        os_user TEXT NOT NULL DEFAULT '',
        agent_version TEXT NOT NULL DEFAULT '',
        last_seen_at TIMESTAMPTZ,
        applied_image_id UUID,
        applied_at TIMESTAMPTZ,
        last_error TEXT,
        last_error_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallpaper_images_account ON wallpaper_images (account_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallpaper_schedules_account ON wallpaper_schedules (account_id, starts_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallpaper_devices_account ON wallpaper_devices (account_id)`);
  }

  // ── Acesso da equipe: admin, cadastro de cliente da cidade ativa ──
  async function requireAdmin(req) {
    const { user } = await verifyUser(req);
    if (!(await isStrictAdmin(user))) throw httpError(403, 'Só administradores usam o módulo Wallpaper');
    await ensureSchema();
    const city = await resolveActiveCity(req, user.id, user);
    return { user, city };
  }

  async function loadAccount(id, city) {
    if (!isUuid(id)) throw httpError(404, 'Cadastro não encontrado');
    const { rows } = await pool.query(
      `SELECT a.*, c.company_name, c.logo_url, c.color
         FROM wallpaper_accounts a JOIN clients c ON c.id = a.client_id
        WHERE a.id = $1 AND ${cityVisibilityExpression('c.city', '$2')}`,
      [id, city]
    );
    if (!rows[0]) throw httpError(404, 'Cadastro não encontrado');
    return rows[0];
  }

  function sendError(res, error, label) {
    const status = error.status || error.statusCode || (error.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) logger.error(`[wallpaper] ${label}:`, error.message);
    res.status(status).json({ error: status >= 500 ? 'Erro no módulo Wallpaper' : error.message });
  }

  const route = (label, handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendError(res, error, label);
    }
  };

  function linkPath(token) {
    return `/wallpaper/${token}`;
  }

  function deviceView(d, activeImageId, now = Date.now()) {
    const seen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
    return {
      id: d.id,
      hostname: d.hostname,
      os: d.os,
      os_version: d.os_version,
      os_user: d.os_user,
      agent_version: d.agent_version,
      last_seen_at: d.last_seen_at,
      online: seen > 0 && now - seen < ONLINE_WINDOW_MS,
      applied_image_id: d.applied_image_id,
      applied_at: d.applied_at,
      up_to_date: Boolean(activeImageId) && d.applied_image_id === activeImageId,
      last_error: d.last_error,
      last_error_at: d.last_error_at,
      created_at: d.created_at,
    };
  }

  // ── Equipe ──
  app.get('/api/wallpaper/clients', route('clientes', async (req, res) => {
    const { city } = await requireAdmin(req);
    const { rows } = await pool.query(
      `SELECT c.id, c.company_name, c.logo_url, c.color, (a.id IS NOT NULL) AS registered
         FROM clients c LEFT JOIN wallpaper_accounts a ON a.client_id = c.id
        WHERE ${cityVisibilityExpression('c.city', '$1')} AND coalesce(c.status, 'ativo') <> 'cancelado'
        ORDER BY c.company_name`,
      [city]
    );
    res.json({ clients: rows });
  }));

  app.get('/api/wallpaper/accounts', route('cadastros', async (req, res) => {
    const { city } = await requireAdmin(req);
    const { rows } = await pool.query(
      `SELECT a.id, a.client_id, a.fit, a.created_at, c.company_name, c.logo_url, c.color,
              (SELECT count(*)::int FROM wallpaper_devices d WHERE d.account_id = a.id) AS devices,
              (SELECT count(*)::int FROM wallpaper_devices d WHERE d.account_id = a.id AND d.last_seen_at > now() - $2::interval) AS online,
              (SELECT count(*)::int FROM wallpaper_images i WHERE i.account_id = a.id) AS images,
              (SELECT count(*)::int FROM wallpaper_schedules s WHERE s.account_id = a.id AND s.starts_at > now()) AS upcoming
         FROM wallpaper_accounts a JOIN clients c ON c.id = a.client_id
        WHERE ${cityVisibilityExpression('c.city', '$1')}
        ORDER BY c.company_name`,
      [city, `${ONLINE_WINDOW_MS / 1000} seconds`]
    );
    res.json({ accounts: rows });
  }));

  app.post('/api/wallpaper/accounts', route('criar cadastro', async (req, res) => {
    const { user, city } = await requireAdmin(req);
    const clientId = req.body?.client_id;
    const fit = FITS.has(req.body?.fit) ? req.body.fit : 'fill';
    if (!isUuid(clientId)) throw httpError(400, 'Escolha o cliente');
    const { rows: [client] } = await pool.query(
      `SELECT id FROM clients WHERE id = $1 AND ${cityVisibilityExpression('city', '$2')}`,
      [clientId, city]
    );
    if (!client) throw httpError(404, 'Cliente não encontrado nesta cidade');
    const { rows: [created] } = await pool.query(
      `INSERT INTO wallpaper_accounts (client_id, token, fit, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id) DO NOTHING RETURNING id`,
      [clientId, newToken(), fit, user.id]
    );
    if (!created) throw httpError(409, 'Este cliente já tem cadastro no Wallpaper');
    res.status(201).json({ id: created.id });
  }));

  app.get('/api/wallpaper/accounts/:id', route('detalhe', async (req, res) => {
    const { city } = await requireAdmin(req);
    const account = await loadAccount(req.params.id, city);
    const [images, schedules, devices] = await Promise.all([
      pool.query(`SELECT id, title, file_url, created_at FROM wallpaper_images WHERE account_id = $1 ORDER BY created_at DESC`, [account.id]),
      pool.query(`SELECT id, image_id, starts_at, ends_at, created_at FROM wallpaper_schedules WHERE account_id = $1 ORDER BY starts_at DESC`, [account.id]),
      pool.query(`SELECT * FROM wallpaper_devices WHERE account_id = $1 ORDER BY hostname, created_at`, [account.id]),
    ]);
    const active = activeSchedule(schedules.rows);
    const now = Date.now();
    res.json({
      account: {
        id: account.id,
        client_id: account.client_id,
        company_name: account.company_name,
        logo_url: account.logo_url,
        color: account.color,
        fit: account.fit,
        notes: account.notes,
        link_path: linkPath(account.token),
        created_at: account.created_at,
      },
      active_schedule_id: active?.id || null,
      active_image_id: active?.image_id || null,
      images: images.rows.map((i) => ({ ...i, file_url: absoluteUrl(i.file_url) })),
      schedules: schedules.rows.map((s) => ({
        ...s,
        status: s.id === active?.id ? 'ativa'
          : new Date(s.starts_at).getTime() > now ? 'agendada'
          : 'encerrada',
      })),
      devices: devices.rows.map((d) => deviceView(d, active?.image_id, now)),
      agent_interval_min: AGENT_INTERVAL_MIN,
    });
  }));

  app.patch('/api/wallpaper/accounts/:id', route('editar cadastro', async (req, res) => {
    const { city } = await requireAdmin(req);
    const account = await loadAccount(req.params.id, city);
    const fit = FITS.has(req.body?.fit) ? req.body.fit : account.fit;
    const notes = req.body?.notes === undefined ? account.notes : clean(req.body.notes, 2000);
    await pool.query(`UPDATE wallpaper_accounts SET fit = $2, notes = $3, updated_at = now() WHERE id = $1`, [account.id, fit, notes]);
    res.json({ success: true });
  }));

  app.post('/api/wallpaper/accounts/:id/token', route('novo link', async (req, res) => {
    const { city } = await requireAdmin(req);
    const account = await loadAccount(req.params.id, city);
    const token = newToken();
    await pool.query(`UPDATE wallpaper_accounts SET token = $2, updated_at = now() WHERE id = $1`, [account.id, token]);
    res.json({ link_path: linkPath(token) });
  }));

  app.delete('/api/wallpaper/accounts/:id', route('apagar cadastro', async (req, res) => {
    const { city } = await requireAdmin(req);
    const account = await loadAccount(req.params.id, city);
    await pool.query(`DELETE FROM wallpaper_accounts WHERE id = $1`, [account.id]);
    res.json({ success: true });
  }));

  app.post('/api/wallpaper/accounts/:id/images', route('nova imagem', async (req, res) => {
    const { user, city } = await requireAdmin(req);
    const account = await loadAccount(req.params.id, city);
    const fileUrl = clean(req.body?.file_url, 1000);
    const allowed = fileUrl.startsWith(`${base}/uploads/`) || fileUrl.startsWith('/uploads/')
      || (process.env.PUBLIC_UPLOADS_URL && fileUrl.startsWith(String(process.env.PUBLIC_UPLOADS_URL).replace(/\/+$/, '') + '/'));
    if (!allowed) throw httpError(400, 'A imagem precisa ser enviada pelo sistema');
    if (!IMAGE_RE.test(fileUrl)) throw httpError(400, 'Use uma imagem JPG, PNG, BMP ou WEBP');
    const title = clean(req.body?.title, 120);
    const { rows: [image] } = await pool.query(
      `INSERT INTO wallpaper_images (account_id, title, file_url, created_by) VALUES ($1, $2, $3, $4) RETURNING id, title, file_url, created_at`,
      [account.id, title, fileUrl, user.id]
    );
    res.status(201).json({ image: { ...image, file_url: absoluteUrl(image.file_url) } });
  }));

  app.delete('/api/wallpaper/images/:id', route('apagar imagem', async (req, res) => {
    const { city } = await requireAdmin(req);
    if (!isUuid(req.params.id)) throw httpError(404, 'Imagem não encontrada');
    const { rows: [image] } = await pool.query(`SELECT account_id FROM wallpaper_images WHERE id = $1`, [req.params.id]);
    if (!image) throw httpError(404, 'Imagem não encontrada');
    await loadAccount(image.account_id, city);
    await pool.query(`DELETE FROM wallpaper_images WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  }));

  app.post('/api/wallpaper/accounts/:id/schedules', route('programar', async (req, res) => {
    const { user, city } = await requireAdmin(req);
    const account = await loadAccount(req.params.id, city);
    const imageId = req.body?.image_id;
    if (!isUuid(imageId)) throw httpError(400, 'Escolha a imagem');
    const { rows: [image] } = await pool.query(`SELECT id FROM wallpaper_images WHERE id = $1 AND account_id = $2`, [imageId, account.id]);
    if (!image) throw httpError(404, 'Imagem não encontrada neste cadastro');
    const startsAt = req.body?.starts_at ? new Date(req.body.starts_at) : new Date();
    const endsAt = req.body?.ends_at ? new Date(req.body.ends_at) : null;
    if (Number.isNaN(startsAt.getTime())) throw httpError(400, 'Data de início inválida');
    if (endsAt && Number.isNaN(endsAt.getTime())) throw httpError(400, 'Data de fim inválida');
    if (endsAt && endsAt <= startsAt) throw httpError(400, 'O fim precisa ser depois do início');
    if (endsAt && endsAt.getTime() <= Date.now()) throw httpError(400, 'O fim já passou');
    const { rows: [schedule] } = await pool.query(
      `INSERT INTO wallpaper_schedules (account_id, image_id, starts_at, ends_at, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [account.id, imageId, startsAt.toISOString(), endsAt?.toISOString() || null, user.id]
    );
    res.status(201).json({ id: schedule.id });
  }));

  app.delete('/api/wallpaper/schedules/:id', route('apagar programação', async (req, res) => {
    const { city } = await requireAdmin(req);
    if (!isUuid(req.params.id)) throw httpError(404, 'Programação não encontrada');
    const { rows: [schedule] } = await pool.query(`SELECT account_id FROM wallpaper_schedules WHERE id = $1`, [req.params.id]);
    if (!schedule) throw httpError(404, 'Programação não encontrada');
    await loadAccount(schedule.account_id, city);
    await pool.query(`DELETE FROM wallpaper_schedules WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  }));

  app.delete('/api/wallpaper/devices/:id', route('remover computador', async (req, res) => {
    const { city } = await requireAdmin(req);
    if (!isUuid(req.params.id)) throw httpError(404, 'Computador não encontrado');
    const { rows: [device] } = await pool.query(`SELECT account_id FROM wallpaper_devices WHERE id = $1`, [req.params.id]);
    if (!device) throw httpError(404, 'Computador não encontrado');
    await loadAccount(device.account_id, city);
    await pool.query(`DELETE FROM wallpaper_devices WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  }));

  // ── Link do cliente ──
  async function accountByToken(token) {
    if (!TOKEN_RE.test(String(token || ''))) throw httpError(404, 'Link inválido ou substituído. Peça um novo à agência.');
    await ensureSchema();
    const { rows: [account] } = await pool.query(
      `SELECT a.id, a.token, a.fit, c.company_name, c.logo_url
         FROM wallpaper_accounts a JOIN clients c ON c.id = a.client_id WHERE a.token = $1`,
      [token]
    );
    if (!account) throw httpError(404, 'Link inválido ou substituído. Peça um novo à agência.');
    return account;
  }

  async function activeImage(accountId) {
    const { rows } = await pool.query(
      `SELECT s.id, s.image_id, s.starts_at, s.ends_at, i.file_url, i.title
         FROM wallpaper_schedules s JOIN wallpaper_images i ON i.id = s.image_id
        WHERE s.account_id = $1 AND s.starts_at <= now() AND (s.ends_at IS NULL OR s.ends_at > now())
        ORDER BY s.starts_at DESC LIMIT 1`,
      [accountId]
    );
    return rows[0] || null;
  }

  app.get('/api/wallpaper/public/:token', route('link público', async (req, res) => {
    const account = await accountByToken(req.params.token);
    const [image, devices] = await Promise.all([
      activeImage(account.id),
      pool.query(`SELECT count(*)::int AS n FROM wallpaper_devices WHERE account_id = $1`, [account.id]),
    ]);
    res.json({
      client_name: account.company_name,
      logo_url: account.logo_url,
      current_image_url: image ? absoluteUrl(image.file_url) : null,
      devices: devices.rows[0].n,
      agent_interval_min: AGENT_INTERVAL_MIN,
    });
  }));

  function agentTemplate(name) {
    return fs.readFileSync(path.join(AGENT_DIR, name), 'utf8');
  }

  app.get('/api/wallpaper/install/:token/:kind', route('instalador', async (req, res) => {
    const account = await accountByToken(req.params.token);
    const apiBase = `${base}/api`;
    const fill = (text) => text
      .replaceAll('{{API_BASE}}', apiBase)
      .replaceAll('{{TOKEN}}', account.token)
      .replaceAll('{{INTERVAL_MIN}}', String(AGENT_INTERVAL_MIN))
      .replaceAll('{{AGENT_VERSION}}', AGENT_VERSION);
    res.set('Cache-Control', 'no-store');
    if (req.params.kind === 'windows') {
      const agent = Buffer.from(agentTemplate('agent-windows.ps1'), 'utf8').toString('base64');
      const script = fill(agentTemplate('install-windows.ps1')).replace('{{AGENT_PS1_B64}}', agent);
      res.type('text/plain; charset=utf-8').send(script);
    } else if (req.params.kind === 'windows-bat') {
      const url = `${apiBase}/wallpaper/install/${account.token}/windows`;
      const bat = fill(agentTemplate('install-windows.bat')).replace('{{INSTALL_URL}}', url).replace(/\r?\n/g, '\r\n');
      res.set('Content-Disposition', 'attachment; filename="Instalar-Wallpaper.bat"');
      res.type('application/octet-stream').send(bat);
    } else if (req.params.kind === 'mac') {
      const agent = Buffer.from(agentTemplate('agent-mac.sh'), 'utf8').toString('base64');
      const script = fill(agentTemplate('install-mac.sh')).replace('{{AGENT_SH_B64}}', agent);
      res.type('text/plain; charset=utf-8').send(script);
    } else {
      throw httpError(404, 'Instalador não encontrado');
    }
  }));

  // ── Agente ──
  function agentSend(req, res, status, payload) {
    if (req.query.format === 'env') return res.status(status).type('text/plain; charset=utf-8').send(toEnv(payload));
    return res.status(status).json(payload);
  }

  const agentRoute = (label, handler) => async (req, res) => {
    try {
      await ensureSchema();
      await handler(req, res);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) logger.error(`[wallpaper] agente ${label}:`, error.message);
      agentSend(req, res, status, { error: status >= 500 ? 'Erro no servidor' : error.message });
    }
  };

  async function deviceFromHeaders(req) {
    const id = req.get('x-device-id');
    const secret = req.get('x-device-secret');
    if (!isUuid(id) || !secret) throw httpError(401, 'Computador sem identificação');
    const { rows: [device] } = await pool.query(`SELECT * FROM wallpaper_devices WHERE id = $1`, [id]);
    // Removido (ou cadastro apagado): 410 faz o agente se desinstalar
    if (!device) throw httpError(410, 'Computador removido');
    const given = Buffer.from(hashSecret(secret));
    const stored = Buffer.from(device.secret_hash);
    if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) throw httpError(401, 'Identificação inválida');
    return device;
  }

  app.post('/api/wallpaper/agent/register', agentRoute('registro', async (req, res) => {
    const body = req.body || {};
    const account = await accountByToken(body.token);
    const os = OS_VALUES.has(body.os) ? body.os : '';
    if (!os) throw httpError(400, 'Sistema não suportado');
    const fields = [clean(body.hostname), os, clean(body.os_version), clean(body.user), clean(body.agent_version, 20)];

    // Reinstalação no mesmo computador: reaproveita o registro em vez de duplicar
    if (isUuid(body.device_id) && body.device_secret) {
      const { rows: [existing] } = await pool.query(
        `SELECT id FROM wallpaper_devices WHERE id = $1 AND account_id = $2 AND secret_hash = $3`,
        [body.device_id, account.id, hashSecret(body.device_secret)]
      );
      if (existing) {
        await pool.query(
          `UPDATE wallpaper_devices SET hostname = $2, os = $3, os_version = $4, os_user = $5, agent_version = $6, last_seen_at = now() WHERE id = $1`,
          [existing.id, ...fields]
        );
        return agentSend(req, res, 200, { device_id: existing.id, device_secret: body.device_secret, interval_min: AGENT_INTERVAL_MIN });
      }
    }

    const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM wallpaper_devices WHERE account_id = $1`, [account.id]);
    if (n >= MAX_DEVICES_PER_ACCOUNT) throw httpError(429, 'Limite de computadores atingido');
    const secret = crypto.randomBytes(32).toString('hex');
    const { rows: [device] } = await pool.query(
      `INSERT INTO wallpaper_devices (account_id, secret_hash, hostname, os, os_version, os_user, agent_version, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
      [account.id, hashSecret(secret), ...fields]
    );
    agentSend(req, res, 201, { device_id: device.id, device_secret: secret, interval_min: AGENT_INTERVAL_MIN });
  }));

  app.get('/api/wallpaper/agent/state', agentRoute('estado', async (req, res) => {
    const device = await deviceFromHeaders(req);
    const agentVersion = clean(req.get('x-agent-version'), 20);
    await pool.query(
      `UPDATE wallpaper_devices SET last_seen_at = now(), agent_version = coalesce(nullif($2, ''), agent_version) WHERE id = $1`,
      [device.id, agentVersion]
    );
    const { rows: [account] } = await pool.query(`SELECT fit FROM wallpaper_accounts WHERE id = $1`, [device.account_id]);
    const image = await activeImage(device.account_id);
    agentSend(req, res, 200, {
      image_id: image?.image_id || '',
      url: image ? absoluteUrl(image.file_url) : '',
      fit: account?.fit || 'fill',
      interval_min: AGENT_INTERVAL_MIN,
    });
  }));

  app.post('/api/wallpaper/agent/report', agentRoute('relatório', async (req, res) => {
    const device = await deviceFromHeaders(req);
    const imageId = isUuid(req.body?.image_id) ? req.body.image_id : null;
    const error = clean(req.body?.error, 500);
    if (error) {
      await pool.query(`UPDATE wallpaper_devices SET last_error = $2, last_error_at = now(), last_seen_at = now() WHERE id = $1`, [device.id, error]);
    } else if (imageId) {
      await pool.query(
        `UPDATE wallpaper_devices SET applied_image_id = $2, applied_at = now(), last_error = NULL, last_error_at = NULL, last_seen_at = now() WHERE id = $1`,
        [device.id, imageId]
      );
    }
    agentSend(req, res, 200, { success: true });
  }));

  // cria as tabelas logo ao subir (as rotas também garantem, caso o banco esteja fora no início)
  ensureSchema().catch((error) => logger.error('[wallpaper] esquema:', error.message));

  return { ensureSchema };
}

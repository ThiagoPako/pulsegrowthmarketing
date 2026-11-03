// ─── Storymaker de evento (usuário, 03/11/2026) ─────────────────────────────────────────────────────────────────────
// "Às vezes fazemos eventos e tem storymaker: no módulo de agendamentos eu crio o storymaker, ele gera um link para uma
// página externa que eu compartilho com outras pessoas, e ali dá para postar story em tempo real, rápido."
// Regras (usuário, 03/11/2026):
//  - quem posta é da equipe Pulse (login e senha do sistema) ou um convidado cadastrado ao gerar o link (cada convidado
//    tem o próprio link pessoal, /story/<token>?c=<código>); sem um dos dois, a página não deixa postar nem ver;
//  - a página mostra a logo do cliente ou a logo do evento;
//  - serve também para quem contrata só o evento (cliente com status 'evento', criado aqui mesmo);
//  - auditoria: cada story guarda quem postou (equipe ou convidado), quando, IP e aparelho, e o histórico do evento pode
//    ser buscado depois, mesmo com o link encerrado.
// Cada envio vira um story na fila normal (scheduled_posts, na hora): o robô ajusta a 9:16 sem cortar (lib/imageFit.mjs)
// e publica pelas contas do cliente.
//   GET  /api/storymaker?client_id=&q=              (equipe)   eventos (filtra por cliente e busca por evento/cliente/pessoa)
//   POST /api/storymaker                            (equipe)   { client_id, title, networks[], hours, logo_url, guests[] }
//   POST /api/storymaker/:id/close                  (equipe)   encerra o link
//   POST /api/storymaker/:id/guests                 (equipe)   { name, phone } cadastra convidado
//   POST /api/storymaker/guests/:guestId/revoke     (equipe)   tira o acesso do convidado
//   GET  /api/storymaker/:id/history?q=             (equipe)   auditoria: quem postou o quê
//   POST /api/storymaker/event-client               (equipe)   { name, logo_url } cliente só de evento
//   GET  /api/public/storymaker/:token?c=           (público)  evento; com acesso (login ou convite), os stories
//   POST /api/public/storymaker/:token/upload?c=    (público)  arquivo (foto ou vídeo) → story na fila, na hora

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STORY_NETWORKS = ['instagram', 'facebook'];
const MAX_POSTS = 150; // por evento
const MIN_GAP_MS = 8000; // entre dois envios da mesma pessoa (rajada de stories é sinal de spam)
const MAX_PER_HOUR = 30; // stories do storymaker por cliente em 1 hora (auditoria anti-bloqueio, 03/11/2026)
const MAX_GUESTS = 30;

export const tokenOk = (t) => /^[A-Za-z0-9_-]{20,40}$/.test(String(t || ''));
export const codeOk = (c) => /^[A-Za-z0-9_-]{10,40}$/.test(String(c || ''));
export const clampHours = (h) => Math.min(72, Math.max(1, Math.round(Number(h) || 12)));
export const pickNetworks = (list, connected) => STORY_NETWORKS.filter((n) => (list || []).includes(n) && connected.includes(n));
export const cleanPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return null;
  return d.length <= 11 ? `55${d}` : d;
};
/** Convidados válidos da lista do formulário (nome obrigatório, telefone opcional, sem repetir). */
export function cleanGuests(list) {
  const out = [];
  for (const g of Array.isArray(list) ? list : []) {
    const name = String(g?.name || '').trim().slice(0, 60);
    if (name.length < 2) continue;
    const phone = cleanPhone(g?.phone);
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase() && o.phone === phone)) continue;
    out.push({ name, phone });
  }
  return out.slice(0, MAX_GUESTS);
}

export function createStorymaker({ pool, prepareScheduledPost, ensureSocialPostsSchema, appBase = 'https://agenciapulse.tech', logger = console }) {
  let ready = null;
  const ensure = () => (ready ||= (async () => {
    await ensureSocialPostsSchema();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS storymaker_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token text UNIQUE NOT NULL,
        client_id uuid NOT NULL,
        title text NOT NULL,
        networks text[] NOT NULL,
        logo_url text,
        expires_at timestamptz NOT NULL,
        closed_at timestamptz,
        closed_by uuid,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS storymaker_guests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        link_id uuid NOT NULL REFERENCES storymaker_links(id) ON DELETE CASCADE,
        name text NOT NULL,
        phone text,
        code text UNIQUE NOT NULL,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS storymaker_posts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        link_id uuid NOT NULL REFERENCES storymaker_links(id) ON DELETE CASCADE,
        post_id uuid,
        author_kind text NOT NULL,
        user_id uuid,
        guest_id uuid,
        author text,
        media_url text NOT NULL,
        ip text,
        user_agent text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS storymaker_posts_link ON storymaker_posts (link_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS storymaker_guests_link ON storymaker_guests (link_id);
    `);
  })().catch((e) => { ready = null; throw e; }));

  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const linkUrl = (token) => `${appBase}/story/${token}`;
  const guestUrl = (token, code) => `${appBase}/story/${token}?c=${code}`;
  const isOpen = (l) => !l.closed_at && new Date(l.expires_at) > new Date();

  async function connectedNetworks(clientId) {
    const { rows } = await pool.query(
      `SELECT DISTINCT platform FROM social_accounts WHERE client_id = $1 AND (access_token IS NOT NULL OR api_base = 'upload_post')
         AND coalesce(status, 'connected') NOT IN ('disconnected', 'reauth')`, [clientId]
    );
    return rows.map((r) => r.platform);
  }

  async function insertGuests(linkId, token, guests, userId) {
    const out = [];
    for (const g of guests) {
      const code = crypto.randomBytes(12).toString('base64url');
      const { rows: [row] } = await pool.query(
        `INSERT INTO storymaker_guests (link_id, name, phone, code, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, phone, created_at`,
        [linkId, g.name, g.phone, code, userId || null]
      );
      out.push({ ...row, url: guestUrl(token, code), revoked_at: null });
    }
    return out;
  }

  async function guestsOf(linkId, token) {
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.phone, g.code, g.created_at, g.revoked_at,
              (SELECT count(*)::int FROM storymaker_posts p WHERE p.guest_id = g.id) AS posts
         FROM storymaker_guests g WHERE g.link_id = $1 ORDER BY g.created_at`, [linkId]
    );
    return rows.map(({ code, ...g }) => ({ ...g, url: guestUrl(token, code) }));
  }

  /** Cliente só de evento (não é cliente fixo: não entra no Kanban nem na cobrança, que olham os clientes 'ativo'). */
  async function createEventClient({ name, logoUrl, city }) {
    const n = String(name || '').trim().slice(0, 100);
    if (n.length < 2) fail(400, 'Diga o nome de quem contratou o evento');
    const { rows: [c] } = await pool.query(
      `INSERT INTO clients (company_name, status, logo_url, city) VALUES ($1, 'evento', $2, $3) RETURNING id, company_name, logo_url, city`,
      [n, logoUrl || null, ['minacu', 'uruacu'].includes(city) ? city : null]
    );
    return c;
  }

  async function create({ clientId, title, networks, hours, logoUrl, guests, userId }) {
    await ensure();
    const name = String(title || '').trim().slice(0, 80);
    if (!clientId) fail(400, 'Escolha o cliente');
    if (name.length < 2) fail(400, 'Dê um nome ao evento');
    const chosen = pickNetworks(networks, await connectedNetworks(clientId));
    if (!chosen.length) fail(400, 'O cliente precisa ter o Instagram ou o Facebook conectado para postar story.');
    const token = crypto.randomBytes(18).toString('base64url');
    const { rows: [l] } = await pool.query(
      `INSERT INTO storymaker_links (token, client_id, title, networks, logo_url, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' hours')::interval, $7) RETURNING *`,
      [token, clientId, name, chosen, logoUrl || null, String(clampHours(hours)), userId || null]
    );
    const added = await insertGuests(l.id, token, cleanGuests(guests), userId);
    return { ...l, url: linkUrl(token), active: true, guests: added };
  }

  async function addGuest(linkId, guest, userId) {
    await ensure();
    const { rows: [l] } = await pool.query(`SELECT id, token, client_id FROM storymaker_links WHERE id = $1`, [linkId]);
    if (!l) fail(404, 'Evento não encontrado');
    const [g] = cleanGuests([guest]);
    if (!g) fail(400, 'Diga o nome do convidado');
    const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM storymaker_guests WHERE link_id = $1`, [linkId]);
    if (n >= MAX_GUESTS) fail(400, `No máximo ${MAX_GUESTS} convidados por evento`);
    return { client_id: l.client_id, guest: (await insertGuests(l.id, l.token, [g], userId))[0] };
  }

  async function revokeGuest(guestId) {
    await ensure();
    const { rows: [g] } = await pool.query(
      `UPDATE storymaker_guests g SET revoked_at = now() FROM storymaker_links l
        WHERE g.id = $1 AND g.revoked_at IS NULL AND l.id = g.link_id RETURNING l.client_id`, [guestId]
    );
    return g || null;
  }

  /** Eventos para a tela e para a busca do histórico (evento, cliente ou nome de quem postou). */
  async function list({ clientId = null, q = '', city = null }) {
    await ensure();
    const params = [];
    const where = [];
    if (clientId) { params.push(clientId); where.push(`l.client_id = $${params.length}`); }
    if (city) { params.push(city); where.push(`(c.city IS NULL OR lower(c.city) = $${params.length})`); }
    const text = String(q || '').trim().slice(0, 80);
    if (text) {
      params.push(`%${text.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
      const i = params.length;
      where.push(`(l.title ILIKE $${i} OR c.company_name ILIKE $${i}
        OR EXISTS (SELECT 1 FROM storymaker_posts p WHERE p.link_id = l.id AND p.author ILIKE $${i})
        OR EXISTS (SELECT 1 FROM storymaker_guests g WHERE g.link_id = l.id AND g.name ILIKE $${i}))`);
    }
    const { rows } = await pool.query(
      `SELECT l.id, l.token, l.client_id, l.title, l.networks, l.logo_url, l.expires_at, l.closed_at, l.created_at,
              c.company_name AS client_name, c.logo_url AS client_logo, c.status AS client_status, coalesce(nullif(u.display_name, ''), u.name) AS created_by_name,
              (SELECT count(*)::int FROM storymaker_posts p WHERE p.link_id = l.id) AS total,
              (SELECT count(*)::int FROM storymaker_posts p JOIN scheduled_posts s ON s.id = p.post_id WHERE p.link_id = l.id AND s.status = 'publicado') AS published,
              (SELECT count(*)::int FROM storymaker_posts p JOIN scheduled_posts s ON s.id = p.post_id WHERE p.link_id = l.id AND s.status = 'erro') AS failed
         FROM storymaker_links l JOIN clients c ON c.id = l.client_id LEFT JOIN profiles u ON u.id::text = l.created_by::text
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY l.created_at DESC LIMIT 50`, params
    ).catch(async (e) => {
      if (!/profiles/.test(e.message)) throw e;
      // sem a tabela de perfis: segue sem o nome de quem criou
      return pool.query(
        `SELECT l.id, l.token, l.client_id, l.title, l.networks, l.logo_url, l.expires_at, l.closed_at, l.created_at,
                c.company_name AS client_name, c.logo_url AS client_logo, c.status AS client_status, NULL AS created_by_name, 0 AS total, 0 AS published, 0 AS failed
           FROM storymaker_links l JOIN clients c ON c.id = l.client_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.created_at DESC LIMIT 50`, params
      );
    });
    const links = [];
    for (const { token, ...l } of rows) {
      links.push({ ...l, client_name: String(l.client_name || '').trim(), url: linkUrl(token), active: isOpen(l), guests: await guestsOf(l.id, token) });
    }
    return links;
  }

  async function close(id, userId) {
    await ensure();
    const { rows: [l] } = await pool.query(
      `UPDATE storymaker_links SET closed_at = now(), closed_by = $2 WHERE id = $1 AND closed_at IS NULL RETURNING client_id`, [id, userId || null]
    );
    return l || null;
  }

  /** Auditoria do evento: cada story com quem postou, quando, de onde e como terminou. */
  async function history(linkId, q = '') {
    await ensure();
    const { rows: [l] } = await pool.query(`SELECT id, client_id FROM storymaker_links WHERE id = $1`, [linkId]);
    if (!l) fail(404, 'Evento não encontrado');
    const params = [linkId];
    let filter = '';
    const text = String(q || '').trim().slice(0, 80);
    if (text) { params.push(`%${text.replace(/[%_\\]/g, (m) => `\\${m}`)}%`); filter = `AND (p.author ILIKE $2 OR p.ip ILIKE $2)`; }
    const { rows } = await pool.query(
      `SELECT p.id, p.author, p.author_kind, p.user_id, p.guest_id, p.media_url, p.ip, p.user_agent, p.created_at,
              s.status, s.last_error, s.published_at, g.phone AS guest_phone
         FROM storymaker_posts p LEFT JOIN scheduled_posts s ON s.id = p.post_id LEFT JOIN storymaker_guests g ON g.id = p.guest_id
        WHERE p.link_id = $1 ${filter} ORDER BY p.created_at DESC LIMIT 500`, params
    );
    return { client_id: l.client_id, posts: rows };
  }

  async function linkByToken(token, { open = true } = {}) {
    if (!tokenOk(token)) fail(404, 'Link não encontrado');
    await ensure();
    const { rows: [l] } = await pool.query(
      `SELECT l.*, c.company_name, c.logo_url AS client_logo FROM storymaker_links l JOIN clients c ON c.id = l.client_id WHERE l.token = $1`, [token]
    );
    if (!l) fail(404, 'Link não encontrado');
    if (open && l.closed_at) fail(410, 'Este storymaker foi encerrado pela equipe da Pulse.');
    if (open && new Date(l.expires_at) < new Date()) fail(410, 'O horário deste storymaker acabou. Peça um link novo à equipe da Pulse.');
    return l;
  }

  /** Quem está na página: o convidado do código (do evento, sem acesso tirado) ou a equipe logada. */
  async function identify(l, { code, team }) {
    if (code) {
      if (!codeOk(code)) return null;
      const { rows: [g] } = await pool.query(
        `SELECT id, name FROM storymaker_guests WHERE code = $1 AND link_id = $2 AND revoked_at IS NULL`, [code, l.id]
      );
      if (g) return { kind: 'convidado', guestId: g.id, userId: null, name: g.name };
    }
    const member = await team().catch(() => null);
    if (member) return { kind: 'equipe', guestId: null, userId: member.id, name: member.name || 'Equipe Pulse' };
    return null;
  }

  async function page(token, access) {
    const l = await linkByToken(token, { open: false });
    const who = await identify(l, access);
    const base = {
      title: l.title,
      client: { name: String(l.company_name || '').trim(), logo: l.logo_url || l.client_logo || null },
      networks: l.networks,
      expires_at: l.expires_at,
      open: isOpen(l),
      closed_reason: isOpen(l) ? null : l.closed_at ? 'encerrado' : 'vencido',
      who: who ? { kind: who.kind, name: who.name } : null,
      stories: [],
    };
    if (!who) return base;
    const { rows } = await pool.query(
      `SELECT p.id, p.author, p.media_url, p.created_at, s.status, s.last_error
         FROM storymaker_posts p LEFT JOIN scheduled_posts s ON s.id = p.post_id
        WHERE p.link_id = $1 ORDER BY p.created_at DESC LIMIT 40`, [l.id]
    );
    base.stories = rows.map((r) => ({
      id: r.id, author: r.author, media_url: r.media_url, created_at: r.created_at,
      status: r.status === 'publicado' ? 'publicado' : r.status === 'erro' ? 'erro' : r.status === 'cancelado' ? 'cancelado' : 'enviando',
      error: r.status === 'erro' ? String(r.last_error || 'Não foi possível publicar').slice(0, 200) : null,
    }));
    return base;
  }

  /** Confere o acesso antes de gravar o arquivo no disco. */
  async function authorize(token, access) {
    const l = await linkByToken(token);
    const who = await identify(l, access);
    if (!who) fail(403, 'Só a equipe da Pulse ou convidados cadastrados no evento podem postar.');
    return { l, who };
  }

  /** Um envio: vira story na fila, para agora, com a auditoria de quem mandou. */
  async function post({ l, who }, { mediaUrl, ip, userAgent }) {
    const { rows: [stat] } = await pool.query(
      `SELECT (SELECT count(*)::int FROM storymaker_posts WHERE link_id = $1) AS n,
              (SELECT max(created_at) FROM storymaker_posts WHERE link_id = $1 AND (guest_id = $2 OR user_id = $3)) AS at`,
      [l.id, who.guestId, who.userId]
    );
    if (stat.n >= MAX_POSTS) fail(429, `Este storymaker chegou ao limite de ${MAX_POSTS} stories.`);
    if (stat.at && Date.now() - new Date(stat.at).getTime() < MIN_GAP_MS) fail(429, 'Espere alguns segundos entre um story e outro.');
    const { rows: [{ h }] } = await pool.query(
      `SELECT count(*)::int AS h FROM storymaker_posts p JOIN storymaker_links l ON l.id = p.link_id
        WHERE l.client_id = $1 AND p.created_at > now() - interval '1 hour'`, [l.client_id]
    );
    if (h >= MAX_PER_HOUR) fail(429, `Já saíram ${MAX_PER_HOUR} stories na última hora neste perfil. Espere um pouco: muitos stories seguidos fazem o Instagram travar a conta.`);
    const prepared = await prepareScheduledPost({
      client_id: l.client_id, publish_type: 'stories', platforms: l.networks, media_url: mediaUrl, caption: '',
      scheduled_at: new Date().toISOString(),
    });
    const { rows: [s] } = await pool.query(
      `INSERT INTO scheduled_posts (client_id, platform, publish_type, media_url, caption, scheduled_at, created_by, platforms, story_mode)
       VALUES ($1, $2, 'stories', $3, '', now(), $4, $5, 'auto') RETURNING id`,
      [l.client_id, prepared.platform, prepared.urls[0], who.userId || l.created_by, prepared.platforms]
    );
    const { rows: [p] } = await pool.query(
      `INSERT INTO storymaker_posts (link_id, post_id, author_kind, user_id, guest_id, author, media_url, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, created_at`,
      [l.id, s.id, who.kind, who.userId, who.guestId, who.name, prepared.urls[0], String(ip || '').slice(0, 64) || null, String(userAgent || '').slice(0, 300) || null]
    );
    logger.log?.(`[storymaker] ${l.title} (${String(l.company_name).trim()}): story ${s.id} de ${who.name} (${who.kind})`);
    return { id: p.id, author: who.name, media_url: prepared.urls[0], created_at: p.created_at, status: 'enviando', error: null };
  }

  return { ensure, create, createEventClient, addGuest, revokeGuest, list, close, history, page, authorize, post, linkByToken };
}

export function registerStorymakerRoutes(app, {
  storymaker, verifySocialManager, verifyTeamMember, scope = null, publicUploadHandler, uploadRoot, publicUploadsUrl, logger = console,
}) {
  const send = (res, error) => {
    const code = Number(error?.status || error?.statusCode);
    const msg = String(error?.message || '');
    const status = code >= 400 && code < 600 ? code : /unauthori|login|token/i.test(msg) ? 401 : /admin|acesso|permiss/i.test(msg) ? 403 : 500;
    if (status >= 500) logger.error('[storymaker]', error?.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  };
  const guard = (req, clientId) => (scope ? scope.guard(req, clientId) : null);
  const bad = (message, status = 400) => Object.assign(new Error(message), { status });
  const access = (req) => ({ code: String(req.query.c || '').trim(), team: () => verifyTeamMember(req) });

  app.get('/api/storymaker', async (req, res) => {
    try {
      await verifySocialManager(req);
      const clientId = String(req.query.client_id || '') || null;
      if (clientId) await guard(req, clientId);
      const city = scope?.city ? await scope.city(req) : null;
      res.json({ links: await storymaker.list({ clientId, q: req.query.q, city }) });
    } catch (error) { send(res, error); }
  });

  app.post('/api/storymaker', async (req, res) => {
    try {
      const { user } = await verifySocialManager(req);
      const b = req.body || {};
      await guard(req, b.client_id);
      res.json({ link: await storymaker.create({ clientId: b.client_id, title: b.title, networks: b.networks, hours: b.hours, logoUrl: b.logo_url, guests: b.guests, userId: user?.id }) });
    } catch (error) { send(res, error); }
  });

  app.post('/api/storymaker/event-client', async (req, res) => {
    try {
      await verifySocialManager(req);
      const city = scope?.city ? await scope.city(req) : null;
      res.json({ client: await storymaker.createEventClient({ name: req.body?.name, logoUrl: req.body?.logo_url, city }) });
    } catch (error) { send(res, error); }
  });

  app.post('/api/storymaker/guests/:guestId/revoke', async (req, res) => {
    try {
      await verifySocialManager(req);
      const g = await storymaker.revokeGuest(req.params.guestId);
      if (!g) throw bad('Convidado não encontrado', 404);
      res.json({ ok: true });
    } catch (error) { send(res, error); }
  });

  app.post('/api/storymaker/:id/guests', async (req, res) => {
    try {
      const { user } = await verifySocialManager(req);
      const r = await storymaker.addGuest(req.params.id, req.body || {}, user?.id);
      await guard(req, r.client_id);
      res.json({ guest: r.guest });
    } catch (error) { send(res, error); }
  });

  app.post('/api/storymaker/:id/close', async (req, res) => {
    try {
      const { user } = await verifySocialManager(req);
      const l = await storymaker.close(req.params.id, user?.id);
      if (!l) throw bad('Evento não encontrado ou já encerrado', 404);
      res.json({ ok: true });
    } catch (error) { send(res, error); }
  });

  app.get('/api/storymaker/:id/history', async (req, res) => {
    try {
      await verifySocialManager(req);
      const h = await storymaker.history(req.params.id, req.query.q);
      await guard(req, h.client_id);
      res.json({ posts: h.posts });
    } catch (error) { send(res, error); }
  });

  app.get('/api/public/storymaker/:token', async (req, res) => {
    try { res.json(await storymaker.page(req.params.token, access(req))); } catch (error) { send(res, error); }
  });

  app.post('/api/public/storymaker/:token/upload', async (req, res) => {
    let ctx;
    try { ctx = await storymaker.authorize(req.params.token, access(req)); } catch (error) { return send(res, error); }
    req.uploadPublicScope = 'storymaker';
    req.forcedUploadFolder = 'storymaker';
    publicUploadHandler.single('file')(req, res, async (err) => {
      const discard = () => { try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch { /* já saiu */ } };
      try {
        if (err) { discard(); throw Object.assign(err, { status: err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) }); }
        if (!req.file) throw bad('Escolha a foto ou o vídeo');
        if (!/^(image|video)\//i.test(String(req.file.mimetype || ''))) { discard(); throw bad('Envie uma foto ou um vídeo', 415); }
        const relative = path.relative(path.resolve(uploadRoot), req.file.path).split(path.sep).join('/');
        const mediaUrl = `${String(publicUploadsUrl).replace(/\/+$/, '')}/${relative}`;
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
        try {
          res.json({ story: await storymaker.post(ctx, { mediaUrl, ip, userAgent: req.headers['user-agent'] }) });
        } catch (e) { discard(); throw e; }
      } catch (error) { send(res, error); }
    });
  });
}

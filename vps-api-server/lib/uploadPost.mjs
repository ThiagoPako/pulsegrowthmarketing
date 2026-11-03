// ─── Upload-Post: postagem automática pelas redes dos clientes (usuário contratou em 02/11/2026, 25+15 perfis) ────
// "Preciso ativar a API para postar automaticamente no Instagram e Facebook… até a Meta liberar nosso sistema."
// A Upload-Post já tem os apps aprovados nas redes. Cada cliente vira um perfil dela ("pulse-<id do cliente>"), que
// conecta uma conta de cada rede (Instagram, Facebook, TikTok, LinkedIn, YouTube) pela página de conexão deles. As contas
// conectadas viram linhas em social_accounts com api_base = 'upload_post' (sem token: quem publica é a Upload-Post),
// então o agendamento e a fila de postagem continuam os mesmos: publishToClientAccount desvia para publish() daqui.
// Na rede em que o cliente conectou pela Upload-Post, a linha da Meta dessa rede sai (uma conta por rede por cliente).
//
// API: https://api.upload-post.com/api, cabeçalho "Authorization: Apikey <chave>". A chave fica em upload_post_config
// (Conexões Sociais → Upload-Post, só admin) ou no .env (UPLOAD_POST_API_KEY).
//
// Rotas (registerUploadPostRoutes):
//   GET  /api/upload-post/config                 (admin) chave configurada?, plano e perfis usados/limite
//   PUT  /api/upload-post/config { api_key }     (admin) confere a chave na Upload-Post e grava
//   GET  /api/upload-post/clients/:id            (equipe social) redes escolhidas e contas conectadas do cliente
//   POST /api/upload-post/clients/:id/connect { networks? }  link de conexão só das redes marcadas (vale 48 h)
//   POST /api/upload-post/clients/:id/sync       (equipe social) lê as contas conectadas e grava em social_accounts
// A cada 15 min, uma chamada lê todos os perfis e atualiza as contas (o cliente pode ter conectado pelo link).

const BASE = 'https://api.upload-post.com/api';
// google_business: a ficha do Google (postar novidades e responder avaliações, lib/socialHub.mjs)
export const UP_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'google_business'];
const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;

export const profileName = (clientId) => `pulse-${String(clientId).toLowerCase()}`;

/** Conta conectada de um perfil (social_accounts do perfil): objeto com handle; vazio ou null = não conectada. */
export function connectedAccounts(socialAccounts = {}) {
  const out = [];
  for (const platform of UP_PLATFORMS) {
    const a = socialAccounts?.[platform];
    if (!a || typeof a !== 'object') continue;
    const images = a.social_images;
    out.push({
      platform,
      name: String(a.display_name || a.handle || a.username || platform).trim(),
      handle: a.handle ? String(a.handle).replace(/^@/, '') : null,
      picture: typeof images === 'string' ? images : Array.isArray(images) ? images[0] || null : images?.profile || null,
      reauth: !!a.reauth_required,
    });
  }
  return out;
}

/** Campos do envio para uma rede: tipo de mídia, legenda e Página do Facebook. */
export function uploadFields({ platform, publishType, media, caption, facebookPageId, firstComment = null, collaborators = null }) {
  const urls = media.map((m) => m.url);
  const video = urls.length === 1 && VIDEO_RE.test(urls[0]);
  const story = publishType === 'stories';
  const fields = [['platform[]', platform]];
  if (caption) fields.push(['title', caption]);
  if (platform === 'instagram') fields.push(['media_type', story ? 'STORIES' : video ? 'REELS' : 'IMAGE']);
  if (platform === 'facebook') {
    if (caption) fields.push(['facebook_description', caption]);
    fields.push(['facebook_media_type', story ? 'STORIES' : video ? (publishType === 'feed' ? 'VIDEO' : 'REELS') : 'POSTS']);
    if (facebookPageId) fields.push(['facebook_page_id', facebookPageId]);
  }
  if (platform === 'linkedin' && caption) fields.push(['linkedin_description', caption]);
  if (platform === 'youtube') {
    fields.push(['youtube_title', (caption || 'Vídeo').split('\n')[0].slice(0, 95)]);
    if (caption) fields.push(['youtube_description', caption]);
  }
  if (platform === 'tiktok') fields.push(['privacy_level', 'PUBLIC_TO_EVERYONE']);
  // primeiro comentário (link do WhatsApp, hashtags…) e Collab no Instagram; story não leva
  if (firstComment && !story) fields.push([`${platform}_first_comment`, firstComment]);
  if (collaborators && platform === 'instagram' && !story) fields.push(['collaborators', collaborators]);
  if (video) fields.push(['video', urls[0]]);
  else for (const u of urls) fields.push(['photos[]', u]);
  return { endpoint: video ? '/upload' : '/upload_photos', fields };
}

export function createUploadPost({ pool, appBase = 'https://agenciapulse.tech', fetchImpl = fetch, logger = console, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS upload_post_config (
          id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          api_key TEXT,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS client_upload_post (
          client_id UUID PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          facebook_page_id TEXT,
          facebook_pages JSONB,
          synced_at TIMESTAMPTZ
        );
        -- redes que a Pulse cuida do cliente (cadastro do cliente, 02/11/2026): o link pede login só nelas
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_networks TEXT[];
      `).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }

  async function apiKey() {
    await ensureSchema();
    const { rows: [c] } = await pool.query(`SELECT api_key FROM upload_post_config WHERE id = 1`);
    return String(c?.api_key || process.env.UPLOAD_POST_API_KEY || '').trim();
  }

  async function saveKey(key, userId) {
    await ensureSchema();
    await pool.query(
      `INSERT INTO upload_post_config (id, api_key, updated_by, updated_at) VALUES (1, $1, $2, now())
       ON CONFLICT (id) DO UPDATE SET api_key = EXCLUDED.api_key, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, userId || null]
    );
  }

  async function call(method, path, { json, form, key, headers = {} } = {}) {
    const k = key || await apiKey();
    if (!k) throw Object.assign(new Error('Upload-Post sem chave: cole a chave em Conexões Sociais → Upload-Post.'), { status: 409 });
    const init = { method, headers: { Authorization: `Apikey ${k}`, ...headers } };
    if (json) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(json); }
    if (form) init.body = form;
    const r = await fetchImpl(/^https:\/\//.test(path) ? path : `${BASE}${path}`, init);
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body?.success === false) {
      const msg = body?.message || body?.error || `Upload-Post respondeu ${r.status}`;
      throw Object.assign(new Error(String(msg)), { status: r.status, body });
    }
    return body;
  }

  async function clientRow(clientId) {
    const { rows: [c] } = await pool.query(`SELECT id, company_name FROM clients WHERE id = $1`, [clientId]);
    if (!c) throw Object.assign(new Error('Cliente não encontrado'), { status: 404 });
    return c;
  }

  /** Cria o perfil do cliente na Upload-Post (uma vez) e guarda o nome dele. */
  async function ensureProfile(clientId) {
    await ensureSchema();
    const client = await clientRow(clientId);
    const username = profileName(clientId);
    try {
      await call('GET', `/uploadposts/users/${encodeURIComponent(username)}`);
    } catch (error) {
      if (error.status !== 404) throw error;
      await call('POST', '/uploadposts/users', { json: { username, display_name: String(client.company_name || '').trim().slice(0, 100) || username } });
    }
    await pool.query(
      `INSERT INTO client_upload_post (client_id, username) VALUES ($1, $2) ON CONFLICT (client_id) DO NOTHING`, [clientId, username]
    );
    return { client, username };
  }

  /** Link da página de conexão da Upload-Post (em português, com a Pulse), para a equipe ou o cliente. */
  async function connectLink(clientId, networks = null) {
    const { client, username } = await ensureProfile(clientId);
    if (Array.isArray(networks)) {
      const chosen = UP_PLATFORMS.filter((p) => networks.includes(p));
      if (!chosen.length) throw Object.assign(new Error('Marque pelo menos uma rede.'), { status: 400 });
      await pool.query(`UPDATE clients SET social_networks = $2 WHERE id = $1`, [clientId, chosen]);
    }
    const { rows: [saved] } = await pool.query(`SELECT social_networks FROM clients WHERE id = $1`, [clientId]);
    const platforms = (saved?.social_networks || []).filter((p) => UP_PLATFORMS.includes(p));
    const name = String(client.company_name || '').trim();
    const r = await call('POST', '/uploadposts/users/generate-jwt', {
      json: {
        username,
        redirect_url: `${appBase}/`,
        redirect_button_text: 'Pronto, voltar',
        logo_image: `${appBase}/pulse-logo.png`,
        connect_title: `Conecte as redes de ${name}`.slice(0, 120),
        connect_description: 'Entre em cada rede que a Pulse vai cuidar. É seguro: a gente só publica os conteúdos que você aprovou.',
        platforms: platforms.length ? platforms : UP_PLATFORMS,
        show_calendar: false,
        language: 'pt',
      },
    });
    return { url: r.access_url, expires_hours: 48, networks: platforms.length ? platforms : UP_PLATFORMS };
  }

  /** Páginas do Facebook do perfil: com uma só, é ela; com várias, mantém a escolhida antes (ou nenhuma, e avisa). */
  async function facebookPage(username, current) {
    const r = await call('GET', `/uploadposts/facebook/pages?profile=${encodeURIComponent(username)}`).catch(() => ({ pages: [] }));
    const pages = (r.pages || []).map((p) => ({ id: String(p.page_id), name: p.page_name }));
    const chosen = pages.length === 1 ? pages[0].id : pages.find((p) => p.id === current)?.id || null;
    return { pages, chosen };
  }

  /** Grava as contas conectadas de um perfil em social_accounts (api_base = 'upload_post'). */
  async function applyProfile(clientId, username, socialAccounts) {
    const accounts = connectedAccounts(socialAccounts);
    const { rows: [saved] } = await pool.query(`SELECT facebook_page_id FROM client_upload_post WHERE client_id = $1`, [clientId]);
    let fb = { pages: [], chosen: null };
    if (accounts.some((a) => a.platform === 'facebook')) fb = await facebookPage(username, saved?.facebook_page_id);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // rede desconectada na Upload-Post: a linha dela sai
      await db.query(
        `DELETE FROM social_accounts WHERE client_id = $1 AND api_base = 'upload_post' AND NOT (platform = ANY($2::text[]))`,
        [clientId, accounts.map((a) => a.platform)]
      );
      for (const a of accounts) {
        // uma conta por rede: a conexão da Upload-Post substitui a da Meta naquela rede
        await db.query(`DELETE FROM social_accounts WHERE client_id = $1 AND platform = $2`, [clientId, a.platform]);
        await db.query(
          `INSERT INTO social_accounts (client_id, platform, facebook_page_id, account_name, username, profile_picture_url, access_token, status, api_base)
           VALUES ($1, $2, $3, $4, $5, $6, '', $7, 'upload_post')`,
          [clientId, a.platform, a.platform === 'facebook' ? fb.chosen : null, a.name, a.handle, a.picture, a.reauth ? 'reauth' : 'connected']
        );
      }
      await db.query(
        `UPDATE client_upload_post SET facebook_page_id = $2, facebook_pages = $3, synced_at = now() WHERE client_id = $1`,
        [clientId, fb.chosen, JSON.stringify(fb.pages)]
      );
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      db.release();
    }
    return { accounts, facebook_pages: fb.pages, facebook_page_id: fb.chosen };
  }

  async function sync(clientId) {
    const { username } = await ensureProfile(clientId);
    const r = await call('GET', `/uploadposts/users/${encodeURIComponent(username)}`);
    return applyProfile(clientId, username, r.profile?.social_accounts || {});
  }

  /** Todos os perfis numa chamada só (a cada 15 min). */
  async function syncAll() {
    if (!(await apiKey())) return 0;
    const { rows } = await pool.query(`SELECT client_id, username FROM client_upload_post`);
    if (!rows.length) return 0;
    const r = await call('GET', '/uploadposts/users');
    const byName = new Map((r.profiles || []).map((p) => [p.username, p]));
    let n = 0;
    for (const row of rows) {
      const p = byName.get(row.username);
      if (!p) continue;
      await applyProfile(row.client_id, row.username, p.social_accounts || {}).catch((error) => logger.error('[upload-post] sync:', row.username, error.message));
      n += 1;
    }
    return n;
  }

  /** Para o cadastro do cliente: redes escolhidas e as contas já conectadas pela Upload-Post. */
  async function clientInfo(clientId) {
    await ensureSchema();
    const { rows: [c] } = await pool.query(`SELECT social_networks FROM clients WHERE id = $1`, [clientId]);
    const { rows: accounts } = await pool.query(
      `SELECT platform, account_name, username, status FROM social_accounts WHERE client_id = $1 AND api_base = 'upload_post' ORDER BY platform`, [clientId]
    );
    return { networks: c?.social_networks || [], accounts, configured: !!(await apiKey()) };
  }

  async function status(key) {
    const r = await call('GET', '/uploadposts/users', { key });
    return { plan: r.plan || null, limit: r.limit ?? null, used: (r.profiles || []).length };
  }

  /**
   * Publica um post da fila numa conta conectada pela Upload-Post. Espera o resultado (o envio vira assíncrono depois de
   * ~59 s: acompanha pelo request_id por até 10 min). Idempotency-Key por post e rede: nova tentativa não duplica.
   */
  async function publish(account, post, media, { maxWaitMs = 10 * 60_000 } = {}) {
    const { rows: [cp] } = await pool.query(`SELECT username FROM client_upload_post WHERE client_id = $1`, [post.client_id]);
    if (!cp) throw new Error('Cliente sem perfil na Upload-Post. Conecte as redes em Conexões Sociais.');
    if (account.platform === 'facebook' && !account.facebook_page_id) {
      throw new Error('Facebook conectado sem Página escolhida. Em Conexões Sociais, clique em Atualizar no cliente.');
    }
    const { endpoint, fields } = uploadFields({
      platform: account.platform, publishType: post.publish_type, media, caption: post.caption || '', facebookPageId: account.facebook_page_id,
      firstComment: post.first_comment || null, collaborators: post.collaborators || null,
    });
    const requestId = `pulse-${post.id}-${account.platform}-${(post.attempts || 0) + 1}`;
    const form = new FormData();
    form.append('user', cp.username);
    for (const [k, v] of fields) form.append(k, v);
    form.append('request_id', requestId);
    form.append('external_id', String(post.id));
    const r = await call('POST', endpoint, { form, headers: { 'Idempotency-Key': `pulse-${post.id}-${account.platform}` } });
    let result = r.results?.[account.platform];
    if (!result && r.request_id) {
      const until = Date.now() + maxWaitMs;
      while (Date.now() < until) {
        await sleep(10_000);
        const s = await call('GET', `/uploadposts/status?request_id=${encodeURIComponent(r.request_id)}`).catch(() => null);
        if (!s || !['completed', 'failed'].includes(s.status)) continue;
        const item = (s.results || []).find((x) => x.platform === account.platform);
        result = item ? { ...item, error: item.success ? null : item.message } : { error: s.message || 'falhou' };
        break;
      }
      if (!result) throw new Error(`A Upload-Post ainda está publicando (request ${r.request_id}). Confira no histórico deles antes de tentar de novo.`);
    }
    if (!result) throw new Error('A Upload-Post não devolveu o resultado desta rede.');
    if (result.skipped) throw new Error(`${account.platform} não está conectado na Upload-Post.`);
    if (result.error || result.success === false) throw new Error(String(result.error || result.message || 'recusado'));
    return { id: result.post_id || result.platform_post_id || null, url: result.url || result.post_url || null, provider: 'upload_post' };
  }

  return { ensureSchema, apiKey, saveKey, call, ensureProfile, connectLink, clientInfo, sync, syncAll, status, publish };
}

export function registerUploadPostRoutes(app, { uploadPost, verifyAdmin, verifySocialManager, logger = console }) {
  const fail = (res, error) => {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : /unauthori|login|token/i.test(error?.message || '') ? 401 : /admin|acesso|permiss/i.test(error?.message || '') ? 403 : 500;
    if (status >= 500) logger.error('[upload-post]', error?.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  };

  app.get('/api/upload-post/config', async (req, res) => {
    try {
      await verifyAdmin(req);
      const key = await uploadPost.apiKey();
      if (!key) return res.json({ configured: false });
      const s = await uploadPost.status().catch((error) => ({ error: error.message }));
      res.json({ configured: true, key_end: key.slice(-4), ...s });
    } catch (error) { fail(res, error); }
  });

  app.put('/api/upload-post/config', async (req, res) => {
    try {
      const { user } = await verifyAdmin(req);
      const key = String(req.body?.api_key || '').trim();
      if (key.length < 16) throw Object.assign(new Error('Cole a chave da API inteira (Upload-Post → API Keys).'), { status: 400 });
      const s = await uploadPost.status(key).catch((error) => {
        throw Object.assign(new Error(`A Upload-Post não aceitou a chave: ${error.message}`), { status: 400 });
      });
      await uploadPost.saveKey(key, user?.id);
      res.json({ configured: true, key_end: key.slice(-4), ...s });
    } catch (error) { fail(res, error); }
  });

  app.post('/api/upload-post/clients/:id/connect', async (req, res) => {
    try {
      await verifySocialManager(req);
      res.json(await uploadPost.connectLink(req.params.id, Array.isArray(req.body?.networks) ? req.body.networks.map(String) : null));
    } catch (error) { fail(res, error); }
  });

  app.get('/api/upload-post/clients/:id', async (req, res) => {
    try {
      await verifySocialManager(req);
      res.json(await uploadPost.clientInfo(req.params.id));
    } catch (error) { fail(res, error); }
  });

  app.post('/api/upload-post/clients/:id/sync', async (req, res) => {
    try {
      await verifySocialManager(req);
      res.json(await uploadPost.sync(req.params.id));
    } catch (error) { fail(res, error); }
  });

  const timer = setInterval(() => uploadPost.syncAll().catch((error) => logger.error('[upload-post] sync geral:', error.message)), 15 * 60_000);
  timer.unref?.();
}

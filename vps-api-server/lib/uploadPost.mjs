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
//
// Conexão com a cara da Pulse (usuário, 02/11/2026: "conexão transparente… dentro da nossa plataforma não mostrar
// plataforma de terceiros, porque o cliente fica desconfiado"): o link do cliente é nosso (/conectar/<token>, vale 7 dias).
// A página lista as redes marcadas no cadastro; cada "Conectar" pede à Upload-Post o endereço de login oficial da rede
// (Connect API: /uploadposts/oauth/<rede>/start) com a volta para a nossa página, que mostra "Conectado".
//   GET  /api/public/conectar/:token               cliente, redes e o que já está conectado
//   POST /api/public/conectar/:token/start { rede } → { url } do login oficial da rede
//   POST /api/upload-post/clients/:id/connect/send  manda o link no WhatsApp do cliente pelo número da Pulse

import crypto from 'node:crypto';

const BASE = 'https://api.upload-post.com/api';
// google_business: a ficha do Google (postar novidades e responder avaliações, lib/socialHub.mjs)
// threads, x e pinterest (02/11/2026): a página do cliente mostra todas as redes que a Pulse consegue gerenciar
export const UP_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'google_business', 'threads', 'x', 'pinterest'];
const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;

export const profileName = (clientId) => `pulse-${String(clientId).toLowerCase()}`;
// nome da rede na Connect API da Upload-Post (Google com hífen)
const OAUTH_NAME = { instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok', linkedin: 'linkedin', youtube: 'youtube', google_business: 'google-business', threads: 'threads', x: 'x', pinterest: 'pinterest' };

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
  // title é obrigatório na Upload-Post (é a legenda no Instagram/TikTok): post sem legenda vai com um espaço
  fields.push(['title', caption || ' ']);
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
        CREATE TABLE IF NOT EXISTS client_connect_links (
          token TEXT PRIMARY KEY,
          client_id UUID NOT NULL,
          networks TEXT[] NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        -- redes que a Pulse cuida do cliente (cadastro do cliente, 02/11/2026): o link pede login só nelas
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_networks TEXT[];
        -- Facebooks da equipe (03/11/2026): um perfil da Upload-Post por login de Facebook da Pulse, com nome; as páginas
        -- dele são ligadas aos clientes à mão, e o post do cliente sai por esse perfil com o facebook_page_id da página
        CREATE TABLE IF NOT EXISTS upload_post_team_profiles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          username TEXT NOT NULL UNIQUE,
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE client_upload_post ADD COLUMN IF NOT EXISTS facebook_team_profile TEXT;
        -- Google da equipe (04/11/2026, pedido do Thiago): um login do Google (um perfil, um slot) com todas as fichas
        -- que o e-mail administra; cada ficha é ligada a um cliente, inclusive cliente só de monitoramento de avaliações
        ALTER TABLE upload_post_team_profiles ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'facebook';
        CREATE TABLE IF NOT EXISTS google_team_locations (
          location_id TEXT PRIMARY KEY,
          team_profile TEXT NOT NULL,
          title TEXT,
          client_id UUID UNIQUE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        -- um cliente pode ter várias fichas do Google (Thiago, 04/11/2026: "tem cliente que tem várias contas do google")
        ALTER TABLE google_team_locations DROP CONSTRAINT IF EXISTS google_team_locations_client_id_key;
        CREATE INDEX IF NOT EXISTS google_team_locations_client ON google_team_locations (client_id);
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
  /** Link da página de conexão da Pulse (/conectar/<token>, vale 7 dias), só com as redes marcadas no cadastro. */
  async function connectLink(clientId, networks = null) {
    await ensureProfile(clientId);
    if (Array.isArray(networks)) {
      const chosen = UP_PLATFORMS.filter((p) => networks.includes(p));
      if (!chosen.length) throw Object.assign(new Error('Marque pelo menos uma rede.'), { status: 400 });
      await pool.query(`UPDATE clients SET social_networks = $2 WHERE id = $1`, [clientId, chosen]);
    }
    const { rows: [saved] } = await pool.query(`SELECT social_networks FROM clients WHERE id = $1`, [clientId]);
    const platforms = (saved?.social_networks || []).filter((p) => UP_PLATFORMS.includes(p));
    const list = platforms.length ? platforms : ['instagram', 'facebook'];
    const token = crypto.randomBytes(18).toString('base64url');
    await pool.query(
      `INSERT INTO client_connect_links (token, client_id, networks, expires_at) VALUES ($1, $2, $3, now() + interval '7 days')`, [token, clientId, list]
    );
    return { url: `${appBase}/conectar/${token}`, expires_days: 7, networks: list };
  }

  async function linkByToken(token) {
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ''))) throw Object.assign(new Error('Link não encontrado'), { status: 404 });
    await ensureSchema();
    const { rows: [l] } = await pool.query(
      `SELECT l.*, c.company_name, c.logo_url, c.status AS client_status FROM client_connect_links l JOIN clients c ON c.id = l.client_id WHERE l.token = $1`, [token]
    );
    if (!l) throw Object.assign(new Error('Link não encontrado'), { status: 404 });
    if (new Date(l.expires_at) < new Date()) throw Object.assign(new Error('Este link venceu. Peça um novo para a equipe da Pulse.'), { status: 410 });
    return l;
  }

  /** O que a página do cliente mostra (lê as contas na hora, para o "Conectado" aparecer assim que ele volta). */
  async function connectPage(token) {
    const l = await linkByToken(token);
    await sync(l.client_id).catch((error) => logger.warn?.('[conectar] leitura:', error.message));
    const { rows } = await pool.query(
      `SELECT platform, account_name, username, status FROM social_accounts WHERE client_id = $1 AND api_base = 'upload_post'`, [l.client_id]
    );
    return {
      client: { name: String(l.company_name || '').trim(), logo: l.logo_url || null },
      // cliente só de evento (storymaker, 03/11/2026): a página explica que é para os stories do evento
      kind: l.client_status === 'evento' ? 'evento' : 'cliente',
      // primeiro as do plano; depois as outras, apagadas na página, com convite para ampliar o plano (usuário, 02/11/2026)
      networks: [...l.networks, ...UP_PLATFORMS.filter((p) => !l.networks.includes(p))].map((p) => {
        const acc = rows.find((x) => x.platform === p);
        return { id: p, in_plan: l.networks.includes(p), connected: !!acc && acc.status === 'connected', reconnect: acc?.status === 'reauth', account: acc ? acc.username || acc.account_name : null };
      }),
      expires_at: l.expires_at,
    };
  }

  /** Endereço do login oficial da rede, voltando para a nossa página. */
  async function connectStart(token, platform) {
    const l = await linkByToken(token);
    if (!l.networks.includes(platform) || !OAUTH_NAME[platform]) throw Object.assign(new Error('Rede inválida'), { status: 400 });
    const { username } = await ensureProfile(l.client_id);
    const r = await call('POST', `/uploadposts/oauth/${OAUTH_NAME[platform]}/start`, {
      json: { profile: username, redirect_url: `${appBase}/conectar/${token}?rede=${platform}` },
    });
    if (!r.authorize_url) throw Object.assign(new Error('Não deu para abrir o login da rede. Tente de novo.'), { status: 502 });
    return { url: r.authorize_url };
  }

  // Instagram ligado à página (03/11/2026: "páginas que não têm Instagram ativo não devem aparecer"). A resposta da
  // Upload-Post pode trazer o Instagram em campos diferentes: o @ (ou true) quando tem, false quando a resposta diz que
  // não tem, null quando ela não fala nada (aí a tela decide pelo cliente).
  let loggedPageKeys = false;
  function instagramOfPage(p) {
    if (!loggedPageKeys) { loggedPageKeys = true; logger.info?.('[upload-post] campos da página do Facebook:', Object.keys(p || {}).join(',')); }
    const keys = ['instagram_business_account', 'instagram_account', 'connected_instagram_account', 'instagram', 'ig_account', 'instagram_id', 'ig_id', 'instagram_username'];
    const present = keys.filter((k) => Object.prototype.hasOwnProperty.call(p || {}, k));
    if (!present.length) return null;
    for (const k of present) {
      const v = p[k];
      if (!v) continue;
      if (typeof v === 'string') return v.replace(/^@/, '');
      if (typeof v === 'object') return String(v.username || v.name || v.id || true);
      return true;
    }
    return false;
  }

  /** Páginas do Facebook do perfil: com uma só, é ela; com várias, mantém a escolhida antes (ou nenhuma, e avisa). */
  async function facebookPage(username, current) {
    // a resposta veio com nomes de campo diferentes da documentação (03/11/2026: páginas sem nome na tela): aceita os
    // dois formatos e, sem nome, tenta a lista do perfil (/users/facebook-page), que traz nome e foto
    const fields = new Set();
    const norm = (list) => (Array.isArray(list) ? list : []).map((p) => (Object.keys(p || {}).forEach((k) => fields.add(k)), {
      id: String(p.page_id ?? p.id ?? p.facebook_page_id ?? ''),
      profile: p.profile ?? p.profile_username ?? p.user ?? null,
      name: String(p.page_name ?? p.name ?? p.title ?? '').trim(),
      picture: (typeof p.picture === 'string' ? p.picture : p.picture?.data?.url) || p.page_picture || null,
      instagram: instagramOfPage(p),
    })).filter((p) => p.id && p.id !== 'undefined');
    const r = await call('GET', `/uploadposts/facebook/pages?profile=${encodeURIComponent(username)}`).catch(() => ({ pages: [] }));
    let pages = norm(r.pages || r.data);
    if (!pages.length || pages.some((p) => !p.name)) {
      const alt = await call('GET', `/uploadposts/users/facebook-page?profile_username=${encodeURIComponent(username)}`).catch(() => null);
      const altPages = norm(alt?.pages);
      if (altPages.length) pages = altPages;
    }
    // só as páginas DESTE perfil (03/11/2026: "quando eu selecionar o Facebook, apareça apenas as páginas daquele
    // Facebook"); a lista pode vir com as páginas de todos os perfis, cada uma marcada com o perfil dela
    pages = pages.filter((p) => !p.profile || String(p.profile) === String(username))
      .map(({ profile: _profile, ...p }) => ({ ...p, name: p.name || `Página ${p.id}` }));
    const chosen = pages.length === 1 ? pages[0].id : pages.find((p) => p.id === current)?.id || null;
    return { pages, chosen, fields: [...fields].sort() };
  }

  /** Grava as contas conectadas de um perfil em social_accounts (api_base = 'upload_post'). */
  async function applyProfile(clientId, username, socialAccounts) {
    const { rows: [saved] } = await pool.query(`SELECT facebook_page_id, facebook_team_profile FROM client_upload_post WHERE client_id = $1`, [clientId]);
    // Facebook ligado por um Facebook da equipe: fica como está (a página foi escolhida à mão)
    const teamFacebook = !!saved?.facebook_team_profile;
    const accounts = connectedAccounts(socialAccounts).filter((a) => !(teamFacebook && a.platform === 'facebook'));
    let fb = { pages: [], chosen: null };
    if (accounts.some((a) => a.platform === 'facebook')) fb = await facebookPage(username, saved?.facebook_page_id);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // rede desconectada na Upload-Post: a linha dela sai
      await db.query(
        `DELETE FROM social_accounts WHERE client_id = $1 AND api_base = 'upload_post' AND NOT (platform = ANY($2::text[]))`,
        [clientId, [...accounts.map((a) => a.platform), ...(teamFacebook ? ['facebook'] : [])]]
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
      if (teamFacebook) await db.query(`UPDATE client_upload_post SET synced_at = now() WHERE client_id = $1`, [clientId]);
      else await db.query(
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
    const { rows: [c] } = await pool.query(`SELECT social_networks, whatsapp, responsible_person, company_name FROM clients WHERE id = $1`, [clientId]);
    const { rows: accounts } = await pool.query(
      `SELECT platform, account_name, username, status FROM social_accounts WHERE client_id = $1 AND api_base = 'upload_post' ORDER BY platform`, [clientId]
    );
    return { networks: c?.social_networks || [], accounts, configured: !!(await apiKey()), whatsapp: c?.whatsapp || null, responsible: c?.responsible_person || null, name: c?.company_name || null };
  }

  async function status(key) {
    const r = await call('GET', '/uploadposts/users', { key });
    const profiles = r.profiles || [];
    // de onde vêm os perfis do plano (03/11/2026: "incluir o nosso plano e quantos clientes já colocamos no plano")
    await ensureSchema();
    const names = new Set(profiles.map((p) => p.username));
    const { rows: cl } = await pool.query(`SELECT username FROM client_upload_post`).catch(() => ({ rows: [] }));
    const { rows: tm } = await pool.query(`SELECT username FROM upload_post_team_profiles`).catch(() => ({ rows: [] }));
    const clients = cl.filter((x) => names.has(x.username)).length;
    const team = tm.filter((x) => names.has(x.username)).length;
    const withNetwork = profiles.filter((p) => cl.some((x) => x.username === p.username) && connectedAccounts(p.social_accounts || {}).length > 0).length;
    return {
      plan: r.plan || null, limit: r.limit ?? null, used: profiles.length,
      breakdown: { clients, clients_connected: withNetwork, team, other: Math.max(0, profiles.length - clients - team) },
    };
  }

  /**
   * Publica um post da fila numa conta conectada pela Upload-Post. Espera o resultado (o envio vira assíncrono depois de
   * ~59 s: acompanha pelo request_id por até 10 min). Idempotency-Key por post e rede: nova tentativa não duplica.
   */
  async function publish(account, post, media, { maxWaitMs = 10 * 60_000 } = {}) {
    const { rows: [cp] } = await pool.query(`SELECT username, facebook_team_profile FROM client_upload_post WHERE client_id = $1`, [post.client_id]);
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
    form.append('user', account.platform === 'facebook' && cp.facebook_team_profile ? cp.facebook_team_profile : cp.username);
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

  // ── Facebooks da equipe ──
  async function teamRow(id) {
    await ensureSchema();
    const { rows: [t] } = await pool.query(`SELECT * FROM upload_post_team_profiles WHERE id = $1`, [id]);
    if (!t) throw Object.assign(new Error('Facebook da equipe não encontrado'), { status: 404 });
    return t;
  }

  /** Cada Facebook da equipe: se o login está feito, as páginas dele e a que cliente cada página está ligada. */
  async function teamList() {
    await ensureSchema();
    const { rows: teams } = await pool.query(`SELECT id, name, username, created_at FROM upload_post_team_profiles WHERE kind = 'facebook' ORDER BY created_at`);
    const { rows: links } = await pool.query(
      `SELECT u.client_id, u.facebook_team_profile, u.facebook_page_id, c.company_name
         FROM client_upload_post u JOIN clients c ON c.id = u.client_id WHERE u.facebook_team_profile IS NOT NULL`
    );
    const out = [];
    for (const t of teams) {
      let connected = false; let reauth = false; let account = null; let pages = []; let fields = [];
      try {
        const r = await call('GET', `/uploadposts/users/${encodeURIComponent(t.username)}`);
        const fb = connectedAccounts(r.profile?.social_accounts || {}).find((a) => a.platform === 'facebook');
        if (fb) { connected = true; reauth = !!fb.reauth; account = fb.name || fb.handle || null; ({ pages, fields } = await facebookPage(t.username, null)); }
      } catch (error) { logger.warn?.('[upload-post] Facebook da equipe:', t.username, error.message); }
      out.push({
        id: t.id, name: t.name, connected, reauth, account,
        // a Upload-Post disse o Instagram das páginas? (sem isso, a tela usa o nome do cliente e avisa)
        instagram_known: pages.some((pg) => pg.instagram !== null), page_fields: fields,
        pages: pages.map((pg) => {
          const l = links.find((x) => x.facebook_team_profile === t.username && String(x.facebook_page_id) === pg.id);
          return { ...pg, client_id: l?.client_id || null, client_name: l ? String(l.company_name || '').trim() : null };
        }),
      });
    }
    return out;
  }

  /** Novo Facebook da equipe (um perfil próprio na Upload-Post, com o nome dado). */
  async function teamCreate(name, userId) {
    await ensureSchema();
    const label = String(name || '').trim().slice(0, 60);
    if (label.length < 2) throw Object.assign(new Error('Dê um nome ao Facebook (ex.: Facebook Thiago)'), { status: 400 });
    const username = `pulse-equipe-${crypto.randomBytes(4).toString('hex')}`;
    await call('POST', '/uploadposts/users', { json: { username, display_name: `Equipe · ${label}` } });
    const { rows: [t] } = await pool.query(
      `INSERT INTO upload_post_team_profiles (name, username, created_by) VALUES ($1, $2, $3) RETURNING id, name`, [label, username, userId || null]
    );
    return t;
  }

  /** Login do Facebook desse perfil (abre na tela da Meta e volta para Conexões Sociais). */
  async function teamLogin(id) {
    const t = await teamRow(id);
    const r = await call('POST', '/uploadposts/oauth/facebook/start', {
      json: { profile: t.username, redirect_url: `${appBase}/conexoes-sociais?facebook_equipe=${t.id}` },
    });
    if (!r.authorize_url) throw Object.assign(new Error('Não deu para abrir o login do Facebook. Tente de novo.'), { status: 502 });
    return { url: r.authorize_url };
  }

  /** Liga uma página do Facebook da equipe a um cliente (a página sai de quem a tinha antes). */
  async function teamAssign(id, pageId, clientId) {
    const t = await teamRow(id);
    const { pages } = await facebookPage(t.username, null);
    const page = pages.find((pg) => pg.id === String(pageId));
    if (!page) throw Object.assign(new Error('Essa página não está nesse Facebook. Faça o login de novo e marque a página.'), { status: 400 });
    await ensureProfile(clientId);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows: before } = await db.query(
        `UPDATE client_upload_post SET facebook_team_profile = NULL, facebook_page_id = NULL
          WHERE facebook_team_profile = $1 AND facebook_page_id = $2 AND client_id <> $3 RETURNING client_id`, [t.username, page.id, clientId]
      );
      for (const b of before) await db.query(`DELETE FROM social_accounts WHERE client_id = $1 AND platform = 'facebook' AND api_base = 'upload_post'`, [b.client_id]);
      await db.query(`UPDATE client_upload_post SET facebook_team_profile = $2, facebook_page_id = $3 WHERE client_id = $1`, [clientId, t.username, page.id]);
      await db.query(`DELETE FROM social_accounts WHERE client_id = $1 AND platform = 'facebook'`, [clientId]);
      await db.query(
        `INSERT INTO social_accounts (client_id, platform, facebook_page_id, account_name, username, profile_picture_url, access_token, status, api_base)
         VALUES ($1, 'facebook', $2, $3, $4, NULL, '', 'connected', 'upload_post')`,
        [clientId, page.id, page.name, t.name]
      );
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      db.release();
    }
    return { ok: true, page };
  }

  /** Desliga o Facebook da equipe do cliente (volta a valer o Facebook que o próprio cliente conectar). */
  async function teamUnassign(clientId) {
    await ensureSchema();
    await pool.query(`UPDATE client_upload_post SET facebook_team_profile = NULL, facebook_page_id = NULL WHERE client_id = $1`, [clientId]);
    await pool.query(`DELETE FROM social_accounts WHERE client_id = $1 AND platform = 'facebook' AND api_base = 'upload_post'`, [clientId]);
    await sync(clientId).catch(() => {});
    return { ok: true };
  }

  // ── Google da equipe ──
  async function googleTeamRow(id) {
    await ensureSchema();
    const { rows: [t] } = await pool.query(`SELECT * FROM upload_post_team_profiles WHERE id = $1 AND kind = 'google'`, [id]);
    if (!t) throw Object.assign(new Error('Google da equipe não encontrado'), { status: 404 });
    return t;
  }

  /** As fichas do Google de um login (a Upload-Post devolve name = accounts/…/locations/…, title). */
  async function googleLocations(username) {
    const r = await call('GET', `/uploadposts/google-business/locations?profile=${encodeURIComponent(username)}`);
    const list = Array.isArray(r) ? r : r.locations || r.data || [];
    return list.map((l) => ({ id: String(l.name || l.gbp_location_id || l.id || ''), title: String(l.title || l.locationName || l.name || '').trim() }))
      .filter((l) => l.id);
  }

  /** Cada Google da equipe: se o login está feito, as fichas dele e a que cliente cada ficha está ligada. */
  async function googleTeamList() {
    await ensureSchema();
    const { rows: teams } = await pool.query(`SELECT id, name, username FROM upload_post_team_profiles WHERE kind = 'google' ORDER BY created_at`);
    const { rows: links } = await pool.query(
      `SELECT g.location_id, g.team_profile, g.client_id, c.company_name, c.status
         FROM google_team_locations g LEFT JOIN clients c ON c.id = g.client_id`
    );
    const out = [];
    for (const t of teams) {
      let connected = false; let reauth = false; let account = null; let locations = [];
      try {
        const r = await call('GET', `/uploadposts/users/${encodeURIComponent(t.username)}`);
        const g = connectedAccounts(r.profile?.social_accounts || {}).find((a) => a.platform === 'google_business');
        if (g) { connected = true; reauth = !!g.reauth; account = g.name || g.handle || null; locations = await googleLocations(t.username); }
      } catch (error) { logger.warn?.('[upload-post] Google da equipe:', t.username, error.message); }
      out.push({
        id: t.id, name: t.name, connected, reauth, account,
        locations: locations.map((l) => {
          const k = links.find((x) => x.team_profile === t.username && x.location_id === l.id);
          return { ...l, client_id: k?.client_id || null, client_name: k ? String(k.company_name || '').trim() : null, monitor_only: k?.status === 'monitoramento' };
        }),
      });
    }
    return out;
  }

  async function googleTeamCreate(name, userId) {
    await ensureSchema();
    const label = String(name || '').trim().slice(0, 60);
    if (label.length < 2) throw Object.assign(new Error('Dê um nome ao Google (ex.: Google Thiago)'), { status: 400 });
    const username = `pulse-google-${crypto.randomBytes(4).toString('hex')}`;
    await call('POST', '/uploadposts/users', { json: { username, display_name: `Equipe · ${label}` } });
    const { rows: [t] } = await pool.query(
      `INSERT INTO upload_post_team_profiles (name, username, created_by, kind) VALUES ($1, $2, $3, 'google') RETURNING id, name`, [label, username, userId || null]
    );
    return t;
  }

  async function googleTeamLogin(id) {
    const t = await googleTeamRow(id);
    const r = await call('POST', '/uploadposts/oauth/google-business/start', {
      json: { profile: t.username, redirect_url: `${appBase}/conexoes-sociais?google_equipe=${t.id}` },
    });
    if (!r.authorize_url) throw Object.assign(new Error('Não deu para abrir o login do Google. Tente de novo.'), { status: 502 });
    return { url: r.authorize_url };
  }

  /** Liga uma ficha a um cliente; com new_client_name, cria um cliente só de monitoramento (fora dos clientes fixos). */
  async function googleAssign(id, locationId, clientId, newClientName) {
    const t = await googleTeamRow(id);
    const loc = (await googleLocations(t.username)).find((l) => l.id === String(locationId));
    if (!loc) throw Object.assign(new Error('Essa ficha não está nesse Google. Faça o login de novo.'), { status: 400 });
    let target = String(clientId || '');
    if (!target) {
      const name = String(newClientName || loc.title || '').trim().slice(0, 120);
      if (name.length < 2) throw Object.assign(new Error('Escolha um cliente ou dê o nome do cliente novo'), { status: 400 });
      const { rows: [c] } = await pool.query(
        `INSERT INTO clients (company_name, status, client_type) VALUES ($1, 'monitoramento', 'monitoramento') RETURNING id`, [name]
      );
      target = c.id;
    }
    await pool.query(
      `INSERT INTO google_team_locations (location_id, team_profile, title, client_id, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (location_id) DO UPDATE SET team_profile = EXCLUDED.team_profile, title = EXCLUDED.title, client_id = EXCLUDED.client_id, updated_at = now()`,
      [loc.id, t.username, loc.title, target]
    );
    return { ok: true, client_id: target, location: loc };
  }

  async function googleUnassign(locationId) {
    await ensureSchema();
    await pool.query(`UPDATE google_team_locations SET client_id = NULL, updated_at = now() WHERE location_id = $1`, [String(locationId)]);
    return { ok: true };
  }

  /** De onde ler as avaliações do cliente: as fichas ligadas pelo Google da equipe (perfil + location_id), uma ou várias. */
  async function googleSourcesOf(clientId) {
    await ensureSchema();
    const { rows } = await pool.query(`SELECT team_profile, location_id FROM google_team_locations WHERE client_id = $1 ORDER BY location_id`, [clientId]);
    return rows.map((g) => ({ user: g.team_profile, location_id: g.location_id }));
  }

  async function googleMappedClients() {
    await ensureSchema();
    const { rows } = await pool.query(`SELECT DISTINCT client_id FROM google_team_locations WHERE client_id IS NOT NULL`);
    return rows.map((r) => r.client_id);
  }

  return { googleTeamList, googleTeamCreate, googleTeamLogin, googleAssign, googleUnassign, googleSourcesOf, googleMappedClients,
    teamList, teamCreate, teamLogin, teamAssign, teamUnassign, ensureSchema, apiKey, saveKey, call, ensureProfile, connectLink, connectPage, connectStart, clientInfo, sync, syncAll, status, publish };
}

export function registerUploadPostRoutes(app, { uploadPost, verifyAdmin, verifyOwner = verifyAdmin, verifySocialManager, scope = null, sendWhatsApp = null, logger = console }) {
  const guard = (req, clientId) => (scope ? scope.guard(req, clientId) : null);
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
      await guard(req, req.params.id);
      res.json(await uploadPost.connectLink(req.params.id, Array.isArray(req.body?.networks) ? req.body.networks.map(String) : null));
    } catch (error) { fail(res, error); }
  });

  // a equipe manda o link pelo WhatsApp da Pulse para o número do cliente (o texto vem da tela, com o link)
  app.post('/api/upload-post/clients/:id/connect/send', async (req, res) => {
    try {
      await verifySocialManager(req);
      await guard(req, req.params.id);
      if (!sendWhatsApp) throw Object.assign(new Error('WhatsApp indisponível'), { status: 501 });
      const info = await uploadPost.clientInfo(req.params.id);
      const to = String(req.body?.to || info.whatsapp || '').replace(/\D/g, '');
      const message = String(req.body?.message || '').trim().slice(0, 1500);
      if (to.length < 10) throw Object.assign(new Error('O cliente não tem WhatsApp cadastrado. Coloque o número no cadastro.'), { status: 400 });
      if (!/\/conectar\/[A-Za-z0-9_-]{20,40}/.test(message)) throw Object.assign(new Error('A mensagem precisa ter o link de conexão'), { status: 400 });
      await sendWhatsApp(to.length <= 11 ? `55${to}` : to, message, req.params.id);
      res.json({ ok: true, to: `•••${to.slice(-4)}` });
    } catch (error) { fail(res, error); }
  });

  // página pública da Pulse para o cliente conectar as redes (sem login; o token vale 7 dias)
  app.get('/api/public/conectar/:token', async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await uploadPost.connectPage(req.params.token)); } catch (error) { fail(res, error); }
  });
  app.post('/api/public/conectar/:token/start', async (req, res) => {
    try { res.json(await uploadPost.connectStart(req.params.token, String(req.body?.rede || ''))); } catch (error) { fail(res, error); }
  });

  app.get('/api/upload-post/clients/:id', async (req, res) => {
    try {
      await verifySocialManager(req);
      await guard(req, req.params.id);
      res.json(await uploadPost.clientInfo(req.params.id));
    } catch (error) { fail(res, error); }
  });

  app.post('/api/upload-post/clients/:id/sync', async (req, res) => {
    try {
      await verifySocialManager(req);
      await guard(req, req.params.id);
      res.json(await uploadPost.sync(req.params.id));
    } catch (error) { fail(res, error); }
  });

  // Facebooks da equipe (03/11/2026): login com nome e páginas ligadas aos clientes à mão
  app.get('/api/upload-post/team-facebook', async (req, res) => {
    try { await verifyOwner(req); res.set('Cache-Control', 'no-store'); res.json({ teams: await uploadPost.teamList() }); } catch (error) { fail(res, error); }
  });
  app.post('/api/upload-post/team-facebook', async (req, res) => {
    try { const { user } = await verifyOwner(req); res.json(await uploadPost.teamCreate(req.body?.name, user?.id)); } catch (error) { fail(res, error); }
  });
  app.post('/api/upload-post/team-facebook/:id/login', async (req, res) => {
    try { await verifyOwner(req); res.json(await uploadPost.teamLogin(req.params.id)); } catch (error) { fail(res, error); }
  });
  app.post('/api/upload-post/team-facebook/:id/assign', async (req, res) => {
    try {
      await verifyOwner(req);
      const clientId = String(req.body?.client_id || '');
      await guard(req, clientId);
      res.json(await uploadPost.teamAssign(req.params.id, String(req.body?.page_id || ''), clientId));
    } catch (error) { fail(res, error); }
  });
  app.post('/api/upload-post/clients/:id/team-facebook/remove', async (req, res) => {
    try { await verifyOwner(req); await guard(req, req.params.id); res.json(await uploadPost.teamUnassign(req.params.id)); } catch (error) { fail(res, error); }
  });

  // Google da equipe (04/11/2026): um login do Google, as fichas ligadas aos clientes (ou a clientes só de monitoramento)
  app.get('/api/upload-post/team-google', async (req, res) => {
    try { await verifyOwner(req); res.set('Cache-Control', 'no-store'); res.json({ teams: await uploadPost.googleTeamList() }); } catch (error) { fail(res, error); }
  });
  app.post('/api/upload-post/team-google', async (req, res) => {
    try { const { user } = await verifyOwner(req); res.json(await uploadPost.googleTeamCreate(req.body?.name, user?.id)); } catch (error) { fail(res, error); }
  });
  app.post('/api/upload-post/team-google/:id/login', async (req, res) => {
    try { await verifyOwner(req); res.json(await uploadPost.googleTeamLogin(req.params.id)); } catch (error) { fail(res, error); }
  });
  app.post('/api/upload-post/team-google/:id/assign', async (req, res) => {
    try {
      await verifyOwner(req);
      const clientId = String(req.body?.client_id || '');
      if (clientId) await guard(req, clientId);
      res.json(await uploadPost.googleAssign(req.params.id, String(req.body?.location_id || ''), clientId, req.body?.new_client_name));
    } catch (error) { fail(res, error); }
  });
  app.post('/api/upload-post/team-google/unassign', async (req, res) => {
    try { await verifyOwner(req); res.json(await uploadPost.googleUnassign(String(req.body?.location_id || ''))); } catch (error) { fail(res, error); }
  });

  const timer = setInterval(() => uploadPost.syncAll().catch((error) => logger.error('[upload-post] sync geral:', error.message)), 15 * 60_000);
  timer.unref?.();
}

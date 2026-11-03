// ─── Automações estilo ManyChat (usuário, 02/11/2026: "crie módulos do estilo manychat") ───────────────────────────
// Pela Upload-Post (lib/uploadPost.mjs):
//   • palavra-chave no comentário → direct: quem comenta a palavra no post recebe uma mensagem no direct (Instagram) com
//     até 3 botões de link; nas outras redes, uma resposta pública. É o "AutoDM" da Upload-Post: cada automação vira um
//     monitor (até 2 novos por perfil por dia; dura 15 dias; Instagram e TikTok respondem em segundos);
//   • caixa de direct do Instagram: a equipe lê as conversas e responde pelo sistema.
// Modelos prontos (MODELOS) para a equipe começar rápido: link de compra, cupom, cardápio/catálogo, agendar no WhatsApp.

export const MODELOS = [
  { id: 'link', nome: 'Link do produto', palavras: ['EU QUERO', 'QUERO', 'LINK'], mensagem: 'Oi! 😊 Aqui está o link que você pediu. Qualquer dúvida é só chamar!', botao: 'Ver agora' },
  { id: 'cupom', nome: 'Cupom de desconto', palavras: ['CUPOM', 'DESCONTO'], mensagem: 'Oba! 🎉 Seu cupom chegou. Mostre esta mensagem na loja ou use no link abaixo.', botao: 'Usar cupom' },
  { id: 'catalogo', nome: 'Cardápio ou catálogo', palavras: ['CARDÁPIO', 'CATÁLOGO', 'PREÇO'], mensagem: 'Olá! Aqui está nosso cardápio/catálogo completo 👇', botao: 'Abrir' },
  { id: 'agendar', nome: 'Agendar pelo WhatsApp', palavras: ['AGENDAR', 'HORÁRIO', 'MARCAR'], mensagem: 'Que bom que você quer agendar! 💛 Toque no botão e fale direto com a gente no WhatsApp.', botao: 'Chamar no WhatsApp' },
];

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

/** Valida o pedido da tela e devolve o que vai para a Upload-Post. */
export function normalizeAutomation(body) {
  const fail = (m) => { throw Object.assign(new Error(m), { status: 400 }); };
  const platform = ['instagram', 'facebook', 'tiktok', 'youtube'].includes(body?.platform) ? body.platform : 'instagram';
  const postUrl = clean(body?.post_url, 500);
  const postId = clean(body?.post_id, 100);
  if (platform === 'instagram' && !/^https:\/\/(www\.)?instagram\.com\//.test(postUrl)) fail('Escolha o post do Instagram');
  if (platform !== 'instagram' && !postId && !postUrl) fail('Escolha o post');
  const keywords = (Array.isArray(body?.trigger_keywords) ? body.trigger_keywords : String(body?.trigger_keywords || '').split(','))
    .map((k) => clean(k, 40)).filter(Boolean).slice(0, 10);
  const message = clean(body?.reply_message, 900) || fail('Escreva a mensagem que a pessoa vai receber');
  const buttons = (Array.isArray(body?.buttons) ? body.buttons : [])
    .map((b) => ({ title: clean(b?.title, 20), url: clean(b?.url, 500) }))
    .filter((b) => b.title && /^https?:\/\//.test(b.url)).slice(0, 3);
  if (platform !== 'instagram' && buttons.length) fail('Botões só no direct do Instagram');
  const replies = (Array.isArray(body?.reply_messages) ? body.reply_messages : []).map((r) => clean(r, 300)).filter(Boolean).slice(0, 5);
  return { platform, post_url: postUrl || null, post_id: postId || null, trigger_keywords: keywords, reply_message: message, buttons, reply_messages: replies, name: clean(body?.name, 80) || 'Automação' };
}

const STATUS_MAP = { running: 'ativa', resuming: 'ativa', paused: 'pausada', stopped: 'parada', expired: 'expirada' };

export function createAutomations({ pool, uploadPost, logger = console }) {
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS social_automations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL,
          name TEXT NOT NULL,
          platform TEXT NOT NULL,
          post_url TEXT,
          post_id TEXT,
          trigger_keywords TEXT[],
          reply_message TEXT NOT NULL,
          reply_messages TEXT[],
          buttons JSONB,
          monitor_id TEXT,
          status TEXT NOT NULL DEFAULT 'ativa',
          stats JSONB,
          last_error TEXT,
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }

  async function profileOf(clientId) {
    const { rows: [p] } = await pool.query(`SELECT username FROM client_upload_post WHERE client_id = $1`, [clientId]);
    if (!p) throw Object.assign(new Error('Cliente sem redes conectadas pela Upload-Post'), { status: 409 });
    return p.username;
  }

  async function create(clientId, body, userId) {
    await ensureSchema();
    const a = normalizeAutomation(body);
    const profile = await profileOf(clientId);
    const r = await uploadPost.call('POST', '/uploadposts/autodms/start', {
      json: {
        platform: a.platform, profile_username: profile, ...(a.post_url ? { post_url: a.post_url } : {}), ...(a.post_id ? { post_id: a.post_id } : {}),
        reply_message: a.reply_message, ...(a.reply_messages.length ? { reply_messages: a.reply_messages } : {}),
        ...(a.buttons.length ? { buttons: a.buttons } : {}), ...(a.trigger_keywords.length ? { trigger_keywords: a.trigger_keywords } : {}),
        monitoring_interval: 15,
      },
    });
    const { rows: [row] } = await pool.query(
      `INSERT INTO social_automations (client_id, name, platform, post_url, post_id, trigger_keywords, reply_message, reply_messages, buttons, monitor_id, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ativa', $11) RETURNING *`,
      [clientId, a.name, a.platform, a.post_url, a.post_id, a.trigger_keywords, a.reply_message, a.reply_messages, JSON.stringify(a.buttons), r.monitor_id || null, userId || null]
    );
    return row;
  }

  async function control(id, action) {
    await ensureSchema();
    if (!['pause', 'resume', 'stop', 'delete'].includes(action)) throw Object.assign(new Error('Ação inválida'), { status: 400 });
    const { rows: [a] } = await pool.query(`SELECT * FROM social_automations WHERE id = $1`, [id]);
    if (!a) throw Object.assign(new Error('Automação não encontrada'), { status: 404 });
    if (a.monitor_id) {
      await uploadPost.call('POST', `/uploadposts/autodms/${action}`, { json: { monitor_id: a.monitor_id } }).catch((error) => {
        if (!(action === 'delete' && error.status === 404)) throw error;
      });
    }
    if (action === 'delete') await pool.query(`DELETE FROM social_automations WHERE id = $1`, [id]);
    else await pool.query(`UPDATE social_automations SET status = $2, updated_at = now() WHERE id = $1`, [id, { pause: 'pausada', resume: 'ativa', stop: 'parada' }[action]]);
    return { ok: true };
  }

  /** Renovar: as automações duram 15 dias na Upload-Post; começa outra igual no mesmo post. */
  async function renew(id, userId) {
    const { rows: [a] } = await pool.query(`SELECT * FROM social_automations WHERE id = $1`, [id]);
    if (!a) throw Object.assign(new Error('Automação não encontrada'), { status: 404 });
    const fresh = await create(a.client_id, { ...a, buttons: a.buttons || [] }, userId);
    await pool.query(`DELETE FROM social_automations WHERE id = $1`, [id]);
    return fresh;
  }

  /** Lê situação e números de todos os monitores (a cada 30 min e ao abrir a tela). */
  async function refresh() {
    await ensureSchema();
    if (!(await uploadPost.apiKey())) return;
    const r = await uploadPost.call('GET', '/uploadposts/autodms/status?include_inactive=true').catch(() => null);
    for (const m of r?.monitors || []) {
      await pool.query(
        `UPDATE social_automations SET status = $2, stats = $3, last_error = $4, updated_at = now() WHERE monitor_id = $1`,
        [m.monitor_id, STATUS_MAP[m.status] || m.status, JSON.stringify(m.stats || {}), m.stop_reason === 'reconnect_required' ? 'A conta precisa ser reconectada' : m.stop_reason === 'post_not_found' ? 'O post não existe mais' : null]
      );
    }
  }

  async function list(clientId, city = null) {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT a.*, cl.company_name AS client_name FROM social_automations a LEFT JOIN clients cl ON cl.id = a.client_id
        WHERE ($1::uuid IS NULL OR a.client_id = $1) AND ($2::text IS NULL OR cl.city IS NULL OR lower(cl.city) = $2)
        ORDER BY (a.status = 'ativa') DESC, a.created_at DESC`, [clientId || null, city || null]
    );
    return rows;
  }

  async function logs(id) {
    const { rows: [a] } = await pool.query(`SELECT monitor_id FROM social_automations WHERE id = $1`, [id]);
    if (!a?.monitor_id) return { logs: [] };
    const r = await uploadPost.call('GET', `/uploadposts/autodms/logs?monitor_id=${encodeURIComponent(a.monitor_id)}`);
    return { logs: (r.logs || []).slice(-100) };
  }

  /** Posts recentes do cliente numa rede, para escolher onde ligar a automação. */
  async function posts(clientId, platform = 'instagram') {
    const profile = await profileOf(clientId);
    const r = await uploadPost.call('GET', `/uploadposts/media?platform=${encodeURIComponent(platform)}&user=${encodeURIComponent(profile)}&limit=12`);
    return (r.media || []).map((m) => ({ id: m.id, permalink: m.permalink, caption: m.caption ? String(m.caption).slice(0, 140) : '', thumb: m.thumbnail_url || (m.media_type === 'IMAGE' ? m.media_url : null), timestamp: m.timestamp }));
  }

  // ── caixa de direct (Instagram) ──
  async function conversations(clientId) {
    const profile = await profileOf(clientId);
    const r = await uploadPost.call('GET', `/uploadposts/dms/conversations?platform=instagram&user=${encodeURIComponent(profile)}&limit=25&messages_limit=10`);
    return r.conversations || [];
  }

  async function sendDm(clientId, recipientId, message) {
    const profile = await profileOf(clientId);
    const text = clean(message, 1000);
    if (!recipientId || text.length < 1) throw Object.assign(new Error('Escreva a mensagem'), { status: 400 });
    return uploadPost.call('POST', '/uploadposts/dms/send', { json: { platform: 'instagram', user: profile, recipient_id: String(recipientId), message: text } });
  }

  const timer = setInterval(() => refresh().catch((error) => logger.error('[automacoes]', error.message)), 30 * 60_000);
  timer.unref?.();

  return { ensureSchema, create, control, renew, refresh, list, logs, posts, conversations, sendDm };
}

export function registerAutomationRoutes(app, { automations, verifySocialManager, pool = null, scope = null, logger = console }) {
  // cidade: só os clientes da cidade ativa e os globais (ver registerSocialHubRoutes)
  const cityOf = (req) => (scope ? scope.city(req) : null);
  const guard = (req, clientId) => (scope ? scope.guard(req, clientId) : null);
  const guardItem = async (req, id) => {
    if (!pool) return;
    const { rows: [r] } = await pool.query(`SELECT client_id FROM social_automations WHERE id = $1`, [id]);
    if (!r) throw Object.assign(new Error('Não encontrado'), { status: 404 });
    await guard(req, r.client_id);
  };

  const fail = (res, error) => {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : /unauthori|login|token/i.test(error?.message || '') ? 401 : /acesso|permiss/i.test(error?.message || '') ? 403 : 500;
    if (status >= 500) logger.error('[automacoes]', error?.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  };
  const team = (fn) => async (req, res) => {
    try {
      const { user } = await verifySocialManager(req);
      res.json(await fn(req, user));
    } catch (error) { fail(res, error); }
  };
  app.get('/api/automations/templates', team(async () => ({ templates: MODELOS })));
  app.get('/api/automations', team(async (req) => {
    if (req.query.client_id) await guard(req, req.query.client_id);
    await automations.refresh().catch(() => {});
    return { automations: await automations.list(req.query.client_id || null, await cityOf(req)) };
  }));
  app.post('/api/automations/:clientId', team(async (req, user) => { await guard(req, req.params.clientId); return automations.create(req.params.clientId, req.body || {}, user?.id); }));
  app.post('/api/automations/item/:id/:action', team(async (req, user) => { await guardItem(req, req.params.id); return req.params.action === 'renew' ? automations.renew(req.params.id, user?.id) : automations.control(req.params.id, req.params.action); }));
  app.get('/api/automations/item/:id/logs', team(async (req) => { await guardItem(req, req.params.id); return automations.logs(req.params.id); }));
  app.get('/api/automations/posts/:clientId', team(async (req) => { await guard(req, req.params.clientId); return { posts: await automations.posts(req.params.clientId, String(req.query.platform || 'instagram')) }; }));
  app.get('/api/automations/inbox/:clientId', team(async (req) => { await guard(req, req.params.clientId); return { conversations: await automations.conversations(req.params.clientId) }; }));
  app.post('/api/automations/inbox/:clientId/send', team(async (req) => { await guard(req, req.params.clientId); return automations.sendDm(req.params.clientId, req.body?.recipient_id, req.body?.message); }));
}

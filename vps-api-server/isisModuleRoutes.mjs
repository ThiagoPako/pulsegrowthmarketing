// ─── Módulo Ísis: a social media da agência no sistema (pedido do Thiago, 04/11/2026) ───
// "Um módulo de fácil acesso, que a gente veja o tempo inteiro, para mandar demandas para a Ísis: escrever, gravar a
// voz, mandar áudio, PDF ou foto, e a IA entender o que eu preciso. Vídeo → card de vídeo (sem material, pede animação);
// arte → cria no Design e pede para todo mundo fazer. Quem tem acesso eu escolho na Equipe. Quando entrar, ela já mostra
// sugestões em cartãozinho." A conversa fica aqui; quem faz o trabalho é a Ísis do PC (agente, função social_media),
// avisada por recado (`pulse esperar` acorda) e que responde pelo `pulse isis …`.
//
//   Equipe (login + acesso ao módulo):
//     GET  /api/isis/chat                    a conversa da pessoa com a Ísis (últimas 100)
//     POST /api/isis/chat { body?, attachments? }   demanda nova (áudio é transcrito); a Ísis responde na hora (IA)
//     GET  /api/isis/sugestoes               cartões que a Ísis deixou (conferir, avisos do mês…)
//     POST /api/isis/sugestoes/:id/dispensar
//   Admin (tela Equipe):  GET /api/team/isis-access · POST|DELETE /api/team/:userId/isis-access
//   Agente (Ísis ou chefe):
//     GET  /api/agent/isis/chat?status=nova|aberta|todas&marcar=1   demandas
//     POST /api/agent/isis/chat/:id/responder { body, status? }      resposta na conversa de quem pediu
//     POST /api/agent/isis/chat/:id/status { status: lida|fazendo|feita }
//     PUT  /api/agent/isis/sugestoes { items: [{ title, body?, action? , link? }] }   troca os cartões
const MODULE = 'isis';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIO_RE = /\.(webm|ogg|oga|opus|mp3|m4a|wav|aac)(\?|#|$)/i;
const STATUSES = new Set(['nova', 'lida', 'fazendo', 'feita']);

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const httpError = (status, message) => Object.assign(new Error(message), { status });

export function registerIsisModuleRoutes(app, { pool, verifyUser, verifyAdmin, isStrictAdmin, agentApi, transcribeUrl, askAi }) {
  const { verifyAgent } = agentApi;

  let ready = null;
  const ensureSchema = () => {
    ready ||= pool.query(`
      CREATE TABLE IF NOT EXISTS isis_chat (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        author TEXT NOT NULL CHECK (author IN ('user', 'isis')),
        body TEXT NOT NULL DEFAULT '',
        attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        transcript TEXT,
        status TEXT,
        reply_to UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        read_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS isis_chat_user ON isis_chat (user_id, created_at);
      CREATE INDEX IF NOT EXISTS isis_chat_status ON isis_chat (status) WHERE author = 'user';
      CREATE TABLE IF NOT EXISTS isis_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        body TEXT,
        action TEXT,
        link TEXT,
        tone TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        dismissed_at TIMESTAMPTZ,
        dismissed_by UUID
      );
    `).catch((error) => { ready = null; throw error; });
    return ready;
  };

  const send = (res, error) => {
    const message = error?.message || 'Erro';
    const status = error?.status || (message === 'Unauthorized' ? 401 : message === 'Admin access required' ? 403 : 500);
    if (status >= 500) console.error('[isis]', message);
    res.status(status).json({ error: message });
  };

  async function hasAccess(user) {
    // admin sempre; os outros, só quem o admin liga na tela Equipe
    if (await isStrictAdmin(user)) return true;
    const { rows } = await pool.query(`SELECT 1 FROM module_access WHERE module = $1 AND user_id::text = $2 LIMIT 1`, [MODULE, String(user.id)])
      .catch(() => ({ rows: [] }));
    return rows.length > 0;
  }

  async function member(req) {
    const ctx = await verifyUser(req);
    if (!(await hasAccess(ctx.user))) throw httpError(403, 'Você ainda não tem acesso à Ísis. Peça na tela Equipe.');
    await ensureSchema();
    return ctx;
  }

  async function isisAgent(req) {
    const agent = await verifyAgent(req);
    if (!['social_media', 'chefe'].includes(agent.role)) throw httpError(403, 'Só a Ísis (social media) e a chefe respondem por aqui');
    await ensureSchema();
    return agent;
  }

  const view = (m) => ({
    id: m.id, author: m.author, body: m.body, attachments: m.attachments || [], transcript: m.transcript || null,
    status: m.status || null, reply_to: m.reply_to || null, created_at: m.created_at,
  });

  function cleanAttachments(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 10).map((a) => ({
      url: clip(a?.url, 600), name: clip(a?.name, 160) || 'arquivo', type: clip(a?.type, 80),
    })).filter((a) => /^https:\/\//.test(a.url));
  }

  // ── Equipe ──
  app.get('/api/isis/chat', async (req, res) => {
    try {
      const { user } = await member(req);
      const { rows } = await pool.query(
        `SELECT * FROM (SELECT * FROM isis_chat WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100) x ORDER BY created_at`, [user.id]
      );
      await pool.query(`UPDATE isis_chat SET read_at = now() WHERE user_id = $1 AND author = 'isis' AND read_at IS NULL`, [user.id]);
      res.json({ messages: rows.map(view) });
    } catch (error) { send(res, error); }
  });

  // quantas respostas da Ísis a pessoa ainda não viu (bolinha no rosto dela)
  app.get('/api/isis/nao-lidas', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await hasAccess(user))) return res.json({ access: false, unread: 0 });
      await ensureSchema();
      const { rows: [r] } = await pool.query(`SELECT count(*)::int AS n FROM isis_chat WHERE user_id = $1 AND author = 'isis' AND read_at IS NULL`, [user.id]);
      res.json({ access: true, unread: r.n });
    } catch (error) { send(res, error); }
  });

  app.post('/api/isis/chat', async (req, res) => {
    try {
      const { user } = await member(req);
      const body = clip(req.body?.body, 4000);
      const attachments = cleanAttachments(req.body?.attachments);
      if (!body && !attachments.length) return res.status(400).json({ error: 'Escreva, grave ou anexe alguma coisa' });

      // áudio gravado ou anexado: a Ísis lê o que foi falado
      const transcripts = [];
      for (const a of attachments.filter((x) => AUDIO_RE.test(x.url) || /^audio\//.test(x.type))) {
        const r = await transcribeUrl(a.url, { maxSeconds: 300 }).catch(() => ({ ok: false }));
        if (r?.ok) transcripts.push(r.text);
      }
      const transcript = transcripts.join('\n') || null;
      const { rows: [msg] } = await pool.query(
        `INSERT INTO isis_chat (user_id, author, body, attachments, transcript, status) VALUES ($1, 'user', $2, $3::jsonb, $4, 'nova') RETURNING *`,
        [user.id, body, JSON.stringify(attachments), transcript]
      );

      const { rows: [profile] } = await pool.query(`SELECT name FROM profiles WHERE id = $1`, [user.id]).catch(() => ({ rows: [] }));
      const who = clip(profile?.name, 80) || 'a equipe';
      const pedido = [body, transcript && `(áudio) ${transcript}`, attachments.length && `anexos: ${attachments.map((a) => a.name).join(', ')}`]
        .filter(Boolean).join(' · ');

      // aviso à Ísis do PC: o `pulse esperar` dela acorda com o recado
      const { rows: isisAgents } = await pool.query(
        `SELECT DISTINCT k.user_id FROM agent_keys k JOIN profiles p ON p.id = k.user_id
          WHERE k.revoked_at IS NULL AND (lower(p.name) LIKE 'isis%' OR lower(p.name) LIKE 'ísis%')`
      ).catch(() => ({ rows: [] }));
      for (const a of isisAgents) {
        await pool.query('INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)',
          [user.id, a.user_id, `📥 Demanda no módulo Ísis (${who}, ${msg.id}): ${pedido.slice(0, 1500)} — responda com: pulse isis responder ${msg.id} "…"`]).catch(() => {});
      }

      // resposta na hora (IA): diz o que entendeu e o que vai acontecer; o trabalho é da Ísis do PC
      let reply = '';
      if (askAi) {
        try {
          reply = clip(await askAi([
            { role: 'system', content: 'Você é a Ísis, social media da agência Pulse, simpática, animada e direta, em português do Brasil. ' +
              'Recebeu uma demanda da equipe. Responda em até 3 frases curtas: diga o que entendeu (vídeo, arte, story, legenda, ' +
              'campanha, outra coisa; cliente e prazo se foram ditos) e o próximo passo (vídeo vira card de edição, e sem gravação ' +
              'vira animação; arte vira card no Design para as designers). Se faltar algo essencial (cliente, formato, data), ' +
              'pergunte só isso. Não invente dados, preços nem datas, e não diga que já está pronto.' },
            { role: 'user', content: `${who} pediu: ${pedido}` },
          ], { temperature: 0.4, max_tokens: 220 }), 900);
        } catch { reply = ''; }
      }
      if (!reply) reply = 'Recebi! 💛 Já estou vendo isso e te respondo aqui com o que eu criei.';
      const { rows: [answer] } = await pool.query(
        `INSERT INTO isis_chat (user_id, author, body, reply_to, read_at) VALUES ($1, 'isis', $2, $3, now()) RETURNING *`,
        [user.id, reply, msg.id]
      );
      res.json({ message: view(msg), reply: view(answer) });
    } catch (error) { send(res, error); }
  });

  app.get('/api/isis/sugestoes', async (req, res) => {
    try {
      await member(req);
      const { rows } = await pool.query(
        `SELECT id, title, body, action, link, tone, created_at FROM isis_suggestions WHERE dismissed_at IS NULL ORDER BY created_at DESC LIMIT 30`
      );
      res.json({ items: rows });
    } catch (error) { send(res, error); }
  });

  app.post('/api/isis/sugestoes/:id/dispensar', async (req, res) => {
    try {
      const { user } = await member(req);
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Cartão inválido' });
      await pool.query(`UPDATE isis_suggestions SET dismissed_at = now(), dismissed_by = $2 WHERE id = $1`, [req.params.id, user.id]);
      res.json({ ok: true });
    } catch (error) { send(res, error); }
  });

  // ── Acesso (tela Equipe, admin) ──
  app.get('/api/team/isis-access', async (req, res) => {
    try {
      await verifyAdmin(req);
      const { rows } = await pool.query(`SELECT user_id FROM module_access WHERE module = $1`, [MODULE]).catch(() => ({ rows: [] }));
      res.json({ members: rows });
    } catch (error) { send(res, error); }
  });
  app.post('/api/team/:userId/isis-access', async (req, res) => {
    try {
      const { user } = await verifyAdmin(req);
      if (!UUID_RE.test(String(req.params.userId))) return res.status(400).json({ error: 'Pessoa inválida' });
      await pool.query(
        `INSERT INTO module_access (module, user_id, created_by) VALUES ($1, $2, $3) ON CONFLICT (module, user_id) DO NOTHING`,
        [MODULE, req.params.userId, String(user?.email || user?.id || '')]
      );
      res.json({ ok: true });
    } catch (error) { send(res, error); }
  });
  app.delete('/api/team/:userId/isis-access', async (req, res) => {
    try {
      await verifyAdmin(req);
      await pool.query(`DELETE FROM module_access WHERE module = $1 AND user_id::text = $2`, [MODULE, String(req.params.userId)]);
      res.json({ ok: true });
    } catch (error) { send(res, error); }
  });

  // ── Ísis do PC ──
  app.get('/api/agent/isis/chat', async (req, res) => {
    try {
      await isisAgent(req);
      const status = ['nova', 'aberta', 'todas'].includes(req.query.status) ? req.query.status : 'aberta';
      const where = { nova: `m.status = 'nova'`, aberta: `m.status IN ('nova', 'lida', 'fazendo')`, todas: 'true' }[status];
      const { rows } = await pool.query(
        `SELECT m.*, p.name AS user_name FROM isis_chat m LEFT JOIN profiles p ON p.id = m.user_id
          WHERE m.author = 'user' AND ${where} ORDER BY m.created_at ${status === 'todas' ? 'DESC' : 'ASC'} LIMIT 50`
      );
      if (['1', 'true', 'sim'].includes(String(req.query.marcar || '').toLowerCase())) {
        const novas = rows.filter((r) => r.status === 'nova').map((r) => r.id);
        if (novas.length) await pool.query(`UPDATE isis_chat SET status = 'lida' WHERE id = ANY($1) AND status = 'nova'`, [novas]);
      }
      res.json({ items: rows.map((r) => ({ ...view(r), user_id: r.user_id, user_name: clip(r.user_name, 80) })) });
    } catch (error) { send(res, error); }
  });

  app.post('/api/agent/isis/chat/:id/responder', async (req, res) => {
    try {
      await isisAgent(req);
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Demanda inválida' });
      const body = clip(req.body?.body, 4000);
      if (!body) return res.status(400).json({ error: 'Escreva a resposta (body)' });
      const { rows: [msg] } = await pool.query(`SELECT * FROM isis_chat WHERE id = $1 AND author = 'user'`, [req.params.id]);
      if (!msg) return res.status(404).json({ error: 'Demanda não encontrada' });
      const status = STATUSES.has(req.body?.status) ? req.body.status : null;
      const { rows: [answer] } = await pool.query(
        `INSERT INTO isis_chat (user_id, author, body, attachments, reply_to) VALUES ($1, 'isis', $2, $3::jsonb, $4) RETURNING *`,
        [msg.user_id, body, JSON.stringify(cleanAttachments(req.body?.attachments)), msg.id]
      );
      if (status) await pool.query(`UPDATE isis_chat SET status = $2 WHERE id = $1`, [msg.id, status]);
      res.json({ ok: true, reply: view(answer) });
    } catch (error) { send(res, error); }
  });

  app.post('/api/agent/isis/chat/:id/status', async (req, res) => {
    try {
      await isisAgent(req);
      if (!UUID_RE.test(req.params.id) || !STATUSES.has(req.body?.status)) return res.status(400).json({ error: 'Use status: lida, fazendo ou feita' });
      await pool.query(`UPDATE isis_chat SET status = $2 WHERE id = $1 AND author = 'user'`, [req.params.id, req.body.status]);
      res.json({ ok: true });
    } catch (error) { send(res, error); }
  });

  app.put('/api/agent/isis/sugestoes', async (req, res) => {
    try {
      await isisAgent(req);
      const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 20)
        .map((i) => ({ title: clip(i?.title, 140), body: clip(i?.body, 600) || null, action: clip(i?.action, 300) || null,
          link: /^(https:\/\/|\/)/.test(String(i?.link || '')) ? clip(i.link, 500) : null,
          tone: ['aviso', 'ideia', 'conferir', 'data'].includes(i?.tone) ? i.tone : 'ideia' }))
        .filter((i) => i.title);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE isis_suggestions SET dismissed_at = now() WHERE dismissed_at IS NULL`);
        for (const i of items) {
          await client.query(`INSERT INTO isis_suggestions (title, body, action, link, tone) VALUES ($1, $2, $3, $4, $5)`,
            [i.title, i.body, i.action, i.link, i.tone]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      res.json({ ok: true, count: items.length });
    } catch (error) { send(res, error); }
  });
}

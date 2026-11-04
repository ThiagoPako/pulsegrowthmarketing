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
//     POST /api/agent/isis/propostas { client_name, client_company, venda: {...}, validade_dias?, whatsapp?, city? }
//     PUT  /api/agent/isis/propostas/:id { venda?, client_name?, client_company?, validade_dias? }   ajuste
//     GET  /api/agent/isis/propostas                                     as últimas 20 (link e status)
//        Proposta "sob medida" (04/11/2026, pedido do Thiago: "falar o nome da pessoa, a atividade e o que vamos
//        vender, e a Ísis cria a proposta focada em vendas, que o cliente entenda e deseje comprar"). Fica em
//        commercial_proposals (proposal_type 'sob_medida', o conteúdo em system_data) e abre em /proposta/<token>.
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
      // 04/11/2026 (primeiro uso do Thiago): sem a conversa anterior a IA perguntava de novo o cliente e o prazo
      // que ele já tinha dito ("falei que é pra Venon"). Agora ela lê as últimas mensagens e não faz pergunta:
      // quem completa o que falta é a Ísis do PC, que lê tudo junto.
      let reply = '';
      if (askAi) {
        try {
          const { rows: recent } = await pool.query(
            `SELECT author, body, transcript FROM isis_chat WHERE user_id = $1 AND id <> $2 AND created_at > now() - interval '6 hours'
              ORDER BY created_at DESC LIMIT 12`, [user.id, msg.id]
          );
          const history = recent.reverse().map((m) => ({
            role: m.author === 'user' ? 'user' : 'assistant',
            content: [m.body, m.transcript && `(áudio) ${m.transcript}`].filter(Boolean).join(' ').slice(0, 800) || '(anexo)',
          }));
          reply = clip(await askAi([
            { role: 'system', content: 'Você é a Ísis, social media da agência Pulse, simpática, animada e direta, em português do Brasil. ' +
              'A equipe manda demandas aos poucos, em várias mensagens: junte a mensagem nova com as anteriores desta conversa. ' +
              'Responda em até 2 frases curtas: o que entendeu do pedido completo até agora (formato, cliente, prazo, o que foi dito) ' +
              'e que você já vai criar (vídeo vira card de edição, sem gravação vira animação; arte vira card no Design). ' +
              'NÃO faça perguntas e não peça informação que já foi dita; o que faltar você resolve depois. ' +
              'Não invente dados, preços nem datas, e não diga que já está pronto.' },
            ...history,
            { role: 'user', content: `${who}: ${pedido}` },
          ], { temperature: 0.3, max_tokens: 160 }), 700);
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

  // ── Propostas sob medida ──
  const money = (v) => { const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };
  const list = (v, n, max = 300) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => clip(x, max)).filter(Boolean);
  function cleanVenda(v = {}) {
    const inv = v.investimento || {};
    const venda = {
      atividade: clip(v.atividade, 160),
      titulo: clip(v.titulo, 160),
      subtitulo: clip(v.subtitulo, 400),
      momento: list(v.momento, 5),
      solucao: clip(v.solucao, 1200),
      entregas: (Array.isArray(v.entregas) ? v.entregas : []).slice(0, 12)
        .map((e) => ({ titulo: clip(e?.titulo, 120), descricao: clip(e?.descricao, 400), quantidade: clip(e?.quantidade, 40) || null }))
        .filter((e) => e.titulo),
      resultados: list(v.resultados, 6),
      investimento: {
        valor: money(inv.valor),
        de: money(inv.de),
        periodo: ['mes', 'unico', 'projeto'].includes(inv.periodo) ? inv.periodo : 'mes',
        parcelas: Math.min(24, Math.max(1, parseInt(inv.parcelas, 10) || 1)),
        // mensal: duração do contrato (as receitas previstas saem por ela quando o cliente aceita)
        meses: Math.min(24, Math.max(1, parseInt(inv.meses, 10) || 12)),
        forma: ['pix', 'boleto', 'cartao', 'transferencia'].includes(inv.forma) ? inv.forma : 'pix',
        condicoes: clip(inv.condicoes, 400),
      },
      bonus: (Array.isArray(v.bonus) ? v.bonus : []).slice(0, 6)
        .map((b) => ({ titulo: clip(b?.titulo, 120), descricao: clip(b?.descricao, 300) })).filter((b) => b.titulo),
      passos: list(v.passos, 6, 200),
      garantia: clip(v.garantia, 400),
      cta: clip(v.cta, 120),
    };
    if (!venda.titulo || !venda.entregas.length || !venda.investimento.valor) {
      throw httpError(400, 'A proposta precisa de titulo, ao menos 1 entrega e investimento.valor');
    }
    return venda;
  }
  const proposalLink = (token) => `${String(process.env.PUBLIC_APP_URL || 'https://agenciapulse.tech').replace(/\/+$/, '')}/proposta/${token}`;

  app.post('/api/agent/isis/propostas', async (req, res) => {
    try {
      const agent = await isisAgent(req);
      const clientName = clip(req.body?.client_name, 120);
      if (!clientName) return res.status(400).json({ error: 'Informe client_name (o nome da pessoa)' });
      const venda = cleanVenda(req.body?.venda);
      const days = Math.min(60, Math.max(1, parseInt(req.body?.validade_dias, 10) || 7));
      const city = ['minacu', 'uruacu'].includes(req.body?.city) ? req.body.city : null;
      const { rows: [p] } = await pool.query(
        `INSERT INTO commercial_proposals (client_name, client_company, proposal_type, system_data, validity_date, whatsapp_number,
                                           has_contract, created_by, city)
         VALUES ($1, $2, 'sob_medida', $3::jsonb, CURRENT_DATE + $4::int, $5, false, $6, $7) RETURNING id, token, validity_date`,
        [clientName, clip(req.body?.client_company, 160) || clientName, JSON.stringify(venda), days,
          clip(req.body?.whatsapp, 30).replace(/\D/g, ''), agent.userId, city]
      );
      res.json({ ok: true, id: p.id, link: proposalLink(p.token), validade: p.validity_date });
    } catch (error) { send(res, error); }
  });

  app.put('/api/agent/isis/propostas/:id', async (req, res) => {
    try {
      await isisAgent(req);
      if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Proposta inválida' });
      const { rows: [cur] } = await pool.query(`SELECT * FROM commercial_proposals WHERE id = $1 AND proposal_type = 'sob_medida'`, [req.params.id]);
      if (!cur) return res.status(404).json({ error: 'Proposta sob medida não encontrada' });
      if (cur.status !== 'pendente') return res.status(409).json({ error: `Esta proposta já foi ${cur.status}` });
      const venda = req.body?.venda ? cleanVenda({ ...(cur.system_data || {}), ...req.body.venda }) : cur.system_data;
      const days = parseInt(req.body?.validade_dias, 10);
      const { rows: [p] } = await pool.query(
        `UPDATE commercial_proposals SET system_data = $2::jsonb, client_name = COALESCE($3, client_name),
                client_company = COALESCE($4, client_company),
                validity_date = CASE WHEN $5::int IS NULL THEN validity_date ELSE CURRENT_DATE + $5::int END, updated_at = now()
          WHERE id = $1 RETURNING token, validity_date`,
        [req.params.id, JSON.stringify(venda), clip(req.body?.client_name, 120) || null, clip(req.body?.client_company, 160) || null,
          Number.isFinite(days) ? Math.min(60, Math.max(1, days)) : null]
      );
      res.json({ ok: true, link: proposalLink(p.token), validade: p.validity_date });
    } catch (error) { send(res, error); }
  });

  app.get('/api/agent/isis/propostas', async (req, res) => {
    try {
      await isisAgent(req);
      const { rows } = await pool.query(
        `SELECT id, client_name, client_company, status, token, validity_date, created_at, client_response_note
           FROM commercial_proposals WHERE proposal_type = 'sob_medida' ORDER BY created_at DESC LIMIT 20`
      );
      res.json({ items: rows.map(({ token, ...r }) => ({ ...r, link: proposalLink(token) })) });
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

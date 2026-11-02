// ─── Aprovação sem login (pedido do usuário, 02/11/2026) ────────────────────────────────────────────────────────
// "Cliente não acessou o portal: envie o link do vídeo para ele assistir e aprovar em uma página única que funcione
// mesmo sem login… com a identidade visual da Pulse e igual ao Instagram, para ele imaginar como ficaria na rede
// social dele, e embaixo botões para solicitar alteração ou aprovar."
// Cada conteúdo do portal ganha um link com token aleatório (/aprovar/<token>), que vale só para aquele conteúdo.
// Aprovar e pedir ajuste fazem o mesmo que no portal (status, comentário, Kanban e avisos à equipe).
//
//   GET  /api/public/aprovar/:token                  o conteúdo, o cliente e o "perfil" do Instagram dele
//   POST /api/public/aprovar/:token { action: approve|adjust, notes?, name? }
//
// Link da equipe (usuário, 02/11/2026): "quando um vídeo entrar para aprovação… já manda o link estilo Instagram para
// a gente aprovar". Vídeo que entra em Revisão (revisao_interna no portal) gera um link próprio da equipe, enviado aos
// números do Assistente com a permissão "aprovar_videos" da cidade do cliente (Uruaçu: Thiago e Naay; Minaçu: Thiago
// e Victor). Aprovar manda o card para o cliente (envio); Pedir alteração devolve ao editor (alteração).

import crypto from 'node:crypto';

const httpError = (status, message) => Object.assign(new Error(message), { status });

export function registerPortalShareRoutes(app, {
  pool, approveContent, adjustContent, publicAppUrl = process.env.PUBLIC_APP_URL || 'https://agenciapulse.tech', logger = console,
  verifyAgent = null, sendToTeam = null, moveCard = null, enqueue = null,
}) {
  const appBase = String(publicAppUrl).replace(/\/+$/, '');
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS portal_share_links (
          token TEXT PRIMARY KEY,
          content_id UUID NOT NULL UNIQUE,
          client_id UUID,
          opened_at TIMESTAMPTZ,
          decided_at TIMESTAMPTZ,
          decision TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
              CREATE TABLE IF NOT EXISTS portal_team_links (
          token TEXT PRIMARY KEY,
          content_id UUID NOT NULL UNIQUE,
          file_url TEXT,
          notified_at TIMESTAMPTZ,
          opened_at TIMESTAMPTZ,
          decided_at TIMESTAMPTZ,
          decision TEXT
        );
      `).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[aprovar] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status || 500;
    if (status >= 500) logger.error('[aprovar] erro:', error.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  /** Link de aprovação sem login de um conteúdo do portal (o mesmo enquanto existir). */
  async function shareLink(contentId) {
    await ensureSchema();
    const { rows: [c] } = await pool.query(`SELECT id, client_id FROM client_portal_contents WHERE id = $1`, [contentId]);
    if (!c) return null;
    const token = crypto.randomBytes(18).toString('base64url');
    const { rows: [row] } = await pool.query(
      `INSERT INTO portal_share_links (token, content_id, client_id) VALUES ($1, $2, $3)
       ON CONFLICT (content_id) DO UPDATE SET content_id = EXCLUDED.content_id RETURNING token`,
      [token, c.id, c.client_id]
    );
    return `${appBase}/aprovar/${row.token}`;
  }

  /** Link da equipe de um conteúdo em revisão interna (um por conteúdo; a versão nova reabre a decisão). */
  async function teamLink(contentId, fileUrl) {
    await ensureSchema();
    const token = crypto.randomBytes(18).toString('base64url');
    const { rows: [row] } = await pool.query(
      `INSERT INTO portal_team_links (token, content_id, file_url, notified_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (content_id) DO UPDATE SET file_url = EXCLUDED.file_url, notified_at = now(), decided_at = NULL, decision = NULL
       RETURNING token`,
      [token, contentId, fileUrl || null]
    );
    return `${appBase}/aprovar/${row.token}`;
  }

  /** Quem aprova os vídeos da cidade: permissão "aprovar_videos" e a cidade na lista do número (vazia = as duas). */
  async function approversFor(city) {
    const { rows } = await pool.query(`SELECT * FROM assistant_numbers WHERE active AND 'aprovar_videos' = ANY(permissions)`)
      .catch(() => ({ rows: [] }));
    return rows.filter((n) => !(n.cities || []).length || (n.cities || []).includes(city));
  }

  /** Vídeo novo (ou versão nova) em Revisão → o link da equipe no WhatsApp de quem aprova a cidade do cliente. */
  async function notifyTeamReview() {
    if (!enqueue) return 0;
    await ensureSchema();
    // na primeira vez, o que já estava em revisão antes deste aviso existir não gera mensagem
    const { rows: first } = await pool.query(
      `INSERT INTO wa_job_runs (job, day) VALUES ('equipe_aprovacao_inicio', '2000-01-01') ON CONFLICT DO NOTHING RETURNING job`
    ).catch(() => ({ rows: [] }));
    if (first.length) {
      await pool.query(
        `INSERT INTO portal_team_links (token, content_id, file_url, notified_at)
         SELECT md5(random()::text || id::text), id, file_url, now() FROM client_portal_contents WHERE status = 'revisao_interna'
         ON CONFLICT (content_id) DO NOTHING`
      ).catch(() => {});
      return 0;
    }
    // espera 60 s sem mudança no conteúdo (o vídeo termina de subir) e manda uma vez por versão do arquivo
    const { rows } = await pool.query(
      `SELECT pc.id, pc.title, pc.file_url, cl.company_name, cl.city
         FROM client_portal_contents pc
         JOIN clients cl ON cl.id = pc.client_id
         LEFT JOIN portal_team_links l ON l.content_id = pc.id
        WHERE pc.status = 'revisao_interna' AND pc.content_task_id IS NOT NULL AND nullif(btrim(pc.file_url), '') IS NOT NULL
          AND coalesce(pc.updated_at, pc.created_at) < now() - interval '60 seconds'
          AND (l.content_id IS NULL OR l.file_url IS DISTINCT FROM pc.file_url)
        ORDER BY pc.created_at LIMIT 20`
    );
    let sent = 0;
    for (const c of rows) {
      const link = await teamLink(c.id, c.file_url);
      const city = String(c.city || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('minacu') ? 'minacu' : 'uruacu';
      const body = [
        `🎬 *Vídeo para aprovar* · ${String(c.company_name || '').trim()}`,
        `"${String(c.title || '').trim()}"`,
        '',
        'Assista como no Instagram e toque em *Aprovar* (vai para o cliente) ou *Pedir alteração* (volta para o editor):',
        link,
      ].join('\n');
      for (const n of await approversFor(city)) {
        await enqueue(n.phone, body).catch((error) => logger.error('[aprovar] equipe:', n.name, error.message));
        sent += 1;
      }
    }
    return sent;
  }
  if (enqueue) {
    const timer = setInterval(() => notifyTeamReview().catch((error) => logger.error('[aprovar] equipe:', error.message)), 60 * 1000);
    timer.unref?.();
  }

  async function byToken(token) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(token || ''))) throw httpError(404, 'Link não encontrado');
    await ensureSchema();
    const { rows: [team] } = await pool.query(
      `SELECT l.token, l.decision, true AS team, c.*, cl.company_name, cl.logo_url
         FROM portal_team_links l
         JOIN client_portal_contents c ON c.id = l.content_id
         LEFT JOIN clients cl ON cl.id = c.client_id
        WHERE l.token = $1`, [token]
    );
    if (team) return team;
    const { rows: [row] } = await pool.query(
      `SELECT l.token, l.decision, c.*, cl.company_name, cl.logo_url
         FROM portal_share_links l
         JOIN client_portal_contents c ON c.id = l.content_id
         LEFT JOIN clients cl ON cl.id = c.client_id
        WHERE l.token = $1`, [token]
    );
    if (!row || row.status === 'revisao_interna') throw httpError(404, 'Link não encontrado');
    return row;
  }

  app.get('/api/public/aprovar/:token', async (req, res) => {
    try {
      const row = await byToken(req.params.token);
      await pool.query(`UPDATE ${row.team ? 'portal_team_links' : 'portal_share_links'} SET opened_at = coalesce(opened_at, now()) WHERE token = $1`, [row.token]).catch(() => {});
      // "perfil" do Instagram do cliente (conta conectada) e a legenda do post, quando houver
      const { rows: [ig] } = await pool.query(
        `SELECT username, profile_picture_url FROM social_accounts WHERE client_id = $1 AND platform ILIKE 'instagram%' ORDER BY created_at DESC LIMIT 1`,
        [row.client_id]
      ).catch(() => ({ rows: [] }));
      const { rows: [cap] } = row.content_task_id
        ? await pool.query(`SELECT caption FROM scheduling_captions WHERE material_id = $1::text ORDER BY updated_at DESC LIMIT 1`, [row.content_task_id]).catch(() => ({ rows: [] }))
        : { rows: [] };
      // vídeo leve (.web.mp4) quando existir: abre mais rápido no celular
      const file = String(row.file_url || '');
      res.set('Cache-Control', 'no-store');
      res.json({
        title: row.title, type: row.content_type, status: row.status, file_url: file, web_url: /\.mp4$/i.test(file) ? file.replace(/\.mp4$/i, '.web.mp4') : null,
        thumbnail_url: row.thumbnail_url || null,
        client: { name: String(row.company_name || '').trim(), logo: row.logo_url || null, username: ig?.username || null, avatar: ig?.profile_picture_url || row.logo_url || null },
        caption: cap?.caption || null,
        decided: row.team
          ? (row.status === 'revisao_interna' ? (row.decision || null) : row.decision || 'aprovado')
          : ['aprovado', 'agendado', 'publicado'].includes(row.status) ? 'aprovado' : row.status === 'ajuste_solicitado' ? 'ajuste' : null,
        team: !!row.team,
        portal_url: `${appBase}/portal/${row.client_id}`,
        signup_url: `${appBase}/portal-registro/${row.client_id}`,
      });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/public/aprovar/:token', async (req, res) => {
    try {
      const row = await byToken(req.params.token);
      const action = req.body?.action;
      const name = String(req.body?.name || '').trim().slice(0, 80) || (row.team ? 'Equipe' : 'Cliente');
      if (row.team) return res.json(await decideTeam(row, req.body?.action, String(req.body?.notes || '').trim().slice(0, 2000)));
      if (action === 'approve') {
        const { rows: [done] } = await pool.query(
          `UPDATE client_portal_contents SET status = 'aprovado', approved_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND status NOT IN ('aprovado', 'agendado', 'publicado', 'revisao_interna') RETURNING *`, [row.id]
        );
        if (done) {
          await approveContent(done).catch((error) => logger.error('[aprovar] Kanban:', row.id, error.message));
          await pool.query(
            `INSERT INTO client_portal_comments (content_id, author_name, author_type, message) VALUES ($1, $2, 'client', $3)`,
            [row.id, name, '✅ Aprovado pelo link de aprovação (sem login)']
          ).catch(() => {});
        }
        await pool.query(`UPDATE portal_share_links SET decided_at = now(), decision = 'aprovado' WHERE token = $1`, [row.token]);
        return res.json({ success: true, decided: 'aprovado' });
      }
      if (action === 'adjust') {
        const notes = String(req.body?.notes || '').trim().slice(0, 2000);
        if (notes.length < 3) throw httpError(400, 'Conte o que você quer mudar no vídeo');
        const { rows: [done] } = await pool.query(
          `UPDATE client_portal_contents SET status = 'ajuste_solicitado', updated_at = NOW()
            WHERE id = $1 AND status NOT IN ('revisao_interna', 'agendado', 'publicado') RETURNING *`, [row.id]
        );
        if (!done) throw httpError(409, 'Este conteúdo já está agendado ou publicado. Fale com a gente pelo WhatsApp.');
        await pool.query(
          `INSERT INTO client_portal_comments (content_id, author_name, author_type, message) VALUES ($1, $2, 'client', $3)`,
          [row.id, name, `🔧 Ajuste solicitado: ${notes}`]
        );
        await adjustContent(done, notes).catch((error) => logger.error('[aprovar] Kanban:', row.id, error.message));
        await pool.query(`UPDATE portal_share_links SET decided_at = now(), decision = 'ajuste' WHERE token = $1`, [row.token]);
        return res.json({ success: true, decided: 'ajuste' });
      }
      throw httpError(400, 'Ação inválida');
    } catch (error) { sendError(res, error); }
  });

  /** Decisão da equipe: Aprovar = o card vai ao cliente (envio); Pedir alteração = volta ao editor com o pedido. */
  async function decideTeam(row, action, notes) {
    if (!moveCard) throw httpError(501, 'Indisponível');
    if (row.decision || row.status !== 'revisao_interna') throw httpError(409, 'Este vídeo já foi decidido por alguém da equipe.');
    if (!row.content_task_id) throw httpError(409, 'Este vídeo não tem card ligado. Decida pelo sistema.');
    if (action === 'approve') {
      await moveCard(row.content_task_id, 'envio', { human: true, reason: 'Aprovado pela equipe no link de aprovação' });
      await pool.query(`UPDATE portal_team_links SET decided_at = now(), decision = 'aprovado' WHERE token = $1`, [row.token]);
      return { success: true, decided: 'aprovado' };
    }
    if (action === 'adjust') {
      if (notes.length < 3) throw httpError(400, 'Conte o que precisa mudar no vídeo');
      await moveCard(row.content_task_id, 'alteracao', { notes, reason: 'Alteração pedida pela equipe no link de aprovação' });
      await pool.query(`UPDATE portal_team_links SET decided_at = now(), decision = 'ajuste' WHERE token = $1`, [row.token]);
      return { success: true, decided: 'ajuste' };
    }
    throw httpError(400, 'Ação inválida');
  }

  // teste para a equipe (chefe): o link sem login do conteúdo mais recente que espera aprovação, só para quem pediu
  //   POST /api/agent/portal/test-share { only?, client? }
  app.post('/api/agent/portal/test-share', async (req, res) => {
    try {
      if (!verifyAgent || !sendToTeam) throw httpError(501, 'Indisponível');
      const agent = await verifyAgent(req);
      if (agent.role !== 'chefe') throw httpError(403, 'Só a chefe manda o teste');
      await ensureSchema();
      const client = String(req.body?.client || '').trim();
      const { rows: [c] } = await pool.query(
        `SELECT pc.id, pc.title, cl.company_name FROM client_portal_contents pc LEFT JOIN clients cl ON cl.id = pc.client_id
          WHERE pc.status IN ('pendente', 'ajuste_solicitado', 'aprovado') AND pc.file_url IS NOT NULL
            AND ($1 = '' OR cl.company_name ILIKE '%' || $1 || '%')
          ORDER BY (pc.status = 'pendente') DESC, pc.created_at DESC LIMIT 1`, [client]
      );
      if (!c) throw httpError(404, 'Nenhum conteúdo do portal para testar');
      const link = await shareLink(c.id);
      const sent = await sendToTeam(String(req.body?.only || ''), [
        `🧪 *TESTE · página de aprovação sem login* (${String(c.company_name || '').trim()})`,
        `É assim que o cliente que não usa o portal recebe o vídeo "${String(c.title || '').trim()}": abre como no Instagram, com Aprovar e Pedir alteração.`,
        '⚠️ Só olhe: os botões aprovam ou pedem ajuste de verdade.',
        '', link,
      ].join('\n'));
      res.json({ ok: true, link, content: c.title, client: c.company_name, sent_to: sent });
    } catch (error) { sendError(res, error); }
  });

  return { shareLink, teamLink, notifyTeamReview, ensureSchema };
}

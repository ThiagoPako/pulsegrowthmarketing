// ─── Aprovação sem login (pedido do usuário, 02/11/2026) ────────────────────────────────────────────────────────
// "Cliente não acessou o portal: envie o link do vídeo para ele assistir e aprovar em uma página única que funcione
// mesmo sem login… com a identidade visual da Pulse e igual ao Instagram, para ele imaginar como ficaria na rede
// social dele, e embaixo botões para solicitar alteração ou aprovar."
// Cada conteúdo do portal ganha um link com token aleatório (/aprovar/<token>), que vale só para aquele conteúdo.
// Aprovar e pedir ajuste fazem o mesmo que no portal (status, comentário, Kanban e avisos à equipe).
//
//   GET  /api/public/aprovar/:token                  o conteúdo, o cliente e o "perfil" do Instagram dele
//   POST /api/public/aprovar/:token { action: approve|adjust, notes?, name? }

import crypto from 'node:crypto';

const httpError = (status, message) => Object.assign(new Error(message), { status });

export function registerPortalShareRoutes(app, {
  pool, approveContent, adjustContent, publicAppUrl = process.env.PUBLIC_APP_URL || 'https://agenciapulse.tech', logger = console,
  verifyAgent = null, sendToTeam = null,
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

  async function byToken(token) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(token || ''))) throw httpError(404, 'Link não encontrado');
    await ensureSchema();
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
      await pool.query(`UPDATE portal_share_links SET opened_at = coalesce(opened_at, now()) WHERE token = $1`, [row.token]).catch(() => {});
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
        decided: ['aprovado', 'agendado', 'publicado'].includes(row.status) ? 'aprovado' : row.status === 'ajuste_solicitado' ? 'ajuste' : null,
        portal_url: `${appBase}/portal/${row.client_id}`,
        signup_url: `${appBase}/portal-registro/${row.client_id}`,
      });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/public/aprovar/:token', async (req, res) => {
    try {
      const row = await byToken(req.params.token);
      const action = req.body?.action;
      const name = String(req.body?.name || '').trim().slice(0, 80) || 'Cliente';
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

  return { shareLink, ensureSchema };
}

// ─── Campanhas da Ísis → roteiros da Victoria (pedido do usuário, 01/11/2026) ──────────────────────────────────
// A Ísis cria a campanha em RASCUNHO no módulo Campanha (estratégia + peças com data e ideia). A equipe aprova a
// estratégia na tela da campanha; aí cada vídeo sem roteiro vai para a Victoria (um por vez, em segundo plano), o
// roteiro é salvo no cliente preso ao slot (scripts.campaign_slot_id) e o slot fica "roteiro pronto".
//
// Rotas do agente ("Authorization: Agent <chave>", social_media ou chefe):
//   POST /api/agent/campaigns            { client, name, type, objective, start_date, end_date, strategy{}, slots[] }
//   GET  /api/agent/campaigns?client=    campanhas do cliente (ou as últimas 30)
// Rotas da equipe (admin, social media, gestor de projetos):
//   POST /api/campaigns/:id/approve-strategy   rascunho → ativa e manda os vídeos para a Victoria
//   POST /api/campaigns/:id/victoria           manda os vídeos que ainda não têm roteiro
//   GET  /api/campaigns/:id/victoria           andamento (quantos faltam, erro do último)

import crypto from 'node:crypto';
import { normalizeCampaignInput, victoriaRequest } from './lib/campaignIsis.mjs';
import { scriptToHtml } from './lib/victoria.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpError = (status, message) => Object.assign(new Error(message), { status });
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function registerCampaignIsisRoutes(app, { pool, verifyUser, canManage, agentApi, victoria, logger = console }) {
  // andamento por campanha (memória do processo: some num reinício, e aí basta mandar de novo)
  const running = new Map();

  function sendError(res, error) {
    const status = error?.status || error?.statusCode || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) logger.error('[campanha-isis] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function teamUser(req) {
    const { user } = await verifyUser(req);
    if (!(await canManage(user))) throw httpError(403, 'Só admin, social media e gestor de projetos');
    return user;
  }

  async function isisAgent(req) {
    const agent = await agentApi.verifyAgent(req);
    if (!['social_media', 'chefe'].includes(agent.role)) throw httpError(403, 'Só a social media e a chefe criam campanhas');
    return agent;
  }

  async function findClient(value) {
    const v = String(value || '').trim();
    if (!v) throw httpError(400, 'Diga o cliente');
    const { rows } = await pool.query(`SELECT id, company_name FROM clients ORDER BY company_name`);
    if (UUID_RE.test(v)) {
      const hit = rows.find((c) => c.id === v);
      if (!hit) throw httpError(404, 'Cliente não encontrado');
      return hit;
    }
    const q = semAcento(v);
    const exact = rows.filter((c) => semAcento(c.company_name) === q);
    const list = exact.length ? exact : rows.filter((c) => semAcento(c.company_name).includes(q));
    if (!list.length) throw httpError(404, `Nenhum cliente com "${v}"`);
    if (list.length > 1) throw httpError(409, `"${v}" bate com ${list.map((c) => c.company_name.trim()).join(', ')}. Use o nome exato.`);
    return list[0];
  }

  async function loadCampaign(id) {
    if (!UUID_RE.test(String(id || ''))) throw httpError(400, 'Campanha inválida');
    const { rows } = await pool.query(`SELECT * FROM campaigns WHERE id = $1`, [id]);
    if (!rows.length) throw httpError(404, 'Campanha não encontrada');
    return rows[0];
  }

  async function pendingVideoSlots(campaignId) {
    const { rows } = await pool.query(
      `SELECT * FROM campaign_slots WHERE campaign_id = $1 AND kind = 'video' AND script_id IS NULL ORDER BY position`,
      [campaignId]
    );
    return rows;
  }

  // escreve um por vez (cada roteiro leva ~10–30 s na IA); a tela pergunta o andamento
  async function sendToVictoria(campaign) {
    if (running.get(campaign.id)?.active) return running.get(campaign.id);
    const slots = await pendingVideoSlots(campaign.id);
    const state = { active: true, total: slots.length, done: 0, failed: 0, last_error: null, started_at: new Date().toISOString() };
    running.set(campaign.id, state);
    (async () => {
      for (const slot of slots) {
        try {
          const req = victoriaRequest(campaign, slot);
          const reply = await victoria.writeScript({ clientId: campaign.client_id, format: req.format, videoType: req.videoType, text: req.text });
          const id = crypto.randomUUID();
          await pool.query(
            `INSERT INTO scripts (id, client_id, title, content, caption, video_type, content_format, priority, recorded,
                                  is_endomarketing, direct_to_editing, campaign_slot_id, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'normal', false, false, false, $8, $9, now(), now())`,
            [id, campaign.client_id, (reply.titulo || slot.title).slice(0, 200), scriptToHtml(reply.roteiro), reply.legenda || null,
              reply.videoType, reply.format, slot.id, reply.author?.user_id || null]
          );
          // só prende se ninguém prendeu outro roteiro enquanto ela escrevia
          await pool.query(
            `UPDATE campaign_slots SET script_id = $2, status = 'roteiro_pronto', updated_at = now() WHERE id = $1 AND script_id IS NULL`,
            [slot.id, id]
          );
          state.done += 1;
        } catch (error) {
          state.failed += 1;
          state.last_error = `${slot.title}: ${error.message}`;
          logger.error('[campanha-isis] Victoria:', slot.title, error.message);
        }
      }
      state.active = false;
      state.finished_at = new Date().toISOString();
    })();
    return state;
  }

  // ── agente (Ísis) ──
  app.post('/api/agent/campaigns', async (req, res) => {
    try {
      const agent = await isisAgent(req);
      const client = await findClient(req.body?.client);
      const { campaign, slots } = normalizeCampaignInput(req.body);
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const { rows: [row] } = await db.query(
          `INSERT INTO campaigns (client_id, name, type, objective, start_date, end_date, videos_qty, creatives_qty, status, owner_id, editorial)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [client.id, campaign.name, campaign.type, campaign.objective, campaign.start_date, campaign.end_date, campaign.videos_qty,
            campaign.creatives_qty, campaign.status, agent.userId, JSON.stringify({ ...campaign.editorial, isis: { ...campaign.editorial.isis, by: agent.name || 'Ísis' } })]
        );
        for (const s of slots) {
          await db.query(
            `INSERT INTO campaign_slots (campaign_id, position, kind, title, post_date, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [row.id, s.position, s.kind, s.title, s.post_date, s.status, s.notes]
          );
        }
        await db.query('COMMIT');
        res.json({ success: true, id: row.id, client: client.company_name.trim(), status: 'rascunho', videos: campaign.videos_qty, creatives: campaign.creatives_qty });
      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        db.release();
      }
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/agent/campaigns', async (req, res) => {
    try {
      await isisAgent(req);
      const client = req.query.client ? await findClient(req.query.client) : null;
      const { rows } = await pool.query(
        `SELECT c.id, c.name, c.type, c.status, c.start_date, c.end_date, c.videos_qty, c.creatives_qty, cl.company_name AS client,
                (SELECT count(*) FROM campaign_slots s WHERE s.campaign_id = c.id AND s.kind = 'video' AND s.script_id IS NOT NULL)::int AS scripts_ready
           FROM campaigns c LEFT JOIN clients cl ON cl.id = c.client_id
          WHERE ($1::uuid IS NULL OR c.client_id = $1) ORDER BY c.created_at DESC LIMIT 30`,
        [client?.id || null]
      );
      res.json({ campaigns: rows });
    } catch (error) { sendError(res, error); }
  });

  // ── equipe ──
  app.post('/api/campaigns/:id/approve-strategy', async (req, res) => {
    try {
      const user = await teamUser(req);
      const campaign = await loadCampaign(req.params.id);
      if (campaign.status !== 'rascunho') throw httpError(409, 'A campanha não está em rascunho');
      const editorial = { ...(campaign.editorial || {}) };
      editorial.isis = { ...(editorial.isis || {}), approved_by: user.id, approved_at: new Date().toISOString() };
      await pool.query(`UPDATE campaigns SET status = 'ativa', editorial = $2, updated_at = now() WHERE id = $1`, [campaign.id, JSON.stringify(editorial)]);
      const state = await sendToVictoria({ ...campaign, status: 'ativa', editorial });
      res.json({ success: true, status: 'ativa', victoria: state });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/campaigns/:id/victoria', async (req, res) => {
    try {
      await teamUser(req);
      const campaign = await loadCampaign(req.params.id);
      if (campaign.status === 'rascunho') throw httpError(409, 'Aprove a estratégia antes');
      res.json({ success: true, victoria: await sendToVictoria(campaign) });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/campaigns/:id/victoria', async (req, res) => {
    try {
      await teamUser(req);
      const campaign = await loadCampaign(req.params.id);
      const pending = await pendingVideoSlots(campaign.id);
      res.json({ victoria: running.get(campaign.id) || null, pending: pending.length });
    } catch (error) { sendError(res, error); }
  });
}

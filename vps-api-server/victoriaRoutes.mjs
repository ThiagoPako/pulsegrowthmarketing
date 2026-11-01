// ─── Victoria, a roteirista (módulo Copy; pedido do usuário, 01/11/2026) ─────────────────
// Fluxo da tela: cliente → "Criar roteiro" → formato (reels, story, criativo) → conversa com a Victoria. A pessoa fala
// a ideia (texto ou voz), a Victoria devolve o roteiro no padrão da agência, a pessoa corrige e ela refaz. Ela sabe o
// nicho e a linha editorial do cliente (clients), estuda os roteiros já feitos do cliente e os gravados de outros
// clientes (scripts), pesquisa na web o que está funcionando no nicho (ferramenta de busca do Claude, a mesma chave da
// legenda) e transforma cada correção em regra (victoria_lessons: por cliente e geral), usada nos próximos roteiros.
// O roteiro final é salvo pela tela como um roteiro do cliente (scripts), como qualquer roteiro do Copy.
//
// A Victoria também existe como agente (chave com a função 'roteirista' em Configurações → Agentes de edição): o nome
// e a foto dela vêm desse cadastro; ela recebe ensinamentos pelo treino (agentTrainingRoutes.mjs) e lê/grava as regras
// pelas rotas /api/agent/victoria/*.
//
// Rotas da equipe (login):
//   GET    /api/victoria/info?client_id=            quem é a Victoria, o cliente, quantos roteiros e as regras
//   POST   /api/victoria/roteiro                    { client_id, content_format, video_type, conversation, search }
//                                                   conversation: [{ role: 'pedido'|'victoria'|'correcao', text }]
//   GET    /api/victoria/lessons?client_id=         regras (do cliente e gerais)
//   DELETE /api/victoria/lessons/:id                desliga uma regra (admin ou quem corrigiu)
// Rotas do agente (Authorization: Agent <chave>):
//   GET    /api/agent/victoria/lessons?client=      regras (gerais + do cliente, pelo nome)
//   POST   /api/agent/victoria/lessons              (roteirista, chefe) { client?, scope: cliente|geral, rule }

import Anthropic from '@anthropic-ai/sdk';
import {
  VICTORIA_SYSTEM, VICTORIA_FORMATS, VICTORIA_VIDEO_TYPES, buildVictoriaPrompt, parseVictoriaReply,
  normalizeLessons, searchResultUrls,
} from './lib/victoria.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpError = (status, message) => Object.assign(new Error(message), { status });
// o Nginx corta em 120 s: a resposta (com as buscas) precisa caber antes
const DEADLINE_MS = 105_000;

export function registerVictoriaRoutes(app, {
  pool, verifyUser, isStrictAdmin, resolveAiConfig, resolveAiModel, agentApi, logger = console,
}) {
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS victoria_lessons (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID,
          scope TEXT NOT NULL DEFAULT 'cliente',
          rule TEXT NOT NULL,
          source TEXT,
          created_by UUID,
          created_by_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          active BOOLEAN NOT NULL DEFAULT true
        )
      `).then(() => pool.query(`CREATE INDEX IF NOT EXISTS idx_victoria_lessons_client ON victoria_lessons(client_id, active, created_at DESC)`).catch(() => {}))
        .catch((error) => {
          schemaPromise = null;
          throw error;
        });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[victoria] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status || error?.statusCode || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) logger.error('[victoria] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function victoriaProfile() {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.avatar_url FROM agent_keys k JOIN profiles p ON p.id = k.user_id
        WHERE k.role = 'roteirista' AND k.revoked_at IS NULL ORDER BY k.created_at DESC LIMIT 1`
    ).catch(() => ({ rows: [] }));
    const row = rows[0];
    return row
      ? { registered: true, user_id: row.id, name: String(row.name || 'Victoria').trim(), avatar_url: row.avatar_url || null }
      : { registered: false, user_id: null, name: 'Victoria', avatar_url: null };
  }

  async function loadClient(clientId) {
    if (!UUID_RE.test(String(clientId || ''))) throw httpError(400, 'Escolha o cliente');
    const { rows } = await pool.query(
      `SELECT id, company_name, niche, city, editorial FROM clients WHERE id = $1`, [clientId]
    );
    if (!rows.length) throw httpError(404, 'Cliente não encontrado');
    return rows[0];
  }

  async function loadLessons(clientId) {
    const { rows } = await pool.query(
      `(SELECT id, client_id, scope, rule, created_by_name, created_at FROM victoria_lessons
         WHERE active AND client_id = $1 ORDER BY created_at DESC LIMIT 25)
       UNION ALL
       (SELECT id, client_id, scope, rule, created_by_name, created_at FROM victoria_lessons
         WHERE active AND client_id IS NULL ORDER BY created_at DESC LIMIT 25)`,
      [clientId]
    );
    return rows.map((r) => ({ ...r, scope: r.client_id ? 'cliente' : 'geral' }));
  }

  async function saveLessons(lessons, { clientId, user, source }) {
    const saved = [];
    if (!lessons.length) return saved;
    const { rows: [me] } = user ? await pool.query('SELECT name FROM profiles WHERE id = $1', [user.id]) : { rows: [] };
    for (const lesson of lessons) {
      const targetClient = lesson.scope === 'geral' ? null : clientId;
      const { rows: dup } = await pool.query(
        `SELECT 1 FROM victoria_lessons WHERE active AND client_id IS NOT DISTINCT FROM $1 AND lower(rule) = lower($2) LIMIT 1`,
        [targetClient, lesson.rule]
      );
      if (dup.length) continue;
      const { rows: [row] } = await pool.query(
        `INSERT INTO victoria_lessons (client_id, scope, rule, source, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, client_id, scope, rule, created_by_name, created_at`,
        [targetClient, targetClient ? 'cliente' : 'geral', lesson.rule, String(source || '').slice(0, 3000) || null,
          user?.id || null, String(me?.name || user?.name || '').trim() || null]
      );
      saved.push(row);
    }
    return saved;
  }

  async function askClaude({ prompt, search }) {
    const ai = await resolveAiConfig('claude').catch(() => null);
    if (!ai || ai.provider !== 'claude' || !ai.key) throw httpError(503, 'Falta a chave do Claude (Configurações → Integrações → APIs).');
    const started = Date.now();
    const client = new Anthropic({ apiKey: ai.key, timeout: DEADLINE_MS, maxRetries: 0 });
    const model = resolveAiModel(null, 'claude');
    const tools = search
      ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' } }]
      : [];
    const messages = [{ role: 'user', content: prompt }];
    const content = [];
    // a busca na web pode pausar a resposta (pause_turn): continua enquanto houver tempo
    for (let round = 0; round < 3; round++) {
      const remaining = DEADLINE_MS - (Date.now() - started);
      if (remaining < 15_000) break;
      let response;
      try {
        response = await client.beta.messages.create({
          model,
          ...(/^claude-(opus|sonnet)-/i.test(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          system: VICTORIA_SYSTEM,
          messages,
          ...(tools.length ? { tools } : {}),
        }, { timeout: remaining });
      } catch (error) {
        // conta sem a busca na web liberada: escreve sem as referências em vez de falhar
        if (tools.length && error?.status === 400 && /web_search|tool/i.test(String(error?.message || ''))) {
          logger.warn('[victoria] busca na web recusada, seguindo sem ela:', error.message);
          tools.length = 0;
          round--;
          continue;
        }
        if (error?.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(String(error?.message || ''))) {
          throw httpError(504, 'A Victoria demorou demais. Tente de novo (sem a pesquisa na web fica mais rápido).');
        }
        throw error;
      }
      if (response.stop_reason === 'refusal') throw httpError(422, 'A IA não quis escrever esse roteiro. Reformule a ideia.');
      content.push(...response.content);
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }
    const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, content };
  }

  // ── Equipe ──
  app.get('/api/victoria/info', async (req, res) => {
    try {
      await verifyUser(req);
      await ensureSchema();
      const victoria = await victoriaProfile();
      if (!req.query.client_id) return res.json({ victoria });
      const client = await loadClient(req.query.client_id);
      const [{ rows: [counts] }, lessons] = await Promise.all([
        pool.query(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE recorded)::int AS recorded
             FROM scripts WHERE client_id = $1 AND length(coalesce(content, '')) > 50`,
          [client.id]
        ),
        loadLessons(client.id),
      ]);
      res.json({ victoria, client, scripts: counts, lessons });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/victoria/roteiro', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      await ensureSchema();
      const client = await loadClient(req.body?.client_id);
      const format = VICTORIA_FORMATS[req.body?.content_format] ? req.body.content_format : 'reels';
      const videoType = VICTORIA_VIDEO_TYPES[req.body?.video_type] ? req.body.video_type : 'vendas';
      const conversation = (Array.isArray(req.body?.conversation) ? req.body.conversation : [])
        .map((m) => ({ role: ['pedido', 'victoria', 'correcao'].includes(m?.role) ? m.role : 'pedido', text: String(m?.text || '').trim() }))
        .filter((m) => m.text)
        .slice(-20);
      const last = conversation[conversation.length - 1];
      if (!last || last.role === 'victoria') throw httpError(400, 'Fale a ideia ou a correção para a Victoria');

      const [{ rows: ownScripts }, { rows: agencyScripts }, lessons] = await Promise.all([
        pool.query(
          `SELECT title, content, content_format, video_type, recorded FROM scripts
            WHERE client_id = $1 AND length(coalesce(content, '')) > 50
            ORDER BY recorded DESC, (content_format = $2) DESC, updated_at DESC NULLS LAST
            LIMIT 6`,
          [client.id, format]
        ),
        pool.query(
          `SELECT s.title, s.content, s.content_format, s.video_type, s.recorded, c.company_name AS client_name
             FROM scripts s LEFT JOIN clients c ON c.id = s.client_id
            WHERE s.client_id IS DISTINCT FROM $1 AND s.recorded AND s.content_format = $2
              AND length(coalesce(s.content, '')) > 50
            ORDER BY s.updated_at DESC NULLS LAST
            LIMIT 3`,
          [client.id, format]
        ),
        loadLessons(client.id),
      ]);

      const search = req.body?.search === true;
      const prompt = buildVictoriaPrompt({ client, format, videoType, ownScripts, agencyScripts, lessons, conversation, search });
      const { text, content } = await askClaude({ prompt, search });
      const reply = parseVictoriaReply(text);
      if (!reply?.roteiro) throw httpError(502, 'A Victoria não devolveu o roteiro. Tente de novo.');

      // referências: só links que vieram da busca (quando houve busca), para não mostrar link inventado
      const found = searchResultUrls(content);
      if (found.size) reply.referencias = reply.referencias.filter((r) => found.has(r.url));
      else if (!search) reply.referencias = [];

      // correção da equipe → regra para os próximos roteiros
      let learned = [];
      if (last.role === 'correcao') {
        learned = await saveLessons(normalizeLessons(reply.aprendizados), { clientId: client.id, user, source: last.text })
          .catch((error) => {
            logger.error('[victoria] aprendizados:', error.message);
            return [];
          });
      }
      res.json({
        ...reply,
        aprendizados: learned,
        usados: { roteiros_cliente: ownScripts.length, roteiros_agencia: agencyScripts.length, regras: lessons.length, pesquisou: search },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/victoria/lessons', async (req, res) => {
    try {
      await verifyUser(req);
      await ensureSchema();
      const client = await loadClient(req.query.client_id);
      res.json({ lessons: await loadLessons(client.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/victoria/lessons/:id', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      await ensureSchema();
      if (!UUID_RE.test(String(req.params.id || ''))) throw httpError(400, 'Regra inválida');
      const admin = await isStrictAdmin(user);
      const { rowCount } = await pool.query(
        `UPDATE victoria_lessons SET active = false WHERE id = $1 AND active AND ($2::boolean OR created_by = $3)`,
        [req.params.id, admin, user.id]
      );
      if (!rowCount) throw httpError(403, 'Só quem ensinou a regra ou um admin pode tirar');
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Agente (a Victoria no PC, a chefe) ──
  async function clientByName(name) {
    const search = String(name || '').trim();
    if (!search) return null;
    const { rows } = await pool.query(
      `SELECT id, company_name FROM clients WHERE company_name ILIKE '%' || $1 || '%' ORDER BY length(company_name) LIMIT 1`,
      [search]
    );
    if (!rows.length) throw httpError(404, `Cliente "${search}" não encontrado`);
    return rows[0];
  }

  app.get('/api/agent/victoria/lessons', async (req, res) => {
    try {
      await agentApi.verifyAgent(req);
      await ensureSchema();
      const client = await clientByName(req.query.client);
      const lessons = client
        ? await loadLessons(client.id)
        : (await pool.query(
          `SELECT id, client_id, scope, rule, created_by_name, created_at FROM victoria_lessons
            WHERE active AND client_id IS NULL ORDER BY created_at DESC LIMIT 50`
        )).rows;
      res.json({ client: client ? { id: client.id, name: client.company_name } : null, lessons });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/victoria/lessons', async (req, res) => {
    try {
      const agent = await agentApi.verifyAgent(req);
      if (!['roteirista', 'chefe'].includes(agent.role)) throw httpError(403, 'Só a roteirista ou a chefe gravam regras da Victoria');
      await ensureSchema();
      const client = await clientByName(req.body?.client);
      const lessons = normalizeLessons([{ escopo: client ? (req.body?.scope || 'cliente') : 'geral', regra: req.body?.rule }]);
      if (!lessons.length) throw httpError(400, 'Escreva a regra');
      const saved = await saveLessons(lessons, { clientId: client?.id || null, user: { id: agent.userId, name: agent.name }, source: 'agente' });
      res.json({ ok: true, saved });
    } catch (error) {
      sendError(res, error);
    }
  });
}

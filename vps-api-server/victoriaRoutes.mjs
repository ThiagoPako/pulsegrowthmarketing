// ─── Victoria, a roteirista (módulo Copy; pedido do usuário, 01/11/2026) ─────────────────
// Fluxo da tela: cliente → "Criar roteiro" → formato (reels, story, criativo) → conversa com a Victoria. A pessoa fala
// a ideia (texto ou voz), a Victoria devolve o roteiro no padrão da agência, a pessoa corrige e ela refaz. Ela sabe o
// nicho e a linha editorial do cliente (clients), estuda os roteiros já feitos do cliente e os gravados de outros
// clientes (scripts), usa o que está em alta no nicho (pesquisa na web) e transforma cada correção em regra
// (victoria_lessons: por cliente e geral), usada nos próximos roteiros. O roteiro final é salvo pela tela como um
// roteiro do cliente (scripts), como qualquer roteiro do Copy.
//
// Rápida (pedido do usuário, 01/11/2026: "as ferramentas de IA não podem ser demoradas… o agente deve estar
// pré-preparado para entregar rápido"):
//   - ao escolher o cliente, a tela chama /prepare: o contexto do cliente (editorial, roteiros, regras) é montado e
//     guardado na memória, e a pesquisa do nicho roda em segundo plano (guardada 7 dias em victoria_research);
//   - o roteiro é escrito sem buscar na web na hora (usa a pesquisa guardada), pelo Sonnet em esforço baixo, com o
//     contexto do cliente em cache no Claude, e chega à tela enquanto é escrito (streaming, text/event-stream);
//   - o contexto em memória só é refeito quando muda o cliente, os roteiros ou as regras (impressão digital no banco).
//
// A Victoria também existe como agente (chave com a função 'roteirista' em Configurações → Agentes de edição): o nome
// e a foto dela vêm desse cadastro; ela recebe ensinamentos pelo treino (agentTrainingRoutes.mjs) e lê/grava as regras
// pelas rotas /api/agent/victoria/*.
//
// Rotas da equipe (login):
//   GET    /api/victoria/info?client_id=            quem é a Victoria, o cliente, quantos roteiros e as regras
//   POST   /api/victoria/prepare                    { client_id, content_format, video_type } deixa tudo pronto
//   POST   /api/victoria/roteiro                    { client_id, content_format, video_type, conversation, search, stream }
//                                                   conversation: [{ role: 'pedido'|'victoria'|'correcao', text }]
//                                                   stream: true → eventos "delta" { text } e "done" { …roteiro }
//   GET    /api/victoria/lessons?client_id=         regras (do cliente e gerais)
//   DELETE /api/victoria/lessons/:id                desliga uma regra (admin ou quem corrigiu)
// Rotas do agente (Authorization: Agent <chave>):
//   GET    /api/agent/victoria/lessons?client=      regras (gerais + do cliente, pelo nome)
//   POST   /api/agent/victoria/lessons              (roteirista, chefe) { client?, scope: cliente|geral, rule }

import Anthropic from '@anthropic-ai/sdk';
import {
  VICTORIA_SYSTEM, VICTORIA_FORMATS, VICTORIA_VIDEO_TYPES, buildVictoriaContext, buildVictoriaTurns, parseVictoriaReply,
  normalizeLessons, searchResultUrls, researchPrompt, parseResearch,
} from './lib/victoria.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpError = (status, message) => Object.assign(new Error(message), { status });
// o Nginx corta em 120 s; com streaming o texto começa em poucos segundos, mas o total ainda tem de caber
const DEADLINE_MS = 100_000;
const RESEARCH_DAYS = 7;
const CONTEXT_CACHE_MAX = 200;

export function registerVictoriaRoutes(app, {
  pool, verifyUser, isStrictAdmin, resolveAiConfig, resolveAiModel, agentApi, logger = console, env = process.env,
}) {
  const model = () => resolveAiModel(env.PULSE_VICTORIA_MODEL || 'claude-sonnet-5-5', 'claude');
  const fallbackParams = (m) => (/^claude-(opus|sonnet)-/i.test(m) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {});

  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
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
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_victoria_lessons_client ON victoria_lessons(client_id, active, created_at DESC)`).catch(() => {});
        // o que está em alta no nicho, pesquisado na web antes de pedirem (uma por nicho e formato, 7 dias)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS victoria_research (
            niche_key TEXT PRIMARY KEY,
            niche TEXT,
            content_format TEXT,
            text TEXT NOT NULL,
            refs JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
      })().catch((error) => {
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

  async function claude() {
    const ai = await resolveAiConfig('claude').catch(() => null);
    if (!ai || ai.provider !== 'claude' || !ai.key) throw httpError(503, 'Falta a chave do Claude (Configurações → Integrações → APIs).');
    return new Anthropic({ apiKey: ai.key, timeout: DEADLINE_MS, maxRetries: 0 });
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
         WHERE active AND client_id = $1 ORDER BY created_at DESC LIMIT 20)
       UNION ALL
       (SELECT id, client_id, scope, rule, created_by_name, created_at FROM victoria_lessons
         WHERE active AND client_id IS NULL ORDER BY created_at DESC LIMIT 20)`,
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

  // ── Pesquisa do nicho (antes de pedirem) ──
  const nicheKey = (client, format) => `${String(client.niche || client.company_name || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${format}`;
  const researching = new Map(); // niche_key → promessa da pesquisa em andamento

  async function storedResearch(key) {
    const { rows } = await pool.query(
      `SELECT text, refs, created_at FROM victoria_research WHERE niche_key = $1 AND created_at > now() - ($2 || ' days')::interval`,
      [key, String(RESEARCH_DAYS)]
    );
    if (!rows.length) return null;
    const at = new Date(rows[0].created_at);
    return { text: rows[0].text, refs: rows[0].refs || [], date: at.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }), at: rows[0].created_at };
  }

  /** Pesquisa o nicho na web em segundo plano (uma por vez por nicho). Devolve a promessa. */
  function startResearch(client, format) {
    const key = nicheKey(client, format);
    if (!client.niche && !client.company_name) return null;
    if (researching.has(key)) return researching.get(key);
    const job = (async () => {
      const started = Date.now();
      const anthropic = await claude();
      const m = model();
      const messages = [{ role: 'user', content: researchPrompt({ niche: client.niche || client.company_name, format }) }];
      const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'BR', timezone: 'America/Sao_Paulo' } }];
      const content = [];
      for (let round = 0; round < 3; round++) {
        const response = await anthropic.beta.messages.create({
          model: m, ...fallbackParams(m), max_tokens: 4000, output_config: { effort: 'low' }, messages, tools,
        });
        content.push(...response.content);
        if (response.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: response.content });
      }
      const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const research = parseResearch(text, searchResultUrls(content));
      if (!research.text) throw new Error('pesquisa vazia');
      await pool.query(
        `INSERT INTO victoria_research (niche_key, niche, content_format, text, refs, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, now())
         ON CONFLICT (niche_key) DO UPDATE SET text = EXCLUDED.text, refs = EXCLUDED.refs, created_at = now()`,
        [key, client.niche || client.company_name, format, research.text, JSON.stringify(research.refs)]
      );
      logger.log?.(`[victoria] pesquisa do nicho "${key}" pronta em ${Math.round((Date.now() - started) / 1000)} s`);
      return research;
    })().catch((error) => {
      logger.warn?.('[victoria] pesquisa do nicho:', error?.message || error);
      return null;
    }).finally(() => researching.delete(key));
    researching.set(key, job);
    return job;
  }

  // ── Contexto do cliente em memória (refeito só quando muda) ──
  const contexts = new Map(); // `${client}|${format}|${type}` → { fingerprint, context, usados, lessons }

  async function fingerprint(clientId) {
    const { rows: [f] } = await pool.query(
      `SELECT (SELECT md5(coalesce(company_name, '') || coalesce(niche, '') || coalesce(city, '') || coalesce(editorial, '')) FROM clients WHERE id = $1) AS c,
              (SELECT count(*) || ':' || coalesce(max(updated_at)::text, '') FROM scripts WHERE client_id = $1) AS s,
              (SELECT count(*) || ':' || coalesce(max(created_at)::text, '') FROM victoria_lessons WHERE active AND (client_id = $1 OR client_id IS NULL)) AS l`,
      [clientId]
    );
    return `${f.c}|${f.s}|${f.l}`;
  }

  async function clientContext(client, format, videoType, { withResearch }) {
    const key = `${client.id}|${format}|${videoType}`;
    const [fp, research] = await Promise.all([
      fingerprint(client.id),
      withResearch ? storedResearch(nicheKey(client, format)) : null,
    ]);
    const cached = contexts.get(key);
    const researchStamp = research?.at ? String(research.at) : '';
    if (cached && cached.fingerprint === fp && cached.researchStamp === researchStamp) return { ...cached, research, fromCache: true };

    const [{ rows: ownScripts }, { rows: agencyScripts }, lessons] = await Promise.all([
      pool.query(
        `SELECT title, content, content_format, video_type, recorded FROM scripts
          WHERE client_id = $1 AND length(coalesce(content, '')) > 50
          ORDER BY recorded DESC, (content_format = $2) DESC, updated_at DESC NULLS LAST
          LIMIT 5`,
        [client.id, format]
      ),
      pool.query(
        `SELECT s.title, s.content, s.content_format, s.video_type, s.recorded, c.company_name AS client_name
           FROM scripts s LEFT JOIN clients c ON c.id = s.client_id
          WHERE s.client_id IS DISTINCT FROM $1 AND s.recorded AND s.content_format = $2
            AND length(coalesce(s.content, '')) > 50
          ORDER BY s.updated_at DESC NULLS LAST
          LIMIT 2`,
        [client.id, format]
      ),
      loadLessons(client.id),
    ]);
    const entry = {
      fingerprint: fp,
      researchStamp,
      context: buildVictoriaContext({ client, format, videoType, ownScripts, agencyScripts, lessons, research }),
      usados: { roteiros_cliente: ownScripts.length, roteiros_agencia: agencyScripts.length, regras: lessons.length },
    };
    contexts.delete(key);
    contexts.set(key, entry);
    if (contexts.size > CONTEXT_CACHE_MAX) contexts.delete(contexts.keys().next().value);
    return { ...entry, research, fromCache: false };
  }

  function readRequest(body) {
    const format = VICTORIA_FORMATS[body?.content_format] ? body.content_format : 'reels';
    const videoType = VICTORIA_VIDEO_TYPES[body?.video_type] ? body.video_type : 'vendas';
    return { format, videoType };
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

  // A tela chama ao escolher o cliente e o tipo: contexto em memória e pesquisa do nicho em segundo plano
  app.post('/api/victoria/prepare', async (req, res) => {
    try {
      await verifyUser(req);
      await ensureSchema();
      const client = await loadClient(req.body?.client_id);
      const { format, videoType } = readRequest(req.body);
      const ctx = await clientContext(client, format, videoType, { withResearch: true });
      if (!ctx.research) startResearch(client, format);
      res.json({
        ready: true,
        research: ctx.research ? 'pronta' : 'preparando',
        research_date: ctx.research?.date || null,
        usados: ctx.usados,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/victoria/roteiro', async (req, res) => {
    let streaming = false;
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const { user } = await verifyUser(req);
      await ensureSchema();
      const client = await loadClient(req.body?.client_id);
      const { format, videoType } = readRequest(req.body);
      const conversation = (Array.isArray(req.body?.conversation) ? req.body.conversation : [])
        .map((m) => ({ role: ['pedido', 'victoria', 'correcao'].includes(m?.role) ? m.role : 'pedido', text: String(m?.text || '').trim() }))
        .filter((m) => m.text)
        .slice(-20);
      const last = conversation[conversation.length - 1];
      if (!last || last.role === 'victoria') throw httpError(400, 'Fale a ideia ou a correção para a Victoria');

      const started = Date.now();
      const useResearch = req.body?.search !== false;
      const ctx = await clientContext(client, format, videoType, { withResearch: useResearch });
      // sem pesquisa guardada ainda: escreve já e deixa a pesquisa pronta para as próximas
      if (useResearch && !ctx.research) startResearch(client, format);

      const anthropic = await claude();
      const m = model();
      const params = {
        model: m,
        ...fallbackParams(m),
        max_tokens: 4000,
        output_config: { effort: 'low' },
        // regras da Victoria + contexto do cliente em cache no Claude: a correção seguinte relê só a conversa
        system: [
          { type: 'text', text: VICTORIA_SYSTEM },
          { type: 'text', text: ctx.context, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: buildVictoriaTurns(conversation) }],
      };

      let message;
      if (req.body?.stream) {
        streaming = true;
        res.status(200);
        res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
        res.flushHeaders?.();
        const stream = anthropic.beta.messages.stream(params);
        let first = null;
        stream.on('text', (delta) => {
          if (first === null) first = Date.now() - started;
          send('delta', { text: delta });
        });
        message = await stream.finalMessage();
        if (first !== null) logger.log?.(`[victoria] primeiro texto em ${(first / 1000).toFixed(1)} s`);
      } else {
        message = await anthropic.beta.messages.create(params);
      }
      if (message.stop_reason === 'refusal') throw httpError(422, 'A IA não quis escrever esse roteiro. Reformule a ideia.');
      const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const reply = parseVictoriaReply(text);
      if (!reply?.roteiro) throw httpError(502, 'A Victoria não devolveu o roteiro. Tente de novo.');

      // referências: as da pesquisa do nicho guardada (links que vieram da busca na web)
      reply.referencias = useResearch && ctx.research ? (ctx.research.refs || []).slice(0, 3) : [];

      // correção da equipe → regra para os próximos roteiros
      let learned = [];
      if (last.role === 'correcao') {
        learned = await saveLessons(normalizeLessons(reply.aprendizados), { clientId: client.id, user, source: last.text })
          .catch((error) => {
            logger.error('[victoria] aprendizados:', error.message);
            return [];
          });
      }
      const result = {
        ...reply,
        aprendizados: learned,
        usados: { ...ctx.usados, pesquisou: !!(useResearch && ctx.research), contexto_em_cache: ctx.fromCache },
        ms: Date.now() - started,
      };
      if (streaming) {
        send('done', result);
        res.end();
      } else {
        res.json(result);
      }
    } catch (error) {
      if (streaming) {
        const status = error?.status || 500;
        if (status >= 500) logger.error('[victoria] erro:', error);
        // erro da API do Claude: mensagem curta (o detalhe fica no log)
        send('error', { error: error?.error ? `A IA não respondeu (${status}). Tente de novo.` : (error?.message || 'A Victoria não respondeu. Tente de novo.') });
        res.end();
        return;
      }
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

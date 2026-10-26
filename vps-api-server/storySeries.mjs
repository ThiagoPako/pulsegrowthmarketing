// ─── Stories no módulo Agendamentos: link do cliente, lembrete com link e repetição ─────────────────────────
// Registrado pelo scheduling.mjs (mesmas travas: login, Pulse Plus e cidade ativa), com as funções dele.
//
// 1. Link de story por cliente (client_story_links): número de WhatsApp (padrão: o do cadastro do cliente),
//    mensagem pronta, textos do botão ("Clique aqui", "Agende sua consulta", "Fale conosco" e um personalizado,
//    um deles como padrão) e quem posta os stories do cliente. O link é https://wa.me/<número>?text=… e ganha
//    um link curto do encurtador (short_links → agenciapulse.tech/r/<slug>), que conta os cliques.
// 2. Modo do story (scheduled_posts.story_mode): 'auto' = o robô publica (sem link clicável: a API da Meta não
//    aceita o adesivo de link); 'lembrete' = o robô NUNCA publica (o claim do robô, o "Publicar agora" e o
//    runScheduledPostNow pulam a linha). No horário, quem cuida do cliente recebe o aviso no sino e, com o
//    PULSE ligado, no WhatsApp dos números com a permissão "lembretes_stories": vídeo original, link e texto do
//    botão. A pessoa posta pelo app e marca "Postado". Sem "Postado" em 2 horas, o aviso é reforçado uma vez.
//    Trava: reminder_sent_at / reminder_followup_at gravados num UPDATE atômico (FOR UPDATE SKIP LOCKED) antes
//    de avisar; cada aviso sai uma vez só, mesmo com duas instâncias.
// 3. Repetição (story_series): a cada N dias ou em dias da semana, num horário de Brasília, com fim por data,
//    por número de vezes ou sem fim. O gerador grava as ocorrências em scheduled_posts só até 30 dias à frente
//    (na subida, a cada 30 min e ao salvar), com a linha da série travada e a chave única
//    (story_series_id, series_slot_at): rodar duas vezes não duplica, e a data arrastada ou cancelada não volta.
//    Cada ocorrência segue o prepareScheduledPost (conta única por rede, nada no passado) e o robô confere o
//    material antes de publicar (getAutoPostCancelReason aceita o material já publicado pela própria série).
//
// Rotas do módulo (login + Pulse Plus + cidade ativa):
//   GET  /api/scheduling/clients/:id/story-link             link do cliente, cliques e quem pode receber os avisos
//   PUT  /api/scheduling/clients/:id/story-link             { whatsapp, message, custom_text, default_text, responsible_user_id }
//   POST /api/scheduling/stories/series                     { client_id, kind, id, date, time, platform, story_mode,
//                                                             story_link, story_link_text, media_url?, repeat }
//   POST /api/scheduling/stories/series/:id/update          "este e os próximos" { client_id, from_slot, date, time, ..., repeat }
//   POST /api/scheduling/stories/series/:id/cancel          "este e os próximos" { client_id, from_slot? }
//   POST /api/scheduling/stories/occurrence/:postId         "só este" { client_id, date, time, platform, story_mode, story_link, story_link_text }
//   POST /api/scheduling/stories/occurrence/:postId/cancel  "só este" { client_id }
// Lembrete (login; Pulse Plus, quem posta os stories do cliente, admin ou social media; não fala de agentes):
//   GET  /api/story-reminders/:postId
//   POST /api/story-reminders/:postId/posted
//
// Variáveis (opcionais): STORY_SERIES_WINDOW_DAYS=30, STORY_SERIES_TICK_MS=1800000, STORY_REMINDER_TICK_MS=20000,
// STORY_REMINDER_FOLLOWUP_MIN=120, STORY_WORKERS_DISABLED=1 (desliga gerador e avisos; as rotas seguem).

import {
  DEFAULT_BUTTON_TEXTS, listOccurrences, nextOccurrence, normalizeRule, normalizeWhatsAppNumber, occurrenceAt,
  ruleFromRow, ruleSummary, storySlug, whatsappLink,
} from './lib/storyRecurrence.mjs';
import { POSTING_TZ, brtParts, brtToIso, formatBrt } from './lib/postingTime.mjs';
import { clientAllowed, getSettings, logEvent, remember, sendToNumber } from './assistant/common.mjs';

const DAY_MS = 86_400_000;
const MATERIAL_KINDS = new Set(['conteudo', 'arte', 'portal']);
const PLATFORMS = new Set(['instagram', 'facebook', 'both']);
const REMINDER_ROLES = ['admin', 'social_media'];
const GENERATOR_LOCK = 742_100_31; // pg_try_advisory_lock: uma instância gera por vez
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MATERIAL_COLUMN = { conteudo: 'content_task_id', arte: 'design_task_id', portal: 'portal_content_id' };
// Marca da data cancelada com "só este" (a exceção que "este e os próximos" leva para a regra nova)
const ONLY_THIS_CANCELLED = 'Cancelado: só esta data.';

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const envNumber = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const clip = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};
const isoOf = (v) => (v ? new Date(v).toISOString() : null);
/** Link do story: só https (vira <a href> na página do lembrete e vai no sino e no WhatsApp). */
export const isHttpsUrl = (value) => {
  try {
    return new URL(String(value || '').trim()).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Orientação curta do lembrete (a única explicação que aparece na tela e no aviso). */
export function reminderGuidance(button, link) {
  return `Poste pelo app com o adesivo de link na parte de baixo. Botão: ${button || DEFAULT_BUTTON_TEXTS[0]}. Link: ${link || '—'}`;
}

/** Cidade do cliente como em user_cities ('minacu', 'uruacu'); null = cliente da agência (vale nas duas). */
function clientCityValue(client) {
  if (!client || client.is_admin_client) return null;
  const value = String(client.city || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return value || 'minacu';
}

export function registerStoryRoutes(app, deps) {
  const {
    pool, logger = console, publicAppUrl, prepareScheduledPost, getAutoPostCancelReason, verifyUser, hasPulsePlus,
    userHasAnyRole, getLinkedUserIds, ensureShortLinksTables, cityMemberSql, tableHasCityColumn,
    schedulingReady, requireModule, loadClient, withTransaction, httpError, sendError,
    lockMaterial, linksOf, lockLinkedPosts, withoutSeries, assertNotPublished, assertStandalonePortal, defaultMedia,
    upsertDelivery, markScheduled, markUnscheduled, insertHistory, platformLabel, makeMediaHelpers,
  } = deps;
  const appBase = String(publicAppUrl || 'https://agenciapulse.tech').replace(/\/+$/, '');
  const media = makeMediaHelpers(publicAppUrl);
  const WINDOW_DAYS = envNumber('STORY_SERIES_WINDOW_DAYS', 30);
  const GENERATOR_MS = envNumber('STORY_SERIES_TICK_MS', 30 * 60_000);
  const REMINDER_MS = envNumber('STORY_REMINDER_TICK_MS', 20_000);
  const FOLLOWUP_MIN = envNumber('STORY_REMINDER_FOLLOWUP_MIN', 120);
  // Mesma regra de cidade do aviso do portal (notifyPortalTeam): user_cities, ou sem vínculo = Minaçu
  const memberOfCity = cityMemberSql || ((userExpr, param) => `(${param}::text IS NULL
    OR EXISTS (SELECT 1 FROM user_cities uc WHERE uc.user_id::text = ${userExpr}::text AND uc.city::text = ${param}::text)
    OR (${param}::text = 'minacu' AND NOT EXISTS (SELECT 1 FROM user_cities uc WHERE uc.user_id::text = ${userExpr}::text)))`);

  // ── Esquema (aditivo, idempotente). As colunas novas de scheduled_posts ficam no ensureSocialPostsSchema
  // (server.mjs), porque o robô depende delas. Sem coluna city: o gatilho global de cidade não entra aqui. ──
  async function createSchema() {
    await schedulingReady();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_story_links (
        client_id UUID PRIMARY KEY,
        whatsapp TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        custom_text TEXT,
        default_text TEXT NOT NULL DEFAULT 'Clique aqui',
        responsible_user_id UUID,
        wa_url TEXT,
        short_link_id UUID,
        updated_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS story_series (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL,
        material_kind TEXT NOT NULL,
        material_id UUID NOT NULL,
        delivery_id UUID,
        title TEXT,
        thumb_url TEXT,
        platform TEXT NOT NULL DEFAULT 'instagram',
        media_url TEXT NOT NULL,
        story_mode TEXT NOT NULL DEFAULT 'auto',
        story_link TEXT,
        story_link_text TEXT,
        rule_kind TEXT NOT NULL,
        interval_days INTEGER,
        weekdays INTEGER[],
        post_time TEXT NOT NULL,
        start_date DATE NOT NULL,
        end_kind TEXT NOT NULL DEFAULT 'never',
        end_date DATE,
        max_count INTEGER,
        status TEXT NOT NULL DEFAULT 'ativa',
        generated_until TIMESTAMPTZ,
        last_error TEXT,
        parent_series_id UUID,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ended_at TIMESTAMPTZ,
        end_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_story_series_client ON story_series (client_id);
      CREATE INDEX IF NOT EXISTS idx_story_series_active ON story_series (material_kind, material_id) WHERE status = 'ativa';
      CREATE INDEX IF NOT EXISTS idx_scheduled_posts_story_series ON scheduled_posts (story_series_id) WHERE story_series_id IS NOT NULL;
    `);
  }

  let schemaPromise = null;
  function ready() {
    if (!schemaPromise) {
      schemaPromise = createSchema().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }

  // ── Regra da linha da série (a coluna da hora chama post_time; ruleFromRow lê as duas) ──
  const rowRule = (row) => ruleFromRow(row);
  const seriesView = (row, slotAt = null) => {
    const rule = rowRule(row);
    const occurrence = slotAt ? occurrenceAt(rule, isoOf(slotAt)) : null;
    return {
      id: String(row.id), label: ruleSummary(rule), status: row.status, story_mode: row.story_mode, rule,
      slot_at: isoOf(slotAt), index: occurrence ? occurrence.index : null, last_error: row.last_error || null,
    };
  };

  // ── Link do cliente ──
  async function loadLinkRow(clientId, db = pool) {
    const { rows } = await db.query(
      `SELECT l.*, sl.slug AS short_slug, sl.active AS short_active,
              (SELECT count(*)::int FROM short_link_clicks c WHERE c.short_link_id = l.short_link_id) AS clicks
         FROM client_story_links l LEFT JOIN short_links sl ON sl.id = l.short_link_id
        WHERE l.client_id = $1`,
      [clientId]
    );
    return rows[0] || null;
  }

  function linkView(row, client) {
    const whatsapp = row ? row.whatsapp : normalizeWhatsAppNumber(client?.whatsapp);
    const message = row?.message || '';
    const waUrl = row?.wa_url || whatsappLink(whatsapp, message);
    const shortUrl = row?.short_slug && row.short_active !== false ? `${appBase}/r/${row.short_slug}` : null;
    const custom = row?.custom_text || null;
    const texts = [...DEFAULT_BUTTON_TEXTS, ...(custom && !DEFAULT_BUTTON_TEXTS.includes(custom) ? [custom] : [])];
    const defaultText = row?.default_text && texts.includes(row.default_text) ? row.default_text : DEFAULT_BUTTON_TEXTS[0];
    return {
      saved: !!row,
      whatsapp: whatsapp || '',
      message,
      custom_text: custom,
      default_text: defaultText,
      button_texts: texts,
      responsible_user_id: row?.responsible_user_id || null,
      wa_url: waUrl || null,
      short_url: shortUrl,
      url: shortUrl || waUrl || null,
      clicks: row?.clicks || 0,
    };
  }

  async function clientRow(clientId) {
    const { rows } = await pool.query(
      `SELECT id, company_name, logo_url, color, city, whatsapp, status, is_admin_client FROM clients WHERE id = $1`,
      [clientId]
    );
    return rows[0] || null;
  }

  /** Link e botões que vêm preenchidos ao agendar um story deste cliente. */
  async function linkDefaults(clientId) {
    await ready();
    const [row, client] = await Promise.all([loadLinkRow(clientId), clientRow(clientId)]);
    const view = linkView(row, client);
    return { url: view.url, button_texts: view.button_texts, default_text: view.default_text, saved: view.saved };
  }

  /** Quem pode receber os lembretes do cliente: admin e social media que atendem a cidade dele. */
  async function teamFor(client) {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, array_agg(DISTINCT ur.role::text) AS roles
         FROM profiles p JOIN user_roles ur ON ur.user_id::text = p.id::text
        WHERE ur.role::text = ANY($2::text[]) AND ${memberOfCity('p.id', '$1')}
        GROUP BY p.id, p.name ORDER BY p.name`,
      [clientCityValue(client), REMINDER_ROLES]
    );
    return rows.map((r) => ({ id: String(r.id), name: r.name || 'Sem nome', role: r.roles.includes('social_media') ? 'social_media' : 'admin' }));
  }

  async function createShortLink(db, client, url, user) {
    for (let n = 1; n <= 30; n++) {
      const slug = storySlug(client.company_name, n);
      const { rows: taken } = await db.query('SELECT 1 FROM short_links WHERE lower(slug) = $1 LIMIT 1', [slug]);
      if (taken.length) continue;
      const { rows } = await db.query(
        `INSERT INTO short_links (slug, original_url, campaign_name, active, city, created_by)
         VALUES ($1, $2, $3, true, $4, $5) ON CONFLICT (slug) DO NOTHING RETURNING id`,
        [slug, url, `Stories · ${client.company_name}`.slice(0, 120), clientCityValue(client) || 'minacu', user?.id || null]
      );
      if (rows[0]) return rows[0].id;
    }
    return null; // sem link curto: o story usa o wa.me direto
  }

  app.get('/api/scheduling/clients/:clientId/story-link', async (req, res) => {
    try {
      const { city } = await requireModule(req);
      const client = await loadClient(req.params.clientId, city);
      const full = await clientRow(client.id);
      const [row, team] = await Promise.all([loadLinkRow(client.id), teamFor(full)]);
      res.set('Cache-Control', 'no-store');
      res.json({ link: linkView(row, full), team });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/scheduling/clients/:clientId/story-link', async (req, res) => {
    try {
      const { user, city } = await requireModule(req);
      const client = await loadClient(req.params.clientId, city);
      const full = await clientRow(client.id);
      const body = req.body || {};
      const whatsapp = normalizeWhatsAppNumber(body.whatsapp);
      const message = clip(body.message, 500);
      const waUrl = whatsappLink(whatsapp, message);
      if (!waUrl) throw httpError(400, 'Número de WhatsApp inválido (com DDD)');
      const custom = clip(body.custom_text, 30) || null;
      const texts = [...DEFAULT_BUTTON_TEXTS, ...(custom ? [custom] : [])];
      const defaultText = texts.includes(body.default_text) ? body.default_text : DEFAULT_BUTTON_TEXTS[0];
      const team = await teamFor(full);
      const responsible = body.responsible_user_id ? String(body.responsible_user_id) : null;
      if (responsible && !team.some((t) => t.id === responsible)) throw httpError(400, 'Escolha alguém da equipe desta cidade');
      if (typeof ensureShortLinksTables === 'function') await ensureShortLinksTables();

      await withTransaction(async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`story-link:${client.id}`]);
        const { rows: [current] } = await db.query('SELECT * FROM client_story_links WHERE client_id = $1 FOR UPDATE', [client.id]);
        let shortId = current?.short_link_id || null;
        if (shortId) {
          const { rowCount } = await db.query(`UPDATE short_links SET original_url = $2, active = true WHERE id = $1`, [shortId, waUrl]);
          if (!rowCount) shortId = null;
        }
        if (!shortId) shortId = await createShortLink(db, full, waUrl, user);
        await db.query(
          `INSERT INTO client_story_links (client_id, whatsapp, message, custom_text, default_text, responsible_user_id, wa_url, short_link_id, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (client_id) DO UPDATE SET
             whatsapp = EXCLUDED.whatsapp, message = EXCLUDED.message, custom_text = EXCLUDED.custom_text,
             default_text = EXCLUDED.default_text, responsible_user_id = EXCLUDED.responsible_user_id,
             wa_url = EXCLUDED.wa_url, short_link_id = EXCLUDED.short_link_id, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          [client.id, whatsapp, message, custom, defaultText, responsible, waUrl, shortId, user?.id || null]
        );
      });
      res.json({ success: true, link: linkView(await loadLinkRow(client.id), full), team });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Story: campos comuns, conferência e material ──
  function readStoryFields(body) {
    const storyMode = body.story_mode === 'lembrete' ? 'lembrete' : 'auto';
    const platform = PLATFORMS.has(body.platform) ? body.platform : 'instagram';
    // "Postar sozinho" não leva link (a API da Meta não aplica o adesivo); o lembrete leva
    const storyLink = storyMode === 'lembrete' ? (String(body.story_link || '').trim() || null) : null;
    if (storyLink && !isHttpsUrl(storyLink)) throw httpError(400, 'O link do story precisa começar com https://');
    const storyLinkText = storyMode === 'lembrete' ? (clip(body.story_link_text, 40) || DEFAULT_BUTTON_TEXTS[0]) : null;
    return { storyMode, platform, storyLink, storyLinkText };
  }

  /** As regras do prepareScheduledPost para o story (o lembrete não precisa de conta conectada). */
  function validateStory({ clientId, platform, mediaUrl, storyMode, storyLink, storyLinkText, at }) {
    return prepareScheduledPost({
      client_id: clientId, platform, publish_type: 'stories', media_url: mediaUrl, caption: '', scheduled_at: at,
      story_link: storyLink, story_link_text: storyLinkText,
    }, { requireAccounts: storyMode !== 'lembrete' });
  }

  function assertMaterialReady(kind, material) {
    if (kind === 'conteudo' && !['agendamentos', 'acompanhamento'].includes(material.kanban_column)) {
      throw httpError(409, `O card não está aprovado para agendar (está em "${material.kanban_column}").`, { code: 'not_ready' });
    }
    if (kind === 'arte' && material.kanban_column !== 'aprovado') {
      throw httpError(409, `A arte não está aprovada para agendar (está em "${material.kanban_column}").`, { code: 'not_ready' });
    }
    if (kind === 'portal' && !['aprovado', 'agendado'].includes(material.status)) {
      throw httpError(409, 'Este conteúdo não está aprovado para agendar.', { code: 'not_ready' });
    }
  }

  function materialThumb(kind, material, mediaUrl) {
    if (kind === 'portal' && material.thumbnail_url) return media.absolute(material.thumbnail_url);
    if (kind === 'arte' && material.mockup_url) return media.thumbFor(material.mockup_url);
    return media.thumbFor(mediaUrl);
  }

  function readSlot(value) {
    const ms = Date.parse(String(value || ''));
    if (!Number.isFinite(ms)) throw httpError(400, 'Data da repetição inválida');
    return new Date(ms).toISOString();
  }

  async function lockSeries(db, seriesId, clientId) {
    if (!isUuid(seriesId)) throw httpError(400, 'Repetição inválida');
    const { rows } = await db.query(`SELECT * FROM story_series WHERE id = $1 AND client_id = $2 FOR UPDATE`, [seriesId, clientId]);
    if (!rows[0]) throw httpError(404, 'Repetição não encontrada para este cliente');
    return rows[0];
  }

  /** Ocorrência travada: primeiro a série (mesma ordem do gerador), depois a linha. */
  async function lockOccurrence(db, postId, clientId) {
    if (!isUuid(postId)) throw httpError(400, 'Data inválida');
    const { rows: [peek] } = await db.query(
      `SELECT story_series_id FROM scheduled_posts WHERE id = $1 AND client_id = $2 AND story_series_id IS NOT NULL`,
      [postId, clientId]
    );
    if (!peek) throw httpError(404, 'Data da repetição não encontrada');
    const series = await lockSeries(db, String(peek.story_series_id), clientId);
    const { rows: [post] } = await db.query(`SELECT * FROM scheduled_posts WHERE id = $1 FOR UPDATE`, [postId]);
    return { series, post };
  }

  /**
   * Pendentes da série a partir de um horário saem; publicadas e em publicação não mudam. O corte vale pelo
   * horário original (series_slot_at) e também pela data que o calendário mostra (scheduled_at): uma data
   * arrastada para depois do corte sai junto, e nada que a pessoa vê depois do corte continua agendado.
   */
  async function cancelPending(db, seriesId, fromSlot, reason, { except = [] } = {}) {
    const { rows } = await db.query(
      `UPDATE scheduled_posts SET status = 'cancelado', last_error = $3, updated_at = now()
        WHERE story_series_id = $1 AND status IN ('agendado', 'erro')
          AND ($2::timestamptz IS NULL OR series_slot_at >= $2::timestamptz OR scheduled_at >= $2::timestamptz)
          AND NOT (id = ANY($4::uuid[]))
        RETURNING id`,
      [seriesId, fromSlot, reason, except]
    );
    return rows.length;
  }

  /**
   * "Este e os próximos": as exceções feitas com "só este" a partir do corte (data cancelada, mudada de modo, de
   * link, de rede, de hora ou arrastada) passam para a regra nova no mesmo dia, antes de ela gerar as datas.
   * A data cancelada continua cancelada; a mudada guarda o que mudou (a hora nova da regra só entra quando a
   * data não tinha hora própria). Dia que não existe na regra nova: a exceção fica na antiga (e sai junto).
   * Devolve os ids que passaram para a regra nova.
   */
  async function carryExceptions(db, oldSeries, next, rule, cutoffIso) {
    const { rows } = await db.query(
      `SELECT id, status, scheduled_at, series_slot_at FROM scheduled_posts
        WHERE story_series_id = $1 AND series_slot_at >= $2::timestamptz
          AND ((status = 'cancelado' AND last_error = $3)
               OR (status IN ('agendado', 'erro') AND (scheduled_at <> series_slot_at
                   OR story_mode IS DISTINCT FROM $4 OR story_link IS DISTINCT FROM $5
                   OR story_link_text IS DISTINCT FROM $6 OR platform IS DISTINCT FROM $7)))
        ORDER BY series_slot_at
        FOR UPDATE`,
      [oldSeries.id, cutoffIso, ONLY_THIS_CANCELLED, oldSeries.story_mode, oldSeries.story_link,
        oldSeries.story_link_text, oldSeries.platform]
    );
    const carried = [];
    for (const row of rows) {
      const day = brtParts(row.series_slot_at)?.date;
      const dayStart = day ? Date.parse(brtToIso(day, '00:00')) : NaN;
      if (!Number.isFinite(dayStart)) continue;
      const [occ] = listOccurrences(rule, { fromMs: dayStart, toMs: dayStart + DAY_MS - 1, limit: 1 });
      if (!occ || Date.parse(occ.at) < Date.now() + 60_000) continue;
      const ownTime = isoOf(row.scheduled_at) !== isoOf(row.series_slot_at);
      await db.query(
        `UPDATE scheduled_posts
            SET story_series_id = $2, series_slot_at = $3::timestamptz,
                scheduled_at = CASE WHEN $4 THEN scheduled_at ELSE $3::timestamptz END, updated_at = now()
          WHERE id = $1`,
        [row.id, next.id, occ.at, ownTime]
      );
      carried.push(row.id);
    }
    return carried;
  }

  /**
   * Antes de encerrar uma série a partir de uma data além do que já foi gerado (data prevista), grava as datas
   * que ficam antes do corte: senão elas sumiriam sem aviso. Sem conseguir gravar (conta desconectada…), recusa.
   */
  async function materializeBefore(db, series, cutoffIso) {
    const generated = series.generated_until ? Date.parse(series.generated_until) : 0;
    const cutoffMs = Date.parse(cutoffIso);
    if (!(cutoffMs > generated)) return 0;
    return materialize(db, series, { toMs: cutoffMs - 1, strict: true });
  }

  /** Sem repetição ativa e sem nenhum post pendente ou publicado: o material volta para "não agendados". */
  async function restoreMaterialIfIdle(db, series, user) {
    const column = MATERIAL_COLUMN[series.material_kind];
    if (!column) return false;
    const { rows: [state] } = await db.query(
      `SELECT EXISTS (SELECT 1 FROM story_series WHERE material_kind = $1 AND material_id = $2 AND status = 'ativa') AS active_series,
              EXISTS (SELECT 1 FROM scheduled_posts WHERE ${column} = $2 AND status IN ('agendado', 'erro', 'publicando', 'publicado')) AS has_posts`,
      [series.material_kind, series.material_id]
    );
    if (state.active_series || state.has_posts) return false;
    const material = await lockMaterial(db, series.material_kind, String(series.material_id), series.client_id).catch(() => null);
    if (!material) return false;
    const current = material.posting_at ? brtParts(material.posting_at) : null;
    await markUnscheduled(db, { kind: series.material_kind, material, user, currentDate: current?.date || null });
    return true;
  }

  async function endSeries(db, series, status, reason, user = null) {
    await db.query(
      `UPDATE story_series SET status = $2, end_reason = $3, ended_at = now(), updated_at = now() WHERE id = $1`,
      [series.id, status, clip(reason, 300)]
    );
    await restoreMaterialIfIdle(db, { ...series, status }, user);
  }

  /**
   * Grava as ocorrências que faltam até a janela (30 dias) ou até toMs. A linha da série precisa estar travada
   * (FOR UPDATE). Devolve quantas entraram; nada no passado e nada repetido (chave única série + horário).
   * strict: a falha na conferência (conta, mídia) volta como erro em vez de ficar só anotada na série.
   */
  async function materialize(db, series, { now = Date.now(), toMs = null, strict = false } = {}) {
    if (series.status !== 'ativa') return 0;
    const rule = rowRule(series);
    const windowEnd = Number.isFinite(toMs) ? toMs : now + WINDOW_DAYS * DAY_MS;
    const slots = listOccurrences(rule, { fromMs: now + 60_000, toMs: windowEnd });
    if (!slots.length && !Number.isFinite(toMs) && !nextOccurrence(rule, now + 60_000)) {
      await endSeries(db, series, 'encerrada', 'A repetição chegou ao fim.');
      return 0;
    }
    const { rows: existing } = slots.length
      ? await db.query(`SELECT series_slot_at FROM scheduled_posts WHERE story_series_id = $1 AND series_slot_at >= $2`, [series.id, slots[0].at])
      : { rows: [] };
    const taken = new Set(existing.map((r) => isoOf(r.series_slot_at)));
    const fresh = slots.filter((slot) => !taken.has(slot.at));
    let created = 0;
    if (fresh.length) {
      let prepared;
      try {
        prepared = await validateStory({
          clientId: series.client_id, platform: series.platform, mediaUrl: series.media_url, storyMode: series.story_mode,
          storyLink: series.story_link, storyLinkText: series.story_link_text, at: fresh[0].at,
        });
      } catch (error) {
        if (error?.statusCode !== 400 || strict) throw error;
        // conta desconectada, mídia trocada…: guarda o motivo e tenta de novo na próxima volta
        await db.query(`UPDATE story_series SET last_error = $2, updated_at = now() WHERE id = $1`, [series.id, clip(error.message, 500)]);
        return 0;
      }
      const column = MATERIAL_COLUMN[series.material_kind];
      for (const slot of fresh) {
        const { rowCount } = await db.query(
          `INSERT INTO scheduled_posts
             (client_id, delivery_id, ${column}, platform, publish_type, media_url, caption, scheduled_at, created_by,
              story_link, story_link_text, story_mode, story_series_id, series_slot_at)
           VALUES ($1, $2, $3, $4, 'stories', $5, '', $6, $7, $8, $9, $10, $11, $6)
           ON CONFLICT (story_series_id, series_slot_at) WHERE story_series_id IS NOT NULL DO NOTHING`,
          [series.client_id, series.delivery_id || null, series.material_id, prepared.platform, prepared.urls[0], slot.at,
            series.created_by || null, series.story_link, series.story_link_text, series.story_mode, series.id]
        );
        created += rowCount;
      }
    }
    await db.query(
      `UPDATE story_series SET generated_until = $2, last_error = NULL, updated_at = now() WHERE id = $1`,
      [series.id, new Date(windowEnd).toISOString()]
    );
    return created;
  }

  /** Material ainda pede a repetição? (cliente ativo e as mesmas conferências do robô) */
  async function materialProblem(series) {
    const client = await clientRow(series.client_id);
    if (!client) return 'o cliente foi excluído';
    if (client.status === 'cancelado') return 'o cliente foi cancelado';
    const column = MATERIAL_COLUMN[series.material_kind];
    return getAutoPostCancelReason({
      story_series_id: series.id, client_id: series.client_id, delivery_id: series.delivery_id,
      [column]: series.material_id, media_url: series.media_url, media_items: null,
    });
  }

  async function notifyUser(userId, { title, message, type = 'info', link = null, city = null }) {
    if (!userId) return;
    const withCity = !!city && typeof tableHasCityColumn === 'function' && await tableHasCityColumn('notifications');
    await pool.query(
      withCity
        ? `INSERT INTO notifications (user_id, title, message, type, link, city) VALUES ($1, $2, $3, $4, $5, $6)`
        : `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
      [userId, title, clip(message, 500), type, link, ...(withCity ? [city] : [])]
    ).catch((error) => logger.error('[stories] aviso no sino:', error?.message || error));
  }

  async function generateOne(seriesId, { now = Date.now() } = {}) {
    const { rows: [peek] } = await pool.query('SELECT * FROM story_series WHERE id = $1', [seriesId]);
    if (!peek || peek.status !== 'ativa') return 0;
    // Conferência fora da transação (o robô lê pelo pool; a série já está gravada)
    const problem = await materialProblem(peek);
    let ended = null;
    const created = await withTransaction(async (db) => {
      const { rows: [series] } = await db.query(`SELECT * FROM story_series WHERE id = $1 FOR UPDATE`, [seriesId]);
      if (!series || series.status !== 'ativa') return 0;
      if (problem) {
        await cancelPending(db, series.id, null, `Cancelado: ${problem}.`);
        await endSeries(db, series, 'cancelada', problem);
        ended = { series, problem };
        return 0;
      }
      return materialize(db, series, { now });
    });
    if (ended?.series.created_by) {
      const client = await clientRow(ended.series.client_id);
      await notifyUser(ended.series.created_by, {
        title: 'Repetição de stories encerrada',
        message: `${client?.company_name || 'Cliente'}: "${ended.series.title || 'Story'}" saiu da repetição porque ${ended.problem}.`,
        link: `/agendamentos?cliente=${ended.series.client_id}`,
        city: clientCityValue(client),
      });
    }
    return created;
  }

  /**
   * Outra tela (Entregas Social, Kanban de Conteúdo) cancelou as postagens pendentes de uma entrega ou de um card
   * (/api/social-posts/cancel-linked), já com a entrega e o card mudados. A repetição de stories ligada a eles:
   * - continua se o material segue valendo para a repetição (entrega agendada ou postada, card arquivado). O
   *   "Postado" manual marca só a data que já venceu e esperava o "Postado" (o lembrete); as próximas seguem;
   * - acaba se a entrega ou o card saiu do aprovado (alteração, volta de coluna, entrega fora de Agendado,
   *   exclusão): as datas pendentes saem e quem criou a repetição é avisado.
   * Devolve { kept, ended } (ids das séries). Quem chamou deixa de fora do cancelamento as datas das que continuam.
   */
  async function onLinkedCancel({ deliveryId = null, contentTaskId = null, user = null } = {}) {
    await ready();
    deliveryId = isUuid(deliveryId) ? deliveryId : null;
    contentTaskId = isUuid(contentTaskId) ? contentTaskId : null;
    if (!deliveryId && !contentTaskId) return { kept: [], ended: [] };
    const { rows: list } = await pool.query(
      `SELECT * FROM story_series
        WHERE status = 'ativa'
          AND (($1::uuid IS NOT NULL AND delivery_id = $1::uuid)
               OR ($2::uuid IS NOT NULL AND material_kind = 'conteudo' AND material_id = $2::uuid))`,
      [deliveryId, contentTaskId]
    );
    // Lembrete avulso (fora de repetição) de uma entrega marcada como postada: fica "Postado", não cancelado
    await pool.query(
      `UPDATE scheduled_posts sp
          SET status = 'publicado', published_at = now(), manual_posted_by = $3, last_error = NULL,
              result = $4::jsonb, updated_at = now()
         FROM social_media_deliveries d
        WHERE d.id = sp.delivery_id AND d.status = 'postado'
          AND sp.story_mode = 'lembrete' AND sp.story_series_id IS NULL AND sp.status = 'agendado'
          AND (($1::uuid IS NOT NULL AND sp.delivery_id = $1::uuid) OR ($2::uuid IS NOT NULL AND sp.content_task_id = $2::uuid))`,
      [deliveryId, contentTaskId, user?.id || null, JSON.stringify([{ manual: true, via: 'entrega postada' }])]
    );
    const kept = [];
    const ended = [];
    for (const peek of list) {
      const problem = await materialProblem(peek);
      const outcome = await withTransaction(async (db) => {
        const { rows: [series] } = await db.query(`SELECT * FROM story_series WHERE id = $1 FOR UPDATE`, [peek.id]);
        if (!series || series.status !== 'ativa') return null;
        if (problem) {
          await cancelPending(db, series.id, null, `Cancelado: ${problem}.`);
          await endSeries(db, series, 'cancelada', problem, user);
          return { ended: series };
        }
        const { rows: [delivery] } = series.delivery_id
          ? await db.query(`SELECT status FROM social_media_deliveries WHERE id = $1`, [series.delivery_id])
          : { rows: [] };
        if (delivery?.status === 'postado') {
          await db.query(
            `UPDATE scheduled_posts
                SET status = 'publicado', published_at = now(), manual_posted_by = $2, last_error = NULL,
                    result = $3::jsonb, updated_at = now()
              WHERE id = (SELECT id FROM scheduled_posts
                           WHERE story_series_id = $1 AND status = 'agendado' AND scheduled_at <= now()
                           ORDER BY scheduled_at DESC LIMIT 1 FOR UPDATE)`,
            [series.id, user?.id || null, JSON.stringify([{ manual: true, via: 'entrega postada' }])]
          );
        }
        return { kept: series };
      });
      if (outcome?.kept) kept.push(String(outcome.kept.id));
      if (outcome?.ended) {
        ended.push(String(outcome.ended.id));
        if (outcome.ended.created_by) {
          const client = await clientRow(outcome.ended.client_id);
          await notifyUser(outcome.ended.created_by, {
            title: 'Repetição de stories encerrada',
            message: `${client?.company_name || 'Cliente'}: "${outcome.ended.title || 'Story'}" saiu da repetição porque ${problem}.`,
            link: `/agendamentos?cliente=${outcome.ended.client_id}`,
            city: clientCityValue(client),
          });
        }
      }
    }
    return { kept, ended };
  }

  let generating = false;
  /** Todas as séries ativas (uma instância por vez; a chave única segura mesmo assim). */
  async function generateAll({ now = Date.now() } = {}) {
    if (generating) return 0;
    generating = true;
    let lockClient = null;
    try {
      await ready();
      lockClient = await pool.connect();
      const { rows: [{ ok }] } = await lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [GENERATOR_LOCK]);
      if (!ok) return 0;
      let total = 0;
      try {
        const { rows } = await pool.query(`SELECT id FROM story_series WHERE status = 'ativa' ORDER BY created_at`);
        for (const { id } of rows) {
          total += await generateOne(String(id), { now }).catch((error) => {
            logger.error('[stories] repetição', id, error?.message || error);
            return 0;
          });
        }
      } finally {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [GENERATOR_LOCK]).catch(() => {});
      }
      return total;
    } finally {
      lockClient?.release();
      generating = false;
    }
  }

  // ── Lembrete com link ──
  async function reminderContext(post) {
    const client = await clientRow(post.client_id);
    const { rows: [names] } = await pool.query(
      `SELECT coalesce(ct.title, dt.title, pc.title, ss.title) AS title, mp.name AS posted_by_name
         FROM scheduled_posts sp
         LEFT JOIN content_tasks ct ON ct.id = sp.content_task_id
         LEFT JOIN design_tasks dt ON dt.id = sp.design_task_id
         LEFT JOIN client_portal_contents pc ON pc.id = sp.portal_content_id
         LEFT JOIN story_series ss ON ss.id = sp.story_series_id
         LEFT JOIN profiles mp ON mp.id = sp.manual_posted_by
        WHERE sp.id = $1`,
      [post.id]
    );
    // Conferido de novo na saída (a linha pode ter vindo de fora das rotas dos stories): link só https,
    // vídeo só http(s). Fora disso, o link do cliente ou nada. Vale para o sino, o WhatsApp e a página.
    const ownLink = isHttpsUrl(post.story_link) ? String(post.story_link).trim() : null;
    const defaults = ownLink ? null : await linkDefaults(post.client_id);
    const defaultLink = isHttpsUrl(defaults?.url) ? defaults.url : null;
    const mediaUrl = media.absolute(post.media_url);
    const when = brtParts(post.scheduled_at);
    return {
      client,
      title: names?.title || 'Story',
      postedByName: names?.posted_by_name || null,
      link: ownLink || defaultLink,
      button: clip(post.story_link_text, 40) || defaults?.default_text || DEFAULT_BUTTON_TEXTS[0],
      mediaUrl: isHttpUrl(mediaUrl) ? mediaUrl : null,
      when,
      city: clientCityValue(client),
    };
  }

  /** Quem cuida dos stories do cliente; sem ninguém marcado, admin e social media da cidade do cliente. */
  async function reminderRecipients(client) {
    const { rows: [link] } = await pool.query(`SELECT responsible_user_id FROM client_story_links WHERE client_id = $1`, [client.id]);
    if (link?.responsible_user_id) {
      const { rows } = await pool.query(`SELECT id FROM profiles WHERE id = $1`, [link.responsible_user_id]);
      if (rows[0]) return [String(rows[0].id)];
    }
    const { rows } = await pool.query(
      `SELECT DISTINCT ur.user_id FROM user_roles ur
        WHERE ur.role::text = ANY($2::text[]) AND ${memberOfCity('ur.user_id', '$1')}`,
      [clientCityValue(client), REMINDER_ROLES]
    );
    return rows.map((r) => String(r.user_id));
  }

  /** WhatsApp pelo PULSE (ligado) aos números com "lembretes_stories" da cidade; os de quem recebeu no sino primeiro. */
  async function reminderWhatsApp(ctx, recipients, body) {
    const settings = await getSettings(pool).catch(() => ({ enabled: false }));
    if (!settings?.enabled) return 0;
    const { rows: numbers } = await pool.query(
      `SELECT * FROM assistant_numbers WHERE active AND 'lembretes_stories' = ANY(permissions)`
    ).catch(() => ({ rows: [] }));
    const allowed = numbers.filter((n) => clientAllowed(n, ctx.client));
    const own = allowed.filter((n) => n.user_id && recipients.includes(String(n.user_id)));
    const targets = own.length ? own : allowed;
    let sent = 0;
    for (const number of targets) {
      try {
        await sendToNumber(pool, number, body);
        await remember(pool, number.id, 'assistant', body);
        await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'lembrete_story', text: ctx.client.company_name, detail: { client_id: ctx.client.id } });
        sent++;
      } catch (error) {
        logger.error('[stories] lembrete no WhatsApp:', error?.message || error);
      }
    }
    return sent;
  }

  async function remind(post, followup) {
    let problem = null;
    try {
      problem = await getAutoPostCancelReason(post);
    } catch (error) {
      logger.error('[stories] conferência do lembrete:', error?.message || error);
    }
    if (problem) {
      await pool.query(
        `UPDATE scheduled_posts SET status = 'cancelado', last_error = $2, updated_at = now() WHERE id = $1 AND status = 'agendado'`,
        [post.id, `Cancelado antes do lembrete: ${problem}.`]
      );
      return { cancelled: problem };
    }
    const ctx = await reminderContext(post);
    if (!ctx.client) return { skipped: 'sem cliente' };
    const recipients = await reminderRecipients(ctx.client);
    const guidance = reminderGuidance(ctx.button, ctx.link);
    const whenLabel = ctx.when ? formatBrt(ctx.when.date, ctx.when.time) : '';
    const pageLink = `/lembrete-story/${post.id}`;
    const title = followup
      ? `⏰ Story ainda não postado: ${ctx.client.company_name}`
      : `📲 Story para postar: ${ctx.client.company_name}`;
    for (const userId of recipients) {
      await notifyUser(userId, { title, message: `${ctx.title} · ${guidance}`, type: followup ? 'warning' : 'info', link: pageLink, city: ctx.city });
    }
    const body = [
      followup
        ? `⏰ O story de ${ctx.client.company_name} ainda não foi marcado como postado.`
        : `📲 Story para postar agora: ${ctx.client.company_name}`,
      `${ctx.title}${whenLabel ? ` (${whenLabel})` : ''}`,
      ctx.mediaUrl ? `Vídeo: ${ctx.mediaUrl}` : null,
      guidance,
      `Depois marque como postado: ${appBase}${pageLink}`,
    ].filter(Boolean).join('\n');
    const whatsapp = await reminderWhatsApp(ctx, recipients, body);
    return { notified: recipients.length, whatsapp };
  }

  let reminding = false;
  async function processReminders() {
    if (reminding) return { first: 0, followups: 0 };
    reminding = true;
    try {
      await ready();
      // Trava: marca antes de avisar, num UPDATE só (duas instâncias nunca pegam a mesma linha)
      const { rows: due } = await pool.query(
        `UPDATE scheduled_posts SET reminder_sent_at = now(), updated_at = now()
          WHERE id IN (SELECT id FROM scheduled_posts
                        WHERE story_mode = 'lembrete' AND status = 'agendado' AND reminder_sent_at IS NULL AND scheduled_at <= now()
                        ORDER BY scheduled_at LIMIT 10 FOR UPDATE SKIP LOCKED)
            AND reminder_sent_at IS NULL
          RETURNING *`
      );
      for (const post of due) {
        await remind(post, false).catch((error) => logger.error('[stories] lembrete', post.id, error?.message || error));
      }
      const { rows: late } = await pool.query(
        `UPDATE scheduled_posts SET reminder_followup_at = now(), updated_at = now()
          WHERE id IN (SELECT id FROM scheduled_posts
                        WHERE story_mode = 'lembrete' AND status = 'agendado' AND reminder_followup_at IS NULL
                          AND reminder_sent_at <= now() - make_interval(mins => $1::int)
                        ORDER BY scheduled_at LIMIT 10 FOR UPDATE SKIP LOCKED)
            AND reminder_followup_at IS NULL
          RETURNING *`,
        [Math.round(FOLLOWUP_MIN)]
      );
      for (const post of late) {
        await remind(post, true).catch((error) => logger.error('[stories] reforço', post.id, error?.message || error));
      }
      return { first: due.length, followups: late.length };
    } finally {
      reminding = false;
    }
  }

  /** "Postado": o material segue o mesmo caminho de quando o robô publica. */
  async function markMaterialPosted(db, post, user) {
    if (post.delivery_id) {
      await db.query(
        `UPDATE social_media_deliveries SET status = 'postado', posted_at = (now() AT TIME ZONE '${POSTING_TZ}')::date, updated_at = now()
          WHERE id = $1`,
        [post.delivery_id]
      );
    }
    if (post.content_task_id) {
      const { rows: [task] } = await db.query(
        `UPDATE content_tasks SET kanban_column = 'arquivado', updated_at = now()
          WHERE id = $1 AND kanban_column IN ('agendamentos', 'acompanhamento', 'postado') RETURNING id, city`,
        [post.content_task_id]
      );
      if (task) await insertHistory(db, 'conteudo', task, user, 'Postado', 'Story postado pelo app (lembrete com link)');
    }
    if (post.design_task_id) {
      const { rows: [design] } = await db.query(
        `UPDATE design_tasks SET kanban_column = 'postado', updated_at = now() WHERE id = $1 AND kanban_column = 'aprovado' RETURNING id, city`,
        [post.design_task_id]
      );
      if (design) await insertHistory(db, 'arte', design, user, '✅ Postada', 'Story postado pelo app (lembrete com link)');
    }
    if (post.portal_content_id) {
      await db.query(
        `UPDATE client_portal_contents SET status = 'publicado', updated_at = now() WHERE id = $1 AND status IN ('aprovado', 'agendado')`,
        [post.portal_content_id]
      );
    }
    await db.query(
      `INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, '✅ Conteúdo publicado', $2, 'success')`,
      [post.client_id, 'Seu story foi publicado.']
    );
  }

  async function assertReminderAccess(user, clientId) {
    if (typeof hasPulsePlus === 'function' && await hasPulsePlus(user)) return;
    const ids = (await getLinkedUserIds(user).catch(() => [])).map(String);
    if (!ids.length) ids.push(String(user.id));
    const { rows: [link] } = await pool.query(`SELECT responsible_user_id FROM client_story_links WHERE client_id = $1`, [clientId]);
    if (link?.responsible_user_id && ids.includes(String(link.responsible_user_id))) return;
    if (await userHasAnyRole(user, REMINDER_ROLES)) return;
    throw httpError(403, 'Sem acesso a este lembrete');
  }

  function reminderState(post) {
    if (post.status === 'publicado') return 'postado';
    if (post.status === 'cancelado') return 'cancelado';
    if (post.reminder_sent_at) return 'avisado';
    return 'pendente';
  }

  app.get('/api/story-reminders/:postId', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      await ready();
      if (!isUuid(req.params.postId)) throw httpError(404, 'Lembrete não encontrado');
      const { rows: [post] } = await pool.query(
        `SELECT * FROM scheduled_posts WHERE id = $1 AND story_mode = 'lembrete'`,
        [req.params.postId]
      );
      if (!post) throw httpError(404, 'Lembrete não encontrado');
      await assertReminderAccess(user, post.client_id);
      const ctx = await reminderContext(post);
      res.set('Cache-Control', 'no-store');
      res.json({
        reminder: {
          id: String(post.id),
          state: reminderState(post),
          client: ctx.client ? {
            id: String(ctx.client.id), company_name: ctx.client.company_name, logo_url: ctx.client.logo_url || null, color: ctx.client.color || null,
          } : null,
          title: ctx.title,
          media_url: ctx.mediaUrl,
          media_kind: media.kindOf(ctx.mediaUrl) || 'video',
          thumb_url: media.thumbFor(ctx.mediaUrl),
          story_link: ctx.link,
          button_text: ctx.button,
          guidance: reminderGuidance(ctx.button, ctx.link),
          scheduled_at: isoOf(post.scheduled_at),
          when: ctx.when,
          reminder_sent_at: isoOf(post.reminder_sent_at),
          reminder_followup_at: isoOf(post.reminder_followup_at),
          published_at: isoOf(post.published_at),
          posted_by_name: ctx.postedByName,
          last_error: post.status === 'cancelado' ? post.last_error || null : null,
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/story-reminders/:postId/posted', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      await ready();
      if (!isUuid(req.params.postId)) throw httpError(404, 'Lembrete não encontrado');
      const result = await withTransaction(async (db) => {
        const { rows: [post] } = await db.query(
          `SELECT * FROM scheduled_posts WHERE id = $1 AND story_mode = 'lembrete' FOR UPDATE`,
          [req.params.postId]
        );
        if (!post) throw httpError(404, 'Lembrete não encontrado');
        await assertReminderAccess(user, post.client_id);
        if (post.status === 'publicado') return { already: true };
        if (post.status !== 'agendado') throw httpError(409, 'Este lembrete foi cancelado.', { code: 'cancelled' });
        await db.query(
          `UPDATE scheduled_posts
              SET status = 'publicado', published_at = now(), manual_posted_by = $2, last_error = NULL,
                  result = $3::jsonb, updated_at = now()
            WHERE id = $1`,
          [post.id, user.id, JSON.stringify([{ manual: true, via: 'lembrete' }])]
        );
        await markMaterialPosted(db, post, user);
        await db.query(`UPDATE notifications SET read = true WHERE link = $1 AND read IS NOT TRUE`, [`/lembrete-story/${post.id}`]);
        return { already: false };
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Remarcar um lembrete avulso pela Entregas Social: muda só a data e a hora, com o mesmo modo e o mesmo link
  app.post('/api/story-reminders/:postId/reschedule', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      await ready();
      if (!isUuid(req.params.postId)) throw httpError(404, 'Lembrete não encontrado');
      const whenMs = Date.parse(String(req.body?.scheduled_at || ''));
      if (!Number.isFinite(whenMs)) throw httpError(400, 'Escolha a data e a hora');
      if (whenMs < Date.now() - 60_000) throw httpError(400, 'O horário escolhido já passou. Escolha um horário futuro.', { code: 'past_auto' });
      const post = await withTransaction(async (db) => {
        const { rows: [row] } = await db.query(
          `SELECT * FROM scheduled_posts WHERE id = $1 AND story_mode = 'lembrete' FOR UPDATE`,
          [req.params.postId]
        );
        if (!row) throw httpError(404, 'Lembrete não encontrado');
        await assertReminderAccess(user, row.client_id);
        if (row.story_series_id) throw httpError(409, 'Este story faz parte de uma repetição: mude pelo Agendamentos.', { code: 'series_post' });
        if (!['agendado', 'erro'].includes(row.status)) throw httpError(409, 'Este lembrete já foi postado ou cancelado.', { code: 'not_scheduled' });
        const { rows: [moved] } = await db.query(
          `UPDATE scheduled_posts
              SET scheduled_at = $2, status = 'agendado', reminder_sent_at = NULL, reminder_followup_at = NULL, updated_at = now()
            WHERE id = $1 RETURNING id, scheduled_at, story_mode, story_link, story_link_text`,
          [row.id, new Date(whenMs).toISOString()]
        );
        return moved;
      });
      res.json({ success: true, post: { ...post, scheduled_at: isoOf(post.scheduled_at) } });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Repetição: criar ──
  app.post('/api/scheduling/stories/series', async (req, res) => {
    try {
      const { user, city } = await requireModule(req);
      const body = req.body || {};
      const client = await loadClient(body.client_id, city);
      const kind = String(body.kind || '');
      const id = String(body.id || '');
      if (!MATERIAL_KINDS.has(kind) || !isUuid(id)) throw httpError(400, 'Material inválido');
      const fields = readStoryFields(body);
      const rule = normalizeRule({ ...(body.repeat || {}), time: body.time, start_date: body.date });
      const first = nextOccurrence(rule, Date.now() + 60_000);
      if (!first) throw httpError(400, 'Essa repetição não tem nenhuma data futura.', { code: 'no_future' });

      const result = await withTransaction(async (db) => {
        const material = await lockMaterial(db, kind, id, client.id);
        assertMaterialReady(kind, material);
        if (kind === 'portal') await assertStandalonePortal(db, material.id);
        const { rows: active } = await db.query(
          `SELECT 1 FROM story_series WHERE material_kind = $1 AND material_id = $2 AND status = 'ativa' LIMIT 1`,
          [kind, material.id]
        );
        if (active.length) throw httpError(409, 'Este material já tem uma repetição. Mude pelas datas dela.', { code: 'series_active' });
        const links = await linksOf(db, kind, material);
        const posts = withoutSeries(await lockLinkedPosts(db, links));
        assertNotPublished(kind, material, posts);
        const mediaUrl = (typeof body.media_url === 'string' && body.media_url.trim()) || defaultMedia(kind, material)[0];
        const prepared = await validateStory({ clientId: client.id, mediaUrl, ...fields, at: first.at });

        // O post pendente do material sai: a repetição passa a ser o agendamento dele
        const pending = posts.filter((p) => ['agendado', 'erro'].includes(p.status)).map((p) => p.id);
        if (pending.length) {
          await db.query(
            `UPDATE scheduled_posts SET status = 'cancelado', last_error = 'Substituído pela repetição de stories.', updated_at = now()
              WHERE id = ANY($1::uuid[]) AND status IN ('agendado', 'erro')`,
            [pending]
          );
        }
        const deliveryId = await upsertDelivery(db, {
          kind, material, links, client, user, date: first.date, time: first.time, label: platformLabel(prepared.platform),
        });
        const { rows: [series] } = await db.query(
          `INSERT INTO story_series
             (client_id, material_kind, material_id, delivery_id, title, thumb_url, platform, media_url, story_mode,
              story_link, story_link_text, rule_kind, interval_days, weekdays, post_time, start_date, end_kind, end_date,
              max_count, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
           RETURNING *`,
          [client.id, kind, material.id, deliveryId, material.title || null, materialThumb(kind, material, prepared.urls[0]),
            prepared.platform, prepared.urls[0], fields.storyMode, fields.storyLink, fields.storyLinkText,
            rule.kind, rule.interval_days, rule.weekdays, rule.time, rule.start_date, rule.end_kind, rule.end_date,
            rule.max_count, user?.id || null]
        );
        const label = ruleSummary(rule);
        await markScheduled(db, {
          kind, material, client, user, date: first.date, time: first.time, whenIso: first.at,
          detail: `Stories: ${label} · ${platformLabel(prepared.platform)} (${fields.storyMode === 'lembrete' ? 'lembrete' : 'automático'})`,
        });
        const created = await materialize(db, series);
        return { series: seriesView(series), occurrences: created, first: { at: first.at, date: first.date, time: first.time } };
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Repetição: "este e os próximos" (a série antiga termina antes desta data e uma nova segue daqui) ──
  app.post('/api/scheduling/stories/series/:seriesId/update', async (req, res) => {
    try {
      const { user, city } = await requireModule(req);
      const body = req.body || {};
      const client = await loadClient(body.client_id, city);
      const fields = readStoryFields(body);
      const fromSlot = readSlot(body.from_slot);

      const result = await withTransaction(async (db) => {
        const series = await lockSeries(db, req.params.seriesId, client.id);
        if (series.status !== 'ativa') throw httpError(409, 'Esta repetição já terminou: mude só esta data.', { code: 'series_ended' });
        const oldRule = rowRule(series);
        const occurrence = occurrenceAt(oldRule, fromSlot);
        if (!occurrence) throw httpError(400, 'Data da repetição inválida');
        const repeat = body.repeat || {};
        const changes = { ...repeat, time: body.time || oldRule.time, start_date: body.date || occurrence.date };
        // Fim por número de vezes sem mudar: leva só as que faltavam
        if (oldRule.end_kind === 'count' && repeat.end_kind === undefined) {
          Object.assign(changes, { end_kind: 'count', max_count: Math.max(1, oldRule.max_count - occurrence.index) });
        }
        const rule = normalizeRule({ ...oldRule, ...changes });
        const first = nextOccurrence(rule, Date.now() + 60_000);
        if (!first) throw httpError(400, 'Essa repetição não tem nenhuma data futura.', { code: 'no_future' });
        const prepared = await validateStory({ clientId: client.id, mediaUrl: series.media_url, ...fields, at: first.at });

        // Corte da regra antiga: o mais cedo entre a data aberta e o início da regra nova (o "A partir de" pode
        // vir antes), nunca antes de agora. Assim as duas regras nunca ficam agendadas no mesmo dia.
        const startIso = brtToIso(rule.start_date, '00:00');
        let cutoffMs = Math.min(Date.parse(fromSlot), startIso ? Date.parse(startIso) : Infinity);
        cutoffMs = Math.max(cutoffMs, Date.now());
        const cutoff = new Date(cutoffMs).toISOString();
        // Data prevista (além do que já foi gerado): grava antes as datas que ficam antes do corte
        await materializeBefore(db, series, cutoff);

        const { rows: [next] } = await db.query(
          `INSERT INTO story_series
             (client_id, material_kind, material_id, delivery_id, title, thumb_url, platform, media_url, story_mode,
              story_link, story_link_text, rule_kind, interval_days, weekdays, post_time, start_date, end_kind, end_date,
              max_count, parent_series_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
           RETURNING *`,
          [client.id, series.material_kind, series.material_id, series.delivery_id, series.title, series.thumb_url,
            prepared.platform, series.media_url, fields.storyMode, fields.storyLink, fields.storyLinkText,
            rule.kind, rule.interval_days, rule.weekdays, rule.time, rule.start_date, rule.end_kind, rule.end_date,
            rule.max_count, series.id, user?.id || null]
        );
        // "Só este" feito antes (data cancelada, mudada para lembrete, arrastada) segue valendo na regra nova
        const carried = await carryExceptions(db, series, next, rule, cutoff);
        const replaced = await cancelPending(db, series.id, cutoff, 'Substituído: a repetição mudou.', { except: carried });
        await db.query(
          `UPDATE story_series SET status = 'encerrada', end_reason = $2, ended_at = now(), updated_at = now() WHERE id = $1`,
          [series.id, `Mudou a partir de ${formatBrt(occurrence.date, occurrence.time)}`]
        );
        const created = await materialize(db, next);
        return { series: seriesView(next), occurrences: created, replaced, kept: carried.length };
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Repetição: cancelar "este e os próximos" (sem from_slot: todas as pendentes) ──
  app.post('/api/scheduling/stories/series/:seriesId/cancel', async (req, res) => {
    try {
      const { user, city } = await requireModule(req);
      const body = req.body || {};
      const client = await loadClient(body.client_id, city);
      const fromSlot = body.from_slot ? readSlot(body.from_slot) : null;
      const result = await withTransaction(async (db) => {
        const series = await lockSeries(db, req.params.seriesId, client.id);
        if (series.status !== 'ativa') throw httpError(409, 'Esta repetição já terminou: cancele só esta data.', { code: 'series_ended' });
        // Cancelar a partir de uma data prevista: as datas antes dela (ainda não geradas) continuam valendo
        if (fromSlot) await materializeBefore(db, series, fromSlot);
        const cancelled = await cancelPending(db, series.id, fromSlot, 'Cancelado: repetição removida.');
        await db.query(
          `UPDATE story_series SET status = 'cancelada', end_reason = $2, ended_at = now(), updated_at = now() WHERE id = $1`,
          [series.id, fromSlot ? `Cancelada a partir de ${formatBrt(brtParts(fromSlot).date, brtParts(fromSlot).time)}` : 'Cancelada']
        );
        const restored = await restoreMaterialIfIdle(db, { ...series, status: 'cancelada' }, user);
        return { cancelled, restored };
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Ocorrência: "só este" (data, hora, modo e botão só desta data; o horário original da série fica guardado) ──
  app.post('/api/scheduling/stories/occurrence/:postId', async (req, res) => {
    try {
      const { city } = await requireModule(req);
      const body = req.body || {};
      const client = await loadClient(body.client_id, city);
      const whenIso = brtToIso(String(body.date || ''), String(body.time || ''));
      if (!whenIso) throw httpError(400, 'Escolha a data e a hora');
      if (Date.parse(whenIso) < Date.now() - 60_000) {
        throw httpError(400, 'O horário escolhido já passou. Escolha um horário futuro.', { code: 'past_auto' });
      }
      const fields = readStoryFields(body);
      const result = await withTransaction(async (db) => {
        const { post } = await lockOccurrence(db, req.params.postId, client.id);
        if (post.status === 'publicando') throw httpError(409, 'Este post está sendo publicado agora.', { code: 'publishing' });
        if (!['agendado', 'erro'].includes(post.status)) throw httpError(409, 'Esta data já foi publicada ou cancelada.', { code: 'not_scheduled' });
        const prepared = await validateStory({ clientId: client.id, mediaUrl: post.media_url, ...fields, at: whenIso });
        await db.query(
          `UPDATE scheduled_posts
              SET scheduled_at = $2, platform = $3, story_mode = $4, story_link = $5, story_link_text = $6,
                  status = 'agendado', attempts = 0, last_error = NULL,
                  reminder_sent_at = NULL, reminder_followup_at = NULL, updated_at = now()
            WHERE id = $1`,
          [post.id, whenIso, prepared.platform, fields.storyMode, fields.storyLink, fields.storyLinkText]
        );
        const parts = brtParts(whenIso);
        return { when: { at: whenIso, date: parts.date, time: parts.time } };
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/scheduling/stories/occurrence/:postId/cancel', async (req, res) => {
    try {
      const { user, city } = await requireModule(req);
      const body = req.body || {};
      const client = await loadClient(body.client_id, city);
      const result = await withTransaction(async (db) => {
        const { series, post } = await lockOccurrence(db, req.params.postId, client.id);
        if (post.status === 'publicando') throw httpError(409, 'Este post está sendo publicado agora.', { code: 'publishing' });
        if (!['agendado', 'erro'].includes(post.status)) throw httpError(409, 'Esta data já foi publicada ou cancelada.', { code: 'not_scheduled' });
        await db.query(
          `UPDATE scheduled_posts SET status = 'cancelado', last_error = $2, updated_at = now() WHERE id = $1`,
          [post.id, ONLY_THIS_CANCELLED]
        );
        // Repetição que não tem mais nenhuma data: termina (e o material volta, se nada saiu)
        if (series.status === 'ativa' && !nextOccurrence(rowRule(series), Date.now() + 60_000)) {
          const { rows: [left] } = await db.query(
            `SELECT count(*)::int AS n FROM scheduled_posts WHERE story_series_id = $1 AND status IN ('agendado', 'erro', 'publicando')`,
            [series.id]
          );
          if (!left.n) await endSeries(db, series, 'encerrada', 'Todas as datas foram canceladas.', user);
        } else if (series.status !== 'ativa') {
          await restoreMaterialIfIdle(db, series, user);
        }
        return {};
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Laços: gerador (subida + a cada 30 min) e avisos (a cada 20 s) ──
  if (process.env.STORY_WORKERS_DISABLED !== '1') {
    ready().then(() => {
      generateAll().catch((error) => logger.error('[stories] gerador:', error?.message || error));
      setInterval(() => {
        generateAll().catch((error) => logger.error('[stories] gerador:', error?.message || error));
      }, GENERATOR_MS);
      setInterval(() => {
        processReminders().catch((error) => logger.error('[stories] lembretes:', error?.message || error));
      }, REMINDER_MS);
    }).catch((error) => logger.error('[stories] esquema não criado:', error?.message || error));
  }

  return { ready, linkDefaults, generateAll, generateOne, processReminders, seriesView, onLinkedCancel };
}

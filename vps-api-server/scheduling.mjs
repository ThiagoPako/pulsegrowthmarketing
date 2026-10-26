// ─── Agendamentos: calendário de postagem por cliente ───────────────────────────
// Materiais aprovados do cliente (vídeos do Kanban de Conteúdo, artes aprovadas e conteúdos
// aprovados no portal sem card) com a data e hora de postagem. Agendar com conta conectada
// cria o post automático (scheduled_posts, mesmas regras do Estúdio via prepareScheduledPost);
// sem conta, grava só a data. Arrastar no calendário troca a data e mantém a hora.
//
// Acesso: Pulse Plus (pulsePlus.mjs, module_access com module = 'pulse_plus'), marcado na tela Equipe por
// um admin com Pulse Plus. A lista antiga 'agendamentos' continua semeada (é dela que o Pulse Plus copiou
// as primeiras pessoas), mas não libera mais o módulo.
//
// Rotas (login + Pulse Plus + cidade ativa):
//   GET  /api/me/module-access                         módulos liberados para quem está logado
//   GET  /api/scheduling/clients                       clientes da cidade com contadores
//   GET  /api/scheduling/clients/:id/materials?from=&to=   agendados no período e não agendados
//   POST /api/scheduling/schedule    { client_id, kind, id, date, time, mode, platform, publish_type, caption, story_link, ... }
//   POST /api/scheduling/reschedule  { client_id, kind, id, date, time?, allow_past? }  sem time: mantém a hora
//   POST /api/scheduling/cancel      { client_id, kind, id }
// kind: conteudo (content_tasks) | arte (design_tasks) | portal (client_portal_contents) | post (scheduled_posts sem material)
// Stories (link do cliente, "Lembrete com link" e repetição): storySeries.mjs, registrado no fim deste arquivo.
// As ocorrências de uma repetição aparecem como itens 'post' (cada uma arrasta sozinha); as datas além da janela
// já gerada aparecem como 'serie' (previstas, só abrem a repetição).
//
// Banco (aditivo): posting_at em content_tasks, design_tasks e client_portal_contents; design_task_id e
// portal_content_id em scheduled_posts; gatilhos que mantêm posting_at igual ao que as outras telas
// gravam (Entregas Social, Kanban de Conteúdo, Estúdio e a fila de postagem).

import { POSTING_TZ, DATE_KEY_RE, TIME_RE, brtParts, brtToIso, formatBrt } from './lib/postingTime.mjs';
import { listOccurrences, occurrenceAt, ruleFromRow, ruleSummary } from './lib/storyRecurrence.mjs';
import { registerStoryRoutes } from './storySeries.mjs';

export const SCHEDULING_MODULE = 'agendamentos';

const ACTIVE_POST_STATUSES = new Set(['agendado', 'publicando', 'erro']);
const KINDS = new Set(['conteudo', 'arte', 'portal', 'post']);
// Formatos de arte que não vão para o feed (impressão, logo, capa de destaque, thumbnail)
const NON_SOCIAL_DESIGN_FORMATS = ['midia_fisica', 'logomarca', 'thumbnail', 'capa'];
const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANGE_DAYS = 100;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Conteúdo do portal sem card ("avulso") que entra no módulo. O vínculo do portal com o card/arte só
// existe desde 25/10/2026 e o histórico ficou sem ele: um vídeo já postado em maio voltaria como "não
// agendado" e seria publicado de novo. Entra só a linha sem vínculo, sem card nem arte do cliente com o
// mesmo título (qualquer coluna e data) e que é aprovação recente (45 dias) ou já foi agendada aqui
// (posting_at e o post automático só são gravados por este módulo). Mesma regra na lista, no contador
// e ao agendar/remarcar.
const PORTAL_STANDALONE_MAX_AGE_DAYS = 45;
export function standalonePortalSql(alias = 'pc') {
  return `(${alias}.content_task_id IS NULL AND ${alias}.design_task_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM content_tasks sct
                     WHERE sct.client_id = ${alias}.client_id
                       AND lower(btrim(coalesce(sct.title, ''))) = lower(btrim(coalesce(${alias}.title, ''))))
    AND NOT EXISTS (SELECT 1 FROM design_tasks sdt
                     WHERE sdt.client_id = ${alias}.client_id
                       AND 'arte: ' || lower(btrim(coalesce(sdt.title, ''))) = lower(btrim(coalesce(${alias}.title, ''))))
    AND (
      (${alias}.status = 'aprovado'
        AND coalesce(${alias}.approved_at, ${alias}.created_at) >= now() - interval '${PORTAL_STANDALONE_MAX_AGE_DAYS} days')
      OR ${alias}.posting_at IS NOT NULL
      OR EXISTS (SELECT 1 FROM scheduled_posts ssp
                  WHERE ssp.portal_content_id = ${alias}.id AND ssp.status IN ('agendado', 'publicando', 'erro'))
    ))`;
}

function httpError(statusCode, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

function sendError(res, error, logger) {
  const status = error?.statusCode
    || (error?.message === 'Unauthorized' ? 401 : error?.message === 'Admin access required' ? 403 : 500);
  if (status >= 500) logger.error('[agendamentos]', error?.message || error);
  res.status(status).json({ error: error?.message || 'Erro interno', ...(error?.code ? { code: error.code } : {}) });
}

// ── Mídia e miniaturas (só links; nada de baixar vídeo) ──
function driveFileId(url) {
  const m = String(url || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  return m ? m[1] : null;
}

function makeMediaHelpers(publicAppUrl) {
  const base = String(publicAppUrl || 'https://agenciapulse.tech').replace(/\/+$/, '');
  const absolute = (url) => {
    const u = String(url || '').trim();
    if (!u) return null;
    if (u.startsWith('/uploads/')) return `${base}${u}`;
    return u;
  };
  const thumbFor = (url) => {
    const u = absolute(url);
    if (!u) return null;
    if (IMAGE_RE.test(u)) return u;
    const id = driveFileId(u);
    return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w320` : null;
  };
  const kindOf = (url) => {
    const u = String(url || '');
    if (VIDEO_RE.test(u)) return 'video';
    if (IMAGE_RE.test(u)) return 'image';
    return null;
  };
  return { absolute, thumbFor, kindOf };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function platformLabel(platform) {
  if (platform === 'facebook') return 'Facebook';
  if (platform === 'instagram') return 'Instagram';
  return 'Instagram, Facebook';
}

/** Cor do calendário: reels, story, carrossel, arte ou feed. */
function visualType({ kind, contentType, publishType, formatType, mediaCount }) {
  if (publishType === 'stories') return 'story';
  if (publishType === 'carousel') return 'carrossel';
  if (publishType === 'reels') return 'reels';
  const ct = String(contentType || formatType || '').toLowerCase();
  if (ct.startsWith('story') || ct === 'stories') return 'story';
  if (ct.startsWith('carros') || ct === 'carousel' || mediaCount > 1) return 'carrossel';
  if (kind === 'arte' || ct === 'arte' || ct === 'foto') return 'arte';
  if (ct.startsWith('reel') || ct === 'otimizacao' || ct === 'video') return 'reels';
  return kind === 'post' && publishType === 'feed' ? 'feed' : (kind === 'conteudo' ? 'reels' : 'feed');
}

function newestFirst(a, b) {
  return Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0);
}

/** Instante → { at, date, time } no fuso de Brasília. */
function whenFromInstant(value) {
  if (!value) return null;
  const parts = brtParts(value);
  if (!parts) return null;
  return { at: new Date(value).toISOString(), date: parts.date, time: parts.time };
}

/** Dia (e hora, se houver) de Brasília gravados à parte (entregas e Kanban antigos). */
function whenFromLocal(dateValue, timeValue) {
  const date = String(dateValue || '').slice(0, 10);
  if (!DATE_KEY_RE.test(date)) return null;
  const time = String(timeValue || '').trim().slice(0, 5);
  if (TIME_RE.test(time)) return { at: brtToIso(date, time), date, time };
  return { at: null, date, time: null };
}

function postSummary(p) {
  if (!p) return null;
  return {
    id: p.id,
    status: p.status,
    platform: p.platform,
    publish_type: p.publish_type,
    caption: p.caption || '',
    media_url: p.media_url || null,
    media_items: parseJsonArray(p.media_items).map((i) => (typeof i === 'string' ? i : i?.url)).filter(Boolean),
    story_link: p.story_link || null,
    story_link_text: p.story_link_text || null,
    scheduled_at: p.scheduled_at ? new Date(p.scheduled_at).toISOString() : null,
    published_at: p.published_at ? new Date(p.published_at).toISOString() : null,
    last_error: p.last_error || null,
    story_mode: p.story_mode || null,
    reminder_sent_at: p.reminder_sent_at ? new Date(p.reminder_sent_at).toISOString() : null,
    reminder_followup_at: p.reminder_followup_at ? new Date(p.reminder_followup_at).toISOString() : null,
    manual_posted: !!p.manual_posted_by,
  };
}

const isoOf = (v) => (v ? new Date(v).toISOString() : null);

/** Material da ocorrência de uma repetição (a série guarda o material; o post tem a mesma ligação). */
function materialKeyOfPost(p) {
  if (p.content_task_id) return `conteudo:${p.content_task_id}`;
  if (p.design_task_id) return `arte:${p.design_task_id}`;
  if (p.portal_content_id) return `portal:${p.portal_content_id}`;
  return null;
}

/** Resumo da repetição para a tela (regra, situação e o número da ocorrência). */
export function seriesInfo(series, slotAt) {
  const rule = ruleFromRow(series);
  const slot = isoOf(slotAt);
  const occurrence = slot ? occurrenceAt(rule, slot) : null;
  return {
    id: String(series.id),
    label: ruleSummary(rule),
    status: series.status,
    story_mode: series.story_mode,
    rule,
    slot_at: slot,
    index: occurrence ? occurrence.index : null,
  };
}

/**
 * Monta os itens do calendário e a lista de não agendados a partir das linhas do banco.
 * Período em dias de Brasília (from/to inclusivos).
 */
export function buildMaterials(rows, { from, to, publicAppUrl, now = Date.now() } = {}) {
  const { tasks = [], designs = [], portals = [], deliveries = [], posts = [], scripts = [], series = [] } = rows;
  const media = makeMediaHelpers(publicAppUrl);
  const inRange = (when) => !!when && when.date >= from && when.date <= to;

  // Repetição de stories: cada ocorrência aparece sozinha. Enquanto a repetição vale (ativa ou com datas
  // pendentes), o material não aparece nem em "não agendados" nem como item próprio; depois que ela publicou,
  // o material publicado também não (as ocorrências publicadas já mostram).
  const seriesById = new Map(series.map((sr) => [String(sr.id), sr]));
  const seriesMaterial = new Map();
  const markSeries = (key, field) => {
    if (!key) return;
    const st = seriesMaterial.get(key) || { busy: false, published: false };
    st[field] = true;
    seriesMaterial.set(key, st);
  };
  for (const sr of series) if (sr.status === 'ativa') markSeries(`${sr.material_kind}:${sr.material_id}`, 'busy');
  for (const p of posts) {
    if (!p.story_series_id) continue;
    const sr = seriesById.get(String(p.story_series_id));
    const key = sr ? `${sr.material_kind}:${sr.material_id}` : materialKeyOfPost(p);
    if (ACTIVE_POST_STATUSES.has(p.status)) markSeries(key, 'busy');
    if (p.status === 'publicado') markSeries(key, 'published');
  }
  const materialInfo = new Map(); // chave do material → miniatura (para as ocorrências)

  const scriptCaption = new Map(scripts.map((s) => [String(s.id), s.caption || '']));
  const deliveriesByTask = new Map();
  for (const d of deliveries) {
    const key = String(d.content_task_id);
    const prev = deliveriesByTask.get(key);
    if (!prev || Date.parse(d.updated_at || d.created_at || 0) > Date.parse(prev.updated_at || prev.created_at || 0)) deliveriesByTask.set(key, d);
  }
  const deliveryIdsByTask = new Map();
  for (const d of deliveries) {
    const key = String(d.content_task_id);
    deliveryIdsByTask.set(key, [...(deliveryIdsByTask.get(key) || []), String(d.id)]);
  }
  const portalByTask = new Map();
  const portalByDesign = new Map();
  for (const p of portals) {
    if (p.content_task_id && !portalByTask.has(String(p.content_task_id))) portalByTask.set(String(p.content_task_id), p);
    if (p.design_task_id && !portalByDesign.has(String(p.design_task_id))) portalByDesign.set(String(p.design_task_id), p);
  }
  const index = (field) => {
    const map = new Map();
    for (const p of posts) {
      if (!p[field] || p.story_series_id) continue;
      const key = String(p[field]);
      map.set(key, [...(map.get(key) || []), p]);
    }
    return map;
  };
  const postsByTask = index('content_task_id');
  const postsByDelivery = index('delivery_id');
  const postsByDesign = index('design_task_id');
  const postsByPortal = index('portal_content_id');
  const usedPosts = new Set();

  const scheduled = [];
  const unscheduled = [];

  const pickPosts = (list) => {
    const unique = [...new Map(list.map((p) => [String(p.id), p])).values()];
    unique.forEach((p) => usedPosts.add(String(p.id)));
    const sorted = unique.sort(newestFirst);
    return {
      active: sorted.find((p) => ACTIVE_POST_STATUSES.has(p.status)) || null,
      published: sorted.find((p) => p.status === 'publicado') || null,
      cancelled: sorted.find((p) => p.status === 'cancelado') || null,
    };
  };

  const pushScheduled = (item) => { if (inRange(item.when)) scheduled.push(item); };
  // Post cancelado de um material que voltou para "não agendados": aparece apagado no dia em que estava.
  const pushGhost = (base, cancelled) => {
    if (!cancelled) return;
    const when = whenFromInstant(cancelled.scheduled_at);
    pushScheduled({ ...base, key: `${base.key}:cancelado:${cancelled.id}`, when, state: 'cancelado', mode: 'auto', locked: true, ghost: true, post: postSummary(cancelled) });
  };
  const fromPost = (base, active, published) => {
    if (active) {
      return { ...base, when: whenFromInstant(active.scheduled_at), state: active.status, mode: 'auto', locked: active.status !== 'agendado', post: postSummary(active) };
    }
    return { ...base, when: whenFromInstant(published.published_at || published.scheduled_at), state: 'publicado', mode: 'auto', locked: true, post: postSummary(published) };
  };

  // ── Vídeos do Kanban de Conteúdo ──
  for (const t of tasks) {
    const id = String(t.id);
    const delivery = deliveriesByTask.get(id) || null;
    const related = [...(postsByTask.get(id) || [])];
    for (const did of deliveryIdsByTask.get(id) || []) related.push(...(postsByDelivery.get(did) || []));
    const { active, published, cancelled } = pickPosts(related);
    const portal = portalByTask.get(id) || null;
    const portalFile = media.absolute(portal?.file_url);
    const mediaUrl = portalFile && media.kindOf(portalFile) ? portalFile : (media.absolute(t.edited_video_link) || portalFile);
    const current = active || published;
    const base = {
      key: `conteudo:${id}`,
      kind: 'conteudo',
      id,
      title: t.title || 'Vídeo',
      content_type: t.content_type || null,
      type: visualType({ kind: 'conteudo', contentType: t.content_type, publishType: current?.publish_type }),
      column: t.kanban_column,
      approved_at: t.approved_at || portal?.approved_at || null,
      thumb_url: media.absolute(portal?.thumbnail_url) || media.thumbFor(mediaUrl),
      media_url: mediaUrl,
      media_kind: media.kindOf(mediaUrl) || 'video',
      media_items: mediaUrl ? [mediaUrl] : [],
      caption: current?.caption || scriptCaption.get(String(t.script_id)) || '',
      platform_label: delivery?.platform || null,
    };
    materialInfo.set(base.key, { thumb_url: base.thumb_url, media_kind: base.media_kind });
    const inSeries = seriesMaterial.get(base.key);
    if (inSeries?.busy && !active) continue;

    if (t.kanban_column === 'arquivado') {
      if (!published && inSeries?.published) continue;
      const when = published
        ? whenFromInstant(published.published_at || published.scheduled_at)
        : (whenFromInstant(t.posting_at)
          || (delivery?.status === 'postado' ? whenFromLocal(delivery.posted_at, delivery.scheduled_time) : null));
      if (when) pushScheduled({ ...base, when, state: 'publicado', mode: published ? 'auto' : 'manual', locked: true, post: postSummary(published) });
      continue;
    }
    if (active || (t.kanban_column === 'acompanhamento' && published)) {
      pushScheduled(fromPost(base, active, published));
      continue;
    }
    if (t.kanban_column === 'acompanhamento') {
      const when = whenFromInstant(t.posting_at)
        || (['agendado', 'postado'].includes(delivery?.status) ? whenFromLocal(delivery?.posted_at, delivery?.scheduled_time) : null)
        || whenFromLocal(t.scheduled_recording_date, t.scheduled_recording_time);
      if (!when) { unscheduled.push({ ...base, state: 'nao_agendado' }); continue; }
      const posted = delivery?.status === 'postado';
      pushScheduled({ ...base, when, state: posted ? 'publicado' : 'manual', mode: 'manual', locked: posted, post: null });
      continue;
    }
    // agendamentos: aprovado esperando data
    unscheduled.push({ ...base, state: 'nao_agendado' });
    pushGhost(base, cancelled);
  }

  // ── Artes aprovadas ──
  for (const d of designs) {
    const id = String(d.id);
    const { active, published, cancelled } = pickPosts(postsByDesign.get(id) || []);
    let urls = parseJsonArray(d.attachment_urls).filter((u) => typeof u === 'string' && u);
    if (d.attachment_url) urls.push(d.attachment_url);
    urls = [...new Set(urls.map(media.absolute).filter(Boolean))];
    if (!urls.length && d.mockup_url) urls = [media.absolute(d.mockup_url)];
    const portal = portalByDesign.get(id) || null;
    const current = active || published;
    const base = {
      key: `arte:${id}`,
      kind: 'arte',
      id,
      title: d.title || 'Arte',
      content_type: d.format_type || 'arte',
      type: visualType({ kind: 'arte', formatType: d.format_type, publishType: current?.publish_type, mediaCount: urls.length }),
      column: d.kanban_column,
      approved_at: d.client_approved_at || d.completed_at || portal?.approved_at || null,
      thumb_url: media.thumbFor(d.mockup_url) || urls.map(media.thumbFor).find(Boolean) || null,
      media_url: urls[0] || null,
      media_kind: 'image',
      media_items: urls,
      caption: current?.caption || '',
      platform_label: null,
    };
    materialInfo.set(base.key, { thumb_url: base.thumb_url, media_kind: base.media_kind });
    const inSeries = seriesMaterial.get(base.key);
    if (inSeries?.busy && !active) continue;
    // Em Postadas com post ainda na fila (levada antes da hora): aparece como o post, não como publicada
    if (d.kanban_column === 'postado' && !active) {
      if (!published && inSeries?.published) continue;
      const when = published ? whenFromInstant(published.published_at || published.scheduled_at) : whenFromInstant(d.posting_at);
      if (when) pushScheduled({ ...base, when, state: 'publicado', mode: published ? 'auto' : 'manual', locked: true, post: postSummary(published) });
      continue;
    }
    if (active || published) { pushScheduled(fromPost(base, active, published)); continue; }
    if (d.posting_at) {
      pushScheduled({ ...base, when: whenFromInstant(d.posting_at), state: 'manual', mode: 'manual', locked: false, post: null });
      continue;
    }
    unscheduled.push({ ...base, state: 'nao_agendado' });
    pushGhost(base, cancelled);
  }

  // ── Conteúdos aprovados no portal sem card (enviados direto no portal) ──
  const taskTitles = new Set(tasks.map((t) => String(t.title || '').trim().toLowerCase()));
  const designTitles = new Set(designs.map((d) => `arte: ${String(d.title || '').trim().toLowerCase()}`));
  for (const p of portals) {
    if (p.content_task_id || p.design_task_id) continue;
    const title = String(p.title || '').trim().toLowerCase();
    if (taskTitles.has(title) || designTitles.has(title)) continue; // conteúdo antigo ligado ao card só pelo título
    if (!['aprovado', 'agendado', 'publicado'].includes(p.status)) continue;
    const id = String(p.id);
    const { active, published, cancelled } = pickPosts(postsByPortal.get(id) || []);
    const fileUrl = media.absolute(p.file_url);
    const kind = media.kindOf(fileUrl);
    const current = active || published;
    const base = {
      key: `portal:${id}`,
      kind: 'portal',
      id,
      title: p.title || 'Conteúdo',
      content_type: p.content_type || null,
      type: visualType({ kind: 'portal', contentType: p.content_type, publishType: current?.publish_type }),
      column: p.status,
      approved_at: p.approved_at || null,
      thumb_url: media.absolute(p.thumbnail_url) || media.thumbFor(fileUrl),
      media_url: fileUrl,
      media_kind: kind || 'video',
      media_items: fileUrl ? [fileUrl] : [],
      caption: current?.caption || '',
      platform_label: null,
    };
    materialInfo.set(base.key, { thumb_url: base.thumb_url, media_kind: base.media_kind });
    const inSeries = seriesMaterial.get(base.key);
    if (inSeries?.busy && !active) continue;
    if (p.status === 'publicado') {
      if (!published && inSeries?.published) continue;
      const when = published ? whenFromInstant(published.published_at || published.scheduled_at) : whenFromInstant(p.posting_at);
      if (when) pushScheduled({ ...base, when, state: 'publicado', mode: published ? 'auto' : 'manual', locked: true, post: postSummary(published) });
      continue;
    }
    if (active || published) { pushScheduled(fromPost(base, active, published)); continue; }
    if (p.posting_at) {
      pushScheduled({ ...base, when: whenFromInstant(p.posting_at), state: 'manual', mode: 'manual', locked: false, post: null });
      continue;
    }
    unscheduled.push({ ...base, state: 'nao_agendado' });
    pushGhost(base, cancelled);
  }

  // ── Posts sem material na lista (Estúdio de Postagem, card fora das colunas de agendamento) ──
  for (const p of posts) {
    if (usedPosts.has(String(p.id))) continue;
    const linked = p.content_task_id || p.delivery_id || p.design_task_id || p.portal_content_id;
    if (linked && p.status === 'cancelado') continue;
    const summary = postSummary(p);
    const firstUrl = media.absolute(summary.media_items[0] || p.media_url);
    const kind = media.kindOf(firstUrl);
    const when = p.status === 'publicado' ? whenFromInstant(p.published_at || p.scheduled_at) : whenFromInstant(p.scheduled_at);
    const firstLine = String(p.caption || '').split('\n').map((s) => s.trim()).find(Boolean);
    const sr = p.story_series_id ? seriesById.get(String(p.story_series_id)) : null;
    const owner = materialInfo.get(materialKeyOfPost(p) || '');
    pushScheduled({
      key: `post:${p.id}`,
      kind: 'post',
      id: String(p.id),
      title: p.material_title || sr?.title || (firstLine ? firstLine.slice(0, 80) : 'Post'),
      content_type: p.publish_type,
      type: visualType({ kind: 'post', publishType: p.publish_type, mediaCount: summary.media_items.length }),
      column: p.status,
      approved_at: null,
      thumb_url: media.thumbFor(firstUrl) || owner?.thumb_url || media.absolute(sr?.thumb_url) || null,
      media_url: firstUrl,
      media_kind: kind || (p.publish_type === 'reels' ? 'video' : 'image'),
      media_items: summary.media_items.length ? summary.media_items.map(media.absolute) : (firstUrl ? [firstUrl] : []),
      caption: p.caption || '',
      platform_label: null,
      when,
      state: p.status,
      mode: 'auto',
      locked: p.status !== 'agendado',
      ghost: p.status === 'cancelado',
      post: summary,
      series: sr ? seriesInfo(sr, p.series_slot_at) : null,
    });
  }

  // Datas da repetição além do que já foi gerado (janela de 30 dias): previstas, só abrem a repetição
  const rangeEnd = Date.parse(brtToIso(to, '23:59') || '') + 59_999;
  const rangeStart = Date.parse(brtToIso(from, '00:00') || '');
  for (const sr of series) {
    if (sr.status !== 'ativa' || !Number.isFinite(rangeEnd)) continue;
    const generated = sr.generated_until ? Date.parse(sr.generated_until) : 0;
    const fromMs = Math.max(rangeStart, generated + 1, now + 60_000);
    if (fromMs > rangeEnd) continue;
    const taken = new Set(posts.filter((p) => String(p.story_series_id) === String(sr.id)).map((p) => isoOf(p.series_slot_at)));
    const owner = materialInfo.get(`${sr.material_kind}:${sr.material_id}`);
    const mediaUrl = media.absolute(sr.media_url);
    for (const occ of listOccurrences(ruleFromRow(sr), { fromMs, toMs: rangeEnd })) {
      if (taken.has(occ.at)) continue;
      pushScheduled({
        key: `serie:${sr.id}:${occ.at}`,
        kind: 'serie',
        id: String(sr.id),
        title: sr.title || 'Story',
        content_type: 'stories',
        type: 'story',
        column: null,
        approved_at: null,
        thumb_url: owner?.thumb_url || media.absolute(sr.thumb_url) || media.thumbFor(mediaUrl),
        media_url: mediaUrl,
        media_kind: media.kindOf(mediaUrl) || owner?.media_kind || 'video',
        media_items: mediaUrl ? [mediaUrl] : [],
        caption: '',
        platform_label: null,
        when: whenFromInstant(occ.at),
        state: 'agendado',
        mode: 'auto',
        locked: true,
        virtual: true,
        post: {
          id: null, status: 'agendado', platform: sr.platform, publish_type: 'stories', caption: '',
          media_url: mediaUrl, media_items: mediaUrl ? [mediaUrl] : [], story_link: sr.story_link || null,
          story_link_text: sr.story_link_text || null, scheduled_at: occ.at, published_at: null, last_error: null,
          story_mode: sr.story_mode, reminder_sent_at: null, reminder_followup_at: null, manual_posted: false,
        },
        series: seriesInfo(sr, occ.at),
      });
    }
  }

  scheduled.sort((a, b) => (a.when.date + (a.when.time || '99:99')).localeCompare(b.when.date + (b.when.time || '99:99')));
  // Quem espera há mais tempo primeiro
  unscheduled.sort((a, b) => Date.parse(a.approved_at || 0) - Date.parse(b.approved_at || 0));
  return { scheduled, unscheduled };
}

export function registerSchedulingRoutes(app, deps) {
  const {
    pool, verifyUser, getLinkedUserIds, resolveActiveCity, cityVisibilityExpression,
    ensureSocialPostsSchema, getConnectedAccounts, sanitizeAccount, duplicatedPlatformAccounts,
    prepareScheduledPost, onSchemaChange, publicAppUrl, logger = console, hasPulsePlus,
  } = deps;
  let stories = null; // storySeries.mjs (registrado no fim)
  const historyHasCity = { task_history: false, design_task_history: false };

  // ── Esquema (aditivo, idempotente) ──
  async function columnExists(table, column) {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column]
    );
    return rows.length > 0;
  }

  async function addColumnIfMissing(table, column, type) {
    if (await columnExists(table, column)) return false;
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
    return true;
  }

  async function ensureTrigger(name, table, timing, events, fn) {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = $1 AND tgrelid = to_regclass($2)`,
      [name, `public.${table}`]
    );
    if (rows.length) return;
    try {
      await pool.query(`CREATE TRIGGER ${name} ${timing} ${events} ON public.${table} FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    } catch (error) {
      if (error?.code !== '42710') throw error; // outra instância criou junto
    }
  }

  async function createSchema() {
    await ensureSocialPostsSchema();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS module_access (
        module TEXT NOT NULL,
        user_id UUID NOT NULL,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (module, user_id)
      )
    `);
    const changed = new Set();
    for (const [table, column, type] of [
      ['content_tasks', 'posting_at', 'TIMESTAMPTZ'],
      ['design_tasks', 'posting_at', 'TIMESTAMPTZ'],
      ['client_portal_contents', 'posting_at', 'TIMESTAMPTZ'],
      ['scheduled_posts', 'design_task_id', 'UUID'],
      ['scheduled_posts', 'portal_content_id', 'UUID'],
    ]) {
      if (await addColumnIfMissing(table, column, type)) changed.add(table);
    }
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_posts_content_task ON scheduled_posts (content_task_id) WHERE content_task_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_scheduled_posts_delivery ON scheduled_posts (delivery_id) WHERE delivery_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_scheduled_posts_design_task ON scheduled_posts (design_task_id) WHERE design_task_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_scheduled_posts_portal_content ON scheduled_posts (portal_content_id) WHERE portal_content_id IS NOT NULL;
    `);

    // Gatilhos: só escrevem posting_at (e cancelam o post pendente da arte que saiu de Aprovado).
    // Qualquer falha vira aviso no log; a gravação original nunca é recusada por eles.
    await pool.query(`
      CREATE OR REPLACE FUNCTION pulse_posting_local_ts(d date, t text) RETURNS timestamptz
      LANGUAGE plpgsql STABLE AS $fn$
      BEGIN
        IF d IS NULL OR t IS NULL OR btrim(t) !~ '^[0-9]{1,2}:[0-9]{2}' THEN RETURN NULL; END IF;
        RETURN (d + substring(btrim(t) from '^[0-9]{1,2}:[0-9]{2}')::time) AT TIME ZONE '${POSTING_TZ}';
      EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
      END
      $fn$;

      -- Kanban de Conteúdo / detalhe do card: agendar grava a postagem em scheduled_recording_*
      CREATE OR REPLACE FUNCTION pulse_content_task_posting_at() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        BEGIN
          IF NEW.posting_at IS NOT DISTINCT FROM OLD.posting_at THEN
            IF NEW.kanban_column = 'acompanhamento'
               AND (NEW.scheduled_recording_date IS DISTINCT FROM OLD.scheduled_recording_date
                    OR NEW.scheduled_recording_time IS DISTINCT FROM OLD.scheduled_recording_time) THEN
              NEW.posting_at := COALESCE(pulse_posting_local_ts(NEW.scheduled_recording_date, NEW.scheduled_recording_time), NEW.posting_at);
            ELSIF OLD.kanban_column = 'acompanhamento'
               AND NEW.kanban_column NOT IN ('acompanhamento', 'arquivado', 'postado') THEN
              NEW.posting_at := NULL;
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'pulse_content_task_posting_at: %', SQLERRM;
        END;
        RETURN NEW;
      END
      $fn$;

      -- Entregas Social: data e hora da entrega agendada
      CREATE OR REPLACE FUNCTION pulse_delivery_posting_at() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      DECLARE v timestamptz;
      BEGIN
        BEGIN
          IF NEW.content_task_id IS NOT NULL AND NEW.status = 'agendado' AND NEW.posted_at IS NOT NULL
             AND (TG_OP = 'INSERT' OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
                  OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time) THEN
            v := pulse_posting_local_ts(NEW.posted_at, NEW.scheduled_time);
            IF v IS NOT NULL THEN
              UPDATE content_tasks SET posting_at = v
               WHERE id = NEW.content_task_id AND posting_at IS DISTINCT FROM v
                 AND kanban_column IN ('agendamentos', 'acompanhamento');
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'pulse_delivery_posting_at: %', SQLERRM;
        END;
        RETURN NULL;
      END
      $fn$;

      -- Fila de postagem: o horário do post agendado é o horário de postagem do material
      CREATE OR REPLACE FUNCTION pulse_scheduled_post_posting_at() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        BEGIN
          -- ocorrências de repetição de stories (story_series_id) não mexem na data do material
          IF NEW.status = 'agendado' AND NEW.story_series_id IS NULL
             AND (TG_OP = 'INSERT' OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
                  OR OLD.status IS DISTINCT FROM 'agendado') THEN
            IF NEW.content_task_id IS NOT NULL THEN
              UPDATE content_tasks SET posting_at = NEW.scheduled_at
               WHERE id = NEW.content_task_id AND posting_at IS DISTINCT FROM NEW.scheduled_at
                 AND kanban_column IN ('agendamentos', 'acompanhamento');
            END IF;
            IF NEW.design_task_id IS NOT NULL THEN
              UPDATE design_tasks SET posting_at = NEW.scheduled_at
               WHERE id = NEW.design_task_id AND posting_at IS DISTINCT FROM NEW.scheduled_at
                 AND kanban_column = 'aprovado';
            END IF;
            IF NEW.portal_content_id IS NOT NULL THEN
              UPDATE client_portal_contents SET posting_at = NEW.scheduled_at
               WHERE id = NEW.portal_content_id AND posting_at IS DISTINCT FROM NEW.scheduled_at
                 AND status IN ('aprovado', 'agendado');
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'pulse_scheduled_post_posting_at: %', SQLERRM;
        END;
        RETURN NULL;
      END
      $fn$;

      -- Arte que sai de Aprovado (ajuste, volta de coluna): a data e o post pendente deixam de valer.
      -- Arte trocada depois de agendada (o post guarda a cópia das URLs): o post sai e ela volta a não agendada.
      CREATE OR REPLACE FUNCTION pulse_design_task_posting_at() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        BEGIN
          IF OLD.kanban_column IN ('aprovado', 'postado') AND NEW.kanban_column NOT IN ('aprovado', 'postado') THEN
            IF NEW.posting_at IS NOT DISTINCT FROM OLD.posting_at THEN
              NEW.posting_at := NULL;
            END IF;
            UPDATE scheduled_posts
               SET status = 'cancelado', last_error = 'Cancelado: a arte saiu de Aprovado.', updated_at = now()
             WHERE design_task_id = NEW.id AND status IN ('agendado', 'erro');
          ELSIF OLD.kanban_column = 'aprovado' AND NEW.kanban_column = 'aprovado'
             AND (NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
                  OR NEW.attachment_urls::text IS DISTINCT FROM OLD.attachment_urls::text
                  OR NEW.mockup_url IS DISTINCT FROM OLD.mockup_url) THEN
            UPDATE scheduled_posts
               SET status = 'cancelado',
                   last_error = 'Cancelado: a arte foi trocada depois do agendamento. Agende de novo.',
                   updated_at = now()
             WHERE design_task_id = NEW.id AND status IN ('agendado', 'erro');
            IF FOUND AND NEW.posting_at IS NOT DISTINCT FROM OLD.posting_at THEN
              NEW.posting_at := NULL;
            END IF;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'pulse_design_task_posting_at: %', SQLERRM;
        END;
        RETURN NEW;
      END
      $fn$;
    `);
    await ensureTrigger('trg_content_tasks_posting_at', 'content_tasks', 'BEFORE', 'UPDATE', 'pulse_content_task_posting_at');
    await ensureTrigger('trg_deliveries_posting_at', 'social_media_deliveries', 'AFTER', 'INSERT OR UPDATE', 'pulse_delivery_posting_at');
    await ensureTrigger('trg_scheduled_posts_posting_at', 'scheduled_posts', 'AFTER', 'INSERT OR UPDATE', 'pulse_scheduled_post_posting_at');
    await ensureTrigger('trg_design_tasks_posting_at', 'design_tasks', 'BEFORE', 'UPDATE', 'pulse_design_task_posting_at');

    historyHasCity.task_history = await columnExists('task_history', 'city');
    historyHasCity.design_task_history = await columnExists('design_task_history', 'city');
    if (changed.size && typeof onSchemaChange === 'function') onSchemaChange([...changed]);
    await seedModuleAccess();
  }

  /** Lista vazia: entram os admins cujo nome começa com "Thiago". Ninguém achado: ninguém vê. */
  async function seedModuleAccess() {
    const { rows: [{ total }] } = await pool.query(
      `SELECT count(*)::int AS total FROM module_access WHERE module = $1`,
      [SCHEDULING_MODULE]
    );
    if (total > 0) return;
    const { rows } = await pool.query(
      `INSERT INTO module_access (module, user_id, created_by)
       SELECT $1, p.id, 'semente'
         FROM profiles p
        WHERE btrim(coalesce(p.name, '')) ILIKE 'thiago%'
          AND (p.role::text = 'admin'
               OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id::text = p.id::text AND ur.role::text = 'admin'))
       ON CONFLICT DO NOTHING
       RETURNING user_id`,
      [SCHEDULING_MODULE]
    );
    if (!rows.length) {
      logger.warn(`[agendamentos] lista de acesso vazia e nenhum admin "Thiago" encontrado: ninguém acessa o módulo até um admin ser incluído em module_access.`);
      return;
    }
    const { rows: people } = await pool.query(
      `SELECT id, name, email FROM profiles WHERE id = ANY($1::uuid[]) ORDER BY name`,
      [rows.map((r) => r.user_id)]
    );
    logger.log(`[agendamentos] lista de acesso semeada com: ${people.map((p) => `${p.name} <${p.email || 'sem e-mail'}> (${p.id})`).join('; ')}`);
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
  ready().catch((error) => logger.error('[agendamentos] esquema não criado:', error?.message || error));

  // ── Acesso ──
  async function userModules(user) {
    await ready();
    const ids = await getLinkedUserIds(user);
    const list = ids.length ? ids : [String(user.id)];
    const { rows } = await pool.query(
      `SELECT DISTINCT module FROM module_access WHERE user_id::text = ANY($1::text[]) ORDER BY module`,
      [list]
    );
    return rows.map((r) => r.module);
  }

  async function requireModule(req) {
    const { user } = await verifyUser(req);
    await ready();
    if (stories) await stories.ready();
    // Pulse Plus libera o módulo; sem a função (testes antigos), vale a lista 'agendamentos'
    const allowed = typeof hasPulsePlus === 'function'
      ? await hasPulsePlus(user)
      : (await userModules(user)).includes(SCHEDULING_MODULE);
    if (!allowed) throw httpError(403, 'Sem acesso a este módulo');
    const city = await resolveActiveCity(req, user.id, user);
    return { user, city };
  }

  async function loadClient(clientId, city, db = pool) {
    if (!isUuid(clientId)) throw httpError(400, 'Cliente inválido');
    const { rows } = await db.query(
      `SELECT id, company_name, logo_url, color, city, status FROM clients
        WHERE id = $1 AND ${cityVisibilityExpression('city', '$2')}`,
      [clientId, city]
    );
    if (!rows[0]) throw httpError(404, 'Cliente não encontrado nesta cidade');
    return rows[0];
  }

  // ── Leitura ──
  app.get('/api/me/module-access', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      res.set('Cache-Control', 'no-store');
      res.json({ modules: await userModules(user) });
    } catch (error) {
      sendError(res, error, logger);
    }
  });

  app.get('/api/scheduling/clients', async (req, res) => {
    try {
      const { city } = await requireModule(req);
      const [clients, accounts, contents, designs, portals] = await Promise.all([
        pool.query(
          `SELECT id, company_name, logo_url, color, city FROM clients
            WHERE ${cityVisibilityExpression('city', '$1')} AND coalesce(status, 'ativo') <> 'cancelado'
            ORDER BY company_name`,
          [city]
        ),
        pool.query(`SELECT client_id, platform, count(*)::int AS n FROM social_accounts WHERE status = 'connected' GROUP BY 1, 2`),
        pool.query(
          `SELECT client_id,
                  count(*) FILTER (WHERE kanban_column = 'agendamentos')::int AS pending,
                  count(*) FILTER (WHERE kanban_column = 'acompanhamento')::int AS scheduled
             FROM content_tasks
            WHERE kanban_column IN ('agendamentos', 'acompanhamento') AND coalesce(content_type, '') <> 'criativo'
            GROUP BY 1`
        ),
        pool.query(
          `SELECT client_id,
                  count(*) FILTER (WHERE posting_at IS NULL)::int AS pending,
                  count(*) FILTER (WHERE posting_at IS NOT NULL)::int AS scheduled
             FROM design_tasks
            WHERE kanban_column = 'aprovado' AND coalesce(format_type, '') <> ALL($1::text[])
            GROUP BY 1`,
          [NON_SOCIAL_DESIGN_FORMATS]
        ),
        pool.query(
          `SELECT pc.client_id,
                  count(*) FILTER (WHERE pc.status = 'aprovado' AND pc.posting_at IS NULL)::int AS pending,
                  count(*) FILTER (WHERE pc.posting_at IS NOT NULL)::int AS scheduled
             FROM client_portal_contents pc
            WHERE pc.status IN ('aprovado', 'agendado') AND ${standalonePortalSql('pc')}
            GROUP BY 1`
        ),
      ]);
      const tally = new Map();
      const add = (rows) => rows.forEach((r) => {
        const t = tally.get(String(r.client_id)) || { pending: 0, scheduled: 0 };
        t.pending += r.pending; t.scheduled += r.scheduled;
        tally.set(String(r.client_id), t);
      });
      add(contents.rows); add(designs.rows); add(portals.rows);
      const platforms = new Map();
      for (const a of accounts.rows) {
        const p = platforms.get(String(a.client_id)) || { instagram: 0, facebook: 0 };
        if (a.platform === 'instagram' || a.platform === 'facebook') p[a.platform] += a.n;
        platforms.set(String(a.client_id), p);
      }
      res.set('Cache-Control', 'no-store');
      res.json({
        city,
        clients: clients.rows.map((c) => ({
          id: c.id,
          company_name: c.company_name,
          logo_url: c.logo_url || null,
          color: c.color || null,
          city: c.city || null,
          accounts: platforms.get(String(c.id)) || { instagram: 0, facebook: 0 },
          pending: tally.get(String(c.id))?.pending || 0,
          scheduled: tally.get(String(c.id))?.scheduled || 0,
        })),
      });
    } catch (error) {
      sendError(res, error, logger);
    }
  });

  async function loadMaterialRows(clientId, from, to) {
    const fromIso = brtToIso(from, '00:00');
    const toIso = brtToIso(to, '23:59');
    const [tasks, designs, portals] = await Promise.all([
      pool.query(
        `SELECT id, title, content_type, kanban_column, approved_at, posting_at, scheduled_recording_date,
                scheduled_recording_time, edited_video_link, script_id, updated_at
           FROM content_tasks
          WHERE client_id = $1 AND coalesce(content_type, '') <> 'criativo'
            AND (kanban_column IN ('agendamentos', 'acompanhamento')
                 OR (kanban_column = 'arquivado' AND updated_at >= $2::timestamptz - interval '3 days'))`,
        [clientId, fromIso]
      ),
      pool.query(
        `SELECT id, title, format_type, kanban_column, posting_at, attachment_url, attachment_urls, mockup_url,
                client_approved_at, completed_at, updated_at
           FROM design_tasks
          WHERE client_id = $1 AND coalesce(format_type, '') <> ALL($3::text[])
            AND (kanban_column = 'aprovado'
                 OR (kanban_column = 'postado' AND updated_at >= $2::timestamptz - interval '3 days')
                 OR (kanban_column = 'postado' AND EXISTS (
                       SELECT 1 FROM scheduled_posts sp
                        WHERE sp.design_task_id = design_tasks.id AND sp.status IN ('agendado', 'publicando', 'erro'))))`,
        [clientId, fromIso, NON_SOCIAL_DESIGN_FORMATS]
      ),
      // Com vínculo: só mídia e miniatura do card/arte. Sem vínculo: a regra do conteúdo avulso.
      pool.query(
        `SELECT pc.id, pc.title, pc.content_type, pc.status, pc.file_url, pc.thumbnail_url, pc.approved_at, pc.posting_at,
                pc.content_task_id, pc.design_task_id, pc.created_at
           FROM client_portal_contents pc
          WHERE pc.client_id = $1
            AND (
              ((pc.content_task_id IS NOT NULL OR pc.design_task_id IS NOT NULL)
                AND pc.status IN ('aprovado', 'agendado', 'publicado')
                AND (pc.status <> 'publicado' OR pc.updated_at >= $2::timestamptz - interval '3 days'))
              OR (pc.status IN ('aprovado', 'agendado', 'publicado') AND ${standalonePortalSql('pc')})
            )
          ORDER BY pc.created_at DESC`,
        [clientId, fromIso]
      ),
    ]);
    const taskIds = tasks.rows.map((t) => t.id);
    const designIds = designs.rows.map((d) => d.id);
    const portalIds = portals.rows.map((p) => p.id);
    const scriptIds = [...new Set(tasks.rows.map((t) => t.script_id).filter(Boolean))];
    const [deliveries, posts, scripts, series] = await Promise.all([
      taskIds.length
        ? pool.query(
          `SELECT id, content_task_id, status, posted_at, scheduled_time, platform, created_at, updated_at
             FROM social_media_deliveries WHERE content_task_id = ANY($1::uuid[])`,
          [taskIds]
        )
        : { rows: [] },
      pool.query(
        `SELECT sp.*, coalesce(ct.title, dt.title, pc.title) AS material_title
           FROM scheduled_posts sp
           LEFT JOIN content_tasks ct ON ct.id = sp.content_task_id
           LEFT JOIN design_tasks dt ON dt.id = sp.design_task_id
           LEFT JOIN client_portal_contents pc ON pc.id = sp.portal_content_id
          WHERE sp.client_id = $1
            AND (sp.status IN ('agendado', 'publicando', 'erro')
                 OR (sp.scheduled_at BETWEEN $2::timestamptz - interval '1 day' AND $3::timestamptz + interval '1 day')
                 OR (sp.published_at BETWEEN $2::timestamptz - interval '1 day' AND $3::timestamptz + interval '1 day')
                 OR sp.content_task_id = ANY($4::uuid[])
                 OR sp.design_task_id = ANY($5::uuid[])
                 OR sp.portal_content_id = ANY($6::uuid[]))`,
        [clientId, fromIso, toIso, taskIds, designIds, portalIds]
      ),
      scriptIds.length
        ? pool.query(`SELECT id, caption FROM scripts WHERE id = ANY($1::uuid[])`, [scriptIds])
        : { rows: [] },
      pool.query(`SELECT * FROM story_series WHERE client_id = $1 ORDER BY created_at`, [clientId]),
    ]);
    return {
      tasks: tasks.rows, designs: designs.rows, portals: portals.rows,
      deliveries: deliveries.rows, posts: posts.rows, scripts: scripts.rows, series: series.rows,
    };
  }

  function readRange(query) {
    const from = String(query.from || '');
    const to = String(query.to || '');
    if (!DATE_KEY_RE.test(from) || !DATE_KEY_RE.test(to) || to < from) throw httpError(400, 'Período inválido');
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    if (days > MAX_RANGE_DAYS) throw httpError(400, 'Período muito longo');
    return { from, to };
  }

  app.get('/api/scheduling/clients/:clientId/materials', async (req, res) => {
    try {
      const { city } = await requireModule(req);
      const client = await loadClient(req.params.clientId, city);
      const { from, to } = readRange(req.query || {});
      const [rows, accounts, storyLink] = await Promise.all([
        loadMaterialRows(client.id, from, to),
        getConnectedAccounts(client.id),
        stories.linkDefaults(client.id),
      ]);
      const { scheduled, unscheduled } = buildMaterials(rows, { from, to, publicAppUrl });
      res.set('Cache-Control', 'no-store');
      res.json({
        client: { id: client.id, company_name: client.company_name, logo_url: client.logo_url || null, color: client.color || null, city: client.city || null },
        accounts: accounts.map(sanitizeAccount),
        duplicated_platforms: duplicatedPlatformAccounts(accounts).map(([platform]) => platform),
        range: { from, to },
        scheduled,
        unscheduled,
        story_link: storyLink,
      });
    } catch (error) {
      sendError(res, error, logger);
    }
  });

  // ── Escrita (transação: material e posts travados até o fim) ──
  function readTarget(body) {
    const kind = String(body?.kind || '');
    const id = String(body?.id || '');
    if (!KINDS.has(kind) || !isUuid(id)) throw httpError(400, 'Material inválido');
    return { kind, id };
  }

  async function lockMaterial(db, kind, id, clientId) {
    const table = { conteudo: 'content_tasks', arte: 'design_tasks', portal: 'client_portal_contents', post: 'scheduled_posts' }[kind];
    const { rows } = await db.query(`SELECT * FROM ${table} WHERE id = $1 AND client_id = $2 FOR UPDATE`, [id, clientId]);
    if (!rows[0]) throw httpError(404, 'Material não encontrado para este cliente');
    return rows[0];
  }

  /** Vínculos do material com a fila de posts. */
  async function linksOf(db, kind, material) {
    if (kind === 'conteudo') {
      const { rows } = await db.query(
        `SELECT id, status, posted_at, scheduled_time FROM social_media_deliveries
          WHERE content_task_id = $1 ORDER BY updated_at DESC NULLS LAST, created_at DESC`,
        [material.id]
      );
      return { content_task_id: material.id, delivery_ids: rows.map((r) => r.id), delivery: rows[0] || null };
    }
    if (kind === 'arte') return { design_task_id: material.id, delivery_ids: [] };
    if (kind === 'portal') return { portal_content_id: material.id, delivery_ids: [] };
    return { post_id: material.id, delivery_ids: [] };
  }

  async function lockLinkedPosts(db, links) {
    const params = [];
    const conds = [];
    const add = (sql, value) => { params.push(value); conds.push(sql.replace('?', `$${params.length}`)); };
    if (links.content_task_id) add('content_task_id = ?', links.content_task_id);
    if (links.delivery_ids?.length) add('delivery_id = ANY(?::uuid[])', links.delivery_ids);
    if (links.design_task_id) add('design_task_id = ?', links.design_task_id);
    if (links.portal_content_id) add('portal_content_id = ?', links.portal_content_id);
    if (links.post_id) add('id = ?', links.post_id);
    if (!conds.length) return [];
    const { rows } = await db.query(
      `SELECT * FROM scheduled_posts WHERE ${conds.join(' OR ')} ORDER BY created_at DESC FOR UPDATE`,
      params
    );
    return rows;
  }

  /** Ocorrências de repetição de stories não contam como "o post do material" (storySeries.mjs cuida delas). */
  function withoutSeries(posts) {
    return posts.filter((p) => !p.story_series_id);
  }

  /** Material numa repetição de stories ativa: agendar, remarcar e cancelar o material inteiro não vale. */
  async function assertNoActiveSeries(db, kind, materialId) {
    const { rows } = await db.query(
      `SELECT 1 FROM story_series WHERE material_kind = $1 AND material_id = $2 AND status = 'ativa' LIMIT 1`,
      [kind, materialId]
    );
    if (rows.length) {
      throw httpError(409, 'Este material está numa repetição de stories. Mude pelas datas da repetição.', { code: 'series_active' });
    }
  }

  /** Momento de postagem que vale hoje para o material (para manter a hora ao arrastar). */
  function currentWhen(kind, material, links, posts) {
    const active = posts.find((p) => ACTIVE_POST_STATUSES.has(p.status));
    if (active) return whenFromInstant(active.scheduled_at);
    if (kind === 'post') return whenFromInstant(material.scheduled_at);
    if (material.posting_at) return whenFromInstant(material.posting_at);
    if (kind === 'conteudo') {
      const d = links.delivery;
      return (d && ['agendado', 'postado'].includes(d.status) ? whenFromLocal(d.posted_at, d.scheduled_time) : null)
        || (material.kanban_column === 'acompanhamento' ? whenFromLocal(material.scheduled_recording_date, material.scheduled_recording_time) : null);
    }
    return null;
  }

  /** Conteúdo avulso do portal: a mesma regra da lista, conferida na linha já travada. */
  async function assertStandalonePortal(db, id) {
    const { rows: [row] } = await db.query(
      `SELECT ${standalonePortalSql('pc')} AS ok FROM client_portal_contents pc WHERE pc.id = $1`,
      [id]
    );
    if (!row?.ok) throw httpError(409, 'Este conteúdo não está aprovado para agendar.', { code: 'not_ready' });
  }

  function assertNotPublished(kind, material, posts) {
    const hasActivePost = posts.some((p) => ACTIVE_POST_STATUSES.has(p.status));
    const published = posts.some((p) => p.status === 'publicado')
      || (kind === 'conteudo' && ['arquivado', 'postado'].includes(material.kanban_column))
      // Arte em Postadas com post ainda na fila: segue agendada (remarca e cancela)
      || (kind === 'arte' && material.kanban_column === 'postado' && !hasActivePost)
      || (kind === 'portal' && material.status === 'publicado');
    if (published) throw httpError(409, 'Este material já foi publicado.', { code: 'published' });
    if (posts.some((p) => p.status === 'publicando')) throw httpError(409, 'Este post está sendo publicado agora.', { code: 'publishing' });
  }

  async function insertHistory(db, kind, material, user, action, details) {
    if (kind === 'conteudo') {
      await db.query(
        historyHasCity.task_history
          ? `INSERT INTO task_history (task_id, user_id, action, details, city) VALUES ($1, $2, $3, $4, $5)`
          : `INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
        [material.id, user?.id || null, action, details, ...(historyHasCity.task_history ? [material.city || null] : [])]
      );
    } else if (kind === 'arte') {
      await db.query(
        historyHasCity.design_task_history
          ? `INSERT INTO design_task_history (task_id, user_id, action, details, city) VALUES ($1, $2, $3, $4, $5)`
          : `INSERT INTO design_task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
        [material.id, user?.id || null, action, details, ...(historyHasCity.design_task_history ? [material.city || null] : [])]
      );
    }
  }

  async function withTransaction(fn) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      db.release();
    }
  }

  function pastCheck(whenIso, mode, allowPast) {
    if (Date.parse(whenIso) >= Date.now() - 60_000) return;
    if (mode === 'auto') throw httpError(400, 'O horário escolhido já passou. Escolha um horário futuro.', { code: 'past_auto' });
    if (!allowPast) throw httpError(409, 'A data escolhida já passou.', { code: 'past_date' });
  }

  function defaultMedia(kind, material) {
    const media = makeMediaHelpers(publicAppUrl);
    if (kind === 'arte') {
      let urls = parseJsonArray(material.attachment_urls).filter((u) => typeof u === 'string' && u);
      if (material.attachment_url) urls.push(material.attachment_url);
      urls = [...new Set(urls.map(media.absolute).filter(Boolean))];
      if (!urls.length && material.mockup_url) urls = [media.absolute(material.mockup_url)];
      return urls;
    }
    if (kind === 'portal') return [media.absolute(material.file_url)].filter(Boolean);
    if (kind === 'conteudo') return [media.absolute(material.edited_video_link)].filter(Boolean);
    return [];
  }

  /** Entrega do Social do vídeo agendado (o registro do agendamento dos vídeos): data, hora e rede. */
  async function upsertDelivery(db, { kind, material, links, client, user, date, time, label }) {
    if (kind !== 'conteudo') return null;
    let deliveryId = links.delivery?.id || null;
    if (deliveryId) {
      await db.query(
        `UPDATE social_media_deliveries SET status = 'agendado', posted_at = $2, scheduled_time = $3, platform = $4, updated_at = now()
          WHERE content_task_id = $1`,
        [material.id, date, time, label]
      );
    } else {
      const { rows: [created] } = await db.query(
        `INSERT INTO social_media_deliveries
           (client_id, content_type, title, description, status, delivered_at, posted_at, scheduled_time, platform,
            recording_id, script_id, created_by, content_task_id)
         VALUES ($1, $2, $3, $4, 'agendado', (now() AT TIME ZONE '${POSTING_TZ}')::date, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [client.id, material.content_type || 'reels', material.title, material.description || null, date, time, label,
          material.recording_id || null, material.script_id || null, user?.id || null, material.id]
      );
      deliveryId = created.id;
    }
    return deliveryId;
  }

  /** Data de postagem no material (card, arte ou conteúdo do portal), histórico e aviso no portal do cliente. */
  async function markScheduled(db, { kind, material, client, user, date, time, whenIso, detail }) {
    if (kind === 'conteudo') {
      const wasScheduled = material.kanban_column === 'acompanhamento';
      // O conteúdo do portal ligado ao card fica 'aprovado' (o portal do cliente só conhece esse estado final).
      // Por último: os gatilhos da entrega/fila gravam posting_at também; o valor final é este.
      await db.query(
        `UPDATE content_tasks
            SET posting_at = $2, scheduled_recording_date = $3, scheduled_recording_time = $4,
                kanban_column = 'acompanhamento',
                reviewing_by = NULL, reviewing_by_name = NULL, reviewing_at = NULL,
                editing_deadline = NULL, review_deadline = NULL, alteration_deadline = NULL, approval_deadline = NULL,
                updated_at = now()
          WHERE id = $1`,
        [material.id, whenIso, date, time]
      );
      await insertHistory(db, kind, material, user, wasScheduled ? 'Postagem remarcada' : 'Agendado para Postagem', detail);
      if (!wasScheduled) {
        await db.query(
          `INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, 'info')`,
          [client.id, '📅 Conteúdo agendado para postagem',
            `Seu conteúdo "${material.title}" foi agendado para ${date.split('-').reverse().join('/')} às ${time}.`]
        );
      }
    } else if (kind === 'arte') {
      const wasScheduled = !!material.posting_at;
      await db.query(`UPDATE design_tasks SET posting_at = $2, updated_at = now() WHERE id = $1`, [material.id, whenIso]);
      await insertHistory(db, kind, material, user, wasScheduled ? '📅 Postagem remarcada' : '📅 Agendada para postagem', detail);
    } else if (kind === 'portal') {
      await db.query(
        `UPDATE client_portal_contents SET posting_at = $2, status = 'agendado', updated_at = now() WHERE id = $1`,
        [material.id, whenIso]
      );
    }
  }

  /** O material volta para "não agendados" (card para Agendamentos, entrega para Pronto p/ agendar). */
  async function markUnscheduled(db, { kind, material, user, currentDate = null }) {
    if (kind === 'conteudo') {
      await db.query(
        `UPDATE social_media_deliveries SET status = 'entregue', posted_at = NULL, scheduled_time = NULL, updated_at = now()
          WHERE content_task_id = $1 AND status = 'agendado'`,
        [material.id]
      );
      // A data de gravação só é apagada quando era a data desta postagem (o agendar do Kanban grava ali).
      await db.query(
        `UPDATE content_tasks
            SET posting_at = NULL, kanban_column = 'agendamentos',
                scheduled_recording_time = CASE WHEN scheduled_recording_date = $2::date THEN NULL ELSE scheduled_recording_time END,
                scheduled_recording_date = CASE WHEN scheduled_recording_date = $2::date THEN NULL ELSE scheduled_recording_date END,
                updated_at = now()
          WHERE id = $1 AND kanban_column IN ('agendamentos', 'acompanhamento')`,
        [material.id, currentDate]
      );
      if (material.kanban_column === 'acompanhamento') {
        await insertHistory(db, kind, material, user, 'Movido para Agendamentos', 'Agendamento cancelado');
      }
    } else if (kind === 'arte') {
      await db.query(`UPDATE design_tasks SET posting_at = NULL, updated_at = now() WHERE id = $1`, [material.id]);
      await insertHistory(db, kind, material, user, '↩️ Agendamento cancelado', null);
    } else if (kind === 'portal') {
      await db.query(
        `UPDATE client_portal_contents
            SET posting_at = NULL, status = CASE WHEN status = 'agendado' THEN 'aprovado' ELSE status END, updated_at = now()
          WHERE id = $1`,
        [material.id]
      );
    }
  }

  // Agendar (ou refazer o agendamento pelo diálogo): data, hora, rede, formato, legenda, link do story.
  app.post('/api/scheduling/schedule', async (req, res) => {
    try {
      const { user, city } = await requireModule(req);
      const body = req.body || {};
      const client = await loadClient(body.client_id, city);
      const { kind, id } = readTarget(body);
      const date = String(body.date || '');
      const time = String(body.time || '');
      const whenIso = brtToIso(date, time);
      if (!whenIso) throw httpError(400, 'Escolha a data e a hora');
      const mode = body.mode === 'auto' ? 'auto' : 'manual';
      if (kind === 'post' && mode !== 'auto') throw httpError(400, 'Este post só existe na fila de postagem');
      pastCheck(whenIso, mode, !!body.allow_past);
      const platform = ['instagram', 'facebook', 'both'].includes(body.platform) ? body.platform : 'instagram';
      // Story: "Postar sozinho" (o robô publica) ou "Lembrete com link" (avisa a equipe, que posta pelo app)
      const storyMode = mode === 'auto' && body.publish_type === 'stories'
        ? (body.story_mode === 'lembrete' ? 'lembrete' : 'auto') : null;

      const result = await withTransaction(async (db) => {
        const material = await lockMaterial(db, kind, id, client.id);
        if (kind === 'post' && material.story_series_id) {
          throw httpError(409, 'Este story faz parte de uma repetição: mude pela própria data.', { code: 'series_post' });
        }
        if (kind !== 'post') await assertNoActiveSeries(db, kind, material.id);
        if (kind === 'conteudo' && !['agendamentos', 'acompanhamento'].includes(material.kanban_column)) {
          throw httpError(409, `O card não está aprovado para agendar (está em "${material.kanban_column}").`, { code: 'not_ready' });
        }
        if (kind === 'arte' && material.kanban_column !== 'aprovado') {
          throw httpError(409, `A arte não está aprovada para agendar (está em "${material.kanban_column}").`, { code: 'not_ready' });
        }
        if (kind === 'portal' && !['aprovado', 'agendado'].includes(material.status)) {
          throw httpError(409, 'Este conteúdo não está aprovado para agendar.', { code: 'not_ready' });
        }
        if (kind === 'portal') await assertStandalonePortal(db, material.id);
        if (kind === 'post' && !['agendado', 'erro'].includes(material.status)) {
          throw httpError(409, 'Só dá para mudar posts agendados ou com erro.', { code: 'not_ready' });
        }
        const links = await linksOf(db, kind, material);
        const posts = withoutSeries(await lockLinkedPosts(db, links));
        if (kind === 'post') {
          if (material.status === 'publicando') throw httpError(409, 'Este post está sendo publicado agora.', { code: 'publishing' });
        } else {
          assertNotPublished(kind, material, posts);
        }

        let prepared = null;
        if (mode === 'auto') {
          // Mídia: a que veio do diálogo ou a do próprio material (carrossel leva todas; os outros, a primeira)
          const fallback = kind === 'post'
            ? parseJsonArray(material.media_items).map((i) => (typeof i === 'string' ? i : i?.url)).filter(Boolean)
            : defaultMedia(kind, material);
          if (kind === 'post' && !fallback.length && material.media_url) fallback.push(material.media_url);
          let mediaItems;
          let mediaUrl;
          if (Array.isArray(body.media_items) && body.media_items.length) mediaItems = body.media_items;
          else if (typeof body.media_url === 'string' && body.media_url.trim()) mediaUrl = body.media_url.trim();
          else if (body.publish_type === 'carousel') mediaItems = fallback;
          else mediaUrl = fallback[0];
          prepared = await prepareScheduledPost({
            client_id: client.id,
            platform,
            publish_type: body.publish_type,
            media_items: mediaItems,
            media_url: mediaUrl,
            caption: body.publish_type === 'stories' ? '' : String(body.caption ?? ''),
            scheduled_at: whenIso,
            story_link: body.publish_type === 'stories' ? (String(body.story_link || '').trim() || null) : null,
            story_link_text: body.publish_type === 'stories' ? (String(body.story_link_text || '').trim() || null) : null,
          }, { requireAccounts: storyMode !== 'lembrete' });
        }

        // Entrega do Social (o registro do agendamento dos vídeos): data, hora e rede
        const deliveryId = await upsertDelivery(db, {
          kind, material, links, client, user, date, time,
          label: mode === 'auto' ? platformLabel(prepared.platform) : platformLabel(platform),
        });

        // Post anterior pendente sai (um material, um post na fila)
        const pending = posts.filter((p) => ['agendado', 'erro'].includes(p.status)).map((p) => p.id);
        if (pending.length) {
          await db.query(
            `UPDATE scheduled_posts SET status = 'cancelado', last_error = $2, updated_at = now()
              WHERE id = ANY($1::uuid[]) AND status IN ('agendado', 'erro')`,
            [pending, mode === 'auto' ? 'Substituído por um novo agendamento.' : 'Cancelado: agendamento manual.']
          );
        }
        let post = null;
        if (mode === 'auto') {
          const keep = kind === 'post' ? material : {};
          const { rows: [created] } = await db.query(
            `INSERT INTO scheduled_posts
               (client_id, delivery_id, content_task_id, design_task_id, portal_content_id, platform, publish_type,
                media_url, media_items, caption, scheduled_at, created_by, story_link, story_link_text, story_mode)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING *`,
            [
              client.id,
              kind === 'conteudo' ? deliveryId : (keep.delivery_id || null),
              kind === 'conteudo' ? material.id : (keep.content_task_id || null),
              kind === 'arte' ? material.id : (keep.design_task_id || null),
              kind === 'portal' ? material.id : (keep.portal_content_id || null),
              prepared.platform, prepared.publish_type, prepared.urls[0],
              prepared.items.length ? JSON.stringify(prepared.items) : null,
              prepared.caption, prepared.when.toISOString(), user?.id || null,
              prepared.story_link, prepared.story_link_text, storyMode,
            ]
          );
          post = created;
        }

        const modeLabel = mode !== 'auto' ? 'manual'
          : storyMode === 'lembrete' ? `${platformLabel(prepared.platform)} (lembrete de story)`
            : `${platformLabel(prepared.platform)} (automático)`;
        await markScheduled(db, { kind, material, client, user, date, time, whenIso, detail: `${formatBrt(date, time)} · ${modeLabel}` });
        return { post: postSummary(post), when: { at: whenIso, date, time }, mode };
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error, logger);
    }
  });

  // Remarcar: arrastar muda a data e mantém a hora; o diálogo pode mandar a hora nova.
  app.post('/api/scheduling/reschedule', async (req, res) => {
    try {
      const { user, city } = await requireModule(req);
      const body = req.body || {};
      const client = await loadClient(body.client_id, city);
      const { kind, id } = readTarget(body);
      const date = String(body.date || '');
      if (!DATE_KEY_RE.test(date)) throw httpError(400, 'Data inválida');
      const askedTime = body.time ? String(body.time) : null;
      if (askedTime && !TIME_RE.test(askedTime)) throw httpError(400, 'Hora inválida');

      const result = await withTransaction(async (db) => {
        const material = await lockMaterial(db, kind, id, client.id);
        if (kind !== 'post') await assertNoActiveSeries(db, kind, material.id);
        const links = await linksOf(db, kind, material);
        // Ocorrência de uma repetição (kind 'post'): arrastar muda só ela (o horário original da série fica guardado)
        const posts = kind === 'post' ? await lockLinkedPosts(db, links) : withoutSeries(await lockLinkedPosts(db, links));
        if (kind === 'post') {
          if (material.status === 'publicado') throw httpError(409, 'Este material já foi publicado.', { code: 'published' });
          if (material.status === 'publicando') throw httpError(409, 'Este post está sendo publicado agora.', { code: 'publishing' });
        } else {
          assertNotPublished(kind, material, posts);
        }
        if (kind === 'portal') await assertStandalonePortal(db, material.id);
        const active = posts.find((p) => ACTIVE_POST_STATUSES.has(p.status)) || null;
        if (active?.status === 'erro' || (kind === 'post' && material.status === 'erro')) {
          throw httpError(409, 'O post deu erro: abra e agende de novo.', { code: 'post_error' });
        }
        if (kind === 'post' && material.status !== 'agendado') throw httpError(409, 'Este post não está agendado.', { code: 'not_scheduled' });
        const scheduledNow = kind === 'post' || active
          || (kind === 'conteudo' && material.kanban_column === 'acompanhamento')
          || (kind !== 'conteudo' && material.posting_at);
        if (!scheduledNow) throw httpError(409, 'Este material ainda não foi agendado.', { code: 'not_scheduled' });

        const current = currentWhen(kind, material, links, posts);
        const time = askedTime || current?.time || null;
        if (!time) throw httpError(400, 'Escolha a hora', { code: 'time_required' });
        const whenIso = brtToIso(date, time);
        if (!whenIso) throw httpError(400, 'Data inválida');
        const mode = active || kind === 'post' ? 'auto' : 'manual';
        pastCheck(whenIso, mode, !!body.allow_past);

        const postToMove = kind === 'post' ? material : active;
        if (postToMove) {
          const { rowCount } = await db.query(
            // lembrete de story remarcado avisa de novo no horário novo
            `UPDATE scheduled_posts SET scheduled_at = $2, reminder_sent_at = NULL, reminder_followup_at = NULL, updated_at = now()
              WHERE id = $1 AND status = 'agendado'`,
            [postToMove.id, whenIso]
          );
          if (!rowCount) throw httpError(409, 'Este post está sendo publicado agora.', { code: 'publishing' });
        }
        const detail = formatBrt(date, time);
        if (kind === 'conteudo') {
          await db.query(
            `UPDATE social_media_deliveries SET posted_at = $2, scheduled_time = $3, updated_at = now()
              WHERE content_task_id = $1 AND status = 'agendado'`,
            [material.id, date, time]
          );
          const inColumn = material.kanban_column === 'acompanhamento';
          await db.query(
            `UPDATE content_tasks
                SET posting_at = $2,
                    scheduled_recording_date = CASE WHEN $5 THEN $3::date ELSE scheduled_recording_date END,
                    scheduled_recording_time = CASE WHEN $5 THEN $4 ELSE scheduled_recording_time END,
                    updated_at = now()
              WHERE id = $1`,
            [material.id, whenIso, date, time, inColumn]
          );
          await insertHistory(db, kind, material, user, 'Postagem remarcada', detail);
        } else if (kind === 'arte') {
          await db.query(`UPDATE design_tasks SET posting_at = $2, updated_at = now() WHERE id = $1`, [material.id, whenIso]);
          await insertHistory(db, kind, material, user, '📅 Postagem remarcada', detail);
        } else if (kind === 'portal') {
          await db.query(`UPDATE client_portal_contents SET posting_at = $2, updated_at = now() WHERE id = $1`, [material.id, whenIso]);
        }
        return { when: { at: whenIso, date, time }, mode };
      });
      res.json({ success: true, ...result });
    } catch (error) {
      sendError(res, error, logger);
    }
  });

  // Cancelar: o post pendente sai da fila e o material volta para "não agendados".
  app.post('/api/scheduling/cancel', async (req, res) => {
    try {
      const { user, city } = await requireModule(req);
      const body = req.body || {};
      const client = await loadClient(body.client_id, city);
      const { kind, id } = readTarget(body);

      await withTransaction(async (db) => {
        const material = await lockMaterial(db, kind, id, client.id);
        if (kind !== 'post') await assertNoActiveSeries(db, kind, material.id);
        const links = await linksOf(db, kind, material);
        const posts = kind === 'post' ? await lockLinkedPosts(db, links) : withoutSeries(await lockLinkedPosts(db, links));
        if (kind === 'post') {
          if (!['agendado', 'erro'].includes(material.status)) throw httpError(409, 'Só dá para cancelar posts agendados ou com erro.', { code: 'not_scheduled' });
        } else {
          assertNotPublished(kind, material, posts);
        }
        const current = currentWhen(kind, material, links, posts);
        const pending = posts.filter((p) => ['agendado', 'erro'].includes(p.status)).map((p) => p.id);
        if (pending.length) {
          await db.query(
            `UPDATE scheduled_posts SET status = 'cancelado', last_error = 'Cancelado: agendamento removido.', updated_at = now()
              WHERE id = ANY($1::uuid[]) AND status IN ('agendado', 'erro')`,
            [pending]
          );
        }
        if (kind === 'conteudo' && !['agendamentos', 'acompanhamento'].includes(material.kanban_column)) {
          throw httpError(409, `O card não está agendado (está em "${material.kanban_column}").`, { code: 'not_scheduled' });
        }
        await markUnscheduled(db, { kind, material, user, currentDate: current?.date || null });
      });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, logger);
    }
  });

  // ── Stories: link do cliente, lembrete com link e repetição (storySeries.mjs) ──
  stories = registerStoryRoutes(app, {
    ...deps, logger, schedulingReady: ready, requireModule, loadClient, withTransaction, httpError,
    sendError: (res, error) => sendError(res, error, logger),
    lockMaterial, linksOf, lockLinkedPosts, withoutSeries, assertNotPublished, assertStandalonePortal, defaultMedia,
    upsertDelivery, markScheduled, markUnscheduled, insertHistory, platformLabel, makeMediaHelpers,
  });

  return { ready, userModules, stories };
}

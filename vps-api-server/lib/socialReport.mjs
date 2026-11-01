// ─── Relatório mensal da rede social de cada cliente (Ísis, social media; pedido do usuário, 01/11/2026) ───────
// Regras puras: o que entra no relatório do mês e a mensagem do dia 1. Ordem pedida pelo usuário: primeiro as NOSSAS
// entregas (vídeos, artes, posts, gravações) e o tempo dedicado ao cliente, depois as métricas da rede e as sugestões.
// Nenhum número inventado: o que não existe no banco sai como null e a tela/mensagem diz que falta.

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad2 = (n) => String(n).padStart(2, '0');

// Vídeo entregue = aprovado pelo cliente no mês; sem approved_at, a coluna de entregue com a última mudança no mês
export const VIDEO_DONE_COLUMNS = new Set(['aprovado', 'agendamentos', 'postado', 'concluido', 'acompanhamento', 'arquivado']);
export const DESIGN_DONE_COLUMNS = new Set(['concluida', 'aprovada_cliente']);
export const POST_DONE_STATUS = new Set(['postado', 'entregue', 'concluido']);
const VIDEO_TYPE_LABELS = { reels: 'Reels', reel: 'Reels', criativo: 'Criativos', story: 'Stories', otimizacao: 'Otimizações' };
// Edição por vídeo acima disso é card esquecido aberto, não trabalho: fica de fora da soma
const MAX_EDIT_SECONDS = 8 * 3600;

/** "2026-10" → período do mês, o anterior e o nome ("outubro de 2026"). */
export function monthRange(month) {
  const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) throw Object.assign(new Error('Mês inválido (use AAAA-MM)'), { status: 400 });
  const year = Number(m[1]);
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) throw Object.assign(new Error('Mês inválido (use AAAA-MM)'), { status: 400 });
  const last = new Date(Date.UTC(year, idx + 1, 0)).getUTCDate();
  const prev = new Date(Date.UTC(year, idx - 1, 1));
  const prevLast = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 0)).getUTCDate();
  const prevKey = `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}`;
  return {
    month: `${year}-${pad2(idx + 1)}`,
    since: `${year}-${pad2(idx + 1)}-01`,
    until: `${year}-${pad2(idx + 1)}-${pad2(last)}`,
    prevMonth: prevKey,
    prevSince: `${prevKey}-01`,
    prevUntil: `${prevKey}-${pad2(prevLast)}`,
    label: `${MONTHS[idx]} de ${year}`,
    name: MONTHS[idx],
  };
}

/** Mês que fechou, no calendário de Brasília (no dia 1 de novembro → outubro). */
export function previousMonthKey(now = new Date()) {
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

const dayKey = (v) => {
  if (!v) return '';
  if (v instanceof Date) return v.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const s = String(v);
  return /T|\s\d/.test(s) ? new Date(s).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : s.slice(0, 10);
};
const inRange = (v, r) => { const d = dayKey(v); return !!d && d >= r.since && d <= r.until; };
const ms = (v) => (v ? new Date(v).getTime() : NaN);
const hours = (seconds) => Math.round((seconds / 3600) * 10) / 10;

/** Segundos de edição de um vídeo: do início da edição até ir para revisão/aprovação, sem as pausas. */
export function editSeconds(task) {
  const start = ms(task.editing_started_at);
  if (!Number.isFinite(start)) return 0;
  const ends = [task.reviewing_at, task.approval_sent_at, task.approved_at].map(ms).filter((t) => Number.isFinite(t) && t > start);
  if (!ends.length) return 0;
  const total = (Math.min(...ends) - start) / 1000 - (Number(task.editing_paused_seconds) || 0);
  return total > 0 && total <= MAX_EDIT_SECONDS ? Math.round(total) : 0;
}

function delta(cur, prev) {
  if (cur === null || cur === undefined || prev === null || prev === undefined) return null;
  return Number(cur) - Number(prev);
}

/** Métricas da rede (formato de getClientInsights do Instagram) resumidas e comparadas ao mês anterior. */
export function summarizeNetwork(insights, prevInsights) {
  if (!insights || insights.error) return { connected: false, reason: insights?.error || null };
  const pick = (o, k) => (o && o[k] !== undefined ? o[k] : null);
  const keys = ['followers_total', 'followers_gained', 'reach', 'views', 'interactions', 'profile_views', 'website_clicks', 'posts_count'];
  const current = Object.fromEntries(keys.map((k) => [k, pick(insights, k)]));
  const previous = prevInsights && !prevInsights.error ? Object.fromEntries(keys.map((k) => [k, pick(prevInsights, k)])) : null;
  const top = (insights.posts || [])
    .map((p) => ({
      caption: String(p.caption || '').split('\n')[0].slice(0, 90),
      permalink: p.permalink || null,
      type: p.media_type || p.type || null,
      reach: p.reach ?? null,
      interactions: p.interactions ?? p.engagement ?? ((p.like_count || 0) + (p.comments_count || 0)),
      date: dayKey(p.timestamp) || null,
    }))
    .sort((a, b) => (b.reach ?? b.interactions ?? 0) - (a.reach ?? a.interactions ?? 0))
    .slice(0, 3);
  return {
    connected: true,
    account: insights.account_name || null,
    current,
    previous,
    change: previous ? Object.fromEntries(keys.map((k) => [k, delta(current[k], previous[k])])) : null,
    top_posts: top,
  };
}

/**
 * Monta os números do mês de um cliente.
 * @param {object} p
 * @param {string} p.month           "AAAA-MM"
 * @param {object[]} p.contentTasks  vídeos do cliente (content_tasks)
 * @param {object[]} p.designTasks   artes (design_tasks)
 * @param {object[]} p.posts         social_media_deliveries
 * @param {object[]} p.recordings    gravações (recordings)
 * @param {object[]} p.deliveryRecords registros de entrega por gravação (delivery_records)
 * @param {number}  p.recordingMinutes duração padrão de uma gravação (Configurações da empresa)
 */
export function buildMonthlyNumbers({ month, contentTasks = [], designTasks = [], posts = [], recordings = [], deliveryRecords = [], recordingMinutes = 90 }) {
  const r = monthRange(month);

  const videos = contentTasks.filter((t) => (t.approved_at
    ? inRange(t.approved_at, r)
    : VIDEO_DONE_COLUMNS.has(t.kanban_column) && inRange(t.updated_at, r)));
  const byType = {};
  for (const v of videos) {
    const label = VIDEO_TYPE_LABELS[v.content_type] || (v.content_type ? String(v.content_type) : 'Vídeos');
    (byType[label] ||= []).push(String(v.title || '').trim() || 'Sem título');
  }

  const arts = designTasks.filter((t) => DESIGN_DONE_COLUMNS.has(t.kanban_column) && inRange(t.completed_at || t.client_approved_at || t.updated_at, r));
  const donePosts = posts.filter((p) => POST_DONE_STATUS.has(p.status) && inRange(p.posted_at || p.delivered_at, r));

  const monthRecordings = recordings.filter((g) => inRange(g.date, r));
  const done = monthRecordings.filter((g) => ['concluida', 'concluido', 'realizada'].includes(g.status));
  const cancelled = monthRecordings.filter((g) => ['cancelada', 'cancelado'].includes(g.status));
  const records = deliveryRecords.filter((d) => inRange(d.date, r));
  const recordedVideos = records.reduce((a, d) => a + (Number(d.videos_recorded) || 0), 0);

  // horas: design pelo cronômetro das artes do mês; edição pelo tempo de cada vídeo; gravação pela duração padrão
  const designSeconds = arts.reduce((a, t) => a + (Number(t.time_spent_seconds) || 0), 0);
  const editingSeconds = videos.reduce((a, t) => a + editSeconds(t), 0);
  const recordingSeconds = done.length * recordingMinutes * 60;

  return {
    month: r.month,
    label: r.label,
    period: { since: r.since, until: r.until },
    deliveries: {
      videos: { total: videos.length, by_type: Object.entries(byType).map(([type, titles]) => ({ type, total: titles.length, titles: titles.slice(0, 12) })) },
      arts: { total: arts.length, titles: arts.map((a) => String(a.title || '').trim() || 'Sem título').slice(0, 12) },
      posts: { total: donePosts.length },
      recordings: {
        scheduled: monthRecordings.length - cancelled.length,
        done: done.length,
        cancelled: cancelled.length,
        videos_recorded: recordedVideos,
        avg_videos_per_recording: records.length ? Math.round((recordedVideos / records.length) * 10) / 10 : null,
      },
    },
    time: {
      recording_hours: hours(recordingSeconds),
      editing_hours: hours(editingSeconds),
      design_hours: hours(designSeconds),
      total_hours: hours(recordingSeconds + editingSeconds + designSeconds),
      recording_minutes_each: recordingMinutes,
    },
  };
}

const fmtInt = (n) => (n === null || n === undefined ? null : Number(n).toLocaleString('pt-BR'));
const signed = (n) => (n === null || n === undefined ? '' : ` (${n >= 0 ? '+' : ''}${Number(n).toLocaleString('pt-BR')})`);

/** Uma linha com a rede social do mês, ou null quando o Instagram não está conectado. */
export function networkLine(network) {
  if (!network?.connected) return null;
  const c = network.current;
  const ch = network.change || {};
  const parts = [];
  if (c.reach !== null) parts.push(`${fmtInt(c.reach)} contas alcançadas${signed(ch.reach)}`);
  if (c.followers_gained !== null) parts.push(`${c.followers_gained >= 0 ? '+' : ''}${fmtInt(c.followers_gained)} seguidores`);
  if (c.interactions !== null) parts.push(`${fmtInt(c.interactions)} interações${signed(ch.interactions)}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Mensagem do dia 1 (rascunho aprovado pelo usuário em 01/11/2026). Só sai com o relatório aprovado pela equipe. */
export function monthlyMessage({ clientName, numbers, network, suggestions, reportUrl, currentMonthName }) {
  const d = numbers.deliveries;
  const lines = [
    `Bom dia, ${String(clientName || '').trim()}! ☀️ Aqui é a Ísis, da Pulse.`,
    `Fechamos ${numbers.label.split(' de ')[0]} e quero te mostrar o que fizemos juntos:`,
    `🎬 ${d.videos.total} vídeos · 🎨 ${d.arts.total} artes · 📲 ${d.posts.total} posts · 🎥 ${d.recordings.done} gravações`,
  ];
  if (numbers.time.total_hours > 0) lines.push(`⏱️ ${numbers.time.total_hours.toLocaleString('pt-BR')} h dedicadas ao seu perfil`);
  const net = networkLine(network);
  if (net) lines.push(`📈 ${net}`);
  const tips = String(suggestions || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (tips.length) {
    lines.push('', `Para ${currentMonthName}, nossas sugestões:`, ...tips.map((t) => (/^[•\-–\d]/.test(t) ? t : `• ${t}`)));
  }
  if (reportUrl) lines.push('', `O relatório completo está aqui: ${reportUrl}`);
  lines.push('Qualquer ideia, é só me chamar! 🧡');
  return lines.join('\n');
}

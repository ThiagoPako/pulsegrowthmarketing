// ─── Melhor dia e horário para postar (usuário, 03/11/2026) ─────────────────────────────────────────────────────────
// "Se a API traz dados, quero que fique no calendário o melhor dia e horário para postar, marcado com o símbolo da Pulse
// pulsando bem leve, já com botão para agendar." Só aparece quando há dado de verdade do perfil:
//  1. seguidores online por hora (Instagram pela Meta: insights online_followers, últimos dias, em horário do Pacífico);
//  2. o desempenho dos posts já publicados (curtidas + comentários de cada post, pela Meta ou pela Upload-Post).
// Cada dia da semana × hora (horário de Brasília) ganha uma nota de 0 a 1; os 3 melhores horários, em dias diferentes,
// vão para o calendário. Guardado 6 h por cliente para não pedir à rede a cada abertura.
//   GET /api/scheduling/best-times?client_id=   (equipe)

const META = 'https://graph.facebook.com/v21.0';
const CACHE_MS = 6 * 3600_000;
const MIN_POSTS = 8; // abaixo disso, o desempenho dos posts não diz nada
const BRT = 'America/Sao_Paulo';

/** Dia da semana (0 = segunda … 6 = domingo, como o calendário) e hora em Brasília. */
export function brtSlot(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BRT, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(date));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.find((p) => p.type === 'weekday')?.value);
  return { weekday: wd, hour: Number(parts.find((p) => p.type === 'hour')?.value) % 24 };
}

/** Diferença em horas entre Brasília e o horário do Pacífico naquela data (5 no inverno de lá, 4 no verão). */
export function ptToBrtHours(date) {
  const at = (tz) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23', day: 'numeric' }).formatToParts(new Date(date));
    return Number(p.find((x) => x.type === 'day').value) * 24 + Number(p.find((x) => x.type === 'hour').value);
  };
  return at(BRT) - at('America/Los_Angeles');
}

/** Normaliza uma grade 7×24 para 0–1 (divide pelo maior valor). */
const normalize = (grid) => {
  const max = Math.max(0, ...grid.flat());
  return max > 0 ? grid.map((row) => row.map((v) => v / max)) : null;
};
const emptyGrid = () => Array.from({ length: 7 }, () => Array(24).fill(0));

/** Seguidores online (values: [{ value: { "0": n … "23": n }, end_time }]) → média por dia da semana e hora de Brasília. */
export function onlineGrid(values) {
  const sum = emptyGrid();
  const count = emptyGrid();
  for (const v of values || []) {
    if (!v?.value || !v.end_time) continue;
    // end_time é o fim do dia no Pacífico: o dia medido é o anterior
    const day = new Date(new Date(v.end_time).getTime() - 12 * 3600_000);
    const dayPt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(day);
    // Pacífico = UTC−8 (inverno) ou UTC−7 (verão); Brasília é UTC−3 o ano todo
    const ptOffset = 3 + ptToBrtHours(day);
    for (const [h, n] of Object.entries(v.value)) {
      const instant = new Date(Date.parse(`${dayPt}T00:00:00Z`) + (Number(h) + ptOffset) * 3600_000);
      const { weekday, hour } = brtSlot(instant);
      if (weekday < 0) continue;
      sum[weekday][hour] += Number(n) || 0;
      count[weekday][hour] += 1;
    }
  }
  const avg = sum.map((row, d) => row.map((v, h) => (count[d][h] ? v / count[d][h] : 0)));
  return normalize(avg);
}

/** Posts publicados ({ timestamp, like_count, comments_count }) → engajamento médio por dia/hora, suavizado nas horas vizinhas. */
export function engagementGrid(posts) {
  const list = (posts || []).filter((p) => p?.timestamp && (p.like_count != null || p.comments_count != null));
  if (list.length < MIN_POSTS) return null;
  const scores = list.map((p) => (Number(p.like_count) || 0) + 2 * (Number(p.comments_count) || 0));
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  const sum = emptyGrid();
  const count = emptyGrid();
  list.forEach((p, i) => {
    const { weekday, hour } = brtSlot(p.timestamp);
    if (weekday < 0) return;
    const rel = scores[i] / Math.max(1, median);
    // a hora do post e as vizinhas (peso menor): poucos posts não deixam buracos
    for (const [dh, w] of [[0, 1], [-1, 0.5], [1, 0.5]]) {
      const h = (hour + dh + 24) % 24;
      sum[weekday][h] += rel * w;
      count[weekday][h] += w;
    }
  });
  // média com um "post vazio" a mais: horário com mais posts bons pesa mais que o vizinho só suavizado
  const avg = sum.map((row, d) => row.map((v, h) => (count[d][h] ? v / (count[d][h] + 1) : 0)));
  return normalize(avg);
}

/** Junta as grades e escolhe os melhores horários, um por dia da semana, das 7h às 22h. */
export function pickBest(online, engagement, { top = 3 } = {}) {
  if (!online && !engagement) return [];
  const slots = [];
  for (let d = 0; d < 7; d += 1) {
    let best = null;
    for (let h = 7; h <= 22; h += 1) {
      const o = online?.[d][h] ?? null;
      const e = engagement?.[d][h] ?? null;
      const score = o != null && e != null ? 0.6 * o + 0.4 * e : (o ?? e);
      if (score > 0 && (!best || score > best.score)) best = { weekday: d, hour: h, score, online: o, engagement: e };
    }
    if (best) slots.push(best);
  }
  return slots.sort((a, b) => b.score - a.score).slice(0, top).map((s) => ({
    weekday: s.weekday,
    hour: s.hour,
    score: Math.round(s.score * 100) / 100,
    reason: s.online != null && s.online >= 0.8 ? 'muitos seguidores online' : s.engagement != null && s.engagement >= 0.8 ? 'os seus posts nesse horário engajam mais' : 'bom público e engajamento',
  }));
}

export function createBestTimes({ pool, uploadPost, fetchImpl = fetch, logger = console }) {
  const cache = new Map();

  async function metaGet(path, token) {
    const r = await fetchImpl(`${META}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b?.error?.message || `Meta ${r.status}`);
    return b;
  }

  async function compute(clientId) {
    const { rows: accounts } = await pool.query(
      `SELECT platform, api_base, access_token, instagram_business_id FROM social_accounts
        WHERE client_id = $1 AND platform IN ('instagram', 'facebook') AND coalesce(status, 'connected') = 'connected'`, [clientId]
    );
    let online = null;
    let posts = [];
    const sources = [];
    const ig = accounts.find((a) => a.platform === 'instagram' && a.access_token && a.instagram_business_id);
    if (ig) {
      try {
        const r = await metaGet(`${ig.instagram_business_id}/insights?metric=online_followers&period=lifetime`, ig.access_token);
        online = onlineGrid(r?.data?.[0]?.values);
        if (online) sources.push('seguidores online (Instagram)');
      } catch (error) { logger.warn?.('[melhor horário] online_followers:', error.message); }
      try {
        const r = await metaGet(`${ig.instagram_business_id}/media?fields=timestamp,like_count,comments_count&limit=60`, ig.access_token);
        posts = r?.data || [];
      } catch (error) { logger.warn?.('[melhor horário] posts (Meta):', error.message); }
    }
    if (posts.length < MIN_POSTS && uploadPost && accounts.some((a) => a.api_base === 'upload_post')) {
      try {
        const { rows: [p] } = await pool.query(`SELECT username FROM client_upload_post WHERE client_id = $1`, [clientId]);
        if (p?.username) {
          const r = await uploadPost.call('GET', `/uploadposts/media?platform=instagram&user=${encodeURIComponent(p.username)}&limit=60`);
          if ((r?.media || []).length > posts.length) posts = r.media;
        }
      } catch (error) { logger.warn?.('[melhor horário] posts (Upload-Post):', error.message); }
    }
    const engagement = engagementGrid(posts);
    if (engagement) sources.push(`${posts.length} posts publicados`);
    return { slots: pickBest(online, engagement), sources, computed_at: new Date().toISOString() };
  }

  async function get(clientId) {
    const hit = cache.get(clientId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await compute(clientId);
    cache.set(clientId, { at: Date.now(), value });
    return value;
  }

  return { get };
}

export function registerBestTimesRoutes(app, { bestTimes, verifySocialManager, scope = null, logger = console }) {
  app.get('/api/scheduling/best-times', async (req, res) => {
    try {
      await verifySocialManager(req);
      const clientId = String(req.query.client_id || '');
      if (!clientId) return res.status(400).json({ error: 'client_id é obrigatório' });
      if (scope) await scope.guard(req, clientId);
      res.json(await bestTimes.get(clientId));
    } catch (error) {
      const code = Number(error?.status);
      const msg = String(error?.message || '');
      const status = code >= 400 && code < 600 ? code : /unauthori|login|token/i.test(msg) ? 401 : /permiss|acesso/i.test(msg) ? 403 : 500;
      if (status >= 500) logger.error('[melhor horário]', msg);
      res.status(status).json({ error: msg || 'Erro' });
    }
  });
}

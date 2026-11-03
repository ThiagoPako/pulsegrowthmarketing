// ─── Feriados e aniversário das cidades no calendário do Estúdio (usuário, 03/11/2026) ───────────────────────────────
// "Adicione no calendário os feriados; se o cliente tiver alguma unidade da empresa cadastrada numa cidade e for
// aniversário da cidade, deve aparecer também, e ainda solicitar para criar a arte para essa cidade de forma automática."
//  - feriados nacionais do Brasil (fixos e os que seguem a Páscoa), calculados para qualquer ano;
//  - aniversário de cada cidade das unidades do cliente (banco de clientes: client_units.city_anniversary; ano 0001 =
//    ano de fundação não informado, então não mostra a idade);
//  - todo dia o sistema confere os aniversários dos próximos 15 dias e cria a arte no Kanban de Design (Nova Tarefa),
//    uma por cliente, cidade e ano, com prazo 3 dias antes da data.
//   GET /api/scheduling/calendar-events?client_id=&from=&to=   (equipe)

export const ART_LEAD_DAYS = 15;
export const ART_DUE_BEFORE = 3;

const pad = (n) => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (dateKey, n) => {
  const t = new Date(`${dateKey}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return key(year, month, day);
}

/** Feriados nacionais (kind: 'feriado' ou 'facultativo') de um ano. */
export function holidays(year) {
  const p = easter(year);
  const list = [
    [key(year, 1, 1), 'Confraternização Universal', 'feriado'],
    [addDays(p, -48), 'Carnaval', 'facultativo'],
    [addDays(p, -47), 'Carnaval', 'facultativo'],
    [addDays(p, -46), 'Quarta-feira de Cinzas', 'facultativo'],
    [addDays(p, -2), 'Sexta-feira Santa', 'feriado'],
    [p, 'Páscoa', 'feriado'],
    [key(year, 4, 21), 'Tiradentes', 'feriado'],
    [key(year, 5, 1), 'Dia do Trabalho', 'feriado'],
    [addDays(p, 60), 'Corpus Christi', 'facultativo'],
    [key(year, 9, 7), 'Independência do Brasil', 'feriado'],
    [key(year, 10, 12), 'Nossa Senhora Aparecida', 'feriado'],
    [key(year, 11, 2), 'Finados', 'feriado'],
    [key(year, 11, 15), 'Proclamação da República', 'feriado'],
    [key(year, 11, 20), 'Dia da Consciência Negra', 'feriado'],
    [key(year, 12, 25), 'Natal', 'feriado'],
  ];
  return list.map(([date, name, kind]) => ({ date, name, kind }));
}

export function holidaysBetween(from, to) {
  const out = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y += 1) {
    for (const h of holidays(y)) if (h.date >= from && h.date <= to) out.push(h);
  }
  return out;
}

const cityKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const titleCase = (s) => String(s || '').trim().toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());

/** Aniversários (uma entrada por cidade) que caem entre from e to, com a idade quando o ano de fundação é conhecido. */
export function anniversariesBetween(units, from, to) {
  const byCity = new Map();
  for (const u of units) {
    if (!u.city_anniversary || !u.city_name) continue;
    const d = typeof u.city_anniversary === 'string' ? u.city_anniversary.slice(0, 10) : new Date(u.city_anniversary).toISOString().slice(0, 10);
    const [fy, fm, fd] = d.split('-').map(Number);
    const ck = cityKey(u.city_name);
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y += 1) {
      const date = key(y, fm, fd);
      if (date < from || date > to) continue;
      const k = `${ck}|${date}`;
      const cur = byCity.get(k) || { date, city: titleCase(u.city_name), city_key: ck, years: fy > 1000 ? y - fy : null, units: [] };
      cur.units.push(String(u.unit_name || '').trim() || titleCase(u.city_name));
      byCity.set(k, cur);
    }
  }
  return [...byCity.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function createCalendarEvents({ pool, logger = console, now = () => new Date() }) {
  let ready = null;
  const ensure = () => (ready ||= pool.query(`
    CREATE TABLE IF NOT EXISTS city_anniversary_arts (
      client_id uuid NOT NULL,
      city_key text NOT NULL,
      year int NOT NULL,
      design_task_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (client_id, city_key, year)
    )`).catch((e) => { ready = null; throw e; }));

  const unitsOf = async (clientId) => (await pool.query(
    `SELECT unit_name, city_name, city_anniversary FROM client_units WHERE client_id = $1 AND city_anniversary IS NOT NULL`, [clientId]
  )).rows;

  async function forClient(clientId, from, to) {
    await ensure();
    const anniversaries = anniversariesBetween(await unitsOf(clientId), from, to);
    const { rows: arts } = await pool.query(
      `SELECT a.city_key, a.year, a.design_task_id, d.kanban_column FROM city_anniversary_arts a
         LEFT JOIN design_tasks d ON d.id = a.design_task_id WHERE a.client_id = $1`, [clientId]
    );
    return {
      holidays: holidaysBetween(from, to),
      anniversaries: anniversaries.map((a) => {
        const art = arts.find((x) => x.city_key === a.city_key && x.year === Number(a.date.slice(0, 4)));
        return { ...a, art: art ? { id: art.design_task_id, column: art.kanban_column || null } : null };
      }),
    };
  }

  /** Cria as artes dos aniversários dos próximos dias (uma vez por cliente, cidade e ano). */
  async function requestArts() {
    await ensure();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now());
    const until = addDays(today, ART_LEAD_DAYS);
    const { rows } = await pool.query(
      `SELECT u.client_id, u.unit_name, u.city_name, u.city_anniversary, c.company_name, c.city AS client_city
         FROM client_units u JOIN clients c ON c.id = u.client_id
        WHERE u.city_anniversary IS NOT NULL AND coalesce(c.status, 'ativo') = 'ativo'`
    );
    const byClient = new Map();
    for (const r of rows) byClient.set(r.client_id, [...(byClient.get(r.client_id) || []), r]);
    let created = 0;
    for (const [clientId, units] of byClient) {
      for (const a of anniversariesBetween(units, today, until)) {
        const year = Number(a.date.slice(0, 4));
        const { rowCount } = await pool.query(
          `INSERT INTO city_anniversary_arts (client_id, city_key, year) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [clientId, a.city_key, year]
        );
        if (!rowCount) continue;
        const client = units[0];
        const [, m, d] = a.date.split('-');
        const due = addDays(a.date, -ART_DUE_BEFORE) < today ? today : addDays(a.date, -ART_DUE_BEFORE);
        const title = `Aniversário de ${a.city}${a.years ? ` · ${a.years} anos` : ''}`;
        const description = [
          `Arte de parabéns pelo aniversário de ${a.city} (${d}/${m}${a.years ? `, ${a.years} anos` : ''}).`,
          `${String(client.company_name).trim()} tem unidade na cidade: ${a.units.join(', ')}.`,
          'Fazer feed e story. Pedido automático do calendário do Estúdio de Postagem.',
        ].join('\n');
        const city = ['minacu', 'uruacu'].includes(cityKey(client.client_city)) ? cityKey(client.client_city) : 'minacu';
        const { rows: [task] } = await pool.query(
          `INSERT INTO design_tasks (client_id, title, description, format_type, kanban_column, priority, city, due_date)
           VALUES ($1, $2, $3, 'feed', 'nova_tarefa', 'alta', $4, $5) RETURNING id`,
          [clientId, title, description, city, new Date(`${due}T18:00:00-03:00`)]
        );
        await pool.query(`UPDATE city_anniversary_arts SET design_task_id = $4 WHERE client_id = $1 AND city_key = $2 AND year = $3`, [clientId, a.city_key, year, task.id]);
        await pool.query(
          `INSERT INTO design_task_history (task_id, user_id, action, details) VALUES ($1, NULL, 'Arte criada', 'Pedido automático: aniversário da cidade (calendário do Estúdio)')`, [task.id]
        ).catch(() => {});
        created += 1;
        logger.log?.(`[aniversário de cidade] arte ${task.id} para ${String(client.company_name).trim()}: ${title} (${a.date})`);
      }
    }
    return created;
  }

  /** Confere uma vez por dia (e logo depois de subir o servidor). */
  function start() {
    let last = '';
    const tick = () => {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now());
      if (day === last) return;
      last = day;
      requestArts().catch((e) => { last = ''; logger.error?.('[aniversário de cidade]', e.message); });
    };
    setTimeout(tick, 60_000);
    setInterval(tick, 3600_000);
  }

  return { forClient, requestArts, start };
}

export function registerCalendarEventRoutes(app, { events, verifySocialManager, scope = null, logger = console }) {
  app.get('/api/scheduling/calendar-events', async (req, res) => {
    try {
      await verifySocialManager(req);
      const clientId = String(req.query.client_id || '');
      const from = String(req.query.from || '');
      const to = String(req.query.to || '');
      if (!clientId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: 'client_id, from e to são obrigatórios' });
      if (scope) await scope.guard(req, clientId);
      res.json(await events.forClient(clientId, from, to));
    } catch (error) {
      const code = Number(error?.status);
      const msg = String(error?.message || '');
      const status = code >= 400 && code < 600 ? code : /unauthori|login|token/i.test(msg) ? 401 : /permiss|acesso/i.test(msg) ? 403 : 500;
      if (status >= 500) logger.error('[calendário]', msg);
      res.status(status).json({ error: msg || 'Erro' });
    }
  });
}

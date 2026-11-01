// ─── Aviso da manhã: artes de feriado que vencem em breve (Ísis, pedido do usuário, 01/11/2026) ───────────────
// Espelho dos feriados de src/lib/artSuggestions.ts (HOLIDAY_RULES, easter, título do card): mudou um, mude o outro.
// Diz, para cada feriado dos próximos dias, quais clientes ainda não têm o card "Aviso de feriado · …" no Kanban de
// Design e quais têm o card parado, e monta o recado da manhã para a equipe.

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const at = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return at(year, month, day);
}

export const HOLIDAYS = [
  { slug: 'confraternizacao', label: 'Confraternização Universal (Ano Novo)', date: (y) => at(y, 1, 1) },
  { slug: 'carnaval', label: 'Carnaval', date: (y) => addDays(easter(y), -48) },
  { slug: 'sexta-santa', label: 'Sexta-feira Santa', date: (y) => addDays(easter(y), -2) },
  { slug: 'tiradentes', label: 'Tiradentes', date: (y) => at(y, 4, 21) },
  { slug: 'trabalho', label: 'Dia do Trabalhador', date: (y) => at(y, 5, 1) },
  { slug: 'corpus-christi', label: 'Corpus Christi', date: (y) => addDays(easter(y), 60) },
  { slug: 'independencia', label: 'Independência do Brasil', date: (y) => at(y, 9, 7) },
  { slug: 'aparecida', label: 'Nossa Senhora Aparecida', date: (y) => at(y, 10, 12) },
  { slug: 'finados', label: 'Finados', date: (y) => at(y, 11, 2) },
  { slug: 'republica', label: 'Proclamação da República', date: (y) => at(y, 11, 15) },
  { slug: 'consciencia-negra', label: 'Dia da Consciência Negra', date: (y) => at(y, 11, 20) },
  { slug: 'natal', label: 'Natal', date: (y) => at(y, 12, 25) },
  { slug: 'reveillon', label: 'Réveillon', date: (y) => at(y, 12, 31) },
];

const dataBr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Título do card (igual ao suggestionCardTitle do Kanban de Design). */
export const holidayCardTitle = (h) => `Aviso de feriado · ${h.label} (${dataBr(h.date)})`;

/** Feriados de hoje (AAAA-MM-DD, Brasília) até `days` dias. */
export function upcomingHolidays(today, days = 10) {
  const t = new Date(`${today}T00:00:00Z`);
  const out = [];
  for (const y of [t.getUTCFullYear(), t.getUTCFullYear() + 1]) {
    for (const r of HOLIDAYS) {
      const d = r.date(y);
      const until = Math.round((d.getTime() - t.getTime()) / 86400000);
      if (until < 0 || until > days) continue;
      out.push({ slug: r.slug, label: r.label, date: key(d), daysUntil: until });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

const DONE = new Set(['concluida', 'aprovada_cliente', 'postado', 'agendado']);

/**
 * Para cada feriado: clientes sem card e cards ainda abertos (com a coluna).
 * @param holidays  saída de upcomingHolidays
 * @param clients   [{ id, company_name }] clientes ativos
 * @param tasks     [{ client_id, title, kanban_column }] cards do Kanban de Design
 */
export function holidayStatus(holidays, clients, tasks) {
  return holidays.map((h) => {
    const title = holidayCardTitle(h);
    // só dos clientes ativos (card de cliente cancelado não entra no recado)
    const active = new Set(clients.map((c) => c.id));
    const mine = tasks.filter((t) => active.has(t.client_id) && String(t.title || '').startsWith(title));
    const withCard = new Set(mine.map((t) => t.client_id));
    return {
      ...h,
      title,
      missing: clients.filter((c) => !withCard.has(c.id)).map((c) => String(c.company_name || '').trim()),
      open: mine.filter((t) => !DONE.has(t.kanban_column)).map((t) => ({
        client: String(clients.find((c) => c.id === t.client_id)?.company_name || '').trim() || 'cliente',
        column: t.kanban_column,
      })),
      done: mine.filter((t) => DONE.has(t.kanban_column)).length,
    };
  });
}

const quando = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);

/** Recado da manhã; null quando não há nada pendente. */
export function morningMessage(status) {
  const pend = status.filter((h) => h.missing.length || h.open.length);
  if (!pend.length) return null;
  const lines = ['Bom dia! ☀️ Artes de feriado que vencem em breve:'];
  for (const h of pend) {
    lines.push('', `📅 *${h.label}* (${dataBr(h.date)}, ${quando(h.daysUntil)})`);
    if (h.missing.length) lines.push(`• Sem card (${h.missing.length}): ${h.missing.slice(0, 12).join(', ')}${h.missing.length > 12 ? '…' : ''}`);
    if (h.open.length) lines.push(`• Em andamento (${h.open.length}): ${h.open.slice(0, 12).map((o) => o.client).join(', ')}${h.open.length > 12 ? '…' : ''}`);
  }
  lines.push('', 'Os cards saem do "Ísis sugere" no Kanban de Design (aviso fechado ou "estaremos abertos" por cliente).');
  return lines.join('\n');
}

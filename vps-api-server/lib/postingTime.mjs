// Data e hora de postagem no fuso de Brasília (a agência e os clientes estão em Goiás).
// Sem dependências. Espelho do front: src/lib/postingSchedule.ts (mudou um, mude o outro).

export const POSTING_TZ = 'America/Sao_Paulo';

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: POSTING_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

function readParts(ms) {
  const out = {};
  for (const p of partsFormatter.formatToParts(new Date(ms))) out[p.type] = p.value;
  return out;
}

/** Diferença (min) entre o relógio de Brasília e o UTC naquele instante (ex.: -180). */
function offsetMinutes(ms) {
  const p = readParts(ms);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUtc - ms) / 60000);
}

/** Data (AAAA-MM-DD) e hora (HH:mm) de Brasília de um instante. */
export function brtParts(value) {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const p = readParts(ms);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}` };
}

/** Instante (ISO, UTC) do dia e hora de Brasília. null se a data ou a hora forem inválidas. */
export function brtToIso(dateKey, time) {
  if (!DATE_KEY_RE.test(String(dateKey || '')) || !TIME_RE.test(String(time || ''))) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetMinutes(guess) * 60000;
  const second = offsetMinutes(utc);
  if (guess - second * 60000 !== utc) utc = guess - second * 60000;
  const check = brtParts(utc);
  if (!check || check.date !== dateKey) return null; // ex.: 31/02
  return new Date(utc).toISOString();
}

/** Mesmo horário de Brasília em outro dia (arrastar no calendário muda só a data). */
export function moveToDateKeepingTime(iso, dateKey) {
  const current = brtParts(iso);
  if (!current) return null;
  return brtToIso(dateKey, current.time);
}

/** dd/MM às HH:mm (histórico e avisos). */
export function formatBrt(dateKey, time) {
  const [, m, d] = String(dateKey).split('-');
  return time ? `${d}/${m} às ${time}` : `${d}/${m}`;
}

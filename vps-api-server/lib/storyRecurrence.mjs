// Repetição de stories (módulo Agendamentos): regra da série, ocorrências no fuso de Brasília e o link do
// WhatsApp do cliente. Sem banco e sem dependências: o gerador (storySeries.mjs) chama estas funções e os
// testes de unidade (src/test/storyRecurrence.test.ts) também.
//
// Regra normalizada:
//   { kind: 'interval' | 'weekly', interval_days, weekdays (0 = segunda … 6 = domingo), time 'HH:mm',
//     start_date 'AAAA-MM-DD', end_kind: 'never' | 'date' | 'count', end_date, max_count }
// "Toda segunda às 8h" é 8h de Brasília: cada ocorrência é o dia e a hora locais convertidos para UTC.

import { DATE_KEY_RE, TIME_RE, brtToIso } from './postingTime.mjs';

export const MAX_INTERVAL_DAYS = 90;
export const MAX_COUNT = 365;
// Teto de dias percorridos (dez anos): série sem fim nunca vira laço infinito
const MAX_SCAN_DAYS = 3660;
const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

function ruleError(message) {
  return Object.assign(new Error(message), { statusCode: 400, code: 'invalid_rule' });
}

export function addDaysKey(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`)) / 86_400_000);
}

/** 0 = segunda … 6 = domingo */
export function weekdayIndex(dateKey) {
  return (new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function validDateKey(value) {
  const key = String(value || '').slice(0, 10);
  if (!DATE_KEY_RE.test(key)) return null;
  return brtToIso(key, '12:00') ? key : null; // 31/02 não passa
}

/**
 * Confere e normaliza a regra vinda da tela. Lança erro 400 com a mensagem para a pessoa.
 * input: { kind, interval_days, weekdays, time, start_date, end_kind, end_date, max_count }
 */
export function normalizeRule(input = {}) {
  const kind = input.kind === 'weekly' ? 'weekly' : input.kind === 'interval' ? 'interval' : null;
  if (!kind) throw ruleError('Escolha como repetir');
  const time = String(input.time || '').slice(0, 5);
  if (!TIME_RE.test(time)) throw ruleError('Escolha a hora');
  const startDate = validDateKey(input.start_date);
  if (!startDate) throw ruleError('Escolha a data de início');

  let intervalDays = null;
  let weekdays = null;
  if (kind === 'interval') {
    intervalDays = Number(input.interval_days);
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > MAX_INTERVAL_DAYS) {
      throw ruleError(`Repetir a cada 1 a ${MAX_INTERVAL_DAYS} dias`);
    }
  } else {
    const list = Array.isArray(input.weekdays) ? input.weekdays : [];
    weekdays = [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
    if (!weekdays.length) throw ruleError('Escolha pelo menos um dia da semana');
  }

  const endKind = ['date', 'count'].includes(input.end_kind) ? input.end_kind : 'never';
  let endDate = null;
  let maxCount = null;
  if (endKind === 'date') {
    endDate = validDateKey(input.end_date);
    if (!endDate) throw ruleError('Escolha a data do fim');
    if (endDate < startDate) throw ruleError('O fim precisa ser depois do início');
  } else if (endKind === 'count') {
    maxCount = Number(input.max_count);
    if (!Number.isInteger(maxCount) || maxCount < 1 || maxCount > MAX_COUNT) throw ruleError(`Escolha de 1 a ${MAX_COUNT} vezes`);
  }
  return {
    kind, interval_days: intervalDays, weekdays, time, start_date: startDate,
    end_kind: endKind, end_date: endDate, max_count: maxCount,
  };
}

/** Regra a partir da linha de story_series (o banco devolve DATE como texto ou Date). */
export function ruleFromRow(row) {
  const dateKey = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null));
  return {
    kind: row.rule_kind,
    interval_days: row.interval_days ?? null,
    weekdays: Array.isArray(row.weekdays) ? row.weekdays.map(Number) : null,
    time: row.time,
    start_date: dateKey(row.start_date),
    end_kind: row.end_kind || 'never',
    end_date: dateKey(row.end_date),
    max_count: row.max_count ?? null,
  };
}

function dayMatches(rule, day) {
  if (rule.kind === 'interval') return daysBetween(rule.start_date, day) % rule.interval_days === 0;
  return rule.weekdays.includes(weekdayIndex(day));
}

/**
 * Ocorrências da regra com o instante entre fromMs e toMs (inclusive), na ordem.
 * index conta desde o início da série (o fim "por número de vezes" vale sobre a série toda).
 * Devolve [{ index, date, time, at }] com at em ISO (UTC).
 */
export function listOccurrences(rule, { fromMs = -Infinity, toMs } = {}) {
  if (!Number.isFinite(toMs)) throw new Error('toMs obrigatório');
  const out = [];
  let index = 0;
  let day = rule.start_date;
  for (let scanned = 0; scanned < MAX_SCAN_DAYS; scanned++, day = addDaysKey(day, 1)) {
    if (rule.end_kind === 'date' && day > rule.end_date) break;
    if (rule.end_kind === 'count' && index >= rule.max_count) break;
    if (!dayMatches(rule, day)) continue;
    const at = brtToIso(day, rule.time);
    const ms = Date.parse(at);
    if (ms > toMs) break;
    if (ms >= fromMs) out.push({ index, date: day, time: rule.time, at });
    index++;
  }
  return out;
}

/** A ocorrência de número index (0, 1, …) ou null. */
export function occurrenceAt(rule, at) {
  const target = Date.parse(at);
  if (!Number.isFinite(target)) return null;
  const list = listOccurrences(rule, { fromMs: target, toMs: target });
  return list[0] || null;
}

/**
 * Regra da continuação ("este e os próximos" a partir da ocorrência fromIndex/fromDate):
 * começa no dia dela e, com fim por número de vezes, leva só as que faltavam.
 */
export function continuationRule(rule, { fromDate, fromIndex }, changes = {}) {
  const next = { ...rule, ...changes, start_date: changes.start_date || fromDate };
  if (rule.end_kind === 'count' && !('max_count' in changes) && !('end_kind' in changes)) {
    next.max_count = Math.max(1, rule.max_count - fromIndex);
  }
  return normalizeRule(next);
}

function fmtDate(key) {
  const [y, m, d] = String(key).split('-');
  return `${d}/${m}/${y}`;
}

/** "A cada 2 dias às 08:00", "Toda segunda às 08:00", "Seg, Qua e Sex às 08:00" (+ fim). */
export function ruleSummary(rule) {
  let base;
  if (rule.kind === 'interval') {
    base = rule.interval_days === 1 ? 'Todo dia' : `A cada ${rule.interval_days} dias`;
  } else if (rule.weekdays.length === 7) {
    base = 'Todo dia';
  } else if (rule.weekdays.length === 1) {
    const d = rule.weekdays[0];
    base = `${d >= 5 ? 'Todo' : 'Toda'} ${WEEKDAY_LONG[d]}`;
  } else {
    const names = rule.weekdays.map((d) => WEEKDAY_SHORT[d]);
    base = `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  }
  let end = '';
  if (rule.end_kind === 'date') end = ` · até ${fmtDate(rule.end_date)}`;
  else if (rule.end_kind === 'count') end = ` · ${rule.max_count} ${rule.max_count === 1 ? 'vez' : 'vezes'}`;
  return `${base} às ${rule.time}${end}`;
}

// ── Link do WhatsApp do cliente ──

/** Número só com dígitos e DDI 55 (quem digita com DDD ganha o 55). */
export function normalizeWhatsAppNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** https://wa.me/<número>?text=<mensagem>; null sem número válido. */
export function whatsappLink(number, message = '') {
  const digits = normalizeWhatsAppNumber(number);
  if (digits.length < 10 || digits.length > 15) return null;
  const text = String(message || '').trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Endereço do link curto do cliente: "Clínica São José" → "clinica-sao-jose-wa". */
export function storySlug(name, suffix = 0) {
  const base = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/g, '') || 'cliente';
  return `${base}-wa${suffix > 1 ? `-${suffix}` : ''}`;
}

export const DEFAULT_BUTTON_TEXTS = ['Clique aqui', 'Agende sua consulta', 'Fale conosco'];

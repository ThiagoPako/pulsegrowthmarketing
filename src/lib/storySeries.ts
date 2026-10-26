/**
 * Stories no módulo Agendamentos: repetição (regra, resumo e próximas datas), botões do link e a hora padrão
 * de quem agenda. Espelho do servidor: vps-api-server/lib/storyRecurrence.mjs (mudou um, mude o outro).
 */
import { addDaysKey, brtToIso, weekdayIndex, type StoryRule } from './postingSchedule';

export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
export const DEFAULT_BUTTON_TEXTS = ['Clique aqui', 'Agende sua consulta', 'Fale conosco'];
export const DEFAULT_TIME = '09:00';
const LAST_TIME_KEY = 'agendamentos:ultima-hora';

/** Link do story que pode virar <a href>: só https (um "javascript:" rodaria no domínio do sistema). */
export function safeStoryLink(value: string | null | undefined): string | null {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Vídeo para baixar: só http(s). */
export function safeMediaUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** A orientação curta do lembrete (a única explicação na tela). */
export function storyGuidance(button: string | null | undefined, link: string | null | undefined): string {
  return `Poste pelo app com o adesivo de link na parte de baixo. Botão: ${button || DEFAULT_BUTTON_TEXTS[0]}. Link: ${link || '—'}`;
}

export interface RepeatDraft {
  enabled: boolean;
  kind: 'interval' | 'weekly';
  interval_days: number;
  weekdays: number[];
  end_kind: 'never' | 'date' | 'count';
  end_date: string;
  max_count: number;
}

export function defaultRepeat(date: string): RepeatDraft {
  return {
    enabled: false,
    kind: 'weekly',
    interval_days: 2,
    weekdays: date ? [weekdayIndex(date)] : [0],
    end_kind: 'never',
    end_date: date ? addDaysKey(date, 30) : '',
    max_count: 4,
  };
}

/** Rascunho a partir da regra salva; com fim por número de vezes, só as que faltam a partir desta data. */
export function repeatFromRule(rule: StoryRule, fromIndex: number | null = null): RepeatDraft {
  const remaining = rule.end_kind === 'count' && rule.max_count
    ? Math.max(1, rule.max_count - (fromIndex ?? 0))
    : 4;
  return {
    enabled: true,
    kind: rule.kind,
    interval_days: rule.interval_days || 2,
    weekdays: rule.weekdays?.length ? [...rule.weekdays] : [weekdayIndex(rule.start_date)],
    end_kind: rule.end_kind,
    end_date: rule.end_date || addDaysKey(rule.start_date, 30),
    max_count: remaining,
  };
}

export function repeatPayload(draft: RepeatDraft) {
  return {
    kind: draft.kind,
    interval_days: draft.kind === 'interval' ? draft.interval_days : null,
    weekdays: draft.kind === 'weekly' ? [...draft.weekdays].sort((a, b) => a - b) : null,
    end_kind: draft.end_kind,
    end_date: draft.end_kind === 'date' ? draft.end_date : null,
    max_count: draft.end_kind === 'count' ? draft.max_count : null,
  };
}

/** O que falta preencher na repetição (null = pronta). */
export function repeatProblem(draft: RepeatDraft, startDate: string): string | null {
  if (!draft.enabled) return null;
  if (draft.kind === 'interval' && !(Number.isInteger(draft.interval_days) && draft.interval_days >= 1 && draft.interval_days <= 90)) {
    return 'Repetir a cada 1 a 90 dias';
  }
  if (draft.kind === 'weekly' && !draft.weekdays.length) return 'Escolha pelo menos um dia da semana';
  if (draft.end_kind === 'date' && (!draft.end_date || draft.end_date < startDate)) return 'O fim precisa ser depois do início';
  if (draft.end_kind === 'count' && !(Number.isInteger(draft.max_count) && draft.max_count >= 1 && draft.max_count <= 365)) {
    return 'Escolha de 1 a 365 vezes';
  }
  return null;
}

function fmtDate(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

/** "A cada 2 dias às 08:00", "Toda segunda às 08:00", "Seg, Qua e Sex às 08:00" (+ fim). */
export function repeatSummary(draft: Pick<RepeatDraft, 'kind' | 'interval_days' | 'weekdays' | 'end_kind' | 'end_date' | 'max_count'>, time: string): string {
  let base: string;
  const days = [...draft.weekdays].sort((a, b) => a - b);
  if (draft.kind === 'interval') base = draft.interval_days === 1 ? 'Todo dia' : `A cada ${draft.interval_days} dias`;
  else if (days.length === 7) base = 'Todo dia';
  else if (days.length === 1) base = `${days[0] >= 5 ? 'Todo' : 'Toda'} ${WEEKDAY_LONG[days[0]]}`;
  else if (!days.length) base = 'Escolha os dias';
  else {
    const names = days.map((d) => WEEKDAY_SHORT[d]);
    base = `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  }
  let end = '';
  if (draft.end_kind === 'date' && draft.end_date) end = ` · até ${fmtDate(draft.end_date)}`;
  else if (draft.end_kind === 'count') end = ` · ${draft.max_count} ${draft.max_count === 1 ? 'vez' : 'vezes'}`;
  return `${base}${time ? ` às ${time}` : ''}${end}`;
}

/** Próximas datas da repetição a partir do início (só as que ainda não passaram). */
export function upcomingDates(draft: RepeatDraft, startDate: string, time: string, limit = 4, now = Date.now()): string[] {
  if (!startDate || repeatProblem(draft, startDate)) return [];
  const out: string[] = [];
  let index = 0;
  let day = startDate;
  for (let scanned = 0; scanned < 800 && out.length < limit; scanned++, day = addDaysKey(day, 1)) {
    if (draft.end_kind === 'date' && day > draft.end_date) break;
    if (draft.end_kind === 'count' && index >= draft.max_count) break;
    const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86_400_000);
    const matches = draft.kind === 'interval' ? diff % draft.interval_days === 0 : draft.weekdays.includes(weekdayIndex(day));
    if (!matches) continue;
    index++;
    const at = time ? brtToIso(day, time) : null;
    if (at && Date.parse(at) < now) continue;
    out.push(day);
  }
  return out;
}

/** Hora padrão ao soltar um material no calendário: a última usada (neste navegador) ou 09:00. */
export function lastUsedTime(): string {
  try {
    const value = window.localStorage.getItem(LAST_TIME_KEY);
    return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : DEFAULT_TIME;
  } catch {
    return DEFAULT_TIME;
  }
}

export function rememberTime(time: string): void {
  try {
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) window.localStorage.setItem(LAST_TIME_KEY, time);
  } catch {
    /* navegador sem armazenamento: segue com a hora padrão */
  }
}

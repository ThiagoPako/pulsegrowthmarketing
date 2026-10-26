/**
 * Calendário de postagem (módulo Agendamentos): datas como chaves AAAA-MM-DD no fuso de Brasília,
 * para o dia de um post não mudar conforme o relógio do computador.
 * Espelho do servidor: vps-api-server/lib/postingTime.mjs (mudou um, mude o outro).
 */

export const POSTING_TZ = 'America/Sao_Paulo';
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 'serie' = data prevista de uma repetição de stories, além da janela já gerada (só abre a repetição). */
export type SchedulingKind = 'conteudo' | 'arte' | 'portal' | 'post' | 'serie';
export type SchedulingState = 'nao_agendado' | 'agendado' | 'manual' | 'publicando' | 'publicado' | 'erro' | 'cancelado';
export type SchedulingType = 'reels' | 'story' | 'carrossel' | 'arte' | 'feed';
export type PublishTarget = 'instagram' | 'facebook' | 'both';
export type PublishFormat = 'reels' | 'feed' | 'stories' | 'carousel';

export interface SchedulingWhen {
  /** Instante (ISO). null quando só a data é conhecida (agendamento antigo sem hora). */
  at: string | null;
  date: string;
  time: string | null;
}

export interface SchedulingPost {
  id: string;
  status: string;
  platform: PublishTarget;
  publish_type: PublishFormat;
  caption: string;
  media_url: string | null;
  media_items: string[];
  story_link: string | null;
  story_link_text: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  last_error: string | null;
  /** Story: 'auto' = postar sozinho; 'lembrete' = a equipe posta pelo app com o link (o robô não publica). */
  story_mode?: StoryMode | null;
  reminder_sent_at?: string | null;
  reminder_followup_at?: string | null;
  /** Marcado como "Postado" por alguém (lembrete). */
  manual_posted?: boolean;
}

export type StoryMode = 'auto' | 'lembrete';

/** Regra da repetição de stories (0 = segunda … 6 = domingo; hora de Brasília). */
export interface StoryRule {
  kind: 'interval' | 'weekly';
  interval_days: number | null;
  weekdays: number[] | null;
  time: string;
  start_date: string;
  end_kind: 'never' | 'date' | 'count';
  end_date: string | null;
  max_count: number | null;
}

export interface SchedulingSeries {
  id: string;
  label: string;
  status: 'ativa' | 'encerrada' | 'cancelada';
  story_mode: StoryMode;
  rule: StoryRule;
  /** Horário original desta data na repetição (arrastar não muda). */
  slot_at: string | null;
  /** 0 = primeira data da repetição */
  index: number | null;
  last_error?: string | null;
}

/** Link e botões do story que vêm preenchidos (link do cliente). */
export interface StoryLinkDefaults {
  url: string | null;
  button_texts: string[];
  default_text: string;
  saved: boolean;
}

export interface SchedulingItem {
  key: string;
  kind: SchedulingKind;
  id: string;
  title: string;
  content_type: string | null;
  type: SchedulingType;
  column: string | null;
  approved_at: string | null;
  thumb_url: string | null;
  media_url: string | null;
  media_kind: 'video' | 'image';
  media_items: string[];
  caption: string;
  platform_label: string | null;
  state: SchedulingState;
  when?: SchedulingWhen | null;
  mode?: 'auto' | 'manual';
  locked?: boolean;
  ghost?: boolean;
  post?: SchedulingPost | null;
  /** Data de uma repetição de stories */
  series?: SchedulingSeries | null;
  /** Data prevista (ainda não gerada): só abre a repetição */
  virtual?: boolean;
}

export interface SchedulingClient {
  id: string;
  company_name: string;
  logo_url: string | null;
  color: string | null;
  city: string | null;
  accounts: { instagram: number; facebook: number };
  pending: number;
  scheduled: number;
}

export interface SchedulingAccount {
  id: string;
  platform: 'instagram' | 'facebook';
  account_name: string;
  username?: string | null;
  profile_picture_url?: string | null;
}

export interface SchedulingMaterials {
  client: Pick<SchedulingClient, 'id' | 'company_name' | 'logo_url' | 'color' | 'city'>;
  accounts: SchedulingAccount[];
  duplicated_platforms: string[];
  range: { from: string; to: string };
  scheduled: SchedulingItem[];
  unscheduled: SchedulingItem[];
  story_link?: StoryLinkDefaults | null;
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: POSTING_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

function readParts(ms: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(new Date(ms))) out[p.type] = p.value;
  return out;
}

function offsetMinutes(ms: number): number {
  const p = readParts(ms);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return Math.round((asUtc - ms) / 60000);
}

/** Dia (AAAA-MM-DD) e hora (HH:mm) de Brasília de um instante. */
export function brtParts(value: string | number | Date): { date: string; time: string } | null {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const p = readParts(ms);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}` };
}

/** Instante (ISO) do dia e hora de Brasília; null se a data ou a hora forem inválidas. */
export function brtToIso(dateKey: string, time: string): string | null {
  if (!DATE_KEY_RE.test(dateKey || '') || !TIME_RE.test(time || '')) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetMinutes(guess) * 60000;
  const second = offsetMinutes(utc);
  if (guess - second * 60000 !== utc) utc = guess - second * 60000;
  if (brtParts(utc)?.date !== dateKey) return null;
  return new Date(utc).toISOString();
}

/** Arrastar no calendário: mesmo horário de Brasília em outro dia. */
export function moveToDateKeepingTime(iso: string, dateKey: string): string | null {
  const current = brtParts(iso);
  if (!current) return null;
  return brtToIso(dateKey, current.time);
}

/** Item com a data trocada e a hora mantida (para mostrar na hora, antes da resposta do servidor). */
export function withMovedDate(item: SchedulingItem, dateKey: string): SchedulingItem {
  const when = item.when;
  if (!when) return item;
  const at = when.at ? moveToDateKeepingTime(when.at, dateKey) : null;
  return { ...item, when: { at, date: dateKey, time: when.time } };
}

export function todayKey(now: Date = new Date()): string {
  return brtParts(now)!.date;
}

export function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Primeiro dia do mês (AAAA-MM-01) somando meses. */
export function addMonthsKey(dateKey: string, months: number): string {
  const [y, m] = dateKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  return d.toISOString().slice(0, 10);
}

/** 0 = segunda … 6 = domingo */
export function weekdayIndex(dateKey: string): number {
  return (new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function isWeekendKey(dateKey: string): boolean {
  return weekdayIndex(dateKey) >= 5;
}

export function startOfWeekKey(dateKey: string): string {
  return addDaysKey(dateKey, -weekdayIndex(dateKey));
}

/** Semana de segunda a domingo que contém o dia. */
export function weekKeys(dateKey: string): string[] {
  const start = startOfWeekKey(dateKey);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

/** Dias da grade do mês (semanas completas, de segunda a domingo). */
export function monthGridKeys(monthKey: string): string[] {
  const first = `${monthKey.slice(0, 7)}-01`;
  const start = startOfWeekKey(first);
  const nextMonth = addMonthsKey(first, 1);
  const end = addDaysKey(startOfWeekKey(addDaysKey(nextMonth, -1)), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDaysKey(d, 1)) days.push(d);
  return days;
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Pode arrastar: agendado (automático ou manual) e ainda não publicado. Data prevista de repetição não arrasta. */
export function canDrag(item: SchedulingItem): boolean {
  if (item.ghost || item.locked || item.virtual) return false;
  return item.state === 'agendado' || item.state === 'manual';
}

/** Selo do story com link: 'lembrete' (vai avisar), 'avisado' (aviso enviado), 'postado' (alguém marcou). */
export type StoryBadge = 'lembrete' | 'avisado' | 'postado';
export function storyBadge(item: Pick<SchedulingItem, 'post' | 'state'>): StoryBadge | null {
  if (item.post?.story_mode !== 'lembrete') return null;
  if (item.state === 'publicado') return 'postado';
  if (item.state === 'cancelado') return null;
  return item.post.reminder_sent_at ? 'avisado' : 'lembrete';
}

export function groupByDate(items: SchedulingItem[]): Map<string, SchedulingItem[]> {
  const map = new Map<string, SchedulingItem[]>();
  for (const item of items) {
    if (!item.when) continue;
    map.set(item.when.date, [...(map.get(item.when.date) || []), item]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.when?.time || '99:99').localeCompare(b.when?.time || '99:99') || a.title.localeCompare(b.title));
  }
  return map;
}

/** Contadores do mês visível: agendados (automáticos e manuais), publicados e não agendados. */
export function monthCounts(items: SchedulingItem[], monthKey: string, unscheduled: number) {
  let scheduled = 0;
  let published = 0;
  let failed = 0;
  for (const item of items) {
    if (!item.when || !sameMonth(item.when.date, monthKey) || item.ghost) continue;
    if (item.state === 'publicado') published++;
    else if (item.state === 'erro') failed++;
    else if (item.state === 'agendado' || item.state === 'manual' || item.state === 'publicando') scheduled++;
  }
  return { scheduled, published, failed, unscheduled };
}

/** Formato sugerido para o post a partir do material. */
export function suggestFormat(item: SchedulingItem): PublishFormat {
  if (item.post?.publish_type) return item.post.publish_type;
  if (item.type === 'story') return 'stories';
  if (item.type === 'carrossel' && item.media_items.length > 1) return 'carousel';
  if (item.kind === 'arte' || item.media_kind === 'image') return 'feed';
  return 'reels';
}

/**
 * "Enviar todas para Postadas" (Kanban de Design): arte com postagem marcada no futuro fica em Aprovadas,
 * senão o post dela seria cancelado e o calendário a mostraria como publicada.
 */
export function splitScheduledArts<T extends { posting_at?: string | null }>(tasks: T[], now: number = Date.now()): { move: T[]; keep: T[] } {
  const move: T[] = [];
  const keep: T[] = [];
  for (const task of tasks) {
    const at = task.posting_at ? Date.parse(task.posting_at) : NaN;
    (Number.isFinite(at) && at > now ? keep : move).push(task);
  }
  return { move, keep };
}

/** Data de postagem gravada no card: "03/11/2026 às 10:30" (Brasília). */
export function formatPostingDate(iso: string | null | undefined): string | null {
  const parts = iso ? brtParts(iso) : null;
  if (!parts) return null;
  const [y, m, d] = parts.date.split('-');
  return `${d}/${m}/${y} às ${parts.time}`;
}

/** "seg., 03/11" */
export function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  return `${weekday} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** "Novembro de 2026" */
export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Miniatura de vídeo do Drive sem baixar o arquivo (imagem pequena gerada pelo próprio Drive). */
export function driveThumbnail(url: string | null | undefined): string | null {
  const m = String(url || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w320` : null;
}

export function isDirectVideo(url: string | null | undefined): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(url || ''));
}

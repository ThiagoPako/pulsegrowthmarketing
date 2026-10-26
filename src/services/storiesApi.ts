/**
 * Stories do módulo Agendamentos (vps-api-server/storySeries.mjs): link do WhatsApp por cliente, repetição
 * e o lembrete com link. As rotas /scheduling/* conferem login, Pulse Plus e cidade ativa; as do lembrete,
 * login e quem cuida dos stories do cliente.
 */
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import type { PublishTarget, SchedulingKind, SchedulingSeries, SchedulingWhen, StoryMode } from '@/lib/postingSchedule';
import { SchedulingApiError } from '@/services/schedulingApi';

async function call<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options);
  if (error) throw new SchedulingApiError(error.message, error.status, error.details?.code);
  return data as T;
}

export interface ClientStoryLink {
  saved: boolean;
  whatsapp: string;
  message: string;
  custom_text: string | null;
  default_text: string;
  button_texts: string[];
  responsible_user_id: string | null;
  wa_url: string | null;
  short_url: string | null;
  url: string | null;
  clicks: number;
}

export interface StoryTeamMember {
  id: string;
  name: string;
  role: 'admin' | 'social_media';
}

export async function fetchClientStoryLink(clientId: string): Promise<{ link: ClientStoryLink; team: StoryTeamMember[] }> {
  return call(`scheduling/clients/${clientId}/story-link`, { method: 'GET' });
}

export async function saveClientStoryLink(clientId: string, input: {
  whatsapp: string; message: string; custom_text: string | null; default_text: string; responsible_user_id: string | null;
}): Promise<{ link: ClientStoryLink; team: StoryTeamMember[] }> {
  return call(`scheduling/clients/${clientId}/story-link`, { method: 'PUT', body: input });
}

export interface StoryFields {
  client_id: string;
  date: string;
  time: string;
  platform: PublishTarget;
  story_mode: StoryMode;
  story_link?: string | null;
  story_link_text?: string | null;
}

export interface RepeatInput {
  kind: 'interval' | 'weekly';
  interval_days: number | null;
  weekdays: number[] | null;
  end_kind: 'never' | 'date' | 'count';
  end_date: string | null;
  max_count: number | null;
}

export async function createStorySeries(input: StoryFields & {
  kind: SchedulingKind; id: string; media_url?: string | null; repeat: RepeatInput;
}): Promise<{ series: SchedulingSeries; occurrences: number; first: SchedulingWhen }> {
  return call('scheduling/stories/series', { body: input });
}

/** "Este e os próximos": a regra nova vale a partir desta data. */
export async function updateStorySeries(seriesId: string, input: StoryFields & { from_slot: string; repeat: RepeatInput }) {
  return call<{ series: SchedulingSeries; occurrences: number }>(`scheduling/stories/series/${seriesId}/update`, { body: input });
}

/** Cancela a repetição a partir desta data (sem from_slot: todas as pendentes). As publicadas ficam. */
export async function cancelStorySeries(seriesId: string, input: { client_id: string; from_slot?: string | null }) {
  return call<{ cancelled: number; restored: boolean }>(`scheduling/stories/series/${seriesId}/cancel`, { body: input });
}

/** "Só este": data, hora, modo e botão desta data. */
export async function updateStoryOccurrence(postId: string, input: StoryFields) {
  return call<{ when: SchedulingWhen }>(`scheduling/stories/occurrence/${postId}`, { body: input });
}

export async function cancelStoryOccurrence(postId: string, clientId: string) {
  return call(`scheduling/stories/occurrence/${postId}/cancel`, { body: { client_id: clientId } });
}

export interface StoryReminder {
  id: string;
  state: 'pendente' | 'avisado' | 'postado' | 'cancelado';
  client: { id: string; company_name: string; logo_url: string | null; color: string | null } | null;
  title: string;
  media_url: string | null;
  media_kind: 'video' | 'image';
  thumb_url: string | null;
  story_link: string | null;
  button_text: string;
  guidance: string;
  scheduled_at: string | null;
  when: { date: string; time: string } | null;
  reminder_sent_at: string | null;
  reminder_followup_at: string | null;
  published_at: string | null;
  posted_by_name: string | null;
  last_error: string | null;
}

export async function fetchStoryReminder(postId: string): Promise<StoryReminder> {
  const data = await call<{ reminder: StoryReminder }>(`story-reminders/${postId}`, { method: 'GET' });
  return data.reminder;
}

export async function markStoryPosted(postId: string): Promise<{ already: boolean }> {
  return call(`story-reminders/${postId}/posted`, { body: {} });
}

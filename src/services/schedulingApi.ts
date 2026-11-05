/**
 * Módulo Agendamentos (vps-api-server/scheduling.mjs). As rotas conferem login, a lista de
 * acesso do módulo e a cidade ativa (cabeçalho x-pulse-city do invokeVpsFunction).
 */
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';
import type {
  PublishFormat, PublishTarget, SchedulingClient, SchedulingKind, SchedulingMaterials, SchedulingWhen,
} from '@/lib/postingSchedule';

export class SchedulingApiError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, options?: { body?: unknown; method?: string }): Promise<T> {
  const { data, error } = await invokeVpsFunction(path, options);
  if (error) throw new SchedulingApiError(error.message, error.status, error.details?.code);
  return data as T;
}

export async function fetchModuleAccess(): Promise<string[]> {
  const data = await call<{ modules: string[] }>('me/module-access', { method: 'GET' });
  return data?.modules ?? [];
}

export async function fetchSchedulingClients(): Promise<SchedulingClient[]> {
  const data = await call<{ clients: SchedulingClient[] }>('scheduling/clients', { method: 'GET' });
  return data?.clients ?? [];
}

export async function fetchSchedulingMaterials(clientId: string, from: string, to: string): Promise<SchedulingMaterials> {
  return call<SchedulingMaterials>(`scheduling/clients/${clientId}/materials`, { method: 'GET', body: { from, to } });
}

export interface ScheduleInput {
  client_id: string;
  kind: SchedulingKind;
  id: string;
  date: string;
  time: string;
  mode: 'auto' | 'manual';
  platform: PublishTarget;
  /** postagem automática: as redes marcadas e a legenda de cada uma */
  platforms?: string[];
  captions?: Record<string, string>;
  /** primeiro comentário e Collab no Instagram (Upload-Post) */
  first_comment?: string;
  collaborators?: string;
  publish_type?: PublishFormat;
  caption?: string;
  story_link?: string | null;
  story_link_text?: string | null;
  /** story de arte postado sozinho: a arte vira vídeo de 15 s com esta música */
  story_audio_url?: string | null;
  story_audio_name?: string | null;
  /** Story: 'auto' = postar sozinho; 'lembrete' = avisa a equipe, que posta pelo app com o link */
  story_mode?: 'auto' | 'lembrete';
  media_url?: string | null;
  media_items?: string[];
  /** Sequência de story: cada imagem de media_items vira um story, na ordem, 1 por minuto (só "Postar sozinho") */
  story_sequence?: boolean;
  allow_past?: boolean;
}

export async function scheduleMaterial(input: ScheduleInput): Promise<{ when: SchedulingWhen; mode: 'auto' | 'manual' }> {
  return call('scheduling/schedule', { body: input });
}

/** Post avulso (arquivo enviado na hora): vira um material aprovado do cliente, pronto para agendar. */
export async function createAvulsoPost(input: {
  client_id: string; tipo: 'reels' | 'story' | 'feed' | 'carrossel'; title?: string; caption?: string; media_urls: string[];
}): Promise<{ kind: SchedulingKind; id: string }> {
  return call('scheduling/avulso', { body: input });
}

export async function rescheduleMaterial(input: {
  client_id: string; kind: SchedulingKind; id: string; date: string; time?: string; allow_past?: boolean;
}): Promise<{ when: SchedulingWhen; mode: 'auto' | 'manual' }> {
  return call('scheduling/reschedule', { body: input });
}

export async function cancelSchedule(input: { client_id: string; kind: SchedulingKind; id: string }): Promise<void> {
  await call('scheduling/cancel', { body: input });
}

/** Postagem manual feita: carimba o material como postado (card arquivado, entrega postada, portal publicado). */
export async function markMaterialPosted(input: { client_id: string; kind: SchedulingKind; id: string }): Promise<{ already: boolean }> {
  return call('scheduling/posted', { body: input });
}

/** Guarda a legenda do material (vale também no modo manual e para o post automático pendente). */
export async function saveCaption(input: { client_id: string; kind: SchedulingKind; id: string; caption: string; generated?: boolean }): Promise<void> {
  await call('scheduling/caption', { body: input });
}

export type CaptionSource = 'roteiro' | 'video' | 'arte' | 'titulo';

/** Legenda escrita pela IA a partir do roteiro, do próprio vídeo (quadros e fala) ou da arte. */
export async function generateCaption(input: { client_id: string; kind: SchedulingKind; id: string; network?: string }): Promise<{ caption: string; fonte: CaptionSource }> {
  return call('scheduling/caption/generate', { body: input });
}

/** Melhor dia e horário do perfil (vps-api-server/lib/bestTimes.mjs): só vem quando a rede tem dado de verdade. */
export interface BestTimeSlot { weekday: number; hour: number; score: number; reason: string }
export async function fetchBestTimes(clientId: string): Promise<{ slots: BestTimeSlot[]; sources: string[] }> {
  return call<{ slots: BestTimeSlot[]; sources: string[] }>('scheduling/best-times', { method: 'GET', body: { client_id: clientId } });
}

/** Feriados e aniversário das cidades das unidades do cliente (vps-api-server/lib/calendarEvents.mjs). */
export interface CalendarHoliday { date: string; name: string; kind: 'feriado' | 'facultativo' }
export interface CityAnniversary { date: string; city: string; years: number | null; units: string[]; art: { id: string | null; column: string | null } | null }
export interface CalendarEvents { holidays: CalendarHoliday[]; anniversaries: CityAnniversary[] }
export async function fetchCalendarEvents(clientId: string, from: string, to: string): Promise<CalendarEvents> {
  return call<CalendarEvents>('scheduling/calendar-events', { method: 'GET', body: { client_id: clientId, from, to } });
}

/** Visão geral do Estúdio (todos os clientes da cidade): próximos posts, números e o que precisa de alguém. */
export interface StudioOverviewPost {
  id: string; client_id: string; client: string; logo_url: string | null; type: string; platform: string;
  reminder?: boolean; at?: string; when: SchedulingWhen | null; thumb_url?: string | null; caption?: string; error?: string;
}
export interface StudioOverview {
  stats: { today: number; week: number; published_month: number; errors: number };
  next: StudioOverviewPost[];
  errors: StudioOverviewPost[];
  reauth: { client_id: string; client: string; logo_url: string | null; platform: string }[];
}
export async function fetchStudioOverview(): Promise<StudioOverview> {
  return call<StudioOverview>('scheduling/overview', { method: 'GET' });
}

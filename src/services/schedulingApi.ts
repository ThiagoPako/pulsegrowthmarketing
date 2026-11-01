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
  publish_type?: PublishFormat;
  caption?: string;
  story_link?: string | null;
  story_link_text?: string | null;
  /** Story: 'auto' = postar sozinho; 'lembrete' = avisa a equipe, que posta pelo app com o link */
  story_mode?: 'auto' | 'lembrete';
  media_url?: string | null;
  media_items?: string[];
  allow_past?: boolean;
}

export async function scheduleMaterial(input: ScheduleInput): Promise<{ when: SchedulingWhen; mode: 'auto' | 'manual' }> {
  return call('scheduling/schedule', { body: input });
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
export async function generateCaption(input: { client_id: string; kind: SchedulingKind; id: string }): Promise<{ caption: string; fonte: CaptionSource }> {
  return call('scheduling/caption/generate', { body: input });
}

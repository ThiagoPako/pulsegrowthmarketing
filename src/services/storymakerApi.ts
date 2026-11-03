// Storymaker de evento (vps-api-server/lib/storymaker.mjs): links para postar story em tempo real, com convidados
// cadastrados e auditoria de quem postou o quê.
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

export interface StorymakerGuest {
  id: string;
  name: string;
  phone: string | null;
  url: string;
  created_at: string;
  revoked_at: string | null;
  posts?: number;
}

export interface StorymakerLink {
  id: string;
  client_id: string;
  client_name?: string;
  client_logo?: string | null;
  client_status?: string | null;
  title: string;
  networks: string[];
  logo_url: string | null;
  expires_at: string;
  closed_at: string | null;
  created_at: string;
  created_by_name?: string | null;
  url: string;
  active: boolean;
  total?: number;
  published?: number;
  failed?: number;
  guests: StorymakerGuest[];
}

export interface StorymakerAudit {
  id: string;
  author: string | null;
  author_kind: 'equipe' | 'convidado';
  media_url: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  status: string | null;
  last_error: string | null;
  published_at: string | null;
  guest_phone: string | null;
}

const fail = (error: { message?: string } | null, fallback: string) => { throw new Error(error?.message || fallback); };

export async function listStorymakers(params: { client_id?: string; q?: string }): Promise<StorymakerLink[]> {
  const body: Record<string, string> = {};
  if (params.client_id) body.client_id = params.client_id;
  if (params.q?.trim()) body.q = params.q.trim();
  const { data, error } = await invokeVpsFunction('storymaker', { method: 'GET', body });
  if (error) fail(error, 'Erro ao carregar os storymakers');
  return data?.links || [];
}

export async function createStorymaker(input: {
  client_id: string; title: string; networks: string[]; hours: number; logo_url?: string | null; guests: { name: string; phone: string }[];
}): Promise<StorymakerLink> {
  const { data, error } = await invokeVpsFunction('storymaker', { body: input });
  if (error) fail(error, 'Não deu para criar o storymaker');
  return data.link;
}

export async function createEventClient(input: { name: string; logo_url?: string | null }): Promise<{ id: string; company_name: string; logo_url: string | null }> {
  const { data, error } = await invokeVpsFunction('storymaker/event-client', { body: input });
  if (error) fail(error, 'Não deu para cadastrar o cliente do evento');
  return data.client;
}

export async function addStorymakerGuest(linkId: string, guest: { name: string; phone: string }): Promise<StorymakerGuest> {
  const { data, error } = await invokeVpsFunction(`storymaker/${linkId}/guests`, { body: guest });
  if (error) fail(error, 'Não deu para cadastrar o convidado');
  return data.guest;
}

export async function revokeStorymakerGuest(guestId: string): Promise<void> {
  const { error } = await invokeVpsFunction(`storymaker/guests/${guestId}/revoke`, { body: {} });
  if (error) fail(error, 'Não deu para tirar o acesso');
}

export async function closeStorymaker(id: string): Promise<void> {
  const { error } = await invokeVpsFunction(`storymaker/${id}/close`, { body: {} });
  if (error) fail(error, 'Não deu para encerrar');
}

export async function storymakerHistory(id: string, q = ''): Promise<StorymakerAudit[]> {
  const { data, error } = await invokeVpsFunction(`storymaker/${id}/history`, { method: 'GET', body: q.trim() ? { q: q.trim() } : undefined });
  if (error) fail(error, 'Erro ao carregar o histórico');
  return data?.posts || [];
}

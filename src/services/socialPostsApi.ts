/**
 * Postagem automática (fila de posts na VPS).
 * Toda comunicação passa pela API da VPS — nenhum serviço externo no frontend.
 */
import { invokeVpsFunction } from '@/services/vpsEdgeFunctions';

export type SocialPlatformTarget = 'instagram' | 'facebook' | 'both';
export type SocialPublishType = 'reels' | 'feed' | 'stories' | 'carousel';
export type ScheduledPostStatus = 'agendado' | 'publicando' | 'publicado' | 'erro' | 'cancelado';

export interface PostMediaItem {
  url: string;
  /** rótulo opcional para organizar o carrossel */
  label?: string;
}

export interface ConnectedSocialAccount {
  id: string;
  platform: 'instagram' | 'facebook';
  account_name: string;
  facebook_page_id: string | null;
  instagram_business_id: string | null;
  token_expiration: string | null;
  status: string;
  has_token: boolean;
  /** 'instagram' = login direto no perfil; 'facebook' = via Página */
  api_base?: 'instagram' | 'facebook';
  expiring_soon?: boolean;
}

export interface ScheduledPost {
  id: string;
  client_id: string;
  client_name?: string | null;
  delivery_id: string | null;
  content_task_id: string | null;
  platform: SocialPlatformTarget;
  publish_type: SocialPublishType;
  media_url: string;
  media_items?: PostMediaItem[] | null;
  story_link?: string | null;
  story_link_text?: string | null;
  caption: string | null;
  scheduled_at: string;
  status: ScheduledPostStatus;
  attempts: number;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
}

export interface CreateScheduledPostInput {
  client_id: string;
  delivery_id?: string | null;
  content_task_id?: string | null;
  platform: SocialPlatformTarget;
  publish_type: SocialPublishType;
  media_url?: string;
  media_items?: PostMediaItem[];
  story_link?: string | null;
  story_link_text?: string | null;
  caption?: string;
  /** ISO datetime */
  scheduled_at: string;
}

export const SCHEDULED_POST_STATUS_LABELS: Record<ScheduledPostStatus, string> = {
  agendado: 'Agendado',
  publicando: 'Publicando…',
  publicado: 'Publicado',
  erro: 'Erro',
  cancelado: 'Cancelado',
};

export async function fetchConnectedAccounts(clientId: string): Promise<ConnectedSocialAccount[]> {
  const { data, error } = await invokeVpsFunction(`social-posts/accounts/${clientId}`, { method: 'GET' });
  if (error) throw new Error(error.message);
  return (data?.accounts ?? []) as ConnectedSocialAccount[];
}

export async function fetchScheduledPosts(params?: { client_id?: string; status?: ScheduledPostStatus }): Promise<ScheduledPost[]> {
  const body: Record<string, string> = {};
  if (params?.client_id) body.client_id = params.client_id;
  if (params?.status) body.status = params.status;
  const { data, error } = await invokeVpsFunction('social-posts', { method: 'GET', body });
  if (error) throw new Error(error.message);
  return (data?.posts ?? []) as ScheduledPost[];
}

export async function createScheduledPost(input: CreateScheduledPostInput): Promise<ScheduledPost> {
  const { data, error } = await invokeVpsFunction('social-posts', { body: input });
  if (error) throw new Error(error.message);
  return data.post as ScheduledPost;
}

export async function cancelScheduledPost(id: string): Promise<void> {
  const { error } = await invokeVpsFunction(`social-posts/${id}/cancel`, { body: {} });
  if (error) throw new Error(error.message);
}

export async function publishScheduledPostNow(id: string): Promise<ScheduledPost> {
  const { data, error } = await invokeVpsFunction(`social-posts/${id}/publish-now`, { body: {} });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.post?.last_error || 'Falha ao publicar');
  return data.post as ScheduledPost;
}

/** Sugere o tipo de publicação a partir do tipo de conteúdo da entrega. */
export function suggestPublishType(contentType: string): SocialPublishType {
  if (contentType === 'story' || contentType === 'stories') return 'stories';
  if (contentType === 'reels') return 'reels';
  return 'feed';
}

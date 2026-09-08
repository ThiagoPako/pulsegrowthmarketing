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
  /** @usuário do perfil (ex: ag.pulse) */
  username?: string | null;
  /** Foto do perfil para exibição */
  profile_picture_url?: string | null;
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

export interface ClientMediaAsset {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  kind: 'image' | 'video';
  source: string;
  tag?: string | null;
  date?: string | null;
}

/** Artes e vídeos já cadastrados no sistema para o cliente. */
export async function fetchClientMediaLibrary(clientId: string): Promise<ClientMediaAsset[]> {
  const { data, error } = await invokeVpsFunction('social-posts/media-library', {
    method: 'GET',
    body: { client_id: clientId },
  });
  if (error) throw new Error(error.message);
  return (data?.items ?? []) as ClientMediaAsset[];
}

/** Sugere o tipo de publicação a partir do tipo de conteúdo da entrega. */
export function suggestPublishType(contentType: string): SocialPublishType {
  if (contentType === 'story' || contentType === 'stories') return 'stories';
  if (contentType === 'reels') return 'reels';
  if (contentType === 'carrossel' || contentType === 'carousel') return 'carousel';
  return 'feed';
}

/* ───────── Métricas do Instagram (relatório mensal) ───────── */

export interface InsightPost {
  id: string;
  caption: string;
  media_type: string;
  thumbnail: string | null;
  permalink: string | null;
  timestamp: string | null;
  likes: number;
  comments: number;
  reach: number | null;
  saved: number | null;
  interactions: number | null;
  shares: number | null;
  views: number | null;
  plays: number | null;
  total_watch_time: number | null;
  avg_watch_time: number | null;
}

export interface FacebookInsights {
  account_name: string | null;
  followers_total: number | null;
  reach: number | null;
  impressions: number | null;
  engaged_users: number | null;
  post_engagements: number | null;
  video_views: number | null;
  reactions: number | null;
  unavailable?: string;
}

export interface ClientInsights {
  account_name: string | null;
  period: { since: string; until: string };
  followers_total: number | null;
  followers_gained: number | null;
  media_total: number | null;
  reach: number | null;
  views: number | null;
  profile_views: number | null;
  website_clicks: number | null;
  accounts_engaged: number | null;
  interactions: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  replies: number | null;
  posts_count: number;
  avg_reach_per_post: number | null;
  reach_series: { date: string; value: number }[];
  follower_series: { date: string; value: number }[];
  posts: InsightPost[];
  instagram?: ClientInsights | null;
  facebook?: FacebookInsights | null;
  cached?: boolean;
  fetched_at?: string;
  stale_error?: string;
}

/** Métricas do período (equipe). Datas em YYYY-MM-DD. */
export async function fetchClientInsights(
  clientId: string,
  since: string,
  until: string,
  refresh = false,
): Promise<ClientInsights> {
  const body: Record<string, string> = { client_id: clientId, since, until };
  if (refresh) body.refresh = '1';
  const { data, error } = await invokeVpsFunction('social-posts/insights', { method: 'GET', body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data.insights as ClientInsights;
}

/** Liga/desliga a aba de desempenho no portal daquele cliente. */
export async function setPortalInsightsEnabled(clientId: string, enabled: boolean): Promise<void> {
  const { data, error } = await invokeVpsFunction('social-posts/portal-insights', {
    body: { client_id: clientId, enabled },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro ao salvar');
}


export interface DiagnosticCheck {
  label: string;
  ok: boolean;
  detail: string | null;
}

/** Testa a conexão do cliente com a Meta e devolve um checklist em português. */
export async function diagnoseClientConnection(
  clientId: string,
  mediaUrl?: string,
): Promise<DiagnosticCheck[]> {
  const { data, error } = await invokeVpsFunction('social-posts/diagnose', {
    body: { client_id: clientId, media_url: mediaUrl || null },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro no diagnóstico');
  return (data?.checks ?? []) as DiagnosticCheck[];
}

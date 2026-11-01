import { vpsAuthedFetch } from '@/lib/vpsDb';

/** Relatório mensal da rede social de cada cliente (Ísis; vps-api-server/socialReportRoutes.mjs). */

export type SocialReportStatus = 'sem_rascunho' | 'rascunho' | 'aprovado';

export interface SocialReportListItem {
  client_id: string;
  client: string;
  niche: string | null;
  city: string | null;
  status: SocialReportStatus;
  updated_at: string | null;
  drafted_by_name: string | null;
  approved_by_name: string | null;
}

export interface SocialReportNumbers {
  month: string;
  label: string;
  period: { since: string; until: string };
  deliveries: {
    videos: { total: number; by_type: { type: string; total: number; titles: string[] }[] };
    arts: { total: number; titles: string[] };
    posts: { total: number };
    recordings: { scheduled: number; done: number; cancelled: number; videos_recorded: number; avg_videos_per_recording: number | null };
  };
  time: { recording_hours: number; editing_hours: number; design_hours: number; total_hours: number; recording_minutes_each: number };
}

type Metrics = Record<'followers_total' | 'followers_gained' | 'reach' | 'views' | 'interactions' | 'profile_views' | 'website_clicks' | 'posts_count', number | null>;

export interface SocialReportNetwork {
  connected: boolean;
  reason?: string | null;
  account?: string | null;
  current?: Metrics;
  previous?: Metrics | null;
  change?: Metrics | null;
  top_posts?: { caption: string; permalink: string | null; type: string | null; reach: number | null; interactions: number | null; date: string | null }[];
}

export interface SocialReport {
  client: { id: string; name: string; niche: string | null; city: string | null };
  numbers: SocialReportNumbers;
  network: SocialReportNetwork;
  draft: { suggestions: string; note: string; status: SocialReportStatus; drafted_by_name?: string | null; approved_by_name?: string | null; approved_at?: string | null };
  message_preview: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Não deu para carregar o relatório. Tente de novo.');
  return body as T;
}

export const fetchSocialReports = (month: string) =>
  call<{ month: string; label: string; clients: SocialReportListItem[] }>(`/social-reports?month=${encodeURIComponent(month)}`);

export const fetchSocialReport = (clientId: string, month: string) =>
  call<{ report: SocialReport }>(`/social-reports/${clientId}?month=${encodeURIComponent(month)}`).then((d) => d.report);

export const saveSocialReportDraft = (clientId: string, month: string, suggestions: string, note: string) =>
  call<{ status: SocialReportStatus }>(`/social-reports/${clientId}`, { method: 'PUT', body: JSON.stringify({ month, suggestions, note }) });

export const approveSocialReport = (clientId: string, month: string, approved: boolean) =>
  call<{ status: SocialReportStatus }>(`/social-reports/${clientId}/approve`, { method: 'POST', body: JSON.stringify({ month, approved }) });

/** Mês que fechou (AAAA-MM), no calendário do navegador. */
export function lastClosedMonth(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const STATUS_LABEL: Record<SocialReportStatus, string> = {
  sem_rascunho: 'Sem rascunho',
  rascunho: 'Rascunho da Ísis',
  aprovado: 'Aprovado',
};

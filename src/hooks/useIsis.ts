import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { vpsAuthedFetch } from '@/lib/vpsDb';

/** Módulo Ísis (04/11/2026): conversa com a social media da agência. Servidor: vps-api-server/isisModuleRoutes.mjs. */
export interface IsisAttachment { url: string; name: string; type: string }
export interface IsisMessage {
  id: string;
  author: 'user' | 'isis';
  body: string;
  attachments: IsisAttachment[];
  transcript: string | null;
  status: 'nova' | 'lida' | 'fazendo' | 'feita' | null;
  reply_to: string | null;
  created_at: string;
}
export interface IsisSuggestion { id: string; title: string; body: string | null; action: string | null; link: string | null; tone: string | null }

export async function isisFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await vpsAuthedFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'A Ísis não respondeu agora. Tente de novo.');
  return body as T;
}

/** Quem tem o módulo (admin ou liberado na Equipe) e quantas respostas ainda não viu. */
export function useIsisAccess() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['isis-access', user?.id ?? null],
    enabled: !!user,
    queryFn: () => isisFetch<{ access: boolean; unread: number }>('/isis/nao-lidas'),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
  return { access: !!query.data?.access, unread: query.data?.unread ?? 0 };
}

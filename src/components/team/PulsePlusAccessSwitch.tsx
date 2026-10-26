import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { vpsAuthedFetch } from '@/lib/vpsDb';

/**
 * Interruptor "Acesso Pulse Plus" na ficha de cada membro (tela Equipe). Só é montado para quem é admin
 * e tem Pulse Plus; o servidor confere de novo (POST/DELETE /api/team/:userId/pulse-plus, 403 para o resto)
 * e não deixa tirar a última pessoa com acesso.
 */
const QUERY_KEY = ['team-pulse-plus'];

/** Ids de quem tem Pulse Plus (GET /api/team/pulse-plus). `enabled` só para admin com Pulse Plus. */
export function useTeamPulsePlus(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEY,
    enabled,
    queryFn: async (): Promise<Set<string>> => {
      const response = await vpsAuthedFetch('/team/pulse-plus');
      if (!response.ok) throw new Error('Não foi possível carregar quem tem acesso');
      const body = await response.json().catch(() => ({}));
      return new Set<string>((Array.isArray(body?.members) ? body.members : []).map((m: { user_id: string }) => String(m.user_id)));
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export default function PulsePlusAccessSwitch({ userId, name, members }: { userId: string; name: string; members: Set<string> }) {
  const queryClient = useQueryClient();
  const hasAccess = members.has(userId);
  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const response = await vpsAuthedFetch(`/team/${userId}/pulse-plus`, { method: next ? 'POST' : 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Não foi possível salvar');
      return next;
    },
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['module-access'] });
      toast.success(next ? `${name} agora tem acesso Pulse Plus` : `${name} não tem mais acesso Pulse Plus`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  return (
    <label
      className="h-7 px-2 rounded-md bg-secondary/50 text-[10px] flex items-center gap-1.5 border border-transparent hover:border-primary/30 transition-all cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      <Switch
        checked={hasAccess}
        disabled={mutation.isPending}
        onCheckedChange={(next) => mutation.mutate(next)}
        aria-label={`Acesso Pulse Plus de ${name}`}
        className="scale-75 -mx-1"
      />
      <span className="whitespace-nowrap">Acesso Pulse Plus</span>
    </label>
  );
}

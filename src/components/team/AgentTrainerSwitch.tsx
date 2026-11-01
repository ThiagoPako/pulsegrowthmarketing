import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { fetchAgentTrainers, setAgentTrainer } from '@/lib/agentTraining';

/**
 * Interruptor "Treina os agentes" na ficha de cada membro (tela Equipe), ao lado do Pulse Plus. Só é montado para
 * admin com Pulse Plus; o servidor confere de novo (POST/DELETE /api/team/:userId/agent-trainer).
 */
const QUERY_KEY = ['team-agent-trainers'];

export function useAgentTrainers(enabled: boolean) {
  return useQuery({ queryKey: QUERY_KEY, enabled, queryFn: fetchAgentTrainers, staleTime: 30_000, retry: 1 });
}

export default function AgentTrainerSwitch({ userId, name, members }: { userId: string; name: string; members: Set<string> }) {
  const queryClient = useQueryClient();
  const enabled = members.has(userId);
  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      await setAgentTrainer(userId, next);
      return next;
    },
    onSuccess: (next) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['module-access'] });
      toast.success(next ? `${name} agora pode treinar os agentes` : `${name} não treina mais os agentes`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  return (
    <label
      className="h-7 px-2 rounded-md bg-secondary/50 text-[10px] flex items-center gap-1.5 border border-transparent hover:border-primary/30 transition-all cursor-pointer"
      onClick={(e) => e.stopPropagation()}
    >
      <Switch
        checked={enabled}
        disabled={mutation.isPending}
        onCheckedChange={(next) => mutation.mutate(next)}
        aria-label={`Treina os agentes: ${name}`}
        className="scale-75 -mx-1"
      />
      <span className="whitespace-nowrap">Treina os agentes</span>
    </label>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GraduationCap, Loader2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AgentTrainingDialog } from '@/components/agents/AgentTrainingDialog';
import { AGENT_ROLE_LABELS } from '@/lib/agentRoles';
import { fetchTrainableAgents, type TrainableAgent } from '@/lib/agentTraining';

/**
 * Treinar agentes (pedido do usuário, 01/11/2026): quem tem a função "Treina os agentes" (tela Equipe) ou Pulse Plus
 * clica num agente e ensina como é feito, com texto e anexos. Mesma conversa que abre no módulo Agentes.
 */
export default function AgentTraining() {
  const [selected, setSelected] = useState<TrainableAgent | null>(null);
  const query = useQuery({ queryKey: ['agent-training-agents'], queryFn: fetchTrainableAgents, refetchInterval: 30_000 });
  const agents = query.data ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <GraduationCap className="text-primary" />
          <h1 className="text-2xl font-display font-bold">Treinar agentes</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Clique num agente e ensine como a agência faz: escreva, mande prints, PDFs e vídeos de exemplo. Ele recebe na hora e guarda como regra.
        </p>
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : query.isError ? (
        <div className="glass-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <AlertTriangle size={16} /> {(query.error as Error).message}
        </div>
      ) : agents.length === 0 ? (
        <div className="glass-card p-6 text-sm text-muted-foreground">Nenhum agente com chave ativa.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const name = agent.name?.trim() || 'Agente';
            return (
              <button
                key={agent.user_id}
                type="button"
                onClick={() => setSelected(agent)}
                className="glass-card flex items-center gap-3 p-4 text-left transition hover:border-primary/40"
              >
                {agent.avatar_url ? (
                  <img src={agent.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-base font-semibold">
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{name}</span>
                    {agent.unread > 0 && <Badge variant="secondary" className="shrink-0">{agent.unread} não lido(s)</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {agent.roles.split(',').map((role) => (
                      <span key={role} className="text-[11px] text-muted-foreground">{AGENT_ROLE_LABELS[role] || role}</span>
                    ))}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {agent.lessons} ensinamento(s){agent.last_at ? ` · último ${formatDistanceToNow(new Date(agent.last_at), { addSuffix: true, locale: ptBR })}` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <AgentTrainingDialog
        agentId={selected?.user_id ?? null}
        agentName={selected?.name || 'Agente'}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
      />
    </div>
  );
}

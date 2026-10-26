import { Pencil } from 'lucide-react';
import { agentWorkState, formatSince, type AgentCardFields } from '@/lib/agentCardStatus';
import { usePulsePlusKnown } from '@/hooks/usePulsePlus';

/**
 * Selo em destaque enquanto um agente de IA está com o card (do `pulse pegar` até o `entregar` ou
 * `liberar`): na Edição "Editando · Beatriz · cortando" (ícone de lápis), na Alteração "🔧 Em correção · Davi · …"
 * (pedido do usuário, 25/10/2026). Sem sinal há 30 min ou mais (o limite do `pulse travados`), vira
 * "⏸ … parada · sem sinal há X" — é o card que a Marcely precisa destravar.
 * Os dados vêm do próprio card: o servidor grava `agent_step`/`agent_heartbeat_at` no pegar e a cada
 * `pulse etapa`, e limpa no liberar; no entregar o card vai para a Análise e o selo some.
 */
interface Props {
  task: AgentCardFields;
  users: { id: string; name?: string | null }[];
  /** Ids dos agentes (useAgentIds): evita o selo num card que passou para um humano. */
  agentIds?: ReadonlySet<string>;
}

export default function AgentWorkBadge({ task, users, agentIds }: Props) {
  const pulsePlus = usePulsePlusKnown();
  const work = agentWorkState(task, { agentIds });
  // agente com o card: só quem tem Pulse Plus vê (para o resto o card mostra o responsável, como qualquer card)
  if (!pulsePlus || !work) return null;
  const name = (users.find((u) => u.id === task.assigned_to)?.name || 'Agente').trim().split(/\s+/)[0];
  const isFix = work.column === 'alteracao';

  if (work.state === 'stale') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-500" title={`Etapa: ${work.step}`}>
        <span className="text-[9px] font-bold text-white uppercase tracking-widest shrink-0">
          ⏸ {isFix ? 'Correção' : 'Edição'} parada · {name}
        </span>
        <span className="text-[9px] text-white/80 truncate">
          {work.minutes === null ? 'sem sinal' : `sem sinal há ${formatSince(work.minutes)}`}
        </span>
      </div>
    );
  }
  if (isFix) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 animate-pulse">
        <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">🔧 Em correção · {name}</span>
        <span className="text-[9px] text-white/90 truncate">{work.step}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
      </span>
      <Pencil size={10} className="text-white shrink-0" aria-hidden />
      <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">Editando · {name}</span>
      <span className="text-[9px] text-white/90 truncate">{work.step}</span>
    </div>
  );
}

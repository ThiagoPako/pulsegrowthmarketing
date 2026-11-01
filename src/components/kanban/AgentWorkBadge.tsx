import { Pencil } from 'lucide-react';
import { agentProgress, agentWorkState, formatSince, type AgentCardFields } from '@/lib/agentCardStatus';
import { usePulsePlusKnown } from '@/hooks/usePulsePlus';

/**
 * Selo em destaque enquanto um agente de IA está com o card (do `pulse pegar` até o `entregar` ou
 * `liberar`), com a etapa e há quanto tempo veio (o Kanban atualiza a cada 15 s): na Edição "Editando · Beatriz · cortando" (ícone de lápis), na Alteração "🔧 Em correção · Davi · …"
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
  const name = (users.find((u) => u.id === (work.by || task.assigned_to))?.name || 'Agente').trim().split(/\s+/)[0];
  // há quanto tempo veio a última etapa: com o Kanban atualizando a cada 15 s, mostra o que está sendo feito agora
  const when = work.minutes === null ? '' : work.minutes < 1 ? ' · agora' : ` · há ${formatSince(work.minutes)}`;
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
  // barra de carregamento com o tempo estimado (pedido do usuário, 01/11/2026): etapas concluídas + tempo na atual
  const started = task.editing_started_at ? new Date(task.editing_started_at).getTime() : NaN;
  const sinceStart = Number.isFinite(started) ? Math.max(0, Math.round((Date.now() - started) / 60000)) : null;
  const prog = agentProgress(work.step, work.minutes, sinceStart);
  const pct = Math.round(prog.pct * 100);
  const barra = (
    <div className="px-3 pb-1.5 pt-1 bg-black/10" title={`${pct}% · faltam cerca de ${formatSince(prog.etaMinutes)} (estimativa pela etapa)`}>
      <div className="flex items-center justify-between text-[9px] font-semibold text-white/90 mb-0.5">
        <span>{pct}%</span>
        <span>≈ {formatSince(prog.etaMinutes)} para entregar</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] transition-[width] duration-700 ease-out relative overflow-hidden" style={{ width: `${pct}%` }}>
          <div className="absolute inset-0 animate-agent-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>
      </div>
    </div>
  );
  if (isFix) {
    return (
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_100%] animate-agent-flow">
        <div className="flex items-center gap-1.5 px-3 py-1">
          <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">🔧 Em correção · {name}</span>
          <span className="text-[9px] text-white/90 truncate" title={work.step}>{work.step}{when}</span>
        </div>
        {barra}
      </div>
    );
  }
  return (
    <div className="bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500 bg-[length:200%_100%] animate-agent-flow">
    <div className="flex items-center gap-1.5 px-3 py-1">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
      </span>
      <Pencil size={10} className="text-white shrink-0" aria-hidden />
      <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">Editando · {name}</span>
      <span className="text-[9px] text-white/90 truncate" title={work.step}>{work.step}{when}</span>
    </div>
    {barra}
    </div>
  );
}

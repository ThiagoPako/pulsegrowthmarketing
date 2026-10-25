/**
 * Selo em destaque no card de Alteração enquanto um agente de IA está corrigindo o vídeo
 * (do `pulse pegar` até o `entregar` ou `liberar`). Pedido do usuário, 25/10/2026.
 * Os dados vêm do próprio card: o servidor grava `agent_step`/`agent_heartbeat_at` no pegar e a cada
 * `pulse etapa`, e limpa no liberar; no entregar o card sai de Alteração (vai para Análise), e o selo some.
 */
interface Props {
  task: {
    kanban_column?: string | null;
    assigned_to?: string | null;
    agent_step?: string | null;
    agent_heartbeat_at?: string | null;
  };
  users: { id: string; name?: string | null }[];
}

const ACTIVE_MS = 30 * 60 * 1000;

function since(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

export default function AgentFixBadge({ task, users }: Props) {
  if (task.kanban_column !== 'alteracao' || !task.assigned_to || !task.agent_step) return null;
  const name = (users.find((u) => u.id === task.assigned_to)?.name || 'Agente').trim().split(/\s+/)[0];
  const active = !!task.agent_heartbeat_at && Date.now() - new Date(task.agent_heartbeat_at).getTime() < ACTIVE_MS;
  const step = task.agent_step && task.agent_step !== 'iniciado' ? task.agent_step : 'começando';

  if (!active) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-500">
        <span className="text-[9px] font-bold text-white uppercase tracking-widest">⏸ Correção parada · {name}</span>
        {task.agent_heartbeat_at && <span className="text-[9px] text-white/80 truncate">sem sinal há {since(task.agent_heartbeat_at)}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 animate-pulse">
      <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">🔧 Em correção · {name}</span>
      <span className="text-[9px] text-white/90 truncate">{step}</span>
    </div>
  );
}

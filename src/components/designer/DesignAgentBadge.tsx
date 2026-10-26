/**
 * Selo de agente de IA no card de arte (como o AgentFixBadge do vídeo):
 * - "Criando · <agente>" em Executando, "Em correção · <agente>" em Ajustes, enquanto o agente dá sinal
 *   de vida (`pulse arte etapa` grava agent_step/agent_heartbeat_at);
 * - "Parada" quando o agente pegou e sumiu há mais de 30 min (a chefe libera ou atribui);
 * - "Análise IA" na coluna em que o revisor de artes confere a entrega.
 */
import { Bot } from 'lucide-react';

interface Props {
  task: {
    kanban_column?: string | null;
    assigned_to?: string | null;
    designed_by?: string | null;
    agent_step?: string | null;
    agent_heartbeat_at?: string | null;
  };
  agents: { user_id: string; name?: string | null }[];
  className?: string;
}

const ACTIVE_MS = 30 * 60 * 1000;

function since(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

const firstName = (agents: Props['agents'], id?: string | null) =>
  (agents.find((a) => a.user_id === id)?.name || 'Agente').trim().split(/\s+/)[0];

/** O agente está com a arte agora (pegou e deu sinal nos últimos 30 min). */
export function isDesignAgentWorking(task: Props['task']): boolean {
  return !!task.agent_step && !!task.agent_heartbeat_at
    && ['executando', 'ajustes'].includes(String(task.kanban_column))
    && Date.now() - new Date(task.agent_heartbeat_at).getTime() < ACTIVE_MS;
}

export default function DesignAgentBadge({ task, agents, className = '' }: Props) {
  if (task.kanban_column === 'analise_ia') {
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-fuchsia-600 to-violet-600 ${className}`}>
        <Bot size={11} className="text-white shrink-0" />
        <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">Análise IA</span>
        <span className="text-[9px] text-white/85 truncate">feita por {firstName(agents, task.designed_by || task.assigned_to)} · aguardando o revisor</span>
      </div>
    );
  }
  if (!task.agent_step || !task.assigned_to || !['executando', 'ajustes'].includes(String(task.kanban_column))) return null;
  const name = firstName(agents, task.assigned_to);
  const step = task.agent_step !== 'iniciado' ? task.agent_step : 'começando';
  if (!isDesignAgentWorking(task)) {
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1 bg-slate-500 ${className}`}>
        <span className="text-[9px] font-bold text-white uppercase tracking-widest shrink-0">⏸ Parada · {name}</span>
        {task.agent_heartbeat_at && <span className="text-[9px] text-white/80 truncate">sem sinal há {since(task.agent_heartbeat_at)}</span>}
      </div>
    );
  }
  const fixing = task.kanban_column === 'ajustes';
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 animate-pulse ${fixing
      ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500'
      : 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500'} ${className}`}>
      <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">
        {fixing ? '🔧 Em correção' : '🎨 Criando'} · {name}
      </span>
      <span className="text-[9px] text-white/90 truncate">{step}</span>
    </div>
  );
}

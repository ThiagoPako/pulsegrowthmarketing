import { Flame } from 'lucide-react';
import { isUrgent, type AgentCardFields } from '@/lib/agentCardStatus';

/**
 * 🔥 Urgente (pedido do usuário, 31/10/2026): faixa vermelha no topo do card enquanto a urgência estiver ligada
 * (Edição, Análise ou Alteração). Para os agentes é prioridade total: topo da fila e recado na hora
 * (gatilho trg_content_tasks_urgencia_avisa). Todos veem, com ou sem Pulse Plus.
 */
export default function UrgentBadge({ task }: { task: AgentCardFields }) {
  if (!isUrgent(task)) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 animate-pulse">
      <Flame size={11} className="text-white shrink-0" aria-hidden />
      <span className="text-[9px] font-black text-white uppercase tracking-widest">Urgente · prioridade total</span>
    </div>
  );
}

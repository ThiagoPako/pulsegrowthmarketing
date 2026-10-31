import { agentReviewOf, analysisLiveStep, formatSince, type AgentCardFields } from '@/lib/agentCardStatus';
import { usePulsePlusKnown } from '@/hooks/usePulsePlus';

/**
 * Parecer da Análise (`pre_revisao`): mostra se o revisor IA (Uriel) já deu o parecer — "✅ ok" ou
 * "⚠ ajustes" com o que mudar — ou se ainda está aguardando. O parecer é gravado por
 * POST /api/agent/tasks/:id/review e some quando o editor entrega uma versão nova. Fora da Análise
 * o selo não aparece (o parecer seria de uma versão antiga); a liberação fica no histórico.
 */
interface Props {
  task: AgentCardFields;
  users: { id: string; name?: string | null }[];
}

export default function AgentReviewBadge({ task, users }: Props) {
  const pulsePlus = usePulsePlusKnown();
  // parecer do agente: só quem tem Pulse Plus vê
  if (!pulsePlus || task.kanban_column !== 'pre_revisao') return null;
  const review = agentReviewOf(task);
  const live = analysisLiveStep(task);
  if (!review && live) {
    // revisão conferindo agora (etapa ao vivo pelo `pulse etapa`)
    const who = (users.find((u) => u.id === live.by)?.name || 'Revisão').trim().split(/\s+/)[0];
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600" title={live.step}>
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
        </span>
        <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">Análise · {who}</span>
        <span className="text-[9px] text-white/90 truncate">{live.step}{live.minutes < 1 ? ' · agora' : ` · há ${formatSince(live.minutes)}`}</span>
      </div>
    );
  }
  if (!review) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/90">
        <span className="text-[9px] font-bold text-white uppercase tracking-widest">Análise · aguardando parecer</span>
      </div>
    );
  }
  const reviewer = (users.find((u) => u.id === review.by)?.name || '').trim().split(/\s+/)[0];
  const who = reviewer ? ` · ${reviewer}` : '';
  if (review.verdict === 'ok') {
    return (
      <div className="px-3 py-1 bg-emerald-600" title={review.notes || undefined}>
        <span className="text-[9px] font-bold text-white uppercase tracking-widest">✅ Parecer: ok{who}</span>
        {review.notes && <p className="text-[9px] text-white/90 leading-snug line-clamp-2">{review.notes}</p>}
      </div>
    );
  }
  return (
    <div className="px-3 py-1 bg-amber-600" title={review.notes || undefined}>
      <span className="text-[9px] font-bold text-white uppercase tracking-widest">⚠ Parecer: ajustes{who}</span>
      {review.notes && <p className="text-[9px] text-white/95 leading-snug line-clamp-3 whitespace-pre-line">{review.notes}</p>}
    </div>
  );
}

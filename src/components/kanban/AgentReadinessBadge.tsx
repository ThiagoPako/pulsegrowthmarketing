import { agentReadiness, type AgentCardFields } from '@/lib/agentCardStatus';

/**
 * "Pronto para a IA": aparece só no card que está esperando na fila dos agentes (Edição livre ou
 * alteração de vídeo feito por agente). Verde quando nada falta; âmbar quando falta só o
 * recomendado (roteiro, prazo); vermelho quando o agente não consegue pegar (sem brutos, sem
 * cliente, tipo que agente não edita, alteração sem o que mudar). Mesmas regras da fila na API.
 * `detailed` lista cada item (usado no detalhe do card).
 */
interface Props {
  task: AgentCardFields;
  agentIds?: ReadonlySet<string>;
  detailed?: boolean;
}

export default function AgentReadinessBadge({ task, agentIds, detailed }: Props) {
  const readiness = agentReadiness(task, { agentIds });
  if (!readiness.inQueue) return null;

  if (detailed) {
    return (
      <div className={`px-3 py-2.5 rounded-lg border space-y-1 ${
        readiness.blocked ? 'bg-rose-500/10 border-rose-500/25' : readiness.ready ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/10 border-amber-500/25'
      }`}>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">🤖 Fila dos agentes de IA</span>
        <p className="text-xs font-semibold text-foreground">
          {readiness.ready ? 'Pronto: um agente já pode pegar este card.'
            : readiness.blocked ? 'Um agente ainda não consegue pegar este card.'
            : 'O agente consegue pegar, mas falta informação.'}
        </p>
        {readiness.missing.length > 0 && (
          <ul className="text-[11px] text-foreground/80 space-y-0.5">
            {readiness.missing.map((item) => (
              <li key={item.key}>{item.blocking ? '⛔' : '⚠️'} Falta {item.label}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const tone = readiness.blocked
    ? 'bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800'
    : readiness.ready
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
      : 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
  const shown = readiness.blocked ? readiness.missing.filter((m) => m.blocking) : readiness.missing;
  const text = readiness.ready
    ? '🤖 Pronto p/ IA'
    : `🤖 ${readiness.blocked ? 'IA não pega' : 'IA'}: falta ${shown.map((m) => m.key).join(', ')}`;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md border max-w-full truncate ${tone}`}
      title={readiness.missing.map((m) => `${m.blocking ? 'Obrigatório' : 'Recomendado'}: ${m.label}`).join('\n') || 'Tudo pronto para um agente pegar'}
    >
      {text}
    </span>
  );
}

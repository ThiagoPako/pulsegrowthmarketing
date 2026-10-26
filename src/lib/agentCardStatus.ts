/**
 * Situação de um card de vídeo em relação aos agentes de IA (Beatriz, Davi, Uriel, Marcely),
 * calculada só com os campos do próprio card. Usada pelos selos do Kanban de Conteúdo, do Kanban
 * de Edição e da Bancada. As mesmas regras de prontidão estão na API (agentReadiness em
 * vps-api-server/agentRoutes.mjs), que devolve a lista na fila do agente: mude as duas juntas.
 */

/** Sem sinal há este tempo, o agente é considerado parado (mesmo limite do `pulse travados` e do /assign). */
export const AGENT_SIGNAL_STALE_MINUTES = 30;

/** Tipos que os agentes editores editam (os mesmos que a chefe pode corrigir pelo `pulse tipo`). */
export const AGENT_EDITABLE_TYPES = ['reels', 'story', 'criativo'] as const;

/** Tipos em que o roteiro é esperado (story costuma ser gravado sem roteiro). */
const SCRIPT_EXPECTED_TYPES = ['reels', 'criativo'];

export interface AgentCardFields {
  kanban_column?: string | null;
  content_type?: string | null;
  client_id?: string | null;
  assigned_to?: string | null;
  edited_by?: string | null;
  drive_link?: string | null;
  script_id?: string | null;
  editing_deadline?: string | null;
  alteration_deadline?: string | null;
  immediate_alteration?: boolean | null;
  adjustment_notes?: string | null;
  agent_step?: string | null;
  agent_heartbeat_at?: string | null;
  agent_review_verdict?: string | null;
  agent_review_notes?: string | null;
  agent_review_at?: string | null;
  agent_review_by?: string | null;
}

const isAgent = (agentIds: ReadonlySet<string> | undefined, id: string | null | undefined) =>
  !!id && !!agentIds && agentIds.has(id);

/** "12 min", "3 h", "2 d". */
export function formatSince(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} d`;
}

export interface AgentWork {
  /** working: sinal recente; stale: sem sinal há AGENT_SIGNAL_STALE_MINUTES ou mais (ou nunca deu sinal). */
  state: 'working' | 'stale';
  column: 'edicao' | 'alteracao';
  step: string;
  /** Minutos desde o último sinal (null quando o card não tem sinal registrado). */
  minutes: number | null;
}

/**
 * Agente com o card em mãos: do `pulse pegar` (o servidor grava agent_step) até o `entregar`
 * (o card sai para a Análise) ou o `liberar` (agent_step volta a nulo). Com `agentIds`, só conta
 * quando o dono do card é mesmo um agente (o agent_step pode sobrar num card passado a um humano).
 */
export function agentWorkState(
  task: AgentCardFields,
  options: { agentIds?: ReadonlySet<string>; now?: number } = {}
): AgentWork | null {
  const column = task.kanban_column;
  if (column !== 'edicao' && column !== 'alteracao') return null;
  if (!task.assigned_to || !task.agent_step) return null;
  if (options.agentIds && options.agentIds.size > 0 && !options.agentIds.has(task.assigned_to)) return null;
  const now = options.now ?? Date.now();
  const at = task.agent_heartbeat_at ? new Date(task.agent_heartbeat_at).getTime() : NaN;
  const minutes = Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 60000)) : null;
  const step = task.agent_step === 'iniciado' ? 'começando' : task.agent_step;
  const state = minutes !== null && minutes < AGENT_SIGNAL_STALE_MINUTES ? 'working' : 'stale';
  return { state, column, step, minutes };
}

export type ReadinessKey = 'brutos' | 'cliente' | 'tipo' | 'roteiro' | 'prazo' | 'ajustes';

export interface ReadinessItem {
  key: ReadinessKey;
  label: string;
  /** true: o agente não consegue (ou não deve) pegar o card assim; false: recomendado. */
  blocking: boolean;
}

export interface AgentReadiness {
  /** O card está esperando na fila dos agentes (Edição livre ou alteração de vídeo feito por agente). */
  inQueue: boolean;
  /** Nada faltando. */
  ready: boolean;
  /** Falta algo que impede o agente de pegar (o `pulse pegar` recusa ou ele não sabe o que fazer). */
  blocked: boolean;
  missing: ReadinessItem[];
}

/**
 * Prontidão do card para um agente pegar, alinhada com a fila (GET /api/agent/queue) e com o
 * `pulse pegar`: link dos brutos e cliente cadastrado são obrigatórios; tipo editável por agente;
 * na alteração, o texto do ajuste. Roteiro (reels/criativo) e prazo são recomendados.
 */
export function agentReadiness(
  task: AgentCardFields,
  options: { agentIds?: ReadonlySet<string> } = {}
): AgentReadiness {
  const { agentIds } = options;
  const column = task.kanban_column;
  const type = task.content_type || '';
  const missing: ReadinessItem[] = [];

  if (!task.drive_link?.trim()) missing.push({ key: 'brutos', label: 'link dos brutos (Drive)', blocking: true });
  if (!task.client_id) missing.push({ key: 'cliente', label: 'cliente cadastrado', blocking: true });
  if (!(AGENT_EDITABLE_TYPES as readonly string[]).includes(type)) {
    missing.push({ key: 'tipo', label: type ? `tipo (${type} não é editado por agente)` : 'tipo do conteúdo', blocking: true });
  }
  if (column === 'alteracao' && !task.adjustment_notes?.trim()) {
    missing.push({ key: 'ajustes', label: 'o que mudar (ajustes)', blocking: true });
  }
  if (SCRIPT_EXPECTED_TYPES.includes(type) && !task.script_id) {
    missing.push({ key: 'roteiro', label: 'roteiro', blocking: false });
  }
  const hasDeadline = column === 'alteracao'
    ? !!task.alteration_deadline || !!task.immediate_alteration
    : !!task.editing_deadline;
  if (!hasDeadline) missing.push({ key: 'prazo', label: 'prazo', blocking: false });

  const takenByAgent = !!task.agent_step && !!task.assigned_to;
  const freeOrAgent = !task.assigned_to || isAgent(agentIds, task.assigned_to);
  const inQueue = type !== 'otimizacao' && !takenByAgent && freeOrAgent && (
    column === 'edicao' || (column === 'alteracao' && isAgent(agentIds, task.edited_by))
  );

  return {
    inQueue,
    ready: missing.length === 0,
    blocked: missing.some((item) => item.blocking),
    missing,
  };
}

export type CardOwnerKind = 'ia' | 'equipe' | 'livre';

/**
 * Quem está com o card: o responsável (assigned_to) ou, sem ele, quem editou o vídeo (edited_by —
 * na alteração é quem corrige; na análise/revisão, quem fez o vídeo).
 */
export function cardOwnerKind(task: AgentCardFields, agentIds: ReadonlySet<string>): CardOwnerKind {
  const owner = task.assigned_to || task.edited_by;
  if (!owner) return task.agent_step ? 'ia' : 'livre';
  return agentIds.has(owner) ? 'ia' : 'equipe';
}

export interface AgentReview {
  verdict: 'ok' | 'ajustes';
  notes: string | null;
  at: string | null;
  by: string | null;
}

/** Parecer gravado pelo revisor IA (POST /api/agent/tasks/:id/review). Uma entrega nova apaga o parecer. */
export function agentReviewOf(task: AgentCardFields): AgentReview | null {
  const verdict = (task.agent_review_verdict || '').trim();
  if (verdict !== 'ok' && verdict !== 'ajustes') return null;
  return {
    verdict,
    notes: task.agent_review_notes?.trim() || null,
    at: task.agent_review_at || null,
    by: task.agent_review_by || null,
  };
}

/** Filtro "Responsável" dos Kanbans. */
export type OwnerFilter = 'all' | 'ia' | 'equipe' | 'livre' | 'pronto_ia' | 'ia_parada';

export const OWNER_FILTER_OPTIONS: { value: OwnerFilter; label: string }[] = [
  { value: 'all', label: 'Todos os responsáveis' },
  { value: 'ia', label: '⚙️ Com agente' },
  { value: 'equipe', label: '👤 Com a equipe' },
  { value: 'livre', label: '⏳ Sem responsável' },
  { value: 'pronto_ia', label: '✅ Prontos para a fila' },
  { value: 'ia_parada', label: '⏸ Parados sem sinal' },
];

/**
 * Opções do filtro "Responsável" para quem está vendo. Sem Pulse Plus não há opção que marque card ou
 * pessoa como agente: só todos, com responsável e sem responsável (o agente conta como qualquer membro).
 */
export function ownerFilterOptions(pulsePlus: boolean): { value: OwnerFilter; label: string }[] {
  if (pulsePlus) return OWNER_FILTER_OPTIONS;
  return [
    { value: 'all', label: 'Todos os responsáveis' },
    { value: 'equipe', label: '👤 Com responsável' },
    { value: 'livre', label: '⏳ Sem responsável' },
  ];
}

export function matchesOwnerFilter(
  task: AgentCardFields,
  filter: OwnerFilter,
  agentIds: ReadonlySet<string>,
  now = Date.now()
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'ia':
    case 'equipe':
    case 'livre':
      return cardOwnerKind(task, agentIds) === filter;
    case 'pronto_ia': {
      const readiness = agentReadiness(task, { agentIds });
      return readiness.inQueue && readiness.ready;
    }
    case 'ia_parada':
      return agentWorkState(task, { agentIds, now })?.state === 'stale';
    default:
      return true;
  }
}

/**
 * Sistema de Pontuação Unificado — Pulse Growth Marketing
 * 
 * FONTE ÚNICA DE VERDADE para todos os pesos de pontuação.
 * Qualquer alteração nos pesos deve ser feita SOMENTE aqui.
 * 
 * Módulos que utilizam:
 * - TeamPerformanceWidget (Dashboard)
 * - InternalReports (Desempenho da Equipe)
 * - Dashboard vmScoring
 * - SalaryRaiseAlert (Financeiro)
 * - ProductionAssistant (Foguetinho IA)
 * - VideomakerDashboard (celebração)
 */

// ── Videomaker Scoring ──
export const VM_SCORE = {
  /** Cada reel produzido */
  REEL: 12,
  /** Cada criativo produzido */
  CRIATIVO: 6,
  /** Cada story produzido */
  STORY: 3,
  /** Cada arte produzida */
  ARTE: 4,
  /** Cada extra produzido */
  EXTRA: 10,
  /** Cada gravação concluída (exceto endo) */
  GRAVACAO: 15,
  /** Cada gravação de endomarketing concluída */
  ENDO: 8,
  /** Pontos a cada 10 minutos de espera (waiting for client) */
  WAIT_PER_10MIN: 2,
  /** Cada story editado e subido pelo videomaker */
  STORY_EDITADO: 2,
} as const;

// ── Editor Scoring ──
export const EDITOR_SCORE = {
  /** Tarefa aprovada/finalizada (ciclo completo) */
  APROVADO: 15,
  /** Tarefa em edição (esforço ativo) */
  EM_EDICAO: 5,
  /** Tarefa em revisão (aguardando feedback) */
  REVISAO: 3,
  /** Tarefa em alteração (retrabalho) */
  ALTERACAO: 8,
  /** Bônus por tarefa prioritária */
  PRIORIDADE: 5,
} as const;

// ── Designer Scoring ──
export const DESIGNER_SCORE = {
  /** Tarefa concluída */
  CONCLUIDO: 12,
  /** Tarefa em progresso */
  EM_PROGRESSO: 4,
  /** Por hora trabalhada */
  POR_HORA: 2,
  /** Por versão/revisão */
  POR_VERSAO: 3,
  /** Bônus por prioridade alta/urgente */
  PRIORIDADE: 6,
} as const;

// ── Social Media Scoring ──
export const SM_SCORE = {
  /** Conteúdo publicado */
  PUBLICADO: 10,
  /** Postado em rede social */
  POSTADO: 8,
  /** Agendado */
  AGENDADO: 5,
  /** Gerenciado */
  GERENCIADO: 2,
  /** Roteiro criado */
  ROTEIRO: 6,
} as const;

// ── Parceiro Scoring ──
export const PARCEIRO_SCORE = {
  /** Atendimento concluído */
  CONCLUIDO: 15,
  /** Atendimento pendente */
  PENDENTE: 3,
  /** Por hora de atendimento */
  POR_HORA: 5,
} as const;

/**
 * Calcula pontuação de videomaker a partir de delivery_records
 * NÃO inclui gravações/wait/endo — para total, some manualmente
 */
export function calcVmDeliveryScore(record: {
  reels_produced: number;
  creatives_produced: number;
  stories_produced: number;
  arts_produced: number;
  extras_produced: number;
}): number {
  return (
    record.reels_produced * VM_SCORE.REEL +
    record.creatives_produced * VM_SCORE.CRIATIVO +
    record.stories_produced * VM_SCORE.STORY +
    record.arts_produced * VM_SCORE.ARTE +
    record.extras_produced * VM_SCORE.EXTRA
  );
}

/**
 * Calcula pontos de espera a partir do total de segundos
 */
export function calcWaitPoints(totalWaitSeconds: number): number {
  return Math.floor(totalWaitSeconds / 600) * VM_SCORE.WAIT_PER_10MIN;
}

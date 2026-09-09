import { describe, expect, it } from 'vitest';
import {
  DESIGNER_SCORE,
  dedupeDeliveryRecords,
  getDesignTaskReferenceDate,
  getDesignerScoreBreakdown,
  sumDeliveryProduction,
} from '@/lib/scoringSystem';

describe('entregas e pontuação de designer', () => {
  it('remove entregas duplicadas da mesma gravação mantendo a mais recente', () => {
    const deduped = dedupeDeliveryRecords([
      { id: '1', recording_id: 'rec-1', reels_produced: 2, updated_at: '2026-09-01T10:00:00Z' },
      { id: '2', recording_id: 'rec-1', reels_produced: 3, updated_at: '2026-09-02T10:00:00Z' },
      { id: '3', recording_id: null, reels_produced: 1, updated_at: '2026-09-02T10:00:00Z' },
    ]);

    expect(deduped).toHaveLength(2);
    expect(sumDeliveryProduction(deduped).reels).toBe(4);
  });

  it('usa as colunas reais do kanban de design para pontuar', () => {
    const breakdown = getDesignerScoreBreakdown([
      { kanban_column: 'aprovado', version: 2, priority: 'alta', time_spent_seconds: 3600 },
      { kanban_column: 'executando', version: 1, priority: 'media', time_spent_seconds: 0 },
      { kanban_column: 'nova_tarefa', version: 1, priority: 'baixa' },
    ]);

    expect(breakdown.completed).toBe(1);
    expect(breakdown.inProgress).toBe(1);
    expect(breakdown.hours).toBe(1);
    expect(breakdown.versions).toBe(1);
    expect(breakdown.score).toBe(
      DESIGNER_SCORE.CONCLUIDO +
        DESIGNER_SCORE.EM_PROGRESSO +
        DESIGNER_SCORE.POR_HORA +
        DESIGNER_SCORE.POR_VERSAO +
        DESIGNER_SCORE.PRIORIDADE,
    );
  });

  it('prioriza completed_at como data de referência da tarefa de design', () => {
    expect(
      getDesignTaskReferenceDate({
        completed_at: '2026-09-05T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
        created_at: '2026-08-01T10:00:00Z',
      }),
    ).toBe('2026-09-05T10:00:00Z');
  });
});

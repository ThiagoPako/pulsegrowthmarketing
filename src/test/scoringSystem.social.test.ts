import { describe, expect, it } from 'vitest';
import {
  dedupeSocialDeliveries,
  getSocialDeliveryReferenceDate,
  getSocialMediaScoreBreakdown,
  getSocialTaskReferenceDate,
} from '@/lib/scoringSystem';

describe('social media scoring system', () => {
  it('usa updated_at para tarefas sociais ainda em andamento', () => {
    expect(
      getSocialTaskReferenceDate({
        kanban_column: 'acompanhamento',
        created_at: '2026-02-10T09:00:00Z',
        updated_at: '2026-03-12T10:00:00Z',
      }),
    ).toBe('2026-03-12T10:00:00Z');
  });

  it('usa posted_at como data real para itens agendados e postados', () => {
    expect(
      getSocialDeliveryReferenceDate({
        status: 'agendado',
        delivered_at: '2026-02-28',
        posted_at: '2026-03-05',
      }),
    ).toBe('2026-03-05');

    expect(
      getSocialDeliveryReferenceDate({
        status: 'postado',
        delivered_at: '2026-02-28',
        posted_at: '2026-03-06',
      }),
    ).toBe('2026-03-06');
  });

  it('deduplica entregas sincronizadas pelo mesmo content_task_id', () => {
    const deduped = dedupeSocialDeliveries([
      {
        id: '1',
        status: 'agendado',
        content_task_id: 'task-1',
        created_by: 'user-1',
        delivered_at: '2026-03-10',
        posted_at: '2026-03-12',
        updated_at: '2026-03-10T10:00:00Z',
      },
      {
        id: '2',
        status: 'postado',
        content_task_id: 'task-1',
        created_by: 'user-1',
        delivered_at: '2026-03-10',
        posted_at: '2026-03-12',
        updated_at: '2026-03-12T18:00:00Z',
      },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.status).toBe('postado');
  });

  it('conta apenas status reais e deduplicados para a pontuação social', () => {
    const breakdown = getSocialMediaScoreBreakdown(
      [
        {
          id: 'task-1',
          kanban_column: 'arquivado',
          created_by: 'user-1',
          created_at: '2026-03-01T08:00:00Z',
          updated_at: '2026-03-10T10:00:00Z',
          approved_at: '2026-03-10T10:00:00Z',
        },
        {
          id: 'task-2',
          kanban_column: 'acompanhamento',
          created_by: 'user-1',
          created_at: '2026-02-20T08:00:00Z',
          updated_at: '2026-03-15T10:00:00Z',
        },
        {
          id: 'task-3',
          kanban_column: 'ideias',
          created_by: 'user-1',
          created_at: '2026-03-05T08:00:00Z',
          updated_at: '2026-03-05T08:00:00Z',
        },
      ],
      [
        {
          id: 'delivery-1',
          status: 'postado',
          content_task_id: 'task-1',
          created_by: 'user-1',
          delivered_at: '2026-03-10',
          posted_at: '2026-03-12',
          updated_at: '2026-03-12T18:00:00Z',
        },
        {
          id: 'delivery-2',
          status: 'agendado',
          content_task_id: 'task-2',
          created_by: 'user-1',
          delivered_at: '2026-03-14',
          posted_at: '2026-03-20',
          updated_at: '2026-03-15T18:00:00Z',
        },
        {
          id: 'delivery-3',
          status: 'posted',
          content_task_id: 'task-1',
          created_by: 'user-1',
          delivered_at: '2026-03-10',
          posted_at: '2026-03-12',
          updated_at: '2026-03-12T17:00:00Z',
        },
      ],
      [],
      'user-1',
    );

    expect(breakdown).toMatchObject({
      published: 1,
      posted: 1,
      scheduled: 1,
      managed: 2,
      scriptsCreated: 0,
      score: 27,
    });
  });
});
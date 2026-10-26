import { describe, expect, it } from 'vitest';
import { canDrag, storyBadge, type SchedulingItem } from '@/lib/postingSchedule';
import {
  defaultRepeat, repeatFromRule, repeatPayload, repeatProblem, repeatSummary, storyGuidance, upcomingDates,
} from '@/lib/storySeries';

const item = (over: Partial<SchedulingItem> = {}): SchedulingItem => ({
  key: 'post:1', kind: 'post', id: '1', title: 'Story', content_type: 'stories', type: 'story',
  column: 'agendado', approved_at: null, thumb_url: null, media_url: null, media_kind: 'video',
  media_items: [], caption: '', platform_label: null, state: 'agendado',
  when: { at: '2026-11-03T11:00:00.000Z', date: '2026-11-03', time: '08:00' }, mode: 'auto', locked: false,
  ...over,
});
const post = (over: Partial<NonNullable<SchedulingItem['post']>> = {}) => ({
  id: '1', status: 'agendado', platform: 'instagram' as const, publish_type: 'stories' as const, caption: '',
  media_url: null, media_items: [], story_link: null, story_link_text: null, scheduled_at: null, published_at: null,
  last_error: null, story_mode: 'lembrete' as const, reminder_sent_at: null, ...over,
});

describe('selo do story com link', () => {
  it('Lembrete, Avisado e Postado; story que posta sozinho não tem selo', () => {
    expect(storyBadge(item({ post: post() }))).toBe('lembrete');
    expect(storyBadge(item({ post: post({ reminder_sent_at: '2026-11-03T11:00:10.000Z' }) }))).toBe('avisado');
    expect(storyBadge(item({ state: 'publicado', post: post({ status: 'publicado' }) }))).toBe('postado');
    expect(storyBadge(item({ state: 'cancelado', post: post({ status: 'cancelado' }) }))).toBeNull();
    expect(storyBadge(item({ post: post({ story_mode: 'auto' }) }))).toBeNull();
  });

  it('data prevista da repetição não arrasta; a ocorrência gerada arrasta', () => {
    expect(canDrag(item({ kind: 'serie', virtual: true, locked: true }))).toBe(false);
    expect(canDrag(item())).toBe(true);
  });
});

describe('repetição na tela', () => {
  it('padrão: dia da semana da data escolhida, desligada', () => {
    const draft = defaultRepeat('2026-11-04');
    expect(draft).toMatchObject({ enabled: false, kind: 'weekly', weekdays: [2], end_kind: 'never', end_date: '2026-12-04' });
  });

  it('resumo igual ao do servidor', () => {
    expect(repeatSummary({ ...defaultRepeat('2026-11-02'), kind: 'interval', interval_days: 2 }, '08:00')).toBe('A cada 2 dias às 08:00');
    expect(repeatSummary({ ...defaultRepeat('2026-11-02'), weekdays: [0] }, '08:00')).toBe('Toda segunda às 08:00');
    expect(repeatSummary({ ...defaultRepeat('2026-11-02'), weekdays: [4, 0, 2], end_kind: 'count', max_count: 3 }, '19:00'))
      .toBe('Seg, Qua e Sex às 19:00 · 3 vezes');
  });

  it('próximas datas e o que falta preencher', () => {
    const draft = { ...defaultRepeat('2026-11-02'), enabled: true, weekdays: [0, 3] };
    expect(upcomingDates(draft, '2026-11-02', '08:00', 4, Date.parse('2026-11-01T00:00:00Z')))
      .toEqual(['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12']);
    expect(upcomingDates(draft, '2026-11-02', '08:00', 2, Date.parse('2026-11-03T00:00:00Z'))).toEqual(['2026-11-05', '2026-11-09']);
    expect(repeatProblem({ ...draft, weekdays: [] }, '2026-11-02')).toBe('Escolha pelo menos um dia da semana');
    expect(repeatProblem({ ...draft, end_kind: 'date', end_date: '2026-11-01' }, '2026-11-02')).toBe('O fim precisa ser depois do início');
    expect(repeatProblem(draft, '2026-11-02')).toBeNull();
  });

  it('"este e os próximos" com fim por número de vezes leva só as que faltam', () => {
    const draft = repeatFromRule({
      kind: 'interval', interval_days: 2, weekdays: null, time: '08:00', start_date: '2026-11-02',
      end_kind: 'count', end_date: null, max_count: 6,
    }, 2);
    expect(draft).toMatchObject({ enabled: true, kind: 'interval', interval_days: 2, end_kind: 'count', max_count: 4 });
    expect(repeatPayload(draft)).toEqual({ kind: 'interval', interval_days: 2, weekdays: null, end_kind: 'count', end_date: null, max_count: 4 });
  });

  it('orientação curta do lembrete', () => {
    expect(storyGuidance('Agende sua consulta', 'https://agenciapulse.tech/r/clinica-wa'))
      .toBe('Poste pelo app com o adesivo de link na parte de baixo. Botão: Agende sua consulta. Link: https://agenciapulse.tech/r/clinica-wa');
  });
});

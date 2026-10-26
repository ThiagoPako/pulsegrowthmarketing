import { describe, expect, it } from 'vitest';
import {
  addDaysKey, addMonthsKey, brtParts, brtToIso, canDrag, groupByDate, monthCounts, monthGridKeys,
  moveToDateKeepingTime, suggestFormat, todayKey, weekKeys, withMovedDate, isWeekendKey,
  type SchedulingItem,
} from '@/lib/postingSchedule';

const item = (over: Partial<SchedulingItem> = {}): SchedulingItem => ({
  key: 'conteudo:1', kind: 'conteudo', id: '1', title: 'Vídeo', content_type: 'reels', type: 'reels',
  column: 'acompanhamento', approved_at: null, thumb_url: null, media_url: null, media_kind: 'video',
  media_items: [], caption: '', platform_label: null, state: 'agendado',
  when: { at: '2026-11-03T13:30:00.000Z', date: '2026-11-03', time: '10:30' }, mode: 'auto', locked: false,
  ...over,
});

describe('hora de Brasília', () => {
  it('converte dia e hora de Brasília para UTC', () => {
    expect(brtToIso('2026-11-03', '10:30')).toBe('2026-11-03T13:30:00.000Z');
    expect(brtToIso('2026-01-31', '23:59')).toBe('2026-02-01T02:59:00.000Z');
  });

  it('lê o dia de Brasília (UTC de madrugada ainda é o dia anterior)', () => {
    expect(brtParts('2026-11-04T02:15:00.000Z')).toEqual({ date: '2026-11-03', time: '23:15' });
    expect(todayKey(new Date('2026-11-04T02:15:00.000Z'))).toBe('2026-11-03');
  });

  it('recusa data ou hora inválidas', () => {
    expect(brtToIso('2026-02-31', '10:00')).toBeNull();
    expect(brtToIso('2026-11-03', '24:00')).toBeNull();
    expect(brtToIso('03/11/2026', '10:00')).toBeNull();
  });

  it('usa o horário de verão antigo quando a data é de 2018 (o fuso vem do navegador)', () => {
    // 04/11/2018 começou o horário de verão em Brasília (UTC-2)
    expect(brtToIso('2018-12-01', '10:00')).toBe('2018-12-01T12:00:00.000Z');
  });
});

describe('arrastar muda a data e mantém a hora', () => {
  it('mesmo horário em outro dia', () => {
    expect(moveToDateKeepingTime('2026-11-03T13:30:00.000Z', '2026-11-10')).toBe('2026-11-10T13:30:00.000Z');
  });

  it('noite de Brasília (já outro dia em UTC) continua na mesma hora local', () => {
    // 23:15 de 03/11 em Brasília = 02:15 UTC de 04/11
    expect(moveToDateKeepingTime('2026-11-04T02:15:00.000Z', '2026-11-20')).toBe('2026-11-21T02:15:00.000Z');
    expect(brtParts('2026-11-21T02:15:00.000Z')).toEqual({ date: '2026-11-20', time: '23:15' });
  });

  it('virada de mês e de ano', () => {
    expect(moveToDateKeepingTime('2026-12-31T21:00:00.000Z', '2027-01-02')).toBe('2027-01-02T21:00:00.000Z');
  });

  it('o item arrastado fica no dia novo com a mesma hora', () => {
    const moved = withMovedDate(item(), '2026-11-07');
    expect(moved.when).toEqual({ at: '2026-11-07T13:30:00.000Z', date: '2026-11-07', time: '10:30' });
  });

  it('item sem hora gravada só troca o dia', () => {
    const moved = withMovedDate(item({ when: { at: null, date: '2026-11-03', time: null } }), '2026-11-05');
    expect(moved.when).toEqual({ at: null, date: '2026-11-05', time: null });
  });
});

describe('grade do calendário', () => {
  it('mês em semanas completas de segunda a domingo', () => {
    const days = monthGridKeys('2026-11-01');
    expect(days[0]).toBe('2026-10-26'); // 01/11/2026 é domingo
    expect(days[days.length - 1]).toBe('2026-12-06');
    expect(days.length % 7).toBe(0);
    expect(days).toContain('2026-11-30');
  });

  it('semana de segunda a domingo', () => {
    expect(weekKeys('2026-11-04')).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    ]);
    expect(isWeekendKey('2026-11-07')).toBe(true);
    expect(isWeekendKey('2026-11-06')).toBe(false);
  });

  it('soma dias e meses sem depender do fuso do computador', () => {
    expect(addDaysKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(addMonthsKey('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonthsKey('2026-01-31', -1)).toBe('2025-12-01');
  });
});

describe('regras dos itens', () => {
  it('só arrasta o que está agendado e não foi publicado', () => {
    expect(canDrag(item())).toBe(true);
    expect(canDrag(item({ state: 'manual', mode: 'manual' }))).toBe(true);
    expect(canDrag(item({ state: 'publicado', locked: true }))).toBe(false);
    expect(canDrag(item({ state: 'publicando', locked: true }))).toBe(false);
    expect(canDrag(item({ state: 'erro', locked: true }))).toBe(false);
    expect(canDrag(item({ state: 'cancelado', ghost: true, locked: true }))).toBe(false);
  });

  it('agrupa por dia em ordem de hora', () => {
    const map = groupByDate([
      item({ key: 'a', title: 'B', when: { at: null, date: '2026-11-03', time: '18:00' } }),
      item({ key: 'b', title: 'A', when: { at: null, date: '2026-11-03', time: '09:00' } }),
      item({ key: 'c', when: { at: null, date: '2026-11-04', time: null } }),
    ]);
    expect(map.get('2026-11-03')!.map(i => i.key)).toEqual(['b', 'a']);
    expect(map.get('2026-11-04')!.length).toBe(1);
  });

  it('contadores só do mês visível', () => {
    const counts = monthCounts([
      item(),
      item({ key: 'm', state: 'manual' }),
      item({ key: 'p', state: 'publicado' }),
      item({ key: 'x', state: 'cancelado', ghost: true }),
      item({ key: 'o', when: { at: null, date: '2026-12-01', time: '10:00' } }),
    ], '2026-11-01', 4);
    expect(counts).toEqual({ scheduled: 2, published: 1, failed: 0, unscheduled: 4 });
  });

  it('formato sugerido', () => {
    expect(suggestFormat(item())).toBe('reels');
    expect(suggestFormat(item({ type: 'story' }))).toBe('stories');
    expect(suggestFormat(item({ kind: 'arte', type: 'arte', media_kind: 'image' }))).toBe('feed');
    expect(suggestFormat(item({ kind: 'arte', type: 'carrossel', media_kind: 'image', media_items: ['a', 'b'] }))).toBe('carousel');
  });
});

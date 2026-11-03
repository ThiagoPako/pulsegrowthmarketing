import { describe, expect, it } from 'vitest';
import { brtSlot, engagementGrid, onlineGrid, pickBest, ptToBrtHours } from '../../vps-api-server/lib/bestTimes.mjs';

describe('melhor dia e horário para postar', () => {
  it('converte para dia da semana (0 = segunda) e hora de Brasília', () => {
    expect(brtSlot('2026-11-03T22:00:00Z')).toEqual({ weekday: 1, hour: 19 }); // terça 19h
    expect(brtSlot('2026-11-09T02:30:00Z')).toEqual({ weekday: 6, hour: 23 }); // domingo 23h
  });

  it('Pacífico fica 5 h atrás de Brasília no inverno de lá e 4 h no verão', () => {
    expect(ptToBrtHours('2026-11-15T12:00:00Z')).toBe(5);
    expect(ptToBrtHours('2026-07-15T12:00:00Z')).toBe(4);
  });

  it('sem dado nenhum, não marca nada', () => {
    expect(pickBest(null, null)).toEqual([]);
    expect(engagementGrid([{ timestamp: '2026-11-03T22:00:00Z', like_count: 9 }])).toBeNull();
  });

  it('o horário dos posts que mais engajam vira o melhor horário', () => {
    const posts = [];
    const at = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString();
    for (let i = 0; i < 6; i += 1) posts.push({ timestamp: at('2026-09-01T22:00:00Z', i * 7), like_count: 100, comments_count: 10 }); // terças 19h
    for (let i = 0; i < 6; i += 1) posts.push({ timestamp: at('2026-10-02T12:00:00Z', i * 4), like_count: 5, comments_count: 0 });
    const best = pickBest(null, engagementGrid(posts));
    expect(best[0]).toMatchObject({ weekday: 1, hour: 19 });
    expect(best.length).toBeLessThanOrEqual(3);
    expect(new Set(best.map((b) => b.weekday)).size).toBe(best.length);
  });

  it('seguidores online do Instagram (horário do Pacífico) caem na hora certa de Brasília', () => {
    // 3/11 (terça) no Pacífico: pico às 14h PT = 19h de Brasília
    const value = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), h === 14 ? 500 : 50]));
    const grid = onlineGrid([{ value, end_time: '2026-11-04T08:00:00+0000' }]);
    const best = pickBest(grid, null);
    expect(best[0]).toMatchObject({ weekday: 1, hour: 19 });
  });
});

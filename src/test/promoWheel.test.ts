import { describe, it, expect } from 'vitest';
import { buildWheelSlices, pickWheelIndex } from '@/lib/promoWheel';

const prizes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, label: `Prêmio ${i + 1}` }));

describe('roleta do sorteio', () => {
  it('com poucos prêmios completa até 6 fatias com "Tente novamente"', () => {
    const slices = buildWheelSlices(prizes(2));
    expect(slices.map(s => s.id)).toEqual(['p1', 'p2', 'retry-0', 'retry-1', 'retry-2', 'retry-3']);
    expect(buildWheelSlices([]).every(s => s.id.startsWith('retry'))).toBe(true);
  });

  it('com 6 prêmios ou mais ainda tem fatias "Tente novamente" intercaladas', () => {
    const six = buildWheelSlices(prizes(6)).map(s => s.id);
    expect(six).toEqual(['p1', 'p2', 'retry-0', 'p3', 'p4', 'retry-1', 'p5', 'p6', 'retry-2']);
    const ten = buildWheelSlices(prizes(10));
    expect(ten.filter(s => s.id.startsWith('retry')).length).toBe(4);
    expect(ten.filter(s => !s.id.startsWith('retry')).length).toBe(10);
  });

  it('quem perdeu para numa fatia "Tente novamente", nunca num prêmio', () => {
    const slices = buildWheelSlices(prizes(7));
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(slices[pickWheelIndex(slices, null, () => r)].id.startsWith('retry')).toBe(true);
    }
  });

  it('quem ganhou para no prêmio; prêmio fora da roleta cai numa fatia neutra', () => {
    const slices = buildWheelSlices(prizes(7));
    expect(slices[pickWheelIndex(slices, 'p5')].id).toBe('p5');
    expect(slices[pickWheelIndex(slices, 'nao-esta', () => 0)].id.startsWith('retry')).toBe(true);
  });
});

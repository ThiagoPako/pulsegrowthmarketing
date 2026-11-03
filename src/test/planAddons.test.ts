import { describe, expect, it } from 'vitest';
import { prorate } from '../../vps-api-server/lib/planAddons.mjs';

describe('upgrade de rede: proporcional até o vencimento', () => {
  it('aderiu faltando 10 dias: entram só os 10 dias na próxima mensalidade', () => {
    const p = prorate({ monthly: 300, start: '2026-11-05', dueDay: 15 });
    expect(p.nextDue).toBe('2026-11-15');
    expect(p.refMonth).toBe('2026-11');
    expect(p.days).toBe(10);
    expect(p.cycleDays).toBe(31); // 15/10 → 15/11
    expect(p.amount).toBe(96.77);
  });

  it('depois do vencimento do mês: vai para o vencimento do mês seguinte', () => {
    const p = prorate({ monthly: 300, start: '2026-11-20', dueDay: 10 });
    expect(p.nextDue).toBe('2026-12-10');
    expect(p.days).toBe(20);
    expect(p.cycleDays).toBe(30);
    expect(p.amount).toBe(200);
  });

  it('no dia do vencimento conta o ciclo inteiro; mensalidade paga empurra para a seguinte', () => {
    expect(prorate({ monthly: 300, start: '2026-11-10', dueDay: 10 })).toMatchObject({ nextDue: '2026-12-10', days: 30, amount: 300 });
    expect(prorate({ monthly: 300, start: '2026-11-05', dueDay: 15, skipMonths: 1 })).toMatchObject({ nextDue: '2026-12-15', days: 40 });
  });

  it('dia 31 em mês curto vence no último dia', () => {
    expect(prorate({ monthly: 280, start: '2027-02-20', dueDay: 31 })).toMatchObject({ nextDue: '2027-02-28', days: 8, cycleDays: 28 });
  });
});

import { describe, it, expect } from 'vitest';
import {
  toAmount,
  sumAmounts,
  safePercent,
  safeDivide,
  toDateKey,
  isSameMonth,
  isWithinRange,
  isRevenueReceived,
  isRevenueOverdue,
  isRevenuePending,
  isMirroredCashMovement,
  accountBalance,
  reserveBalance,
  computeClientProfitability,
} from '@/lib/financialCalc';
import { isExpensePaid, isSalaryLikeExpense } from '@/hooks/useFinancialData';

describe('financialCalc — valores', () => {
  it('converte numeric string do Postgres', () => {
    expect(toAmount('1500.50')).toBe(1500.5);
    expect(toAmount('1500,50')).toBe(1500.5);
    expect(toAmount(null)).toBe(0);
    expect(toAmount('abc')).toBe(0);
    expect(toAmount(NaN)).toBe(0);
  });

  it('soma sem ruído de ponto flutuante', () => {
    expect(sumAmounts([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
    expect(sumAmounts([{ amount: '10.10' }, { amount: 20 }])).toBe(30.1);
  });

  it('nunca divide por zero', () => {
    expect(safePercent(10, 0)).toBe(0);
    expect(safeDivide(10, 0)).toBe(0);
    expect(safePercent(50, 200)).toBe(25);
  });
});

describe('financialCalc — datas', () => {
  it('compara mês sem sofrer com fuso horário', () => {
    expect(toDateKey('2026-03-01T00:00:00.000Z')).toBe('2026-03-01');
    expect(isSameMonth('2026-03-01T00:00:00.000Z', '2026-03')).toBe(true);
    expect(isSameMonth('2026-02-28', '2026-03')).toBe(false);
    expect(isWithinRange('2026-03-15', '2026-03-01', '2026-03-31')).toBe(true);
    expect(isWithinRange('2026-04-01', '2026-03-01', '2026-03-31')).toBe(false);
  });
});

describe('financialCalc — status e saldos', () => {
  it('classifica status de receita', () => {
    expect(isRevenueReceived({ status: 'recebida' })).toBe(true);
    expect(isRevenueReceived({ status: 'pago' })).toBe(true);
    expect(isRevenueOverdue({ status: 'em_atraso' })).toBe(true);
    expect(isRevenuePending({ status: 'prevista' })).toBe(true);
    expect(isRevenuePending({ status: 'recebida' })).toBe(false);
  });

  it('reconhece espelhos automáticos de caixa', () => {
    expect(isMirroredCashMovement({ description: '[Receita] Cliente X - ID: abc' })).toBe(true);
    expect(isMirroredCashMovement({ description: '[Despesa] Aluguel - ID: abc' })).toBe(true);
    expect(isMirroredCashMovement({ description: 'Aporte do sócio' })).toBe(false);
  });

  it('separa saldo da conta e da reserva', () => {
    const movs = [
      { type: 'entrada', amount: '1000', is_reserve: false },
      { type: 'saida', amount: 250, is_reserve: false },
      { type: 'entrada', amount: 500, is_reserve: true },
    ];
    expect(accountBalance(movs)).toBe(750);
    expect(reserveBalance(movs)).toBe(500);
  });
});

describe('pagamento de salário não duplica caixa', () => {
  it('salário só conta como pago com o sufixo PAGO', () => {
    expect(isSalaryLikeExpense({ description: 'Salário - João' } as never)).toBe(true);
    expect(isExpensePaid({ description: 'Salário - João' } as never)).toBe(false);
    expect(isExpensePaid({ description: 'Salário - João - PAGO' } as never)).toBe(true);
    // Despesa comum já nasce paga
    expect(isExpensePaid({ description: 'Aluguel' } as never)).toBe(true);
  });
});

describe('rentabilidade por cliente', () => {
  it('usa receita real e cai para o contrato quando não há receita', () => {
    const result = computeClientProfitability(
      [
        { clientId: 'a', clientName: 'A', contractValue: 1000, clientRevenueTotal: 1200, clientVolume: 3 },
        { clientId: 'b', clientName: 'B', contractValue: 1000, clientRevenueTotal: 0, clientVolume: 1 },
      ],
      400,
      4,
    );
    expect(result[0].clientId).toBe('a');
    expect(result[0].faturamento).toBe(1200);
    expect(result[0].custo).toBe(300);
    expect(result[0].lucro).toBe(900);
    expect(result[1].faturamento).toBe(1000);
    expect(result[1].custo).toBe(100);
  });

  it('não quebra sem volume de gravações', () => {
    const result = computeClientProfitability(
      [{ clientId: 'a', clientName: 'A', contractValue: 1000, clientRevenueTotal: 0, clientVolume: 0 }],
      500,
      0,
    );
    expect(result[0].custo).toBe(0);
    expect(result[0].margem).toBe(100);
  });
});

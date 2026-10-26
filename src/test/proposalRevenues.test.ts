import { describe, it, expect } from 'vitest';
import {
  addMonthsToDateString,
  buildProposalRevenueSchedule,
  stripRevenueMark,
} from '../../vps-api-server/lib/proposalRevenues.mjs';

const sum = (items: { amount: number }[]) => Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;

describe('buildProposalRevenueSchedule', () => {
  it('marketing: 12 receitas no valor mensal (plano + bônus) com desconto', () => {
    const items = buildProposalRevenueSchedule({
      proposal_type: 'marketing',
      client_company: 'Loja X',
      plan_snapshot: { price: 2800 },
      bonus_services: [{ value: 200 }],
      custom_discount: 10,
    }, '2026-10-25');
    expect(items).toHaveLength(12);
    expect(items[0].amount).toBe(2700);
    expect(items[11].amount).toBe(2700);
    expect(items[0].description).toBe('Contrato Marketing - Loja X (1/12)');
    expect(items[0].due_date).toBe('2026-10-25');
    expect(items[0].reference_month).toBe('2026-10-01');
    expect(items[11].due_date).toBe('2027-09-25');
  });

  it('endomarketing: 12 x valor mensal', () => {
    const items = buildProposalRevenueSchedule({
      proposal_type: 'endomarketing',
      endomarketing_data: { monthlyValue: 1200 },
    }, '2026-01-31');
    expect(items).toHaveLength(12);
    expect(items.every((i) => i.amount === 1200)).toBe(true);
    // fim de mês: fevereiro fica no último dia
    expect(items[1].due_date).toBe('2026-02-28');
  });

  it('personalizada semestral: 6 x valor mensal com desconto, ignorando as parcelas', () => {
    const items = buildProposalRevenueSchedule({
      proposal_type: 'personalizada',
      custom_discount: 5,
      system_data: { monthlyValue: 2000, installments: 1, contractDuration: 'semestral' },
    }, '2026-03-10');
    expect(items).toHaveLength(6);
    expect(items[0].amount).toBe(1900);
  });

  it('personalizada anual com oferta 6+6: 6 meses promocionais e 6 cheios', () => {
    const items = buildProposalRevenueSchedule({
      proposal_type: 'personalizada',
      custom_discount: 0,
      system_data: { monthlyValue: 3000, contractDuration: 'anual', promo66Enabled: true, promo66Value: 1500 },
    }, '2026-03-10');
    expect(items).toHaveLength(12);
    expect(items.slice(0, 6).every((i) => i.amount === 1500)).toBe(true);
    expect(items.slice(6).every((i) => i.amount === 3000)).toBe(true);
    expect(sum(items)).toBe(27000);
  });

  it('sistema: total dividido pelas parcelas sem perder centavos', () => {
    const items = buildProposalRevenueSchedule({
      proposal_type: 'sistema',
      system_data: { value: 1000, installments: 3 },
    }, '2026-05-01');
    expect(items).toHaveLength(3);
    expect(items[0].amount).toBe(333.33);
    expect(sum(items)).toBe(1000);
  });

  it('vídeos: usa quantidade x valor quando não há total salvo', () => {
    const items = buildProposalRevenueSchedule({
      proposal_type: 'videos',
      system_data: { quantity: 10, unitPrice: 400, installments: 2 },
    }, '2026-05-01');
    expect(items.map((i) => i.amount)).toEqual([2000, 2000]);
  });

  it('sem valor: não gera nada', () => {
    expect(buildProposalRevenueSchedule({ proposal_type: 'marketing', plan_snapshot: {} }, '2026-05-01')).toEqual([]);
  });
});

describe('helpers', () => {
  it('addMonthsToDateString vira o ano', () => {
    expect(addMonthsToDateString('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('stripRevenueMark tira a marca antiga das observações', () => {
    expect(stripRevenueMark('Pagamento todo dia 10\n[RECEITAS GERADAS: 12 parcelas de R$ 250,00]')).toBe('Pagamento todo dia 10');
    expect(stripRevenueMark('[RECEITAS GERADAS: 1 parcelas de R$ 100,00]')).toBe('');
  });
});

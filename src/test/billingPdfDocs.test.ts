import { describe, expect, it } from 'vitest';
import { cobrancaDoc, relatorioDoc, agradecimentoDoc, reciboDoc, planContents, deliveryProgress } from '../../vps-api-server/lib/billingPdfDocs.mjs';
import { valorPorExtenso, applyTemplate, DEFAULT_TEMPLATES } from '../../vps-api-server/lib/billingIsis.mjs';

const client = { name: 'Cliente Teste Ltda', responsible: 'Maria Teste', city: 'uruacu', plan: 'Plano Pro' };
const plan = { reels_qty: 4, creatives_qty: 0, stories_qty: 8, arts_qty: 6, recording_sessions: 3 };
const numbers = {
  period: { since: '2026-10-01', until: '2026-10-31' },
  deliveries: {
    videos: { total: 6, by_type: [{ type: 'Reels', total: 4, titles: ['a', 'b', 'c', 'd'] }, { type: 'Otimizações', total: 2, titles: ['e', 'f'] }] },
    arts: { total: 0, titles: [] },
    posts: { total: 5 },
    recordings: { scheduled: 3, done: 2, cancelled: 1, videos_recorded: 9, avg_videos_per_recording: 4.5 },
  },
  time: { total_hours: 0, recording_hours: 0, editing_hours: 0, design_hours: 0 },
};

describe('PDFs da Ísis: conteúdo', () => {
  it('plano: só o que tem quantidade', () => {
    expect(planContents(plan)).toBe('Previsto no plano: 4 Reels · 8 Stories · 6 artes · 3 gravações');
    expect(planContents({})).toBe('');
  });

  it('entregas × plano: metas do plano, tipos extras e nada vazio', () => {
    const rows = deliveryProgress(numbers, plan);
    expect(rows.map((r: { label: string }) => r.label)).toEqual(['Reels', 'Stories', 'Artes', 'Gravações', 'Otimizações']);
    expect(rows.find((r: { label: string }) => r.label === 'Stories')).toMatchObject({ done: 0, goal: 8 });
  });

  it('cobrança: emitente, cliente, item com o plano e a situação da conta', () => {
    const d = cobrancaDoc({
      month: '2026-11', today: '2026-11-10', dueDate: '2026-11-10', amount: 1500, status: 'vencido', client, plan, issuer: {},
      history: [{ reference_month: '2026-10-01', due_date: '2026-10-10', amount: 1500, status: 'pendente' }],
      payment: { pixPayload: 'x', cardLink: null },
    });
    expect(d.status).toBe('vencido');
    expect(d.parties.map((p: { name: string }) => p.name)).toEqual(['Agência Pulse', 'Cliente Teste Ltda']);
    expect(d.table.rows[0][0].sub).toContain('4 Reels');
    const conta = d.sections.find((s: { type?: string }) => s.type === 'table');
    expect(conta.rows[0][3].text).toBe('Vencida');
    expect(JSON.stringify(d)).not.toContain('link do cartão, a confirmação');
  });

  it('relatório: sem rede social nem horas, esses blocos não aparecem', () => {
    const d = relatorioDoc({ ref: '2026-10', next: '2026-11', client, plan, numbers, network: null, suggestions: '' });
    const titles = d.sections.map((s: { title: string }) => s.title);
    expect(titles).toContain('Entregas × plano contratado');
    expect(titles.some((t: string) => /Rede social|Tempo dedicado|Artes entregues|Sugestões/.test(t))).toBe(false);
  });

  it('agradecimento: aproveitamento e lembrete do vencimento', () => {
    const d = agradecimentoDoc({ ref: '2026-10', client, plan, numbers, attendance: { done: 2, scheduled: 3, cancelled: 1, avg: 4.5 }, tip: 'dica', dueDate: '2026-11-10', amount: 1500 });
    expect(d.cards[0].note).toBe('67% das agendas aproveitadas');
    expect(d.closing.text).toContain('10/11/2026');
  });

  it('recibo: valor por extenso, pago e quitação', () => {
    expect(valorPorExtenso(1500)).toBe('mil e quinhentos reais');
    expect(valorPorExtenso(1234.56)).toBe('mil, duzentos e trinta e quatro reais e cinquenta e seis centavos');
    expect(valorPorExtenso(100)).toBe('cem reais');
    expect(valorPorExtenso(101)).toBe('cento e um reais');
    expect(valorPorExtenso(1)).toBe('um real');
    expect(valorPorExtenso(2000000.01)).toBe('dois milhões de reais e um centavo');
    const d = reciboDoc({ month: '2026-11', paidAt: '2026-11-09', amount: 1500, amountWords: valorPorExtenso(1500), method: 'pix', client, plan, issuer: {} });
    expect(d.kind).toBe('recibo');
    expect(d.status).toBe('pago');
    expect(d.intro).toMatch(/R\$\s1\.500,00 \(mil e quinhentos reais\)/);
    expect(d.meta.find((m: { label: string }) => m.label === 'Forma').value).toBe('Pix');
  });

  it('obrigado: texto com valor, referência e data; sem recibo, a linha some', () => {
    const vars = { nome_cliente: 'Posto Naraely', plano: 'Plano Pro', valor: 'R$ 1.500,00', mes_ref: 'novembro', data_pagamento: '09/11/2026' };
    const com = applyTemplate(DEFAULT_TEMPLATES.obrigado, { ...vars, recibo: 'O recibo segue em anexo, para o seu controle.' });
    expect(com).toContain('Recebemos o pagamento da sua mensalidade de novembro (Plano Pro), no valor de *R$ 1.500,00*, em 09/11/2026.');
    expect(com).toContain('O recibo segue em anexo');
    const sem = applyTemplate(DEFAULT_TEMPLATES.obrigado, { ...vars, recibo: '' });
    expect(sem).not.toContain('recibo');
    expect(sem).not.toContain('{');
  });
});

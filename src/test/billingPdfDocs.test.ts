import { describe, expect, it } from 'vitest';
import { cobrancaDoc, relatorioDoc, agradecimentoDoc, reciboDoc, planContents, deliveredItems, aboveSummary } from '../../vps-api-server/lib/billingPdfDocs.mjs';
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

  it('entregas: só o que foi entregue, com o que passou do plano', () => {
    const rows = deliveredItems(numbers, plan);
    // Stories (0 de 8) e Artes (0) não aparecem: nada de "faltou"
    expect(rows.map((r: { label: string }) => r.label)).toEqual(['Reels', 'Gravações', 'Otimizações']);
    expect(rows.find((r: { label: string }) => r.label === 'Reels')).toMatchObject({ done: 4, extra: 0, met: true });
    expect(rows.find((r: { label: string }) => r.label === 'Gravações')).toMatchObject({ done: 2, extra: 0, met: false });
    const acima = deliveredItems({ ...numbers, deliveries: { ...numbers.deliveries, videos: { total: 7, by_type: [{ type: 'Reels', total: 7, titles: [] }] }, arts: { total: 8, titles: [] } } }, plan);
    expect(aboveSummary(acima)).toBe('Neste mês entregamos +3 Reels e +2 artes além do que o seu plano prevê.');
    expect(aboveSummary(rows)).toBeNull();
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
    expect(d.sections[0].type).toBe('stats');
    expect(titles.some((t: string) => /Rede social|Tempo dedicado|Artes entregues|Ideias/.test(t))).toBe(false);
    // nada negativo no relatório
    expect(JSON.stringify(d)).not.toMatch(/faltou|pendente|Canceladas| de 8/i);
  });

  it('agradecimento: só o que foi feito e o lembrete do vencimento', () => {
    const d = agradecimentoDoc({ ref: '2026-10', client, plan, numbers, attendance: { done: 2, scheduled: 3, cancelled: 1, avg: 4.5 }, tip: '', dueDate: '2026-11-10', amount: 1500 });
    expect(d.cards[0]).toMatchObject({ label: 'Gravações feitas', value: 2 });
    expect(JSON.stringify(d)).not.toMatch(/2 de 3|Canceladas|Aproveitamento|dica/i);
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
    const com = applyTemplate(DEFAULT_TEMPLATES.obrigado, { ...vars, recibo: 'Recibo em anexo.' });
    expect(com).toBe('Olá, Posto Naraely! ✅\n\nRecebemos o pagamento de novembro: *R$ 1.500,00*, em 09/11/2026.\n\nObrigada pela confiança e pela parceria com a Pulse 🧡\n\nRecibo em anexo.');
    const sem = applyTemplate(DEFAULT_TEMPLATES.obrigado, { ...vars, recibo: '' });
    expect(sem).not.toMatch(/recibo/i);
    expect(sem).not.toMatch(/\n{3,}/);
    expect(sem).not.toContain('{');
  });
});

describe('relatório premium', () => {
  const numbers = {
    period: { since: '2026-10-01', until: '2026-10-31' },
    deliveries: { videos: { total: 7, by_type: [{ type: 'Reels', total: 7, titles: [] }] }, arts: { total: 0, titles: [] }, posts: { total: 3 }, recordings: { scheduled: 2, done: 2, cancelled: 0, videos_recorded: 9, avg_videos_per_recording: 4.5 } },
    time: { total_hours: 0, recording_hours: 0, editing_hours: 0, design_hours: 0 },
  };
  const base = { ref: '2026-10', next: '2026-11', client: { name: 'Clínica X', responsible: 'Ana Souza' }, plan: { reels_qty: 4 }, numbers, network: null, suggestions: '' };

  it('1ª página de resumo: faixa do cliente, agradecimento e quadros entregue × plano', () => {
    const d = relatorioDoc(base);
    expect(d.cover).toBeUndefined();
    expect(d.summary).toMatchObject({ client: 'Clínica X', month: 'outubro de 2026' });
    expect(d.intro).toContain('Ana');
    const stats = d.sections.find((s: { type?: string }) => s.type === 'stats');
    expect(stats.items[0]).toMatchObject({ icon: 'video', label: 'Reels', value: 7, plan: 4, extra: 3 });
  });

  it('stories: quadro próprio quando o plano prevê stories', () => {
    const d = relatorioDoc({ ...base, plan: { reels_qty: 4, stories_qty: 30 }, storiesPosted: 34 });
    const st = d.sections.find((s: { title?: string }) => s.title === 'Stories do mês');
    expect(st.items.map((i: { value: number }) => i.value)).toEqual([34, 30, 34]);
    expect(st.items[2].note).toBe('+4 além do plano');
    expect(relatorioDoc(base).sections.some((s: { title?: string }) => s.title === 'Stories do mês')).toBe(false);
  });

  it('calendário: gravações do mês, feriados com arte de aviso e o pedido de confirmar no portal', () => {
    const d = relatorioDoc({
      ...base,
      calendar: [{ date: '2026-11-02', kind: 'feriado', label: 'Finados', idea: 'x' }, { date: '2026-11-01', kind: 'sazonal', label: 'Novembro Azul', idea: 'série sobre a saúde do homem' }],
      recordings: [{ date: '2026-11-05', time: '09:00' }, { date: '2026-12-03', time: '09:00' }],
      portalUrl: 'https://agenciapulse.tech/portal/x',
      team: { people: [{ name: 'Rafael', role: 'Videomaker' }], agents: [{ name: 'Davi', role: 'Edição de vídeo' }] },
    });
    const cal = d.sections.find((s: { type?: string }) => s.type === 'calendar');
    expect(cal.marks.map((m: { kind: string; name: string; tag: string }) => `${m.kind}:${m.name}:${m.tag}`)).toEqual(['sazonal:Novembro Azul:Arte comemorativa', 'feriado:Finados:Arte de aviso', 'gravacao:Gravação:9h']);
    expect(d.sections.some((s: { heading?: string }) => s.heading === 'Confirme suas gravações no portal')).toBe(true);
    expect(d.sections.find((s: { type?: string }) => s.type === 'portal').url).toBe('https://agenciapulse.tech/portal/x');
    expect(d.sections.filter((s: { type?: string }) => s.type === 'team')).toHaveLength(2);
  });

  it('sem gravação agendada: só as datas, sem pedido de confirmar', () => {
    const d = relatorioDoc({ ...base, calendar: [{ date: '2026-11-02', kind: 'feriado', label: 'Finados', idea: 'x' }] });
    expect(d.sections.some((s: { heading?: string }) => s.heading === 'Confirme suas gravações no portal')).toBe(false);
  });
});

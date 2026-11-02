// Resumo do dia em PDF (Assistente PULSE, 01/11/2026): o documento montado a partir dos dados do dia. O financeiro só
// aparece para quem tem permissão; a ordem é números → pessoas → entregas por cliente → financeiro → pendências.
import { describe, expect, it } from 'vitest';
import { dailyPdfSpec } from '../../vps-api-server/assistant/dailyReportPdf.mjs';
// ícones que o gerador desenha (lib/billingPdf.mjs, ICONS; o pdfkit só existe no node_modules do vps-api-server)
const ICONS = ['edicao', 'arte', 'post', 'gravacao', 'aprovacao', 'atendimento', 'cards', 'entrada', 'saida', 'alteracao', 'alerta', 'caixa'];

type Section = { title?: string; type?: string; items?: { icon: string; label: string; value: unknown }[]; people?: { items: { icon: string }[] }[]; rows?: unknown[] };

const data = {
  cidades: ['minacu', 'uruacu'],
  numeros: { videos: 3, artes: 2, posts: 1, gravacoes: 2, cardsMovidos: 9, aprovados: 1, alteracoes: 1 },
  pessoas: [
    { name: 'Naay', role: 'Social media', agent: false, items: [{ icon: 'post', text: '1 post publicado — Clínica Sorriso' }] },
    { name: 'Davi', role: 'Edição de vídeo (IA)', agent: true, items: [{ icon: 'edicao', text: '2 vídeos entregues — Rede A3P' }] },
  ],
  porCliente: [{ cliente: 'Rede A3P', entregues: ['Energia honesta'], artes: [], aprovados: [], postados: [], alteracao: [] }],
  pendencias: { atrasados: [], parados: [], urgentes: 0, aguardando: 0, fila: { edicao: 2, alteracao: 1, analise: 0, revisao: 2 } },
  financeiro: {
    movimentos: [
      { tipo: 'entrada', descricao: 'AlvesCred', forma: 'InfinitePay', valor: 1200, quem: 'InfinitePay (automático)' },
      { tipo: 'saida', descricao: 'Gasolina', forma: 'Despesa paga', valor: 180, quem: 'Naay' },
    ],
    cobrancas: [{ cliente: 'Casa Lar', tipo: 'cobranca', status: 'enviada' }],
    entradas: 1200, saidas: 180, saldoDia: 1020, saldoConta: 6870, mensalidades: 1,
  },
};
const date = new Date('2026-11-01T21:00:00Z');

describe('resumo do dia em PDF', () => {
  it('com financeiro: título do dia, quadros de entradas e saídas, seções na ordem pedida', () => {
    const spec = dailyPdfSpec(data, { date, financeiro: true });
    const sections = spec.sections as Section[];
    expect(spec.kind).toBe('resumo');
    expect(spec.title).toBe('Resumo do dia · 01/11');
    expect(spec.subtitle).toMatch(/^Domingo · Minaçu e Uruaçu/);
    expect(sections[0].items!.map((k) => k.label)).toEqual([
      'Vídeos entregues', 'Artes', 'Posts publicados', 'Gravações feitas', 'Cards movidos', 'Aprovados', 'Entradas do caixa', 'Saídas do caixa',
    ]);
    expect(sections.map((s) => s.title).filter(Boolean)).toEqual([
      'Quem fez o quê', 'Entregas do dia por cliente', 'Financeiro do dia', 'Cobranças enviadas', 'Pendências para amanhã',
    ]);
    expect(sections.find((s) => s.title === 'Financeiro do dia')!.rows).toHaveLength(2);
    expect(spec.footerNote).toMatch(/não encaminhe a clientes/);
  });

  it('sem permissão: nada do financeiro no documento, mesmo com os dados presentes', () => {
    const spec = dailyPdfSpec(data, { date, financeiro: false });
    const text = JSON.stringify(spec);
    expect(text).not.toMatch(/Financeiro do dia|Cobranças enviadas|Entradas do caixa|AlvesCred|Gasolina|1\.200/);
    expect((spec.sections as Section[])[0].items!.map((k) => k.label)).toContain('Em alteração');
  });

  it('todo ícone usado existe no gerador', () => {
    const sections = dailyPdfSpec(data, { date, financeiro: true }).sections as Section[];
    const used = [...sections[0].items!.map((k) => k.icon), ...sections[1].people!.flatMap((p) => p.items.map((i) => i.icon))];
    for (const icon of used) expect(ICONS).toContain(icon);
  });

  it('dia vazio: frases em vez de tabelas vazias', () => {
    const empty = { ...data, pessoas: [], porCliente: [], financeiro: { ...data.financeiro, movimentos: [], cobrancas: [], entradas: 0, saidas: 0, saldoDia: 0 } };
    const sections = dailyPdfSpec(empty, { date, financeiro: true }).sections as (Section & { text?: string })[];
    expect(sections.find((s) => s.title === 'Quem fez o quê')!.text).toMatch(/Ninguém registrou/);
    expect(sections.find((s) => s.title === 'Financeiro do dia')!.text).toMatch(/Nenhuma movimentação/);
  });
});

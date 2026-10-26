import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  alertMessage, alertTriggers, bandOf, cleanExcerpts, combineScore, conversationScore, dataScore, maskPhones, parseReading,
  shouldAlert, trendOf,
} from '../../vps-api-server/assistant/temperatureScore.mjs';
import { temperatureBand, canSeeTemperature } from '@/lib/clientTemperature';
import ClientTemperatureBadge from '@/components/clients/ClientTemperatureBadge';
import { getClientStatus } from '@/components/social/ClientStatusBadge';

const DAY = 86_400_000;
const now = new Date('2026-10-26T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY).toISOString();

describe('Temperatura do cliente: faixas', () => {
  it('Satisfeito ≥ 70, Atenção 40–69, Insatisfeito < 40 (front igual ao servidor)', () => {
    expect(bandOf(70)).toBe('satisfeito');
    expect(bandOf(69)).toBe('atencao');
    expect(bandOf(40)).toBe('atencao');
    expect(bandOf(39)).toBe('insatisfeito');
    expect(bandOf(null)).toBeNull();
    for (let n = 0; n <= 100; n++) expect(temperatureBand(n)).toBe(bandOf(n));
  });

  it('só a gestão vê', () => {
    expect(canSeeTemperature(['gestor_projetos'])).toBe(true);
    expect(canSeeTemperature(['socio_gestor'])).toBe(true);
    expect(canSeeTemperature(['editor', 'designer'])).toBe(false);
  });
});

describe('Temperatura do cliente: nota de dados', () => {
  it('sem sinais ruins fica em 100', () => {
    expect(dataScore({ atrasos: { atual: 0, anterior: 0 }, ajustes: { atual: 1, anterior: 0, entregas: 10 } })).toEqual({ score: 100, motivos: [] });
  });

  it('aplica os pesos com teto e a piora contra os 30 dias anteriores', () => {
    const { score, motivos } = dataScore({
      atrasos: { atual: 5, anterior: 1 }, // 5 × 6 = 30 → teto 24, +3 de piora
      gravacoes: { atual: 1, anterior: 1, canceladas: 1, remarcadas: 0 }, // 5
      inadimplencia: { parcelas: 1, maxDias: 10, total: 900 }, // 6
    });
    expect(motivos.map((m: { chave: string; pontos: number }) => [m.chave, m.pontos])).toEqual([['atrasos', 27], ['inadimplencia', 6], ['gravacoes', 5]]);
    expect(score).toBe(100 - 27 - 6 - 5);
    expect(motivos[0].texto).toBe('5 entregas atrasadas (antes 1)');
    expect(motivos.find((m: { chave: string }) => m.chave === 'inadimplencia').texto).not.toMatch(/R\$/);
  });

  it('entregas do plano e portal só pesam quando dá para avaliar', () => {
    expect(dataScore({ entregas: { avaliar: true, referencia: 'mes', previsto: 10, contratado: 12, feitas: 4 } }).score).toBe(88);
    expect(dataScore({ entregas: { avaliar: true, referencia: 'mes', previsto: 10, contratado: 12, feitas: 7 } }).score).toBe(94);
    expect(dataScore({ portal: { avaliar: false, diasComAcesso: 0, entregasEnviadas: 3 } }).score).toBe(100);
    expect(dataScore({ portal: { avaliar: true, diasComAcesso: 0, entregasEnviadas: 3 } }).score).toBe(96);
    expect(dataScore({ respostaEquipe: { conversas: 2, medianaHoras: 50 } }).score).toBe(100);
    expect(dataScore({ respostaEquipe: { conversas: 3, medianaHoras: 30 } }).score).toBe(94);
  });
});

describe('Temperatura do cliente: conversa e nota final', () => {
  it('leitura validada: nota limitada, sinais conhecidos, trechos que existem, sem telefone', () => {
    const reading = parseReading(
      { nota: 140, sinais: ['atraso', 'inventado'], trechos: ['vou CANCELAR o contrato', 'isso ninguém disse'], resumo: 'Pediu retorno no (62) 98888-7777' },
      ['Vou cancelar o contrato se atrasar de novo!'],
    );
    expect(reading).toEqual({ nota: 100, sinais: ['atraso'], trechos: ['Vou cancelar o contrato'], resumo: 'Pediu retorno no •••' });
    expect(parseReading({ nota: 'x' }, [])).toBeNull();
  });

  it('trechos: no máximo 2, até 140 caracteres', () => {
    const long = 'a'.repeat(200);
    expect(cleanExcerpts(['primeiro', 'segundo', 'terceiro'], ['primeiro segundo terceiro'])).toEqual(['primeiro', 'segundo']);
    expect(cleanExcerpts([long], [long])[0]).toHaveLength(140);
    expect(maskPhones('liga 5562999990000 ou 3 vídeos')).toBe('liga ••• ou 3 vídeos');
  });

  it('nota da conversa pesa mensagens e idade; sem leitura recente fica de fora', () => {
    expect(conversationScore([{ nota: 20, mensagens: 1, sinais: [], trechos: [], created_at: daysAgo(9) }], now)).toBeNull();
    const conv = conversationScore([
      { nota: 90, mensagens: 1, sinais: [], trechos: [], created_at: daysAgo(5) },
      { nota: 30, mensagens: 4, sinais: ['qualidade'], trechos: ['ficou feio'], created_at: daysAgo(0) },
    ], now);
    expect(conv.score).toBeGreaterThan(30);
    expect(conv.score).toBeLessThan(50);
    expect(conv.sinais).toEqual(['qualidade']);
    expect(conv.trechos).toEqual(['ficou feio']);
  });

  it('60% conversa + 40% dados; ameaça de cancelar limita a 35', () => {
    const data = { score: 90, motivos: [] };
    expect(combineScore(data, null)).toMatchObject({ score: 90, faixa: 'satisfeito', motivos: [{ texto: 'Sem sinais de insatisfação' }] });
    const calm = conversationScore([{ nota: 80, mensagens: 2, sinais: [], trechos: [], created_at: daysAgo(1) }], now);
    expect(combineScore(data, calm)).toMatchObject({ score: 84, faixa: 'satisfeito', motivos: [{ texto: 'Satisfeito no grupo' }] });
    const threat = conversationScore([{ nota: 60, mensagens: 2, sinais: ['ameaca_cancelar'], trechos: ['vou sair'], created_at: daysAgo(1) }], now);
    const result = combineScore(data, threat);
    expect(result.score).toBe(35);
    expect(result.faixa).toBe('insatisfeito');
    expect(result.motivos[0].texto).toBe('Falou em cancelar no grupo');
    expect(trendOf(35, 80)).toBe(-45);
    expect(trendOf(35, null)).toBeNull();
  });
});

describe('Temperatura do cliente: alertas', () => {
  it('motivos: faixa vermelha, queda de 20+, ameaça e insatisfação no grupo', () => {
    expect(alertTriggers({ score: 75, variacao: -5, freshThreat: false, freshUnhappy: false })).toEqual([]);
    expect(alertTriggers({ score: 35, variacao: -25, freshThreat: true, freshUnhappy: false })).toEqual(['faixa_vermelha', 'queda', 'ameaca_cancelar']);
    expect(alertTriggers({ score: 55, variacao: null, freshThreat: false, freshUnhappy: true })).toEqual(['insatisfacao_grupo']);
  });

  it('sem repetir: 3 dias por motivo, salvo piora de 10+ pontos', () => {
    expect(shouldAlert(null, 30, now)).toBe(true);
    expect(shouldAlert({ created_at: daysAgo(1), nota: 30 }, 28, now)).toBe(false);
    expect(shouldAlert({ created_at: daysAgo(1), nota: 30 }, 20, now)).toBe(true);
    expect(shouldAlert({ created_at: daysAgo(3), nota: 30 }, 30, now)).toBe(true);
  });

  it('mensagem curta: cliente, temperatura, motivo e trecho', () => {
    expect(alertMessage({ cliente: 'Clínica X', cidade: 'Minaçu', score: 30, faixa: 'insatisfeito', variacao: -25, motivo: 'Falou em cancelar no grupo', trecho: 'vou sair' }))
      .toBe('🌡️ *Temperatura de Clínica X* (Minaçu)\n30/100 · Insatisfeito (-25 na semana)\nMotivo: Falou em cancelar no grupo\n💬 "vou sair"');
  });
});

describe('ClientTemperatureBadge', () => {
  it('mostra ícone e texto da faixa (não só cor) e some sem nota', () => {
    const { container, rerender } = render(<MemoryRouter><ClientTemperatureBadge score={35} /></MemoryRouter>);
    expect(screen.getByText('Insatisfeito · 35')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    rerender(<MemoryRouter><ClientTemperatureBadge score={72} compact to="/clientes/temperatura?cliente=1" /></MemoryRouter>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/clientes/temperatura?cliente=1');
    expect(screen.getByText('Satisfeito')).toHaveClass('sr-only');
    rerender(<MemoryRouter><ClientTemperatureBadge score={null} /></MemoryRouter>);
    expect(container.textContent).toBe('');
    rerender(<MemoryRouter><ClientTemperatureBadge score={null} showEmpty /></MemoryRouter>);
    expect(screen.getByText('Sem análise')).toBeInTheDocument();
  });

  it('não mexe no status do cliente (ClientStatusBadge segue com a mesma prioridade)', () => {
    expect(getClientStatus({ hasOverdue: true, isOnboarding: true })).toBe('atrasado');
    expect(getClientStatus({ hasOverdue: false, isOnboarding: true })).toBe('onboarding');
  });
});

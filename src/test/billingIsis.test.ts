import { describe, expect, it } from 'vitest';
import {
  stepsDueOn, stepDates, attendanceTip, cardAmount, crc16, pixPayload, applyTemplate, bulletList, nextMonth, previousMonth,
  DEFAULT_TEMPLATES,
} from '../../vps-api-server/lib/billingIsis.mjs';

describe('cobranças da Ísis · calendário', () => {
  it('dia 1, D−5, D e D+3', () => {
    expect(stepDates('2026-11-10')).toEqual({ relatorio_mensal: '2026-11-01', pre_vencimento: '2026-11-05', cobranca: '2026-11-10', lembrete: '2026-11-13' });
    expect(stepsDueOn('2026-11-05', '2026-11-10')).toEqual(['pre_vencimento']);
    // vencimento dia 6: o D−5 cai no dia 1, junto do relatório
    expect(stepsDueOn('2026-11-01', '2026-11-06')).toEqual(['relatorio_mensal', 'pre_vencimento']);
    // vencimento dia 30: o lembrete cai no mês seguinte
    expect(stepDates('2026-11-30').lembrete).toBe('2026-12-03');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(previousMonth('2026-01-15')).toBe('2025-12');
  });
});

describe('cobranças da Ísis · valores e Pix', () => {
  it('cartão com a taxa repassada: a Pulse recebe a mensalidade inteira', () => {
    expect(cardAmount(1000, 0)).toBe(1000);
    expect(cardAmount(1000, 4.2)).toBe(1043.84);
    expect(cardAmount(1000, 99)).toBe(1428.57); // taxa limitada a 30%
  });

  it('CRC16 do BR Code (CCITT-FALSE) e Pix copia e cola válido', () => {
    expect(crc16('123456789')).toBe('29B1');
    const pix = pixPayload({ key: 'pix@pulse.com.br', name: 'Agência Pulse Ltda', city: 'Minaçu', amount: 1500, txid: 'PULSE2026-11' })!;
    expect(pix.startsWith('000201')).toBe(true);
    expect(pix).toContain('0014br.gov.bcb.pix0116pix@pulse.com.br');
    expect(pix).toContain('54071500.00');
    expect(pix).toContain('5918AGENCIA PULSE LTDA');
    expect(pix).toContain('6006MINACU');
    expect(pix).toContain('62150511PULSE202611');
    expect(pix.slice(-4)).toBe(crc16(pix.slice(0, -4)));
    expect(pixPayload({ key: '', name: 'x', city: 'y', amount: 1 })).toBeNull();
  });
});

describe('cobranças da Ísis · textos', () => {
  it('linha com variável vazia sai inteira (sem link, sem cartão)', () => {
    const body = applyTemplate(DEFAULT_TEMPLATES.cobranca, {
      nome_cliente: 'Posto Naraely', plano: 'Plano Pulse', valor: 'R$ 1.500,00', pix_copia_cola: '000201…', chave_pix: 'pix@pulse.com.br',
      nome_recebedor: 'Agência Pulse', valor_cartao: '', link_infinitepay: null,
    });
    expect(body).toContain('Hoje é o vencimento da sua mensalidade Pulse (Plano Pulse): *R$ 1.500,00*.');
    expect(body).toContain('💠 *Pix (preferencial):*\n000201…');
    expect(body).not.toContain('Prefere cartão');
    expect(body).not.toContain('{');
  });

  it('dica de assiduidade pelo que aconteceu', () => {
    expect(attendanceTip({ done: 4, scheduled: 4, cancelled: 0, avg: 5 })).toMatch(/Agenda em dia/);
    expect(attendanceTip({ done: 4, scheduled: 4, cancelled: 0, avg: 2 })).toMatch(/3 ou 4 temas/);
    expect(attendanceTip({ done: 2, scheduled: 3, cancelled: 1, avg: 5 })).toMatch(/1 gravação\(ões\) remarcada/);
  });

  it('sugestões viram tópicos', () => {
    expect(bulletList('Story do café\n• Reels\n\n')).toBe('• Story do café\n• Reels');
  });
});

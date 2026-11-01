import { describe, expect, it } from 'vitest';
import {
  stepsDueOn, stepDates, attendanceTip, cardAmount, crc16, pixPayload, applyTemplate, bulletList, nextMonth, previousMonth,
  DEFAULT_TEMPLATES, DEFAULT_FOOTER, withFooter, checkBillingData, accountSummary,
} from '../../vps-api-server/lib/billingIsis.mjs';
import { contactForCity, formatPhoneBr } from '../../vps-api-server/lib/contactByCity.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

  it('a cobrança não fala de taxa (a InfinitePay repassa na hora do pagamento)', () => {
    const body = applyTemplate(DEFAULT_TEMPLATES.cobranca, { nome_cliente: 'X', plano: 'P', valor: 'R$ 1,00', pix_copia_cola: '0002', chave_pix: 'k', nome_recebedor: 'r', link_infinitepay: 'https://checkout.infinitepay.io/a/b' });
    expect(body).toContain('💳 Prefere cartão? Pague pelo link: https://checkout.infinitepay.io/a/b');
    expect(body.toLowerCase()).not.toContain('taxa');
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

describe('cobranças da Ísis · rodapé de mensagem automática', () => {
  it('vai no fim de toda mensagem, editável e desligável', () => {
    expect(withFooter('Olá!', null)).toBe('Olá!\n\n—\n_Esta é uma mensagem automática. Para dúvidas, fale com o Thiago: (62) 98538-2981._');
    expect(DEFAULT_FOOTER).toContain('{contato_nome}: {contato_telefone}');
    expect(withFooter('Olá!', 'Dúvidas: (62) 9999-0000')).toBe('Olá!\n\nDúvidas: (62) 9999-0000');
    expect(withFooter('Olá!', '  ')).toBe('Olá!');
  });

  it('contato pela cidade do cliente: Uruaçu → Thiago, Minaçu → Victor (telefone do Assistente PULSE)', () => {
    const numbers = [{ name: 'Victor Hugo', phone: '5562999990000', active: true }, { name: 'Naay', phone: '5562911112222', active: true }];
    const uru = contactForCity('Uruaçu', null, numbers);
    const min = contactForCity('minacu', null, numbers);
    expect(uru).toEqual({ city: 'uruacu', name: 'Thiago', phone: '(62) 98538-2981' });
    expect(min).toEqual({ city: 'minacu', name: 'Victor', phone: '(62) 99999-0000' });
    expect(withFooter('Olá!', null, min)).toBe('Olá!\n\n—\n_Esta é uma mensagem automática. Para dúvidas, fale com o Victor: (62) 99999-0000._');
    // configurado na tela vale por cima do padrão
    expect(contactForCity('minacu', { contact_name: 'Naay', contact_phone: '62 91111-2222' }, numbers)).toMatchObject({ name: 'Naay', phone: '(62) 91111-2222' });
    // sem telefone em lugar nenhum: o rodapé não sai pela metade
    expect(withFooter('Olá!', null, contactForCity('minacu', null, []))).toBe('Olá!');
    expect(formatPhoneBr('5562985382981')).toBe('(62) 98538-2981');
  });
});

describe('cobranças da Ísis · PDF no modelo da Pulse', () => {
  // roda num Node de verdade (no jsdom dos testes o pdfkit não lê a fonte TTF), como no servidor
  it('gera um PDF de cobrança com o Pix e o link do cartão', () => {
    const lib = pathToFileURL(path.resolve(process.cwd(), 'vps-api-server/lib/billingPdf.mjs')).href;
    const spec = {
      kind: 'cobranca', number: 'PULSE-202611-TEST', issued: '10/11/2026', title: 'Mensalidade de novembro de 2026', status: 'aberto',
      cards: [{ label: 'Cliente', value: 'Cliente Teste', small: true }, { label: 'Vencimento', value: '10/11/2026' }, { label: 'Valor', value: 'R$ 1.500,00', highlight: true }],
      table: { title: 'Serviços', columns: [{ label: 'Descrição', width: 287 }, { label: 'Competência', width: 120 }, { label: 'Valor', width: 100, align: 'right' }], rows: [['Mensalidade Plano Pulse', '11/2026', 'R$ 1.500,00']], total: { label: 'Total', value: 'R$ 1.500,00' } },
      payment: { pixPayload: pixPayload({ key: 'pix@pulse.com.br', name: 'Agencia Pulse', city: 'Uruacu', amount: 1500 }), pixKey: 'pix@pulse.com.br', receiver: 'Agência Pulse', cardLink: 'https://checkout.infinitepay.io/x', cardAmount: 'R$ 1.565,76' },
      footerNote: 'Esta é uma mensagem automática.', footerContact: 'Cliente Teste · Uruaçu',
    };
    const code = `const { renderPdf } = await import(${JSON.stringify(lib)}); const b = await renderPdf(${JSON.stringify(spec)}); process.stdout.write(b.subarray(0, 5).toString() + ' ' + b.length);`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    const [magic, size] = out.trim().split(' ');
    expect(magic).toBe('%PDF-');
    expect(Number(size)).toBeGreaterThan(10_000);
  }, 30_000);
});

describe('cobranças da Ísis · conferência antes de cobrar', () => {
  const rev = (o: Record<string, unknown>) => ({ amount: 1500, status: 'prevista', due_date: '2026-11-10', reference_month: '2026-11-01', ...o });
  it('só cobra quando a mensalidade bate com o Financeiro', () => {
    expect(checkBillingData({ contractValue: 1500, revenues: [rev({})], month: '2026-11' })).toEqual([]);
    expect(checkBillingData({ contractValue: 1500, revenues: [], month: '2026-11' })).toEqual(['a mensalidade de 11/2026 não está lançada em Financeiro → Receitas']);
    expect(checkBillingData({ contractValue: 1500, revenues: [rev({}), rev({})], month: '2026-11' })[0]).toMatch(/2 mensalidades de 11\/2026 em aberto/);
    expect(checkBillingData({ contractValue: 1500, revenues: [rev({ amount: 1200 })], month: '2026-11' })[0]).toMatch(/não bate com o contrato/);
    expect(checkBillingData({ contractValue: 1500, revenues: [rev({ amount: 0 })], month: '2026-11' })[0]).toMatch(/valor zerado/);
    expect(checkBillingData({ contractValue: 1500, revenues: [rev({ due_date: null })], month: '2026-11' })[0]).toMatch(/sem vencimento/);
  });

  it('o PDF mostra o que ficou em aberto e os últimos pagamentos', () => {
    const conta = accountSummary([
      rev({ reference_month: '2026-10-01', due_date: '2026-10-10', status: 'em_atraso' }),
      rev({ reference_month: '2026-09-01', status: 'recebida', paid_at: '2026-09-09' }),
    ]);
    expect(conta.open).toEqual(['Mensalidade 10/2026 · R$ 1.500,00 · venceu em 10/10/2026']);
    expect(conta.openTotal).toBe(1500);
    expect(conta.paid).toEqual(['Mensalidade 09/2026 · R$ 1.500,00 · paga em 09/09/2026']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  stepsDueOn, stepDates, attendanceTip, cardAmount, crc16, pixPayload, applyTemplate, bulletList, nextMonth, previousMonth,
  DEFAULT_TEMPLATES, DEFAULT_FOOTER, withFooter, checkBillingData, accountSummary, ensurePayLink, payToken, effectiveTemplate,
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

  it('BR Code estático: os campos EMV se leem de ponta a ponta e o CRC bate com qualquer valor', () => {
    // lê TLV (id de 2 dígitos + tamanho de 2 dígitos + valor) até o fim; tamanho errado quebra a leitura
    const parse = (s: string) => {
      const out: Record<string, string> = {};
      for (let i = 0; i < s.length;) {
        const len = Number(s.slice(i + 2, i + 4));
        out[s.slice(i, i + 2)] = s.slice(i + 4, i + 4 + len);
        i += 4 + len;
      }
      return out;
    };
    for (const [amount, key] of [[1, '+5562985382981'], [1499.9, '12345678901'], [12345.67, 'f1c3a9e2-0b5d-4c8e-9a7f-2d6b1e0c4a33']] as const) {
      const pix = pixPayload({ key, name: 'Agência Pulse', city: 'Uruaçu', amount, txid: 'PULSE202611' })!;
      const f = parse(pix);
      expect(f['00']).toBe('01');
      expect(parse(f['26'])).toEqual({ '00': 'br.gov.bcb.pix', '01': key });
      expect(f['53']).toBe('986');
      expect(f['54']).toBe(amount.toFixed(2));
      expect(f['58']).toBe('BR');
      expect(f['60']).toBe('URUACU');
      expect(parse(f['62'])['05']).toBe('PULSE202611');
      expect(f['63']).toBe(crc16(pix.slice(0, -4)));
      expect(f['63']).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe('cobranças da Ísis · textos', () => {
  it('a cobrança leva a página de pagamento; o código Pix não vai no texto (vai sozinho na mensagem seguinte)', () => {
    const body = applyTemplate(DEFAULT_TEMPLATES.cobranca, {
      nome_cliente: 'Posto Naraely', plano: 'Plano Pulse', valor: 'R$ 1.500,00', pix_copia_cola: '000201…', chave_pix: 'pix@pulse.com.br',
      nome_recebedor: 'Agência Pulse', link_pagamento: 'https://agenciapulse.tech/pagar/abc', aviso_cartao: '',
    });
    expect(body).toBe('Olá, Posto Naraely! 😊\n\nHoje vence sua mensalidade Pulse: *R$ 1.500,00*.\n\n👉 Pague aqui (Pix ou cartão):\nhttps://agenciapulse.tech/pagar/abc\n\nO código Pix vai na próxima mensagem.\n\nSe já pagou, desconsidere. Obrigada! 🧡');
    expect(body).not.toContain('000201');
    expect(body).not.toContain('{');
    expect(body.toLowerCase()).not.toContain('taxa');
    const lembrete = applyTemplate(DEFAULT_TEMPLATES.lembrete, { nome_cliente: 'X', mes_ref: 'novembro', valor: 'R$ 1,00', link_pagamento: 'https://agenciapulse.tech/pagar/abc' });
    expect(lembrete).toContain('https://agenciapulse.tech/pagar/abc');
  });

  it('modelo salvo antes da página ganha o link; token da página é URL-safe e imprevisível', () => {
    expect(ensurePayLink('Olá {nome_cliente}')).toBe('Olá {nome_cliente}\n\n👉 Pague aqui (Pix ou cartão):\n{link_pagamento}');
    expect(ensurePayLink('Pague: {link_pagamento}')).toBe('Pague: {link_pagamento}');
    expect(payToken((n: number) => Buffer.alloc(n, 255))).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('dica de assiduidade pelo que aconteceu', () => {
    expect(attendanceTip({ done: 4, scheduled: 4, cancelled: 0, avg: 5 })).toMatch(/Agenda em dia/);
    expect(attendanceTip({ done: 4, scheduled: 4, cancelled: 0, avg: 2 })).toMatch(/3 ou 4 temas/);
    expect(attendanceTip({ done: 2, scheduled: 3, cancelled: 1, avg: 5 })).toMatch(/1 gravação remarcada/);
  });

  it('sugestões viram tópicos', () => {
    expect(bulletList('Story do café\n• Reels\n\n')).toBe('• Story do café\n• Reels');
  });
});

describe('cobranças da Ísis · rodapé de mensagem automática', () => {
  it('vai no fim de toda mensagem, editável e desligável', () => {
    expect(withFooter('Olá!', null)).toBe('Olá!\n\n—\n_Mensagem automática. Dúvidas: Thiago · (62) 98538-2981_');
    expect(DEFAULT_FOOTER).toContain('{contato_nome} · {contato_telefone}');
    // rodapé padrão antigo salvo no banco = não editado: sai o novo
    expect(withFooter('Olá!', '—\n_Esta é uma mensagem automática. Para dúvidas, fale com o {contato_nome}: {contato_telefone}._'))
      .toBe('Olá!\n\n—\n_Mensagem automática. Dúvidas: Thiago · (62) 98538-2981_');
    expect(withFooter('Olá!', 'Dúvidas: (62) 9999-0000')).toBe('Olá!\n\nDúvidas: (62) 9999-0000');
    expect(withFooter('Olá!', '  ')).toBe('Olá!');
  });

  it('contato pela cidade do cliente: Uruaçu → Thiago, Minaçu → Victor (telefone do Assistente PULSE)', () => {
    const numbers = [{ name: 'Victor Hugo', phone: '5562999990000', active: true }, { name: 'Naay', phone: '5562911112222', active: true }];
    const uru = contactForCity('Uruaçu', null, numbers);
    const min = contactForCity('minacu', null, numbers);
    expect(uru).toEqual({ city: 'uruacu', name: 'Thiago', phone: '(62) 98538-2981' });
    expect(min).toEqual({ city: 'minacu', name: 'Victor', phone: '(62) 99999-0000' });
    expect(withFooter('Olá!', null, min)).toBe('Olá!\n\n—\n_Mensagem automática. Dúvidas: Victor · (62) 99999-0000_');
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

describe('cobranças da Ísis · respiro e modelos antigos', () => {
  it('blocos separados por uma linha em branco; bloco vazio e chamada sem conteúdo somem sem deixar 3 quebras', () => {
    const vars = { nome_cliente: 'X', mes_anterior: 'outubro', mes_atual: 'novembro', qtd_videos: 9, qtd_artes: 5, qtd_posts: 12, qtd_gravacoes: 2 };
    const body = applyTemplate(DEFAULT_TEMPLATES.relatorio_mensal, { ...vars, horas_dedicadas: '', resumo_rede: '', sugestoes: '', link_relatorio: '' });
    expect(body).not.toMatch(/\n{3,}/);
    expect(body).not.toContain('Para novembro:');
    expect(body).not.toContain('Relatório completo');
    expect(body.split('\n\n')).toHaveLength(3);
    const cheio = applyTemplate(DEFAULT_TEMPLATES.relatorio_mensal, { ...vars, horas_dedicadas: '11,5', resumo_rede: '18 mil contas', sugestoes: '• A\n• B', link_relatorio: 'https://x' });
    expect(cheio).toContain('Para novembro:\n• A\n• B');
    expect(cheio).not.toMatch(/\n{3,}/);
  });

  it('modelo salvo igual a um padrão antigo vira o padrão novo; editado de verdade fica', () => {
    const antigo = "Olá, {nome_cliente}! Tudo bem? 😊\nHoje é o vencimento da sua mensalidade Pulse ({plano}): *{valor}*.\n💠 *Pix (preferencial):*\n{pix_copia_cola}\nChave: {chave_pix} · {nome_recebedor}\n💳 Prefere cartão? Pague pelo link: {link_infinitepay}\n_{aviso_cartao}_\nSe já pagou, pode desconsiderar. Obrigada pela confiança! 🧡";
    expect(effectiveTemplate('cobranca', antigo)).toBe(DEFAULT_TEMPLATES.cobranca);
    expect(effectiveTemplate('cobranca', null)).toBe(DEFAULT_TEMPLATES.cobranca);
    expect(effectiveTemplate('cobranca', 'Oi {nome_cliente}, pague: {link_pagamento}')).toBe('Oi {nome_cliente}, pague: {link_pagamento}');
  });
});

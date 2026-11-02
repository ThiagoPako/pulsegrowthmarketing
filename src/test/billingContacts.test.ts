import { describe, expect, it } from 'vitest';
import { billingTarget, validWhatsapp } from '../../vps-api-server/lib/billingContacts.mjs';

// Para quem vão a cobrança e o recibo (usuário, 02/11/2026): o responsável (padrão) ou o financeiro da empresa,
// sem nunca mandar cobrança para o lugar errado.
describe('contatos do financeiro do cliente', () => {
  const dono = { whatsapp: '5562999990000', responsible_person: 'Maria' };

  it('padrão: cobrança e recibo vão ao WhatsApp do responsável (igual a antes)', () => {
    expect(billingTarget(dono, 'cobranca')).toEqual({ to: '5562999990000', name: 'Maria', own: false });
    expect(billingTarget(dono, 'recibo').to).toBe('5562999990000');
  });

  it('empresa com financeiro: cobrança ao financeiro; recibo ao número de recibos; relatório sempre ao responsável', () => {
    const c = {
      ...dono, billing_same_as_owner: false, billing_whatsapp: '(62) 98888-1111', billing_contact_name: 'Ana do financeiro',
      receipt_same_as_owner: false, receipt_whatsapp: '5562977772222',
    };
    expect(billingTarget({ ...c, billing_whatsapp: '5562988881111' }, 'cobranca')).toEqual({ to: '5562988881111', name: 'Ana do financeiro', own: true });
    expect(billingTarget(c, 'recibo').to).toBe('5562977772222');
    expect(billingTarget(c, 'relatorio').to).toBe('5562999990000');
  });

  it('número próprio faltando ou errado: não envia (nada cai no número do dono por engano)', () => {
    const r = billingTarget({ ...dono, billing_same_as_owner: false, billing_whatsapp: '' }, 'cobranca');
    expect(r.to).toBeNull();
    expect(r.problem).toContain('cobranças');
    expect(billingTarget({ ...dono, receipt_same_as_owner: false, receipt_whatsapp: '62999' }, 'recibo').to).toBeNull();
    expect(billingTarget({ whatsapp: '' }, 'cobranca').to).toBeNull();
  });

  it('WhatsApp válido: 55 + DDD + número (12 ou 13 dígitos)', () => {
    expect(validWhatsapp('55 62 99999-0000')).toBe(true);
    expect(validWhatsapp('556233330000')).toBe(true);
    expect(validWhatsapp('62999990000')).toBe(false);
  });
});

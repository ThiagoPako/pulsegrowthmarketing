import { describe, expect, it } from 'vitest';
import { monthDates } from '../../vps-api-server/lib/monthDates.mjs';
import { pixOnlyMessage, pixPayload } from '../../vps-api-server/lib/billingIsis.mjs';

describe('relatório: datas do mês pelo nicho', () => {
  it('saúde ganha o Novembro Azul; varejo, a Black Friday; agro, só os feriados', () => {
    const saude = monthDates('2026-11', 'saude');
    expect(saude.map((d: { label: string }) => d.label)).toContain('Novembro Azul');
    expect(saude.map((d: { label: string }) => d.label)).not.toContain('Black Friday');
    const varejo = monthDates('2026-11', 'varejo');
    expect(varejo.find((d: { label: string }) => d.label === 'Black Friday')).toMatchObject({ day: '27/11' });
    const agro = monthDates('2026-11', 'agropecuaria');
    expect(agro.map((d: { label: string }) => d.label)).toEqual(['Finados', 'Proclamação da República', 'Consciência Negra']);
    // julho do agro: Dia do Agricultor
    expect(monthDates('2026-07', 'agropecuaria').map((d: { label: string }) => d.label)).toContain('Dia do Agricultor');
  });

  it('no máximo 3, em ordem de data, com a ideia de cada uma; sem promoção nem preço', () => {
    for (const nicho of ['saude', 'varejo', 'agropecuaria', 'alimentacao', '']) {
      for (const mes of ['2026-05', '2026-06', '2026-10', '2026-11', '2026-12']) {
        const ds = monthDates(mes, nicho);
        expect(ds.length).toBeLessThanOrEqual(3);
        expect(ds.map((d: { date: string }) => d.date)).toEqual([...ds.map((d: { date: string }) => d.date)].sort());
        for (const d of ds) {
          expect(d.date.slice(0, 7)).toBe(mes);
          expect(d.idea).toBeTruthy();
          expect(d.idea).not.toMatch(/R\$|desconto|%/);
        }
      }
    }
  });
});

describe('mensagem do código Pix', () => {
  it('é exatamente o código copia e cola, nada antes nem depois', () => {
    const pix = pixPayload({ key: 'pix@pulse.com.br', name: 'Agencia Pulse', city: 'Uruacu', amount: 1500, txid: 'PULSE202611' })!;
    expect(pixOnlyMessage(pix)).toBe(pix);
    expect(pixOnlyMessage(` ${pix}\n`)).toBe(pix);
    expect(pixOnlyMessage(null)).toBeNull();
  });
});

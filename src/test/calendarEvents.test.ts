import { describe, expect, it } from 'vitest';
import { anniversariesBetween, easter, holidays, holidaysBetween } from '../../vps-api-server/lib/calendarEvents.mjs';

describe('feriados e aniversário das cidades', () => {
  it('Páscoa e os feriados que dependem dela', () => {
    expect(easter(2026)).toBe('2026-04-05');
    expect(easter(2027)).toBe('2027-03-28');
    const h = holidays(2026);
    expect(h.find((x) => x.name === 'Sexta-feira Santa')?.date).toBe('2026-04-03');
    expect(h.filter((x) => x.name === 'Carnaval').map((x) => x.date)).toEqual(['2026-02-16', '2026-02-17']);
    expect(h.find((x) => x.name === 'Corpus Christi')?.date).toBe('2026-06-04');
  });

  it('novembro de 2026 tem Finados, República e Consciência Negra', () => {
    expect(holidaysBetween('2026-11-01', '2026-11-30').map((x) => x.name)).toEqual(['Finados', 'Proclamação da República', 'Dia da Consciência Negra']);
  });

  it('aniversário da cidade: uma marca por cidade, idade só com o ano de fundação', () => {
    const units = [
      { unit_name: 'MINAÇU', city_name: 'MINAÇU', city_anniversary: '1976-05-14' },
      { unit_name: 'Loja 2', city_name: 'Minaçu', city_anniversary: '1976-05-14' },
      { unit_name: 'FORMOSO', city_name: 'FORMOSO', city_anniversary: '0001-09-25' },
    ];
    const may = anniversariesBetween(units, '2026-05-01', '2026-05-31');
    expect(may).toHaveLength(1);
    expect(may[0]).toMatchObject({ date: '2026-05-14', city: 'Minaçu', years: 50 });
    expect(may[0].units).toEqual(['MINAÇU', 'Loja 2']);
    expect(anniversariesBetween(units, '2026-09-01', '2026-09-30')[0]).toMatchObject({ city: 'Formoso', years: null });
  });
});

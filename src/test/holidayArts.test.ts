import { describe, expect, it } from 'vitest';
import { upcomingHolidays, holidayStatus, morningMessage, holidayCardTitle, HOLIDAYS } from '../../vps-api-server/lib/holidayArts.mjs';
import { artSuggestions, suggestionCardTitle, HOLIDAY_RULES } from '@/lib/artSuggestions';

describe('aviso da manhã · feriados', () => {
  it('o espelho do servidor tem os mesmos feriados, datas e títulos do Kanban de Design', () => {
    expect(HOLIDAYS.map((h) => h.slug)).toEqual(HOLIDAY_RULES.map((h) => h.slug));
    for (const day of ['2026-01-01', '2026-03-20', '2026-11-01', '2027-02-01']) {
      const [y, m, d] = day.split('-').map(Number);
      const front = artSuggestions(new Date(y, m - 1, d), { holidayDays: 60, seasonalDays: -1 }).filter((s) => s.kind === 'feriado');
      const server = upcomingHolidays(day, 60);
      expect(server.map((h) => h.date)).toEqual(front.map((s) => s.date));
      expect(server.map((h) => holidayCardTitle(h))).toEqual(front.map((s) => suggestionCardTitle(s)));
    }
  });

  it('separa clientes sem card e cards em andamento, e monta o recado', () => {
    const [finados, republica] = upcomingHolidays('2026-11-01', 14);
    expect(finados).toMatchObject({ slug: 'finados', date: '2026-11-02', daysUntil: 1 });
    expect(republica.slug).toBe('republica');
    const clients = [{ id: 'a', company_name: 'Posto Naraely' }, { id: 'b', company_name: 'Rede A3P' }, { id: 'c', company_name: 'Clínica Sorriso' }];
    const tasks = [
      { client_id: 'a', title: `${holidayCardTitle(finados)} — Feed`, kanban_column: 'concluida' },
      { client_id: 'b', title: holidayCardTitle(finados), kanban_column: 'em_andamento' },
    ];
    const status = holidayStatus([finados], clients, tasks);
    expect(status[0].missing).toEqual(['Clínica Sorriso']);
    expect(status[0].open).toEqual([{ client: 'Rede A3P', column: 'em_andamento' }]);
    const msg = morningMessage(status)!;
    expect(msg).toContain('📅 *Finados* (02/11, amanhã)');
    expect(msg).toContain('• Sem card (1): Clínica Sorriso');
    expect(msg).toContain('• Em andamento (1): Rede A3P');
    expect(morningMessage(holidayStatus([finados], clients.slice(0, 1), tasks))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { artSuggestions, easter, suggestionCardTitle, suggestionCopy, suggestionDueDate, suggestionFitsClient } from '@/lib/artSuggestions';

const dia = (iso: string) => new Date(`${iso}T10:00:00`);

describe('artSuggestions (Ísis, social media)', () => {
  it('calcula a Páscoa e os feriados móveis', () => {
    expect(easter(2026).getDate()).toBe(5); // 5 de abril de 2026
    expect(easter(2026).getMonth()).toBe(3);
    const s = artSuggestions(dia('2026-02-01'));
    expect(s.find((x) => x.id === 'feriado:carnaval:2026')?.date).toBe('2026-02-16');
  });

  it('sugere Finados com tempo e põe feriado antes de sazonal', () => {
    const s = artSuggestions(dia('2026-10-20'));
    const finados = s.find((x) => x.id === 'feriado:finados:2026');
    expect(finados?.daysUntil).toBe(13);
    expect(s[0].kind).toBe('feriado');
    expect(s.some((x) => x.id === 'sazonal:novembro-azul:2026')).toBe(true);
  });

  it('não sugere data que já passou e vira o ano', () => {
    const s = artSuggestions(dia('2026-12-20'));
    expect(s.some((x) => x.id === 'feriado:finados:2026')).toBe(false);
    expect(s.some((x) => x.id === 'feriado:confraternizacao:2027')).toBe(true);
  });

  it('sazonal só para o nicho que combina; feriado para todos', () => {
    const s = artSuggestions(dia('2026-08-01'));
    const advogado = s.find((x) => x.label === 'Dia do Advogado')!;
    expect(suggestionFitsClient(advogado, 'juridico')).toBe(true);
    expect(suggestionFitsClient(advogado, 'farmacia')).toBe(false);
    const feriado = artSuggestions(dia('2026-10-20')).find((x) => x.kind === 'feriado')!;
    expect(suggestionFitsClient(feriado, 'farmacia')).toBe(true);
  });

  it('texto fechado × aberto, título e prazo', () => {
    const finados = artSuggestions(dia('2026-10-20')).find((x) => x.id === 'feriado:finados:2026')!;
    expect(suggestionCopy(finados)).toMatch(/fechados/);
    expect(suggestionCopy(finados, { aberto: true })).toMatch(/estaremos abertos/);
    expect(suggestionCardTitle(finados)).toBe('Aviso de feriado · Finados (02/11)');
    expect(suggestionDueDate(finados, dia('2026-10-20'))).toBe('2026-10-31');
    expect(suggestionDueDate(finados, dia('2026-11-01'))).toBe('2026-11-02');
  });
});

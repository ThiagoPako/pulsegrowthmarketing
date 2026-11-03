import { describe, expect, it } from 'vitest';
import { nameMatch } from '@/lib/pageMatch';

describe('sugestão do cliente pela página do Facebook', () => {
  it('acha o cliente certo pelo nome, sem acento e sem "loja"', () => {
    expect(nameMatch('Vila Serena', 'Villa Serena')).toBeGreaterThanOrEqual(0.5);
    expect(nameMatch('Rede de Postos A3P - Portal do Petróleo', 'Rede A3P')).toBeGreaterThanOrEqual(0.5);
    expect(nameMatch('Casa Lar', 'Casa Lar')).toBe(1);
    expect(nameMatch('Injecar', 'Dra Thais Alves')).toBe(0);
    expect(nameMatch('Casa Lar', 'A Casa do Produtor')).toBe(0); // "casa" sozinha não é dona da página
  });
});

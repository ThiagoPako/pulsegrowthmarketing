// Sugestão do cliente dono de uma página do Facebook pelo nome (Facebooks da equipe, 03/11/2026).

export const normalizeName = (v: string): string => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// palavras que não dizem de quem é a página (muitos clientes têm "casa", "rede", "centro"...)
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'the', 'loja', 'oficial', 'casa', 'rede', 'centro', 'grupo',
  'postos', 'posto', 'clinica', 'studio', 'estudio', 'dr', 'dra', 'espaco', 'portal', 'empresa', 'comercio']);
// "villa" = "vila", "petroleo" = "petróleo": letras dobradas não contam
const key = (w: string) => w.replace(/(.)+/g, '$1');
const words = (v: string) => [...new Set(normalizeName(v).split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map(key))];

/** Quanto o nome da página parece com o do cliente (0 a 1): nomes iguais, um contido no outro, ou palavras próprias em comum. */
export function nameMatch(page: string, client: string): number {
  const a = normalizeName(page); const b = normalizeName(client);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const wa = words(page); const wb = new Set(words(client));
  if (!wa.length || !wb.size) return 0;
  const common = wa.filter((w) => wb.has(w)).length;
  return common / Math.min(wa.length, wb.size);
}

import type { RouletteSlice } from '@/components/promo/RouletteWheel';

const MIN_SLICES = 6;

function retrySlice(index: number): RouletteSlice {
  return { id: `retry-${index}`, label: 'Tente novamente', imageUrl: null };
}

/**
 * Fatias da roleta. Sempre há fatias "Tente novamente": a derrota acontece quando a soma
 * das chances fica abaixo de 100% e também quando o estoque acaba. Antes, com 6 prêmios ou
 * mais, a roleta não tinha nenhuma e parava num prêmio para quem perdeu.
 */
export function buildWheelSlices(prizes: RouletteSlice[]): RouletteSlice[] {
  if (prizes.length < MIN_SLICES) {
    const slices = [...prizes];
    let retry = 0;
    do {
      slices.push(retrySlice(retry++));
    } while (slices.length < MIN_SLICES);
    return slices;
  }
  // Muitos prêmios: uma fatia "Tente novamente" intercalada a cada 2 (ou 3, acima de 8 prêmios).
  const every = prizes.length > 8 ? 3 : 2;
  const slices: RouletteSlice[] = [];
  let retry = 0;
  prizes.forEach((prize, index) => {
    slices.push(prize);
    if ((index + 1) % every === 0 || index === prizes.length - 1) slices.push(retrySlice(retry++));
  });
  return slices;
}

/**
 * Fatia onde a roleta para: a do prêmio sorteado ou, sem prêmio (ou com um prêmio que não
 * está na roleta), uma fatia "Tente novamente" escolhida ao acaso — nunca a primeira por padrão.
 */
export function pickWheelIndex(slices: RouletteSlice[], prizeId: string | null | undefined, random: () => number = Math.random): number {
  if (prizeId) {
    const prizeIndex = slices.findIndex((slice) => slice.id === prizeId);
    if (prizeIndex >= 0) return prizeIndex;
  }
  const retryIndexes = slices.map((slice, index) => (slice.id.startsWith('retry') ? index : -1)).filter((index) => index >= 0);
  if (!retryIndexes.length) return 0;
  return retryIndexes[Math.min(retryIndexes.length - 1, Math.floor(random() * retryIndexes.length))];
}

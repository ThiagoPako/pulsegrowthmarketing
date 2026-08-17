/**
 * Normalização de cidade no frontend + montagem da requisição de preview
 * de transferência (header `x-pulse-city` + query string `?city=`).
 * Mantido em módulo isolado para permitir testes automatizados.
 */

export const SUPPORTED_CITIES = ['minacu', 'uruacu'] as const;
export type SupportedCity = (typeof SUPPORTED_CITIES)[number];

export function normalizeCityValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toLowerCase();
  if (!v) return null;
  const stripped = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c');
  if (stripped.includes('minac')) return 'minacu';
  if (stripped.includes('uruac')) return 'uruacu';
  return stripped;
}

export interface TransferPreviewRequest {
  url: string;
  headers: Record<string, string>;
  city: string;
}

/**
 * A cidade é enviada nos dois canais (query + header) para garantir compatibilidade
 * com o backend, que prioriza o header e usa a query como fallback.
 */
export function buildTransferPreviewRequest(
  clientId: string,
  targetCity: string | null | undefined,
): TransferPreviewRequest {
  const city = normalizeCityValue(targetCity);
  if (!city) throw new Error('Selecione a cidade de destino');
  return {
    city,
    url: `/api/clients/${encodeURIComponent(clientId)}/transfer-preview?city=${encodeURIComponent(city)}`,
    headers: { 'x-pulse-city': city },
  };
}

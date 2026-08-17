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

// ─── Erros claros de validação de cidade ────────────────────────────
export const CITY_LABELS: Record<string, string> = { minacu: 'Minaçu', uruacu: 'Uruaçu' };

export interface CityErrorPayload {
  code?: string;
  message?: string;
  hint?: string;
  error?: string;
  supported?: string[];
  received?: { header?: string | null; query?: string | null };
}

export interface FriendlyCityError {
  code: string;
  title: string;
  message: string;
  hint?: string;
  details?: string;
}

const CITY_ERROR_TITLES: Record<string, string> = {
  CITY_UNRESOLVED: 'Cidade de destino não identificada',
  CITY_INVALID: 'Cidade de destino inválida',
  CITY_CONFLICT: 'Conflito de contexto de cidade',
  CITY_SAME_AS_ORIGIN: 'Cidade de destino igual à de origem',
  TRANSFER_PREVIEW_FAILED: 'Falha ao validar a transferência',
};

/** Converte a resposta de erro da API em uma mensagem legível para o usuário. */
export function describeCityError(payload: CityErrorPayload | null | undefined, status?: number): FriendlyCityError {
  const code = payload?.code || (status === 401 ? 'UNAUTHORIZED' : 'TRANSFER_PREVIEW_FAILED');
  const received = payload?.received;
  const details = received
    ? `Contexto recebido — header: ${received.header ?? '—'} | seleção: ${received.query ?? '—'}`
    : undefined;

  return {
    code,
    title: CITY_ERROR_TITLES[code] || 'Não foi possível validar a transferência',
    message:
      payload?.message ||
      payload?.error ||
      (status === 401
        ? 'Sua sessão expirou. Entre novamente para continuar.'
        : 'Erro inesperado ao validar a transferência.'),
    hint:
      payload?.hint ||
      (payload?.supported?.length
        ? `Cidades suportadas: ${payload.supported.map((c) => CITY_LABELS[c] || c).join(', ')}.`
        : undefined),
    details,
  };
}

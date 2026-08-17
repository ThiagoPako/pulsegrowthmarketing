/**
 * Resolução e normalização de cidade (multi-tenant).
 * Extraído do server.mjs para permitir testes automatizados.
 */

export const ALLOWED_CITIES = new Set(['minacu', 'uruacu']);

export function normalizeCityValue(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toLowerCase();
  if (!v) return null;
  // Normaliza acentos comuns: "Minaçu"/"Uruaçu" -> "minacu"/"uruacu"
  const stripped = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c');

  // Mapeamento explícito de segurança caso o encoding chegue corrompido
  if (stripped.includes('minac')) return 'minacu';
  if (stripped.includes('uruac')) return 'uruacu';

  return stripped;
}

export function assertValidCity(value, { field = 'city', logger = console } = {}) {
  const normalized = normalizeCityValue(value);
  // Promoções podem ter cidade nula (todas as cidades)
  if (!normalized && (value === null || value === undefined)) return null;

  if (!normalized || !ALLOWED_CITIES.has(normalized)) {
    logger?.warn?.(`[City-Validation] Valor inválido para ${field}: "${value}". Usando 'minacu' como fallback.`);
    return 'minacu';
  }
  return normalized;
}

/**
 * Resolve a cidade alvo de um preview/transferência considerando, nesta ordem:
 * 1. header `x-pulse-city`
 * 2. query string `?city=`
 * 3. fallback seguro 'minacu'
 *
 * Retorna também a fonte usada ('header' | 'query' | 'fallback') para auditoria/logs.
 */
export function resolveTransferCityDetailed({ headers = {}, query = {} } = {}, options = {}) {
  const rawHeader = headers['x-pulse-city'] ?? headers['X-Pulse-City'] ?? null;
  const rawQuery = query.city ?? null;
  const headerCity = normalizeCityValue(rawHeader);
  const queryCity = normalizeCityValue(rawQuery);

  let source = 'fallback';
  let candidate = 'minacu';
  if (headerCity && ALLOWED_CITIES.has(headerCity)) {
    source = 'header';
    candidate = headerCity;
  } else if (queryCity && ALLOWED_CITIES.has(queryCity)) {
    source = 'query';
    candidate = queryCity;
  } else if (queryCity || headerCity) {
    // Valor presente porém inválido: assertValidCity aplica o fallback seguro.
    source = 'fallback';
    candidate = queryCity || headerCity;
  }

  const city = assertValidCity(candidate, { field: 'city', ...options });
  return {
    city,
    source,
    rawHeader: rawHeader === null ? null : String(rawHeader),
    rawQuery: rawQuery === null ? null : String(rawQuery),
    headerValid: Boolean(headerCity && ALLOWED_CITIES.has(headerCity)),
    queryValid: Boolean(queryCity && ALLOWED_CITIES.has(queryCity)),
  };
}

export function resolveTransferCity(req, options = {}) {
  return resolveTransferCityDetailed(req, options).city;
}

/** Formata uma linha de log legível sobre a origem da cidade validada. */
export function formatCityResolutionLog(resolution, context = {}) {
  const { city, source, rawHeader, rawQuery } = resolution;
  const scope = context.scope || 'transfer';
  const parts = [
    `[City-Resolution] scope=${scope}`,
    context.clientId ? `client=${context.clientId}` : null,
    `city=${city}`,
    `source=${source}`,
    `header=${rawHeader ?? '-'}`,
    `query=${rawQuery ?? '-'}`,
  ].filter(Boolean);
  return parts.join(' ');
}


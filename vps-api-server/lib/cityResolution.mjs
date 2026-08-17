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
 */
export function resolveTransferCity({ headers = {}, query = {} } = {}, options = {}) {
  const headerCity = normalizeCityValue(headers['x-pulse-city'] ?? headers['X-Pulse-City']);
  const queryCity = normalizeCityValue(query.city);
  const candidate = (headerCity && ALLOWED_CITIES.has(headerCity))
    ? headerCity
    : (queryCity || headerCity || 'minacu');
  return assertValidCity(candidate, { field: 'city', ...options });
}

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

// ─── Erros claros de resolução de cidade ─────────────────────────────
export const CITY_ERROR_CODES = {
  UNRESOLVED: 'CITY_UNRESOLVED',
  INVALID: 'CITY_INVALID',
  CONFLICT: 'CITY_CONFLICT',
  SAME_CITY: 'CITY_SAME_AS_ORIGIN',
};

const CITY_LABELS = { minacu: 'Minaçu', uruacu: 'Uruaçu' };
export function cityLabel(city) {
  const normalized = normalizeCityValue(city);
  return (normalized && CITY_LABELS[normalized]) || String(city ?? '—');
}

/**
 * Diagnóstico estrito da cidade de destino: em vez de aplicar silenciosamente o
 * fallback 'minacu', devolve um erro estruturado quando a cidade não pode ser
 * resolvida com segurança (ausente, inválida ou conflitante entre header/query).
 */
export function diagnoseTransferCity({ headers = {}, query = {} } = {}) {
  const rawHeader = headers['x-pulse-city'] ?? headers['X-Pulse-City'] ?? null;
  const rawQuery = query.city ?? null;
  const headerCity = normalizeCityValue(rawHeader);
  const queryCity = normalizeCityValue(rawQuery);
  const headerValid = Boolean(headerCity && ALLOWED_CITIES.has(headerCity));
  const queryValid = Boolean(queryCity && ALLOWED_CITIES.has(queryCity));
  const supported = [...ALLOWED_CITIES];

  if (!headerCity && !queryCity) {
    return {
      ok: false,
      error: {
        code: CITY_ERROR_CODES.UNRESOLVED,
        message: 'Não foi possível identificar a cidade de destino da transferência.',
        hint: 'Selecione novamente a cidade de destino e tente outra vez. Se persistir, recarregue a página para renovar o contexto da unidade.',
        supported,
        received: { header: null, query: null },
      },
    };
  }

  if (!headerValid && !queryValid) {
    return {
      ok: false,
      error: {
        code: CITY_ERROR_CODES.INVALID,
        message: `Cidade de destino inválida: "${rawQuery ?? rawHeader}".`,
        hint: `Cidades suportadas: ${supported.map(cityLabel).join(', ')}.`,
        supported,
        received: { header: rawHeader ?? null, query: rawQuery ?? null },
      },
    };
  }

  // Conflito: header e query válidos, porém apontando para cidades diferentes.
  // A query é o destino escolhido explicitamente pelo usuário e prevalece,
  // mas o conflito é reportado para diagnóstico.
  const conflict = headerValid && queryValid && headerCity !== queryCity;
  const source = queryValid ? 'query' : 'header';
  const city = queryValid ? queryCity : headerCity;

  return {
    ok: true,
    city,
    source,
    conflict,
    rawHeader: rawHeader === null ? null : String(rawHeader),
    rawQuery: rawQuery === null ? null : String(rawQuery),
    headerValid,
    queryValid,
    warning: conflict
      ? {
          code: CITY_ERROR_CODES.CONFLICT,
          message: `Contexto divergente: header aponta para ${cityLabel(headerCity)} e a seleção para ${cityLabel(queryCity)}.`,
          hint: `A transferência usará a cidade selecionada (${cityLabel(queryCity)}).`,
          received: { header: rawHeader, query: rawQuery },
        }
      : null,
  };
}



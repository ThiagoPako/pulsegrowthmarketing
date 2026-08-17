import { describe, it, expect, vi } from 'vitest';
import { normalizeCityValue, buildTransferPreviewRequest } from '@/lib/cityScope';
import {
  normalizeCityValue as serverNormalize,
  assertValidCity,
  resolveTransferCity,
  resolveTransferCityDetailed,
  formatCityResolutionLog,
} from '../../vps-api-server/lib/cityResolution.mjs';

const silentLogger = { warn: vi.fn() };

describe('normalização de cidade (frontend)', () => {
  it('remove acentos e cedilha', () => {
    expect(normalizeCityValue('Minaçu')).toBe('minacu');
    expect(normalizeCityValue(' URUAÇU ')).toBe('uruacu');
  });

  it('retorna null para valores vazios', () => {
    expect(normalizeCityValue('')).toBeNull();
    expect(normalizeCityValue(null)).toBeNull();
    expect(normalizeCityValue(undefined)).toBeNull();
  });
});

describe('buildTransferPreviewRequest', () => {
  it('envia a cidade na query string e no header', () => {
    const req = buildTransferPreviewRequest('abc-123', 'Uruaçu');
    expect(req.city).toBe('uruacu');
    expect(req.url).toBe('/api/clients/abc-123/transfer-preview?city=uruacu');
    expect(req.headers['x-pulse-city']).toBe('uruacu');
  });

  it('codifica o id do cliente', () => {
    const req = buildTransferPreviewRequest('a/b', 'minacu');
    expect(req.url).toContain('/api/clients/a%2Fb/transfer-preview');
  });

  it('falha quando a cidade não foi selecionada', () => {
    expect(() => buildTransferPreviewRequest('abc', '')).toThrow();
  });
});

describe('normalização de cidade (VPS)', () => {
  it('é equivalente à normalização do frontend', () => {
    for (const v of ['Minaçu', 'MINACU', ' uruaçu ', 'Uruacu']) {
      expect(serverNormalize(v)).toBe(normalizeCityValue(v));
    }
  });

  it('aceita null para promoções globais', () => {
    expect(assertValidCity(null, { logger: silentLogger })).toBeNull();
  });

  it('usa minacu como fallback seguro para valores inválidos', () => {
    expect(assertValidCity('cidade-inexistente', { logger: silentLogger })).toBe('minacu');
  });
});

describe('resolveTransferCity — header vs query string', () => {
  it('prioriza o header x-pulse-city', () => {
    const city = resolveTransferCity(
      { headers: { 'x-pulse-city': 'Uruaçu' }, query: { city: 'minacu' } },
      { logger: silentLogger },
    );
    expect(city).toBe('uruacu');
  });

  it('usa a query string quando o header está ausente', () => {
    expect(
      resolveTransferCity({ headers: {}, query: { city: 'Uruaçu' } }, { logger: silentLogger }),
    ).toBe('uruacu');
  });

  it('usa a query string quando o header é inválido', () => {
    expect(
      resolveTransferCity(
        { headers: { 'x-pulse-city': 'undefined' }, query: { city: 'uruacu' } },
        { logger: silentLogger },
      ),
    ).toBe('uruacu');
  });

  it('cai para minacu quando header e query estão ausentes', () => {
    expect(resolveTransferCity({ headers: {}, query: {} }, { logger: silentLogger })).toBe('minacu');
  });

  it('aceita o header em capitalização alternativa', () => {
    expect(
      resolveTransferCity({ headers: { 'X-Pulse-City': 'Uruaçu' }, query: {} }, { logger: silentLogger }),
    ).toBe('uruacu');
  });

  it('nunca retorna cidade fora da whitelist', () => {
    const city = resolveTransferCity(
      { headers: { 'x-pulse-city': 'goiania' }, query: { city: 'anapolis' } },
      { logger: silentLogger },
    );
    expect(['minacu', 'uruacu']).toContain(city);
  });
});

describe('auditoria da fonte da cidade (logs)', () => {
  it('identifica o header como fonte', () => {
    const r = resolveTransferCityDetailed(
      { headers: { 'x-pulse-city': 'Uruaçu' }, query: { city: 'minacu' } },
      { logger: silentLogger },
    );
    expect(r).toMatchObject({ city: 'uruacu', source: 'header', headerValid: true });
  });

  it('identifica a query string como fonte quando o header falta', () => {
    const r = resolveTransferCityDetailed({ headers: {}, query: { city: 'uruacu' } }, { logger: silentLogger });
    expect(r).toMatchObject({ city: 'uruacu', source: 'query', headerValid: false, queryValid: true });
  });

  it('identifica o fallback quando ambos são inválidos ou ausentes', () => {
    const r = resolveTransferCityDetailed({ headers: {}, query: {} }, { logger: silentLogger });
    expect(r).toMatchObject({ city: 'minacu', source: 'fallback' });
  });

  it('formata a linha de log com fonte e valores brutos', () => {
    const r = resolveTransferCityDetailed(
      { headers: { 'x-pulse-city': 'Uruaçu' }, query: { city: 'Minaçu' } },
      { logger: silentLogger },
    );
    const line = formatCityResolutionLog(r, { scope: 'transfer-preview', clientId: 'abc' });
    expect(line).toContain('scope=transfer-preview');
    expect(line).toContain('client=abc');
    expect(line).toContain('city=uruacu');
    expect(line).toContain('source=header');
    expect(line).toContain('header=Uruaçu');
    expect(line).toContain('query=Minaçu');
  });
});

describe('erros claros de cidade', () => {
  it('reporta CITY_UNRESOLVED quando não há header nem query', () => {
    const r = diagnoseTransferCity({ headers: {}, query: {} });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('CITY_UNRESOLVED');
    expect(r.error.hint).toBeTruthy();
  });

  it('reporta CITY_INVALID para cidade não suportada', () => {
    const r = diagnoseTransferCity({ headers: {}, query: { city: 'goiania' } });
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('CITY_INVALID');
    expect(r.error.supported).toContain('uruacu');
  });

  it('prioriza a seleção (query) e sinaliza conflito com o header', () => {
    const r = diagnoseTransferCity({ headers: { 'x-pulse-city': 'minacu' }, query: { city: 'Uruaçu' } });
    expect(r.ok).toBe(true);
    expect(r.city).toBe('uruacu');
    expect(r.conflict).toBe(true);
    expect(r.warning.code).toBe('CITY_CONFLICT');
  });

  it('não sinaliza conflito quando header e query concordam', () => {
    const r = diagnoseTransferCity({ headers: { 'x-pulse-city': 'uruacu' }, query: { city: 'Uruaçu' } });
    expect(r.ok).toBe(true);
    expect(r.conflict).toBe(false);
    expect(r.warning).toBeNull();
  });

  it('describeCityError traduz payload da API', () => {
    const f = describeCityError({ code: 'CITY_INVALID', message: 'Cidade inválida', received: { header: 'x', query: null } }, 400);
    expect(f.title).toBe('Cidade de destino inválida');
    expect(f.details).toContain('header: x');
  });

  it('describeCityError trata sessão expirada', () => {
    const f = describeCityError(null, 401);
    expect(f.code).toBe('UNAUTHORIZED');
    expect(f.message).toMatch(/sessão/i);
  });
});

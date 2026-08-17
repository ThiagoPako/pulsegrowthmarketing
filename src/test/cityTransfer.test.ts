import { describe, it, expect, vi } from 'vitest';
import { normalizeCityValue, buildTransferPreviewRequest } from '@/lib/cityScope';
import {
  normalizeCityValue as serverNormalize,
  assertValidCity,
  resolveTransferCity,
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

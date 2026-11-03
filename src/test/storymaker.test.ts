import { describe, expect, it } from 'vitest';
import { clampHours, cleanGuests, cleanPhone, codeOk, pickNetworks, tokenOk } from '../../vps-api-server/lib/storymaker.mjs';
import { loginReturnPath } from '@/lib/loginReturn';

describe('storymaker de evento', () => {
  it('aceita só token e código no formato do link', () => {
    expect(tokenOk('AbCdEfGhIjKlMnOpQrStUvWx')).toBe(true);
    expect(tokenOk('../../etc/passwd')).toBe(false);
    expect(codeOk('aB3_x-9kLmNoPq')).toBe(true);
    expect(codeOk("' OR 1=1")).toBe(false);
  });

  it('o link vale de 1 a 72 horas (12 sem escolha)', () => {
    expect(clampHours(undefined)).toBe(12);
    expect(clampHours(0.2)).toBe(1);
    expect(clampHours(500)).toBe(72);
    expect(clampHours('24')).toBe(24);
  });

  it('story só sai nas redes de story que o cliente tem conectadas', () => {
    expect(pickNetworks(['instagram', 'facebook', 'tiktok'], ['instagram', 'tiktok'])).toEqual(['instagram']);
    expect(pickNetworks(['facebook'], ['instagram'])).toEqual([]);
    expect(pickNetworks(null, ['instagram'])).toEqual([]);
  });

  it('convidados: nome obrigatório, WhatsApp com DDI e sem repetir', () => {
    expect(cleanPhone('(62) 98538-2981')).toBe('5562985382981');
    expect(cleanPhone('')).toBeNull();
    expect(cleanGuests([{ name: 'Ana', phone: '62 99999-0000' }, { name: 'ana', phone: '62999990000' }, { name: ' ', phone: '1' }, { name: 'Lucas' }]))
      .toEqual([{ name: 'Ana', phone: '5562999990000' }, { name: 'Lucas', phone: null }]);
  });

  it('depois do login volta só para a página do storymaker', () => {
    expect(loginReturnPath('?volta=%2Fstory%2FAbCdEfGhIjKlMnOpQrStUvWx')).toBe('/story/AbCdEfGhIjKlMnOpQrStUvWx');
    expect(loginReturnPath('?volta=https%3A%2F%2Fmal.com')).toBeNull();
    expect(loginReturnPath('?volta=%2Fadmin')).toBeNull();
    expect(loginReturnPath('')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  normalizeAccountInput, accountStatus, publicAccount, overlayConfig, encryptSecret, decryptSecret, secretKey, last4,
} from '../../vps-api-server/lib/paymentAccounts.mjs';

const conta = {
  city: 'uruacu', infinitepay_handle: 'agenciapulse', pix_key: 'financeiro@agenciapulse.com.br', receiver_name: 'Agência Pulse',
  document: '00.000.000/0001-00', bank: 'InfinitePay', active: true, api_key_enc: 'v1:x:y:z', api_key_last4: 'a1b2',
  last_test_ok: true, last_test_at: '2026-11-01T20:00:00Z', updated_at: '2026-11-01T19:00:00Z',
};

describe('Pagamentos · InfinitePay: conta de cada cidade', () => {
  it('limpa o que vem da tela: tag sem $ nem espaço, só os campos enviados', () => {
    expect(normalizeAccountInput({ infinitepay_handle: ' $agencia pulse ', active: 0 })).toEqual({ infinitepay_handle: 'agenciapulse', active: false });
    expect(normalizeAccountInput({ pix_key: '  ' })).toEqual({ pix_key: null });
    expect(normalizeAccountInput({})).toEqual({});
  });

  it('status: não configurado, falta testar, conectado, com erro, desativado', () => {
    expect(accountStatus(null)).toBe('nao_configurado');
    expect(accountStatus({ infinitepay_handle: null, pix_key: null })).toBe('nao_configurado');
    expect(accountStatus({ pix_key: 'x', active: true, last_test_ok: null })).toBe('testar');
    expect(accountStatus(conta)).toBe('conectado');
    expect(accountStatus({ ...conta, last_test_ok: false })).toBe('com_erro');
    expect(accountStatus({ ...conta, active: false })).toBe('desativado');
  });

  it('a tela nunca recebe o segredo, só se existe e os 4 últimos caracteres', () => {
    const p = publicAccount(conta, 'uruacu');
    expect(JSON.stringify(p)).not.toContain('v1:x:y:z');
    expect(p).toMatchObject({ has_api_key: true, api_key_last4: 'a1b2', label: 'Uruaçu', status: 'conectado' });
    expect(publicAccount(null, 'minacu')).toMatchObject({ city: 'minacu', status: 'nao_configurado', has_api_key: false, active: true });
  });

  it('a conta manda: vai por cima da Config; desativada, sem Pix nem tag; sem conta, a Config como está', () => {
    const antiga = { id: 1, city: 'minacu', pix_key: 'antiga', infinitepay_handle: 'velha', msg_isis_cobranca: 'texto', isis_mode: 'ativo' };
    const o = overlayConfig(antiga, conta, 'uruacu');
    expect(o).toMatchObject({ id: 1, city: 'uruacu', pix_key: conta.pix_key, infinitepay_handle: 'agenciapulse', receiver_name: 'Agência Pulse', msg_isis_cobranca: 'texto', isis_mode: 'ativo' });
    expect(overlayConfig(antiga, { ...conta, active: false }, 'uruacu')).toMatchObject({ pix_key: null, infinitepay_handle: null, payment_account_active: false });
    expect(overlayConfig(antiga, null, 'uruacu')).toBe(antiga);
  });

  it('segredo cifrado (AES-256-GCM): volta igual com a chave certa; adulterado ou outra chave falha', () => {
    const key = secretKey({ JWT_SECRET: 'teste' });
    const enc = encryptSecret('meu-secret-1234', key);
    expect(enc).not.toContain('meu-secret');
    expect(decryptSecret(enc, key)).toBe('meu-secret-1234');
    expect(encryptSecret('meu-secret-1234', key)).not.toBe(enc); // iv novo a cada vez
    const [v, iv, tag, data] = enc.split(':');
    expect(() => decryptSecret([v, iv, tag, Buffer.from('x' + data).toString('base64')].join(':'), key)).toThrow();
    expect(() => decryptSecret(enc, secretKey({ JWT_SECRET: 'outra' }))).toThrow();
    expect(secretKey({ PAYMENT_SECRET_KEY: 'k', JWT_SECRET: 'j' })).not.toEqual(secretKey({ JWT_SECRET: 'j' }));
    expect(last4('abcdef1234')).toBe('1234');
  });
});

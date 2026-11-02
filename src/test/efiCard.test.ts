import { describe, expect, it, vi } from 'vitest';
import {
  chargePaid, customIdFor, expireAtFor, linkBody, paidEvents, createEfiCobrancasClient,
} from '../../vps-api-server/lib/efiCobrancas.mjs';
import { efiCardOn, efiCardReady, efiKey, overlayConfig, encryptSecret } from '../../vps-api-server/lib/paymentAccounts.mjs';
import { registerEfiCardRoutes } from '../../vps-api-server/efiCardRoutes.mjs';

describe('Efí · cartão pelo link de pagamento', () => {
  it('link só no cartão, valor em centavos com a taxa, custom_id e notification_url', () => {
    const body = linkBody({ description: 'Mensalidade Agência Pulse 11/2026 - Clínica São José', cardAmount: 1565.76, customId: 'pulse-202611-c1-156576', notificationUrl: 'https://x/n', expireAt: '2026-12-10', message: 'Mensalidade 11/2026' });
    expect(body.items).toEqual([{ name: 'Mensalidade Agencia Pulse 11/2026 - Clinica Sao Jose', value: 156576, amount: 1 }]);
    expect(body.metadata).toEqual({ custom_id: 'pulse-202611-c1-156576', notification_url: 'https://x/n' });
    expect(body.settings).toMatchObject({ payment_method: 'credit_card', expire_at: '2026-12-10', request_delivery_address: false });
  });

  it('custom_id: o mesmo para o mesmo contrato, mês e valor no cartão; valor novo, link novo', () => {
    const a = customIdFor({ contractId: 'c1', month: '2026-11', cardAmount: 1565.76 });
    expect(a).toBe('pulse-202611-c1-156576');
    expect(customIdFor({ contractId: 'c1', month: '2026-11', cardAmount: 1600 })).not.toBe(a);
  });

  it('vence 30 dias depois do vencimento, nunca antes de amanhã', () => {
    const now = new Date('2026-11-02T12:00:00-03:00');
    expect(expireAtFor('2026-11-10', { now })).toBe('2026-12-10');
    expect(expireAtFor('2026-09-01', { now })).toBe('2026-11-03');
  });

  it('pago = paid ou settled; a notificação devolve só os eventos de pagamento, em reais', () => {
    expect(chargePaid('paid')).toBe(true);
    expect(chargePaid('settled')).toBe(true);
    expect(chargePaid('approved')).toBe(false);
    expect(chargePaid('link')).toBe(false);
    const ev = paidEvents({ code: 200, data: [
      { id: 1, type: 'charge', identifiers: { charge_id: 24342333 }, status: { current: 'link', previous: 'new' } },
      { id: 2, type: 'charge', identifiers: { charge_id: 24342333 }, custom_id: 'pulse-x', status: { current: 'paid', previous: 'link' }, value: 6990, received_by_bank_at: '2026-11-03' },
    ] });
    expect(ev).toEqual([{ chargeId: '24342333', customId: 'pulse-x', status: 'paid', value: 69.9, at: '2026-11-03' }]);
  });

  it('cliente: token Basic em /v1/authorize e Bearer no link', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith('/v1/authorize') ? { access_token: 'tk', expires_in: 600 } : { code: 200, data: { charge_id: 9, payment_url: 'https://pagamento.efipay.com.br/x', status: 'link' } };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
    });
    const c = createEfiCobrancasClient({ clientId: 'Client_Id_1', clientSecret: 'Client_Secret_1', env: 'homologacao', fetchImpl });
    const r = await c.createLink({ items: [] });
    expect(r.payment_url).toBe('https://pagamento.efipay.com.br/x');
    expect(calls[0].url).toBe('https://cobrancas-h.api.efipay.com.br/v1/authorize');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('Client_Id_1:Client_Secret_1').toString('base64')}`);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer tk');
  });
});

describe('Pagamentos · só a Efí', () => {
  const acc = { city: 'minacu', active: true, infinitepay_handle: 'velha', pix_key: 'chave-antiga', efi_pix_key: 'pix@efi.com', efi_client_id_enc: 'x', efi_client_secret_enc: 'y' };

  it('a InfiniteTag não chega mais à cobrança e a chave Pix é a da Efí', () => {
    const cfg = overlayConfig({ id: 1 }, acc, 'minacu');
    expect(cfg.infinitepay_handle).toBeNull();
    expect(cfg.pix_key).toBe('pix@efi.com');
    expect(efiKey({ pix_key: 'só-a-geral' })).toBe('só-a-geral');
  });

  it('cartão só liga depois do teste da API Cobranças', () => {
    expect(efiCardReady(acc)).toBe(false);
    expect(efiCardReady({ ...acc, efi_card_test_ok: true })).toBe(true);
    expect(efiCardOn({ ...acc, efi_card_test_ok: true, efi_card_active: true })).toBe(true);
    expect(efiCardOn({ ...acc, efi_card_test_ok: true, efi_card_active: true, active: false })).toBe(false);
  });
});

describe('Efí · cartão na cobrança', () => {
  it('cria o link no valor com a taxa e reaproveita o mesmo enquanto aberto', async () => {
    const links: Record<string, unknown>[] = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('FROM efi_card_links WHERE custom_id')) return { rows: links.filter((l) => l.custom_id === params[0]) };
        if (sql.startsWith('INSERT INTO efi_card_links')) { links.push({ custom_id: params[3], url: params[10], card_amount: params[9], status: 'link' }); return { rows: [] }; }
        return { rows: [] };
      }),
    };
    const createLink = vi.fn(async () => ({ charge_id: 77, payment_url: 'https://pagamento.efipay.com.br/abc', status: 'link' }));
    const account = {
      city: 'minacu', active: true, efi_env: 'homologacao', efi_card_active: true, efi_card_test_ok: true, efi_card_secret: 's3cr3t',
      efi_client_id_enc: encryptSecret('Client_Id_1'), efi_client_secret_enc: encryptSecret('Client_Secret_1'), updated_at: 't1',
    };
    const app = { get: vi.fn(), post: vi.fn(), put: vi.fn() };
    const card = registerEfiCardRoutes(app, {
      pool, verifyAdmin: vi.fn(), accountFor: async () => account, ensureAccountsSchema: async () => {}, markRevenuePaid: vi.fn(),
      paymentConfigFor: async () => ({ card_fee_percent: 4.2 }), publicApiUrl: 'https://agenciapulse.tech',
      makeClient: () => ({ authorize: vi.fn(), createLink, getCharge: vi.fn(), getNotification: vi.fn() }),
      sweepEvery: 0, logger: { error: vi.fn(), log: vi.fn() }, now: () => new Date('2026-11-02T12:00:00-03:00'),
    });
    const contract = { id: 'c1', client_id: 'cl1', company_name: 'Clínica', client_city: 'minacu' };
    const a = await card.paymentLink({ contract, revenue: { id: 'r1' }, amount: 1500, month: '2026-11', dueDate: '2026-11-10' });
    expect(a).toEqual({ url: 'https://pagamento.efipay.com.br/abc', cardAmount: 1565.76 });
    const body = createLink.mock.calls[0][0];
    expect(body.items[0].value).toBe(156576);
    expect(body.metadata.notification_url).toBe('https://agenciapulse.tech/api/webhooks/efi-cobranca/minacu?hmac=s3cr3t');
    const b = await card.paymentLink({ contract, revenue: { id: 'r1' }, amount: 1500, month: '2026-11', dueDate: '2026-11-10' });
    expect(b?.url).toBe(a?.url);
    expect(createLink).toHaveBeenCalledTimes(1);
  });
});

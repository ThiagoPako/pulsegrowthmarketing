import { describe, expect, it, vi } from 'vitest';
import { createCheckoutLink, isCheckoutApiKey, linkPayload, validUntilFor } from '../../vps-api-server/lib/infinitePay.mjs';
import {
  accountApiKey, checkApiKeyInput, encryptSecret, secretKey,
} from '../../vps-api-server/lib/paymentAccounts.mjs';
import { registerInfinitePayRoutes } from '../../vps-api-server/infinitePayRoutes.mjs';

const KEY = 'inchk_teste1234abcd';
type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

/** fetch falso: guarda as chamadas e responde com a função dada. */
function fakeFetch(reply: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const call = { url, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(call);
    const r = reply(call);
    return { ok: (r.status || 200) < 400, status: r.status || 200, text: async () => JSON.stringify(r.body) };
  });
  return { fn, calls };
}

describe('Checkout InfinitePay: API Key opcional (inchk_)', () => {
  it('só aceita API Key que começa com inchk_ (client secret ou senha são recusados)', () => {
    expect(isCheckoutApiKey(KEY)).toBe(true);
    expect(isCheckoutApiKey('  ' + KEY + ' ')).toBe(true);
    expect(isCheckoutApiKey('cs_live_abc123456')).toBe(false);
    expect(isCheckoutApiKey('inchk_')).toBe(false);
    expect(() => checkApiKeyInput('segredo')).toThrow(/inchk_/);
    expect(checkApiKeyInput(` ${KEY} `)).toBe(KEY);
  });

  it('valid_until: fim do dia do vencimento + 10 dias, em Brasília; vencida conta de hoje; no máximo ~1 ano', () => {
    const now = new Date('2026-11-02T15:00:00Z');
    expect(validUntilFor('2026-11-10', { now })).toBe('2026-11-20T23:59:59-03:00');
    expect(validUntilFor('2026-10-05', { now })).toBe('2026-11-12T23:59:59-03:00');
    expect(validUntilFor(null, { now, graceDays: 1 })).toBe('2026-11-03T23:59:59-03:00');
    expect(validUntilFor('2028-01-01', { now })).toBe('2027-10-28T23:59:59-03:00');
  });

  it('sem API Key: link básico, sem X-Api-Key e sem options', async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { url: 'https://checkout.infinitepay.io/pulse/abc' } }));
    const link = await createCheckoutLink({ handle: 'agenciapulse', amount: 500, orderNsu: 'pulse-1-2026-11', options: { single_payment: true } }, fn);
    expect(link.url).toContain('checkout.infinitepay.io');
    expect(calls[0].headers['X-Api-Key']).toBeUndefined();
    expect(calls[0].body.options).toBeUndefined();
    expect(calls[0].body).toMatchObject({ handle: 'agenciapulse', order_nsu: 'pulse-1-2026-11', items: [{ quantity: 1, price: 50000 }] });
  });

  it('com API Key: X-Api-Key no header e options (valid_until, single_payment) no corpo', async () => {
    const { fn, calls } = fakeFetch(() => ({ body: { url: 'https://checkout.infinitepay.io/pulse/abc' } }));
    const options = { single_payment: true, valid_until: '2026-11-20T23:59:59-03:00' };
    const link = await createCheckoutLink({ handle: 'agenciapulse', amount: 500, orderNsu: 'n', apiKey: KEY, options }, fn);
    expect(link.withApiKey).toBe(true);
    expect(calls[0].headers['X-Api-Key']).toBe(KEY);
    expect(calls[0].body.options).toEqual(options);
    expect(linkPayload({ handle: 'x', amount: 1, orderNsu: 'n', options: {} })).not.toHaveProperty('options');
  });

  it('key recusada na cobrança: sai o link básico (com o erro anotado); no teste de conexão, o erro aparece', async () => {
    const reply = (c: Call) => (c.headers['X-Api-Key'] ? { status: 403, body: { message: 'forbidden' } } : { body: { url: 'https://checkout.infinitepay.io/p/b' } });
    const a = fakeFetch(reply);
    const link = await createCheckoutLink({ handle: 'agenciapulse', amount: 5, orderNsu: 'n', apiKey: KEY, options: { single_payment: true } }, a.fn);
    expect(link).toMatchObject({ withApiKey: false, url: 'https://checkout.infinitepay.io/p/b' });
    expect(link.apiKeyError).toMatch(/403/);
    expect(a.calls).toHaveLength(2);
    const b = fakeFetch(reply);
    await expect(createCheckoutLink({ handle: 'agenciapulse', amount: 5, orderNsu: 'n', apiKey: KEY, options: {}, fallback: false }, b.fn))
      .rejects.toMatchObject({ status: 403 });
  });

  it('a key fica cifrada; conta desativada ou key ilegível não manda key nenhuma', () => {
    const k = secretKey({ JWT_SECRET: 'teste' });
    const acc = { active: true, api_key_enc: encryptSecret(KEY, k) };
    expect(acc.api_key_enc).not.toContain('inchk_');
    expect(accountApiKey(acc, k)).toBe(KEY);
    expect(accountApiKey({ ...acc, active: false }, k)).toBeNull();
    expect(accountApiKey(acc, secretKey({ JWT_SECRET: 'outra' }))).toBeNull();
    expect(accountApiKey(null, k)).toBeNull();
  });
});

describe('Webhook da InfinitePay (não é assinado): só vale depois do payment_check com paid: true', () => {
  async function runWebhook(check: Record<string, unknown>) {
    const handlers: Record<string, (req: unknown, res: unknown) => Promise<void>> = {};
    const app = { get: () => {}, post: (path: string, h: never) => { handlers[path] = h; } };
    const queries: string[] = [];
    const pool = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (/FROM payment_links WHERE order_nsu/.test(sql)) {
          return { rows: [{ id: 'l1', order_nsu: 'pulse-r1-2026-11', handle: 'agenciapulse', status: 'aberto', revenue_id: 'r1', slug: 's' }] };
        }
        if (/FROM revenues r/.test(sql)) return { rows: [{ id: 'r1', status: 'pendente', amount: 500 }] };
        return { rows: [] };
      }),
    };
    const { fn, calls } = fakeFetch(() => ({ body: check }));
    registerInfinitePayRoutes(app as never, {
      pool, verifyAdmin: async () => ({}), paymentConfigFor: async () => ({ infinitepay_handle: 'agenciapulse' }),
      publicApiUrl: 'https://x', tableHasCityColumn: async () => false, fetchImpl: fn, logger: { error: () => {}, log: () => {} },
    });
    const res = { status: () => res, json: () => res };
    // o webhook pode chegar com qualquer coisa (inclusive "paid": true forjado); só o payment_check decide
    await handlers['/api/webhooks/infinitepay']({ body: { order_nsu: 'pulse-r1-2026-11', paid: true, transaction_nsu: 't1' } }, res);
    await new Promise((r) => setTimeout(r, 20));
    return { calls, revenuePaid: queries.some((q) => /UPDATE revenues SET status = 'recebida'/.test(q)) };
  }

  it('payment_check com paid: false → a receita não é baixada', async () => {
    const r = await runWebhook({ success: true, paid: false });
    expect(r.calls.map((c) => c.url)).toEqual(['https://api.checkout.infinitepay.io/payment_check']);
    expect(r.calls[0].body).toMatchObject({ handle: 'agenciapulse', order_nsu: 'pulse-r1-2026-11', transaction_nsu: 't1' });
    expect(r.revenuePaid).toBe(false);
  });

  it('payment_check com paid: true → a receita é baixada', async () => {
    const r = await runWebhook({ success: true, paid: true, paid_amount: 50000, capture_method: 'pix' });
    expect(r.revenuePaid).toBe(true);
  });
});

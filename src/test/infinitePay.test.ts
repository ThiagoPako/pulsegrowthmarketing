import { describe, expect, it, vi } from 'vitest';
import {
  normalizeHandle, orderNsuFor, linkPayload, extractLinkUrl, readWebhook, isPaidCheck, createCheckoutLink, checkPayment, INFINITEPAY_BASE,
} from '../../vps-api-server/lib/infinitePay.mjs';

const fakeFetch = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('InfinitePay', () => {
  it('monta o link em centavos com a InfiniteTag sem $', () => {
    expect(normalizeHandle(' $agencia pulse ')).toBe('agenciapulse');
    expect(orderNsuFor({ revenueId: 'r1', contractId: 'k1', month: '2026-11' })).toBe('pulse-r1-2026-11');
    expect(orderNsuFor({ revenueId: null, contractId: 'k1', month: '2026-11' })).toBe('pulse-ck1-2026-11');
    expect(linkPayload({ handle: '$agenciapulse', amount: 1565.76, description: 'Mensalidade', orderNsu: 'pulse-r1-2026-11', webhookUrl: 'https://x/api/webhooks/infinitepay' }))
      .toEqual({ handle: 'agenciapulse', items: [{ quantity: 1, price: 156576, description: 'Mensalidade' }], order_nsu: 'pulse-r1-2026-11', webhook_url: 'https://x/api/webhooks/infinitepay' });
    expect(() => linkPayload({ handle: '', amount: 10, orderNsu: 'x' })).toThrow(/InfiniteTag/);
    expect(() => linkPayload({ handle: 'a', amount: 0.5, orderNsu: 'x' })).toThrow(/R\$ 1,00/);
  });

  it('acha a URL na resposta com os nomes prováveis', () => {
    expect(extractLinkUrl({ url: 'https://checkout.infinitepay.io/agenciapulse/abc' })).toBe('https://checkout.infinitepay.io/agenciapulse/abc');
    expect(extractLinkUrl({ data: { checkout_url: 'https://pay/x' } })).toBe('https://pay/x');
    expect(extractLinkUrl({ link: 'sem-http' })).toBeNull();
  });

  it('cria o link pela API e recusa resposta sem URL', async () => {
    const ok = fakeFetch({ url: 'https://checkout.infinitepay.io/agenciapulse/abc' });
    const link = await createCheckoutLink({ handle: 'agenciapulse', amount: 10, orderNsu: 'o1' }, ok);
    expect(ok).toHaveBeenCalledWith(`${INFINITEPAY_BASE}/links`, expect.objectContaining({ method: 'POST' }));
    expect(link.url).toBe('https://checkout.infinitepay.io/agenciapulse/abc');
    expect(link.slug).toBe('abc');
    await expect(createCheckoutLink({ handle: 'a', amount: 10, orderNsu: 'o1' }, fakeFetch({}))).rejects.toThrow(/URL do link/);
    await expect(createCheckoutLink({ handle: 'a', amount: 10, orderNsu: 'o1' }, fakeFetch({ message: 'handle inválido' }, 422))).rejects.toThrow(/422: handle inválido/);
  });

  it('webhook só vale depois do payment_check pago', async () => {
    expect(readWebhook({ order_nsu: 'o1', invoice_slug: 's1', transaction_nsu: 't1', capture_method: 'pix' }))
      .toMatchObject({ orderNsu: 'o1', slug: 's1', transactionNsu: 't1', captureMethod: 'pix' });
    expect(isPaidCheck({ success: true, paid: true })).toBe(true);
    expect(isPaidCheck({ success: true, paid: false })).toBe(false);
    expect(isPaidCheck({ success: false, paid: true })).toBe(false);
    const f = fakeFetch({ success: true, paid: true });
    await checkPayment({ handle: '$agenciapulse', orderNsu: 'o1', slug: 's1' }, f);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ handle: 'agenciapulse', order_nsu: 'o1', slug: 's1' });
  });
});

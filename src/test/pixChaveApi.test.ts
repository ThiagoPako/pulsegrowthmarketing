import { describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../../vps-api-server/lib/paymentAccounts.mjs';
import { staticTxid, parseE2E } from '../../vps-api-server/lib/pixReceipt.mjs';
import { registerEfiPixRoutes } from '../../vps-api-server/efiPixRoutes.mjs';

// Pix pela chave conferido na API da Efí (usuário, 02/11/2026): sem cobrança da Efí, o sistema lê o Pix que caiu na
// conta e dá baixa quando ele casa com a mensalidade (txid do copia e cola, ID do comprovante ou valor no "Já paguei").
describe('Pix pela chave · conferido na API da Efí', () => {
  const CONTRACT = '3f2a9c1e-77aa-4b1c-9d00-0000aaaa1111';
  const page = { token: 'tok_0123456789abcdef', contract_id: CONTRACT, month: '2026-11', city: 'minacu', amount: '1500', revenue_id: 'rev1' };

  function setup({ efiActive = false, pix = [] as Record<string, unknown>[], receipts = [] as Record<string, unknown>[], openPages = [] as Record<string, unknown>[] } = {}) {
    const acc = {
      city: 'minacu', active: true, efi_active: efiActive, efi_env: 'producao', efi_pix_key: 'contato@agenciapulse.tech', updated_at: 't1',
      efi_client_id_enc: encryptSecret('Client_Id_abc'), efi_client_secret_enc: encryptSecret('Client_Secret_xyz'),
      efi_cert_enc: encryptSecret(Buffer.from('p12').toString('base64')), efi_last_test_ok: true,
    };
    const received = new Map<string, { status: string; revenue_id: unknown }>();
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/FROM efi_charges WHERE txid/.test(sql)) return { rows: [] };
        if (/INSERT INTO efi_pix_received/.test(sql)) {
          if (!received.has(params[0] as string)) received.set(params[0] as string, { status: params[8] as string, revenue_id: params[9] });
          return { rows: [] };
        }
        if (/SELECT status FROM efi_pix_received WHERE e2e_id/.test(sql)) return { rows: received.has(params[0] as string) ? [received.get(params[0] as string)] : [] };
        if (/FROM billing_pay_pages WHERE month/.test(sql)) return { rows: [page] };
        if (/FROM billing_pay_pages b\s+JOIN revenues/.test(sql)) return { rows: openPages };
        if (/FROM pix_receipts p JOIN billing_pay_pages/.test(sql)) {
          return { rows: receipts.some((r) => String(r.e2e).toUpperCase() === String(params[0]).toUpperCase()) ? [page] : [] };
        }
        if (/UPDATE efi_pix_received SET status = 'conciliado'/.test(sql)) {
          const r = received.get(params[0] as string);
          if (!r || r.status !== 'conferir') return { rowCount: 0, rows: [] };
          Object.assign(r, { status: 'conciliado', revenue_id: params[1] });
          return { rowCount: 1, rows: [] };
        }
        if (/SELECT e2e_id FROM efi_pix_received WHERE e2e_id = ANY/.test(sql)) {
          return { rows: (params[0] as string[]).filter((e) => received.get(e)?.status === 'conferir').map((e2e_id) => ({ e2e_id })) };
        }
        if (/SELECT status FROM revenues/.test(sql)) return { rows: [{ status: received.size && [...received.values()].some((r) => r.status === 'conciliado') ? 'recebida' : 'pendente' }] };
        return { rows: [], rowCount: 0 };
      }),
    };
    const fake = {
      listPix: vi.fn(async () => pix),
      getPix: vi.fn(async (e2e: string) => {
        const p = pix.find((x) => x.endToEndId === e2e);
        if (!p) throw Object.assign(new Error('Efí 404'), { status: 404 });
        return p;
      }),
      saldo: vi.fn(async () => ({ saldo: '0' })),
    };
    const markRevenuePaid = vi.fn(async () => true);
    const routes = registerEfiPixRoutes({ get: () => {}, put: () => {}, post: () => {} } as never, {
      pool, verifyAdmin: async () => ({}), accountFor: async (city: string) => (city === 'minacu' ? acc : null), ensureAccountsSchema: async () => {}, markRevenuePaid,
      publicApiUrl: 'https://agenciapulse.tech', makeClient: () => fake as never, sweepEvery: 0, logger: { error: () => {}, log: () => {} },
      now: () => new Date('2026-11-02T15:00:00-03:00'),
    });
    return { routes, fake, received, markRevenuePaid };
  }

  it('varredura com a cobrança da Efí desligada: o Pix com o txid do copia e cola dá baixa na mensalidade certa', async () => {
    const txid = staticTxid(CONTRACT, '2026-11');
    const { routes, markRevenuePaid, received } = setup({ pix: [{ endToEndId: 'E18236120202611021745aaaaaaaaaaa', txid, valor: '1500.00', horario: '2026-11-02T17:45:00Z' }] });
    const out = await routes.sweep();
    expect(out.minacu).toMatchObject({ pix: 1, pagos: 1 });
    expect(markRevenuePaid).toHaveBeenCalledWith('rev1');
    expect(received.get('E18236120202611021745aaaaaaaaaaa')?.status).toBe('conciliado');
  });

  it('valor diferente do da mensalidade não dá baixa (fica para conferir)', async () => {
    const txid = staticTxid(CONTRACT, '2026-11');
    const { routes, markRevenuePaid } = setup({ pix: [{ endToEndId: 'E18236120202611021745bbbbbbbbbbb', txid, valor: '150.00' }] });
    await routes.sweep();
    expect(markRevenuePaid).not.toHaveBeenCalled();
  });

  it('comprovante enviado: acha o Pix pelo ID na conta (maiúsculas e minúsculas do ID preservadas) e dá baixa na hora', async () => {
    const e2e = 'E18236120202611021745s0123ABC456';
    expect(parseE2E(e2e)?.id).toBe(e2e);
    const { routes, fake, markRevenuePaid } = setup({ pix: [{ endToEndId: e2e, valor: '1500.00' }], receipts: [{ e2e }] });
    const r = await routes.checkReceiptOnBank({ city: 'minacu', e2e });
    expect(fake.getPix).toHaveBeenCalledWith(e2e);
    expect(r).toMatchObject({ found: true, paid: true });
    expect(markRevenuePaid).toHaveBeenCalledWith('rev1');
  });

  it('comprovante cujo Pix não caiu na conta: não dá baixa', async () => {
    const { routes, markRevenuePaid } = setup({ pix: [] });
    const r = await routes.checkReceiptOnBank({ city: 'minacu', e2e: 'E18236120202611021745zzzzzzzzzzz' });
    expect(r).toMatchObject({ checked: true, found: false });
    expect(markRevenuePaid).not.toHaveBeenCalled();
  });

  it('"Já paguei" sem txid: aceita pelo valor só quando há um Pix solto com esse valor nas últimas 3 h', async () => {
    const one = setup({ pix: [{ endToEndId: 'E00000000202611021740ccccccccccc', valor: '1500.00' }, { endToEndId: 'E00000000202611021741ddddddddddd', valor: '80.00' }] });
    expect(await one.routes.checkPagePaid(page)).toMatchObject({ paid: true });
    expect(one.markRevenuePaid).toHaveBeenCalledWith('rev1');

    const two = setup({ pix: [{ endToEndId: 'E00000000202611021740eeeeeeeeeee', valor: '1500.00' }, { endToEndId: 'E00000000202611021742fffffffffff', valor: '1500.00' }] });
    expect(await two.routes.checkPagePaid(page)).toMatchObject({ paid: false, ambiguous: true });
    expect(two.markRevenuePaid).not.toHaveBeenCalled();
  });

  it('Pix sem código: dá baixa sozinho só quando o valor e o nome de quem pagou batem com um cliente', async () => {
    const pages = [
      { ...page, client_name: 'Clínica Sorriso', responsible_person: 'Maria Souza' },
      { ...page, token: 'tok_outro_000000000', revenue_id: 'rev2', client_name: 'Auto Peças Brasil', responsible_person: 'João Lima' },
    ];
    const ok = setup({ openPages: pages, pix: [{ endToEndId: 'E00000000202611021500ggggggggggg', valor: '1500.00', pagador: { nome: 'MARIA SOUZA' } }] });
    await ok.routes.sweep();
    expect(ok.markRevenuePaid).toHaveBeenCalledWith('rev1');

    const nobody = setup({ openPages: pages, pix: [{ endToEndId: 'E00000000202611021500hhhhhhhhhhh', valor: '1500.00', pagador: { nome: 'Fulano de Tal' } }] });
    await nobody.routes.sweep();
    expect(nobody.markRevenuePaid).not.toHaveBeenCalled();

    // um cliente só com o valor, mas o nome não bate: não dá baixa (não pode errar cobrança)
    const single = setup({ openPages: [pages[1]], pix: [{ endToEndId: 'E00000000202611021500iiiiiiiiiii', valor: '1500.00', pagador: { nome: 'Maria Souza' } }] });
    await single.routes.sweep();
    expect(single.markRevenuePaid).not.toHaveBeenCalled();
  });
});

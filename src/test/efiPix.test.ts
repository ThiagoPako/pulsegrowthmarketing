import { describe, expect, it, vi } from 'vitest';
import {
  createEfiClient, txidFor, isTxid, expiracaoFor, cobBody, cobPaid, readEfiWebhook, webhookUrlFor, checkCertificate, sameSecret,
} from '../../vps-api-server/lib/efi.mjs';
import { encryptSecret, overlayConfig, publicAccount, efiStatus } from '../../vps-api-server/lib/paymentAccounts.mjs';
import { registerEfiPixRoutes } from '../../vps-api-server/efiPixRoutes.mjs';

type Req = { method: string; url: string; headers: Record<string, string>; body?: string };

/** Efí falsa (homologação): responde pelo método + caminho. */
function fakeEfi(routes: Record<string, (req: Req) => { status?: number; body: unknown }>) {
  const calls: Req[] = [];
  const request = vi.fn(async (req: Req) => {
    calls.push(req);
    const path = req.url.replace('https://pix-h.api.efipay.com.br', '').split('?')[0];
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(' ');
      return m === req.method && new RegExp(`^${p.replace(/:\w+/g, '[^/]+')}$`).test(path);
    });
    const r = key ? routes[key](req) : { status: 404, body: { nome: 'nao_encontrado', mensagem: path } };
    return { status: r.status || 200, text: JSON.stringify(r.body) };
  });
  return { request, calls };
}
const TOKEN = { 'POST /oauth/token': () => ({ body: { access_token: 'tok1', token_type: 'Bearer', expires_in: 3600, scope: 'cob.write cob.read pix.read webhook.write webhook.read payloadlocation.read' } }) };

describe('Efí · regras da cobrança Pix', () => {
  it('txid: 26 a 35 letras e números, o mesmo para a mesma mensalidade e valor; valor novo, txid novo', () => {
    const a = txidFor({ contractId: 'c1', month: '2026-11', amount: 500 });
    expect(isTxid(a)).toBe(true);
    expect(a).toMatch(/^pulse202611[a-f0-9]{21}$/);
    expect(txidFor({ contractId: 'c1', month: '2026-11', amount: 500 })).toBe(a);
    expect(txidFor({ contractId: 'c1', month: '2026-11', amount: 550 })).not.toBe(a);
  });

  it('cob vale até o vencimento + 30 dias (mínimo 1 dia), com o valor em reais e a chave da Efí', () => {
    const now = new Date('2026-11-02T12:00:00-03:00');
    expect(expiracaoFor('2026-11-10', { now })).toBe(Math.round((Date.parse('2026-11-10T23:59:59-03:00') + 30 * 86400000 - now.getTime()) / 1000));
    expect(expiracaoFor('2026-10-01', { now })).toBe(30 * 86400);
    const body = cobBody({ chave: 'pix@pulse.com', amount: 1234.5, dueDate: '2026-11-10', now, solicitacao: 'Mensalidade', info: [{ nome: 'Cliente', valor: 'Clínica' }] });
    expect(body).toMatchObject({ valor: { original: '1234.50' }, chave: 'pix@pulse.com', solicitacaoPagador: 'Mensalidade', infoAdicionais: [{ nome: 'Cliente', valor: 'Clínica' }] });
    expect(body).not.toHaveProperty('devedor');
    expect(() => cobBody({ chave: '', amount: 10 })).toThrow(/chave Pix/);
  });

  it('paga só com CONCLUIDA e os Pix cobrindo o valor', () => {
    expect(cobPaid({ status: 'ATIVA', valor: { original: '10.00' } }).paid).toBe(false);
    expect(cobPaid({ status: 'CONCLUIDA', valor: { original: '10.00' }, pix: [{ endToEndId: 'E1', valor: '10.00', horario: 'x' }] }))
      .toMatchObject({ paid: true, amount: 10, e2e: 'E1' });
    expect(cobPaid({ status: 'CONCLUIDA', valor: { original: '10.00' }, pix: [{ endToEndId: 'E1', valor: '4.00' }] }).paid).toBe(false);
  });

  it('webhook: lê os Pix da notificação; URL com hmac e "ignorar=" (sem o /pix no fim)', () => {
    expect(readEfiWebhook({ pix: [{ endToEndId: 'E1', txid: 't', valor: '0.01', horario: 'h', infoPagador: 'oi' }, { semE2e: 1 }] }))
      .toEqual([{ e2e: 'E1', txid: 't', valor: 0.01, horario: 'h', info: 'oi' }]);
    expect(webhookUrlFor('https://agenciapulse.tech/', 'uruacu', 'abc')).toBe('https://agenciapulse.tech/api/webhooks/efi/uruacu?hmac=abc&ignorar=');
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abd', 'abc')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
  });

  it('certificado: recusa arquivo que não é .p12', () => {
    expect(() => checkCertificate(Buffer.from('não sou um certificado'))).toThrow(/\.p12/);
    expect(() => checkCertificate('')).toThrow(/certificado/);
  });
});

describe('Efí · cliente da API Pix (homologação simulada)', () => {
  it('token com Basic (Client ID:Secret) uma vez só; chamadas com Bearer', async () => {
    const efi = fakeEfi({ ...TOKEN, 'PUT /v2/cob/:txid': (r) => ({ status: 201, body: { txid: 'x', status: 'ATIVA', loc: { id: 7 }, pixCopiaECola: '000201...', valor: JSON.parse(r.body!).valor } }) });
    const client = createEfiClient({ clientId: 'Client_Id_abc', clientSecret: 'Client_Secret_xyz', env: 'homologacao', request: efi.request });
    await client.putCob('pulse2026110000000000000000001', { valor: { original: '5.00' } });
    await client.getCob('pulse2026110000000000000000001').catch(() => null);
    expect(efi.calls[0].url).toBe('https://pix-h.api.efipay.com.br/oauth/token');
    expect(efi.calls[0].headers.Authorization).toBe(`Basic ${Buffer.from('Client_Id_abc:Client_Secret_xyz').toString('base64')}`);
    expect(JSON.parse(efi.calls[0].body!)).toEqual({ grant_type: 'client_credentials' });
    expect(efi.calls.filter((c) => c.url.endsWith('/oauth/token'))).toHaveLength(1);
    expect(efi.calls[1]).toMatchObject({ method: 'PUT', url: 'https://pix-h.api.efipay.com.br/v2/cob/pulse2026110000000000000000001' });
    expect(efi.calls[1].headers.Authorization).toBe('Bearer tok1');
    expect(client.scopes()).toContain('cob.write');
  });

  it('401 renova o token uma vez; erro da Efí vira EfiError com a mensagem dela', async () => {
    let first = true;
    const efi = fakeEfi({
      ...TOKEN,
      'GET /v2/cob/:txid': () => (first ? ((first = false), { status: 401, body: {} }) : { status: 400, body: { nome: 'cobranca_invalida', mensagem: 'A cobrança não respeita o schema' } }),
    });
    const client = createEfiClient({ clientId: 'Client_Id_abc', clientSecret: 'Client_Secret_xyz', env: 'homologacao', request: efi.request });
    await expect(client.getCob('t')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('não respeita o schema') });
    expect(efi.calls.filter((c) => c.url.endsWith('/oauth/token'))).toHaveLength(2);
  });

  it('Pix recebidos: todas as páginas do período', async () => {
    const efi = fakeEfi({
      ...TOKEN,
      'GET /v2/pix': (r) => {
        const page = Number(new URL(r.url).searchParams.get('paginacao.paginaAtual'));
        return { body: { parametros: { paginacao: { paginaAtual: page, quantidadeDePaginas: 2 } }, pix: [{ endToEndId: `E${page}`, valor: '1.00' }] } };
      },
    });
    const client = createEfiClient({ clientId: 'Client_Id_abc', clientSecret: 'Client_Secret_xyz', env: 'homologacao', request: efi.request });
    const list = await client.listPix('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z');
    expect(list.map((p: { endToEndId: string }) => p.endToEndId)).toEqual(['E0', 'E1']);
  });
});

describe('Efí · conta da cidade', () => {
  const efiAcc = {
    city: 'uruacu', active: true, pix_key: 'antiga@pix', infinitepay_handle: 'agenciapulse', efi_active: true, efi_env: 'homologacao',
    efi_pix_key: 'efi@pulse.com', efi_client_id_enc: 'v1:a:b:c', efi_client_secret_enc: 'v1:a:b:d', efi_cert_enc: 'v1:a:b:e',
    efi_client_id_last4: '9f3c', efi_client_secret_last4: '7d21', efi_cert_name: 'cert.p12', efi_last_test_ok: true,
  };

  it('ligada e testada: a chave Pix que vale é a da Efí e o Pix sai pela Efí; desligada, como antes', () => {
    expect(overlayConfig({ id: 1 }, efiAcc, 'uruacu')).toMatchObject({ pix_key: 'efi@pulse.com', pix_provider: 'efi', infinitepay_handle: 'agenciapulse' });
    expect(overlayConfig({ id: 1 }, { ...efiAcc, efi_active: false }, 'uruacu')).toMatchObject({ pix_key: 'antiga@pix', pix_provider: 'estatico' });
    expect(overlayConfig({ id: 1 }, { ...efiAcc, efi_cert_enc: null }, 'uruacu')).toMatchObject({ pix_provider: 'estatico' });
    expect(efiStatus(efiAcc)).toBe('ligado');
    expect(efiStatus({ ...efiAcc, efi_active: false })).toBe('pronto');
    expect(efiStatus({ ...efiAcc, efi_last_test_ok: null })).toBe('testar');
    expect(efiStatus({ ...efiAcc, efi_cert_enc: null })).toBe('incompleto');
  });

  it('a tela nunca recebe segredo nem certificado da Efí', () => {
    const p = publicAccount(efiAcc, 'uruacu');
    const text = JSON.stringify(p);
    for (const s of ['v1:a:b:c', 'v1:a:b:d', 'v1:a:b:e']) expect(text).not.toContain(s);
    expect(p.efi).toMatchObject({ has_client_id: true, client_id_last4: '9f3c', has_cert: true, cert_name: 'cert.p12', status: 'ligado', env: 'homologacao' });
  });
});

describe('Efí · cobrança, webhook e conciliação (homologação simulada)', () => {
  function setup({ cobStatus = 'ATIVA', efiActive = true } = {}) {
    const acc = {
      city: 'uruacu', active: true, efi_active: efiActive, efi_env: 'homologacao', efi_pix_key: 'efi@pulse.com', updated_at: 't1',
      efi_client_id_enc: encryptSecret('Client_Id_abc'), efi_client_secret_enc: encryptSecret('Client_Secret_xyz'),
      efi_cert_enc: encryptSecret(Buffer.from('p12').toString('base64')), efi_last_test_ok: true, efi_webhook_secret: 'segredo123',
    };
    const charges = new Map<string, Record<string, unknown>>();
    const received = new Map<string, Record<string, unknown>>();
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/^\s*SELECT \* FROM efi_charges WHERE txid/.test(sql)) return { rows: charges.has(params[0] as string) ? [charges.get(params[0] as string)] : [] };
        if (/INSERT INTO efi_charges/.test(sql)) {
          const [txid, city, env, contract_id, client_id, revenue_id, month, amount, loc_id, pix_copia_e_cola, status] = params;
          charges.set(txid as string, { txid, city, env, contract_id, client_id, revenue_id, month, amount, loc_id, pix_copia_e_cola, status });
          return { rows: [] };
        }
        if (/UPDATE efi_charges SET status = 'CONCLUIDA'/.test(sql)) {
          const c = charges.get(params[0] as string);
          if (!c || c.status === 'CONCLUIDA') return { rows: [] };
          c.status = 'CONCLUIDA';
          return { rows: [c] };
        }
        if (/INSERT INTO efi_pix_received/.test(sql)) {
          received.set(params[0] as string, { e2e: params[0], txid: params[3], status: params[8], revenue_id: params[9] });
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };
    const fake = {
      putCob: vi.fn(async (txid: string, body: { valor: { original: string } }) => ({ txid, status: 'ATIVA', loc: { id: 7 }, calendario: { expiracao: 86400 }, valor: body.valor, pixCopiaECola: `00020101BR.GOV.BCB.PIX-qrcodespix.sejaefi.com.br/${txid}` })),
      getCob: vi.fn(async (txid: string) => ({ txid, status: cobStatus, valor: { original: '5.00' }, pix: cobStatus === 'CONCLUIDA' ? [{ endToEndId: 'E1', valor: '5.00', horario: '2026-11-02T13:20:00Z' }] : [] })),
      listPix: vi.fn(async () => []),
      saldo: vi.fn(async () => ({ saldo: '100.00' })),
    };
    const handlers: Record<string, (req: unknown, res: unknown) => Promise<void>> = {};
    const app = { get: () => {}, put: () => {}, post: (path: string, h: never) => { handlers[path] = h; } };
    const markRevenuePaid = vi.fn(async () => true);
    const routes = registerEfiPixRoutes(app as never, {
      pool, verifyAdmin: async () => ({}), accountFor: async () => acc, ensureAccountsSchema: async () => {}, markRevenuePaid,
      publicApiUrl: 'https://agenciapulse.tech', makeClient: () => fake as never, sweepEvery: 0, logger: { error: () => {}, log: () => {} },
      now: () => new Date('2026-11-02T12:00:00-03:00'),
    });
    return { routes, handlers, fake, charges, received, markRevenuePaid };
  }
  const contract = { id: 'c1', client_id: 'cli1', client_city: 'uruacu', company_name: 'Clínica Exemplo' };
  const webhookReq = (hmac: string, pix: unknown[]) => ({ params: { city: 'uruacu' }, query: { hmac }, headers: { 'x-forwarded-for': '34.193.116.226' }, body: { pix } });
  const res = () => { const r = { code: 0, status(c: number) { r.code = c; return r; }, json: () => r, send: () => r }; return r; };
  const tick = () => new Promise((r) => setTimeout(r, 10));

  it('gera o Pix da Efí da mensalidade (txid ligado ao contrato) e reaproveita a mesma cobrança', async () => {
    const { routes, fake, charges } = setup();
    const a = await routes.pixCharge({ contract, revenue: { id: 'r1' }, amount: 5, month: '2026-11', dueDate: '2026-11-10' });
    expect(a).toMatchObject({ provider: 'efi', txid: txidFor({ contractId: 'c1', month: '2026-11', amount: 5 }) });
    expect(a.pixCopiaECola).toContain('sejaefi');
    expect(fake.putCob.mock.calls[0][1]).toMatchObject({ valor: { original: '5.00' }, chave: 'efi@pulse.com' });
    expect(charges.get(a.txid)).toMatchObject({ revenue_id: 'r1', status: 'ATIVA' });
    const b = await routes.pixCharge({ contract, revenue: { id: 'r1' }, amount: 5, month: '2026-11', dueDate: '2026-11-10' });
    expect(b.pixCopiaECola).toBe(a.pixCopiaECola);
    expect(fake.putCob).toHaveBeenCalledTimes(1);
  });

  it('cidade sem a Efí ligada: sem Pix da Efí (segue o Pix de antes)', async () => {
    const { routes, fake } = setup({ efiActive: false });
    expect(await routes.pixCharge({ contract, revenue: { id: 'r1' }, amount: 5, month: '2026-11', dueDate: '2026-11-10' })).toBeNull();
    expect(fake.putCob).not.toHaveBeenCalled();
  });

  it('webhook sem o hmac certo: 401 e nada acontece', async () => {
    const { handlers, fake } = setup();
    const r = res();
    await handlers['/api/webhooks/efi/:city'](webhookReq('errado', [{ endToEndId: 'E1', txid: 'x', valor: '5.00' }]), r);
    expect(r.code).toBe(401);
    expect(fake.getCob).not.toHaveBeenCalled();
  });

  it('webhook pago: confere a cobrança na Efí pelo txid e só então dá baixa (uma vez)', async () => {
    const { routes, handlers, markRevenuePaid, received } = setup({ cobStatus: 'CONCLUIDA' });
    const { txid } = await routes.pixCharge({ contract, revenue: { id: 'r1' }, amount: 5, month: '2026-11', dueDate: '2026-11-10' });
    const r = res();
    await handlers['/api/webhooks/efi/:city/pix'](webhookReq('segredo123', [{ endToEndId: 'E1', txid, valor: '5.00' }]), r);
    await tick();
    expect(r.code).toBe(200);
    expect(markRevenuePaid).toHaveBeenCalledWith('r1');
    expect(received.get('E1')).toMatchObject({ status: 'conciliado', revenue_id: 'r1' });
    await handlers['/api/webhooks/efi/:city'](webhookReq('segredo123', [{ endToEndId: 'E1', txid, valor: '5.00' }]), res());
    await tick();
    expect(markRevenuePaid).toHaveBeenCalledTimes(1);
  });

  it('webhook com a cobrança ainda ATIVA na Efí (corpo forjado): não dá baixa', async () => {
    const { routes, handlers, markRevenuePaid, fake } = setup({ cobStatus: 'ATIVA' });
    const { txid } = await routes.pixCharge({ contract, revenue: { id: 'r1' }, amount: 5, month: '2026-11', dueDate: '2026-11-10' });
    await handlers['/api/webhooks/efi/:city'](webhookReq('segredo123', [{ endToEndId: 'E9', txid, valor: '5.00' }]), res());
    await tick();
    expect(fake.getCob).toHaveBeenCalledWith(txid);
    expect(markRevenuePaid).not.toHaveBeenCalled();
  });

  it('Pix recebido sem cobrança da Pulse vai para "conferir"', async () => {
    const { handlers, received, markRevenuePaid } = setup();
    await handlers['/api/webhooks/efi/:city'](webhookReq('segredo123', [{ endToEndId: 'E5', valor: '150.00' }]), res());
    await tick();
    expect(received.get('E5')).toMatchObject({ status: 'conferir', txid: null });
    expect(markRevenuePaid).not.toHaveBeenCalled();
  });

  it('varredura: Pix das últimas 48 h com txid nosso dá baixa mesmo sem webhook', async () => {
    const { routes, fake, markRevenuePaid } = setup({ cobStatus: 'CONCLUIDA' });
    const { txid } = await routes.pixCharge({ contract, revenue: { id: 'r1' }, amount: 5, month: '2026-11', dueDate: '2026-11-10' });
    fake.listPix.mockResolvedValueOnce([{ endToEndId: 'E1', txid, valor: '5.00', horario: '2026-11-02T13:20:00Z' }]);
    const out = await routes.sweep();
    expect(out.uruacu).toMatchObject({ pix: 1, pagos: 1 });
    expect(markRevenuePaid).toHaveBeenCalledWith('r1');
  });
});

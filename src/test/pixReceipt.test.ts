import { describe, expect, it, vi } from 'vitest';
import {
  parseE2E, parseAiReceipt, checkReceipt, sameReceiver, sameDocument, sameKey, staticTxid, parseOfx, matchStatement,
} from '../../vps-api-server/lib/pixReceipt.mjs';
import { registerPixReceiptRoutes } from '../../vps-api-server/pixReceiptRoutes.mjs';

// ID de transação de exemplo: Nubank (18236120), 02/11/2026 13:45 UTC
const E2E = 'E18236120202611021345s0123ABC456';
const expected = { amount: 1500, pixKey: '12345678000190', document: '12.345.678/0001-90', receiverName: 'Agência Pulse Marketing', createdAt: '2026-11-01T12:00:00Z' };
const read = (o = {}) => ({
  e_pix: true, valor: 1500, data_hora: '2026-11-02T10:45', recebedor_nome: 'AGENCIA PULSE MARKETING LTDA',
  recebedor_documento: '12.345.678/0001-**', recebedor_chave: null, pagador_nome: 'Clínica Sorriso', id_transacao: E2E, instituicao: 'Nubank', ...o,
});
const now = new Date('2026-11-02T14:00:00Z');

describe('Pix pela chave · comprovante', () => {
  it('ID da transação (E2E): 32 caracteres, banco do pagador e a hora em UTC; formato errado = null', () => {
    const e = parseE2E(E2E);
    expect(e?.ispb).toBe('18236120');
    expect(e?.at.toISOString()).toBe('2026-11-02T13:45:00.000Z');
    expect(parseE2E('E1823612020261102134')).toBeNull();
    expect(parseE2E('E18236120202613021345S0123ABC456')).toBeNull(); // mês 13
    expect(parseE2E('')).toBeNull();
  });

  it('lê o JSON da IA com folga: valor "R$ 1.500,00" vira 1500, campo ausente vira null', () => {
    const r = parseAiReceipt('```json\n{"valor": "R$ 1.500,00", "id_transacao": "E18236 120202611021345s0123ABC456"}\n```');
    expect(r.valor).toBe(1500);
    expect(r.id_transacao).toBe(E2E);
    expect(r.recebedor_nome).toBeNull();
    expect(parseAiReceipt('sem json').valor).toBeNull();
  });

  it('recebedor: nome com 2 palavras em comum, CNPJ mascarado ou a chave', () => {
    expect(sameReceiver('AGENCIA PULSE MARKETING LTDA', 'Agência Pulse Marketing')).toBe(true);
    expect(sameReceiver('PULSE ACADEMIA', 'Agência Pulse Marketing')).toBe(false);
    expect(sameDocument('12.345.678/0001-**', '12.345.678/0001-90')).toBe(true);
    expect(sameDocument('***.456.789-**', '123.456.789-00')).toBe(true);
    expect(sameDocument('98.345.678/0001-**', '12.345.678/0001-90')).toBe(false);
    expect(sameKey('pix@pulse.com', 'PIX@pulse.com')).toBe(true);
    expect(sameKey('(62) 99999-0000', '5562999990000')).toBe(true);
  });

  it('tudo bate = conferido; valor diferente ou ID repetido = recusado; ID ilegível = conferir', () => {
    expect(checkReceipt(read(), expected, { now }).verdict).toBe('conferido');
    expect(checkReceipt(read({ valor: 150 }), expected, { now }).verdict).toBe('recusado');
    expect(checkReceipt(read(), expected, { now, usedBy: 'Outro · 2026-10' }).verdict).toBe('recusado');
    expect(checkReceipt(read({ id_transacao: null }), expected, { now }).verdict).toBe('conferir');
    expect(checkReceipt(read({ recebedor_nome: 'OUTRA EMPRESA', recebedor_documento: null }), expected, { now }).verdict).toBe('conferir');
    expect(checkReceipt(read({ e_pix: false }), expected, { now }).verdict).toBe('recusado');
  });

  it('Pix com data no futuro ou muito antes da cobrança fica para conferir', () => {
    const futuro = 'E18236120202611051345s0123ABC456';
    expect(checkReceipt(read({ id_transacao: futuro }), expected, { now }).verdict).toBe('conferir');
    const antigo = 'E18236120202609011345s0123ABC456';
    expect(checkReceipt(read({ id_transacao: antigo }), expected, { now }).verdict).toBe('conferir');
  });

  it('txid do Pix pela chave: um por contrato e mês, até 25 letras e números', () => {
    const t = staticTxid('3f2a9c1e-77aa-4b1c-9d00-0000aaaa1111', '2026-11');
    expect(t).toBe('PULSE2026113F2A9C1E');
    expect(t.length).toBeLessThanOrEqual(25);
  });
});

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261102104500[-3:BRT]<TRNAMT>1500.00<FITID>${E2E}<MEMO>PIX RECEBIDO CLINICA SORRISO
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261102<TRNAMT>-35.00<FITID>abc<MEMO>TARIFA
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261102<TRNAMT>800,00<FITID>x2<MEMO>PIX RECEBIDO JOAO
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('Pix pela chave · extrato .ofx', () => {
  it('lê só os créditos, com data e valor (vírgula ou ponto)', () => {
    const c = parseOfx(OFX);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ fitid: E2E, date: '2026-11-02', amount: 1500 });
    expect(c[1].amount).toBe(800);
  });

  it('casa pelo ID da transação; pelo valor só quando há um comprovante e um crédito nesse valor', () => {
    const credits = parseOfx(OFX);
    const m = matchStatement(credits, [
      { id: 'r1', amount: 1500, e2e: E2E, paid_at: '2026-11-02T13:45:00Z' },
      { id: 'r2', amount: 800, e2e: 'E00000000202611021000xxxxxxxxxxx', paid_at: '2026-11-02T12:00:00Z' },
    ]);
    expect(m.map((x) => [x.receiptId, x.by])).toEqual([['r1', 'e2e'], ['r2', 'valor']]);
    // dois comprovantes de 800 → nenhum casa pelo valor (a gestão decide)
    const dup = matchStatement(credits, [
      { id: 'a', amount: 800, e2e: null, paid_at: '2026-11-02T12:00:00Z' },
      { id: 'b', amount: 800, e2e: null, paid_at: '2026-11-02T12:00:00Z' },
    ]);
    expect(dup).toEqual([]);
  });
});

// ── rota pública: o cliente manda o comprovante ─────────────────────────────────────────────────────────────────
function fakeApp() {
  const routes: Record<string, (req: unknown, res: unknown) => Promise<void>> = {};
  const reg = (m: string) => (p: string, h: (req: unknown, res: unknown) => Promise<void>) => { routes[`${m} ${p}`] = h; };
  return { app: { get: reg('GET'), post: reg('POST') }, routes };
}
function fakeRes() {
  const r = { statusCode: 200, body: null as unknown, status(c: number) { r.statusCode = c; return r; }, json(b: unknown) { r.body = b; return r; }, set() { return r; }, send(b: unknown) { r.body = b; return r; } };
  return r;
}

describe('Pix pela chave · rota do comprovante', () => {
  it('lê, confere, grava como aguardando e responde ao cliente sem detalhes; não dá baixa sozinho', async () => {
    const inserted: unknown[][] = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('FROM billing_pay_pages')) return { rows: [{ token: params[0], revenue_id: 'rev1', client_name: 'Clínica Sorriso', month: '2026-11', city: 'minacu', amount: '1500', pix_key: '12345678000190', receiver_name: 'Agência Pulse Marketing', created_at: '2026-11-01T12:00:00Z' }] };
        if (sql.includes('FROM revenues')) return { rows: [{ status: 'pendente' }] };
        if (sql.includes('count(*)')) return { rows: [{ n: 0 }] };
        if (sql.includes('WHERE e2e_id')) return { rows: [] };
        if (sql.startsWith('INSERT INTO pix_receipts')) { inserted.push(params); return { rows: [] }; }
        return { rows: [] };
      }),
    };
    const markRevenuePaid = vi.fn();
    const { app, routes } = fakeApp();
    const os = await import('node:os');
    registerPixReceiptRoutes(app, {
      pool, verifyAdmin: vi.fn(), markRevenuePaid, privateRoot: os.tmpdir(), logger: { error: vi.fn(), log: vi.fn() }, now: () => now,
      paymentConfigFor: async () => ({ pix_key: '12345678000190', document: '12.345.678/0001-90', receiver_name: 'Agência Pulse Marketing' }),
      readReceipt: async () => JSON.stringify(read()),
    });
    const req = { params: { token: 'tok_0123456789abcdef' }, headers: {}, file: { buffer: Buffer.from('img'), mimetype: 'image/png' } };
    // sem cabeçalho multipart o multer deixa passar, e o arquivo já vem pronto no pedido
    const res = fakeRes();
    await routes['POST /api/public/cobranca/:token/comprovante'](req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as { status: string }).status).toBe('recebido');
    expect(inserted[0][11]).toBe('conferido');
    expect(inserted[0][14]).toBe('aguardando');
    expect(markRevenuePaid).not.toHaveBeenCalled();
  });
});

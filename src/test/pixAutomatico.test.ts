import { describe, expect, it, vi } from 'vitest';
import {
  devedorDoc, maskDoc, firstDebitDate, recBody, cobrBody, recState, cobrState, cobrWindow, debitDate,
} from '../../vps-api-server/lib/pixAutomatico.mjs';
import { recipientsFor } from '../../vps-api-server/lib/teamAlerts.mjs';
import { registerPixAutomaticoRoutes } from '../../vps-api-server/pixAutomaticoRoutes.mjs';

describe('Pix Automático · regras', () => {
  it('CPF e CNPJ com dígito verificador; inválido = null; mascarado na tela', () => {
    expect(devedorDoc('529.982.247-25')).toEqual({ cpf: '52998224725' });
    expect(devedorDoc('11.222.333/0001-81')).toEqual({ cnpj: '11222333000181' });
    expect(devedorDoc('111.111.111-11')).toBeNull();
    expect(devedorDoc('123')).toBeNull();
    expect(maskDoc('52998224725')).toBe('***.982.247-**');
  });

  it('primeiro débito: o vencimento do mês seguinte (dia 31 vira o último dia do mês)', () => {
    expect(firstDebitDate('2026-11-02', 10)).toBe('2026-12-10');
    expect(firstDebitDate('2026-12-20', 5)).toBe('2027-01-05');
    expect(firstDebitDate('2027-01-15', 31)).toBe('2027-02-28');
  });

  it('recorrência mensal sem retentativa; cobrança do mês com dia útil e a conta da Efí', () => {
    const rec = recBody({ contractId: '3f2a-77aa', devedor: { cpf: '52998224725' }, nome: 'Maria', objeto: 'Mensalidade', dataInicial: '2026-12-10', valor: 1500, loc: 12 });
    expect(rec).toEqual({
      vinculo: { objeto: 'Mensalidade', contrato: '3f2a77aa', devedor: { cpf: '52998224725', nome: 'Maria' } },
      calendario: { dataInicial: '2026-12-10', periodicidade: 'MENSAL' },
      valor: { valorRec: '1500.00' }, politicaRetentativa: 'NAO_PERMITE', loc: 12,
    });
    expect(cobrBody({ idRec: 'RR1', dueDate: '2026-12-10', amount: 1500, info: 'x', agencia: '0001', conta: '963521-1' }))
      .toMatchObject({ idRec: 'RR1', calendario: { dataDeVencimento: '2026-12-10' }, valor: { original: '1500.00' }, ajusteDiaUtil: true, recebedor: { agencia: '0001', conta: '9635211', tipoConta: 'PAGAMENTO' } });
    expect(cobrBody({ idRec: 'RR1', dueDate: '2026-12-10', amount: 1 }).recebedor).toBeUndefined();
  });

  it('status: aprovada = ativo; cobrança paga pela tentativa liquidada; expirada = falhou', () => {
    expect(recState('APROVADA')).toBe('ativo');
    expect(recState('CRIADA')).toBe('aguardando');
    expect(recState('CANCELADA')).toBe('cancelado');
    expect(cobrState({ status: 'ATIVA', tentativas: [{ status: 'LIQUIDADA', endToEndId: 'E1' }] })).toEqual({ state: 'pago', e2e: 'E1' });
    expect(cobrState({ status: 'CONCLUIDA' }).state).toBe('pago');
    expect(cobrState({ status: 'ATIVA', tentativas: [{ status: 'EXPIRADA' }] }).state).toBe('falhou');
    expect(cobrState({ status: 'ATIVA', tentativas: [{ status: 'AGENDADA' }] }).state).toBe('aberta');
  });

  it('nunca debita antes do vencimento: o mais tarde entre o Financeiro e o dia do contrato; dia útil só empurra para depois', () => {
    expect(debitDate('2026-12-10', '2026-12', 10)).toBe('2026-12-10');
    expect(debitDate('2026-12-05', '2026-12', 10)).toBe('2026-12-10');
    expect(debitDate('2026-12-12', '2026-12', 10)).toBe('2026-12-12');
    expect(debitDate(null, '2027-02', 31)).toBe('2027-02-28');
    expect(cobrBody({ idRec: 'RR1', dueDate: '2026-12-10', amount: 1 })).toMatchObject({ calendario: { dataDeVencimento: '2026-12-10' }, ajusteDiaUtil: true });
  });

  it('a cobrança do mês sai de 2 a 8 dias antes do vencimento', () => {
    expect(cobrWindow('2026-12-02', '2026-12-10')).toBe(true);
    expect(cobrWindow('2026-12-08', '2026-12-10')).toBe(true);
    expect(cobrWindow('2026-12-09', '2026-12-10')).toBe(false);
    expect(cobrWindow('2026-12-01', '2026-12-10')).toBe(false);
  });
});

describe('avisos à equipe por cidade', () => {
  const numbers = [
    { name: 'Thiago', active: true, cities: ['minacu', 'uruacu'], permissions: ['avisos_pagamentos'] },
    { name: 'VICTOR', active: true, cities: ['minacu'], permissions: ['avisos_pagamentos'] },
    { name: 'NAAY', active: true, cities: ['uruacu'], permissions: ['resumo_diario'] },
  ];
  it('Minaçu → Thiago e Victor; Uruaçu → só o Thiago', () => {
    expect(recipientsFor(numbers, 'minacu').map((n) => n.name)).toEqual(['Thiago', 'VICTOR']);
    expect(recipientsFor(numbers, 'uruacu').map((n) => n.name)).toEqual(['Thiago']);
  });
});

describe('Pix Automático · adesão e débito', () => {
  function setup({ recStatus = 'APROVADA', cobr = { status: 'ATIVA', tentativas: [{ status: 'LIQUIDADA', endToEndId: 'E9' }] } } = {}) {
    const autos: Record<string, Record<string, unknown>> = {};
    const cobrs: Record<string, Record<string, unknown>> = {};
    const page = { token: 'tok_0123456789abcdef', contract_id: 'c1', city: 'minacu', amount: '1500' };
    const contract = { id: 'c1', client_id: 'cli1', company_name: 'Clínica', client_city: 'minacu', due_day: 10, contract_value: 1500, status: 'ativo' };
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/CREATE TABLE/.test(sql)) return { rows: [] };
        if (/FROM billing_pay_pages WHERE token/.test(sql)) return { rows: [page] };
        if (/FROM financial_contracts fc/.test(sql)) return { rows: [contract] };
        if (/FROM pix_auto WHERE contract_id/.test(sql)) return { rows: Object.values(autos).filter((a) => ['aguardando', 'ativo'].includes(a.status as string)) };
        if (/INSERT INTO pix_auto \(/.test(sql)) { autos[params[0] as string] = { id_rec: params[0], contract_id: params[1], city: params[3], status: 'aguardando', valor: params[10], data_inicial: params[11] }; return { rows: [] }; }
        if (/FROM pix_auto WHERE \(status = 'aguardando'/.test(sql)) return { rows: Object.values(autos) };
        if (/UPDATE pix_auto SET status/.test(sql)) { Object.assign(autos[params[0] as string], { status: params[1] }); return { rows: [] }; }
        if (/FROM pix_auto WHERE status = 'ativo'/.test(sql)) return { rows: Object.values(autos).filter((a) => a.status === 'ativo') };
        if (/SELECT 1 FROM pix_auto_cobr/.test(sql)) return { rows: cobrs[`${params[0]}|${params[1]}`] ? [1] : [] };
        if (/INSERT INTO pix_auto_cobr/.test(sql)) { cobrs[`${params[1]}|${params[4]}`] = { txid: params[0], id_rec: params[1], contract_id: params[2], revenue_id: params[3], month: params[4], due_date: params[5], amount: params[6], status: 'aberta' }; return { rows: [] }; }
        if (/FROM pix_auto_cobr WHERE status = 'aberta'/.test(sql)) return { rows: Object.values(cobrs).filter((c) => c.status === 'aberta') };
        if (/FROM pix_auto WHERE id_rec/.test(sql)) return { rows: [autos[params[0] as string]] };
        if (/UPDATE pix_auto_cobr SET status = 'paga'/.test(sql)) { Object.values(cobrs).find((c) => c.txid === params[0])!.status = 'paga'; return { rows: [] }; }
        if (/UPDATE pix_auto_cobr SET status = 'falhou'/.test(sql)) { Object.values(cobrs).find((c) => c.txid === params[0])!.status = 'falhou'; return { rows: [] }; }
        return { rows: [] };
      }),
    };
    const client = {
      postLocrec: vi.fn(async () => ({ id: 77 })),
      postRec: vi.fn(async () => ({ idRec: 'RR123', status: 'CRIADA' })),
      getRec: vi.fn(async () => ({ idRec: 'RR123', status: recStatus, dadosQR: { pixCopiaECola: '00020126...rec' } })),
      postCobr: vi.fn(async () => ({ txid: 'TXR1', status: 'CRIADA' })),
      getCobr: vi.fn(async () => cobr),
    };
    const handlers: Record<string, (req: unknown, res: unknown) => Promise<void>> = {};
    const app = { get: vi.fn(), post: (p: string, h: never) => { handlers[p] = h; } };
    const alert = vi.fn(async () => 1);
    const markRevenuePaid = vi.fn(async () => true);
    let today = new Date('2026-11-02T12:00:00-03:00');
    const routes = registerPixAutomaticoRoutes(app as never, {
      pool, verifyAdmin: vi.fn(), pixClient: async () => ({ acc: { city: 'minacu', efi_env: 'producao', efi_agencia: '0001', efi_conta: '9635211' }, client }),
      monthInfo: async (_c: unknown, month: string) => ({ dueDate: `${month}-10`, amount: 1500, paid: false, revenue: { id: `rev-${month}` } }),
      markRevenuePaid, alert, tickEvery: 0, logger: { error: () => {}, log: () => {} }, now: () => today,
    });
    const res = () => { const r = { code: 200, body: null as unknown, status(c: number) { r.code = c; return r; }, json(b: unknown) { r.body = b; return r; } }; return r; };
    return { routes, handlers, client, alert, markRevenuePaid, res, setToday: (d: string) => { today = new Date(d); }, autos, cobrs };
  }

  it('ativar na página: valida o documento, cria a recorrência a partir do mês seguinte e devolve o código', async () => {
    const t = setup();
    const bad = t.res();
    await t.handlers['/api/public/cobranca/:token/pix-automatico']({ params: { token: 'tok_0123456789abcdef' }, body: { documento: '123', nome: 'Maria' } }, bad);
    expect(bad.code).toBe(400);
    const ok = t.res();
    await t.handlers['/api/public/cobranca/:token/pix-automatico']({ params: { token: 'tok_0123456789abcdef' }, body: { documento: '529.982.247-25', nome: 'Maria Souza' } }, ok);
    expect(ok.body).toMatchObject({ status: 'aguardando', copiaECola: '00020126...rec', dataInicial: '2026-12-10' });
    expect(t.client.postRec.mock.calls[0][0]).toMatchObject({ calendario: { dataInicial: '2026-12-10', periodicidade: 'MENSAL' }, loc: 77 });
  });

  it('um toque: sem documento a recorrência sai sem devedor; se a Efí exigir, a página pede só o CPF/CNPJ', async () => {
    const t = setup();
    const ok = t.res();
    await t.handlers['/api/public/cobranca/:token/pix-automatico']({ params: { token: 'tok_0123456789abcdef' }, body: {} }, ok);
    expect(ok.body).toMatchObject({ status: 'aguardando', copiaECola: '00020126...rec' });
    expect(t.client.postRec.mock.calls[0][0].vinculo.devedor).toBeUndefined();

    const strict = setup();
    strict.client.postRec.mockRejectedValueOnce(Object.assign(new Error('Efí 400: devedor obrigatório'), { status: 400 }));
    const r = strict.res();
    await strict.handlers['/api/public/cobranca/:token/pix-automatico']({ params: { token: 'tok_0123456789abcdef' }, body: {} }, r);
    expect(r.code).toBe(422);
    expect(r.body).toMatchObject({ needDoc: true });
  });

  it('aprovou no banco: avisa a equipe; cria a cobrança de dezembro na janela e o débito pago dá baixa', async () => {
    const t = setup();
    await t.handlers['/api/public/cobranca/:token/pix-automatico']({ params: { token: 'tok_0123456789abcdef' }, body: { documento: '52998224725', nome: 'Maria Souza' } }, t.res());
    await t.routes.tick();
    expect(t.autos.RR123.status).toBe('ativo');
    expect(t.alert.mock.calls[0][2]).toContain('aderiu');
    t.setToday('2026-12-05T12:00:00-03:00');
    await t.routes.tick();
    expect(t.client.postCobr.mock.calls[0][0]).toMatchObject({ idRec: 'RR123', calendario: { dataDeVencimento: '2026-12-10' }, recebedor: { agencia: '0001', conta: '9635211' } });
    t.setToday('2026-12-10T18:00:00-03:00');
    await t.routes.tick();
    expect(t.markRevenuePaid).toHaveBeenCalledWith('rev-2026-12');
  });

  it('não debitou (sem saldo): marca como falhou e avisa a equipe; a Ísis cobra no dia seguinte', async () => {
    const t = setup({ cobr: { status: 'ATIVA', tentativas: [{ status: 'EXPIRADA' }] } });
    await t.handlers['/api/public/cobranca/:token/pix-automatico']({ params: { token: 'tok_0123456789abcdef' }, body: { documento: '52998224725', nome: 'Maria Souza' } }, t.res());
    await t.routes.tick();
    t.setToday('2026-12-05T12:00:00-03:00');
    await t.routes.tick();
    t.setToday('2026-12-11T09:00:00-03:00');
    await t.routes.tick();
    expect(t.markRevenuePaid).not.toHaveBeenCalled();
    expect(Object.values(t.cobrs)[0].status).toBe('falhou');
    expect(t.alert.mock.calls.at(-1)?.[2]).toContain('Não deu para debitar');
  });
});

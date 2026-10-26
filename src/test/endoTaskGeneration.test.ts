import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Banco falso: guarda o que a geração lê, apaga e insere em endomarketing_partner_tasks.
type Filter = [op: string, column: string, value: unknown];
const fake = {
  contract: null as any,
  pkg: null as any,
  otherTasks: [] as any[],
  keptTasks: [] as any[],
  deletes: [] as Filter[][],
  inserted: [] as any[],
};

function makeBuilder(table: string) {
  const state = { op: 'select', filters: [] as Filter[], payload: null as any };
  const resolveQuery = () => {
    if (table === 'client_endomarketing_contracts') return { data: fake.contract, error: null };
    if (table === 'endomarketing_packages') return { data: fake.pkg, error: null };
    if (state.op === 'delete') { fake.deletes.push(state.filters); return { data: null, error: null }; }
    if (state.op === 'insert') { fake.inserted.push(...state.payload); return { data: null, error: null }; }
    const keptQuery = state.filters.some(([op, column]) => op === 'in' && column === 'status');
    return { data: keptQuery ? fake.keptTasks : fake.otherTasks, error: null };
  };
  const builder: any = {
    select: () => builder,
    eq: (c: string, v: unknown) => { state.filters.push(['eq', c, v]); return builder; },
    neq: (c: string, v: unknown) => { state.filters.push(['neq', c, v]); return builder; },
    gte: (c: string, v: unknown) => { state.filters.push(['gte', c, v]); return builder; },
    lte: (c: string, v: unknown) => { state.filters.push(['lte', c, v]); return builder; },
    in: (c: string, v: unknown) => { state.filters.push(['in', c, v]); return builder; },
    order: () => builder,
    limit: () => builder,
    single: () => builder,
    delete: () => { state.op = 'delete'; return builder; },
    insert: (payload: any[]) => { state.op = 'insert'; state.payload = payload; return builder; },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(resolveQuery()).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/vpsDb', () => ({
  supabase: { from: (table: string) => makeBuilder(table), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { generateEndoContractTasks } from '@/hooks/useEndomarketing';

beforeEach(() => {
  fake.contract = { id: 'c1', client_id: 'cl1', partner_id: 'p1', package_id: 'pk1', status: 'ativo', start_date: '2026-10-15' };
  fake.pkg = { id: 'pk1', category: 'presenca_completa', sessions_per_week: 5, duration_hours: 2 };
  fake.otherTasks = [];
  fake.keptTasks = [];
  fake.deletes = [];
  fake.inserted = [];
});

afterEach(() => vi.useRealTimers());

describe('geração de tarefas do endomarketing', () => {
  it('não cria tarefa antes do início do contrato', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00'));
    const ok = await generateEndoContractTasks('c1', '2026-10-01', '2026-10-31');
    expect(ok).toBe(true);
    const dates = fake.inserted.map(t => t.date);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every(d => d >= '2026-10-15')).toBe(true);
    expect(dates).toContain('2026-10-15');
  });

  it('dia com tarefa concluída ou cancelada do contrato não ganha outra pendente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00'));
    fake.keptTasks = [
      { date: '2026-10-16', task_type: 'presenca' },
      { date: '2026-10-20T00:00:00.000Z', task_type: 'presenca' },
    ];
    await generateEndoContractTasks('c1', '2026-10-15', '2026-10-21');
    const dates = fake.inserted.map(t => t.date);
    expect(dates).toEqual(['2026-10-15', '2026-10-19', '2026-10-21']);
  });

  it('Regenerar Todas não apaga nem recria o que já passou', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    fake.contract.start_date = '2026-09-01';
    await generateEndoContractTasks('c1', '2026-10-01', '2026-10-31', { notBeforeToday: true });
    expect(fake.inserted.every(t => t.date >= '2026-10-20')).toBe(true);
    const deleteFrom = fake.deletes[0].find(([op, column]) => op === 'gte' && column === 'date');
    expect(deleteFrom?.[2]).toBe('2026-10-20');
  });

  it('o diálogo Gerar Tarefas ainda aceita datas passadas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00'));
    fake.contract.start_date = '2026-09-01';
    await generateEndoContractTasks('c1', '2026-10-01', '2026-10-03');
    expect(fake.inserted.map(t => t.date)).toEqual(['2026-10-01', '2026-10-02']);
  });
});

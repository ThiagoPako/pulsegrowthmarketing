// Assistente PULSE — contas do financeiro, com as mesmas regras das telas (src/lib/financialCalc.ts,
// src/hooks/useFinancialData.tsx, FinancialDashboard.tsx e FinancialDelinquency.tsx):
//   - receita do mês = reference_month do mês; recebida = recebida/pago; vencida = em_atraso/vencido ou prevista
//     com vencimento antes de hoje (a tela grava "em_atraso" ao abrir); a receber = prevista ainda no prazo;
//   - receitas de cliente cancelado não entram; duplicadas (mesmo cliente e mês) contam uma vez (deduplicateRevenues);
//   - despesa do mês = date do mês; salário/bônus só conta quando a descrição termina em " - PAGO" (isExpensePaid);
//   - saldo em conta = todas as movimentações do caixa fora do porquinho (entrada soma, o resto subtrai);
//   - inadimplentes = receitas vencidas a partir da competência 04/2026 (DELINQUENCY_START), uma linha por receita.
// Cidade: igual ao /api/db/query — a linha vale na cidade dela ou, sem cidade, nas duas.

import { cityExpr, roundMoney, brazilToday, monthRange } from './common.mjs';

const PLACEHOLDER_CLIENT_ID = '00000000-0000-0000-0000-000000000000';
const DELINQUENCY_START = '2026-04-01';
const RECEIVED = ['recebida', 'pago'];
const OVERDUE = ['em_atraso', 'vencido'];

const dateKey = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10));
const ts = (value) => (value ? new Date(value).getTime() || 0 : 0);
const priority = (status) => (RECEIVED.includes(status) ? 3 : OVERDUE.includes(status) ? 2 : status === 'prevista' ? 1 : 0);

function chooseCanonical(current, candidate) {
  for (const [a, b] of [
    [priority(candidate.status), priority(current.status)],
    [ts(candidate.paid_at), ts(current.paid_at)],
    [ts(candidate.updated_at), ts(current.updated_at)],
    [ts(candidate.created_at), ts(current.created_at)],
  ]) {
    if (a !== b) return a > b ? candidate : current;
  }
  return String(candidate.id) > String(current.id) ? candidate : current;
}

export function dedupeRevenues(items) {
  const byKey = new Map();
  for (const r of items) {
    const placeholder = !r.client_id || r.client_id === PLACEHOLDER_CLIENT_ID;
    const key = placeholder ? `avulsa_${r.id}`
      : r.recurrence_id ? `rec_${r.recurrence_id}_${dateKey(r.reference_month)}`
        : r.description ? `manual_${r.id}` : `${r.client_id}_${dateKey(r.reference_month)}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? chooseCanonical(existing, r) : r);
  }
  return [...byKey.values()];
}

export const isOverdue = (r, today) => OVERDUE.includes(r.status) || (r.status === 'prevista' && !!r.due_date && dateKey(r.due_date) < today);
const isExpensePaid = (e) => !/^\s*(sal[áa]rio|b[ôo]nus)\b/i.test(e.description || '') || / - PAGO\s*$/i.test(e.description || '');

/** Filtro de cidade (alias.city) para uma cidade só; com as duas cidades, não filtra. */
function cityFilter(alias, cities, params) {
  if (!cities?.length || cities.length > 1) return 'true';
  params.push(cities[0]);
  return `(${cityExpr(`${alias}.city`)} = $${params.length} OR ${alias}.city IS NULL OR nullif(btrim(${alias}.city::text), '') IS NULL)`;
}

async function visibleRevenues(pool, cities, extraWhere, extraParams) {
  const params = [...extraParams];
  const where = cityFilter('r', cities, params);
  const { rows } = await pool.query(
    `SELECT r.id, r.client_id, r.reference_month, r.amount, r.due_date, r.status, r.paid_at, r.description, r.category,
            r.recurrence_id, r.updated_at, r.created_at, c.company_name, c.status AS client_status
       FROM revenues r LEFT JOIN clients c ON c.id = r.client_id
      WHERE ${extraWhere} AND ${where}`,
    params
  );
  return dedupeRevenues(rows).filter((r) => !r.client_id || r.client_id === PLACEHOLDER_CLIENT_ID || (r.company_name !== null && r.client_status !== 'cancelado'));
}

export async function financialSummary(pool, { cities, month }) {
  const today = brazilToday();
  const revenues = await visibleRevenues(pool, cities, 'r.reference_month = $1::date', [`${month}-01`]);
  let previsto = 0; let recebido = 0; let vencido = 0; let aReceber = 0;
  for (const r of revenues) {
    const amount = Number(r.amount) || 0;
    previsto += amount;
    if (RECEIVED.includes(r.status)) recebido += amount;
    else if (isOverdue(r, today)) vencido += amount;
    else if (r.status === 'prevista') aReceber += amount;
  }

  const { start, end } = monthRange(month);
  const expParams = [start, end];
  const expWhere = cityFilter('e', cities, expParams);
  const { rows: expenses } = await pool.query(
    `SELECT e.amount, e.description, e.expense_type, e.structure_investment, ec.name AS category
       FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
      WHERE e.date BETWEEN $1::date AND $2::date AND ${expWhere}`,
    expParams
  );
  const paid = expenses.filter(isExpensePaid);
  const despesas = paid.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const byCategory = {};
  for (const e of paid) byCategory[e.category || 'Sem categoria'] = (byCategory[e.category || 'Sem categoria'] || 0) + (Number(e.amount) || 0);

  const cashParams = [];
  const cashWhere = cityFilter('m', cities, cashParams);
  const { rows: [cash] } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN m.type = 'entrada' THEN m.amount ELSE -m.amount END) FILTER (WHERE NOT m.is_reserve), 0) AS conta,
            COALESCE(SUM(CASE WHEN m.type = 'entrada' THEN m.amount ELSE -m.amount END) FILTER (WHERE m.is_reserve), 0) AS reserva
       FROM cash_reserve_movements m WHERE ${cashWhere}`,
    cashParams
  );

  return {
    mes: month,
    cidades: cities,
    receitas: {
      prevista_total: roundMoney(previsto), recebida: roundMoney(recebido), a_receber: roundMoney(aReceber),
      vencida: roundMoney(vencido), quantidade: revenues.length,
    },
    despesas: {
      total_pago: roundMoney(despesas),
      quantidade: paid.length,
      investimento_estrutura: roundMoney(paid.filter((e) => e.structure_investment).reduce((s, e) => s + (Number(e.amount) || 0), 0)),
      por_categoria: Object.entries(byCategory).sort(([, a], [, b]) => b - a).slice(0, 8)
        .map(([categoria, valor]) => ({ categoria, valor: roundMoney(valor) })),
    },
    lucro_liquido: roundMoney(recebido - despesas),
    lucro_projetado: roundMoney(previsto - despesas),
    saldo_em_conta: roundMoney(cash?.conta),
    reserva_porquinho: roundMoney(cash?.reserva),
    observacao: 'Saldo em conta é o acumulado do caixa (sem recorte de mês), como na tela Financeiro.',
  };
}

export async function delinquents(pool, { cities, limit = 40 }) {
  const today = brazilToday();
  const revenues = await visibleRevenues(pool, cities,
    `r.reference_month >= $1::date AND (r.status IN ('em_atraso', 'vencido') OR (r.status = 'prevista' AND r.due_date < $2::date))`,
    [DELINQUENCY_START, today]);
  const items = revenues.filter((r) => isOverdue(r, today)).map((r) => {
    const due = dateKey(r.due_date);
    const days = due ? Math.max(0, Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${due}T12:00:00Z`)) / 86400000)) : 0;
    return { cliente: r.company_name || '—', client_id: r.client_id, valor: roundMoney(r.amount), vencimento: due, dias_atraso: days, competencia: dateKey(r.reference_month).slice(0, 7) };
  }).sort((a, b) => b.dias_atraso - a.dias_atraso);
  return {
    total: roundMoney(items.reduce((s, i) => s + i.valor, 0)),
    quantidade: items.length,
    clientes: new Set(items.map((i) => i.client_id || i.cliente)).size,
    itens: items.slice(0, limit),
    mostrando: Math.min(limit, items.length),
  };
}

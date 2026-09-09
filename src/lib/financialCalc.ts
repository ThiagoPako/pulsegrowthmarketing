/**
 * Regras centrais de cálculo financeiro.
 *
 * Objetivo: eliminar divergências entre as telas (dashboard, movimentações,
 * relatórios, caixa e saúde da empresa). Toda soma de dinheiro do sistema deve
 * passar por estas funções para garantir o mesmo resultado em qualquer lugar.
 */

/** Converte qualquer valor vindo do Postgres (numeric chega como string) em número seguro. */
export const toAmount = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/** Arredonda para centavos, evitando ruído de ponto flutuante nas somas. */
export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Soma uma lista já mapeada para valores monetários. */
export const sumAmounts = <T>(list: T[], getter: (item: T) => unknown = (i: any) => i?.amount): number =>
  roundMoney(list.reduce((total, item) => total + toAmount(getter(item)), 0));

/** Percentual seguro (nunca divide por zero e nunca retorna NaN/Infinity). */
export const safePercent = (part: number, total: number): number => {
  if (!total) return 0;
  const result = (part / total) * 100;
  return Number.isFinite(result) ? result : 0;
};

/** Divisão segura (nunca divide por zero). */
export const safeDivide = (numerator: number, denominator: number): number => {
  if (!denominator) return 0;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
};

/** "2026-03-01T00:00:00.000Z" → "2026-03-01" (sem conversão de fuso). */
export const toDateKey = (value: string | null | undefined): string => {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : value;
};

/** Compara datas como texto — imune a fuso horário. */
export const isSameMonth = (value: string | null | undefined, ym: string): boolean =>
  toDateKey(value).startsWith(ym);

export const isWithinRange = (
  value: string | null | undefined,
  start: string,
  end: string,
): boolean => {
  const key = toDateKey(value);
  if (!key) return false;
  return key >= start && key <= end;
};

/** Cliente "coringa" usado nas importações de extrato — não representa cliente real. */
export const PLACEHOLDER_CLIENT_ID = '00000000-0000-0000-0000-000000000000';

export const RECEIVED_REVENUE_STATUSES = ['recebida', 'pago'];
export const OVERDUE_REVENUE_STATUSES = ['em_atraso', 'vencido'];

export const isRevenueReceived = (r: { status?: string | null }): boolean =>
  RECEIVED_REVENUE_STATUSES.includes(String(r?.status || ''));

export const isRevenueOverdue = (r: { status?: string | null }): boolean =>
  OVERDUE_REVENUE_STATUSES.includes(String(r?.status || ''));

export const isRevenuePending = (r: { status?: string | null }): boolean =>
  String(r?.status || '') === 'prevista';

/**
 * Movimentações de caixa criadas automaticamente como espelho de uma receita
 * recebida ou de uma despesa paga. Elas existem só para o saldo da conta —
 * somá-las junto com a receita/despesa original duplicaria o valor.
 */
export const isMirroredCashMovement = (m: { description?: string | null }): boolean =>
  /^\s*\[(Receita|Despesa)\]/i.test(m?.description || '');

/** Saldo da conta (exclui a reserva do porquinho). */
export const accountBalance = (movements: { type?: string; amount?: unknown; is_reserve?: boolean }[]): number =>
  roundMoney(
    movements
      .filter(m => !m.is_reserve)
      .reduce((acc, m) => acc + (m.type === 'entrada' ? toAmount(m.amount) : -toAmount(m.amount)), 0),
  );

/** Saldo da reserva (porquinho). */
export const reserveBalance = (movements: { type?: string; amount?: unknown; is_reserve?: boolean }[]): number =>
  roundMoney(
    movements
      .filter(m => Boolean(m.is_reserve))
      .reduce((acc, m) => acc + (m.type === 'entrada' ? toAmount(m.amount) : -toAmount(m.amount)), 0),
  );

export interface ProfitabilityInput {
  clientId: string;
  clientName: string;
  contractValue: unknown;
  clientRevenueTotal: number;
  clientVolume: number;
}

/**
 * Rentabilidade por cliente com rateio de custo pelo volume de gravações.
 * Regra única usada pelo painel e pelos relatórios, para nunca divergirem.
 */
export const computeClientProfitability = (
  items: ProfitabilityInput[],
  totalExpenses: number,
  totalVolume: number,
) =>
  items
    .map(item => {
      const faturamento = item.clientRevenueTotal > 0 ? item.clientRevenueTotal : toAmount(item.contractValue);
      const proportion = safeDivide(item.clientVolume, totalVolume);
      const custo = roundMoney(totalExpenses * proportion);
      const lucro = roundMoney(faturamento - custo);
      return {
        clientId: item.clientId,
        clientName: item.clientName,
        faturamento: roundMoney(faturamento),
        custo,
        lucro,
        margem: Math.round(safePercent(lucro, faturamento) * 10) / 10,
      };
    })
    .sort((a, b) => b.lucro - a.lucro);

// ─── Upgrade de redes sociais no plano do cliente (pedido do usuário, 03/11/2026) ───────────────────────────────────
// "Caso algum cliente faça update para mais gerenciamento, a gente muda no cadastro marcando que ele fez esse update e,
// ao adicionar mais uma rede social, já abre a opção de colocar o valor do update para adicionar ao financeiro na fatura
// desse cliente. O valor cobra mensal, mas se o cliente aderiu faltando 10 dias para vencer a mensalidade, a cobrança do
// plano atualizado acrescenta apenas os 10 dias equivalentes."
//
// Como fica no Financeiro:
//   - o valor mensal do upgrade entra no contrato (financial_contracts.contract_value), então as mensalidades seguintes
//     já saem cheias pelo gerador do mês;
//   - a próxima mensalidade em aberto ganha só os dias que faltam até o vencimento (proporcional). Se ela ainda não foi
//     lançada, é lançada agora com o valor antigo + o proporcional (o gerador do mês não lança de novo);
//   - nada é cobrado antes do dia: só muda o valor da fatura que já ia sair (regra da agência);
//   - a mensalidade continua sem descrição (é assim que a Ísis reconhece a mensalidade); o detalhe fica nesta tabela e no
//     log do Financeiro, e a conferência da Ísis desconta o proporcional (expectedAdjustment).

const PAID = ['recebida', 'pago'];
const pad = (n) => String(n).padStart(2, '0');
const DAY = 86_400_000;

/** Hoje (AAAA-MM-DD) em Brasília. */
export function todayBrt(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

/** Vencimento do mês (dia do contrato, limitado ao último dia do mês). */
export function dueOf(year, month, dueDay) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(Math.max(Number(dueDay) || 10, 1), last))}`;
}

function shiftMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1];
}

const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/**
 * Proporcional do upgrade: os dias de `start` até o vencimento `nextDue`, sobre o ciclo (vencimento anterior → nextDue).
 * skipMonths: quantos ciclos pular (a mensalidade do mês já foi paga: o proporcional vai para a seguinte, com mais dias).
 */
export function prorate({ monthly, start, dueDay, skipMonths = 0 }) {
  const [y, m] = start.split('-').map(Number);
  let [ny, nm] = [y, m];
  // vencimento no próprio dia da adesão já é o ciclo seguinte (o cliente usa a rede a partir de hoje)
  if (dueOf(y, m, dueDay) <= start) [ny, nm] = shiftMonth(y, m, 1);
  [ny, nm] = shiftMonth(ny, nm, skipMonths);
  const nextDue = dueOf(ny, nm, dueDay);
  const [py, pm] = shiftMonth(ny, nm, -1);
  const prevDue = dueOf(py, pm, dueDay);
  const cycleDays = days(prevDue, nextDue);
  const remaining = days(start, nextDue);
  const amount = Math.round(Number(monthly) * remaining / cycleDays * 100) / 100;
  return { nextDue, refMonth: `${ny}-${pad(nm)}`, days: remaining, cycleDays, amount };
}

export function createPlanAddons({ pool, logger = console }) {
  let ready = null;
  function ensureSchema() {
    ready ||= pool.query(`
      CREATE TABLE IF NOT EXISTS client_plan_addons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        network TEXT NOT NULL,
        monthly_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        charge TEXT NOT NULL DEFAULT 'proporcional',
        start_date DATE NOT NULL,
        first_month TEXT,
        first_amount NUMERIC(12,2),
        first_days INT,
        revenue_id UUID,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_networks TEXT[];
    `).catch((error) => { ready = null; throw error; });
    return ready;
  }

  async function list(clientId) {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, network, monthly_value::float AS monthly_value, charge, start_date::text AS start_date, first_month,
              first_amount::float AS first_amount, first_days, created_at
         FROM client_plan_addons WHERE client_id = $1 ORDER BY created_at`, [clientId]
    );
    return rows;
  }

  /** Prévia (sem gravar): quanto entra na próxima fatura e quanto por mês depois. */
  async function preview({ clientId, monthly, startDate }) {
    await ensureSchema();
    const { rows: [contract] } = await pool.query(`SELECT id, due_day, contract_value::float AS contract_value, status FROM financial_contracts WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`, [clientId]);
    if (!contract) throw Object.assign(new Error('O cliente não tem contrato no Financeiro.'), { status: 409 });
    const start = startDate || todayBrt();
    let p = prorate({ monthly, start, dueDay: contract.due_day });
    const rev = await monthRevenue(pool, clientId, contract.id, p.refMonth);
    if (rev && PAID.includes(rev.status)) p = prorate({ monthly, start, dueDay: contract.due_day, skipMonths: 1 });
    const pix = await pixAuto(pool, contract.id);
    return { ...p, monthly: Number(monthly), contract_value: contract.contract_value, new_contract_value: round2(contract.contract_value + Number(monthly)), pix_auto: pix };
  }

  /** Grava o upgrade: rede no plano, valor no contrato e o proporcional na próxima mensalidade em aberto. */
  async function addUpgrade({ clientId, network, monthly, startDate, charge = 'proporcional', userId = null }) {
    await ensureSchema();
    const value = round2(Number(monthly) || 0);
    if (!network) throw Object.assign(new Error('Escolha a rede'), { status: 400 });
    if (charge === 'proporcional' && !(value > 0)) throw Object.assign(new Error('Coloque o valor mensal do upgrade'), { status: 400 });
    const start = startDate || todayBrt();
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query(`UPDATE clients SET social_networks = (SELECT array_agg(DISTINCT x) FROM unnest(coalesce(social_networks, '{}') || ARRAY[$2::text]) x) WHERE id = $1`, [clientId, network]);
      let summary = { charge: 'cortesia' };
      if (charge === 'proporcional') {
        const { rows: [contract] } = await db.query(`SELECT * FROM financial_contracts WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [clientId]);
        if (!contract) throw Object.assign(new Error('O cliente não tem contrato no Financeiro: cadastre o contrato antes do upgrade.'), { status: 409 });
        if (contract.status && contract.status !== 'ativo') throw Object.assign(new Error('O contrato do cliente não está ativo.'), { status: 409 });
        const oldValue = Number(contract.contract_value) || 0;
        let p = prorate({ monthly: value, start, dueDay: contract.due_day });
        let rev = await monthRevenue(db, clientId, contract.id, p.refMonth, true);
        if (rev && PAID.includes(rev.status)) {
          p = prorate({ monthly: value, start, dueDay: contract.due_day, skipMonths: 1 });
          rev = await monthRevenue(db, clientId, contract.id, p.refMonth, true);
        }
        let revenueId = rev?.id || null;
        if (rev) {
          await db.query(`UPDATE revenues SET amount = amount + $2 WHERE id = $1`, [rev.id, p.amount]);
        } else {
          // ainda não lançada: lança agora com o valor antigo + o proporcional (o gerador do mês pula esse cliente)
          const hasCity = await revenuesHaveCity(db);
          const { rows: [c] } = await db.query(`SELECT city FROM clients WHERE id = $1`, [clientId]);
          const { rows: [ins] } = await db.query(
            hasCity
              ? `INSERT INTO revenues (client_id, contract_id, reference_month, amount, due_date, status, city) VALUES ($1, $2, $3, $4, $5, 'prevista', $6) RETURNING id`
              : `INSERT INTO revenues (client_id, contract_id, reference_month, amount, due_date, status) VALUES ($1, $2, $3, $4, $5, 'prevista') RETURNING id`,
            [clientId, contract.id, `${p.refMonth}-01`, round2(oldValue + p.amount), p.nextDue, ...(hasCity ? [c?.city || 'minacu'] : [])]
          );
          revenueId = ins.id;
        }
        await db.query(`UPDATE financial_contracts SET contract_value = $2 WHERE id = $1`, [contract.id, round2(oldValue + value)]);
        await db.query(
          `INSERT INTO client_plan_addons (client_id, network, monthly_value, charge, start_date, first_month, first_amount, first_days, revenue_id, created_by)
           VALUES ($1, $2, $3, 'proporcional', $4, $5, $6, $7, $8, $9)`,
          [clientId, network, value, start, p.refMonth, p.amount, p.days, revenueId, userId]
        );
        await db.query(
          `INSERT INTO financial_activity_log (action_type, entity_type, description, details) VALUES ('upgrade_plano', 'contrato', $1, $2)`,
          [`Upgrade: ${network} (+R$ ${value.toFixed(2)}/mês); proporcional de ${p.days} dias (R$ ${p.amount.toFixed(2)}) na mensalidade de ${p.nextDue.split('-').reverse().join('/')}`,
            JSON.stringify({ client_id: clientId, network, monthly: value, ...p, old_contract_value: oldValue })]
        ).catch((error) => logger.warn?.('[upgrade] log:', error.message));
        summary = { charge: 'proporcional', ...p, monthly: value, new_contract_value: round2(oldValue + value), pix_auto: await pixAuto(db, contract.id) };
      } else {
        await db.query(
          `INSERT INTO client_plan_addons (client_id, network, monthly_value, charge, start_date, created_by) VALUES ($1, $2, 0, 'cortesia', $3, $4)`,
          [clientId, network, start, userId]
        );
      }
      await db.query('COMMIT');
      return summary;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      db.release();
    }
  }

  /**
   * Quanto descontar do valor do contrato ao conferir a mensalidade de `month` (AAAA-MM): antes do upgrade a fatura não
   * tem o upgrade; no mês do proporcional, tem só o proporcional.
   */
  async function expectedAdjustment(clientId, month) {
    await ensureSchema().catch(() => {});
    const { rows } = await pool.query(
      `SELECT monthly_value::float AS monthly, first_month, first_amount::float AS first_amount FROM client_plan_addons
        WHERE client_id = $1 AND charge = 'proporcional'`, [clientId]
    ).catch(() => ({ rows: [] }));
    let adjust = 0;
    for (const a of rows) {
      if (!a.first_month) continue;
      if (month < a.first_month) adjust += a.monthly;
      else if (month === a.first_month) adjust += a.monthly - (a.first_amount || 0);
    }
    return round2(adjust);
  }

  return { ensureSchema, list, preview, addUpgrade, expectedAdjustment };
}

const round2 = (v) => Math.round(Number(v) * 100) / 100;

/** A mensalidade (sem descrição, fora de recorrência) do cliente naquele mês. */
async function monthRevenue(db, clientId, contractId, month, lock = false) {
  const { rows } = await db.query(
    `SELECT id, status, amount FROM revenues
      WHERE client_id = $1 AND recurrence_id IS NULL AND (description IS NULL OR btrim(description) = '')
        AND (contract_id IS NULL OR contract_id = $2) AND to_char(reference_month, 'YYYY-MM') = $3 AND status <> 'cancelada'
      ORDER BY (contract_id = $2) DESC NULLS LAST, created_at ASC LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [clientId, contractId, month]
  );
  return rows[0] || null;
}

let cityColumn = null;
async function revenuesHaveCity(db) {
  if (cityColumn !== null) return cityColumn;
  const { rows } = await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'revenues' AND column_name = 'city'`);
  cityColumn = rows.length > 0;
  return cityColumn;
}

/** Pix Automático ativo do contrato (o valor autorizado na Efí pode não cobrir a fatura nova). */
async function pixAuto(db, contractId) {
  const { rows: [r] } = await db.query(`SELECT valor::float AS valor FROM pix_auto WHERE contract_id = $1 AND status = 'ativo' LIMIT 1`, [contractId]).catch(() => ({ rows: [] }));
  return r ? { valor: r.valor } : null;
}

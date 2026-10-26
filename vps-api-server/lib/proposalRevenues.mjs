// ═══════════════════════════════════════════════════════════════
// Receitas previstas de uma proposta comercial aceita
// ═══════════════════════════════════════════════════════════════
// Tipos recorrentes (marketing, endomarketing, personalizada): uma receita por mês
// do contrato, no valor MENSAL da proposta (com o desconto). Antes o valor mensal
// era dividido por 12 e o financeiro recebia 1/12 do contrato.
// Tipos de valor fechado (sistema, cronograma, vídeos): total dividido pelas parcelas.

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toArray(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value : [];
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Soma meses a 'YYYY-MM-DD' mantendo o dia (ou o último dia do mês, como o addMonths do date-fns). */
export function addMonthsToDateString(dateStr, months) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12; // 0-11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad2(month + 1)}-${pad2(Math.min(d, lastDay))}`;
}

/** Divide um total em N parcelas de centavos; a última absorve o arredondamento. */
function splitTotal(total, installments) {
  const n = Math.max(1, Math.floor(toNumber(installments)) || 1);
  const each = round2(total / n);
  const amounts = Array(n).fill(each);
  amounts[n - 1] = round2(total - each * (n - 1));
  return amounts;
}

/**
 * Monta as parcelas da proposta.
 * @param {object} proposal linha de commercial_proposals
 * @param {string} startDate 'YYYY-MM-DD' (dia do aceite, no fuso de Brasília)
 * @returns {{ amount: number, due_date: string, reference_month: string, description: string }[]}
 */
export function buildProposalRevenueSchedule(proposal, startDate) {
  const type = proposal?.proposal_type || 'marketing';
  const company = proposal?.client_company || '';
  const discount = toNumber(proposal?.custom_discount);
  const withDiscount = (value) => (discount > 0 ? value * (1 - discount / 100) : value);

  let label = '';
  let amounts = [];

  if (type === 'marketing') {
    // A proposta mostra semestral e anual; a previsão segue o anual (12 meses) com o
    // desconto da proposta, como já era antes.
    const plan = toObject(proposal?.plan_snapshot);
    const bonus = toArray(proposal?.bonus_services).reduce((s, b) => s + toNumber(b?.value), 0);
    const monthly = withDiscount(toNumber(plan.price) + bonus);
    amounts = Array(12).fill(round2(monthly));
    label = `Contrato Marketing - ${company}`;
  } else if (type === 'endomarketing') {
    const endo = toObject(proposal?.endomarketing_data);
    amounts = Array(12).fill(round2(withDiscount(toNumber(endo.monthlyValue))));
    label = `Endomarketing - ${company}`;
  } else if (type === 'personalizada') {
    // Mesma conta da página pública: valor mensal pela duração do contrato
    // (anual = 12 meses, senão semestral = 6). Na oferta 6+6, os 6 primeiros meses
    // saem no valor promocional e os outros 6 no valor cheio.
    const custom = toObject(proposal?.system_data);
    const monthly = toNumber(custom.monthlyValue);
    const isAnnual = custom.contractDuration === 'anual';
    const promoValue = toNumber(custom.promo66Value);
    const promo66 = isAnnual && !!custom.promo66Enabled && promoValue > 0 && promoValue < monthly;
    amounts = promo66
      ? [...Array(6).fill(round2(promoValue)), ...Array(6).fill(round2(monthly))]
      : Array(isAnnual ? 12 : 6).fill(round2(withDiscount(monthly)));
    label = `Proposta Única - ${company}`;
  } else if (type === 'sistema') {
    const sys = toObject(proposal?.system_data);
    amounts = splitTotal(withDiscount(toNumber(sys.value)), sys.installments);
    label = `Sistema/Software - ${company}`;
  } else if (type === 'cronograma') {
    // Mesmo total da página pública: valor único no modo 'total'; senão o total salvo
    // ou a soma das entregas (propostas antigas sem totalValue).
    const crono = toObject(proposal?.system_data);
    const deliverablesSum = toArray(crono.deliverables)
      .reduce((s, d) => s + toNumber(d?.unitPrice) * (toNumber(d?.quantity) || 1), 0);
    const total = crono.pricingMode === 'total'
      ? toNumber(crono.totalValue)
      : (toNumber(crono.totalValue) || deliverablesSum);
    amounts = splitTotal(withDiscount(total), crono.installments);
    label = `Cronograma - ${company}`;
  } else if (type === 'videos') {
    const vid = toObject(proposal?.system_data);
    const extras = toArray(vid.extras).reduce((s, e) => s + toNumber(e?.value), 0);
    const total = toNumber(vid.totalValue) || (toNumber(vid.quantity) * toNumber(vid.unitPrice) + extras);
    amounts = splitTotal(withDiscount(total), vid.installments);
    label = `Vídeos Avulsos - ${company}`;
  } else {
    return [];
  }

  if (!amounts.length || amounts.some((amount) => !(amount > 0))) return [];

  return amounts.map((amount, i) => {
    const due = addMonthsToDateString(startDate, i);
    return {
      amount,
      due_date: due,
      reference_month: `${due.slice(0, 7)}-01`,
      description: `${label} (${i + 1}/${amounts.length})`,
    };
  });
}

// Marca antiga que o navegador gravava em observations ao gerar as receitas.
// O cliente via essa marca na página pública da proposta.
const REVENUE_MARK_RE = /\n?\[RECEITAS GERADAS[^\]]*\]/g;

export function stripRevenueMark(text) {
  if (typeof text !== 'string') return text;
  return text.replace(REVENUE_MARK_RE, '').trim();
}

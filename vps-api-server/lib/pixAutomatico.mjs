// ─── Pix Automático da mensalidade (pedido do usuário, 02/11/2026) ──────────────────────────────────────────────────
// "Vamos dar a opção para o cliente ativar o Pix Automático; avise que pode cancelar a qualquer momento e a cobrança é
// feita apenas na data do vencimento. O benefício é não ter que fazer manualmente todo mês. Programe o sistema para
// cobrar de clientes que aderiram apenas se tentar debitar da conta dele e não tiver saldo… quem tem débito automático
// não recebe cobranças, apenas o PDF do dia 1 e o PDF próximo do vencimento, sem cobranças."
// API Pix da Efí, jornada 2 (QR Code de autorização, débitos a partir do mês seguinte), doc
// https://dev.efipay.com.br/docs/api-pix/pix-automatico:
//   POST /v2/locrec → { id, location }                     (payloadlocationrec.write)
//   POST /v2/rec { vinculo: { objeto, contrato, devedor: { cpf|cnpj, nome } }, calendario: { dataInicial, periodicidade },
//                  valor: { valorRec }, politicaRetentativa, loc } → { idRec, status: 'CRIADA' }        (rec.write)
//   GET  /v2/rec/:idRec → { status, dadosQR: { pixCopiaECola, jornada } }                            (rec.read)
//   POST /v2/cobr { idRec, infoAdicional, calendario: { dataDeVencimento }, valor: { original }, ajusteDiaUtil,
//                   recebedor?: { agencia, conta, tipoConta } } → { txid, status }                    (cobr.write)
//   GET  /v2/cobr/:txid → { status, tentativas: [{ dataLiquidacao, status, endToEndId }] }           (cobr.read)
// Aqui ficam só as regras (sem banco de dados), para os testes.

const digits = (s) => String(s || '').replace(/\D/g, '');

function cpfOk(d) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjOk(d) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, x, i) => acc + Number(d[i]) * x, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** CPF ou CNPJ do titular da conta que vai pagar → { cpf } | { cnpj }; inválido → null. */
export function devedorDoc(doc) {
  const d = digits(doc);
  if (cpfOk(d)) return { cpf: d };
  if (cnpjOk(d)) return { cnpj: d };
  return null;
}

/** Documento mascarado para a tela ("***.456.789-**" / "12.345.678/****-**"). */
export function maskDoc(doc) {
  const d = digits(doc);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
  return '';
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Vencimento do mês ("aaaa-mm") pelo dia do contrato, no último dia quando o mês é mais curto. */
export function dueDateOf(month, dueDay) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${pad2(Math.min(Math.max(Number(dueDay) || 10, 1), last))}`;
}

/** Primeiro débito: o vencimento do mês seguinte ao de hoje (a mensalidade deste mês segue pelo Pix de sempre). */
export function firstDebitDate(today, dueDay) {
  const [y, m] = today.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
  return dueDateOf(next, dueDay);
}

const clip = (v, n) => String(v ?? '').normalize('NFC').trim().slice(0, n);

/** Corpo do POST /v2/rec (mensal, sem retentativa: falhou o débito, a Ísis cobra pelo Pix de sempre). */
export function recBody({ contractId, devedor, nome, objeto, dataInicial, valor, loc }) {
  return {
    vinculo: {
      objeto: clip(objeto || 'Mensalidade Agência Pulse', 140),
      contrato: String(contractId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 35),
      // sem documento (ativação com um toque): o banco de quem autoriza identifica o pagador
      ...(devedor ? { devedor: { ...devedor, nome: clip(nome, 140) } } : {}),
    },
    calendario: { dataInicial, periodicidade: 'MENSAL' },
    valor: { valorRec: (Math.round(Number(valor) * 100) / 100).toFixed(2) },
    politicaRetentativa: 'NAO_PERMITE',
    ...(loc != null ? { loc: Number(loc) } : {}),
  };
}

/** Corpo do POST /v2/cobr da mensalidade (a Efí debita no vencimento, ajustado para dia útil). */
export function cobrBody({ idRec, dueDate, amount, info, agencia, conta }) {
  return {
    idRec,
    infoAdicional: clip(info || 'Mensalidade Agência Pulse', 140),
    calendario: { dataDeVencimento: dueDate },
    valor: { original: (Math.round(Number(amount) * 100) / 100).toFixed(2) },
    ajusteDiaUtil: true,
    ...(agencia && conta ? { recebedor: { agencia: digits(agencia), conta: digits(conta), tipoConta: 'PAGAMENTO' } } : {}),
  };
}

/** Status da recorrência na Efí → o da Pulse: aguardando (QR gerado), ativo, cancelado, recusado, expirado. */
export function recState(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'APROVADA') return 'ativo';
  if (s === 'CANCELADA') return 'cancelado';
  if (s === 'REJEITADA') return 'recusado';
  if (s === 'EXPIRADA') return 'expirado';
  return 'aguardando';
}

/**
 * A cobrança recorrente foi paga? pago = status CONCLUIDA ou uma tentativa liquidada; falhou = cancelada, rejeitada,
 * expirada ou todas as tentativas encerradas sem pagamento; senão, aberta.
 */
export function cobrState(cobr) {
  const s = String(cobr?.status || '').toUpperCase();
  const tent = Array.isArray(cobr?.tentativas) ? cobr.tentativas : [];
  const liquidada = tent.find((t) => /LIQUIDAD|CONCLUID|PAG/i.test(String(t?.status || '')));
  if (s === 'CONCLUIDA' || liquidada) return { state: 'pago', e2e: liquidada?.endToEndId || null };
  if (['CANCELADA', 'REJEITADA', 'EXPIRADA', 'NAO_REALIZADA'].includes(s)) return { state: 'falhou' };
  if (tent.length && tent.every((t) => /EXPIRAD|CANCELAD|REJEITAD|FALH|NAO_/i.test(String(t?.status || '')))) return { state: 'falhou' };
  return { state: 'aberta' };
}

/**
 * Data do débito (regra do usuário, 02/11/2026: "não pode errar cobrança; não pode debitar nada de cliente antes do dia
 * do vencimento"): o vencimento do Financeiro, mas nunca antes do dia do contrato no mês. Com ajusteDiaUtil, a Efí só
 * empurra para o próximo dia útil (fim de semana e feriado), nunca para antes.
 */
export function debitDate(financeDue, month, dueDay) {
  const contractDue = dueDateOf(month, dueDay);
  const fin = /^\d{4}-\d{2}-\d{2}$/.test(String(financeDue || '')) ? String(financeDue) : contractDue;
  return fin > contractDue ? fin : contractDue;
}

/** A cobrança do mês sai entre 2 e 8 dias antes do vencimento (a regra do Pix Automático pede antecedência). */
export function cobrWindow(today, dueDate) {
  const days = Math.round((Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  return days >= 2 && days <= 8;
}

/** Linha do convite nas cobranças (curta; a página explica o resto). */
// sem "pagar na mão" (usuário, 02/11/2026: "coloque ative Pix Automático")
export const OFFER_LINE = '💡 Ative o Pix Automático na página de pagamento: o débito é só no dia do vencimento e você cancela quando quiser.';

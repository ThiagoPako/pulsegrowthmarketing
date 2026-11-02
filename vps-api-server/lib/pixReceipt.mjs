// ─── Pix pela chave: comprovante conferido e extrato do banco (pedido do usuário, 02/11/2026) ──────────────────────
// "Para pagamentos Pix vamos adicionar a chave Pix para evitar taxas e crie uma forma de autenticar esse pagamento para
// confirmar no sistema que foi pago." Sem a API do banco, o sistema não vê o Pix chegar. O caminho é em duas partes:
//   1. o cliente manda o comprovante na página /pagar; a IA lê o comprovante e o servidor confere valor, recebedor, o
//      ID da transação (E2E do Banco Central) e se esse ID já foi usado. Comprovante bate tudo = "conferido";
//   2. a baixa só sai com o dinheiro visto: o extrato do banco (.ofx) importado no Financeiro confirma sozinho, ou a
//      gestão confirma com um toque depois de olhar o app do banco. Comprovante sozinho não dá baixa: print se edita.
// Aqui ficam só as regras (sem banco de dados), para os testes.

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const digits = (s) => String(s || '').replace(/\D/g, '');
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'ltda', 'me', 'eireli', 'sa', 'epp', 'mei', 'agencia', 'servicos']);

/**
 * ID da transação Pix (end-to-end do Banco Central): "E" + ISPB do banco do pagador (8 dígitos) + aaaammddhhmm (UTC) +
 * 11 letras/números = 32 caracteres. Devolve null se o formato não é esse.
 */
export function parseE2E(id) {
  // o fim do ID diferencia maiúscula de minúscula (a API da Efí procura pelo ID exato): só o "E" do começo é normalizado
  const s = String(id || '').replace(/\s+/g, '').replace(/^e/, 'E');
  const m = /^E(\d{8})(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})([A-Za-z0-9]{11})$/.exec(s);
  if (!m) return null;
  const [, ispb, y, mo, d, h, mi] = m;
  const at = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  if (at.getUTCMonth() !== +mo - 1 || at.getUTCDate() !== +d || +h > 23 || +mi > 59) return null;
  return { id: s, ispb, at };
}

/** O que a IA devolve, lido com folga (JSON puro ou dentro de ```), com o valor em número. */
export function parseAiReceipt(text) {
  const raw = String(text || '');
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let o = {};
  try { o = JSON.parse(json); } catch { o = {}; }
  const valor = typeof o.valor === 'number' ? o.valor
    : Number(String(o.valor ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return {
    e_pix: o.e_pix !== false,
    valor: Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null,
    data_hora: o.data_hora ? String(o.data_hora) : null,
    recebedor_nome: o.recebedor_nome ? String(o.recebedor_nome) : null,
    recebedor_documento: o.recebedor_documento ? String(o.recebedor_documento) : null,
    recebedor_chave: o.recebedor_chave ? String(o.recebedor_chave) : null,
    pagador_nome: o.pagador_nome ? String(o.pagador_nome) : null,
    id_transacao: o.id_transacao ? String(o.id_transacao).replace(/\s+/g, '') : null,
    instituicao: o.instituicao ? String(o.instituicao) : null,
  };
}

export const RECEIPT_PROMPT = `Este arquivo deveria ser um comprovante de pagamento Pix de um banco brasileiro.
Leia o que está escrito e responda só com um JSON, sem texto fora dele:
{"e_pix": true|false, "valor": número em reais, "data_hora": "aaaa-mm-ddThh:mm" no horário do comprovante,
 "recebedor_nome": "", "recebedor_documento": "CPF/CNPJ como aparece, com os asteriscos", "recebedor_chave": "",
 "pagador_nome": "", "id_transacao": "o ID da transação / E2E / autenticação Pix (começa com E e tem 32 caracteres)",
 "instituicao": "banco de quem pagou"}
Copie exatamente o que está no comprovante; campo que não aparece vai null. Não invente nada.`;

/** Nome do recebedor bate: duas palavras significativas em comum (ou todas, se o nome tem menos de duas). */
export function sameReceiver(read, expected) {
  const words = (s) => norm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  const want = words(expected);
  if (!want.length) return false;
  const got = new Set(words(read));
  const hits = want.filter((w) => got.has(w)).length;
  return hits >= Math.min(2, want.length);
}

/** Documento mascarado do comprovante ("12.345.678/0001-**", "***.456.789-**") bate com o CPF/CNPJ do recebedor. */
export function sameDocument(read, expected) {
  const want = digits(expected);
  const shown = String(read || '').replace(/[^\d*•xX]/g, '').replace(/[•xX]/g, '*');
  if (!want || !shown || shown.length !== want.length) return false;
  const visible = [...shown].filter((c) => c !== '*').length;
  return visible >= 5 && [...shown].every((c, i) => c === '*' || c === want[i]);
}

/** Chave Pix lida bate com a da conta (e-mail sem caixa, telefone e documento só pelos dígitos). */
export function sameKey(read, expected) {
  const a = String(read || '').trim().toLowerCase();
  const b = String(expected || '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return digits(a).length >= 8 && digits(a) === digits(b).slice(-digits(a).length);
}

/**
 * Confere o comprovante lido contra a cobrança. Devolve as conferências e o veredito:
 *   recusado  → não é Pix, valor diferente ou ID já usado em outro comprovante;
 *   conferido → tudo bate (ainda falta o dinheiro aparecer no extrato ou a confirmação da gestão);
 *   conferir  → faltou alguma coisa (ID ilegível, recebedor que não deu para ler…): a gestão olha.
 */
export function checkReceipt(read, expected, { now = new Date(), usedBy = null } = {}) {
  const checks = [];
  const add = (id, ok, label, detail = '') => checks.push({ id, ok, label, detail });

  add('pix', read.e_pix !== false, 'É um comprovante de Pix');
  const amount = Number(expected.amount) || 0;
  add('valor', read.valor !== null && Math.abs(read.valor - amount) < 0.01, 'Valor igual ao da mensalidade',
    read.valor === null ? 'valor não lido' : `comprovante ${read.valor.toFixed(2)} · mensalidade ${amount.toFixed(2)}`);

  const receiverOk = sameKey(read.recebedor_chave, expected.pixKey)
    || sameDocument(read.recebedor_documento, expected.document)
    || sameReceiver(read.recebedor_nome, expected.receiverName);
  add('recebedor', receiverOk, 'Pago para a conta da Pulse', read.recebedor_nome || read.recebedor_chave || 'recebedor não lido');

  const e2e = parseE2E(read.id_transacao);
  add('id', !!e2e, 'ID da transação Pix válido', read.id_transacao || 'ID não lido');
  if (e2e) {
    const created = expected.createdAt ? new Date(expected.createdAt) : null;
    const earliest = created ? created.getTime() - 15 * 86400000 : 0;
    const inWindow = e2e.at.getTime() >= earliest && e2e.at.getTime() <= now.getTime() + 10 * 60000;
    add('data', inWindow, 'Data do Pix compatível com a cobrança', e2e.at.toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
    add('unico', !usedBy, 'ID ainda não usado em outro comprovante', usedBy ? `já usado (${usedBy})` : '');
  }

  const failed = (id) => checks.some((c) => c.id === id && !c.ok);
  const verdict = failed('pix') || failed('valor') || failed('unico') ? 'recusado'
    : checks.every((c) => c.ok) ? 'conferido' : 'conferir';
  return { verdict, checks, e2e: e2e?.id || null, paidAt: e2e?.at || null };
}

/** txid do Pix pela chave: "PULSE" + aaaamm + 8 do contrato (aparece no app do banco e ajuda a achar quem pagou). */
export function staticTxid(contractId, month) {
  return `PULSE${String(month || '').replace(/\D/g, '').slice(0, 6)}${String(contractId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}`.toUpperCase().slice(0, 25);
}

// ── extrato do banco (.ofx): os créditos ──────────────────────────────────────────────────────────────────────────
const tag = (block, name) => {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim() : '';
};

/** OFX (SGML ou XML) → créditos [{ fitid, date (aaaa-mm-dd), amount, memo, name }]. */
export function parseOfx(text) {
  const out = [];
  const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const b = m[1];
    const amount = Number(tag(b, 'TRNAMT').replace(',', '.'));
    if (!(amount > 0)) continue;
    const d = tag(b, 'DTPOSTED');
    out.push({
      fitid: tag(b, 'FITID') || null,
      date: /^\d{8}/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null,
      amount: Math.round(amount * 100) / 100,
      memo: tag(b, 'MEMO'),
      name: tag(b, 'NAME'),
    });
  }
  return out;
}

const dayDiff = (a, b) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000;

/**
 * Casa os créditos do extrato com os comprovantes à espera do dinheiro. Só casa com segurança:
 *   e2e   → o ID da transação do comprovante aparece no FITID ou no histórico do crédito;
 *   valor → mesmo valor, até 2 dias da data do Pix, e só um comprovante e só um crédito nesse valor e data.
 * O resto fica para a gestão. receipts: [{ id, amount, e2e, paid_at }]
 */
export function matchStatement(credits, receipts) {
  const used = new Set();
  const matches = [];
  for (const r of receipts) {
    if (!r.e2e) continue;
    const c = credits.find((x) => !used.has(x) && `${x.fitid} ${x.memo} ${x.name}`.toUpperCase().includes(String(r.e2e).toUpperCase()));
    if (c) { used.add(c); matches.push({ receiptId: r.id, credit: c, by: 'e2e' }); }
  }
  const matched = new Set(matches.map((x) => x.receiptId));
  for (const r of receipts) {
    if (matched.has(r.id) || !r.paid_at) continue;
    const day = String(r.paid_at instanceof Date ? r.paid_at.toISOString() : r.paid_at).slice(0, 10);
    const near = (x) => Math.abs(x.amount - Number(r.amount)) < 0.01 && x.date && dayDiff(x.date, day) <= 2;
    const cs = credits.filter((x) => !used.has(x) && near(x));
    const rivals = receipts.filter((o) => !matched.has(o.id) && Math.abs(Number(o.amount) - Number(r.amount)) < 0.01);
    if (cs.length === 1 && rivals.length === 1) { used.add(cs[0]); matches.push({ receiptId: r.id, credit: cs[0], by: 'valor' }); }
  }
  return matches;
}

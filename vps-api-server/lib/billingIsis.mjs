// ─── Cobranças da Ísis pelo Assistente PULSE (plano aprovado pelo usuário em 01/11/2026) ───────────────────────
// Calendário por cliente (D = vencimento da mensalidade do mês):
//   dia 1  → relatório do mês que fechou + sugestões (só com o relatório aprovado pela equipe)
//   D − 5  → agradecimento + assiduidade das agendas e como melhorar
//   D      → cobrança: Pix primeiro (copia e cola), link da InfinitePay para o cartão com a taxa repassada
//   D + 3  → lembrete gentil
// Regras puras: o que sai hoje, as variáveis e o texto. Linha com variável vazia (ex.: sem link) sai inteira.

export const BILLING_STEPS = ['relatorio_mensal', 'pre_vencimento', 'cobranca', 'lembrete'];
export const STEP_LABELS = {
  relatorio_mensal: 'Dia 1 · relatório',
  pre_vencimento: 'D−5 · agradecimento',
  cobranca: 'Dia D · cobrança',
  lembrete: 'D+3 · lembrete',
};
export const MODES = ['desligado', 'previa', 'ativo'];

// textos aprovados pelo usuário (agentes/estudos/isis-plano-relatorio-campanhas-cobrancas.md); editáveis na tela
export const DEFAULT_TEMPLATES = {
  relatorio_mensal: [
    'Bom dia, {nome_cliente}! ☀️ Aqui é a Ísis, da Pulse.',
    'Fechamos {mes_anterior} e quero te mostrar o que fizemos juntos:',
    '🎬 {qtd_videos} vídeos · 🎨 {qtd_artes} artes · 📲 {qtd_posts} posts · 🎥 {qtd_gravacoes} gravações',
    '⏱️ {horas_dedicadas} h dedicadas ao seu perfil',
    '📈 {resumo_rede}',
    'Para {mes_atual}, nossas sugestões:',
    '{sugestoes}',
    'O relatório completo está aqui: {link_relatorio}',
    'Qualquer ideia, é só me chamar! 🧡',
  ].join('\n'),
  pre_vencimento: [
    'Oi, {nome_cliente}! Passando para agradecer a parceria de mais um mês 🧡',
    'Nas agendas de {mes_ref}: {gravacoes_feitas} de {gravacoes_marcadas} gravações realizadas, com média de {media_videos} vídeos por gravação.',
    '{dica_assiduidade}',
    'Sua mensalidade vence dia {dia_vencimento}; no dia te mando o Pix e o link, tudo certinho.',
  ].join('\n'),
  // pedido do usuário (01/11/2026): "uma forma do cliente copiar o pagamento ou clicar para pagar": a mensagem leva a
  // página de pagamento ({link_pagamento}, com o botão de copiar o Pix e o de pagar) e o código Pix vai sozinho na
  // mensagem seguinte, para tocar, segurar e copiar
  cobranca: [
    'Olá, {nome_cliente}! Tudo bem? 😊',
    'Hoje é o vencimento da sua mensalidade Pulse ({plano}): *{valor}*.',
    '👉 *Pague por aqui (Pix ou cartão):* {link_pagamento}',
    '💠 Prefere o Pix direto? O código vai na próxima mensagem: toque, segure e copie; no app do seu banco, vá em Pix → Pix Copia e Cola.',
    'Chave: {chave_pix} · {nome_recebedor}',
    '_{aviso_cartao}_',
    'Se já pagou, pode desconsiderar. Obrigada pela confiança! 🧡',
  ].join('\n'),
  // obrigado depois do pagamento confirmado (usuário, 01/11/2026: "uma mensagem profissional e bonita de agradecimento")
  obrigado: [
    'Olá, {nome_cliente}! Tudo bem?',
    'Recebemos o pagamento da sua mensalidade de {mes_ref} ({plano}), no valor de *{valor}*, em {data_pagamento}. ✅',
    'Muito obrigada pela confiança e pela parceria com a Pulse. É um prazer fazer parte da história de vocês e seguir construindo resultados juntos.',
    '{recibo}',
    'Conte sempre com a gente! 🧡',
  ].join('\n'),
  lembrete: [
    'Oi, {nome_cliente}! Não localizamos ainda o pagamento da mensalidade de {mes_ref} ({valor}).',
    'Se já pagou, desconsidere e me desculpe 🙏. Se precisar, é só pagar por aqui (Pix ou cartão): {link_pagamento}',
    'O código Pix vai na próxima mensagem, para copiar.',
  ].join('\n'),
};

// rodapé de toda mensagem ao cliente (pedido do usuário, 01/11/2026: "avisa que é um número de mensagem automática e
// deixa o número do Thiago para entrar em contato"); o contato é o da cidade do cliente (lib/contactByCity.mjs:
// Uruaçu → Thiago, Minaçu → Victor). Editável na tela, vazio = sem rodapé
export const DEFAULT_FOOTER = '—\n_Esta é uma mensagem automática. Para dúvidas, fale com o {contato_nome}: {contato_telefone}._';

/** O rodapé com o contato preenchido; null quando vazio ou sem telefone (não manda "fale com o Victor:" sem número). */
export function footerText(footer, contact = {}) {
  const f = footer === null || footer === undefined ? DEFAULT_FOOTER : String(footer).trim();
  if (!f) return null;
  const out = applyTemplate(f, { contato_nome: contact.name, contato_telefone: contact.phone });
  return /[A-Za-zÀ-ú]/.test(out) ? out : null;
}

/** Mensagem + rodapé (null/undefined = o padrão; texto vazio = sem rodapé). */
export function withFooter(body, footer, contact = { name: 'Thiago', phone: '(62) 98538-2981' }) {
  const f = footerText(footer, contact);
  return f ? `${String(body).trim()}\n\n${f}` : String(body).trim();
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad2 = (n) => String(n).padStart(2, '0');

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Nome do mês de uma data AAAA-MM-DD ("outubro"). */
export const monthName = (dateStr) => MONTHS[Number(String(dateStr).slice(5, 7)) - 1] || '';

/** Mês anterior ("AAAA-MM") de uma data AAAA-MM-DD. */
export function previousMonth(dateStr) {
  const [y, m] = String(dateStr).split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
}

/** Mês seguinte ("AAAA-MM") de um "AAAA-MM". */
export function nextMonth(month) {
  const [y, m] = String(month).split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
}

/** Etapas que caem hoje para um vencimento (pode ser mais de uma: vencimento dia 6 → dia 1 e D−5 juntos). */
export function stepsDueOn(today, dueDate) {
  const steps = [];
  if (today.slice(8, 10) === '01') steps.push('relatorio_mensal');
  if (dueDate && addDays(dueDate, -5) === today) steps.push('pre_vencimento');
  if (dueDate === today) steps.push('cobranca');
  if (dueDate && addDays(dueDate, 3) === today) steps.push('lembrete');
  return steps;
}

/** Datas das 4 etapas no mês do vencimento (para a agenda da tela). */
export function stepDates(dueDate) {
  return {
    relatorio_mensal: `${dueDate.slice(0, 7)}-01`,
    pre_vencimento: addDays(dueDate, -5),
    cobranca: dueDate,
    lembrete: addDays(dueDate, 3),
  };
}

/** Frase de "como melhorar" pelo que aconteceu nas agendas (texto do plano aprovado). */
export function attendanceTip({ done = 0, scheduled = 0, cancelled = 0, avg = null } = {}) {
  if (scheduled > 0 && done >= scheduled && !cancelled) {
    if (avg !== null && avg < 3) return 'Agenda em dia, parabéns! Para render mais vídeos por gravação, vale separar 3 ou 4 temas antes; a Victoria pode mandar os roteiros.';
    return 'Agenda em dia, parabéns! Assim o conteúdo não para.';
  }
  if (cancelled > 0 || done < scheduled) {
    const faltas = Math.max(cancelled, scheduled - done);
    return `Tivemos ${faltas} ${faltas === 1 ? 'gravação remarcada' : 'gravações remarcadas'}. Quanto mais gravações, mais conteúdo no ar: que tal já deixarmos as próximas datas marcadas?`;
  }
  return 'Que tal já deixarmos as próximas gravações marcadas? Assim o conteúdo não para.';
}

// aviso discreto do cartão (usuário, 01/11/2026): a taxa é da facilitadora, a Pulse não cobra nada a mais
export const CARD_NOTICE = 'No cartão de crédito há a taxa da transação, cobrada pela facilitadora de pagamentos. A Pulse não cobra nenhum valor a mais.';

/** Valor no cartão com a taxa repassada: o líquido é a mensalidade (valor ÷ (1 − taxa)). */
export function cardAmount(amount, feePercent) {
  const fee = Math.min(Math.max(Number(feePercent) || 0, 0), 30) / 100;
  return Math.round((Number(amount) / (1 - fee)) * 100) / 100;
}

export const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ── Pix copia e cola (BR Code estático do Banco Central) ──
const tlv = (id, value) => `${id}${pad2(value.length)}${value}`;
const ascii = (s, max) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 .\-@]/g, '').trim().slice(0, max);

export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Pix copia e cola com valor; null sem chave. txid só letras e números (até 25). */
export function pixPayload({ key, name, city, amount, txid = '***' }) {
  const k = String(key || '').trim();
  if (!k) return null;
  const id = String(txid || '***').replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';
  const body = [
    tlv('00', '01'),
    tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', k)),
    tlv('52', '0000'),
    tlv('53', '986'),
    amount ? tlv('54', Number(amount).toFixed(2)) : '',
    tlv('58', 'BR'),
    tlv('59', ascii(name, 25).toUpperCase() || 'PULSE'),
    tlv('60', ascii(city, 15).toUpperCase() || 'MINACU'),
    tlv('62', tlv('05', id)),
    '6304',
  ].join('');
  return body + crc16(body);
}

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) partes.push(r < 20 ? UNIDADES[r] : DEZENAS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNIDADES[r % 10]}` : ''));
  return partes.join(' e ');
}

/** Valor por extenso para o recibo: 1500 → "mil e quinhentos reais"; 1234,56 → "mil, duzentos e trinta e quatro reais e cinquenta e seis centavos". */
export function valorPorExtenso(valor) {
  const total = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(total / 100);
  const centavos = total % 100;
  const grupos = [];
  const milhoes = Math.floor(reais / 1e6);
  const milhares = Math.floor((reais % 1e6) / 1000);
  const resto = reais % 1000;
  if (milhoes) grupos.push(`${ate999(milhoes)} ${milhoes === 1 ? 'milhão' : 'milhões'}`);
  if (milhares) grupos.push(milhares === 1 ? 'mil' : `${ate999(milhares)} mil`);
  if (resto) grupos.push(ate999(resto));
  // "e" antes do último grupo quando ele é redondo (cem, duzentos…) ou menor que cem; vírgula nos demais
  let texto = '';
  grupos.forEach((g, i) => {
    if (i === 0) texto = g;
    else if (i === grupos.length - 1 && (resto < 100 || resto % 100 === 0)) texto += ` e ${g}`;
    else texto += `, ${g}`;
  });
  const partes = [];
  if (reais) partes.push(`${texto}${milhoes && !milhares && !resto ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  if (centavos) partes.push(`${ate999(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return partes.join(' e ') || 'zero real';
}

/** Modelo de cobrança salvo antes da página de pagamento: ganha a linha do link no fim (o cliente sempre recebe). */
export function ensurePayLink(template) {
  const t = String(template || '');
  return t.includes('{link_pagamento}') ? t : `${t}\n👉 Pague por aqui (Pix ou cartão): {link_pagamento}`;
}

/** Token da página de pagamento: 22 caracteres URL-safe (128 bits). */
export function payToken(randomBytes) {
  return Buffer.from(randomBytes(16)).toString('base64url');
}

/** Preenche o modelo; linha com variável vazia sai inteira (sem link, sem rede, sem sugestão). */
export function applyTemplate(template, vars) {
  return String(template || '')
    .split('\n')
    .map((line) => {
      let empty = false;
      const out = line.replace(/\{([a-z_]+)\}/g, (_, name) => {
        const v = vars[name];
        if (v === null || v === undefined || String(v).trim() === '') { empty = true; return ''; }
        return String(v);
      });
      return empty ? null : out;
    })
    .filter((line) => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sugestões do relatório em tópicos. */
export function bulletList(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean)
    .map((t) => (/^[•\-–\d]/.test(t) ? t : `• ${t}`)).join('\n');
}

// ── Conferência antes de cobrar (usuário, 01/11/2026: "entenda os dados, crie o PDF, depois envia no WhatsApp";
//    se algo não bater com o financeiro, não envia e avisa a equipe) ──
const brMonth = (month) => `${month.slice(5, 7)}/${month.slice(0, 4)}`;

/**
 * Problemas que impedem a cobrança do mês; [] quando os números batem com o Financeiro.
 * @param contractValue valor do contrato
 * @param revenues      mensalidades lançadas no mês (revenues sem recorrência extra nem lançamento manual)
 * @param month         "AAAA-MM"
 */
export function checkBillingData({ contractValue, revenues = [], month }) {
  const problems = [];
  const open = revenues.filter((r) => !['recebida', 'pago'].includes(r.status) && r.status !== 'cancelada');
  if (!revenues.length) problems.push(`a mensalidade de ${brMonth(month)} não está lançada em Financeiro → Receitas`);
  if (open.length > 1) problems.push(`há ${open.length} mensalidades de ${brMonth(month)} em aberto (lançamento repetido?)`);
  const r = open[0] || revenues[0];
  if (r) {
    const amount = Number(r.amount);
    if (!(amount > 0)) problems.push(`a mensalidade de ${brMonth(month)} está com valor zerado`);
    else if (Number(contractValue) > 0 && Math.abs(amount - Number(contractValue)) > 0.009) {
      problems.push(`a receita (${brl(amount)}) não bate com o contrato (${brl(contractValue)})`);
    }
    if (!r.due_date) problems.push(`a mensalidade de ${brMonth(month)} está sem vencimento`);
  } else if (!(Number(contractValue) > 0)) {
    problems.push('o contrato está sem valor');
  }
  return problems;
}

/** Situação da conta para o PDF: o que ficou em aberto antes e os últimos pagamentos. */
export function accountSummary(previous = [], { limitPaid = 3 } = {}) {
  const fmt = (r) => `Mensalidade ${brMonth(String(r.reference_month instanceof Date ? r.reference_month.toISOString() : r.reference_month).slice(0, 7))} · ${brl(r.amount)}`;
  const due = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10).split('-').reverse().join('/') : '');
  const open = previous.filter((r) => !['recebida', 'pago', 'cancelada'].includes(r.status));
  const paid = previous.filter((r) => ['recebida', 'pago'].includes(r.status)).slice(0, limitPaid);
  return {
    open: open.map((r) => `${fmt(r)}${r.due_date ? ` · venceu em ${due(r.due_date)}` : ''}`),
    openTotal: open.reduce((a, r) => a + (Number(r.amount) || 0), 0),
    paid: paid.map((r) => `${fmt(r)}${r.paid_at ? ` · paga em ${due(r.paid_at)}` : ''}`),
  };
}

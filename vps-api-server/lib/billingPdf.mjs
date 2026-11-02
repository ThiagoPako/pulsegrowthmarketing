// ─── PDF das mensagens da Ísis ao cliente, no modelo da Pulse (pedido do usuário, 01/11/2026) ─────────────────
// "Os relatórios que são enviados para os clientes das cobranças são em PDF no modelo da Pulse": cabeçalho grafite com
// o logo, laranja da marca (#F15A24), DM Sans. Um só modelo para os 3 documentos:
//   cobrança (dia D e lembrete D+3): emitente e cliente, dados do documento, itens do plano, valor, Pix (QR + copia e
//                                    cola), link do cartão (InfinitePay) e a situação da conta
//   relatório do mês (dia 1):        entregas × plano, vídeos e artes entregues, tempo dedicado, rede social
//                                    (mês × mês anterior), posts de destaque e sugestões
//   agradecimento (D−5):             assiduidade das agendas, resumo do mês, próximo vencimento e como melhorar
// "Deixar mais detalhado e profissional" (usuário, 01/11/2026): blocos de emitente/cliente, faixa de dados, tabelas,
// barras de progresso, comparação com o mês anterior, quadro de destaque e fechamento assinado.
// renderPdf(doc) → Buffer. Sem banco aqui: quem chama monta o doc (lib/billingPdfDocs.mjs).

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'pdf');
const C = {
  fundo: '#0E0E10',
  fundo2: '#1A1A1F',
  laranja: '#F15A24',
  laranjaClaro: '#FFF1EB',
  texto: '#161616',
  cinza: '#6B6B73',
  cinzaClaro: '#F6F6F8',
  linha: '#E6E6EA',
  verde: '#1F9D55',
  verdeClaro: '#E8F6EE',
  vermelho: '#D64545',
  vermelhoClaro: '#FCECEC',
};
export const STATUS_STYLE = {
  aberto: { label: 'EM ABERTO', fg: C.laranja, bg: C.laranjaClaro },
  vencido: { label: 'VENCIDA', fg: C.vermelho, bg: C.vermelhoClaro },
  pago: { label: 'PAGA', fg: C.verde, bg: C.verdeClaro },
  acima: { label: 'ACIMA DO PLANO', fg: C.laranja, bg: C.laranjaClaro },
};

const NO_LIGA = { liga: false, clig: false, dlig: false, rlig: false };
const W = 595.28;
const H = 841.89;
const M = 44;
const CW = W - 2 * M;
const BOTTOM = H - 90;

function fonts(doc) {
  // sem ligaduras: o "fi" juntado vira "f" ao copiar do PDF (estragava o Pix copia e cola e o e-mail da chave)
  const text = doc.text.bind(doc);
  doc.text = (str, ...args) => {
    const i = args.findIndex((a) => a && typeof a === 'object');
    if (i >= 0) args[i] = { features: NO_LIGA, ...args[i] };
    else args.push({ features: NO_LIGA });
    return text(str, ...args);
  };
  doc.registerFont('regular', path.join(ASSETS, 'DMSans-Regular.ttf'));
  doc.registerFont('semibold', path.join(ASSETS, 'DMSans-SemiBold.ttf'));
  doc.registerFont('bold', path.join(ASSETS, 'DMSans-Bold.ttf'));
}

function ensure(doc, need) {
  if (doc.y + need > BOTTOM) { doc.addPage(); doc.y = 50; }
}

function header(doc, { kicker, number, issued }) {
  doc.rect(0, 0, W, 104).fill(C.fundo);
  const logo = path.join(ASSETS, 'pulse-logo.png');
  if (fs.existsSync(logo)) doc.image(logo, M, 36, { height: 32 });
  doc.font('regular').fontSize(8).fillColor('#8C8C96').text('Marketing e produção de conteúdo', M, 74, { width: 260 });
  doc.font('bold').fontSize(9).fillColor(C.laranja).text(kicker.toUpperCase(), M, 36, { width: CW, align: 'right', characterSpacing: 1.5 });
  doc.font('regular').fontSize(9).fillColor('#BDBDC5')
    .text(number ? `Nº ${number}` : '', M, 52, { width: CW, align: 'right' })
    .text(issued ? `Emitido em ${issued}` : '', M, 66, { width: CW, align: 'right' });
  doc.rect(0, 104, W, 4).fill(C.laranja);
  doc.y = 130;
}

function title(doc, text, status, subtitle) {
  const y = doc.y;
  doc.font('bold').fontSize(22).fillColor(C.texto).text(text, M, y, { width: CW - 120 });
  if (status && STATUS_STYLE[status]) {
    const s = STATUS_STYLE[status];
    doc.font('bold').fontSize(9);
    const tw = doc.widthOfString(s.label) + 20;
    doc.roundedRect(W - M - tw, y + 4, tw, 20, 10).fill(s.bg);
    doc.fillColor(s.fg).text(s.label, W - M - tw, y + 10, { width: tw, align: 'center', characterSpacing: 1 });
  }
  doc.y = Math.max(doc.y, y + 28);
  if (subtitle) {
    doc.font('regular').fontSize(10).fillColor(C.cinza).text(subtitle, M, doc.y + 2, { width: CW });
  }
  doc.y += 14;
}

/** Abertura curta (o "Olá, fulano"), em texto corrido. */
function intro(doc, text) {
  doc.font('regular').fontSize(10.5).fillColor(C.texto).text(text, M, doc.y, { width: CW, lineGap: 2.5 });
  doc.y += 16;
}

/** Emitente × cliente, lado a lado. party = { title, name, lines: [] } */
function parties(doc, list) {
  const gap = 12;
  const w = (CW - gap) / 2;
  const y = doc.y;
  const lineH = 13;
  const h = 40 + Math.max(...list.map((p) => (p.lines || []).filter(Boolean).length)) * lineH + 8;
  list.slice(0, 2).forEach((p, i) => {
    const x = M + i * (w + gap);
    doc.roundedRect(x, y, w, h, 10).lineWidth(1).strokeColor(C.linha).stroke();
    doc.rect(x, y + 12, 3, 22).fill(C.laranja);
    doc.font('semibold').fontSize(7.5).fillColor(C.cinza).text(String(p.title).toUpperCase(), x + 14, y + 12, { width: w - 28, characterSpacing: 1 });
    doc.font('bold').fontSize(11).fillColor(C.texto).text(p.name || '—', x + 14, y + 23, { width: w - 28, height: 14, ellipsis: true });
    let ly = y + 42;
    for (const l of (p.lines || []).filter(Boolean)) {
      doc.font('regular').fontSize(8.5).fillColor(C.cinza).text(l, x + 14, ly, { width: w - 28, height: 11, ellipsis: true });
      ly += lineH;
    }
  });
  doc.y = y + h + 14;
}

/** Faixa de dados do documento: [{ label, value }] em colunas iguais, com divisórias. */
function meta(doc, items) {
  const y = doc.y;
  const h = 44;
  const w = CW / items.length;
  doc.roundedRect(M, y, CW, h, 8).fill(C.cinzaClaro);
  items.forEach((it, i) => {
    const x = M + i * w;
    if (i) doc.moveTo(x, y + 10).lineTo(x, y + h - 10).lineWidth(1).strokeColor(C.linha).stroke();
    doc.font('semibold').fontSize(7).fillColor(C.cinza).text(String(it.label).toUpperCase(), x + 12, y + 10, { width: w - 20, characterSpacing: 0.8 });
    doc.font('bold').fontSize(10).fillColor(it.color || C.texto).text(String(it.value ?? '—'), x + 12, y + 23, { width: w - 20, height: 13, ellipsis: true });
  });
  doc.y = y + h + 16;
}

/** Linha de cartões (rótulo pequeno + valor grande + nota opcional). */
function cards(doc, items) {
  const gap = 10;
  const w = (CW - gap * (items.length - 1)) / items.length;
  const y = doc.y;
  const h = items.some((it) => it.note) ? 74 : 62;
  items.forEach((it, i) => {
    const x = M + i * (w + gap);
    doc.roundedRect(x, y, w, h, 10).fill(it.highlight ? C.laranjaClaro : C.cinzaClaro);
    doc.font('semibold').fontSize(8).fillColor(C.cinza).text(String(it.label).toUpperCase(), x + 12, y + 11, { width: w - 24, characterSpacing: 0.8 });
    doc.font('bold').fontSize(it.small ? 12 : 16).fillColor(it.highlight ? C.laranja : C.texto)
      .text(String(it.value ?? '—'), x + 12, y + 27, { width: w - 24, height: 22, ellipsis: true });
    if (it.note) doc.font('regular').fontSize(7.5).fillColor(C.cinza).text(it.note, x + 12, y + 52, { width: w - 24, height: 18, ellipsis: true });
  });
  doc.y = y + h + 18;
}

function section(doc, text, need = 60) {
  ensure(doc, need);
  doc.font('bold').fontSize(11).fillColor(C.laranja).text(text.toUpperCase(), M, doc.y, { characterSpacing: 1.2 });
  doc.y += 6;
}

const cellText = (c) => (c && typeof c === 'object' ? String(c.text ?? '') : String(c ?? ''));
const cellSub = (c) => (c && typeof c === 'object' && c.sub ? String(c.sub) : '');

/**
 * Tabela: colunas [{ label, width, align }] (larguras somam CW; sem width, divididas igualmente), linhas de células
 * (texto ou { text, sub, color, bold }); totals [{label, value}] e total { label, value } opcionais.
 */
function table(doc, columns, rows, { totals = [], total = null } = {}) {
  const free = columns.filter((c) => !c.width);
  const used = columns.reduce((a, c) => a + (c.width || 0), 0);
  const cols = columns.map((c) => ({ ...c, width: c.width || (CW - used) / Math.max(free.length, 1) }));
  const x0 = M;
  const head = () => {
    const y = doc.y;
    doc.font('semibold').fontSize(8);
    // rótulo longo ("Média por gravação") quebra em 2 linhas: o cabeçalho cresce junto
    const hh = Math.max(24, ...cols.map((c) => doc.heightOfString(c.label.toUpperCase(), { width: c.width - 20, characterSpacing: 0.6 }) + 14));
    doc.rect(x0, y, CW, hh).fill(C.fundo2);
    let x = x0;
    doc.fillColor('#FFFFFF');
    for (const c of cols) { doc.text(c.label.toUpperCase(), x + 10, y + 8, { width: c.width - 20, align: c.align || 'left', characterSpacing: 0.6 }); x += c.width; }
    doc.y = y + hh;
  };
  ensure(doc, 60);
  head();
  rows.forEach((r, i) => {
    // altura pela célula mais alta (descrição longa quebra em 2 linhas sem encavalar)
    doc.font('regular').fontSize(9.5);
    const rh = Math.max(26, ...r.map((cell, j) => {
      const sub = cellSub(cell);
      return doc.heightOfString(cellText(cell), { width: cols[j].width - 20 }) + (sub ? doc.fontSize(8).heightOfString(sub, { width: cols[j].width - 20 }) + 3 : 0) + 16;
    }));
    if (doc.y + rh > BOTTOM) { doc.addPage(); doc.y = 50; head(); }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(x0, y, CW, rh).fill('#FAFAFB');
    let x = x0;
    r.forEach((cell, j) => {
      const c = cols[j];
      const bold = cell && typeof cell === 'object' && cell.bold;
      doc.font(bold ? 'semibold' : 'regular').fontSize(9.5).fillColor((cell && cell.color) || C.texto)
        .text(cellText(cell), x + 10, y + 8, { width: c.width - 20, align: c.align || 'left' });
      const sub = cellSub(cell);
      if (sub) doc.font('regular').fontSize(8).fillColor(C.cinza).text(sub, x + 10, doc.y + 2, { width: c.width - 20, align: c.align || 'left' });
      x += c.width;
    });
    doc.y = y + rh;
  });
  let y = doc.y;
  doc.moveTo(x0, y).lineTo(W - M, y).lineWidth(1).strokeColor(C.linha).stroke();
  for (const t of totals) {
    doc.font('regular').fontSize(9.5).fillColor(C.cinza).text(t.label, W - M - 300, y + 8, { width: 140, align: 'right' });
    doc.fillColor(C.texto).text(t.value, W - M - 160, y + 8, { width: 150, align: 'right' });
    y += 20;
  }
  if (total) {
    if (totals.length) { doc.moveTo(W - M - 300, y + 4).lineTo(W - M, y + 4).lineWidth(1).strokeColor(C.linha).stroke(); y += 4; }
    doc.font('bold').fontSize(12).fillColor(C.texto).text(total.label, W - M - 300, y + 10, { width: 140, align: 'right' });
    doc.fillColor(C.laranja).text(total.value, W - M - 160, y + 10, { width: 150, align: 'right' });
    y += 34;
  }
  doc.y = y + 14;
}

function bullets(doc, items) {
  for (const t of items) {
    ensure(doc, 22);
    const y = doc.y;
    doc.circle(M + 4, y + 6, 2.5).fill(C.laranja);
    doc.font('regular').fontSize(10).fillColor(C.texto).text(String(t).replace(/^[•\-–]\s*/, ''), M + 14, y, { width: CW - 14 });
    doc.y += 4;
  }
  doc.y += 8;
}

function paragraph(doc, text) {
  ensure(doc, 30);
  doc.font('regular').fontSize(10).fillColor(C.texto).text(text, M, doc.y, { width: CW, lineGap: 2 });
  doc.y += 12;
}

/** Barras de progresso: [{ label, done, goal, note? }] — "done de goal" e a %; sem meta, só o número. */
function progress(doc, rows) {
  for (const r of rows) {
    ensure(doc, 34);
    const y = doc.y;
    const goal = Number(r.goal) || 0;
    const done = Number(r.done) || 0;
    doc.font('semibold').fontSize(9.5).fillColor(C.texto).text(r.label, M, y, { width: 150 });
    const right = goal ? `${done} de ${goal}` : String(done);
    const pct = goal ? Math.round((done / goal) * 100) : null;
    doc.font('bold').fontSize(9.5).fillColor(C.texto).text(right, W - M - 120, y, { width: 72, align: 'right' });
    if (pct !== null) doc.font('semibold').fontSize(9).fillColor(pct >= 100 ? C.verde : C.laranja).text(`${pct}%`, W - M - 44, y, { width: 44, align: 'right' });
    const bx = M + 160;
    const bw = W - M - 130 - bx;
    doc.roundedRect(bx, y + 3, bw, 7, 3.5).fill('#EDEDF0');
    if (goal) doc.roundedRect(bx, y + 3, Math.max(7, bw * Math.min(done / goal, 1)), 7, 3.5).fill(pct >= 100 ? C.verde : C.laranja);
    else if (done) doc.roundedRect(bx, y + 3, bw, 7, 3.5).fill('#CFCFD6');
    if (r.note) doc.font('regular').fontSize(7.5).fillColor(C.cinza).text(r.note, M, y + 13, { width: 150 });
    doc.y = y + (r.note ? 30 : 22);
  }
  doc.y += 8;
}

/** Barras horizontais proporcionais: [{ label, value, display }]. */
function bars(doc, rows) {
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 0.0001);
  for (const r of rows) {
    ensure(doc, 22);
    const y = doc.y;
    doc.font('regular').fontSize(9.5).fillColor(C.texto).text(r.label, M, y, { width: 150 });
    const bx = M + 160;
    const bw = W - M - 80 - bx;
    doc.roundedRect(bx, y + 2, bw, 9, 3).fill('#EDEDF0');
    doc.roundedRect(bx, y + 2, Math.max(4, bw * ((Number(r.value) || 0) / max)), 9, 3).fill(C.laranja);
    doc.font('bold').fontSize(9.5).fillColor(C.texto).text(r.display ?? String(r.value), W - M - 70, y, { width: 70, align: 'right' });
    doc.y = y + 20;
  }
  doc.y += 8;
}

/** Mês × mês anterior: [{ label, previous, current, change, display? }] (change em número; + verde, − vermelho). */
function compare(doc, rows, { previousLabel = 'Mês anterior', currentLabel = 'Este mês' } = {}) {
  const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR'));
  table(doc, [
    { label: 'Indicador' },
    { label: previousLabel, width: 110, align: 'right' },
    { label: currentLabel, width: 110, align: 'right' },
    { label: 'Variação', width: 100, align: 'right' },
  ], rows.map((r) => {
    const ch = r.change === null || r.change === undefined ? null : Number(r.change);
    const pct = ch !== null && r.previous ? ` (${ch >= 0 ? '+' : '−'}${Math.abs(Math.round((ch / Number(r.previous)) * 100))}%)` : '';
    return [
      { text: r.label, bold: true },
      fmt(r.previous),
      { text: fmt(r.current), bold: true },
      ch === null ? '—' : { text: `${ch >= 0 ? '+' : '−'}${Math.abs(ch).toLocaleString('pt-BR')}${pct}`, color: ch > 0 ? C.verde : ch < 0 ? C.vermelho : C.cinza, bold: true },
    ];
  }));
}

/** Quadro de destaque (fundo laranja claro, filete à esquerda). */
function callout(doc, { title: t, text, tone }) {
  doc.font('regular').fontSize(10);
  const th = doc.heightOfString(text, { width: CW - 40, lineGap: 2 });
  const h = th + (t ? 40 : 24);
  ensure(doc, h + 10);
  const y = doc.y;
  const verde = tone === 'verde';
  doc.roundedRect(M, y, CW, h, 10).fill(verde ? C.verdeClaro : C.laranjaClaro);
  doc.rect(M, y, 4, h).fill(verde ? C.verde : C.laranja);
  let ty = y + 12;
  if (t) { doc.font('bold').fontSize(10.5).fillColor(C.texto).text(t, M + 20, ty, { width: CW - 40 }); ty += 17; }
  doc.font('regular').fontSize(10).fillColor(C.texto).text(text, M + 20, ty, { width: CW - 40, lineGap: 2 });
  doc.y = y + h + 16;
}

/**
 * Quadros do que foi entregue (relatório para mostrar serviço; usuário, 01/11/2026): número grande, nome e, quando
 * passou do plano, selo verde ("+3 além do plano"). Nada de "faltou": o que ficou abaixo do plano é só o número.
 * tiles = [{ label, value, badge?, highlight? }], 3 por linha.
 */
function tiles(doc, items) {
  const per = 3;
  const gap = 10;
  const w = (CW - gap * (per - 1)) / per;
  const h = 78;
  for (let i = 0; i < items.length; i += per) {
    ensure(doc, h + 10);
    const y = doc.y;
    items.slice(i, i + per).forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.roundedRect(x, y, w, h, 10).fill(it.highlight ? C.laranjaClaro : C.cinzaClaro);
      doc.font('bold').fontSize(26).fillColor(it.highlight ? C.laranja : C.texto).text(String(it.value), x + 14, y + 12, { width: w - 28, height: 32 });
      doc.font('semibold').fontSize(9.5).fillColor(C.texto).text(it.label, x + 14, y + 44, { width: w - 28, height: 13, ellipsis: true });
      if (it.badge) {
        doc.font('bold').fontSize(7.5);
        const bw = Math.min(doc.widthOfString(it.badge) + 14, w - 28);
        doc.roundedRect(x + 14, y + 59, bw, 13, 6.5).fill(it.highlight ? C.laranja : '#E3E3E8');
        doc.fillColor(it.highlight ? '#FFFFFF' : C.cinza).text(it.badge, x + 14, y + 62, { width: bw, align: 'center' });
      }
    });
    doc.y = y + h + gap;
  }
  doc.y += 6;
}

async function payment(doc, pay) {
  const h = 176;
  ensure(doc, h + 2);
  const y = doc.y;
  const gap = 12;
  const w = (CW - gap) / 2;
  // Pix (preferencial)
  doc.roundedRect(M, y, w, h, 12).lineWidth(1.5).strokeColor(C.laranja).stroke();
  doc.font('bold').fontSize(11).fillColor(C.texto).text('Pix', M + 14, y + 12);
  doc.font('semibold').fontSize(8).fillColor(C.laranja).text('PREFERENCIAL', M + 40, y + 15, { characterSpacing: 1 });
  if (pay.pixPayload) {
    const qr = await QRCode.toBuffer(pay.pixPayload, { margin: 0, width: 220, color: { dark: C.texto, light: '#FFFFFF' } });
    doc.image(qr, M + 14, y + 34, { width: 92 });
    doc.font('semibold').fontSize(7.5).fillColor(C.cinza).text('PIX COPIA E COLA', M + 116, y + 36, { characterSpacing: 0.6 });
    doc.font('regular').fontSize(6.5).fillColor(C.texto).text(pay.pixPayload, M + 116, y + 48, { width: w - 130, height: 70, ellipsis: true });
  } else {
    doc.font('regular').fontSize(9).fillColor(C.cinza).text('Chave Pix não cadastrada.', M + 14, y + 40, { width: w - 28 });
  }
  doc.font('regular').fontSize(8.5).fillColor(C.texto)
    .text(`Chave: ${pay.pixKey || '—'}`, M + 14, y + 134, { width: w - 28 })
    .text(pay.receiver || '', M + 14, y + 148, { width: w - 28 });
  // cartão (InfinitePay)
  const x2 = M + w + gap;
  doc.roundedRect(x2, y, w, h, 12).fill(C.cinzaClaro);
  if (pay.payUrl) {
    // página de pagamento (/pagar/<token>): botão de copiar o Pix e o checkout da InfinitePay (Pix ou cartão)
    doc.font('bold').fontSize(11).fillColor(C.texto).text('Pagar agora', x2 + 14, y + 12);
    doc.font('regular').fontSize(9).fillColor(C.cinza)
      .text(`Na página de pagamento você copia o Pix com um toque${pay.cardLink ? ' ou paga no cartão em até 12x' : ''}.`, x2 + 14, y + 34, { width: w - 28 });
    doc.font('bold').fontSize(18).fillColor(C.texto).text(pay.cardAmount || pay.amount || '', x2 + 14, y + 66, { width: w - 28 });
    const by = y + 98;
    doc.roundedRect(x2 + 14, by, w - 28, 30, 15).fill(C.laranja);
    doc.font('bold').fontSize(10).fillColor('#FFFFFF').text('Pagar agora', x2 + 14, by + 9, { width: w - 28, align: 'center', link: pay.payUrl, underline: false });
    doc.link(x2 + 14, by, w - 28, 30, pay.payUrl);
    doc.font('regular').fontSize(6.5).fillColor(C.cinza).text(pay.payUrl, x2 + 14, by + 36, { width: w - 28, link: pay.payUrl, ellipsis: true, height: 10 });
    if (pay.cardLink && pay.cardNotice) doc.font('regular').fontSize(6.5).fillColor(C.cinza).text(pay.cardNotice, x2 + 14, by + 48, { width: w - 28 });
    doc.y = y + h + 18;
    return;
  }
  doc.font('bold').fontSize(11).fillColor(C.texto).text('Cartão', x2 + 14, y + 12);
  if (pay.cardLink) {
    doc.font('regular').fontSize(9).fillColor(C.cinza).text('Pelo link da InfinitePay, em até 12x.', x2 + 14, y + 34, { width: w - 28 });
    doc.font('bold').fontSize(18).fillColor(C.texto).text(pay.cardAmount || '', x2 + 14, y + 60, { width: w - 28 });
    const by = y + 98;
    doc.roundedRect(x2 + 14, by, w - 28, 30, 15).fill(C.laranja);
    doc.font('bold').fontSize(10).fillColor('#FFFFFF').text('Pagar no cartão', x2 + 14, by + 9, { width: w - 28, align: 'center', link: pay.cardLink, underline: false });
    doc.link(x2 + 14, by, w - 28, 30, pay.cardLink);
    doc.font('regular').fontSize(6.5).fillColor(C.cinza).text(pay.cardLink, x2 + 14, by + 36, { width: w - 28, link: pay.cardLink, ellipsis: true, height: 10 });
    // aviso discreto: a taxa do cartão é da facilitadora, a Pulse não cobra nada a mais
    if (pay.cardNotice) doc.font('regular').fontSize(6.5).fillColor(C.cinza).text(pay.cardNotice, x2 + 14, by + 48, { width: w - 28 });
  } else {
    doc.font('regular').fontSize(9).fillColor(C.cinza).text('Pagamento no cartão: fale com a gente pelo contato abaixo.', x2 + 14, y + 34, { width: w - 28 });
  }
  doc.y = y + h + 18;
}

/** Fechamento assinado. */
function closing(doc, { text, signature, role, band }) {
  ensure(doc, band ? 170 : 80);
  doc.y += 4;
  if (text) { doc.font('regular').fontSize(10).fillColor(C.texto).text(text, M, doc.y, { width: CW, lineGap: 2 }); doc.y += 14; }
  doc.moveTo(M, doc.y).lineTo(M + 40, doc.y).lineWidth(2).strokeColor(C.laranja).stroke();
  doc.y += 8;
  doc.font('bold').fontSize(10.5).fillColor(C.texto).text(signature || 'Agência Pulse', M, doc.y, { width: CW });
  if (role) doc.font('regular').fontSize(9).fillColor(C.cinza).text(role, M, doc.y + 1, { width: CW });
  doc.y += 10;
  if (band) {
    // faixa final: logo da Pulse e o contato da cidade
    const y = doc.y + 8;
    doc.roundedRect(M, y, CW, 64, 12).fill(C.fundo);
    const logo = path.join(ASSETS, 'pulse-logo.png');
    if (fs.existsSync(logo)) doc.image(logo, M + 20, y + 20, { height: 24 });
    doc.font('regular').fontSize(9).fillColor('#BDBDC5').text(band, M + 180, y + 18, { width: CW - 200, align: 'right' });
    doc.font('semibold').fontSize(9).fillColor(C.laranja).text('@agenciapulse', M + 180, y + 34, { width: CW - 200, align: 'right' });
    doc.y = y + 64 + 10;
  }
}

// ── relatório premium (usuário, 01/11/2026: "muito bem elaborado, bonito ... cara de material premium") ──

const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';

/** Foto redonda (buffer PNG/JPEG) ou círculo laranja com as iniciais. */
function avatar(doc, x, y, size, image, name, { ring = C.laranja } = {}) {
  doc.circle(x + size / 2, y + size / 2, size / 2 + 2).fill(ring);
  if (image) {
    try {
      doc.save();
      doc.circle(x + size / 2, y + size / 2, size / 2).clip();
      doc.image(image, x, y, { cover: [size, size], align: 'center', valign: 'center' });
      doc.restore();
      return;
    } catch {
      doc.restore();
    }
  }
  doc.circle(x + size / 2, y + size / 2, size / 2).fill(C.fundo2);
  doc.font('bold').fontSize(size * 0.36).fillColor('#FFFFFF').text(iniciais(name), x, y + size * 0.3, { width: size, align: 'center' });
}

/** Capa: grafite, logo da Pulse, logo do cliente num círculo, o mês e o agradecimento. */
function cover(doc, c) {
  doc.rect(0, 0, W, H).fill(C.fundo);
  doc.rect(0, 0, 8, H).fill(C.laranja);
  const logo = path.join(ASSETS, 'pulse-logo.png');
  if (fs.existsSync(logo)) doc.image(logo, M + 10, 54, { height: 30 });
  doc.font('bold').fontSize(9).fillColor(C.laranja).text((c.kicker || 'RELATÓRIO DO MÊS').toUpperCase(), M, 64, { width: CW, align: 'right', characterSpacing: 2 });
  // logo do cliente num círculo branco
  const size = 132;
  const cx = M + 10;
  const cy = 210;
  doc.circle(cx + size / 2, cy + size / 2, size / 2 + 4).fill(C.laranja);
  doc.circle(cx + size / 2, cy + size / 2, size / 2).fill('#FFFFFF');
  let drew = false;
  if (c.logo) {
    try {
      doc.save();
      doc.circle(cx + size / 2, cy + size / 2, size / 2 - 6).clip();
      doc.image(c.logo, cx + 12, cy + 12, { fit: [size - 24, size - 24], align: 'center', valign: 'center' });
      doc.restore();
      drew = true;
    } catch {
      doc.restore();
    }
  }
  if (!drew) doc.font('bold').fontSize(44).fillColor(C.fundo).text(iniciais(c.client), cx, cy + 40, { width: size, align: 'center' });
  doc.font('semibold').fontSize(13).fillColor('#BDBDC5').text(c.client, M + 10, 372, { width: CW - 20 });
  doc.font('bold').fontSize(12).fillColor(C.laranja).text(String(c.month || '').toUpperCase(), M + 10, 394, { width: CW - 20, characterSpacing: 2 });
  doc.font('bold').fontSize(40).fillColor('#FFFFFF').text(c.title || 'O que entregamos para você', M + 10, 430, { width: CW - 40, lineGap: -4 });
  doc.rect(M + 10, doc.y + 18, 56, 4).fill(C.laranja);
  if (c.thanks) doc.font('regular').fontSize(13).fillColor('#D8D8DE').text(c.thanks, M + 10, doc.y + 40, { width: CW - 80, lineGap: 4 });
  if (c.badge) {
    doc.font('bold').fontSize(10);
    const bw = doc.widthOfString(c.badge, { characterSpacing: 1 }) + 28;
    doc.roundedRect(M + 10, H - 150, bw, 28, 14).fill(C.laranja);
    doc.fillColor('#FFFFFF').text(c.badge, M + 24, H - 141, { characterSpacing: 1, lineBreak: false });
  }
  doc.font('regular').fontSize(9).fillColor('#8C8C96').text('Agência Pulse · @agenciapulse', M + 10, H - 70, { width: CW - 20 });
  doc.font('regular').fontSize(9).fillColor('#8C8C96').text(c.footer || '', M + 10, H - 70, { width: CW - 20, align: 'right' });
}

const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MARK = {
  gravacao: { fill: C.laranja, fg: '#FFFFFF', legend: 'Gravação agendada' },
  feriado: { fill: C.fundo2, fg: '#FFFFFF', legend: 'Feriado · arte de aviso' },
  sazonal: { fill: C.laranjaClaro, fg: C.laranja, legend: 'Data do seu nicho' },
};

/** Calendário editorial do mês: grade domingo a sábado com as marcas e a legenda. */
function calendar(doc, { month, marks = [] }) {
  const [y, m] = String(month).split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((first + days) / 7);
  const cw = CW / 7;
  const ch = 64;
  ensure(doc, 26 + weeks * ch + 40);
  let top = doc.y;
  // cabeçalho dos dias da semana
  doc.roundedRect(M, top, CW, 22, 6).fill(C.fundo);
  SEMANA.forEach((d, i) => doc.font('bold').fontSize(7.5).fillColor(i === 0 ? C.laranja : '#FFFFFF').text(d, M + i * cw, top + 7, { width: cw, align: 'center', characterSpacing: 1 }));
  top += 26;
  const byDay = {};
  for (const mk of marks) (byDay[Number(String(mk.date).slice(8, 10))] ||= []).push(mk);
  for (let day = 1; day <= days; day++) {
    const idx = first + day - 1;
    const x = M + (idx % 7) * cw;
    const yy = top + Math.floor(idx / 7) * ch;
    const list = byDay[day] || [];
    doc.roundedRect(x + 2, yy + 2, cw - 4, ch - 4, 6).fill(list.length ? '#FFFFFF' : C.cinzaClaro);
    if (list.length) doc.roundedRect(x + 2, yy + 2, cw - 4, ch - 4, 6).lineWidth(1).strokeColor(C.linha).stroke();
    doc.font('bold').fontSize(10).fillColor(list.length ? C.texto : '#A6A6AE').text(String(day), x + 8, yy + 7, { width: cw - 16 });
    let my = yy + 22;
    for (const mk of list.slice(0, 2)) {
      const st = MARK[mk.kind] || MARK.sazonal;
      doc.roundedRect(x + 5, my, cw - 10, 17, 4).fill(st.fill);
      doc.font('semibold').fontSize(6.3).fillColor(st.fg).text(mk.short || mk.text, x + 8, my + 3.5, { width: cw - 16, height: 11, ellipsis: true, lineBreak: false });
      my += 19;
    }
  }
  doc.y = top + weeks * ch + 8;
  // legenda
  let lx = M;
  for (const kind of ['gravacao', 'feriado', 'sazonal']) {
    if (!marks.some((mk) => mk.kind === kind)) continue;
    const st = MARK[kind];
    doc.roundedRect(lx, doc.y + 2, 10, 10, 2).fill(st.fill);
    if (kind === 'sazonal') doc.roundedRect(lx, doc.y + 2, 10, 10, 2).lineWidth(0.8).strokeColor(C.laranja).stroke();
    doc.font('regular').fontSize(8.5).fillColor(C.cinza).text(st.legend, lx + 15, doc.y + 2, { lineBreak: false });
    lx += doc.widthOfString(st.legend) + 40;
  }
  doc.y += 26;
}

/** Galeria de destaques (capa do vídeo + título), 3 por linha. */
function gallery(doc, items) {
  const per = 3;
  const gap = 12;
  const w = (CW - gap * (per - 1)) / per;
  const ih = 190;
  for (let i = 0; i < items.length; i += per) {
    ensure(doc, ih + 50);
    const y = doc.y;
    items.slice(i, i + per).forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.save();
      doc.roundedRect(x, y, w, ih, 10).clip();
      doc.rect(x, y, w, ih).fill(C.fundo2);
      try { doc.image(it.image, x, y, { cover: [w, ih], align: 'center', valign: 'center' }); } catch { /* sem imagem: fica o fundo */ }
      doc.restore();
      if (it.tag) {
        doc.font('bold').fontSize(7);
        const tw = doc.widthOfString(it.tag) + 12;
        doc.roundedRect(x + 8, y + 8, tw, 14, 7).fill(C.laranja);
        doc.fillColor('#FFFFFF').text(it.tag, x + 8, y + 11.5, { width: tw, align: 'center' });
      }
      doc.font('semibold').fontSize(9).fillColor(C.texto).text(it.title, x, y + ih + 6, { width: w, height: 24, ellipsis: true });
    });
    doc.y = y + ih + 38;
  }
}

/** Portal do cliente: chamada, botão grande clicável e o QR. */
async function portal(doc, { url, title, text }) {
  const h = 128;
  ensure(doc, h + 10);
  const y = doc.y;
  doc.roundedRect(M, y, CW, h, 14).fill(C.fundo);
  doc.font('bold').fontSize(15).fillColor('#FFFFFF').text(title || 'Seu portal Pulse', M + 22, y + 18, { width: CW - 170 });
  if (text) doc.font('regular').fontSize(9.5).fillColor('#D8D8DE').text(text, M + 22, y + 40, { width: CW - 170, lineGap: 1.5 });
  const by = y + h - 44;
  doc.roundedRect(M + 22, by, 210, 28, 14).fill(C.laranja);
  doc.font('bold').fontSize(10).fillColor('#FFFFFF').text('Abrir meu portal', M + 22, by + 8.5, { width: 210, align: 'center', link: url, underline: false });
  doc.link(M + 22, by, 210, 28, url);
  try {
    const qr = await QRCode.toBuffer(url, { margin: 1, width: 240, color: { dark: '#0E0E10', light: '#FFFFFF' } });
    doc.roundedRect(W - M - 118, y + 14, 100, 100, 8).fill('#FFFFFF');
    doc.image(qr, W - M - 114, y + 18, { width: 92 });
  } catch { /* sem QR */ }
  doc.font('regular').fontSize(7).fillColor('#8C8C96').text(url, M + 242, by + 10, { width: CW - 380, height: 10, ellipsis: true, link: url });
  doc.y = y + h + 18;
}

/** Equipe do projeto: fotos redondas com nome e função, 4 por linha. */
function team(doc, people) {
  const per = 4;
  const w = CW / per;
  const size = 58;
  for (let i = 0; i < people.length; i += per) {
    ensure(doc, size + 50);
    const y = doc.y;
    people.slice(i, i + per).forEach((p, j) => {
      const x = M + j * w;
      avatar(doc, x + (w - size) / 2, y + 2, size, p.photo, p.name, { ring: p.agent ? C.fundo2 : C.laranja });
      doc.font('bold').fontSize(9.5).fillColor(C.texto).text(p.name, x + 4, y + size + 10, { width: w - 8, align: 'center', height: 13, ellipsis: true });
      doc.font('regular').fontSize(8).fillColor(C.cinza).text(p.role || '', x + 4, y + size + 24, { width: w - 8, align: 'center', height: 20, ellipsis: true });
    });
    doc.y = y + size + 50;
  }
  doc.y += 4;
}

function footer(doc, { note, contact, generated, skipFirst = false }) {
  const range = doc.bufferedPageRange();
  const start = range.start + (skipFirst ? 1 : 0);
  const count = range.count - (skipFirst ? 1 : 0);
  for (let i = start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = H - 70;
    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(1).strokeColor(C.linha).stroke();
    doc.font('regular').fontSize(8).fillColor(C.cinza)
      .text(note || '', M, y + 10, { width: CW - 160, lineBreak: true, height: 22 });
    doc.text([contact, generated].filter(Boolean).join(' · '), M, y + 34, { width: CW - 160, height: 11, ellipsis: true });
    doc.font('semibold').fontSize(8).fillColor(C.texto).text('Agência Pulse · @agenciapulse', W - M - 150, y + 10, { width: 150, align: 'right' });
    doc.font('regular').fontSize(8).fillColor(C.cinza).text(`página ${i - start + 1} de ${count}`, W - M - 150, y + 24, { width: 150, align: 'right' });
    doc.rect(0, H - 8, W, 8).fill(C.laranja);
  }
}

async function block(doc, s) {
  // o título não fica sozinho no pé da página: reserva o começo do bloco junto
  const need = { table: 110, compare: 110, progress: 90, bars: 80, callout: 90, tiles: 110, calendar: 440, gallery: 260, portal: 160, team: 130 }[s.type] || 60;
  if (s.title) section(doc, s.title, need);
  switch (s.type) {
    case 'table': table(doc, s.columns, s.rows, { totals: s.totals, total: s.total }); break;
    case 'progress': progress(doc, s.rows); break;
    case 'bars': bars(doc, s.rows); break;
    case 'compare': compare(doc, s.rows, s); break;
    case 'callout': callout(doc, { title: s.heading, text: s.text, tone: s.tone }); break;
    case 'tiles': tiles(doc, s.rows); break;
    case 'calendar': calendar(doc, s); break;
    case 'gallery': gallery(doc, s.items); break;
    case 'portal': await portal(doc, { url: s.url, title: s.heading, text: s.text }); break;
    case 'team': team(doc, s.people); break;
    default:
      if (s.text) paragraph(doc, s.text);
      if (s.bullets?.length) bullets(doc, s.bullets);
      if (s.note) { doc.font('regular').fontSize(8.5).fillColor(C.cinza).text(s.note, M, doc.y - 4, { width: CW }); doc.y += 10; }
  }
}

/**
 * Monta o PDF.
 * doc = { kind: 'cobranca'|'relatorio'|'agradecimento', number, issued, title, subtitle?, status?, intro?,
 *         parties?: [{ title, name, lines }], meta?: [{ label, value }], cards?: [{ label, value, note?, highlight? }],
 *         table?: { title, columns, rows, totals?, total? }, payment?: {...},
 *         sections?: [{ title, type?: 'table'|'progress'|'bars'|'compare'|'callout', text?, bullets?, ... }],
 *         closing?: { text, signature, role }, footerNote, footerContact, generated? }
 */
export async function renderPdf(d) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: d.title, Author: 'Agência Pulse', Subject: d.subtitle || d.title } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  fonts(doc);
  // capa (relatório premium): página inteira, sem rodapé; o conteúdo começa na página seguinte
  if (d.cover) { cover(doc, d.cover); doc.addPage(); }
  header(doc, { kicker: { cobranca: 'Cobrança', relatorio: 'Relatório do mês', agradecimento: 'Agenda e parceria', recibo: 'Recibo' }[d.kind] || 'Pulse', number: d.number, issued: d.issued });
  title(doc, d.title, d.status, d.subtitle);
  if (d.intro) intro(doc, d.intro);
  if (d.parties?.length) parties(doc, d.parties);
  if (d.meta?.length) meta(doc, d.meta);
  if (d.cards?.length) cards(doc, d.cards);
  if (d.table) { section(doc, d.table.title || 'Itens'); table(doc, d.table.columns, d.table.rows, { totals: d.table.totals, total: d.table.total }); }
  if (d.payment) { section(doc, 'Como pagar', 200); await payment(doc, d.payment); }
  for (const s of d.sections || []) await block(doc, s);
  if (d.closing) closing(doc, d.closing);
  footer(doc, { note: d.footerNote, contact: d.footerContact, generated: d.generated, skipFirst: !!d.cover });
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

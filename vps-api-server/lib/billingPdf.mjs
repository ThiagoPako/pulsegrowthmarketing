// ─── PDF das mensagens da Ísis ao cliente, no modelo da Pulse (pedido do usuário, 01/11/2026) ─────────────────
// "Os relatórios que são enviados para os clientes das cobranças são em PDF no modelo da Pulse": cabeçalho grafite com
// o logo, laranja da marca (#F15A24), DM Sans. Um só modelo para os 3 documentos:
//   cobrança (dia D e lembrete D+3): cliente, competência, itens, valor, vencimento, situação, Pix (QR + copia e cola)
//                                    e link do cartão (InfinitePay)
//   relatório do mês (dia 1):        entregas, tempo dedicado, rede social e sugestões
//   agradecimento (D−5):             assiduidade das agendas e como melhorar
// renderPdf(doc) → Buffer. Sem banco aqui: quem chama monta o doc (billingIsisRoutes.mjs).

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
};

const NO_LIGA = { liga: false, clig: false, dlig: false, rlig: false };
const W = 595.28;
const M = 44;

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

function header(doc, { kicker, number, issued }) {
  doc.rect(0, 0, W, 104).fill(C.fundo);
  const logo = path.join(ASSETS, 'pulse-logo.png');
  if (fs.existsSync(logo)) doc.image(logo, M, 36, { height: 32 });
  doc.font('bold').fontSize(9).fillColor(C.laranja).text(kicker.toUpperCase(), M, 36, { width: W - 2 * M, align: 'right', characterSpacing: 1.5 });
  doc.font('regular').fontSize(9).fillColor('#BDBDC5')
    .text(number ? `Nº ${number}` : '', M, 52, { width: W - 2 * M, align: 'right' })
    .text(issued ? `Emitido em ${issued}` : '', M, 66, { width: W - 2 * M, align: 'right' });
  doc.rect(0, 104, W, 4).fill(C.laranja);
  doc.y = 132;
}

function title(doc, text, status) {
  const y = doc.y;
  doc.font('bold').fontSize(22).fillColor(C.texto).text(text, M, y, { width: W - 2 * M - 120 });
  if (status && STATUS_STYLE[status]) {
    const s = STATUS_STYLE[status];
    doc.font('bold').fontSize(9);
    const tw = doc.widthOfString(s.label) + 20;
    doc.roundedRect(W - M - tw, y + 4, tw, 20, 10).fill(s.bg);
    doc.fillColor(s.fg).text(s.label, W - M - tw, y + 10, { width: tw, align: 'center', characterSpacing: 1 });
  }
  doc.y = Math.max(doc.y, y + 30) + 14;
}

/** Linha de cartões (rótulo pequeno + valor grande). */
function cards(doc, items) {
  const gap = 10;
  const w = (W - 2 * M - gap * (items.length - 1)) / items.length;
  const y = doc.y;
  const h = 62;
  items.forEach((it, i) => {
    const x = M + i * (w + gap);
    doc.roundedRect(x, y, w, h, 10).fill(it.highlight ? C.laranjaClaro : '#F6F6F8');
    doc.font('semibold').fontSize(8).fillColor(C.cinza).text(String(it.label).toUpperCase(), x + 12, y + 11, { width: w - 24, characterSpacing: 0.8 });
    doc.font('bold').fontSize(it.small ? 12 : 16).fillColor(it.highlight ? C.laranja : C.texto)
      .text(String(it.value ?? '—'), x + 12, y + 27, { width: w - 24, height: 30, ellipsis: true });
  });
  doc.y = y + h + 18;
}

function section(doc, text) {
  ensure(doc, 60);
  doc.font('bold').fontSize(11).fillColor(C.laranja).text(text.toUpperCase(), M, doc.y, { characterSpacing: 1.2 });
  doc.moveDown(0.4);
}

function ensure(doc, need) {
  if (doc.y + need > 842 - 90) { doc.addPage(); doc.y = 50; }
}

/** Tabela simples: colunas [{ label, width, align }], linhas de textos; total opcional. */
function table(doc, columns, rows, total) {
  const x0 = M;
  let y = doc.y;
  doc.rect(x0, y, W - 2 * M, 24).fill(C.fundo2);
  let x = x0;
  doc.font('semibold').fontSize(8.5).fillColor('#FFFFFF');
  for (const c of columns) { doc.text(c.label.toUpperCase(), x + 10, y + 8, { width: c.width - 20, align: c.align || 'left', characterSpacing: 0.6 }); x += c.width; }
  y += 24;
  doc.font('regular').fontSize(10).fillColor(C.texto);
  rows.forEach((r, i) => {
    // altura pela célula mais alta (descrição longa quebra em 2 linhas sem encavalar)
    const rh = Math.max(26, ...r.map((cell, j) => doc.heightOfString(String(cell ?? ''), { width: columns[j].width - 20 }) + 16));
    ensure(doc, rh + 2);
    if (i % 2 === 1) doc.rect(x0, y, W - 2 * M, rh).fill('#FAFAFB');
    x = x0;
    doc.fillColor(C.texto);
    r.forEach((cell, j) => { doc.text(String(cell ?? ''), x + 10, y + 8, { width: columns[j].width - 20, align: columns[j].align || 'left' }); x += columns[j].width; });
    y += rh;
  });
  doc.moveTo(x0, y).lineTo(W - M, y).lineWidth(1).strokeColor(C.linha).stroke();
  if (total) {
    doc.font('bold').fontSize(12).fillColor(C.texto).text(total.label, x0 + 10, y + 10, { width: W - 2 * M - 160 });
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
    doc.font('regular').fontSize(10.5).fillColor(C.texto).text(String(t).replace(/^[•\-–]\s*/, ''), M + 14, y, { width: W - 2 * M - 14 });
    doc.moveDown(0.35);
  }
  doc.moveDown(0.4);
}

function paragraph(doc, text) {
  ensure(doc, 30);
  doc.font('regular').fontSize(10.5).fillColor(C.texto).text(text, M, doc.y, { width: W - 2 * M, lineGap: 2 });
  doc.moveDown(0.8);
}

async function payment(doc, pay) {
  ensure(doc, 190);
  const y = doc.y;
  const gap = 12;
  const w = (W - 2 * M - gap) / 2;
  const h = 176;
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
  doc.roundedRect(x2, y, w, h, 12).fill('#F6F6F8');
  doc.font('bold').fontSize(11).fillColor(C.texto).text('Cartão', x2 + 14, y + 12);
  if (pay.cardLink) {
    doc.font('regular').fontSize(9).fillColor(C.cinza).text('Pelo link da InfinitePay, em até 12x.', x2 + 14, y + 34, { width: w - 28 });
    doc.font('bold').fontSize(18).fillColor(C.texto).text(pay.cardAmount || '', x2 + 14, y + 72, { width: w - 28 });
    const by = y + 112;
    doc.roundedRect(x2 + 14, by, w - 28, 30, 15).fill(C.laranja);
    doc.font('bold').fontSize(10).fillColor('#FFFFFF').text('Pagar no cartão', x2 + 14, by + 9, { width: w - 28, align: 'center', link: pay.cardLink, underline: false });
    doc.link(x2 + 14, by, w - 28, 30, pay.cardLink);
    doc.font('regular').fontSize(6.5).fillColor(C.cinza).text(pay.cardLink, x2 + 14, by + 36, { width: w - 28, link: pay.cardLink, ellipsis: true, height: 10 });
  } else {
    doc.font('regular').fontSize(9).fillColor(C.cinza).text('Pagamento no cartão: fale com a gente pelo contato abaixo.', x2 + 14, y + 34, { width: w - 28 });
  }
  doc.y = y + h + 18;
}

function footer(doc, { note, contact }) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = 842 - 70;
    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(1).strokeColor(C.linha).stroke();
    doc.font('regular').fontSize(8).fillColor(C.cinza)
      .text(note || '', M, y + 10, { width: W - 2 * M - 120, lineBreak: true, height: 30 });
    doc.text(contact || '', M, y + 34, { width: W - 2 * M - 120 });
    doc.font('semibold').fontSize(8).fillColor(C.texto).text('Agência Pulse · @agenciapulse', W - M - 150, y + 10, { width: 150, align: 'right' });
    doc.font('regular').fontSize(8).fillColor(C.cinza).text(`página ${i - range.start + 1} de ${range.count}`, W - M - 150, y + 24, { width: 150, align: 'right' });
    doc.rect(0, 842 - 8, W, 8).fill(C.laranja);
  }
}

/**
 * Monta o PDF.
 * doc = { kind: 'cobranca'|'relatorio'|'agradecimento', number, issued, title, status?, cards: [{label, value, highlight?}],
 *         table?: { columns, rows, total }, sections?: [{ title, bullets?: [], text? }], payment?: {...},
 *         footerNote, footerContact }
 */
export async function renderPdf(d) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: d.title, Author: 'Agência Pulse' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  fonts(doc);
  header(doc, { kicker: { cobranca: 'Cobrança', relatorio: 'Relatório do mês', agradecimento: 'Agenda e parceria' }[d.kind] || 'Pulse', number: d.number, issued: d.issued });
  title(doc, d.title, d.status);
  if (d.cards?.length) cards(doc, d.cards);
  if (d.table) { section(doc, d.table.title || 'Itens'); table(doc, d.table.columns, d.table.rows, d.table.total); }
  if (d.payment) { section(doc, 'Como pagar'); await payment(doc, d.payment); }
  for (const s of d.sections || []) {
    section(doc, s.title);
    if (s.text) paragraph(doc, s.text);
    if (s.bullets?.length) bullets(doc, s.bullets);
  }
  footer(doc, { note: d.footerNote, contact: d.footerContact });
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

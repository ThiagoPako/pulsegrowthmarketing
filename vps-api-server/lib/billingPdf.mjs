// ─── PDF das mensagens da Ísis ao cliente, no modelo da Pulse (pedido do usuário, 01/11/2026) ─────────────────
// "Os relatórios que são enviados para os clientes das cobranças são em PDF no modelo da Pulse": laranja da marca
// (#F15A24), grafite, DM Sans. Um só modelo para cobrança, recibo, agradecimento (D−5) e relatório do mês.
// Formato de celular (usuário, 01/11/2026: "esses PDFs são feitos para ser vistos pelo celular ... ver todas as
// informações sem precisar dar zoom"): página de 108 × 192 mm (9:16), uma coluna, margens de 6 mm, texto corrido
// ≥ 11 pt, nada abaixo de 9 pt, quadros em 2 colunas no máximo, botões com altura de dedo (~12 mm) e link clicável.
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
  cinza: '#5F5F67',
  cinzaClaro: '#F4F4F6',
  linha: '#E3E3E8',
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
const MM = 72 / 25.4;
export const PAGE = { width: 108 * MM, height: 192 * MM };
const W = PAGE.width; // 306 pt
const H = PAGE.height; // 544 pt
const M = 6 * MM; // 17 pt
const CW = W - 2 * M;
const TOP = 20;
const BOTTOM = H - 50;
const BTN = 34; // altura de dedo (~12 mm)
// tamanhos: texto corrido 11; rótulos e notas 9 (o mínimo); títulos maiores
const T = { min: 9, body: 11, strong: 12, h3: 14, h2: 18, big: 26 };

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
  if (doc.y + need > BOTTOM) { doc.addPage(); doc.y = TOP; }
}

const LOGO = path.join(ASSETS, 'pulse-logo.png');

function header(doc, { kicker, number, issued }) {
  const h = 62;
  doc.rect(0, 0, W, h).fill(C.fundo);
  if (fs.existsSync(LOGO)) doc.image(LOGO, M, 14, { height: 17 });
  doc.font('bold').fontSize(T.min).fillColor(C.laranja).text(kicker.toUpperCase(), M, 18, { width: CW, align: 'right', characterSpacing: 1.2 });
  doc.font('regular').fontSize(T.min).fillColor('#C8C8D0')
    .text([number ? `Nº ${number}` : '', issued ? `emitido em ${issued}` : ''].filter(Boolean).join(' · '), M, 40, { width: CW });
  doc.rect(0, h, W, 3).fill(C.laranja);
  doc.y = h + 18;
}

function title(doc, text, status, subtitle) {
  doc.font('bold').fontSize(T.h2).fillColor(C.texto).text(text, M, doc.y, { width: CW, lineGap: -1 });
  if (status && STATUS_STYLE[status]) {
    const s = STATUS_STYLE[status];
    doc.font('bold').fontSize(T.min);
    const tw = doc.widthOfString(s.label, { characterSpacing: 1 }) + 18;
    const y = doc.y + 6;
    doc.roundedRect(M, y, tw, 18, 9).fill(s.bg);
    doc.fillColor(s.fg).text(s.label, M + 9, y + 5, { characterSpacing: 1, lineBreak: false });
    doc.y = y + 18;
  }
  if (subtitle) doc.font('regular').fontSize(T.body).fillColor(C.cinza).text(subtitle, M, doc.y + 6, { width: CW });
  doc.y += 12;
}

/** Abertura curta (o "Olá, fulano"), em texto corrido. */
function intro(doc, text) {
  ensure(doc, 40);
  doc.font('regular').fontSize(T.body).fillColor(C.texto).text(text, M, doc.y, { width: CW, lineGap: 2 });
  doc.y += 12;
}

/** Emitente e cliente, um embaixo do outro. party = { title, name, lines: [] } */
function parties(doc, list) {
  for (const p of list) {
    const lines = (p.lines || []).filter(Boolean);
    const h = 44 + lines.length * 15;
    ensure(doc, h + 8);
    const y = doc.y;
    doc.roundedRect(M, y, CW, h, 10).lineWidth(1).strokeColor(C.linha).stroke();
    doc.rect(M, y + 12, 3, 26).fill(C.laranja);
    doc.font('semibold').fontSize(T.min).fillColor(C.cinza).text(String(p.title).toUpperCase(), M + 14, y + 10, { width: CW - 28, characterSpacing: 1 });
    doc.font('bold').fontSize(T.strong).fillColor(C.texto).text(p.name || '—', M + 14, y + 22, { width: CW - 28, height: 16, ellipsis: true });
    let ly = y + 42;
    for (const l of lines) {
      doc.font('regular').fontSize(10).fillColor(C.cinza).text(l, M + 14, ly, { width: CW - 28, height: 14, ellipsis: true });
      ly += 15;
    }
    doc.y = y + h + 8;
  }
  doc.y += 4;
}

/** Dados do documento em grade de 2 colunas: [{ label, value, color? }]. */
function meta(doc, items) {
  const gap = 8;
  const w = (CW - gap) / 2;
  const h = 46;
  for (let i = 0; i < items.length; i += 2) {
    ensure(doc, h + 8);
    const y = doc.y;
    items.slice(i, i + 2).forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.roundedRect(x, y, w, h, 8).fill(C.cinzaClaro);
      doc.font('semibold').fontSize(T.min).fillColor(C.cinza).text(String(it.label).toUpperCase(), x + 10, y + 9, { width: w - 20, characterSpacing: 0.6 });
      doc.font('bold').fontSize(T.strong).fillColor(it.color || C.texto).text(String(it.value ?? '—'), x + 10, y + 23, { width: w - 20, height: 16, ellipsis: true });
    });
    doc.y = y + h + gap;
  }
  doc.y += 6;
}

/** Cartões em 2 colunas (rótulo em até 2 linhas, valor grande, nota). */
function cards(doc, items) {
  const gap = 8;
  const w = (CW - gap) / 2;
  for (let i = 0; i < items.length; i += 2) {
    const row = items.slice(i, i + 2);
    // último sozinho na linha ocupa a largura toda
    const ww = row.length === 1 ? CW : w;
    doc.font('semibold').fontSize(T.min);
    const lh = Math.max(...row.map((it) => doc.heightOfString(String(it.label).toUpperCase(), { width: ww - 20, characterSpacing: 0.6 })));
    const h = 10 + lh + 4 + 26 + (row.some((it) => it.note) ? 16 : 0) + 10;
    ensure(doc, h + 8);
    const y = doc.y;
    row.forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.roundedRect(x, y, ww, h, 10).fill(it.highlight ? C.laranjaClaro : C.cinzaClaro);
      doc.font('semibold').fontSize(T.min).fillColor(C.cinza).text(String(it.label).toUpperCase(), x + 10, y + 10, { width: ww - 20, characterSpacing: 0.6 });
      doc.font('bold').fontSize(it.small ? T.h3 : 20).fillColor(it.highlight ? C.laranja : C.texto)
        .text(String(it.value ?? '—'), x + 10, y + 14 + lh, { width: ww - 20, height: 26, ellipsis: true });
      if (it.note) doc.font('semibold').fontSize(T.min).fillColor(it.highlight ? C.laranja : C.cinza).text(it.note, x + 10, y + 42 + lh, { width: ww - 20, height: 12, ellipsis: true });
    });
    doc.y = y + h + gap;
  }
  doc.y += 6;
}

function section(doc, text, need = 60) {
  ensure(doc, need);
  doc.font('bold').fontSize(T.body).fillColor(C.laranja).text(text.toUpperCase(), M, doc.y, { width: CW, characterSpacing: 1 });
  doc.y += 6;
}

const cellText = (c) => (c && typeof c === 'object' ? String(c.text ?? '') : String(c ?? ''));
const cellSub = (c) => (c && typeof c === 'object' && c.sub ? String(c.sub) : '');

/**
 * Tabela em formato de celular: cada linha vira um bloco (1ª célula em destaque; as outras embaixo, com o nome da
 * coluna, ou sem ele quando plain). totals [{label, value}] e total { label, value } opcionais.
 */
function table(doc, columns, rows, { totals = [], total = null, plain = false } = {}) {
  rows.forEach((r, i) => {
    const [firstCell, ...rest] = r;
    // altura do bloco
    doc.font('bold').fontSize(T.body);
    let h = 10 + doc.heightOfString(cellText(firstCell), { width: CW - 20 });
    if (cellSub(firstCell)) h += doc.font('regular').fontSize(T.min + 1).heightOfString(cellSub(firstCell), { width: CW - 20 }) + 2;
    for (const [j, cell] of rest.entries()) {
      const label = plain ? '' : `${columns[j + 1]?.label || ''}  `;
      h += doc.font('regular').fontSize(T.body).heightOfString(`${label}${cellText(cell)}`, { width: CW - 20 }) + 3;
      if (cellSub(cell)) h += doc.fontSize(T.min + 1).heightOfString(cellSub(cell), { width: CW - 20 }) + 2;
    }
    h += 10;
    ensure(doc, h);
    const y = doc.y;
    if (i % 2 === 0) doc.roundedRect(M, y, CW, h, 8).fill(C.cinzaClaro);
    doc.font('bold').fontSize(T.body).fillColor((firstCell && firstCell.color) || C.texto).text(cellText(firstCell), M + 10, y + 9, { width: CW - 20 });
    if (cellSub(firstCell)) doc.font('regular').fontSize(T.min + 1).fillColor(C.cinza).text(cellSub(firstCell), M + 10, doc.y + 1, { width: CW - 20 });
    for (const [j, cell] of rest.entries()) {
      const bold = cell && typeof cell === 'object' && cell.bold;
      const color = (cell && cell.color) || C.texto;
      const yy = doc.y + 3;
      if (!plain && columns[j + 1]?.label) {
        doc.font('regular').fontSize(T.body).fillColor(C.cinza).text(`${columns[j + 1].label}  `, M + 10, yy, { width: CW - 20, continued: true })
          .font(bold ? 'semibold' : 'regular').fillColor(color).text(cellText(cell));
      } else {
        doc.font(bold ? 'semibold' : 'regular').fontSize(T.body).fillColor(color).text(cellText(cell), M + 10, yy, { width: CW - 20 });
      }
      if (cellSub(cell)) doc.font('regular').fontSize(T.min + 1).fillColor(C.cinza).text(cellSub(cell), M + 10, doc.y + 1, { width: CW - 20 });
    }
    doc.y = y + h + 4;
  });
  let y = doc.y + 2;
  for (const t of totals) {
    doc.font('regular').fontSize(T.body).fillColor(C.cinza).text(t.label, M, y, { width: CW / 2 });
    doc.fillColor(C.texto).text(t.value, M + CW / 2, y, { width: CW / 2, align: 'right' });
    y += 18;
  }
  if (total) {
    // o total não fica no pé da página: sem espaço, vai para o topo da seguinte
    doc.y = y;
    ensure(doc, 40);
    y = doc.y;
    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(1).strokeColor(C.linha).stroke();
    doc.font('bold').fontSize(T.h3).fillColor(C.texto).text(total.label, M, y + 9, { width: CW / 2 });
    doc.fillColor(C.laranja).text(total.value, M + CW / 2, y + 9, { width: CW / 2, align: 'right' });
    y += 34;
  }
  doc.y = y + 8;
}

function bullets(doc, items) {
  for (const t of items) {
    const text = String(t).replace(/^[•\-–]\s*/, '');
    doc.font('regular').fontSize(T.body);
    ensure(doc, doc.heightOfString(text, { width: CW - 14 }) + 6);
    const y = doc.y;
    doc.circle(M + 4, y + 7, 2.5).fill(C.laranja);
    doc.font('regular').fontSize(T.body).fillColor(C.texto).text(text, M + 14, y, { width: CW - 14 });
    doc.y += 4;
  }
  doc.y += 8;
}

function paragraph(doc, text) {
  doc.font('regular').fontSize(T.body);
  ensure(doc, doc.heightOfString(text, { width: CW }) + 10);
  doc.fillColor(C.texto).text(text, M, doc.y, { width: CW, lineGap: 2 });
  doc.y += 10;
}

/** Barras de progresso: [{ label, done, goal, note? }]. */
function progress(doc, rows) {
  for (const r of rows) {
    ensure(doc, 36);
    const y = doc.y;
    const goal = Number(r.goal) || 0;
    const done = Number(r.done) || 0;
    doc.font('semibold').fontSize(T.body).fillColor(C.texto).text(r.label, M, y, { width: CW - 90 });
    doc.font('bold').fontSize(T.body).text(goal ? `${done} de ${goal}` : String(done), W - M - 90, y, { width: 90, align: 'right' });
    doc.roundedRect(M, y + 18, CW, 8, 4).fill('#E9E9EE');
    if (goal) doc.roundedRect(M, y + 18, Math.max(8, CW * Math.min(done / goal, 1)), 8, 4).fill(C.laranja);
    doc.y = y + 34;
  }
  doc.y += 6;
}

/** Barras horizontais: [{ label, value, display }] — nome e valor numa linha, a barra embaixo. */
function bars(doc, rows) {
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 0.0001);
  for (const r of rows) {
    ensure(doc, 34);
    const y = doc.y;
    doc.font('regular').fontSize(T.body).fillColor(C.texto).text(r.label, M, y, { width: CW - 80 });
    doc.font('bold').fontSize(T.body).text(r.display ?? String(r.value), W - M - 80, y, { width: 80, align: 'right' });
    doc.roundedRect(M, y + 18, CW, 8, 4).fill('#E9E9EE');
    doc.roundedRect(M, y + 18, Math.max(8, CW * ((Number(r.value) || 0) / max)), 8, 4).fill(C.laranja);
    doc.y = y + 34;
  }
  doc.y += 6;
}

/** Mês × mês anterior, um indicador por bloco: [{ label, previous, current, change }]. */
function compare(doc, rows, { previousLabel = 'mês anterior', currentLabel = 'este mês' } = {}) {
  const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR'));
  rows.forEach((r, i) => {
    const h = 48;
    ensure(doc, h + 4);
    const y = doc.y;
    if (i % 2 === 0) doc.roundedRect(M, y, CW, h, 8).fill(C.cinzaClaro);
    const ch = r.change === null || r.change === undefined ? null : Number(r.change);
    const pct = ch !== null && r.previous ? ` (${ch >= 0 ? '+' : '−'}${Math.abs(Math.round((ch / Number(r.previous)) * 100))}%)` : '';
    doc.font('semibold').fontSize(T.body).fillColor(C.texto).text(r.label, M + 10, y + 8, { width: CW - 120 });
    doc.font('bold').fontSize(T.h3).fillColor(C.texto).text(fmt(r.current), W - M - 120, y + 7, { width: 110, align: 'right' });
    doc.font('regular').fontSize(T.min + 1).fillColor(C.cinza).text(`${previousLabel}: ${fmt(r.previous)}`, M + 10, y + 27, { width: CW / 2 });
    if (ch !== null) {
      doc.font('bold').fontSize(T.min + 1).fillColor(ch > 0 ? C.verde : ch < 0 ? C.vermelho : C.cinza)
        .text(`${ch >= 0 ? '+' : '−'}${Math.abs(ch).toLocaleString('pt-BR')}${pct}`, M + CW / 2, y + 27, { width: CW / 2 - 10, align: 'right' });
    }
    doc.y = y + h + 4;
  });
  doc.y += 6;
}

/** Quadro de destaque (fundo laranja claro, filete à esquerda). */
function callout(doc, { title: t, text, tone }) {
  doc.font('regular').fontSize(T.body);
  const th = doc.heightOfString(text, { width: CW - 30, lineGap: 2 });
  doc.font('bold').fontSize(T.strong);
  const hh = t ? doc.heightOfString(t, { width: CW - 30 }) + 6 : 0;
  const h = th + hh + 24;
  ensure(doc, h + 10);
  const y = doc.y;
  const verde = tone === 'verde';
  doc.roundedRect(M, y, CW, h, 10).fill(verde ? C.verdeClaro : C.laranjaClaro);
  doc.rect(M, y, 4, h).fill(verde ? C.verde : C.laranja);
  let ty = y + 12;
  if (t) { doc.font('bold').fontSize(T.strong).fillColor(C.texto).text(t, M + 16, ty, { width: CW - 30 }); ty += hh; }
  doc.font('regular').fontSize(T.body).fillColor(C.texto).text(text, M + 16, ty, { width: CW - 30, lineGap: 2 });
  doc.y = y + h + 12;
}

/** Quadros do que foi entregue, 2 por linha: [{ label, value, badge?, highlight? }]. */
function tiles(doc, items) {
  const gap = 8;
  const w = (CW - gap) / 2;
  const h = 82;
  for (let i = 0; i < items.length; i += 2) {
    ensure(doc, h + 8);
    const y = doc.y;
    items.slice(i, i + 2).forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.roundedRect(x, y, w, h, 10).fill(it.highlight ? C.laranjaClaro : C.cinzaClaro);
      doc.font('bold').fontSize(T.big).fillColor(it.highlight ? C.laranja : C.texto).text(String(it.value), x + 10, y + 8, { width: w - 20, height: 32 });
      doc.font('semibold').fontSize(T.body).fillColor(C.texto).text(it.label, x + 10, y + 40, { width: w - 20, height: 14, ellipsis: true });
      if (it.badge) badge(doc, x + 10, y + 60, it.badge, w - 20, it.highlight);
    });
    doc.y = y + h + gap;
  }
  doc.y += 6;
}

/** Selo pequeno (9 pt): laranja quando é destaque, cinza quando neutro. */
function badge(doc, x, y, text, maxW, strong = true) {
  doc.font('bold').fontSize(T.min);
  const bw = Math.min(doc.widthOfString(text) + 14, maxW);
  doc.roundedRect(x, y, bw, 15, 7.5).fill(strong ? C.laranja : '#E3E3E8');
  doc.fillColor(strong ? '#FFFFFF' : C.cinza).text(text, x + 7, y + 3.5, { width: bw - 14, height: 11, ellipsis: true, lineBreak: false });
}

/** Botão com altura de dedo, clicável. */
function button(doc, x, y, w, label, url, { dark = false } = {}) {
  doc.roundedRect(x, y, w, BTN, BTN / 2).fill(dark ? C.fundo : C.laranja);
  doc.font('bold').fontSize(T.strong).fillColor('#FFFFFF').text(label, x, y + 10.5, { width: w, align: 'center', link: url, underline: false });
  if (url) doc.link(x, y, w, BTN, url);
}

/** Pagar agora (página de pagamento) ou o link do cartão: o botão vem primeiro, é o que o cliente quer fazer. */
function payNow(doc, pay, url) {
  const lead = pay.payUrl
    ? `Na página de pagamento você copia o Pix com um toque${pay.cardLink ? ' ou paga no cartão em até 12x' : ''}.`
    : 'Pelo link da InfinitePay, em até 12x.';
  doc.font('regular').fontSize(T.body);
  const leadH = doc.heightOfString(lead, { width: CW - 28 });
  doc.font('regular').fontSize(T.min);
  const noteH = pay.cardLink && pay.cardNotice ? doc.heightOfString(pay.cardNotice, { width: CW - 28 }) + 4 : 0;
  const h2 = 36 + leadH + 34 + BTN + 24 + noteH;
  ensure(doc, h2 + 8);
  const y = doc.y;
  doc.roundedRect(M, y, CW, h2, 12).fill(C.cinzaClaro);
  doc.font('bold').fontSize(T.h3).fillColor(C.texto).text(pay.payUrl ? 'Pagar agora' : 'Cartão', M + 14, y + 12, { width: CW - 28 });
  doc.font('regular').fontSize(T.body).fillColor(C.cinza).text(lead, M + 14, y + 32, { width: CW - 28 });
  doc.font('bold').fontSize(20).fillColor(C.texto).text(pay.cardAmount || pay.amount || '', M + 14, doc.y + 6, { width: CW - 28 });
  const by = doc.y + 6;
  button(doc, M + 14, by, CW - 28, pay.payUrl ? 'Pagar agora' : 'Pagar no cartão', url);
  doc.font('regular').fontSize(T.min).fillColor(C.cinza).text(url, M + 14, by + BTN + 6, { width: CW - 28, link: url, height: 12, ellipsis: true });
  // aviso discreto: a taxa do cartão é da facilitadora, a Pulse não cobra nada a mais
  if (noteH) doc.text(pay.cardNotice, M + 14, doc.y + 3, { width: CW - 28 });
  doc.y = y + h2 + 12;
}

/** Pix (preferencial): QR no centro, o copia e cola legível e a chave. */
async function pixBox(doc, pay) {
  const qrW = 132;
  doc.font('regular').fontSize(T.min);
  const payloadH = pay.pixPayload ? doc.heightOfString(pay.pixPayload, { width: CW - 28 }) : 14;
  const h1 = 36 + (pay.pixPayload ? qrW + 22 + payloadH : 18) + 44;
  ensure(doc, h1 + 10);
  const y = doc.y;
  doc.roundedRect(M, y, CW, h1, 12).lineWidth(1.5).strokeColor(C.laranja).stroke();
  doc.font('bold').fontSize(T.h3).fillColor(C.texto).text('Pix', M + 14, y + 12, { continued: true })
    .font('semibold').fontSize(T.min).fillColor(C.laranja).text('   PREFERENCIAL', { characterSpacing: 1 });
  let yy = y + 36;
  if (pay.pixPayload) {
    const qr = await QRCode.toBuffer(pay.pixPayload, { margin: 0, width: 300, color: { dark: C.texto, light: '#FFFFFF' } });
    doc.image(qr, M + (CW - qrW) / 2, yy, { width: qrW });
    yy += qrW + 8;
    doc.font('semibold').fontSize(T.min).fillColor(C.cinza).text('PIX COPIA E COLA', M + 14, yy, { characterSpacing: 0.6 });
    doc.font('regular').fontSize(T.min).fillColor(C.texto).text(pay.pixPayload, M + 14, yy + 13, { width: CW - 28 });
    yy = doc.y + 6;
  } else {
    doc.font('regular').fontSize(T.body).fillColor(C.cinza).text('Chave Pix não cadastrada.', M + 14, yy, { width: CW - 28 });
    yy = doc.y + 6;
  }
  doc.font('regular').fontSize(10).fillColor(C.texto).text(`Chave: ${pay.pixKey || '—'}`, M + 14, yy, { width: CW - 28 });
  if (pay.receiver) doc.text(pay.receiver, M + 14, doc.y + 1, { width: CW - 28 });
  doc.y = y + h1 + 10;
}

async function payment(doc, pay) {
  const url = pay.payUrl || pay.cardLink;
  if (url) payNow(doc, pay, url);
  await pixBox(doc, pay);
}

/** Fechamento assinado e a faixa grafite com o logo da Pulse e o contato. */
function closing(doc, { text, signature, role, band }) {
  ensure(doc, band ? 170 : 80);
  doc.y += 4;
  if (text) { doc.font('regular').fontSize(T.body).fillColor(C.texto).text(text, M, doc.y, { width: CW, lineGap: 2 }); doc.y += 12; }
  doc.moveTo(M, doc.y).lineTo(M + 36, doc.y).lineWidth(2).strokeColor(C.laranja).stroke();
  doc.y += 8;
  doc.font('bold').fontSize(T.strong).fillColor(C.texto).text(signature || 'Agência Pulse', M, doc.y, { width: CW });
  if (role) doc.font('regular').fontSize(10).fillColor(C.cinza).text(role, M, doc.y + 1, { width: CW });
  doc.y += 10;
  if (band) {
    const y = doc.y + 6;
    doc.font('regular').fontSize(10);
    const bh = 44 + doc.heightOfString(band, { width: CW - 28 }) + 18;
    doc.roundedRect(M, y, CW, bh, 12).fill(C.fundo);
    if (fs.existsSync(LOGO)) doc.image(LOGO, M + 14, y + 14, { height: 17 });
    doc.font('regular').fontSize(10).fillColor('#D0D0D8').text(band, M + 14, y + 44, { width: CW - 28 });
    doc.font('semibold').fontSize(10).fillColor(C.laranja).text('@agenciapulse', M + 14, doc.y + 2, { width: CW - 28 });
    doc.y = y + bh + 8;
  }
}

// ── relatório (resumo, entregas, calendário, portal, equipe) ──

const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';

/** Foto redonda (buffer PNG/JPEG) ou círculo com as iniciais. */
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
  doc.font('bold').fontSize(Math.max(T.min, size * 0.36)).fillColor('#FFFFFF').text(iniciais(name), x, y + size * 0.3, { width: size, align: 'center' });
}

/** Faixa do topo do relatório: fundo claro, logo e nome do cliente, o mês e o selo da Pulse. */
function summaryHeader(doc, c) {
  const h = 66;
  doc.rect(0, 0, W, h).fill('#FFFFFF');
  doc.rect(0, h, W, 3).fill(C.laranja);
  const size = 40;
  const x = M;
  const y = (h - size) / 2;
  doc.circle(x + size / 2, y + size / 2, size / 2 + 2).fill(C.laranja);
  doc.circle(x + size / 2, y + size / 2, size / 2).fill(c.logo ? '#FFFFFF' : C.laranjaClaro);
  let drew = false;
  if (c.logo) {
    try {
      doc.save();
      doc.circle(x + size / 2, y + size / 2, size / 2 - 2).clip();
      doc.image(c.logo, x + 4, y + 4, { fit: [size - 8, size - 8], align: 'center', valign: 'center' });
      doc.restore();
      drew = true;
    } catch {
      doc.restore();
    }
  }
  if (!drew) doc.font('bold').fontSize(14).fillColor(C.laranja).text(iniciais(c.client), x, y + 12, { width: size, align: 'center' });
  const tx = x + size + 10;
  const tw = W - M - 78 - tx;
  doc.font('bold').fontSize(13).fillColor(C.texto).text(c.client, tx, y + 4, { width: tw, height: 17, ellipsis: true });
  doc.font('bold').fontSize(T.min).fillColor(C.laranja).text(String(c.month || '').toUpperCase(), tx, y + 23, { width: tw, characterSpacing: 1 });
  // selo da Pulse (o logo é branco: vai numa pílula grafite)
  doc.roundedRect(W - M - 70, (h - 24) / 2, 70, 24, 12).fill(C.fundo);
  if (fs.existsSync(LOGO)) doc.image(LOGO, W - M - 60, (h - 24) / 2 + 6.5, { fit: [50, 11], align: 'center', valign: 'center' });
  doc.y = h + 18;
}

/** Ícones simples desenhados (sem emoji: a fonte do PDF não tem). */
function icon(doc, kind, cx, cy, r, color) {
  doc.save();
  doc.fillColor(color).strokeColor(color).lineWidth(1.5);
  if (kind === 'video') doc.polygon([cx - r * 0.35, cy - r * 0.5], [cx - r * 0.35, cy + r * 0.5], [cx + r * 0.55, cy]).fill();
  else if (kind === 'story') { doc.circle(cx, cy, r * 0.6).stroke(); doc.circle(cx, cy, r * 0.28).fill(); }
  else if (kind === 'arte') { doc.roundedRect(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2, 2).stroke(); doc.circle(cx - r * 0.18, cy - r * 0.15, r * 0.16).fill(); doc.polygon([cx - r * 0.55, cy + r * 0.5], [cx, cy], [cx + r * 0.55, cy + r * 0.5]).fill(); }
  else if (kind === 'post') { const g = r * 0.5; for (const [dx, dy] of [[-1, -1], [0.1, -1], [-1, 0.1], [0.1, 0.1]]) doc.rect(cx + dx * g, cy + dy * g, g * 0.85, g * 0.85).fill(); }
  else if (kind === 'gravacao') { doc.roundedRect(cx - r * 0.65, cy - r * 0.4, r * 0.95, r * 0.8, 2).fill(); doc.polygon([cx + r * 0.35, cy], [cx + r * 0.7, cy - r * 0.35], [cx + r * 0.7, cy + r * 0.35]).fill(); }
  else if (kind === 'horas') { doc.circle(cx, cy, r * 0.62).stroke(); doc.moveTo(cx, cy).lineTo(cx, cy - r * 0.38).stroke(); doc.moveTo(cx, cy).lineTo(cx + r * 0.3, cy + r * 0.1).stroke(); }
  else doc.circle(cx, cy, r * 0.4).fill();
  doc.restore();
}

/**
 * Quadros grandes do resumo, 2 por linha: ícone, número entregue, nome, "plano 12" e o selo laranja quando passou do
 * plano (abaixo do plano, só o número, neutro). items = [{ icon, label, value, plan?, extra? }].
 */
function stats(doc, items) {
  const gap = 8;
  const w = (CW - gap) / 2;
  const h = 100;
  for (let i = 0; i < items.length; i += 2) {
    ensure(doc, h + 8);
    const y = doc.y;
    items.slice(i, i + 2).forEach((it, j) => {
      const x = M + j * (w + gap);
      const up = it.extra > 0;
      doc.roundedRect(x, y, w, h, 12).fill(up ? C.laranjaClaro : C.cinzaClaro);
      doc.circle(x + 20, y + 22, 11).fill(up ? C.laranja : '#FFFFFF');
      icon(doc, it.icon, x + 20, y + 22, 9, up ? '#FFFFFF' : C.laranja);
      doc.font('bold').fontSize(T.big).fillColor(up ? C.laranja : C.texto).text(String(it.value), x + 38, y + 7, { width: w - 46, height: 32, ellipsis: true });
      doc.font('semibold').fontSize(T.body).fillColor(C.texto).text(it.label, x + 10, y + 42, { width: w - 20, height: 14, ellipsis: true });
      if (it.plan) {
        doc.font('regular').fontSize(10).fillColor(C.cinza).text(`plano ${it.plan}`, x + 10, y + 60, { width: w - 20, lineBreak: false });
        if (up) badge(doc, x + 10, y + 77, `+${it.extra} além do plano`, w - 20, true);
        else if (it.value >= it.plan) doc.font('semibold').fontSize(T.min).fillColor(C.cinza).text('plano completo', x + 10, y + 79, { width: w - 20 });
      }
    });
    doc.y = y + h + gap;
  }
  doc.y += 6;
}

/**
 * Destaque em moldura de post do Instagram (topo com a foto e o @, curtir/comentar/enviar/salvar, legenda com o
 * título): o cliente vê que o vídeo foi postado. 2 por linha. items = [{ image, title }], handle = '@cliente'.
 */
function igPosts(doc, { items, handle, logo }) {
  const gap = 8;
  const w = (CW - gap) / 2;
  const ih = w * 1.25;
  doc.font('regular').fontSize(T.min);
  for (let i = 0; i < items.length; i += 2) {
    const row = items.slice(i, i + 2);
    const capH = Math.max(...row.map((it) => doc.font('regular').fontSize(T.min).heightOfString(`${handle} ${it.title}`, { width: w - 16 })));
    const h = 28 + ih + 22 + Math.min(capH, 36) + 10;
    ensure(doc, h + 8);
    const y = doc.y;
    row.forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.roundedRect(x, y, w, h, 8).fill('#FFFFFF');
      doc.roundedRect(x, y, w, h, 8).lineWidth(1).strokeColor(C.linha).stroke();
      avatar(doc, x + 7, y + 6, 15, logo, handle, { ring: C.laranja });
      doc.font('bold').fontSize(T.min).fillColor(C.texto).text(handle, x + 27, y + 9, { width: w - 40, height: 12, ellipsis: true, lineBreak: false });
      doc.save();
      doc.rect(x, y + 28, w, ih).clip();
      doc.rect(x, y + 28, w, ih).fill(C.fundo2);
      try { doc.image(it.image, x, y + 28, { cover: [w, ih], align: 'center', valign: 'center' }); } catch { /* fica o fundo */ }
      doc.restore();
      // curtir, comentar, enviar e salvar
      const iy = y + 28 + ih + 11;
      doc.save().lineWidth(1.2).strokeColor(C.texto);
      const hx = x + 13;
      doc.moveTo(hx, iy + 3).bezierCurveTo(hx - 7, iy - 2, hx - 4, iy - 8, hx, iy - 4).bezierCurveTo(hx + 4, iy - 8, hx + 7, iy - 2, hx, iy + 3).fill('#E0245E');
      doc.circle(x + 30, iy - 2, 4.5).stroke();
      doc.polygon([x + 41, iy - 6], [x + 51, iy - 2], [x + 41, iy + 2]).stroke();
      doc.moveTo(x + w - 16, iy - 6).lineTo(x + w - 16, iy + 4).lineTo(x + w - 12, iy).lineTo(x + w - 8, iy + 4).lineTo(x + w - 8, iy - 6).closePath().stroke();
      doc.restore();
      doc.font('bold').fontSize(T.min).fillColor(C.texto).text(`${handle} `, x + 8, y + 28 + ih + 22, { width: w - 16, continued: true, height: 36 })
        .font('regular').text(it.title, { width: w - 16, height: 36, ellipsis: true });
    });
    doc.y = y + h + gap;
  }
  doc.y += 4;
}

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MARK = {
  gravacao: { fill: C.laranja, fg: '#FFFFFF', legend: 'Gravação agendada (com o horário)', short: (mk) => mk.time || 'Grav.' },
  feriado: { fill: C.fundo2, fg: '#FFFFFF', legend: 'Feriado: vamos criar a arte de aviso', short: () => 'Aviso' },
  sazonal: { fill: C.laranjaClaro, fg: C.laranja, legend: 'Data do seu segmento: arte comemorativa', short: () => 'Arte' },
};

/**
 * Calendário editorial do mês: grade de domingo a sábado com o número do dia e só a etiqueta curta (Aviso, Arte,
 * o horário da gravação); o nome de cada data e o que vamos fazer vão na lista embaixo. Legenda em linhas.
 */
function calendar(doc, { month, marks = [] }) {
  const [y, m] = String(month).split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((first + days) / 7);
  const cw = CW / 7;
  const ch = 40;
  ensure(doc, 20 + weeks * ch + 60);
  let top = doc.y;
  doc.roundedRect(M, top, CW, 18, 5).fill(C.fundo);
  SEMANA.forEach((d, i) => doc.font('bold').fontSize(T.min).fillColor(i === 0 ? C.laranja : '#FFFFFF').text(d, M + i * cw, top + 4.5, { width: cw, align: 'center' }));
  top += 21;
  const byDay = {};
  for (const mk of marks) (byDay[Number(String(mk.date).slice(8, 10))] ||= []).push(mk);
  for (let day = 1; day <= days; day++) {
    const idx = first + day - 1;
    const x = M + (idx % 7) * cw;
    const yy = top + Math.floor(idx / 7) * ch;
    const list = byDay[day] || [];
    doc.roundedRect(x + 1.5, yy + 1.5, cw - 3, ch - 3, 4).fill(list.length ? '#FFFFFF' : C.cinzaClaro);
    if (list.length) doc.roundedRect(x + 1.5, yy + 1.5, cw - 3, ch - 3, 4).lineWidth(0.8).strokeColor(C.linha).stroke();
    doc.font('bold').fontSize(T.body).fillColor(list.length ? C.texto : '#9A9AA3').text(String(day), x + 4, yy + 4, { width: cw - 8 });
    const mk = list[0];
    if (mk) {
      const st = MARK[mk.kind] || MARK.sazonal;
      doc.roundedRect(x + 3, yy + ch - 17, cw - 6, 13, 3).fill(st.fill);
      doc.font('bold').fontSize(T.min).fillColor(st.fg).text(st.short(mk), x + 3, yy + ch - 14.5, { width: cw - 6, align: 'center', height: 11, lineBreak: false, ellipsis: true });
      if (list.length > 1) doc.circle(x + cw - 6, yy + 7, 2.5).fill(C.laranja);
    }
  }
  doc.y = top + weeks * ch + 6;
  // legenda, uma por linha
  for (const kind of ['gravacao', 'feriado', 'sazonal']) {
    if (!marks.some((mk) => mk.kind === kind)) continue;
    const st = MARK[kind];
    const ly = doc.y;
    doc.roundedRect(M, ly + 1, 11, 11, 2).fill(st.fill);
    if (kind === 'sazonal') doc.roundedRect(M, ly + 1, 11, 11, 2).lineWidth(0.8).strokeColor(C.laranja).stroke();
    doc.font('regular').fontSize(10).fillColor(C.cinza).text(st.legend, M + 16, ly, { width: CW - 16 });
    doc.y = Math.max(doc.y, ly + 14) + 3;
  }
  doc.y += 8;
}

/** Galeria (capa + título), 2 por linha. */
function gallery(doc, items) {
  const gap = 8;
  const w = (CW - gap) / 2;
  const ih = w * 1.4;
  for (let i = 0; i < items.length; i += 2) {
    ensure(doc, ih + 40);
    const y = doc.y;
    items.slice(i, i + 2).forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.save();
      doc.roundedRect(x, y, w, ih, 8).clip();
      doc.rect(x, y, w, ih).fill(C.fundo2);
      try { doc.image(it.image, x, y, { cover: [w, ih], align: 'center', valign: 'center' }); } catch { /* fica o fundo */ }
      doc.restore();
      doc.font('semibold').fontSize(T.min + 1).fillColor(C.texto).text(it.title, x, y + ih + 5, { width: w, height: 26, ellipsis: true });
    });
    doc.y = y + ih + 34;
  }
}

/** Portal do cliente: chamada, QR no centro e o botão grande clicável. */
async function portal(doc, { url, title, text }) {
  doc.font('bold').fontSize(T.h3);
  const th = doc.heightOfString(title || 'Seu portal', { width: CW - 28 });
  doc.font('regular').fontSize(T.body);
  const xh = text ? doc.heightOfString(text, { width: CW - 28, lineGap: 1.5 }) + 8 : 0;
  const qrW = 88;
  const h = 16 + th + 6 + xh + qrW + 14 + BTN + 32;
  ensure(doc, h + 8);
  const y = doc.y;
  doc.roundedRect(M, y, CW, h, 14).fill(C.fundo);
  doc.font('bold').fontSize(T.h3).fillColor('#FFFFFF').text(title || 'Seu portal', M + 14, y + 16, { width: CW - 28 });
  if (text) doc.font('regular').fontSize(T.body).fillColor('#D8D8DE').text(text, M + 14, doc.y + 6, { width: CW - 28, lineGap: 1.5 });
  let yy = doc.y + 10;
  try {
    const qr = await QRCode.toBuffer(url, { margin: 1, width: 300, color: { dark: '#0E0E10', light: '#FFFFFF' } });
    doc.roundedRect(M + (CW - qrW) / 2 - 4, yy - 4, qrW + 8, qrW + 8, 8).fill('#FFFFFF');
    doc.image(qr, M + (CW - qrW) / 2, yy, { width: qrW });
  } catch { /* sem QR */ }
  yy += qrW + 14;
  button(doc, M + 14, yy, CW - 28, 'Abrir meu portal', url);
  doc.font('regular').fontSize(T.min).fillColor('#A9A9B2').text(url, M + 14, yy + BTN + 6, { width: CW - 28, height: 12, ellipsis: true, link: url, align: 'center' });
  doc.y = y + h + 12;
}

/** Equipe do projeto: fotos redondas com nome e função, 3 por linha. */
function team(doc, people) {
  const per = 3;
  const w = CW / per;
  const size = 50;
  for (let i = 0; i < people.length; i += per) {
    ensure(doc, size + 48);
    const y = doc.y;
    people.slice(i, i + per).forEach((p, j) => {
      const x = M + j * w;
      avatar(doc, x + (w - size) / 2, y + 2, size, p.photo, p.name, { ring: p.agent ? C.fundo2 : C.laranja });
      doc.font('bold').fontSize(10).fillColor(C.texto).text(p.name, x + 2, y + size + 8, { width: w - 4, align: 'center', height: 14, ellipsis: true });
      doc.font('regular').fontSize(T.min).fillColor(C.cinza).text(p.role || '', x + 2, y + size + 22, { width: w - 4, align: 'center', height: 22, ellipsis: true });
    });
    doc.y = y + size + 48;
  }
  doc.y += 4;
}

function footer(doc, { note }) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = H - 40;
    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor(C.linha).stroke();
    doc.font('regular').fontSize(T.min).fillColor(C.cinza)
      .text(note || 'Agência Pulse · @agenciapulse', M, y + 6, { width: CW - 40, height: 24, ellipsis: true });
    doc.font('semibold').fontSize(T.min).fillColor(C.texto).text(`${i - range.start + 1}/${range.count}`, W - M - 36, y + 6, { width: 36, align: 'right' });
    doc.rect(0, H - 4, W, 4).fill(C.laranja);
  }
}

async function block(doc, s) {
  // o título não fica sozinho no pé da página: reserva o começo do bloco junto
  const need = { table: 90, compare: 90, progress: 70, bars: 70, callout: 80, tiles: 100, calendar: 320, gallery: 220, portal: 260, team: 110, stats: 120, cards: 90, igposts: 240 }[s.type] || 50;
  if (s.title) section(doc, s.title, need);
  switch (s.type) {
    case 'table': table(doc, s.columns, s.rows, { totals: s.totals, total: s.total, plain: s.plain }); break;
    case 'progress': progress(doc, s.rows); break;
    case 'bars': bars(doc, s.rows); break;
    case 'compare': compare(doc, s.rows, s); break;
    case 'callout': callout(doc, { title: s.heading, text: s.text, tone: s.tone }); break;
    case 'tiles': tiles(doc, s.rows); break;
    case 'calendar': calendar(doc, s); break;
    case 'gallery': gallery(doc, s.items); break;
    case 'stats': stats(doc, s.items); break;
    case 'cards': cards(doc, s.items); break;
    case 'igposts': igPosts(doc, s); break;
    case 'portal': await portal(doc, { url: s.url, title: s.heading, text: s.text }); break;
    case 'team': team(doc, s.people); break;
    default:
      if (s.text) paragraph(doc, s.text);
      if (s.bullets?.length) bullets(doc, s.bullets);
      if (s.note) {
        doc.font('regular').fontSize(10);
        ensure(doc, doc.heightOfString(s.note, { width: CW }) + 8);
        doc.fillColor(C.cinza).text(s.note, M, doc.y, { width: CW });
        doc.y += 10;
      }
  }
}

/**
 * Monta o PDF (formato de celular).
 * doc = { kind: 'cobranca'|'relatorio'|'agradecimento'|'recibo', number, issued, title, subtitle?, status?, intro?,
 *         summary?: { client, logo, month } (faixa clara do relatório no lugar do cabeçalho grafite),
 *         parties?, meta?, cards?, table?: { title, columns, rows, totals?, total? }, payment?: {...},
 *         sections?: [{ title, type?, ... }], closing?: { text, signature, role, band? }, footerNote }
 */
export async function renderPdf(d) {
  const doc = new PDFDocument({ size: [W, H], margin: 0, bufferPages: true, info: { Title: d.title, Author: 'Agência Pulse', Subject: d.subtitle || d.title } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  fonts(doc);
  if (d.summary) summaryHeader(doc, d.summary);
  else header(doc, { kicker: { cobranca: 'Cobrança', relatorio: 'Relatório do mês', agradecimento: 'Agenda e parceria', recibo: 'Recibo' }[d.kind] || 'Pulse', number: d.number, issued: d.issued });
  title(doc, d.title, d.status, d.subtitle);
  if (d.intro) intro(doc, d.intro);
  // no celular, o que importa primeiro: valor e vencimento, como pagar; emitente e cliente vão para o fim
  if (d.meta?.length) meta(doc, d.meta);
  if (d.cards?.length) cards(doc, d.cards);
  if (d.payment) { section(doc, 'Como pagar', 160); await payment(doc, d.payment); }
  if (d.table) { section(doc, d.table.title || 'Itens', 90); table(doc, d.table.columns, d.table.rows, { totals: d.table.totals, total: d.table.total, plain: d.table.plain }); }
  if (d.parties?.length) parties(doc, d.parties);
  for (const s of d.sections || []) await block(doc, s);
  if (d.closing) closing(doc, d.closing);
  footer(doc, { note: d.footerNote });
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

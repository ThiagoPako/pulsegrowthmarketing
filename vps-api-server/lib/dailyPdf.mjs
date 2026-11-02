// ─── PDF do resumo do dia, feito para o celular (pedido do usuário, 01/11/2026) ─────────────────────────────────
// "Esses PDFs são feitos para ser vistos pelo celular; faça a versão otimizada para mobile, para clicar no PDF e
// conseguir ver todas as informações sem precisar dar zoom." Página de 108 × 192 mm (9:16), margem de 6 mm, uma
// coluna; texto de 11 pt para cima e nada abaixo de 9 pt; quadros em 2 colunas; pessoas uma embaixo da outra;
// financeiro em lista (descrição / forma · valor). Mesma identidade dos PDFs da Ísis (lib/billingPdf.mjs): grafite,
// laranja #F15A24, DM Sans e o logo, das mesmas fontes em assets/pdf.
// renderDailyPdf(spec) → Buffer. Sem banco aqui: quem monta o spec é assistant/dailyReportPdf.mjs (dailyPdfSpec).

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'pdf');
const MM = 72 / 25.4;
const W = 108 * MM; // 306 pt
const H = 192 * MM; // 544 pt
const M = 6 * MM; // 17 pt
const CW = W - 2 * M;
const FOOT = 34; // altura do rodapé
const BOTTOM = H - FOOT - 8;
const C = {
  fundo: '#0E0E10', fundo2: '#1A1A1F', laranja: '#F15A24', laranjaClaro: '#FFF1EB', texto: '#161616', cinza: '#5E5E66',
  cinzaClaro: '#F4F4F6', linha: '#E3E3E8', verde: '#1F9D55', vermelho: '#D64545',
};
const NO_LIGA = { liga: false, clig: false, dlig: false, rlig: false };

/** Ícones que o resumo usa (desenhados em vetor: a DM Sans não tem emoji). */
export const ICONS = ['edicao', 'arte', 'post', 'gravacao', 'aprovacao', 'atendimento', 'cards', 'entrada', 'saida', 'alteracao', 'alerta', 'caixa'];

function setup(doc) {
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
  if (doc.y + need > BOTTOM) { doc.addPage(); doc.y = M + 6; }
}

function icon(doc, name, x, y, size = 22, { fg = C.laranja, bg = C.laranjaClaro } = {}) {
  const s = size / 24; // desenho numa grade de 24
  const px = (v) => x + v * s;
  const py = (v) => y + v * s;
  doc.save();
  doc.circle(x + size / 2, y + size / 2, size / 2).fill(bg);
  doc.lineWidth(Math.max(1, 1.7 * s)).strokeColor(fg).fillColor(fg).lineCap('round').lineJoin('round');
  switch (name) {
    case 'edicao': // claquete
      doc.roundedRect(px(6), py(10), 12 * s, 8 * s, 1.5 * s).stroke();
      doc.moveTo(px(6), py(10)).lineTo(px(17), py(6.5)).stroke();
      doc.moveTo(px(9.5), py(9)).lineTo(px(11), py(7.6)).moveTo(px(13), py(7.8)).lineTo(px(14.4), py(6.6)).stroke();
      break;
    case 'arte': // paleta
      doc.circle(px(12), py(12), 6.5 * s).stroke();
      [[9.3, 10], [12, 8.4], [14.8, 10], [14.6, 13.4]].forEach(([a, b]) => doc.circle(px(a), py(b), 1 * s).fill());
      break;
    case 'post': // celular com seta
      doc.roundedRect(px(8), py(5), 8 * s, 14 * s, 1.6 * s).stroke();
      doc.moveTo(px(12), py(14.5)).lineTo(px(12), py(9)).moveTo(px(9.8), py(11)).lineTo(px(12), py(8.8)).lineTo(px(14.2), py(11)).stroke();
      break;
    case 'gravacao': // câmera
      doc.roundedRect(px(5), py(8), 10 * s, 8 * s, 1.6 * s).stroke();
      doc.moveTo(px(15), py(11)).lineTo(px(19), py(8.8)).lineTo(px(19), py(15.2)).lineTo(px(15), py(13)).closePath().stroke();
      break;
    case 'aprovacao': // visto
      doc.moveTo(px(7), py(12.5)).lineTo(px(10.5), py(16)).lineTo(px(17), py(8.5)).stroke();
      break;
    case 'atendimento': // balão de conversa
      doc.roundedRect(px(5.5), py(6.5), 13 * s, 9 * s, 3 * s).stroke();
      doc.moveTo(px(9), py(15.5)).lineTo(px(8), py(18.5)).lineTo(px(12), py(15.5)).stroke();
      break;
    case 'cards': // setas trocando de coluna
      doc.moveTo(px(6), py(9.5)).lineTo(px(17), py(9.5)).moveTo(px(14.5), py(7)).lineTo(px(17), py(9.5)).lineTo(px(14.5), py(12)).stroke();
      doc.moveTo(px(18), py(14.5)).lineTo(px(7), py(14.5)).moveTo(px(9.5), py(12)).lineTo(px(7), py(14.5)).lineTo(px(9.5), py(17)).stroke();
      break;
    case 'entrada': // seta para cima
      doc.moveTo(px(12), py(18)).lineTo(px(12), py(6.5)).moveTo(px(7.5), py(11)).lineTo(px(12), py(6.5)).lineTo(px(16.5), py(11)).stroke();
      break;
    case 'saida': // seta para baixo
      doc.moveTo(px(12), py(6)).lineTo(px(12), py(17.5)).moveTo(px(7.5), py(13)).lineTo(px(12), py(17.5)).lineTo(px(16.5), py(13)).stroke();
      break;
    case 'alteracao': // lápis
      doc.moveTo(px(7), py(17)).lineTo(px(8), py(13.5)).lineTo(px(15), py(6.5)).lineTo(px(17.5), py(9)).lineTo(px(10.5), py(16)).closePath().stroke();
      break;
    case 'alerta': // triângulo com !
      doc.moveTo(px(12), py(5.5)).lineTo(px(19), py(18)).lineTo(px(5), py(18)).closePath().stroke();
      doc.moveTo(px(12), py(10)).lineTo(px(12), py(13.5)).stroke();
      doc.circle(px(12), py(15.8), 0.9 * s).fill();
      break;
    case 'caixa': // carteira
      doc.roundedRect(px(5), py(8), 14 * s, 10 * s, 2 * s).stroke();
      doc.moveTo(px(7), py(8)).lineTo(px(15), py(5.5)).lineTo(px(16), py(8)).stroke();
      doc.circle(px(15.5), py(13), 1 * s).fill();
      break;
    default:
      doc.circle(px(12), py(12), 2.5 * s).fill();
  }
  doc.restore();
}

function header(doc, { issued }) {
  doc.rect(0, 0, W, 62).fill(C.fundo);
  const logo = path.join(ASSETS, 'pulse-logo.png');
  if (fs.existsSync(logo)) doc.image(logo, M, 16, { height: 18 });
  doc.font('bold').fontSize(9).fillColor(C.laranja).text('RESUMO DO DIA', M, 16, { width: CW, align: 'right', characterSpacing: 1.2 });
  doc.font('regular').fontSize(9).fillColor('#BDBDC5').text(issued || '', M, 30, { width: CW, align: 'right' });
  doc.font('regular').fontSize(9).fillColor('#8C8C96').text('Documento interno', M, 41, { width: 140 });
  doc.rect(0, 62, W, 3).fill(C.laranja);
  doc.y = 80;
}

function title(doc, text, subtitle) {
  doc.font('bold').fontSize(20).fillColor(C.texto).text(text, M, doc.y, { width: CW });
  if (subtitle) doc.font('regular').fontSize(11).fillColor(C.cinza).text(subtitle, M, doc.y + 2, { width: CW });
  doc.y += 12;
}

function section(doc, text, need = 60) {
  ensure(doc, need);
  doc.y += 6;
  doc.font('bold').fontSize(12).fillColor(C.laranja).text(text.toUpperCase(), M, doc.y, { width: CW, characterSpacing: 1 });
  doc.y += 6;
}

/** Quadros em 2 colunas: ícone, número grande e o nome embaixo. */
function kpis(doc, items) {
  const gap = 8;
  const w = (CW - gap) / 2;
  const h = 70;
  for (let i = 0; i < items.length; i += 2) {
    ensure(doc, h + gap);
    const y = doc.y;
    items.slice(i, i + 2).forEach((it, j) => {
      const x = M + j * (w + gap);
      doc.roundedRect(x, y, w, h, 12).fill(it.highlight ? C.laranjaClaro : C.cinzaClaro);
      icon(doc, it.icon, x + 10, y + 11, 24, it.highlight ? { fg: '#FFFFFF', bg: C.laranja } : {});
      // o número (ou o valor em dinheiro) diminui até caber ao lado do ícone, sem cortar
      const value = String(it.value ?? '—');
      let size = 24;
      doc.font('bold');
      while (size > 13 && doc.fontSize(size).widthOfString(value) > w - 50) size -= 0.5;
      doc.fontSize(size).fillColor(C.texto).text(value, x + 42, y + 12 + (24 - size) / 2, { width: w - 50, lineBreak: false });
      doc.font('semibold').fontSize(9.5).fillColor(C.cinza).text(it.label, x + 10, y + 42, { width: w - 20, height: 13, ellipsis: true });
      if (it.note) doc.font('regular').fontSize(9).fillColor(C.cinza).text(it.note, x + 10, y + 54, { width: w - 20, height: 12, ellipsis: true });
    });
    doc.y = y + h + gap;
  }
  doc.y += 4;
}

function avatar(doc, person, x, y, size) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  if (person.photo) {
    try {
      doc.save();
      doc.circle(cx, cy, size / 2).clip();
      doc.image(person.photo, x, y, { cover: [size, size], align: 'center', valign: 'center' });
      doc.restore();
      return;
    } catch {
      doc.restore();
    }
  }
  doc.circle(cx, cy, size / 2).fill(person.agent ? C.fundo2 : C.laranja);
  const initial = String(person.name || '?').trim().charAt(0).toUpperCase() || '?';
  doc.font('bold').fontSize(size * 0.44).fillColor('#FFFFFF').text(initial, x, cy - size * 0.29, { width: size, align: 'center' });
}

/** Uma pessoa por cartão: foto, nome, função e cada coisa feita com ícone, em texto de 11 pt na largura toda. */
function people(doc, list) {
  const size = 38;
  const textW = CW - 24 - 22;
  for (const p of list) {
    doc.font('regular').fontSize(11);
    const lines = (p.items || []).map((it) => Math.max(17, doc.heightOfString(it.text, { width: textW }) + 5));
    const h = 12 + size + 8 + lines.reduce((a, b) => a + b, 0) + 6;
    ensure(doc, h + 8);
    const y = doc.y;
    doc.roundedRect(M, y, CW, h, 12).lineWidth(1).strokeColor(C.linha).stroke();
    avatar(doc, p, M + 12, y + 12, size);
    doc.font('bold').fontSize(13).fillColor(C.texto).text(p.name, M + 12 + size + 10, y + 14, { width: CW - size - 34, height: 17, ellipsis: true });
    doc.font('regular').fontSize(10).fillColor(C.cinza).text(p.role || '', M + 12 + size + 10, y + 31, { width: CW - size - 34, height: 13, ellipsis: true });
    if (p.agent) {
      doc.font('bold').fontSize(9);
      const label = 'AGENTE DE IA';
      const tw = doc.widthOfString(label) + 12;
      const bx = M + 12 + size + 10;
      doc.roundedRect(bx, y + 45, tw, 13, 6.5).fill(C.fundo2);
      doc.fillColor('#FFFFFF').text(label, bx, y + 47.5, { width: tw, align: 'center' });
    }
    let ly = y + 12 + size + 10 + (p.agent ? 6 : 0);
    (p.items || []).forEach((it, i) => {
      icon(doc, it.icon, M + 12, ly - 1, 16);
      doc.font('regular').fontSize(11).fillColor(C.texto).text(it.text, M + 12 + 22, ly, { width: textW });
      ly += lines[i];
    });
    doc.y = Math.max(y + h, ly + 6) + 8;
  }
}

/** Entregas por cliente: o nome e uma linha por tipo (ícone, número, primeiro título). */
function clients(doc, list) {
  for (const c of list) {
    doc.font('regular').fontSize(11);
    const rows = c.rows.map((r) => ({ ...r, text: `${r.label}: ${r.count}${r.first ? ` · ${r.first}` : ''}` }));
    const lines = rows.map((r) => Math.max(17, doc.heightOfString(r.text, { width: CW - 46 }) + 4));
    const h = 32 + lines.reduce((a, b) => a + b, 0) + 6;
    ensure(doc, h + 8);
    const y = doc.y;
    doc.roundedRect(M, y, CW, h, 12).fill(C.cinzaClaro);
    doc.font('bold').fontSize(12.5).fillColor(C.texto).text(c.cliente, M + 12, y + 10, { width: CW - 24, height: 16, ellipsis: true });
    let ly = y + 32;
    rows.forEach((r, i) => {
      icon(doc, r.icon, M + 12, ly - 1, 16, { fg: C.laranja, bg: '#FFFFFF' });
      doc.font('regular').fontSize(11).fillColor(C.texto).text(r.text, M + 34, ly, { width: CW - 46 });
      ly += lines[i];
    });
    doc.y = y + h + 8;
  }
}

const sign = (m) => (m.tipo === 'entrada' ? '+' : '−');

/** Financeiro em lista: descrição / forma · quem lançou e o valor à direita; depois os totais. */
function finance(doc, { movimentos, totals, total }) {
  for (const m of movimentos) {
    doc.font('semibold').fontSize(11);
    const dh = doc.heightOfString(m.descricao, { width: CW - 8 });
    const h = dh + 22;
    ensure(doc, h + 4);
    const y = doc.y;
    doc.rect(M, y, 3, h - 6).fill(m.tipo === 'entrada' ? C.verde : C.vermelho);
    doc.font('semibold').fontSize(11).fillColor(C.texto).text(m.descricao, M + 10, y, { width: CW - 10 });
    const ly = y + dh + 2;
    doc.font('regular').fontSize(10).fillColor(C.cinza).text(m.detalhe, M + 10, ly, { width: CW - 110, height: 13, ellipsis: true });
    doc.font('bold').fontSize(12).fillColor(m.tipo === 'entrada' ? C.verde : C.vermelho).text(m.valor, W - M - 100, ly - 1, { width: 100, align: 'right' });
    doc.y = y + h;
    doc.moveTo(M, doc.y - 4).lineTo(W - M, doc.y - 4).lineWidth(0.6).strokeColor(C.linha).stroke();
  }
  const boxH = 16 * totals.length + 40;
  ensure(doc, boxH + 6);
  const y = doc.y + 4;
  doc.roundedRect(M, y, CW, boxH, 12).fill(C.cinzaClaro);
  let ty = y + 10;
  for (const t of totals) {
    doc.font('regular').fontSize(11).fillColor(C.cinza).text(t.label, M + 12, ty, { width: CW / 2 });
    doc.font('semibold').fontSize(11).fillColor(C.texto).text(t.value, M + CW / 2, ty, { width: CW / 2 - 12, align: 'right' });
    ty += 16;
  }
  doc.moveTo(M + 12, ty + 2).lineTo(W - M - 12, ty + 2).lineWidth(0.8).strokeColor(C.linha).stroke();
  doc.font('bold').fontSize(13).fillColor(C.texto).text(total.label, M + 12, ty + 9, { width: CW / 2 });
  doc.fillColor(C.laranja).text(total.value, M + CW / 2, ty + 9, { width: CW / 2 - 12, align: 'right' });
  doc.y = y + boxH + 10;
}

function bullets(doc, items) {
  for (const t of items) {
    doc.font('regular').fontSize(11);
    const h = doc.heightOfString(t, { width: CW - 14 }) + 5;
    ensure(doc, h);
    const y = doc.y;
    doc.circle(M + 4, y + 7, 2.6).fill(C.laranja);
    doc.font('regular').fontSize(11).fillColor(C.texto).text(t, M + 14, y, { width: CW - 14 });
    doc.y = y + h;
  }
  doc.y += 4;
}

function paragraph(doc, text, { size = 11, color = C.texto } = {}) {
  doc.font('regular').fontSize(size);
  ensure(doc, doc.heightOfString(text, { width: CW }) + 6);
  doc.fillColor(color).text(text, M, doc.y, { width: CW, lineGap: 1.5 });
  doc.y += 6;
}

function footer(doc, note) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = H - FOOT;
    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.8).strokeColor(C.linha).stroke();
    doc.font('regular').fontSize(9).fillColor(C.cinza).text(note || 'Agência Pulse · documento interno', M, y + 7, { width: CW - 60, height: 12, ellipsis: true, lineBreak: false });
    doc.text(`${i - range.start + 1}/${range.count}`, W - M - 50, y + 7, { width: 50, align: 'right', lineBreak: false });
    doc.rect(0, H - 6, W, 6).fill(C.laranja);
  }
}

/**
 * spec = { title, subtitle, issued, footerNote,
 *          sections: [{ title?, type: 'kpis'|'people'|'clients'|'finance'|'bullets'|'text', ... , need? }] }
 *   kpis: items [{ icon, label, value, note?, highlight? }]   people: people [{ name, role, agent, photo?, items: [{ icon, text }] }]
 *   clients: clients [{ cliente, rows: [{ icon, label, count, first? }] }]
 *   finance: movimentos [{ tipo, descricao, detalhe, valor }], totals [{ label, value }], total { label, value }
 *   bullets: bullets [texto], note?          text: text
 */
export async function renderDailyPdf(spec) {
  const doc = new PDFDocument({ size: [W, H], margin: 0, bufferPages: true, info: { Title: spec.title, Author: 'Agência Pulse', Subject: spec.subtitle || spec.title } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  setup(doc);
  header(doc, { issued: spec.issued });
  title(doc, spec.title, spec.subtitle);
  for (const s of spec.sections || []) {
    const need = s.need || { kpis: 90, people: 120, clients: 90, finance: 90 }[s.type] || 60;
    if (s.title) section(doc, s.title, need);
    switch (s.type) {
      case 'kpis': kpis(doc, s.items); break;
      case 'people': people(doc, s.people); break;
      case 'clients': clients(doc, s.clients); break;
      case 'finance': finance(doc, s); break;
      case 'bullets':
        bullets(doc, s.bullets || []);
        if (s.note) paragraph(doc, s.note, { size: 10, color: C.cinza });
        break;
      default:
        if (s.text) paragraph(doc, s.text);
        if (s.note) paragraph(doc, s.note, { size: 10, color: C.cinza });
    }
  }
  footer(doc, spec.footerNote);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

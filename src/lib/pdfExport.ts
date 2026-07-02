import jsPDF from 'jspdf';

export type KPI = { label: string; value: string; sub?: string };
export type TableSpec = { title: string; headers: string[]; rows: (string | number)[][] };

interface Options {
  title: string;
  subtitle?: string;
  period: { start: string; end: string };
  kpis?: KPI[];
  tables?: TableSpec[];
  filename: string;
}

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;

/**
 * Simple, dependency-light PDF generator for KPI + table reports.
 * Uses only jsPDF core (no autotable) to keep bundle minimal.
 */
export function exportReportPDF(opts: Options) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(opts.title, MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  if (opts.subtitle) {
    doc.text(opts.subtitle, MARGIN, y);
    y += 4;
  }
  doc.text(`Período: ${opts.period.start} até ${opts.period.end}`, MARGIN, y);
  y += 3;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, MARGIN, y);
  y += 6;
  doc.setDrawColor(220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;
  doc.setTextColor(0);

  // KPIs (grid: 2 columns)
  if (opts.kpis && opts.kpis.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Indicadores', MARGIN, y);
    y += 5;

    const colW = (PAGE_W - MARGIN * 2) / 2;
    const rowH = 18;
    for (let i = 0; i < opts.kpis.length; i += 2) {
      ensureSpace(rowH + 2);
      const items = opts.kpis.slice(i, i + 2);
      items.forEach((k, idx) => {
        const x = MARGIN + idx * colW;
        doc.setDrawColor(230);
        doc.setFillColor(248, 249, 251);
        doc.roundedRect(x, y, colW - 3, rowH - 2, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110);
        doc.text(k.label.toUpperCase(), x + 3, y + 4);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(20);
        doc.text(k.value, x + 3, y + 10);
        if (k.sub) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(120);
          doc.text(k.sub, x + 3, y + 14);
        }
      });
      y += rowH;
    }
    y += 4;
  }

  // Tables
  (opts.tables || []).forEach(tbl => {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(tbl.title, MARGIN, y);
    y += 4;

    const totalW = PAGE_W - MARGIN * 2;
    const colW = totalW / tbl.headers.length;
    const rowH = 6;

    const drawHeader = () => {
      doc.setFillColor(30, 41, 59);
      doc.rect(MARGIN, y, totalW, rowH, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      tbl.headers.forEach((h, i) => {
        doc.text(String(h), MARGIN + i * colW + 1.5, y + 4);
      });
      y += rowH;
      doc.setTextColor(20);
      doc.setFont('helvetica', 'normal');
    };

    drawHeader();

    tbl.rows.forEach((row, ri) => {
      ensureSpace(rowH);
      if (y === MARGIN) drawHeader();
      if (ri % 2 === 0) {
        doc.setFillColor(245, 247, 250);
        doc.rect(MARGIN, y, totalW, rowH, 'F');
      }
      doc.setFontSize(7.5);
      row.forEach((cell, i) => {
        const raw = cell == null ? '' : String(cell);
        const maxChars = Math.max(6, Math.floor(colW / 1.6));
        const text = raw.length > maxChars ? raw.slice(0, maxChars - 1) + '…' : raw;
        doc.text(text, MARGIN + i * colW + 1.5, y + 4);
      });
      y += rowH;
    });
    y += 6;
  });

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Página ${i} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
    doc.text('Pulse Growth Marketing', MARGIN, PAGE_H - 6);
  }

  doc.save(opts.filename);
}

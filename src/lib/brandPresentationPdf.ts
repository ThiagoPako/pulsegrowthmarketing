import jsPDF from 'jspdf';

interface BrandPresentationData {
  clientName: string;
  responsiblePerson?: string;
  logoUrl?: string | null;
  attachmentUrl?: string | null;
  mockupUrl?: string | null;
  referenceImages?: string[];
  observations?: string | null;
  designerName?: string;
  createdAt: string;
}

const PULSE_BLUE: [number, number, number] = [30, 64, 175];
const PULSE_DARK: [number, number, number] = [25, 25, 35];
const LIGHT_BG: [number, number, number] = [245, 247, 250];
const ACCENT: [number, number, number] = [99, 102, 241];
const TEXT_DARK: [number, number, number] = [30, 30, 40];
const TEXT_MUTED: [number, number, number] = [120, 120, 135];
const WHITE: [number, number, number] = [255, 255, 255];

async function loadImageAsDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.width, height: img.height });
    };
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 5000);
  });
}

export async function generateBrandPresentationPdf(data: BrandPresentationData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;

  // ============ HELPER FUNCTIONS ============
  const addPage = () => {
    doc.addPage();
    drawPageBorder();
  };

  const drawPageBorder = () => {
    doc.setDrawColor(...PULSE_BLUE);
    doc.setLineWidth(0.8);
    doc.rect(8, 8, pageW - 16, pageH - 16);
  };

  const drawSectionTitle = (title: string, y: number, icon?: string): number => {
    doc.setFillColor(...PULSE_BLUE);
    doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...WHITE);
    doc.text(`${icon ? icon + '  ' : ''}${title}`, margin + 5, y + 7);
    return y + 16;
  };

  const drawInfoBox = (label: string, value: string, x: number, y: number, w: number): number => {
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(x, y, w, 18, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label.toUpperCase(), x + 4, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_DARK);
    const lines = doc.splitTextToSize(value || '—', w - 8);
    doc.text(lines[0] || '—', x + 4, y + 13);
    return y + 22;
  };

  // ============ PAGE 1: COVER ============
  drawPageBorder();

  // Header background
  doc.setFillColor(...PULSE_DARK);
  doc.rect(8, 8, pageW - 16, 70, 'F');

  // Try to load header image
  const headerImg = await loadImageAsDataUrl('/pulse_header.png');
  if (headerImg) {
    const ratio = headerImg.width / headerImg.height;
    const imgW = pageW - 16;
    const imgH = Math.min(imgW / ratio, 70);
    doc.addImage(headerImg.dataUrl, 'PNG', 8, 8, imgW, imgH);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...WHITE);
    doc.text('PULSE GROWTH MARKETING', pageW / 2, 45, { align: 'center' });
  }

  let y = 90;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...PULSE_BLUE);
  doc.text('APRESENTAÇÃO', pageW / 2, y, { align: 'center' });
  y += 10;
  doc.setFontSize(20);
  doc.setTextColor(...TEXT_DARK);
  doc.text('DE IDENTIDADE VISUAL', pageW / 2, y, { align: 'center' });
  y += 16;

  // Decorative line
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.5);
  doc.line(pageW / 2 - 30, y, pageW / 2 + 30, y);
  y += 12;

  // Client name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...TEXT_DARK);
  doc.text(data.clientName.toUpperCase(), pageW / 2, y, { align: 'center' });
  y += 10;

  if (data.responsiblePerson) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Responsável: ${data.responsiblePerson}`, pageW / 2, y, { align: 'center' });
    y += 8;
  }

  // Logo preview on cover (if available)
  const logoSrc = data.logoUrl || data.attachmentUrl || data.mockupUrl;
  if (logoSrc) {
    const logoImg = await loadImageAsDataUrl(logoSrc);
    if (logoImg) {
      y += 10;
      const maxLogoW = 80;
      const maxLogoH = 60;
      const ratio = logoImg.width / logoImg.height;
      let lw = maxLogoW;
      let lh = lw / ratio;
      if (lh > maxLogoH) { lh = maxLogoH; lw = lh * ratio; }
      const lx = (pageW - lw) / 2;
      // Logo container
      doc.setFillColor(...LIGHT_BG);
      doc.roundedRect(lx - 5, y - 3, lw + 10, lh + 6, 3, 3, 'F');
      doc.setDrawColor(220, 220, 230);
      doc.setLineWidth(0.3);
      doc.roundedRect(lx - 5, y - 3, lw + 10, lh + 6, 3, 3, 'S');
      doc.addImage(logoImg.dataUrl, 'PNG', lx, y, lw, lh);
      y += lh + 15;
    }
  }

  // Date & Designer info at bottom
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  const dateStr = new Date(data.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`Data: ${dateStr}`, pageW / 2, pageH - 30, { align: 'center' });
  if (data.designerName) {
    doc.text(`Designer: ${data.designerName}`, pageW / 2, pageH - 24, { align: 'center' });
  }
  doc.setFontSize(8);
  doc.text('Documento confidencial · Pulse Growth Marketing', pageW / 2, pageH - 16, { align: 'center' });

  // ============ PAGE 2: LOGOMARCA ============
  addPage();
  y = 18;
  y = drawSectionTitle('LOGOMARCA', y, '🎨');

  // Logo display large
  if (logoSrc) {
    const logoImg2 = await loadImageAsDataUrl(logoSrc);
    if (logoImg2) {
      const maxW = contentW;
      const maxH = 80;
      const ratio = logoImg2.width / logoImg2.height;
      let lw = maxW;
      let lh = lw / ratio;
      if (lh > maxH) { lh = maxH; lw = lh * ratio; }
      const lx = (pageW - lw) / 2;
      doc.setFillColor(250, 250, 252);
      doc.roundedRect(lx - 5, y, lw + 10, lh + 10, 4, 4, 'F');
      doc.setDrawColor(230, 230, 240);
      doc.roundedRect(lx - 5, y, lw + 10, lh + 10, 4, 4, 'S');
      doc.addImage(logoImg2.dataUrl, 'PNG', lx, y + 5, lw, lh);
      y += lh + 20;
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Logomarca será inserida após aprovação do cliente.', pageW / 2, y + 20, { align: 'center' });
    y += 35;
  }

  // Logo usage notes
  y = drawSectionTitle('VERSÕES DA MARCA', y, '📐');
  const versions = [
    { label: 'Principal', desc: 'Versão completa para uso prioritário em todas as aplicações.' },
    { label: 'Monocromática', desc: 'Versão em cor única para aplicações com restrição de cores.' },
    { label: 'Negativa', desc: 'Versão para uso sobre fundos escuros ou com baixo contraste.' },
    { label: 'Reduzida', desc: 'Ícone ou símbolo para uso em espaços reduzidos (favicon, ícones).' },
  ];
  versions.forEach(v => {
    if (y > pageH - 30) { addPage(); y = 18; }
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PULSE_BLUE);
    doc.text(`▸ ${v.label}`, margin + 4, y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_DARK);
    doc.text(v.desc, margin + 4, y + 11);
    y += 17;
  });

  // ============ PAGE 3: MANUAL DA MARCA ============
  addPage();
  y = 18;
  y = drawSectionTitle('MANUAL DA MARCA', y, '📖');

  // Color palette section
  const halfW = contentW / 2 - 3;
  y = drawInfoBox('Tipografia Principal', 'Definida no projeto criativo', margin, y, halfW);
  drawInfoBox('Tipografia Secundária', 'Definida no projeto criativo', margin + halfW + 6, y - 22, halfW);

  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Paleta de Cores', margin, y);
  y += 6;

  // Color placeholder boxes
  const colorBoxW = (contentW - 20) / 5;
  const colors = [
    { label: 'Primária', color: [30, 64, 175] },
    { label: 'Secundária', color: [99, 102, 241] },
    { label: 'Acento', color: [245, 158, 11] },
    { label: 'Neutra', color: [75, 85, 99] },
    { label: 'Background', color: [243, 244, 246] },
  ];
  colors.forEach((c, i) => {
    const cx = margin + i * (colorBoxW + 4);
    doc.setFillColor(c.color[0], c.color[1], c.color[2]);
    doc.roundedRect(cx, y, colorBoxW, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(c.label, cx + colorBoxW / 2, y + 26, { align: 'center' });
  });
  y += 34;

  // Brand rules
  y = drawSectionTitle('REGRAS DE USO', y, '⚠️');
  const rules = [
    'Manter área de proteção mínima ao redor da logo.',
    'Não distorcer, rotacionar ou alterar as proporções da marca.',
    'Não aplicar sobre fundos que comprometam a legibilidade.',
    'Usar apenas as cores definidas na paleta oficial.',
    'Respeitar o tamanho mínimo de reprodução.',
  ];
  rules.forEach(rule => {
    if (y > pageH - 25) { addPage(); y = 18; }
    doc.setFillColor(255, 249, 235);
    doc.roundedRect(margin, y, contentW, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_DARK);
    doc.text(`  ●  ${rule}`, margin + 3, y + 5.5);
    y += 11;
  });

  // ============ PAGE 4: USABILIDADE ============
  addPage();
  y = 18;
  y = drawSectionTitle('USABILIDADE', y, '📱');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_DARK);
  const usabilityIntro = 'A identidade visual foi projetada para funcionar de forma consistente em diferentes meios e plataformas:';
  const introLines = doc.splitTextToSize(usabilityIntro, contentW);
  doc.text(introLines, margin, y + 5);
  y += introLines.length * 5 + 10;

  const applications = [
    { title: 'Redes Sociais', items: ['Foto de perfil', 'Capa de página', 'Posts e stories', 'Destaques do Instagram'] },
    { title: 'Material Digital', items: ['Assinatura de e-mail', 'Apresentações', 'Website / Landing Page', 'Documentos PDF'] },
    { title: 'Material Impresso', items: ['Cartão de visita', 'Papel timbrado', 'Envelope', 'Fachada / Sinalização'] },
  ];

  const colW = (contentW - 12) / 3;
  applications.forEach((app, i) => {
    const cx = margin + i * (colW + 6);
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(cx, y, colW, 65, 3, 3, 'F');
    doc.setDrawColor(220, 220, 230);
    doc.roundedRect(cx, y, colW, 65, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PULSE_BLUE);
    doc.text(app.title, cx + colW / 2, y + 8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_DARK);
    app.items.forEach((item, j) => {
      doc.text(`•  ${item}`, cx + 5, y + 18 + j * 10);
    });
  });
  y += 75;

  // ============ PAGE 5: CARTÃO DE VISITA ============
  addPage();
  y = 18;
  y = drawSectionTitle('CARTÃO DE VISITA', y, '💼');

  // Business card mockup frame (front)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('FRENTE', margin, y + 4);
  y += 8;

  // Card front
  doc.setFillColor(...PULSE_DARK);
  doc.roundedRect(margin, y, contentW, 55, 4, 4, 'F');
  // Logo in card
  if (logoSrc) {
    const cardLogo = await loadImageAsDataUrl(logoSrc);
    if (cardLogo) {
      const ratio = cardLogo.width / cardLogo.height;
      let cw = 40;
      let ch = cw / ratio;
      if (ch > 30) { ch = 30; cw = ch * ratio; }
      doc.addImage(cardLogo.dataUrl, 'PNG', (pageW - cw) / 2, y + (55 - ch) / 2, cw, ch);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...WHITE);
    doc.text(data.clientName, pageW / 2, y + 28, { align: 'center' });
  }
  y += 62;

  // Card back
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('VERSO', margin, y + 4);
  y += 8;

  doc.setFillColor(...WHITE);
  doc.setDrawColor(220, 220, 230);
  doc.roundedRect(margin, y, contentW, 55, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TEXT_DARK);
  doc.text(data.clientName, margin + 12, y + 15);

  if (data.responsiblePerson) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(data.responsiblePerson, margin + 12, y + 22);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('contato@empresa.com.br', margin + 12, y + 32);
  doc.text('(00) 00000-0000', margin + 12, y + 38);
  doc.text('www.empresa.com.br', margin + 12, y + 44);
  y += 62;

  // Specifications
  if (y < pageH - 40) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_DARK);
    doc.text('Especificações de impressão:', margin, y + 4);
    y += 10;
    const specs = ['Formato: 90x50mm', 'Papel: Couché 300g', 'Acabamento: Laminação fosca + verniz localizado', 'Sangria: 3mm'];
    specs.forEach(s => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(`  ▸  ${s}`, margin, y);
      y += 6;
    });
  }

  // ============ FINAL PAGE: Observations & Footer ============
  if (data.observations) {
    addPage();
    y = 18;
    y = drawSectionTitle('OBSERVAÇÕES', y, '📝');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_DARK);
    const obsLines = doc.splitTextToSize(data.observations, contentW);
    doc.text(obsLines, margin, y + 5);
  }

  // Footer on last page
  const lastPageH = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    `Documento gerado em ${new Date().toLocaleDateString('pt-BR')} · Pulse Growth Marketing · Todos os direitos reservados`,
    pageW / 2,
    lastPageH - 14,
    { align: 'center' }
  );

  // Save
  const fileName = `apresentacao-marca-${data.clientName.replace(/\s+/g, '-').toLowerCase()}.pdf`;
  doc.save(fileName);
  return fileName;
}

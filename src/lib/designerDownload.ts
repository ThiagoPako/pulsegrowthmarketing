import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import pulseHeader from '@/assets/pulse_header.png';
import pulseLogo from '@/assets/pulse_logo.png';

const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(url);

async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('Falha ao baixar ' + url);
  return res.blob();
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function sanitize(name: string) {
  return name.replace(/[^\w\s.-]+/g, '_').slice(0, 80);
}

async function loadImageAsDataUrl(src: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const img = new window.Image();
    await new Promise((res2, rej) => {
      img.onload = res2;
      img.onerror = rej;
      img.src = dataUrl;
    });
    return { dataUrl, width: img.width, height: img.height };
  } catch {
    return null;
  }
}

export async function downloadSingleArt(url: string, filename: string) {
  try {
    const blob = await fetchAsBlob(url);
    const ext = url.split('.').pop()?.split('?')[0] || 'file';
    triggerBlobDownload(blob, `${sanitize(filename)}.${ext}`);
  } catch {
    window.open(url, '_blank');
  }
}

function drawPulseHeader(
  pdf: jsPDF,
  pageW: number,
  logo: { dataUrl: string; width: number; height: number } | null,
  pageNumber: number,
  totalPages: number,
  projectTitle: string,
) {
  // Background bar
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.rect(0, 0, pageW, 18, 'F');

  // Accent line
  pdf.setFillColor(236, 72, 153); // pink-500
  pdf.rect(0, 18, pageW, 0.8, 'F');

  // Logo
  if (logo) {
    const logoH = 10;
    const logoW = (logo.width / logo.height) * logoH;
    try {
      pdf.addImage(logo.dataUrl, 'PNG', 8, 4, logoW, logoH);
    } catch { /* ignore */ }
  }

  // Brand text
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('PULSE', 24, 9);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(236, 72, 153);
  pdf.text('GROWTH MARKETING', 24, 13.5);

  // Project title (right side)
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const right = sanitize(projectTitle);
  const truncated = right.length > 50 ? right.slice(0, 47) + '...' : right;
  pdf.text(truncated, pageW - 8, 9, { align: 'right' });
  pdf.setFontSize(7);
  pdf.setTextColor(200, 200, 200);
  pdf.text(`Página ${pageNumber} de ${totalPages}`, pageW - 8, 13.5, { align: 'right' });

  // Reset
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
}

function drawPulseFooter(pdf: jsPDF, pageW: number, pageH: number) {
  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.2);
  pdf.line(8, pageH - 10, pageW - 8, pageH - 10);
  pdf.setFontSize(7);
  pdf.setTextColor(120, 120, 120);
  pdf.text('Pulse Growth Marketing • Minaçu-GO • pulsegrowthmarketing.com', pageW / 2, pageH - 6, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
}

export async function downloadArtsAsPdf(
  arts: { url: string; title: string }[],
  pdfName: string
) {
  if (arts.length === 0) return;
  const onlyImages = arts.filter(a => isImage(a.url));
  if (onlyImages.length === 0) {
    toast.error('Nenhuma imagem para gerar PDF. Baixando individualmente.');
    for (const a of arts) await downloadSingleArt(a.url, a.title);
    return;
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerH = 22;
  const footerH = 12;

  // Try header logo (pulse_header) first, fallback to pulse_logo
  let logo = await loadImageAsDataUrl(pulseHeader);
  if (!logo) logo = await loadImageAsDataUrl(pulseLogo);

  const total = onlyImages.length;

  // Pre-carrega TODAS as imagens antes (evita race conditions e dedupe do jsPDF)
  const loaded: Array<{ dataUrl: string; width: number; height: number; format: 'PNG' | 'JPEG'; title: string } | null> = [];
  for (const art of onlyImages) {
    try {
      const blob = await fetchAsBlob(art.url);
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const img = new window.Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      // Detecta formato pelo mime type real (não pela extensão da URL)
      const mime = dataUrl.substring(5, dataUrl.indexOf(';')).toLowerCase();
      const format: 'PNG' | 'JPEG' = mime.includes('png') ? 'PNG' : 'JPEG';
      loaded.push({ dataUrl, width: img.width, height: img.height, format, title: art.title });
    } catch (err) {
      console.error('Erro ao carregar arte:', art.url, err);
      loaded.push(null);
    }
  }

  const validItems = loaded.filter((x): x is NonNullable<typeof x> => x !== null);
  const realTotal = validItems.length;
  if (realTotal === 0) {
    toast.error('Não foi possível carregar nenhuma imagem.');
    return;
  }

  for (let i = 0; i < realTotal; i++) {
    const item = validItems[i];
    if (i > 0) pdf.addPage();

    drawPulseHeader(pdf, pageW, logo, i + 1, realTotal, pdfName);

    pdf.setFontSize(10);
    pdf.setTextColor(80, 80, 80);
    pdf.text(sanitize(item.title), margin, headerH + 5);
    pdf.setTextColor(0, 0, 0);

    const topY = headerH + 8;
    const maxW = pageW - margin * 2;
    const maxH = pageH - topY - footerH;
    const ratio = Math.min(maxW / item.width, maxH / item.height);
    const w = item.width * ratio;
    const h = item.height * ratio;
    const x = (pageW - w) / 2;
    const y = topY;

    // alias ÚNICO por arte + índice — evita dedupe interno do jsPDF que causa duplicação
    const uniqueAlias = `art_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pdf.addImage(item.dataUrl, item.format, x, y, w, h, uniqueAlias, 'FAST');

    drawPulseFooter(pdf, pageW, pageH);
  }

  pdf.save(`${sanitize(pdfName)}.pdf`);
}

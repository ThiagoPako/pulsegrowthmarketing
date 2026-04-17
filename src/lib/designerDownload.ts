import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

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

export async function downloadSingleArt(url: string, filename: string) {
  try {
    const blob = await fetchAsBlob(url);
    const ext = url.split('.').pop()?.split('?')[0] || 'file';
    triggerBlobDownload(blob, `${sanitize(filename)}.${ext}`);
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank');
  }
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

  for (let i = 0; i < onlyImages.length; i++) {
    const art = onlyImages[i];
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

      if (i > 0) pdf.addPage();

      // Title
      pdf.setFontSize(11);
      pdf.text(sanitize(art.title), margin, margin + 4);

      // Fit image
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2 - 10;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = (pageW - w) / 2;
      const y = margin + 8;

      const fmt = (art.url.toLowerCase().includes('.png') ? 'PNG' : 'JPEG') as 'PNG' | 'JPEG';
      pdf.addImage(dataUrl, fmt, x, y, w, h);
    } catch (err) {
      console.error('Erro ao adicionar arte ao PDF:', err);
    }
  }

  pdf.save(`${sanitize(pdfName)}.pdf`);
}

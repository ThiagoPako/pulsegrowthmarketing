import jsPDF from 'jspdf';
import type { Client, DayOfWeek } from '@/types';
import { DAY_LABELS } from '@/types';
import { NICHE_OPTIONS } from '@/lib/seasonalDates';

const HEADER_URL = '/roteiro-header.pdf';

export async function generateClientCardPdf(client: Client, videomakerName: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Try to load header from existing PDF
  try {
    const response = await fetch(HEADER_URL);
    const arrayBuffer = await response.arrayBuffer();
    const headerPdf = new jsPDF();
    // Load the header PDF as image
    const headerCanvas = document.createElement('canvas');
    const headerImg = await loadPdfAsImage(arrayBuffer);
    if (headerImg) {
      const imgRatio = headerImg.width / headerImg.height;
      const imgWidth = pageWidth;
      const imgHeight = imgWidth / imgRatio;
      doc.addImage(headerImg.dataUrl, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, 40));
    }
  } catch (e) {
    // Fallback: draw a simple header bar
    doc.setFillColor(25, 25, 35);
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PULSE GROWTH MARKETING', pageWidth / 2, 18, { align: 'center' });
  }

  let y = 45;

  // Title
  doc.setTextColor(30, 30, 40);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Ficha do Cliente', margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(200, 200, 210);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Helper function
  const addField = (label: string, value: string, indent = 0) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 110);
    doc.text(label, margin + indent, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 40);
    doc.text(value || '—', margin + indent + 50, y);
    y += 7;
  };

  const addSection = (title: string) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    y += 4;
    doc.setFillColor(240, 240, 245);
    doc.roundedRect(margin, y - 4, contentWidth, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 60);
    doc.text(title, margin + 4, y + 1.5);
    y += 10;
  };

  // === DADOS DA EMPRESA ===
  addSection('DADOS DA EMPRESA');
  addField('Empresa', client.companyName);
  addField('Responsável', client.responsiblePerson);
  addField('Telefone', client.phone);
  addField('WhatsApp', client.whatsapp);
  addField('E-mail', client.email);
  addField('Cidade', client.city);
  const nicheLabel = NICHE_OPTIONS.find(n => n.value === client.niche)?.label || client.niche || '—';
  addField('Nicho', nicheLabel);

  // === ACESSOS ===
  addSection('ACESSOS E LINKS');
  addField('Login', client.clientLogin || '');
  addField('Senha', client.clientPassword || '');
  addField('Drive (Geral)', client.driveLink || '');
  addField('Drive Fotos', client.driveFotos || '');
  addField('Drive ID Visual', client.driveIdentidadeVisual || '');

  // === AGENDA ===
  addSection('AGENDA DE GRAVAÇÃO');
  addField('Videomaker', videomakerName);
  addField('Dia Fixo', DAY_LABELS[client.fixedDay] || client.fixedDay);
  addField('Horário', client.fixedTime);
  addField('Dia Backup', DAY_LABELS[client.backupDay] || client.backupDay);
  addField('Horário Backup', client.backupTime);
  addField('Grav./Mês', String(client.monthlyRecordings || 4));

  // === METAS ===
  addSection('METAS SEMANAIS');
  addField('Reels/Sem.', String(client.weeklyReels || 0));
  addField('Criativos/Sem.', String(client.weeklyCreatives || 0));
  addField('Stories/Sem.', String(client.weeklyStories || 0));
  addField('Meta Total', String(client.weeklyGoal || 0));

  // Footer
  y = 280;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 160);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · Pulse Growth Marketing`, pageWidth / 2, y, { align: 'center' });

  doc.save(`ficha-${client.companyName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

async function loadPdfAsImage(arrayBuffer: ArrayBuffer): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    // Use pdfjsLib if available, otherwise try canvas approach
    // For simplicity, we'll use a simpler approach - render as image via canvas
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    // Try using an iframe + canvas approach
    const canvas = document.createElement('canvas');
    canvas.width = 2100;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Load the Pulse header image instead
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    return new Promise((resolve) => {
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: img.width,
          height: img.height,
        });
      };
      img.onerror = () => resolve(null);
      // Try loading the PNG header instead
      img.src = '/pulse_header.png';
      // Fallback timeout
      setTimeout(() => resolve(null), 3000);
    });
  } catch {
    return null;
  }
}

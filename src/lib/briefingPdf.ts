import jsPDF from 'jspdf';
import { parseEditorial } from './editorialFormatter';
import pulseHeader from '@/assets/pulse_header.png';
import pulseLogo from '@/assets/pulse_logo.png';
import { BRIEFING_FIELD_LABELS, formatBriefingValue, getBriefingFieldLabel } from './briefingLabels';

// Mapeia as chaves usadas no formulário (ClientBriefing.tsx) para rótulos amigáveis
const FIELD_LABELS: Record<string, string> = {
  ...BRIEFING_FIELD_LABELS,
  ownerName: 'Nome do responsável',
  niche: 'Nicho de atuação',
  mainDifferential: 'Principal diferencial',
  productsServices: 'Produtos / Serviços',
  businessGoals: 'Objetivos (curto, médio e longo prazo)',
  attendanceType: 'Forma de atendimento',
  targetCities: 'Cidades-alvo',
  hasVisualIdentity: 'Possui identidade visual?',
  hasSite: 'Site',
  competitors: 'Principais concorrentes',
  digitalReferences: 'Referências digitais (outros nichos)',
  nicheReferences: 'Referências do mesmo nicho',
  dislikedCommunication: 'Comunicação que NÃO gosta',
  socialObjectives: 'Objetivos nas redes sociais',
  digitalDifficulty: 'Maior dificuldade no digital',
  socialLinks: 'Links das redes sociais',
  importantTopics: 'Assuntos importantes',
  comfortOnCamera: 'Conforto diante da câmera',
  focusProducts: 'Produtos / serviços em foco',
  businessDifficulty: 'Maior dificuldade no negócio',
  desiredRecognition: 'Como deseja ser reconhecido',
  undesiredRecognition: 'Como NÃO deseja ser reconhecido',
  contentReferences: 'Referências de conteúdo',
  keywords: 'Palavras-chave',
  ageRangesTarget: 'Faixa etária do público-alvo',
  ageRangesBuyer: 'Faixa etária de quem compra',
  isAuthority: 'É autoridade no nicho?',
  educationLevel: 'Escolaridade do público',
  socialClass: 'Classe social',
  clientUsesSocial: 'O cliente usa redes sociais?',
  idealClient: 'Cliente ideal',
  finalNotes: 'Considerações finais',
  instagramLogin: 'Instagram — login',
  instagramPassword: 'Instagram — senha',
  facebookLogin: 'Facebook — login',
  facebookPassword: 'Facebook — senha',
  otherAccesses: 'Outros acessos',
  useRealPhotos: 'Usar fotos reais?',
  business_description: 'Descrição do negócio',
  target_audience: 'Público-alvo',
  differentials: 'Diferenciais',
  tone_of_voice: 'Tom de voz',
  goals: 'Objetivos',
  visual_references: 'Referências visuais',
  brand_colors: 'Cores da marca',
  avoid: 'Evitar',
  additional_notes: 'Observações adicionais',
  products_services: 'Produtos / Serviços',
  social_media_links: 'Redes sociais',
};

const SECTIONS: { title: string; number: string; keys: string[]; subtitle: string }[] = [
  {
    number: '01',
    title: 'Identidade do Negócio',
    subtitle: 'Quem é o cliente, o que oferece e onde atua',
    keys: ['ownerName', 'niche', 'mainDifferential', 'productsServices', 'products_services', 'focusProducts', 'businessGoals', 'goals', 'attendanceType', 'targetCities', 'business_description', 'differentials'],
  },
  {
    number: '02',
    title: 'Público-Alvo',
    subtitle: 'Perfil de quem consome e de quem decide a compra',
    keys: ['idealClient', 'target_audience', 'ageRangesTarget', 'ageRangesBuyer', 'educationLevel', 'socialClass', 'clientUsesSocial', 'isAuthority'],
  },
  {
    number: '03',
    title: 'Comunicação & Voz',
    subtitle: 'Tom, temas e posicionamento nas redes',
    keys: ['socialObjectives', 'importantTopics', 'keywords', 'tone_of_voice', 'dislikedCommunication', 'desiredRecognition', 'undesiredRecognition', 'avoid'],
  },
  {
    number: '04',
    title: 'Marca & Visual',
    subtitle: 'Identidade visual, canais e presença atual',
    keys: ['hasVisualIdentity', 'brand_colors', 'useRealPhotos', 'comfortOnCamera', 'hasSite', 'socialLinks', 'social_media_links'],
  },
  {
    number: '05',
    title: 'Referências',
    subtitle: 'Inspirações digitais e concorrência',
    keys: ['digitalReferences', 'nicheReferences', 'contentReferences', 'visual_references', 'competitors'],
  },
  {
    number: '06',
    title: 'Desafios & Considerações',
    subtitle: 'Dores atuais e observações do cliente',
    keys: ['digitalDifficulty', 'businessDifficulty', 'finalNotes', 'additional_notes'],
  },
  {
    number: '07',
    title: 'Acessos',
    subtitle: 'Credenciais e permissões',
    keys: ['instagramLogin', 'instagramPassword', 'facebookLogin', 'facebookPassword', 'otherAccesses'],
  },
];

function sanitize(s: string): string {
  if (!s) return '';
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/[\u2190-\u21FF\u2300-\u23FF]/g, '')
    .trim();
}

function formatValue(v: any): string {
  return formatBriefingValue(v);
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

export async function generateBriefingPdf(opts: {
  companyName: string;
  responsiblePerson?: string;
  niche?: string;
  city?: string;
  briefingData: any;
  editorial?: string;
  submittedAt?: string;
}) {
  const { companyName, responsiblePerson, niche, city, briefingData, editorial, submittedAt } = opts;
  const data = briefingData && typeof briefingData === 'object' ? briefingData : {};

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // Paleta Pulse
  const DARK: [number, number, number] = [13, 15, 25];
  const DARK_2: [number, number, number] = [22, 25, 40];
  const ACCENT: [number, number, number] = [235, 90, 45];
  const ACCENT_SOFT: [number, number, number] = [252, 240, 234];
  const MUTED: [number, number, number] = [130, 132, 145];
  const TEXT: [number, number, number] = [28, 30, 40];
  const BORDER: [number, number, number] = [230, 232, 240];

  // Carrega logos
  const headerLogo = await loadImageAsDataUrl(pulseHeader);
  const markLogo = await loadImageAsDataUrl(pulseLogo);

  // ================= CAPA =================
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Grid decorativo sutil
  doc.setDrawColor(30, 34, 52);
  doc.setLineWidth(0.1);
  for (let gx = 0; gx < pageWidth; gx += 15) doc.line(gx, 0, gx, pageHeight);

  // Faixa lateral accent
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, 8, pageHeight, 'F');

  // Logo Pulse (header horizontal) — grande no topo
  if (headerLogo) {
    const logoH = 22;
    const logoW = (headerLogo.width / headerLogo.height) * logoH;
    try { doc.addImage(headerLogo.dataUrl, 'PNG', margin, 32, logoW, logoH); } catch {}
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('PULSE', margin, 46);
  }

  // Etiqueta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text('BRIEFING ESTRATÉGICO', margin, 68);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.4);
  doc.line(margin, 71, margin + 45, 71);

  // Linha decorativa central
  doc.setDrawColor(60, 65, 90);
  doc.setLineWidth(0.2);
  doc.line(margin, 90, pageWidth - margin, 90);

  // Título gigante do cliente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(sanitize(companyName), contentWidth - 10);
  let ty = 118;
  for (const l of titleLines) {
    doc.text(l, margin, ty);
    ty += 13;
  }

  // Descrição
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(170, 174, 195);
  const descLines = doc.splitTextToSize(
    'Este documento reúne todas as informações estratégicas coletadas junto ao cliente para orientar o planejamento de conteúdo, produção criativa e execução da Pulse Growth Marketing.',
    contentWidth - 20
  );
  ty += 4;
  for (const l of descLines) {
    doc.text(l, margin, ty);
    ty += 5.5;
  }

  // Cards de metadados (3 colunas)
  const metaY = pageHeight - 92;
  const metaItems: Array<[string, string]> = [];
  if (niche) metaItems.push(['NICHO', niche]);
  if (city) metaItems.push(['CIDADE', city]);
  if (responsiblePerson) metaItems.push(['RESPONSÁVEL', responsiblePerson]);
  if (submittedAt) {
    const d = new Date(submittedAt);
    if (!isNaN(d.getTime())) metaItems.push(['ENVIADO EM', d.toLocaleDateString('pt-BR')]);
  }
  const colW = (contentWidth - 12) / Math.max(metaItems.length, 1);
  metaItems.forEach((it, i) => {
    const cx = margin + i * (colW + 4);
    doc.setFillColor(...DARK_2);
    doc.rect(cx, metaY, colW, 22, 'F');
    doc.setFillColor(...ACCENT);
    doc.rect(cx, metaY, colW, 1.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...ACCENT);
    doc.text(it[0], cx + 4, metaY + 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    const vLines = doc.splitTextToSize(sanitize(it[1]), colW - 8);
    doc.text(vLines[0] || '', cx + 4, metaY + 16);
  });

  // Rodapé da capa
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(margin, pageHeight - 32, margin + 35, pageHeight - 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text('DOCUMENTO CONFIDENCIAL', margin, pageHeight - 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(170, 174, 195);
  doc.text('Uso interno · Pulse Growth Marketing', margin, pageHeight - 18);
  doc.text('pulsegrowthmarketing.com', pageWidth - margin, pageHeight - 18, { align: 'right' });

  // ================= SUMÁRIO =================
  const buildSummary = () => {
    const sectionsWithData = SECTIONS.filter(s =>
      s.keys.some(k => formatValue(data[k]) !== '—')
    );
    doc.addPage();
    // Header topo
    if (markLogo) {
      const h = 8;
      const w = (markLogo.width / markLogo.height) * h;
      try { doc.addImage(markLogo.dataUrl, 'PNG', margin, 14, w, h); } catch {}
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('PULSE GROWTH MARKETING', pageWidth - margin, 20, { align: 'right' });

    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(margin, 28, pageWidth - margin, 28);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...TEXT);
    doc.text('Sumário', margin, 50);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text('Guia de leitura das seções deste briefing.', margin, 58);

    let sy = 78;
    let pageEst = 3; // começa após capa+sumario
    for (const s of sectionsWithData) {
      const count = s.keys.filter(k => formatValue(data[k]) !== '—').length;
      // Número
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(...ACCENT);
      doc.text(s.number, margin, sy);
      // Título
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...TEXT);
      doc.text(s.title, margin + 16, sy - 3);
      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(s.subtitle, margin + 16, sy + 2);
      // dots + página
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(`${count} ${count === 1 ? 'resposta' : 'respostas'}   ·   pág. ${String(pageEst).padStart(2, '0')}`, pageWidth - margin, sy, { align: 'right' });
      // divider
      doc.setDrawColor(...BORDER);
      doc.line(margin, sy + 6, pageWidth - margin, sy + 6);
      sy += 15;
      pageEst++;
    }

    // Editorial no sumário
    if (editorial && String(editorial).trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(...ACCENT);
      doc.text('★', margin, sy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...TEXT);
      doc.text('Linha Editorial', margin + 16, sy - 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text('Plano estratégico e direcionamento de conteúdo', margin + 16, sy + 2);
    }
  };

  // ================= HELPERS =================
  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - 22) {
      doc.addPage();
      drawContentPageHeader();
      y = 40;
    }
  };

  let currentSectionLabel = '';

  const drawContentPageHeader = () => {
    // Marca pequena no topo direito
    if (markLogo) {
      const h = 6;
      const w = (markLogo.width / markLogo.height) * h;
      try { doc.addImage(markLogo.dataUrl, 'PNG', margin, 14, w, h); } catch {}
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(currentSectionLabel || 'PULSE GROWTH MARKETING', pageWidth - margin, 18, { align: 'right' });
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, 24, pageWidth - margin, 24);
  };

  const startSectionPage = (number: string, title: string, subtitle: string, count: number) => {
    doc.addPage();
    currentSectionLabel = `${number} · ${title.toUpperCase()}`;
    y = 0;
    // Hero header dark
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageWidth, 62, 'F');
    doc.setFillColor(...ACCENT);
    doc.rect(0, 62, pageWidth, 1.2, 'F');

    // Logo mark topo direito
    if (markLogo) {
      const h = 9;
      const w = (markLogo.width / markLogo.height) * h;
      try { doc.addImage(markLogo.dataUrl, 'PNG', pageWidth - margin - w, 16, w, h); } catch {}
    }

    // Número gigante
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(44);
    doc.setTextColor(...ACCENT);
    doc.text(number, margin, 44);

    // Título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(sanitize(title), margin + 28, 36);

    // Subtítulo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(170, 174, 195);
    doc.text(sanitize(subtitle), margin + 28, 44);

    // Contador
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...ACCENT);
    doc.text(`${count} ${count === 1 ? 'RESPOSTA' : 'RESPOSTAS'}`, margin + 28, 52);

    y = 78;
  };

  const writeField = (label: string, value: string) => {
    label = sanitize(label);
    value = sanitize(value) || '—';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const labelText = label.toUpperCase();
    const labelLines = doc.splitTextToSize(labelText, contentWidth - 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const valueLines = doc.splitTextToSize(value, contentWidth - 6);

    const blockH = labelLines.length * 3.6 + 3 + valueLines.length * 5.6 + 8;
    ensureSpace(blockH + 2);

    // Card sutil
    doc.setFillColor(250, 250, 253);
    doc.rect(margin, y - 3, contentWidth, blockH, 'F');
    // Barra accent
    doc.setFillColor(...ACCENT);
    doc.rect(margin, y - 3, 2, blockH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...ACCENT);
    doc.text(labelLines, margin + 6, y + 1);
    let cy = y + 1 + labelLines.length * 3.6 + 3;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text(valueLines, margin + 6, cy + 2);

    y += blockH + 3;
  };

  // ================= EXECUÇÃO =================
  buildSummary();

  let foundAny = false;
  for (const section of SECTIONS) {
    const items = section.keys
       .map(k => ({ key: k, label: FIELD_LABELS[k] || getBriefingFieldLabel(k), value: formatValue(data[k]) }))
      .filter(it => it.value !== '—');
    if (items.length === 0) continue;
    foundAny = true;
    startSectionPage(section.number, section.title, section.subtitle, items.length);
    for (const it of items) writeField(it.label, it.value);
  }

  // Extras
  const knownKeys = new Set(SECTIONS.flatMap(s => s.keys));
  const extraKeys = Object.keys(data).filter(k => !knownKeys.has(k) && !k.startsWith('_') && k !== 'additionalAttachments');
  if (extraKeys.length) {
    const validExtras = extraKeys.filter(k => formatValue(data[k]) !== '—');
    if (validExtras.length) {
      startSectionPage('08', 'Outros Campos', 'Respostas adicionais não categorizadas', validExtras.length);
       for (const k of validExtras) writeField(FIELD_LABELS[k] || getBriefingFieldLabel(k), formatValue(data[k]));
    }
  }

  // Anexos
  const attachments = Array.isArray(data.additionalAttachments) ? data.additionalAttachments : [];
  const validAtt = attachments.filter((a: any) => (a?.url || '').toString().trim());
  if (validAtt.length) {
    startSectionPage('09', 'Anexos & Links', 'Materiais e referências adicionais', validAtt.length);
    for (const att of validAtt) {
      const label = sanitize((att?.label || '').toString().trim()) || 'Link';
      const url = (att?.url || '').toString().trim();
      const linkH = 20;
      ensureSpace(linkH + 4);
      doc.setFillColor(250, 250, 253);
      doc.rect(margin, y - 3, contentWidth, linkH, 'F');
      doc.setFillColor(...ACCENT);
      doc.rect(margin, y - 3, 2, linkH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...TEXT);
      doc.text(label, margin + 6, y + 3);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 90, 200);
      const urlLines = doc.splitTextToSize(url, contentWidth - 12);
      doc.textWithLink(urlLines[0], margin + 6, y + 11, { url });
      y += linkH + 3;
    }
  }

  // Editorial
  if (editorial && String(editorial).trim()) {
    const blocks = parseEditorial(editorial);
    if (blocks.length > 0) {
      startSectionPage('10', 'Linha Editorial', 'Plano estratégico e direcionamento de conteúdo', blocks.length);

      for (const b of blocks) {
        if (b.heading) {
          const isMain = b.level === 1;
          const headText = sanitize(b.heading);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(isMain ? 12 : 10.5);
          const hLines = doc.splitTextToSize(headText, contentWidth - 10);
          const hBoxH = hLines.length * (isMain ? 5.8 : 5.2) + 4;
          ensureSpace(hBoxH + 6);
          y += 3;

          if (isMain) {
            doc.setFillColor(...ACCENT_SOFT);
            doc.rect(margin, y - 3, contentWidth, hBoxH, 'F');
            doc.setFillColor(...ACCENT);
            doc.rect(margin, y - 3, 2.5, hBoxH, 'F');
          }
          doc.setTextColor(...(isMain ? ACCENT : [180, 80, 40] as [number, number, number]));
          doc.text(hLines, margin + (isMain ? 7 : 5), y + 1);
          y += hBoxH + 3;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(...TEXT);
        for (const p of b.paragraphs) {
          const lines = doc.splitTextToSize(sanitize(p), contentWidth - (b.level === 2 ? 6 : 0));
          for (const ln of lines) {
            ensureSpace(5.5);
            doc.text(ln, margin + (b.level === 2 ? 6 : 0), y);
            y += 5.5;
          }
          y += 2.5;
        }

        if (b.bullets && b.bullets.length) {
          for (const it of b.bullets) {
            const lines = doc.splitTextToSize(sanitize(it), contentWidth - 12);
            ensureSpace(lines.length * 5.3 + 1.5);
            doc.setFillColor(...ACCENT);
            doc.circle(margin + 3, y - 1.4, 1, 'F');
            doc.setTextColor(...TEXT);
            doc.text(lines, margin + 8, y);
            y += lines.length * 5.3 + 1.5;
          }
          y += 2;
        }
        y += 3;
      }
    }
  }

  if (!foundAny && !editorial) {
    doc.addPage();
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text('Nenhuma resposta de briefing registrada para este cliente.', margin, 60);
  }

  // Rodapé com numeração (exceto capa)
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Pulse Growth Marketing  ·  Briefing  ·  ${sanitize(companyName)}`, margin, pageHeight - 8);
    doc.text(`${String(i - 1).padStart(2, '0')} / ${String(pageCount - 1).padStart(2, '0')}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const safeName = companyName.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').toLowerCase();
  doc.save(`briefing_${safeName}.pdf`);
}

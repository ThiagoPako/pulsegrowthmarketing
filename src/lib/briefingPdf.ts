import jsPDF from 'jspdf';
import { parseEditorial } from './editorialFormatter';

// Mapeia as chaves usadas no formulário (ClientBriefing.tsx) para rótulos amigáveis
const FIELD_LABELS: Record<string, string> = {
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

// Ordem de exibição agrupada por seção — sem emojis (helvetica não renderiza)
const SECTIONS: { title: string; number: string; keys: string[] }[] = [
  {
    title: 'Identidade do Negócio',
    number: '01',
    keys: ['ownerName', 'niche', 'mainDifferential', 'productsServices', 'products_services', 'focusProducts', 'businessGoals', 'goals', 'attendanceType', 'targetCities', 'business_description', 'differentials'],
  },
  {
    title: 'Público-Alvo',
    number: '02',
    keys: ['idealClient', 'target_audience', 'ageRangesTarget', 'ageRangesBuyer', 'educationLevel', 'socialClass', 'clientUsesSocial', 'isAuthority'],
  },
  {
    title: 'Comunicação & Voz',
    number: '03',
    keys: ['socialObjectives', 'importantTopics', 'keywords', 'tone_of_voice', 'dislikedCommunication', 'desiredRecognition', 'undesiredRecognition', 'avoid'],
  },
  {
    title: 'Marca & Visual',
    number: '04',
    keys: ['hasVisualIdentity', 'brand_colors', 'useRealPhotos', 'comfortOnCamera', 'hasSite', 'socialLinks', 'social_media_links'],
  },
  {
    title: 'Referências',
    number: '05',
    keys: ['digitalReferences', 'nicheReferences', 'contentReferences', 'visual_references', 'competitors'],
  },
  {
    title: 'Desafios & Considerações',
    number: '06',
    keys: ['digitalDifficulty', 'businessDifficulty', 'finalNotes', 'additional_notes'],
  },
  {
    title: 'Acessos',
    number: '07',
    keys: ['instagramLogin', 'instagramPassword', 'facebookLogin', 'facebookPassword', 'otherAccesses'],
  },
];

// Remove qualquer caractere que a fonte helvetica core não renderiza (emojis, símbolos raros)
function sanitize(s: string): string {
  if (!s) return '';
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/[\u2190-\u21FF\u2300-\u23FF]/g, '')
    .trim();
}

function formatValue(v: any): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
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

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // Cores (Pulse Academy)
  const DARK: [number, number, number] = [17, 17, 27];
  const ACCENT: [number, number, number] = [230, 88, 42]; // orange
  const MUTED: [number, number, number] = [120, 120, 130];
  const TEXT: [number, number, number] = [30, 30, 38];
  const SOFT: [number, number, number] = [252, 244, 240];

  // ============ CAPA ============
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  // Faixa lateral accent
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, 6, pageHeight, 'F');

  // Etiqueta topo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ACCENT);
  doc.text('PULSE GROWTH MARKETING', margin, 30);
  doc.setTextColor(200, 200, 210);
  doc.setFont('helvetica', 'normal');
  doc.text('BRIEFING ESTRATÉGICO', margin, 36);

  // Título principal
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  const titleLines = doc.splitTextToSize(sanitize(companyName), contentWidth);
  doc.text(titleLines, margin, 90);

  // Subtítulo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(180, 180, 195);
  const subLines: string[] = [];
  if (niche) subLines.push(`Nicho · ${niche}`);
  if (city) subLines.push(`Cidade · ${city}`);
  if (responsiblePerson) subLines.push(`Responsável · ${responsiblePerson}`);
  let ys = 90 + titleLines.length * 12 + 6;
  for (const l of subLines) {
    doc.text(l, margin, ys);
    ys += 6;
  }

  // Bloco inferior
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(margin, pageHeight - 40, margin + 40, pageHeight - 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ACCENT);
  doc.text('DOCUMENTO CONFIDENCIAL', margin, pageHeight - 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 195);
  if (submittedAt) {
    const d = new Date(submittedAt);
    if (!isNaN(d.getTime())) doc.text(`Enviado em ${d.toLocaleDateString('pt-BR')}`, margin, pageHeight - 24);
  }
  doc.text('pulsegrowthmarketing.com', pageWidth - margin, pageHeight - 24, { align: 'right' });

  // ============ Helpers ============
  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - 20) {
      doc.addPage();
      y = 28;
    }
  };

  const startSectionPage = (number: string, title: string, subtitle?: string) => {
    doc.addPage();
    y = 0;
    // Header dark
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageWidth, 46, 'F');
    doc.setFillColor(...ACCENT);
    doc.rect(0, 46, pageWidth, 1.2, 'F');

    // Número gigante à esquerda
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(38);
    doc.setTextColor(...ACCENT);
    doc.text(number, margin, 32);

    // Título ao lado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(sanitize(title), margin + 22, 26);
    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(180, 180, 195);
      doc.text(sanitize(subtitle), margin + 22, 34);
    }
    y = 60;
  };

  const writeField = (label: string, value: string) => {
    label = sanitize(label);
    value = sanitize(value) || '—';

    // Label como chip
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const labelText = label.toUpperCase();
    const labelLines = doc.splitTextToSize(labelText, contentWidth);

    // Valor
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const valueLines = doc.splitTextToSize(value, contentWidth - 4);

    const blockH = labelLines.length * 3.8 + 2 + valueLines.length * 5.2 + 6;
    ensureSpace(blockH);

    // Barra accent vertical
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1.5);
    doc.line(margin, y - 2, margin, y + blockH - 8);
    doc.setLineWidth(0.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...ACCENT);
    doc.text(labelLines, margin + 4, y);
    y += labelLines.length * 3.8 + 2;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...TEXT);
    doc.text(valueLines, margin + 4, y + 3);
    y += valueLines.length * 5.2 + 8;
  };

  // ============ SEÇÕES ============
  let foundAny = false;

  for (const section of SECTIONS) {
    const items = section.keys
      .map(k => ({ key: k, label: FIELD_LABELS[k] || k, value: formatValue(data[k]) }))
      .filter(it => it.value !== '—');
    if (items.length === 0) continue;
    foundAny = true;
    startSectionPage(section.number, section.title, `${items.length} ${items.length === 1 ? 'resposta' : 'respostas'}`);
    for (const it of items) writeField(it.label, it.value);
  }

  // Chaves extras não mapeadas
  const knownKeys = new Set(SECTIONS.flatMap(s => s.keys));
  const extraKeys = Object.keys(data).filter(k => !knownKeys.has(k) && !k.startsWith('_') && k !== 'additionalAttachments');
  if (extraKeys.length) {
    startSectionPage('08', 'Outros campos');
    for (const k of extraKeys) {
      const val = formatValue(data[k]);
      if (val === '—') continue;
      writeField(FIELD_LABELS[k] || k.replace(/_/g, ' '), val);
    }
  }

  // Anexos
  const attachments = Array.isArray(data.additionalAttachments) ? data.additionalAttachments : [];
  if (attachments.length) {
    startSectionPage('09', 'Anexos & Links', `${attachments.length} ${attachments.length === 1 ? 'item' : 'itens'}`);
    for (const att of attachments) {
      const label = sanitize((att?.label || '').toString().trim()) || 'Link';
      const url = (att?.url || '').toString().trim();
      if (!url) continue;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TEXT);
      const labelLines = doc.splitTextToSize(label, contentWidth);
      ensureSpace(labelLines.length * 4.5 + 8);
      doc.text(labelLines, margin, y);
      y += labelLines.length * 4.5 + 1;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 90, 200);
      const urlLines = doc.splitTextToSize(url, contentWidth);
      ensureSpace(urlLines.length * 4 + 3);
      doc.textWithLink(urlLines.join('\n'), margin, y, { url });
      y += urlLines.length * 4 + 6;
    }
  }

  // Linha editorial
  if (editorial && String(editorial).trim()) {
    const blocks = parseEditorial(editorial);
    if (blocks.length > 0) {
      startSectionPage('10', 'Linha Editorial', `${blocks.length} ${blocks.length === 1 ? 'bloco' : 'blocos'}`);

      for (const b of blocks) {
        if (b.heading) {
          const isMain = b.level === 1;
          const headText = sanitize(b.heading);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(isMain ? 12 : 10.5);
          const hLines = doc.splitTextToSize(headText, contentWidth - 8);
          const hBoxH = hLines.length * (isMain ? 5.5 : 5) + 4;
          ensureSpace(hBoxH + 6);
          y += 4;

          if (isMain) {
            doc.setFillColor(...SOFT);
            doc.rect(margin, y - 4, contentWidth, hBoxH, 'F');
            doc.setFillColor(...ACCENT);
            doc.rect(margin, y - 4, 2.5, hBoxH, 'F');
          }
          doc.setTextColor(...(isMain ? ACCENT : [180, 80, 40] as [number, number, number]));
          doc.text(hLines, margin + (isMain ? 6 : 4), y + 1);
          y += hBoxH + 2;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...TEXT);
        for (const p of b.paragraphs) {
          const lines = doc.splitTextToSize(sanitize(p), contentWidth - (b.level === 2 ? 6 : 0));
          for (const ln of lines) {
            ensureSpace(5.2);
            doc.text(ln, margin + (b.level === 2 ? 6 : 0), y);
            y += 5.2;
          }
          y += 2;
        }

        if (b.bullets && b.bullets.length) {
          for (const it of b.bullets) {
            const lines = doc.splitTextToSize(sanitize(it), contentWidth - 10);
            ensureSpace(lines.length * 5 + 1);
            doc.setFillColor(...ACCENT);
            doc.circle(margin + 3, y - 1.4, 0.9, 'F');
            doc.setTextColor(...TEXT);
            doc.text(lines, margin + 7, y);
            y += lines.length * 5 + 1;
          }
          y += 2;
        }
        y += 2;
      }
    }
  }

  if (!foundAny && !editorial) {
    doc.addPage();
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text('Nenhuma resposta de briefing registrada para este cliente.', margin, 40);
  }

  // Rodapé com numeração (exceto capa)
  const pageCount = doc.getNumberOfPages();
  for (let i = 2; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Pulse Growth Marketing  ·  Briefing  ·  ${sanitize(companyName)}`, margin, pageHeight - 8);
    doc.text(`${String(i - 1).padStart(2, '0')} / ${String(pageCount - 1).padStart(2, '0')}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const safeName = companyName.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').toLowerCase();
  doc.save(`briefing_${safeName}.pdf`);
}

import jsPDF from 'jspdf';
import { parseEditorial } from './editorialFormatter';

// Mapeia as chaves usadas no formulário (ClientBriefing.tsx) para rótulos amigáveis
const FIELD_LABELS: Record<string, string> = {
  // Sobre o negócio
  ownerName: 'Nome do responsável',
  niche: 'Nicho de atuação',
  mainDifferential: 'Principal diferencial',
  productsServices: 'Produtos / Serviços',
  businessGoals: 'Objetivos (curto, médio e longo prazo)',
  attendanceType: 'Forma de atendimento',
  targetCities: 'Cidades-alvo',
  hasVisualIdentity: 'Possui identidade visual?',
  hasSite: 'Site',
  // Concorrentes
  competitors: 'Principais concorrentes',
  digitalReferences: 'Referências digitais (outros nichos)',
  nicheReferences: 'Referências do mesmo nicho',
  dislikedCommunication: 'Comunicação que NÃO gosta',
  // Redes sociais
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
  // Público-alvo
  ageRangesTarget: 'Faixa etária do público-alvo',
  ageRangesBuyer: 'Faixa etária de quem compra',
  isAuthority: 'É autoridade no nicho?',
  educationLevel: 'Escolaridade do público',
  socialClass: 'Classe social',
  clientUsesSocial: 'O cliente usa redes sociais?',
  idealClient: 'Cliente ideal',
  // Final / acessos
  finalNotes: 'Considerações finais',
  instagramLogin: 'Instagram — login',
  instagramPassword: 'Instagram — senha',
  facebookLogin: 'Facebook — login',
  facebookPassword: 'Facebook — senha',
  otherAccesses: 'Outros acessos',
  useRealPhotos: 'Usar fotos reais?',
};

// Ordem de exibição agrupada por seção — cada seção inicia em nova página
const SECTIONS: { title: string; keys: string[] }[] = [
  {
    title: '🏢 Identidade do Negócio',
    keys: ['ownerName', 'niche', 'mainDifferential', 'productsServices', 'products_services', 'focusProducts', 'businessGoals', 'goals', 'attendanceType', 'targetCities', 'business_description', 'differentials'],
  },
  {
    title: '🎯 Público-Alvo',
    keys: ['idealClient', 'target_audience', 'ageRangesTarget', 'ageRangesBuyer', 'educationLevel', 'socialClass', 'clientUsesSocial', 'isAuthority'],
  },
  {
    title: '📣 Comunicação & Voz',
    keys: ['socialObjectives', 'importantTopics', 'keywords', 'tone_of_voice', 'dislikedCommunication', 'desiredRecognition', 'undesiredRecognition', 'avoid'],
  },
  {
    title: '🎨 Marca & Visual',
    keys: ['hasVisualIdentity', 'brand_colors', 'useRealPhotos', 'comfortOnCamera', 'hasSite', 'socialLinks', 'social_media_links'],
  },
  {
    title: '💡 Referências',
    keys: ['digitalReferences', 'nicheReferences', 'contentReferences', 'visual_references', 'competitors'],
  },
  {
    title: '⚡ Desafios & Considerações Finais',
    keys: ['digitalDifficulty', 'businessDifficulty', 'finalNotes', 'additional_notes'],
  },
  {
    title: '🔐 Acessos',
    keys: ['instagramLogin', 'instagramPassword', 'facebookLogin', 'facebookPassword', 'otherAccesses'],
  },
];

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
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // Header
  doc.setFillColor(25, 25, 35);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PULSE GROWTH MARKETING', pageWidth / 2, 13, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Briefing do Cliente', pageWidth / 2, 21, { align: 'center' });

  y = 40;

  // Título do cliente
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(companyName, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const meta: string[] = [];
  if (responsiblePerson) meta.push(`Responsável: ${responsiblePerson}`);
  if (niche) meta.push(`Nicho: ${niche}`);
  if (city) meta.push(`Cidade: ${city}`);
  if (submittedAt) {
    const d = new Date(submittedAt);
    if (!isNaN(d.getTime())) meta.push(`Enviado em: ${d.toLocaleDateString('pt-BR')}`);
  }
  if (meta.length) {
    doc.text(meta.join('  •  '), margin, y);
    y += 5;
  }
  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const ensureSpace = (h: number) => {
    if (y + h > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }
  };

  const writeSectionTitle = (title: string) => {
    ensureSpace(12);
    doc.setFillColor(245, 240, 255);
    doc.rect(margin, y - 4, contentWidth, 8, 'F');
    doc.setTextColor(80, 40, 140);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, margin + 2, y + 1.5);
    y += 9;
  };

  const writeField = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const labelLines = doc.splitTextToSize(label, contentWidth);
    ensureSpace(labelLines.length * 4 + 4);
    doc.text(labelLines, margin, y);
    y += labelLines.length * 4 + 1;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    const valueLines = doc.splitTextToSize(value, contentWidth);
    ensureSpace(valueLines.length * 5 + 4);
    doc.text(valueLines, margin, y);
    y += valueLines.length * 5 + 4;
  };

  let foundAny = false;

  for (const section of SECTIONS) {
    const items = section.keys
      .map(k => ({ key: k, label: FIELD_LABELS[k] || k, value: formatValue(data[k]) }))
      .filter(it => it.value !== '—');
    if (items.length === 0) continue;
    foundAny = true;
    writeSectionTitle(section.title);
    for (const it of items) writeField(it.label, it.value);
    y += 2;
  }

  // Quaisquer chaves não mapeadas
  const knownKeys = new Set(SECTIONS.flatMap(s => s.keys));
  const extraKeys = Object.keys(data).filter(k => !knownKeys.has(k) && !k.startsWith('_') && k !== 'additionalAttachments');
  if (extraKeys.length) {
    writeSectionTitle('📎 Outros campos');
    for (const k of extraKeys) {
      const val = formatValue(data[k]);
      if (val === '—') continue;
      writeField(FIELD_LABELS[k] || k.replace(/_/g, ' '), val);
    }
  }

  // Anexos / Links adicionais (rótulo + URL clicável)
  const attachments = Array.isArray(data.additionalAttachments) ? data.additionalAttachments : [];
  if (attachments.length) {
    writeSectionTitle('📎 Anexos e links adicionais');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const att of attachments) {
      const label = (att?.label || '').toString().trim() || 'Link';
      const url = (att?.url || '').toString().trim();
      if (!url) continue;

      // Rótulo
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      const labelLines = doc.splitTextToSize(`• ${label}`, contentWidth);
      ensureSpace(labelLines.length * 4 + 4);
      doc.text(labelLines, margin, y);
      y += labelLines.length * 4 + 1;

      // URL clicável (azul, sublinhado visual via cor)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 90, 200);
      const urlLines = doc.splitTextToSize(url, contentWidth);
      ensureSpace(urlLines.length * 4 + 3);
      doc.textWithLink(urlLines.join('\n'), margin + 3, y, { url });
      y += urlLines.length * 4 + 3;
      doc.setTextColor(20, 20, 20);
    }
    y += 2;
  }

  // Linha editorial (parseada em blocos)
  if (editorial && String(editorial).trim()) {
    const blocks = parseEditorial(editorial);
    if (blocks.length > 0) {
      writeSectionTitle('📝 Linha editorial');

      for (const b of blocks) {
        if (b.heading) {
          const isMain = b.level === 1;
          ensureSpace(isMain ? 12 : 10);
          y += isMain ? 3 : 1;
          if (isMain) {
            doc.setFillColor(255, 240, 235);
            doc.rect(margin, y - 4, contentWidth, 7, 'F');
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(isMain ? 11 : 10);
          doc.setTextColor(isMain ? 180 : 200, isMain ? 60 : 100, 40);
          doc.text(b.heading, margin + (isMain ? 2 : 4), y + 1);
          y += isMain ? 8 : 6;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(30, 30, 30);
        for (const p of b.paragraphs) {
          const lines = doc.splitTextToSize(p, contentWidth - (b.level === 2 ? 4 : 0));
          for (const ln of lines) {
            ensureSpace(5);
            doc.text(ln, margin + (b.level === 2 ? 4 : 0), y);
            y += 5;
          }
          y += 2;
        }

        if (b.bullets && b.bullets.length) {
          for (const it of b.bullets) {
            const lines = doc.splitTextToSize(it, contentWidth - 8);
            ensureSpace(lines.length * 5 + 1);
            doc.setFillColor(220, 90, 40);
            doc.circle(margin + 2, y - 1.5, 0.8, 'F');
            doc.setTextColor(30, 30, 30);
            doc.text(lines, margin + 6, y);
            y += lines.length * 5 + 1;
          }
          y += 2;
        }
        y += 2;
      }
    }
  }

  if (!foundAny && !editorial) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.text('Nenhuma resposta de briefing registrada para este cliente.', margin, y + 10);
  }

  // Rodapé com numeração
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Pulse Growth Marketing • Briefing • ${companyName}`, margin, pageHeight - 8);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const safeName = companyName.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').toLowerCase();
  doc.save(`briefing_${safeName}.pdf`);
}

import jsPDF from 'jspdf';

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

// Ordem de exibição agrupada por seção
const SECTIONS: { title: string; keys: string[] }[] = [
  {
    title: '📍 Sobre o negócio',
    keys: ['ownerName', 'niche', 'mainDifferential', 'productsServices', 'businessGoals', 'attendanceType', 'targetCities', 'hasVisualIdentity', 'hasSite'],
  },
  {
    title: '🔍 Concorrentes e referências',
    keys: ['competitors', 'digitalReferences', 'nicheReferences', 'dislikedCommunication'],
  },
  {
    title: '📱 Redes sociais',
    keys: ['socialObjectives', 'digitalDifficulty', 'socialLinks', 'importantTopics', 'comfortOnCamera', 'focusProducts', 'businessDifficulty', 'desiredRecognition', 'undesiredRecognition', 'contentReferences', 'keywords'],
  },
  {
    title: '🎯 Público-alvo',
    keys: ['ageRangesTarget', 'ageRangesBuyer', 'isAuthority', 'educationLevel', 'socialClass', 'clientUsesSocial', 'idealClient'],
  },
  {
    title: '🖼️ Preferências visuais',
    keys: ['useRealPhotos'],
  },
  {
    title: '✍️ Considerações finais',
    keys: ['finalNotes'],
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

  // Linha editorial (texto livre)
  if (editorial && String(editorial).trim()) {
    writeSectionTitle('📝 Linha editorial gerada');
    const plain = String(editorial).replace(/<[^>]+>/g, '').replace(/\*\*/g, '').replace(/##\s?/g, '');
    const lines = doc.splitTextToSize(plain, contentWidth);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    for (const ln of lines) {
      ensureSpace(5);
      doc.text(ln, margin, y);
      y += 5;
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

// Formata a "Linha Editorial" (texto livre longo) em blocos legíveis.
// Detecta títulos em CAIXA ALTA (2+ palavras) e sub-títulos "Plano X".

export type EditorialBlock = {
  heading?: string;
  level: 1 | 2; // 1 = seção principal (CAIXA), 2 = sub-título (Plano X)
  paragraphs: string[];
  bullets?: string[];
};

const UPPER = 'A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜ';
// 2+ palavras em CAIXA ALTA consecutivas (mínimo 2 letras cada)
const HEADING_RE = new RegExp(
  `(?:^|\\s)([${UPPER}][${UPPER}0-9]{1,}(?:\\s+[${UPPER}][${UPPER}0-9]{1,}){1,6})(?=\\s+[${UPPER}a-záéíóúâêôãõç0-9])`,
  'g'
);
// Sub-títulos tipo "Plano Essencial", "Plano Intermediário", "Plano Premium"
const SUBHEADING_RE = /(Plano\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)/g;

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function splitParagraphs(text: string): { paragraphs: string[]; bullets: string[] } {
  const clean = text.replace(/[ \t]+/g, ' ').trim();
  if (!clean) return { paragraphs: [], bullets: [] };

  const bullets: string[] = [];
  const paragraphs: string[] = [];

  // Divide em blocos por quebras duplas
  const raw = clean.split(/\n{2,}/);
  for (const chunk of raw) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    // Detecta lista após "Inclui:" ou similar
    const inclMatch = trimmed.match(/^(Inclui|Contém|Recursos|Benefícios)\s*:\s*(.+)$/is);
    if (inclMatch) {
      const items = inclMatch[2]
        .split(/\s*[•;]\s*|(?<=[a-zç])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/)
        .map(s => s.trim())
        .filter(s => s.length > 3);
      if (items.length >= 2) {
        paragraphs.push(inclMatch[1] + ':');
        bullets.push(...items);
        continue;
      }
    }

    // Quebra parágrafo longo em sentenças (máx ~500 chars por bloco)
    if (trimmed.length > 600) {
      const sentences = trimmed.match(/[^.!?]+[.!?]+(\s|$)/g) || [trimmed];
      let buf = '';
      for (const s of sentences) {
        if ((buf + s).length > 500 && buf) {
          paragraphs.push(buf.trim());
          buf = s;
        } else buf += s;
      }
      if (buf.trim()) paragraphs.push(buf.trim());
    } else {
      paragraphs.push(trimmed);
    }
  }

  return { paragraphs, bullets };
}

export function parseEditorial(input: string): EditorialBlock[] {
  const text = stripHtml(String(input || '')).replace(/\r/g, '');
  if (!text.trim()) return [];

  // 1) Divide em seções por títulos em CAIXA ALTA
  const parts: { heading?: string; body: string; level: 1 | 2 }[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  const matches: { heading: string; start: number; end: number }[] = [];
  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(text)) !== null) {
    const headingText = match[1].trim();
    // Ignora "siglas" curtas isoladas
    if (headingText.length < 5) continue;
    const start = match.index + match[0].indexOf(headingText);
    matches.push({ heading: headingText, start, end: start + headingText.length });
  }

  if (matches.length === 0) {
    parts.push({ body: text, level: 1 });
  } else {
    if (matches[0].start > 0) {
      const intro = text.slice(0, matches[0].start).trim();
      if (intro) parts.push({ body: intro, level: 1 });
    }
    matches.forEach((m, i) => {
      const bodyEnd = i + 1 < matches.length ? matches[i + 1].start : text.length;
      const body = text.slice(m.end, bodyEnd).trim();
      parts.push({ heading: m.heading, body, level: 1 });
    });
    lastIdx = matches[matches.length - 1].end;
    void lastIdx;
  }

  // 2) Dentro de cada seção, sub-divide por "Plano X"
  const blocks: EditorialBlock[] = [];
  for (const p of parts) {
    const subMatches: { heading: string; start: number; end: number }[] = [];
    SUBHEADING_RE.lastIndex = 0;
    let sm: RegExpExecArray | null;
    while ((sm = SUBHEADING_RE.exec(p.body)) !== null) {
      subMatches.push({ heading: sm[1], start: sm.index, end: sm.index + sm[1].length });
    }

    if (subMatches.length === 0) {
      const { paragraphs, bullets } = splitParagraphs(p.body);
      if (paragraphs.length || bullets.length || p.heading) {
        blocks.push({ heading: p.heading, level: p.level, paragraphs, bullets: bullets.length ? bullets : undefined });
      }
      continue;
    }

    // Antes do primeiro sub-título → pertence à seção principal
    const preamble = p.body.slice(0, subMatches[0].start).trim();
    const { paragraphs: pPar, bullets: pBul } = splitParagraphs(preamble);
    if (p.heading || pPar.length || pBul.length) {
      blocks.push({ heading: p.heading, level: 1, paragraphs: pPar, bullets: pBul.length ? pBul : undefined });
    }
    // Cada sub-seção
    subMatches.forEach((s, i) => {
      const end = i + 1 < subMatches.length ? subMatches[i + 1].start : p.body.length;
      const body = p.body.slice(s.end, end).trim().replace(/^[:\-–—\s]+/, '');
      const { paragraphs, bullets } = splitParagraphs(body);
      blocks.push({ heading: s.heading, level: 2, paragraphs, bullets: bullets.length ? bullets : undefined });
    });
  }

  return blocks;
}

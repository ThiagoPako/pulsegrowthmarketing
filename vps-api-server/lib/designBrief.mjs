// Brief das artes: formatos/dimensões, copy estruturada, o mínimo para a arte e a conferência dos
// arquivos entregues. Sem dependências (testado pelo vitest em src/test/designBrief.test.ts).
// Espelho do front: src/lib/designBrief.ts — mudou um, mude o outro (o teste confere a paridade).

import fs from 'node:fs';

// ── Formatos e dimensões (espelho de src/lib/designBrief.ts) ──
export const DESIGN_FORMAT_PRESETS = {
  feed: { label: 'Feed', width: 1080, height: 1350, unit: 'px', format_type: 'feed' },
  quadrado: { label: 'Quadrado', width: 1080, height: 1080, unit: 'px', format_type: 'feed' },
  story: { label: 'Story', width: 1080, height: 1920, unit: 'px', format_type: 'story' },
  carrossel: { label: 'Carrossel', width: 1080, height: 1350, unit: 'px', slides: 5, format_type: 'carrossel' },
  capa_destaque: { label: 'Capa de destaque', width: 1080, height: 1920, unit: 'px', format_type: 'capa' },
  thumbnail: { label: 'Thumbnail', width: 1280, height: 720, unit: 'px', format_type: 'thumbnail' },
  panfleto_a5: { label: 'Panfleto A5', width: 148, height: 210, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, format_type: 'midia_fisica' },
  panfleto_a4: { label: 'Panfleto A4', width: 210, height: 297, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, format_type: 'midia_fisica' },
  banner: { label: 'Banner', width: 90, height: 120, unit: 'cm', dpi: 150, bleed_mm: 5, print: true, format_type: 'midia_fisica' },
  outdoor: { label: 'Outdoor 9×3 m', width: 900, height: 300, unit: 'cm', dpi: 30, bleed_mm: 0, print: true, format_type: 'midia_fisica' },
  cartao_visita: { label: 'Cartão de visita', width: 90, height: 50, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, format_type: 'midia_fisica' },
  logomarca: { label: 'Logomarca', unit: null, format_type: 'logomarca' },
  personalizado: { label: 'Personalizado', unit: 'px', format_type: 'midia_fisica' },
};

// tarefas antigas (sem `dimensions`): o formato vem do format_type
const LEGACY_FORMAT_PRESET = {
  feed: 'feed', story: 'story', carrossel: 'carrossel', capa: 'capa_destaque', thumbnail: 'thumbnail', logomarca: 'logomarca',
};

export const DESIGN_ERROR_CATEGORIES = {
  texto: 'Texto / ortografia',
  marca: 'Marca / cores / logo',
  formato: 'Formato / dimensão',
  hierarquia: 'Hierarquia / legibilidade',
  informacao: 'Informação obrigatória faltando',
  imagem: 'Imagem / qualidade',
};
const CATEGORY_ALIASES = {
  texto: 'texto', ortografia: 'texto', gramatica: 'texto', copy: 'texto',
  marca: 'marca', cor: 'marca', cores: 'marca', logo: 'marca', identidade: 'marca',
  formato: 'formato', dimensao: 'formato', tamanho: 'formato', medida: 'formato', sangria: 'formato',
  hierarquia: 'hierarquia', legibilidade: 'hierarquia', leitura: 'hierarquia',
  informacao: 'informacao', info: 'informacao', obrigatoria: 'informacao', faltando: 'informacao',
  imagem: 'imagem', qualidade: 'imagem', foto: 'imagem', resolucao: 'imagem',
};

export const semAcento = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function normalizeErrorCategory(raw) {
  return CATEGORY_ALIASES[semAcento(raw).replace(/[^a-z]/g, '')] || null;
}

export function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const fmtNum = (v) => String(Math.round(Number(v) * 100) / 100).replace('.', ',');

/** Formato da arte (com a medida em pixels que o agente precisa exportar). null = não informado. */
export function describeDesignFormat(dimensions, formatType) {
  let dims = parseJson(dimensions);
  if (!dims || !dims.preset) {
    const legacy = LEGACY_FORMAT_PRESET[formatType];
    if (!legacy) return null; // ex.: "midia_fisica" sem medida
    dims = { preset: legacy, legacy: true };
  }
  const base = DESIGN_FORMAT_PRESETS[dims.preset] || DESIGN_FORMAT_PRESETS.personalizado;
  const f = { ...base, ...dims };
  const unit = f.unit === null ? null : (['px', 'cm', 'mm'].includes(f.unit) ? f.unit : 'px');
  const width = num(f.width);
  const height = num(f.height);
  if (dims.preset !== 'logomarca' && (!width || !height)) return null;
  const dpi = unit && unit !== 'px' ? (num(f.dpi) || 300) : null;
  const bleed = unit && unit !== 'px' ? (Number(f.bleed_mm) >= 0 ? Number(f.bleed_mm) : 3) : 0;
  const print = unit === 'cm' || unit === 'mm' || !!f.print;
  const slides = dims.preset === 'carrossel' ? Math.max(2, Math.min(20, Number(f.slides) || 5)) : null;
  const toMm = (v) => (unit === 'cm' ? v * 10 : v);
  let pixels = null;
  let pixelsWithBleed = null;
  if (unit === 'px') pixels = { width: Math.round(width), height: Math.round(height) };
  else if (unit) {
    const px = (mm) => Math.round((mm / 25.4) * dpi);
    pixels = { width: px(toMm(width)), height: px(toMm(height)) };
    pixelsWithBleed = { width: px(toMm(width) + 2 * bleed), height: px(toMm(height) + 2 * bleed) };
  }
  const size = unit ? `${fmtNum(width)}×${fmtNum(height)} ${unit}` : 'vetor';
  const label = (unit ? `${base.label} · ${size}` : base.label)
    + (slides ? ` · ${slides} slides` : '')
    + (print ? ` · ${dpi} dpi${bleed ? ` + sangria ${fmtNum(bleed)} mm` : ''}` : '');
  return {
    preset: dims.preset,
    name: base.label,
    label,
    width, height, unit,
    slides,
    dpi,
    bleed_mm: unit ? bleed : null,
    print,
    pixels,
    pixels_with_bleed: pixelsWithBleed,
    width_mm: unit && unit !== 'px' ? toMm(width) : null,
    height_mm: unit && unit !== 'px' ? toMm(height) : null,
    legacy: !!dims.legacy,
    notes: f.notes ? String(f.notes).slice(0, 500) : null,
    expected_files: print ? 'PDF de impressão (com sangria e marcas de corte se a gráfica pedir)' : (unit ? 'PNG ou JPG' : 'PNG + PDF/AI vetorial'),
  };
}

const COPY_FIELDS = [
  ['headline', 'Título / chamada principal'],
  ['support', 'Texto de apoio'],
  ['cta', 'Chamada para ação (CTA)'],
];
const REQUIRED_INFO_FIELDS = [
  ['phone', 'Telefone'], ['address', 'Endereço'], ['price', 'Preço'], ['date', 'Data'], ['handle', '@'], ['other', 'Outras'],
];

/** Copy estruturada da arte (copy_brief). */
export function describeDesignCopy(copyBrief, copyText) {
  const b = parseJson(copyBrief) || {};
  const pick = (k) => (typeof b[k] === 'string' && b[k].trim() ? b[k].trim() : null);
  const required = {};
  for (const [k] of REQUIRED_INFO_FIELDS) {
    const v = pick(k) || (b.required && typeof b.required[k] === 'string' && b.required[k].trim() ? b.required[k].trim() : null);
    if (v) required[k] = v;
  }
  return {
    headline: pick('headline'),
    support: pick('support'),
    cta: pick('cta'),
    required,
    text: copyText || null,
    structured: COPY_FIELDS.some(([k]) => pick(k)) || Object.keys(required).length > 0,
  };
}

/** O mínimo para a arte poder ser feita (mesma regra do formulário de criação). */
export function designBriefMissing(task) {
  const missing = [];
  if (!task.client_id && !String(task.prospect_name || '').trim()) missing.push('cliente');
  if (!describeDesignFormat(task.dimensions, task.format_type)) missing.push('formato/dimensão');
  const copy = describeDesignCopy(task.copy_brief, task.copy_text);
  const hasCopy = copy.headline || copy.support || copy.cta || String(task.copy_text || '').trim() || String(task.description || '').trim();
  if (!hasCopy) missing.push('copy ou descrição');
  return missing;
}

// ── Verificação dos arquivos entregues ──
export function readHead(file, bytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

export function sniffArtKind(head) {
  if (head.length >= 8 && head.readUInt32BE(0) === 0x89504e47 && head.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
}

/** Largura × altura de PNG/JPG (pixels) ou da 1ª página do PDF (mm), quando der para ler. */
export function readArtSize(file, kind) {
  try {
    if (kind === 'png') {
      const h = readHead(file, 32);
      return { width: h.readUInt32BE(16), height: h.readUInt32BE(20), unit: 'px' };
    }
    if (kind === 'jpg') {
      const h = readHead(file, 4 * 1024 * 1024);
      let i = 2;
      while (i + 9 < h.length) {
        if (h[i] !== 0xff) { i += 1; continue; }
        const marker = h[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = h.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: h.readUInt16BE(i + 7), height: h.readUInt16BE(i + 5), unit: 'px' };
        }
        i += 2 + len;
      }
      return null;
    }
    if (kind === 'pdf') {
      const text = readHead(file, 4 * 1024 * 1024).toString('latin1');
      const m = text.match(/\/(?:Trim|Media)Box\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
      if (!m) return null;
      const [x0, y0, x1, y1] = m.slice(1).map(Number);
      const pt = (v) => (Math.abs(v) * 25.4) / 72;
      return { width: Math.round(pt(x1 - x0) * 10) / 10, height: Math.round(pt(y1 - y0) * 10) / 10, unit: 'mm' };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Confere as artes entregues contra o formato pedido.
 * errors = recusa a entrega (arte digital fora da medida, sem --forcar); warnings = só avisa.
 */
export function checkDeliveredArts(format, arts) {
  const errors = [];
  const warnings = [];
  if (!format) {
    warnings.push('A arte não tem formato/dimensão no card: não deu para conferir a medida.');
    return { errors, warnings };
  }
  if (format.slides && arts.length !== format.slides) {
    warnings.push(`O card pede ${format.slides} slides e foram entregues ${arts.length}.`);
  }
  arts.forEach((art, i) => {
    const n = `Arte ${i + 1}`;
    const size = art.size;
    if (format.unit === 'px') {
      if (art.kind === 'pdf') { warnings.push(`${n}: formato digital pede PNG/JPG (veio PDF).`); return; }
      if (size && format.pixels && (Math.abs(size.width - format.pixels.width) > 1 || Math.abs(size.height - format.pixels.height) > 1)) {
        errors.push(`${n} tem ${size.width}×${size.height} px; o card pede ${format.pixels.width}×${format.pixels.height} px.`);
      }
      return;
    }
    if (!format.unit) return; // logomarca: sem medida fixa
    if (format.print && art.kind !== 'pdf') warnings.push(`${n}: formato de impressão; a gráfica costuma pedir PDF (veio ${art.kind.toUpperCase()}).`);
    if (!size) return;
    const tol = (v) => Math.max(2, v * 0.01);
    if (size.unit === 'mm') {
      const fits = (w, h) => Math.abs(size.width - w) <= tol(w) && Math.abs(size.height - h) <= tol(h);
      const b = format.bleed_mm || 0;
      if (!fits(format.width_mm, format.height_mm) && !fits(format.width_mm + 2 * b, format.height_mm + 2 * b)) {
        // PDF em escala (ex.: outdoor 1:10) só avisa
        const ratio = size.width / size.height;
        const expected = format.width_mm / format.height_mm;
        warnings.push(`${n}: a página do PDF tem ${fmtNum(size.width)}×${fmtNum(size.height)} mm; o card pede ${fmtNum(format.width_mm)}×${fmtNum(format.height_mm)} mm${b ? ` (+${fmtNum(b)} mm de sangria)` : ''}${Math.abs(ratio - expected) < 0.01 ? ' — proporção certa, confira se está em escala' : ''}.`);
      }
    } else if (size.unit === 'px' && format.pixels) {
      const minW = format.pixels.width * 0.98;
      const minH = format.pixels.height * 0.98;
      if (size.width < minW || size.height < minH) {
        warnings.push(`${n}: ${size.width}×${size.height} px é pouco para ${format.label} (precisa de ~${(format.pixels_with_bleed || format.pixels).width}×${(format.pixels_with_bleed || format.pixels).height} px).`);
      }
    }
  });
  return { errors, warnings };
}

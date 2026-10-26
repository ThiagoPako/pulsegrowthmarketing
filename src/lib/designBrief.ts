/**
 * Brief da tarefa de arte: formato/dimensão, copy estruturada e o mínimo para a arte poder ser feita.
 * Espelho de vps-api-server/agentDesignRoutes.mjs (DESIGN_FORMAT_PRESETS, describeDesignFormat,
 * designBriefMissing): o que a tela mostra é o mesmo que o agente de IA recebe pela API.
 */

export type DesignUnit = 'px' | 'cm' | 'mm';

export type DesignFormatPresetKey =
  | 'feed' | 'quadrado' | 'story' | 'carrossel' | 'capa_destaque' | 'thumbnail'
  | 'panfleto_a5' | 'panfleto_a4' | 'banner' | 'outdoor' | 'cartao_visita'
  | 'logomarca' | 'personalizado';

export interface DesignFormatPreset {
  key: DesignFormatPresetKey;
  label: string;
  emoji: string;
  group: 'digital' | 'impressao' | 'outro';
  width?: number;
  height?: number;
  unit: DesignUnit | null;
  slides?: number;
  dpi?: number;
  bleed_mm?: number;
  print?: boolean;
  /** format_type antigo (relatórios, portal, playbook continuam lendo esta coluna) */
  formatType: string;
  hint?: string;
}

export const DESIGN_FORMAT_PRESETS: DesignFormatPreset[] = [
  { key: 'feed', label: 'Feed', emoji: '📐', group: 'digital', width: 1080, height: 1350, unit: 'px', formatType: 'feed' },
  { key: 'quadrado', label: 'Quadrado', emoji: '⬛', group: 'digital', width: 1080, height: 1080, unit: 'px', formatType: 'feed' },
  { key: 'story', label: 'Story', emoji: '📱', group: 'digital', width: 1080, height: 1920, unit: 'px', formatType: 'story' },
  { key: 'carrossel', label: 'Carrossel', emoji: '🎠', group: 'digital', width: 1080, height: 1350, unit: 'px', slides: 5, formatType: 'carrossel' },
  { key: 'capa_destaque', label: 'Capa de destaque', emoji: '🖼', group: 'digital', width: 1080, height: 1920, unit: 'px', formatType: 'capa' },
  { key: 'thumbnail', label: 'Thumbnail', emoji: '▶️', group: 'digital', width: 1280, height: 720, unit: 'px', formatType: 'thumbnail' },
  { key: 'panfleto_a5', label: 'Panfleto A5', emoji: '📄', group: 'impressao', width: 148, height: 210, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, formatType: 'midia_fisica' },
  { key: 'panfleto_a4', label: 'Panfleto A4', emoji: '📄', group: 'impressao', width: 210, height: 297, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, formatType: 'midia_fisica' },
  { key: 'banner', label: 'Banner', emoji: '🪧', group: 'impressao', width: 90, height: 120, unit: 'cm', dpi: 150, bleed_mm: 5, print: true, formatType: 'midia_fisica', hint: 'Confirme acabamento (bastão, ilhós) com a gráfica' },
  { key: 'outdoor', label: 'Outdoor 9×3 m', emoji: '🛣', group: 'impressao', width: 900, height: 300, unit: 'cm', dpi: 30, bleed_mm: 0, print: true, formatType: 'midia_fisica', hint: 'Confirme com a gráfica se o arquivo vai em escala' },
  { key: 'cartao_visita', label: 'Cartão de visita', emoji: '💳', group: 'impressao', width: 90, height: 50, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, formatType: 'midia_fisica' },
  { key: 'logomarca', label: 'Logomarca', emoji: '🎨', group: 'outro', unit: null, formatType: 'logomarca', hint: 'Entrega em vetor (AI/PDF) + PNG' },
  { key: 'personalizado', label: 'Personalizado', emoji: '📏', group: 'outro', unit: 'px', formatType: 'midia_fisica', hint: 'Largura × altura em px, cm ou mm' },
];

/** Tamanhos comuns de banner (cm). */
export const BANNER_SIZES: Array<{ width: number; height: number; label: string }> = [
  { width: 60, height: 90, label: '60×90 cm' },
  { width: 80, height: 120, label: '80×120 cm' },
  { width: 90, height: 120, label: '90×120 cm' },
  { width: 100, height: 150, label: '100×150 cm' },
  { width: 85, height: 200, label: 'Roll-up 85×200 cm' },
  { width: 120, height: 200, label: '120×200 cm' },
  { width: 300, height: 100, label: 'Faixa 300×100 cm' },
];

export interface DesignDimensions {
  preset: DesignFormatPresetKey;
  width?: number;
  height?: number;
  unit?: DesignUnit | null;
  slides?: number;
  dpi?: number;
  bleed_mm?: number;
  print?: boolean;
  notes?: string;
}

const LEGACY_FORMAT_PRESET: Record<string, DesignFormatPresetKey> = {
  feed: 'feed', story: 'story', carrossel: 'carrossel', capa: 'capa_destaque', thumbnail: 'thumbnail', logomarca: 'logomarca',
};

export function getFormatPreset(key: string | null | undefined): DesignFormatPreset | undefined {
  return DESIGN_FORMAT_PRESETS.find((p) => p.key === key);
}

export function parseJsonField<T>(value: unknown): T | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Dimensões iniciais de um preset (o que o formulário grava). */
export function dimensionsFromPreset(key: DesignFormatPresetKey, overrides: Partial<DesignDimensions> = {}): DesignDimensions {
  const p = getFormatPreset(key) || getFormatPreset('feed')!;
  const dims: DesignDimensions = { preset: p.key };
  if (p.width) dims.width = p.width;
  if (p.height) dims.height = p.height;
  dims.unit = p.unit;
  if (p.slides) dims.slides = p.slides;
  if (p.dpi) dims.dpi = p.dpi;
  if (p.bleed_mm != null) dims.bleed_mm = p.bleed_mm;
  if (p.print) dims.print = true;
  return { ...dims, ...overrides };
}

/** format_type antigo para a tarefa (relatórios, portal e playbook leem esta coluna). */
export function formatTypeForDimensions(dims: DesignDimensions | null | undefined): string {
  if (!dims) return 'feed';
  const p = getFormatPreset(dims.preset);
  if (dims.preset === 'personalizado') return dims.unit === 'px' ? 'feed' : 'midia_fisica';
  return p?.formatType || 'feed';
}

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

export interface DesignFormatInfo {
  preset: DesignFormatPresetKey;
  name: string;
  /** "Feed · 1080×1350 px", "Panfleto A5 · 148×210 mm · 300 dpi + sangria 3 mm" */
  label: string;
  /** curto para o card: "Feed 1080×1350", "Panfleto A5 · impressão" */
  short: string;
  width: number | null;
  height: number | null;
  unit: DesignUnit | null;
  slides: number | null;
  dpi: number | null;
  bleedMm: number | null;
  print: boolean;
  pixels: { width: number; height: number } | null;
  pixelsWithBleed: { width: number; height: number } | null;
  legacy: boolean;
}

/** Formato da arte; null = não informado (ex.: tarefa antiga de "Mídia Física" sem medida). */
export function describeDesignFormat(dimensions: unknown, formatType?: string | null): DesignFormatInfo | null {
  let dims = parseJsonField<DesignDimensions>(dimensions);
  let legacy = false;
  if (!dims || !dims.preset) {
    const key = formatType ? LEGACY_FORMAT_PRESET[formatType] : undefined;
    if (!key) return null;
    dims = dimensionsFromPreset(key);
    legacy = true;
  }
  const base = getFormatPreset(dims.preset) || getFormatPreset('personalizado')!;
  const unit: DesignUnit | null = dims.unit === null || (dims.unit === undefined && base.unit === null)
    ? null
    : (['px', 'cm', 'mm'].includes(String(dims.unit)) ? dims.unit as DesignUnit : (base.unit || 'px'));
  const width = positive(dims.width ?? base.width);
  const height = positive(dims.height ?? base.height);
  if (dims.preset !== 'logomarca' && (!width || !height)) return null;
  const dpi = unit && unit !== 'px' ? (positive(dims.dpi) || base.dpi || 300) : null;
  const bleedMm = unit && unit !== 'px' ? (Number(dims.bleed_mm) >= 0 ? Number(dims.bleed_mm) : (base.bleed_mm ?? 3)) : null;
  const print = unit === 'cm' || unit === 'mm' || !!dims.print;
  const slides = dims.preset === 'carrossel' ? Math.max(2, Math.min(20, Number(dims.slides) || base.slides || 5)) : null;
  const toMm = (v: number) => (unit === 'cm' ? v * 10 : v);
  let pixels: DesignFormatInfo['pixels'] = null;
  let pixelsWithBleed: DesignFormatInfo['pixelsWithBleed'] = null;
  if (unit === 'px' && width && height) pixels = { width: Math.round(width), height: Math.round(height) };
  else if (unit && width && height && dpi) {
    const px = (mm: number) => Math.round((mm / 25.4) * dpi);
    pixels = { width: px(toMm(width)), height: px(toMm(height)) };
    pixelsWithBleed = { width: px(toMm(width) + 2 * (bleedMm || 0)), height: px(toMm(height) + 2 * (bleedMm || 0)) };
  }
  const size = unit && width && height ? `${fmt(width)}×${fmt(height)} ${unit}` : null;
  const label = (size ? `${base.label} · ${size}` : base.label)
    + (slides ? ` · ${slides} slides` : '')
    + (print && dpi ? ` · ${dpi} dpi${bleedMm ? ` + sangria ${fmt(bleedMm)} mm` : ''}` : '');
  const shortSize = unit === 'px' && width && height ? ` ${Math.round(width)}×${Math.round(height)}` : '';
  const short = print
    ? `${base.label}${dims.preset === 'banner' || dims.preset === 'personalizado' ? ` ${size}` : ''} · impressão`
    : `${base.label}${shortSize}${slides ? ` · ${slides} slides` : ''}`;
  return {
    preset: dims.preset, name: base.label, label, short, width, height, unit, slides, dpi, bleedMm, print, pixels, pixelsWithBleed, legacy,
  };
}

// ── Copy estruturada ──
export interface DesignCopyBrief {
  headline?: string;
  support?: string;
  cta?: string;
  phone?: string;
  address?: string;
  price?: string;
  date?: string;
  handle?: string;
  other?: string;
}

export const COPY_MAIN_FIELDS: Array<{ key: keyof DesignCopyBrief; label: string; placeholder: string; multiline?: boolean }> = [
  { key: 'headline', label: 'Título / chamada principal', placeholder: 'Ex.: Clareamento dental em 1 hora' },
  { key: 'support', label: 'Texto de apoio', placeholder: 'Ex.: Avaliação gratuita para novos pacientes', multiline: true },
  { key: 'cta', label: 'Chamada para ação (CTA)', placeholder: 'Ex.: Agende pelo WhatsApp' },
];

export const COPY_REQUIRED_FIELDS: Array<{ key: keyof DesignCopyBrief; label: string; placeholder: string }> = [
  { key: 'phone', label: 'Telefone / WhatsApp', placeholder: '(62) 99999-0000' },
  { key: 'address', label: 'Endereço', placeholder: 'Rua, número, bairro' },
  { key: 'price', label: 'Preço / condição', placeholder: 'R$ 199 ou 3x de R$ 70' },
  { key: 'date', label: 'Data / horário', placeholder: 'Sábado, 15/11, das 8h às 12h' },
  { key: 'handle', label: '@ / site', placeholder: '@cliente' },
  { key: 'other', label: 'Outras informações obrigatórias', placeholder: 'Ex.: CRO, selo, aviso legal' },
];

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function normalizeCopyBrief(value: unknown): DesignCopyBrief {
  const raw = parseJsonField<Record<string, unknown>>(value) || {};
  const out: DesignCopyBrief = {};
  for (const { key } of [...COPY_MAIN_FIELDS, ...COPY_REQUIRED_FIELDS]) {
    const v = clean(raw[key]);
    if (v) out[key] = v;
  }
  return out;
}

export function isCopyBriefEmpty(brief: DesignCopyBrief | null | undefined): boolean {
  return !brief || Object.values(brief).every((v) => !clean(v));
}

/** Texto montado para copy_text (o que o portal, o card e as telas antigas mostram). */
export function assembleCopyText(brief: DesignCopyBrief | null | undefined): string {
  const b = normalizeCopyBrief(brief || {});
  const lines: string[] = [];
  if (b.headline) lines.push(`TÍTULO: ${b.headline}`);
  if (b.support) lines.push(`TEXTO DE APOIO: ${b.support}`);
  if (b.cta) lines.push(`CTA: ${b.cta}`);
  const required = COPY_REQUIRED_FIELDS.filter((f) => b[f.key]).map((f) => `• ${f.label}: ${b[f.key]}`);
  if (required.length) lines.push(`INFORMAÇÕES OBRIGATÓRIAS:\n${required.join('\n')}`);
  return lines.join('\n');
}

// ── O mínimo para a arte ──
export interface DesignBriefSource {
  client_id?: string | null;
  prospect_name?: string | null;
  dimensions?: unknown;
  format_type?: string | null;
  copy_brief?: unknown;
  copy_text?: string | null;
  description?: string | null;
}

/** O que falta para o designer (humano ou IA) conseguir fazer a arte. Vazio = brief completo. */
export function getDesignBriefMissing(task: DesignBriefSource): string[] {
  const missing: string[] = [];
  if (!task.client_id && !clean(task.prospect_name)) missing.push('cliente');
  if (!describeDesignFormat(task.dimensions, task.format_type)) missing.push('formato/dimensão');
  const brief = normalizeCopyBrief(task.copy_brief);
  if (!brief.headline && !brief.support && !brief.cta && !clean(task.copy_text) && !clean(task.description)) {
    missing.push('copy ou descrição');
  }
  return missing;
}

/** Mensagens para o formulário de criação (o que falta e como resolver). */
export function describeMissingForForm(missing: string[]): string[] {
  const help: Record<string, string> = {
    cliente: 'Escolha o cliente (ou marque "Cliente não cadastrado" e digite o nome).',
    'formato/dimensão': 'Escolha o formato. Em "Personalizado", preencha largura e altura.',
    'copy ou descrição': 'Escreva a copy (título, texto de apoio ou CTA) ou uma descrição do que a arte precisa ter.',
  };
  return missing.map((m) => help[m] || m);
}

// ── Análise IA ──
export const DESIGN_ERROR_CATEGORIES: Record<string, string> = {
  texto: 'Texto / ortografia',
  marca: 'Marca / cores / logo',
  formato: 'Formato / dimensão',
  hierarquia: 'Hierarquia / legibilidade',
  informacao: 'Informação obrigatória faltando',
  imagem: 'Imagem / qualidade',
};

/** Tipos de arquivo de referência que a equipe pode enviar. */
export const REFERENCE_FILE_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif,application/pdf,.pdf,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';
export const REFERENCE_MAX_BYTES = 100 * 1024 * 1024;

export type ReferenceKind = 'image' | 'pdf' | 'video' | 'link';

export function referenceKind(url: string): ReferenceKind {
  const clean = url.split('?')[0].toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|avif)$/.test(clean)) return 'image';
  if (/\.(heic|heif)$/.test(clean)) return 'image';
  if (/\.pdf$/.test(clean)) return 'pdf';
  if (/\.(mp4|mov|m4v|webm)$/.test(clean)) return 'video';
  return 'link';
}

/** HEIC não abre no navegador (só Safari): a prévia vira ícone. */
export function canPreviewImage(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i.test(url);
}

import { describe, it, expect } from 'vitest';
import {
  DESIGN_FORMAT_PRESETS,
  dimensionsFromPreset,
  describeDesignFormat,
  formatTypeForDimensions,
  assembleCopyText,
  normalizeCopyBrief,
  getDesignBriefMissing,
  describeMissingForForm,
  referenceKind,
  canPreviewImage,
} from '@/lib/designBrief';
import {
  describeDesignFormat as serverDescribe,
  designBriefMissing as serverMissing,
  normalizeErrorCategory,
  checkDeliveredArts,
  sniffArtKind,
  DESIGN_FORMAT_PRESETS as SERVER_PRESETS,
} from '../../vps-api-server/lib/designBrief.mjs';

describe('formatos e dimensões', () => {
  it('feed, story e carrossel em pixels', () => {
    expect(describeDesignFormat(dimensionsFromPreset('feed'))?.label).toBe('Feed · 1080×1350 px');
    expect(describeDesignFormat(dimensionsFromPreset('story'))?.pixels).toEqual({ width: 1080, height: 1920 });
    const car = describeDesignFormat(dimensionsFromPreset('carrossel', { slides: 7 }));
    expect(car?.slides).toBe(7);
    expect(car?.short).toBe('Carrossel 1080×1350 · 7 slides');
  });

  it('impressão: A5 300 dpi com sangria de 3 mm', () => {
    const a5 = describeDesignFormat(dimensionsFromPreset('panfleto_a5'))!;
    expect(a5.print).toBe(true);
    expect(a5.label).toBe('Panfleto A5 · 148×210 mm · 300 dpi + sangria 3 mm');
    expect(a5.pixels).toEqual({ width: 1748, height: 2480 });
    expect(a5.pixelsWithBleed).toEqual({ width: 1819, height: 2551 });
    expect(a5.short).toBe('Panfleto A5 · impressão');
  });

  it('banner em cm e outdoor 9×3 m', () => {
    const banner = describeDesignFormat(dimensionsFromPreset('banner', { width: 60, height: 90 }))!;
    expect(banner.label).toContain('60×90 cm');
    expect(banner.short).toBe('Banner 60×90 cm · impressão');
    const outdoor = describeDesignFormat(dimensionsFromPreset('outdoor'))!;
    expect(outdoor.label).toBe('Outdoor 9×3 m · 900×300 cm · 30 dpi');
  });

  it('personalizado exige largura e altura e respeita a unidade', () => {
    expect(describeDesignFormat({ preset: 'personalizado', unit: 'mm' })).toBeNull();
    const custom = describeDesignFormat({ preset: 'personalizado', width: 200, height: 100, unit: 'mm', dpi: 300, bleed_mm: 2 })!;
    expect(custom.print).toBe(true);
    expect(custom.pixelsWithBleed).toEqual({ width: 2409, height: 1228 });
    expect(formatTypeForDimensions({ preset: 'personalizado', width: 1200, height: 628, unit: 'px' })).toBe('feed');
    expect(formatTypeForDimensions({ preset: 'personalizado', width: 20, height: 10, unit: 'cm' })).toBe('midia_fisica');
  });

  it('tarefa antiga sem dimensions usa o format_type; mídia física sem medida = não informado', () => {
    expect(describeDesignFormat(null, 'story')?.legacy).toBe(true);
    expect(describeDesignFormat(null, 'midia_fisica')).toBeNull();
    expect(describeDesignFormat('{"preset":"feed","width":1080,"height":1350,"unit":"px"}')?.label).toBe('Feed · 1080×1350 px');
  });

  it('logomarca não tem medida fixa', () => {
    const logo = describeDesignFormat(dimensionsFromPreset('logomarca'))!;
    expect(logo.unit).toBeNull();
    expect(logo.label).toBe('Logomarca');
  });

  it('front e servidor descrevem igual (o agente recebe o mesmo que a tela mostra)', () => {
    expect(Object.keys(SERVER_PRESETS).sort()).toEqual(DESIGN_FORMAT_PRESETS.map((p) => p.key).sort());
    for (const p of DESIGN_FORMAT_PRESETS) {
      const dims = dimensionsFromPreset(p.key, p.key === 'personalizado' ? { width: 50, height: 70, unit: 'cm', dpi: 150 } : {});
      const front = describeDesignFormat(dims);
      const server = serverDescribe(dims, null);
      expect(server?.label, p.key).toBe(front?.label);
      expect(server?.pixels ?? null, p.key).toEqual(front?.pixels ?? null);
      expect(server?.pixels_with_bleed ?? null, p.key).toEqual(front?.pixelsWithBleed ?? null);
    }
  });
});

describe('copy estruturada', () => {
  it('monta o copy_text com título, apoio, CTA e informações obrigatórias', () => {
    const text = assembleCopyText({ headline: ' Black Friday ', cta: 'Compre já', phone: '(62) 9999-0000', handle: '@loja' });
    expect(text).toBe('TÍTULO: Black Friday\nCTA: Compre já\nINFORMAÇÕES OBRIGATÓRIAS:\n• Telefone / WhatsApp: (62) 9999-0000\n• @ / site: @loja');
    expect(assembleCopyText({})).toBe('');
  });

  it('normaliza e ignora campos vazios ou desconhecidos', () => {
    expect(normalizeCopyBrief('{"headline":"  oi ","x":"y","cta":""}')).toEqual({ headline: 'oi' });
  });
});

describe('mínimo para criar a arte', () => {
  const base = { client_id: 'c1', dimensions: dimensionsFromPreset('feed'), copy_brief: { headline: 'Oi' } };
  it('completo', () => {
    expect(getDesignBriefMissing(base)).toEqual([]);
  });
  it('explica o que falta', () => {
    const missing = getDesignBriefMissing({ client_id: null, dimensions: { preset: 'personalizado' }, copy_brief: {} });
    expect(missing).toEqual(['cliente', 'formato/dimensão', 'copy ou descrição']);
    expect(describeMissingForForm(missing)[1]).toMatch(/largura e altura/);
  });
  it('descrição ou cliente não cadastrado também valem', () => {
    expect(getDesignBriefMissing({ prospect_name: 'Padaria Nova', dimensions: dimensionsFromPreset('story'), description: 'Arte de inauguração' })).toEqual([]);
  });
  it('servidor aplica a mesma regra', () => {
    const t = { client_id: null, prospect_name: '', dimensions: null, format_type: 'midia_fisica', copy_brief: null, copy_text: '', description: '' };
    expect(serverMissing(t)).toEqual(getDesignBriefMissing(t));
  });
});

describe('Análise IA e entrega', () => {
  it('categorias de erro aceitam sinônimos', () => {
    expect(normalizeErrorCategory('Ortografia')).toBe('texto');
    expect(normalizeErrorCategory('logo')).toBe('marca');
    expect(normalizeErrorCategory('dimensão')).toBe('formato');
    expect(normalizeErrorCategory('legibilidade')).toBe('hierarquia');
    expect(normalizeErrorCategory('informação')).toBe('informacao');
    expect(normalizeErrorCategory('qualidade')).toBe('imagem');
    expect(normalizeErrorCategory('beleza')).toBeNull();
  });

  it('reconhece PNG, JPG e PDF pelo conteúdo', () => {
    expect(sniffArtKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffArtKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffArtKind(Buffer.from('%PDF-1.7'))).toBe('pdf');
    expect(sniffArtKind(Buffer.from('<html>'))).toBeNull();
  });

  it('arte digital fora da medida é erro; slides a menos e impressão em PNG só avisam', () => {
    const feed = serverDescribe(dimensionsFromPreset('feed'), null);
    expect(checkDeliveredArts(feed, [{ kind: 'png', size: { width: 1080, height: 1080, unit: 'px' } }]).errors).toHaveLength(1);
    expect(checkDeliveredArts(feed, [{ kind: 'png', size: { width: 1080, height: 1350, unit: 'px' } }]).errors).toHaveLength(0);
    const car = serverDescribe(dimensionsFromPreset('carrossel', { slides: 3 }), null);
    expect(checkDeliveredArts(car, [{ kind: 'png', size: { width: 1080, height: 1350, unit: 'px' } }]).warnings[0]).toMatch(/3 slides/);
    const a4 = serverDescribe(dimensionsFromPreset('panfleto_a4'), null);
    const res = checkDeliveredArts(a4, [{ kind: 'png', size: { width: 800, height: 1100, unit: 'px' } }]);
    expect(res.errors).toHaveLength(0);
    expect(res.warnings.join(' ')).toMatch(/PDF/);
    expect(checkDeliveredArts(a4, [{ kind: 'pdf', size: { width: 216, height: 303, unit: 'mm' } }]).warnings).toHaveLength(0);
  });

  it('tipos de referência', () => {
    expect(referenceKind('https://x/y.HEIC')).toBe('image');
    expect(canPreviewImage('https://x/y.heic')).toBe(false);
    expect(referenceKind('https://x/a.pdf?x=1')).toBe('pdf');
    expect(referenceKind('https://x/a.mov')).toBe('video');
    expect(referenceKind('https://pinterest.com/pin/1')).toBe('link');
  });
});

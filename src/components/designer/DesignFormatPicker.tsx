import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BANNER_SIZES,
  DESIGN_FORMAT_PRESETS,
  DesignDimensions,
  DesignFormatPresetKey,
  DesignUnit,
  describeDesignFormat,
  dimensionsFromPreset,
  getFormatPreset,
} from '@/lib/designBrief';

interface Props {
  value: DesignDimensions | null;
  onChange: (value: DesignDimensions) => void;
  /** formatos que não podem ser escolhidos (ex.: o principal, na lista de "também criar em") */
  disabledKeys?: DesignFormatPresetKey[];
}

const GROUPS: Array<{ key: 'digital' | 'impressao' | 'outro'; label: string }> = [
  { key: 'digital', label: 'Redes sociais' },
  { key: 'impressao', label: 'Impressão' },
  { key: 'outro', label: 'Outros' },
];

const numberOrUndefined = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
// medida vazia = 0 (undefined faria o formato cair na medida padrão do preset)
const sizeOrZero = (v: string) => numberOrUndefined(v) ?? 0;

/**
 * Formato e dimensão da arte: presets de redes sociais e de impressão (panfleto, banner, outdoor,
 * cartão) e "Personalizado" com largura × altura em px, cm ou mm, DPI e sangria.
 */
export default function DesignFormatPicker({ value, onChange, disabledKeys = [] }: Props) {
  const info = value ? describeDesignFormat(value) : null;
  const preset = value ? getFormatPreset(value.preset) : undefined;
  const isPrint = !!info?.print || (value?.preset === 'personalizado' && value.unit !== 'px');
  const set = (patch: Partial<DesignDimensions>) => value && onChange({ ...value, ...patch });
  const bannerSize = value?.preset === 'banner'
    ? BANNER_SIZES.find((b) => b.width === value.width && b.height === value.height)
    : undefined;

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => (
        <div key={group.key}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">{group.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {DESIGN_FORMAT_PRESETS.filter((p) => p.group === group.key).map((p) => {
              const selected = value?.preset === p.key;
              const disabled = disabledKeys.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(dimensionsFromPreset(p.key))}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-all disabled:opacity-40 ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/30'
                  }`}
                  title={p.hint}
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                  {p.unit === 'px' && p.width && p.key !== 'personalizado' && (
                    <span className="text-[10px] opacity-70">{p.width}×{p.height}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {value?.preset === 'carrossel' && (
        <div className="flex items-center gap-2">
          <Label className="text-xs">Quantos slides?</Label>
          <Input
            type="number"
            min={2}
            max={20}
            value={value.slides ?? 5}
            onChange={(e) => set({ slides: Math.max(2, Math.min(20, Number(e.target.value) || 2)) })}
            className="h-8 w-20 text-xs"
          />
          <span className="text-[11px] text-muted-foreground">1080×1350 cada</span>
        </div>
      )}

      {value?.preset === 'banner' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Tamanho do banner</Label>
          <Select
            value={bannerSize ? `${bannerSize.width}x${bannerSize.height}` : 'outro'}
            onValueChange={(v) => {
              if (v === 'outro') return set({ width: 0, height: 0 });
              const [w, h] = v.split('x').map(Number);
              set({ width: w, height: h, unit: 'cm' });
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BANNER_SIZES.map((b) => (
                <SelectItem key={b.label} value={`${b.width}x${b.height}`} className="text-xs">{b.label}</SelectItem>
              ))}
              <SelectItem value="outro" className="text-xs">Outro tamanho (cm)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {(value?.preset === 'personalizado' || (value?.preset === 'banner' && !bannerSize)) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Largura *</Label>
            <Input type="number" step="any" min={0} value={value.width || ''} onChange={(e) => set({ width: sizeOrZero(e.target.value) })} className="h-8 text-xs" placeholder="1080" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Altura *</Label>
            <Input type="number" step="any" min={0} value={value.height || ''} onChange={(e) => set({ height: sizeOrZero(e.target.value) })} className="h-8 text-xs" placeholder="1350" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Unidade</Label>
            <Select
              value={value.unit || 'px'}
              disabled={value.preset === 'banner'}
              onValueChange={(u) => set(u === 'px'
                ? { unit: 'px', dpi: undefined, bleed_mm: undefined, print: false }
                : { unit: u as DesignUnit, dpi: value.dpi || 300, bleed_mm: value.bleed_mm ?? 3, print: true })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="px" className="text-xs">px (digital)</SelectItem>
                <SelectItem value="cm" className="text-xs">cm (impressão)</SelectItem>
                <SelectItem value="mm" className="text-xs">mm (impressão)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {isPrint && value && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">DPI</Label>
            <Input inputMode="numeric" value={value.dpi ?? ''} onChange={(e) => set({ dpi: numberOrUndefined(e.target.value) })} className="h-8 text-xs" placeholder="300" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Sangria (mm)</Label>
            <Input
              inputMode="decimal"
              value={value.bleed_mm ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value.replace(',', '.'));
                set({ bleed_mm: Number.isFinite(n) && n >= 0 ? n : undefined });
              }}
              className="h-8 text-xs"
              placeholder="3"
            />
          </div>
        </div>
      )}

      {value && (
        <div className={`rounded-lg border px-3 py-2 text-[11px] ${info ? 'border-border bg-muted/30' : 'border-destructive/40 bg-destructive/5 text-destructive'}`}>
          {info ? (
            <>
              <span className="font-semibold">{info.label}</span>
              {info.print && info.pixelsWithBleed && (
                <span className="text-muted-foreground"> · exportar {info.pixelsWithBleed.width}×{info.pixelsWithBleed.height} px com sangria, em PDF de impressão</span>
              )}
              {preset?.hint && <span className="block text-muted-foreground mt-0.5">{preset.hint}</span>}
            </>
          ) : (
            'Preencha largura e altura para o designer saber a medida.'
          )}
        </div>
      )}
    </div>
  );
}

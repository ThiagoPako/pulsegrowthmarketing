/**
 * Tema visual da página pública de Bio Link (/bio/:slug).
 * Os valores são dados do cliente (não tokens do design system), por isso
 * são aplicados via inline style apenas na página pública.
 */

export type BioLayout = 'stack' | 'grid' | 'minimal';
export type BioButtonShape = 'pill' | 'rounded' | 'square';
export type BioAvatarShape = 'circle' | 'rounded' | 'square' | 'hidden';
export type BioAvatarSize = 'sm' | 'md' | 'lg';

export interface BioThemeConfig {
  preset: string;
  bgColor: string;
  bgColorEnd: string;
  cardColor: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  accentTextColor: string;
  layout: BioLayout;
  buttonShape: BioButtonShape;
  buttonStyle: 'solid' | 'outline' | 'glass';
  avatarShape: BioAvatarShape;
  avatarSize: BioAvatarSize;
  avatarRing: boolean;
}

export const DEFAULT_BIO_THEME: BioThemeConfig = {
  preset: 'pulse',
  bgColor: '#0f172a',
  bgColorEnd: '#1e293b',
  cardColor: '#ffffff',
  textColor: '#ffffff',
  mutedColor: '#cbd5e1',
  accentColor: '#f2600c',
  accentTextColor: '#ffffff',
  layout: 'stack',
  buttonShape: 'pill',
  buttonStyle: 'solid',
  avatarShape: 'circle',
  avatarSize: 'md',
  avatarRing: true,
};

export interface BioThemePreset {
  key: string;
  label: string;
  swatch: string[];
  config: Partial<BioThemeConfig>;
}

export const BIO_THEME_PRESETS: BioThemePreset[] = [
  {
    key: 'pulse',
    label: 'Pulse (Escuro)',
    swatch: ['#0f172a', '#1e293b', '#f2600c', '#ffffff'],
    config: {
      bgColor: '#0f172a', bgColorEnd: '#1e293b', textColor: '#ffffff',
      mutedColor: '#cbd5e1', accentColor: '#f2600c', accentTextColor: '#ffffff',
      buttonStyle: 'solid',
    },
  },
  {
    key: 'light',
    label: 'Clean (Claro)',
    swatch: ['#f8fafc', '#ffffff', '#0f172a', '#e2e8f0'],
    config: {
      bgColor: '#f8fafc', bgColorEnd: '#ffffff', textColor: '#0f172a',
      mutedColor: '#64748b', accentColor: '#0f172a', accentTextColor: '#ffffff',
      buttonStyle: 'outline',
    },
  },
  {
    key: 'sunset',
    label: 'Sunset',
    swatch: ['#ff7e5f', '#feb47b', '#ffffff', '#7c2d12'],
    config: {
      bgColor: '#ff7e5f', bgColorEnd: '#feb47b', textColor: '#ffffff',
      mutedColor: '#fff1e6', accentColor: '#ffffff', accentTextColor: '#7c2d12',
      buttonStyle: 'solid',
    },
  },
  {
    key: 'emerald',
    label: 'Emerald',
    swatch: ['#064e3b', '#065f46', '#34d399', '#ecfdf5'],
    config: {
      bgColor: '#064e3b', bgColorEnd: '#065f46', textColor: '#ecfdf5',
      mutedColor: '#a7f3d0', accentColor: '#34d399', accentTextColor: '#052e2b',
      buttonStyle: 'solid',
    },
  },
  {
    key: 'royal',
    label: 'Royal',
    swatch: ['#1e1b4b', '#312e81', '#a78bfa', '#ede9fe'],
    config: {
      bgColor: '#1e1b4b', bgColorEnd: '#312e81', textColor: '#ede9fe',
      mutedColor: '#c4b5fd', accentColor: '#a78bfa', accentTextColor: '#1e1b4b',
      buttonStyle: 'glass',
    },
  },
  {
    key: 'mono',
    label: 'Mono',
    swatch: ['#000000', '#111111', '#ffffff', '#a3a3a3'],
    config: {
      bgColor: '#000000', bgColorEnd: '#111111', textColor: '#ffffff',
      mutedColor: '#a3a3a3', accentColor: '#ffffff', accentTextColor: '#000000',
      buttonStyle: 'outline',
    },
  },
];

/** Faz merge seguro do theme_config vindo do banco com os defaults. */
export function normalizeBioTheme(raw: unknown): BioThemeConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BIO_THEME };
  const input = raw as Record<string, unknown>;
  const out = { ...DEFAULT_BIO_THEME } as unknown as Record<string, unknown>;
  Object.keys(DEFAULT_BIO_THEME).forEach((key) => {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
  });
  return out as unknown as BioThemeConfig;
}

export const AVATAR_SIZE_PX: Record<BioAvatarSize, number> = { sm: 72, md: 104, lg: 136 };

export const AVATAR_RADIUS: Record<BioAvatarShape, string> = {
  circle: '9999px',
  rounded: '24px',
  square: '4px',
  hidden: '0px',
};

export const BUTTON_RADIUS: Record<BioButtonShape, string> = {
  pill: '9999px',
  rounded: '14px',
  square: '4px',
};

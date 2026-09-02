/**
 * Seções extras da página pública de Bio Link (/bio/:slug).
 * Tudo é persistido na coluna JSONB `sections` de client_bio_links.
 */

export interface BioSeller {
  id: string;
  name: string;
  role?: string;
  photoUrl?: string;
  /** Somente dígitos, com DDI. Opcional. */
  whatsapp?: string;
  whatsappMessage?: string;
  visible: boolean;
}

export interface BioBrand {
  id: string;
  name: string;
  logoUrl: string;
  url?: string;
  visible: boolean;
}

export type BioSocialNetwork =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'x'
  | 'site';

export interface BioSocial {
  id: string;
  network: BioSocialNetwork;
  label?: string;
  /** URL completa ou @usuario */
  value: string;
  visible: boolean;
}

export interface BioLocation {
  enabled: boolean;
  label: string;
  address?: string;
  /** Link do Google Maps / Waze */
  mapUrl?: string;
  hours?: string;
}

export interface BioSections {
  showSellers: boolean;
  sellersTitle: string;
  sellers: BioSeller[];

  showBrands: boolean;
  brandsTitle: string;
  /** Velocidade do carrossel de logos, em segundos por ciclo. */
  brandsSpeed: number;
  brands: BioBrand[];

  showSocials: boolean;
  socialsTitle: string;
  socialsStyle: 'icons' | 'buttons';
  socials: BioSocial[];

  location: BioLocation;
}

export const DEFAULT_BIO_SECTIONS: BioSections = {
  showSellers: false,
  sellersTitle: 'Fale com nossa equipe',
  sellers: [],

  showBrands: false,
  brandsTitle: 'Marcas que trabalhamos',
  brandsSpeed: 25,
  brands: [],

  showSocials: true,
  socialsTitle: 'Redes sociais',
  socialsStyle: 'icons',
  socials: [],

  location: { enabled: false, label: 'Como chegar', address: '', mapUrl: '', hours: '' },
};

export const SOCIAL_LABELS: Record<BioSocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  site: 'Site',
};

const SOCIAL_BASE: Record<BioSocialNetwork, string> = {
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  tiktok: 'https://tiktok.com/@',
  youtube: 'https://youtube.com/@',
  linkedin: 'https://linkedin.com/in/',
  x: 'https://x.com/',
  site: '',
};

/** Converte "@usuario" ou "usuario" em URL completa da rede. */
export function socialHref(social: BioSocial): string {
  const raw = String(social.value || '').trim();
  if (!raw) return '#';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@/, '');
  const base = SOCIAL_BASE[social.network];
  if (!base) return `https://${handle}`;
  return `${base}${handle}`;
}

export function whatsappHref(phone?: string, message?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  const text = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${digits}${text}`;
}

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Merge defensivo do JSONB vindo do banco (pode vir string, null ou parcial). */
export function normalizeBioSections(raw: unknown): BioSections {
  let input: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      input = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      input = {};
    }
  } else if (raw && typeof raw === 'object') {
    input = raw as Record<string, unknown>;
  }

  const sellersRaw = Array.isArray(input.sellers) ? input.sellers : [];
  const brandsRaw = Array.isArray(input.brands) ? input.brands : [];
  const socialsRaw = Array.isArray(input.socials) ? input.socials : [];
  const locationRaw = (input.location && typeof input.location === 'object'
    ? input.location
    : {}) as Record<string, unknown>;

  return {
    showSellers: toBool(input.showSellers, DEFAULT_BIO_SECTIONS.showSellers),
    sellersTitle: toStr(input.sellersTitle, DEFAULT_BIO_SECTIONS.sellersTitle),
    sellers: sellersRaw.map((item) => {
      const seller = (item || {}) as Record<string, unknown>;
      return {
        id: toStr(seller.id) || randomId(),
        name: toStr(seller.name),
        role: toStr(seller.role),
        photoUrl: toStr(seller.photoUrl),
        whatsapp: toStr(seller.whatsapp),
        whatsappMessage: toStr(seller.whatsappMessage),
        visible: toBool(seller.visible, true),
      } satisfies BioSeller;
    }),

    showBrands: toBool(input.showBrands, DEFAULT_BIO_SECTIONS.showBrands),
    brandsTitle: toStr(input.brandsTitle, DEFAULT_BIO_SECTIONS.brandsTitle),
    brandsSpeed:
      typeof input.brandsSpeed === 'number' && input.brandsSpeed > 4
        ? input.brandsSpeed
        : DEFAULT_BIO_SECTIONS.brandsSpeed,
    brands: brandsRaw.map((item) => {
      const brand = (item || {}) as Record<string, unknown>;
      return {
        id: toStr(brand.id) || randomId(),
        name: toStr(brand.name),
        logoUrl: toStr(brand.logoUrl),
        url: toStr(brand.url),
        visible: toBool(brand.visible, true),
      } satisfies BioBrand;
    }),

    showSocials: toBool(input.showSocials, DEFAULT_BIO_SECTIONS.showSocials),
    socialsTitle: toStr(input.socialsTitle, DEFAULT_BIO_SECTIONS.socialsTitle),
    socialsStyle: input.socialsStyle === 'buttons' ? 'buttons' : 'icons',
    socials: socialsRaw.map((item) => {
      const social = (item || {}) as Record<string, unknown>;
      const network = toStr(social.network) as BioSocialNetwork;
      return {
        id: toStr(social.id) || randomId(),
        network: SOCIAL_LABELS[network] ? network : 'instagram',
        label: toStr(social.label),
        value: toStr(social.value),
        visible: toBool(social.visible, true),
      } satisfies BioSocial;
    }),

    location: {
      enabled: toBool(locationRaw.enabled, false),
      label: toStr(locationRaw.label, 'Como chegar'),
      address: toStr(locationRaw.address),
      mapUrl: toStr(locationRaw.mapUrl),
      hours: toStr(locationRaw.hours),
    },
  };
}

export const newSeller = (): BioSeller => ({
  id: randomId(),
  name: '',
  role: '',
  photoUrl: '',
  whatsapp: '',
  whatsappMessage: '',
  visible: true,
});

export const newBrand = (): BioBrand => ({
  id: randomId(),
  name: '',
  logoUrl: '',
  url: '',
  visible: true,
});

export const newSocial = (): BioSocial => ({
  id: randomId(),
  network: 'instagram',
  label: '',
  value: '',
  visible: true,
});

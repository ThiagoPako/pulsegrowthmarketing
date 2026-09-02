import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  MapPin,
  MessageCircle,
  Music2,
  Twitter,
  Youtube,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  socialHref,
  whatsappHref,
  SOCIAL_LABELS,
  type BioSections,
  type BioSocialNetwork,
} from '@/lib/bioSections';
import { BUTTON_RADIUS, type BioThemeConfig } from '@/lib/bioTheme';

const SOCIAL_ICONS: Record<BioSocialNetwork, LucideIcon> = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
  youtube: Youtube,
  linkedin: Linkedin,
  x: Twitter,
  site: Globe,
};

const MARQUEE_CSS = `
@keyframes bio-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.bio-marquee-track { display: flex; width: max-content; animation-name: bio-marquee; animation-timing-function: linear; animation-iteration-count: infinite; }
.bio-marquee-wrap:hover .bio-marquee-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .bio-marquee-track { animation: none; } }
`;

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <h2
      className="text-center text-xs font-semibold uppercase tracking-[0.18em]"
      style={{ color }}
    >
      {children}
    </h2>
  );
}

export default function BioSectionsView({
  sections,
  theme,
}: {
  sections: BioSections;
  theme: BioThemeConfig;
}) {
  const radius = BUTTON_RADIUS[theme.buttonShape] ?? BUTTON_RADIUS.pill;

  const sellers = sections.sellers.filter((seller) => seller.visible && seller.name.trim());
  const brands = sections.brands.filter((brand) => brand.visible && brand.logoUrl.trim());
  const socials = sections.socials.filter((social) => social.visible && social.value.trim());
  const location = sections.location;

  const showSellers = sections.showSellers && sellers.length > 0;
  const showBrands = sections.showBrands && brands.length > 0;
  const showSocials = sections.showSocials && socials.length > 0;
  const showLocation = Boolean(location.enabled && (location.mapUrl || location.address));

  if (!showSellers && !showBrands && !showSocials && !showLocation) return null;

  const loopBrands = brands.length < 4 ? [...brands, ...brands, ...brands] : brands;

  return (
    <div className="w-full space-y-9">
      {showLocation && (
        <section className="space-y-3">
          <a
            href={location.mapUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-4 transition-transform duration-200 hover:scale-[1.01]"
            style={{
              borderRadius: radius,
              background: `${theme.accentColor}1f`,
              border: `1px solid ${theme.accentColor}55`,
              color: theme.textColor,
            }}
          >
            <MapPin className="h-5 w-5 shrink-0" style={{ color: theme.accentColor }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{location.label || 'Como chegar'}</span>
              {location.address && (
                <span className="block truncate text-xs" style={{ color: theme.mutedColor }}>
                  {location.address}
                </span>
              )}
              {location.hours && (
                <span className="block truncate text-xs" style={{ color: theme.mutedColor }}>
                  {location.hours}
                </span>
              )}
            </span>
          </a>
        </section>
      )}

      {showSellers && (
        <section className="space-y-4">
          <SectionTitle color={theme.mutedColor}>{sections.sellersTitle}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {sellers.map((seller) => {
              const hasWhats = Boolean(seller.whatsapp && seller.whatsapp.replace(/\D/g, ''));
              const content = (
                <>
                  {seller.photoUrl ? (
                    <img
                      src={seller.photoUrl}
                      alt={seller.name}
                      loading="lazy"
                      className="h-20 w-20 rounded-full object-cover"
                      style={{ border: `2px solid ${theme.accentColor}` }}
                    />
                  ) : (
                    <span
                      className="flex h-20 w-20 items-center justify-center rounded-full text-lg font-bold"
                      style={{ background: `${theme.accentColor}33`, color: theme.textColor }}
                    >
                      {seller.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm font-semibold" style={{ color: theme.textColor }}>
                    {seller.name}
                  </span>
                  {seller.role && (
                    <span className="text-[11px]" style={{ color: theme.mutedColor }}>
                      {seller.role}
                    </span>
                  )}
                  {hasWhats && (
                    <span
                      className="mt-1 inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold"
                      style={{
                        borderRadius: radius,
                        background: theme.accentColor,
                        color: theme.accentTextColor,
                      }}
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </span>
                  )}
                </>
              );

              const cardClass =
                'flex flex-col items-center gap-1.5 p-4 text-center transition-transform duration-200';
              const cardStyle: React.CSSProperties = {
                borderRadius: radius === '9999px' ? '20px' : radius,
                background: `${theme.accentColor}12`,
                border: `1px solid ${theme.accentColor}33`,
              };

              return hasWhats ? (
                <a
                  key={seller.id}
                  href={whatsappHref(seller.whatsapp, seller.whatsappMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${cardClass} hover:scale-[1.02]`}
                  style={cardStyle}
                >
                  {content}
                </a>
              ) : (
                <div key={seller.id} className={cardClass} style={cardStyle}>
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showBrands && (
        <section className="space-y-4">
          <style>{MARQUEE_CSS}</style>
          <SectionTitle color={theme.mutedColor}>{sections.brandsTitle}</SectionTitle>
          <div
            className="bio-marquee-wrap overflow-hidden py-3"
            style={{
              borderRadius: '20px',
              background: `${theme.accentColor}0f`,
              maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
              WebkitMaskImage:
                'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
            }}
          >
            <div
              className="bio-marquee-track gap-8"
              style={{ animationDuration: `${sections.brandsSpeed || 25}s` }}
            >
              {[...loopBrands, ...loopBrands].map((brand, index) => {
                const logo = (
                  <img
                    src={brand.logoUrl}
                    alt={brand.name || 'Marca'}
                    loading="lazy"
                    className="h-12 w-auto max-w-[120px] object-contain opacity-90"
                  />
                );
                return (
                  <span key={`${brand.id}-${index}`} className="flex shrink-0 items-center">
                    {brand.url ? (
                      <a href={brand.url} target="_blank" rel="noopener noreferrer">
                        {logo}
                      </a>
                    ) : (
                      logo
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {showSocials && (
        <section className="space-y-4">
          <SectionTitle color={theme.mutedColor}>{sections.socialsTitle}</SectionTitle>
          {sections.socialsStyle === 'icons' ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              {socials.map((social) => {
                const Icon = SOCIAL_ICONS[social.network] ?? Globe;
                return (
                  <a
                    key={social.id}
                    href={socialHref(social)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label || SOCIAL_LABELS[social.network]}
                    className="flex h-12 w-12 items-center justify-center transition-transform duration-200 hover:scale-110"
                    style={{
                      borderRadius: '9999px',
                      background: `${theme.accentColor}22`,
                      border: `1px solid ${theme.accentColor}55`,
                      color: theme.textColor,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {socials.map((social) => {
                const Icon = SOCIAL_ICONS[social.network] ?? Globe;
                return (
                  <a
                    key={social.id}
                    href={socialHref(social)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-4 text-base font-semibold transition-transform duration-200 hover:scale-[1.02]"
                    style={{
                      borderRadius: radius,
                      background: theme.accentColor,
                      color: theme.accentTextColor,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                    {social.label || SOCIAL_LABELS[social.network]}
                  </a>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

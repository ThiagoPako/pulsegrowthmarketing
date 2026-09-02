import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, MapPin, MessageCircle, Globe, Instagram, Link2 } from 'lucide-react';
import {
  normalizeBioTheme,
  AVATAR_SIZE_PX,
  AVATAR_RADIUS,
  BUTTON_RADIUS,
  type BioThemeConfig,
} from '@/lib/bioTheme';
import { normalizeBioSections } from '@/lib/bioSections';
import BioSectionsView from '@/components/bio/BioSectionsView';

const API_BASE = 'https://agenciapulse.tech';

interface BioButton {
  id: string;
  label: string;
  type: 'whatsapp' | 'location' | 'social' | 'custom';
  value: string;
  icon?: string | null;
  position?: number | null;
}

interface BioRecord {
  id: string;
  slug: string;
  title?: string | null;
  description?: string | null;
  logo_url?: string | null;
  theme_config?: unknown;
  sections?: unknown;
}


function iconFor(type: BioButton['type']) {
  if (type === 'whatsapp') return MessageCircle;
  if (type === 'location') return MapPin;
  if (type === 'social') return Instagram;
  return Link2;
}

function hrefFor(button: BioButton) {
  if (button.type === 'whatsapp') {
    const digits = String(button.value || '').replace(/\D/g, '');
    return `https://wa.me/${digits}`;
  }
  return button.value;
}

export function BioButtonList({
  buttons,
  theme,
}: {
  buttons: BioButton[];
  theme: BioThemeConfig;
}) {
  const isGrid = theme.layout === 'grid';
  const isMinimal = theme.layout === 'minimal';

  const buttonStyle = (): React.CSSProperties => {
    const radius = BUTTON_RADIUS[theme.buttonShape] ?? BUTTON_RADIUS.pill;
    if (theme.buttonStyle === 'outline') {
      return {
        borderRadius: radius,
        border: `2px solid ${theme.accentColor}`,
        color: theme.accentColor,
        background: 'transparent',
      };
    }
    if (theme.buttonStyle === 'glass') {
      return {
        borderRadius: radius,
        border: `1px solid ${theme.accentColor}55`,
        color: theme.textColor,
        background: `${theme.accentColor}22`,
        backdropFilter: 'blur(8px)',
      };
    }
    return {
      borderRadius: radius,
      border: '1px solid transparent',
      color: theme.accentTextColor,
      background: theme.accentColor,
    };
  };

  return (
    <div
      className={
        isGrid
          ? 'grid grid-cols-2 gap-3'
          : isMinimal
            ? 'flex flex-col gap-2'
            : 'flex flex-col gap-3'
      }
    >
      {buttons.map((button) => {
        const Icon = iconFor(button.type);
        return (
          <a
            key={button.id}
            href={hrefFor(button)}
            target="_blank"
            rel="noopener noreferrer"
            style={buttonStyle()}
            className={`flex items-center justify-center gap-2 font-semibold transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99] ${
              isMinimal ? 'py-3 text-sm' : isGrid ? 'py-5 text-sm' : 'py-4 text-base'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="truncate">{button.label}</span>
          </a>
        );
      })}
    </div>
  );
}

export default function PublicBioLink() {
  const { slug } = useParams();
  const [bio, setBio] = useState<BioRecord | null>(null);
  const [buttons, setButtons] = useState<BioButton[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/public/bio/${slug}`);
        if (!response.ok) throw new Error('not found');
        const payload = await response.json();
        if (cancelled) return;
        setBio(payload.bio || null);
        setButtons(Array.isArray(payload.buttons) ? payload.buttons : []);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const theme = normalizeBioTheme(bio?.theme_config);
  const sections = normalizeBioSections(bio?.sections);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !bio) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-background text-center px-6">
        <h1 className="text-xl font-semibold text-foreground">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground">Este link de bio não existe ou foi desativado.</p>
      </div>
    );
  }

  const avatarPx = AVATAR_SIZE_PX[theme.avatarSize] ?? AVATAR_SIZE_PX.md;

  return (
    <div
      className="min-h-screen w-full flex justify-center px-5 py-12"
      style={{
        background: `linear-gradient(160deg, ${theme.bgColor}, ${theme.bgColorEnd})`,
        color: theme.textColor,
      }}
    >
      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {theme.avatarShape !== 'hidden' && bio.logo_url && (
          <img
            src={bio.logo_url}
            alt={bio.title || 'Logo'}
            style={{
              width: avatarPx,
              height: avatarPx,
              borderRadius: AVATAR_RADIUS[theme.avatarShape],
              objectFit: 'cover',
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              border: theme.avatarRing ? `3px solid ${theme.accentColor}` : 'none',
            }}
          />
        )}

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: theme.textColor }}>
            {bio.title || bio.slug}
          </h1>
          {bio.description && (
            <p className="text-sm leading-relaxed" style={{ color: theme.mutedColor }}>
              {bio.description}
            </p>
          )}
        </div>

        <div className="w-full">
          <BioButtonList buttons={buttons} theme={theme} />
        </div>

        <footer className="pt-4 text-[11px]" style={{ color: theme.mutedColor }}>
          feito por Pulse Growth Marketing
        </footer>
      </div>
    </div>
  );
}

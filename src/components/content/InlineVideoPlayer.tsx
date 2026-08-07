import { useMemo, useState } from 'react';
import { PlayCircle, ExternalLink, AlertCircle } from 'lucide-react';

export interface InlineVideoPlayerProps {
  /** Link do vídeo editado (mp4 direto, Google Drive, YouTube, Vimeo...) */
  url: string;
  className?: string;
}

type Kind = 'file' | 'embed' | 'external';

interface Resolved {
  kind: Kind;
  src: string;
}

/**
 * Resolve o link em algo reproduzível.
 * - Arquivos diretos (mp4/webm/mov) -> <video>
 * - Google Drive / YouTube / Vimeo -> <iframe> com URL de preview
 * - Qualquer outro -> apenas link externo
 */
function resolveUrl(rawUrl: string): Resolved {
  const url = rawUrl.trim();

  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) {
    return { kind: 'file', src: url };
  }

  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]{10,})/);
  if (drive?.[1]) {
    return { kind: 'embed', src: `https://drive.google.com/file/d/${drive[1]}/preview` };
  }

  const youtube = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (youtube?.[1]) {
    return { kind: 'embed', src: `https://www.youtube.com/embed/${youtube[1]}` };
  }

  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo?.[1]) {
    return { kind: 'embed', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  }

  return { kind: 'external', src: url };
}

export default function InlineVideoPlayer({ url, className }: InlineVideoPlayerProps) {
  const [failed, setFailed] = useState(false);
  const resolved = useMemo(() => resolveUrl(url), [url]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <PlayCircle size={13} className="text-primary" />
          </div>
          Prévia do Vídeo
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
        >
          Abrir <ExternalLink size={11} />
        </a>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black/90 aspect-video">
        {resolved.kind === 'file' && !failed && (
          <video
            key={resolved.src}
            src={resolved.src}
            controls
            playsInline
            preload="metadata"
            controlsList="nodownload"
            className="w-full h-full object-contain bg-black"
            onError={() => setFailed(true)}
          />
        )}

        {resolved.kind === 'embed' && !failed && (
          <iframe
            key={resolved.src}
            src={resolved.src}
            title="Prévia do vídeo"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        )}

        {(resolved.kind === 'external' || failed) && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4 hover:bg-muted/10 transition-colors"
          >
            <AlertCircle size={22} className="text-amber-400" />
            <span className="text-xs font-medium text-foreground">
              {failed ? 'Não foi possível reproduzir aqui' : 'Este link não permite prévia'}
            </span>
            <span className="text-[11px] text-muted-foreground underline">Abrir vídeo em nova aba</span>
          </a>
        )}
      </div>
    </div>
  );
}

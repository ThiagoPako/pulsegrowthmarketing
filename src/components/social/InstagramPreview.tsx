import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark, Link2, ChevronUp } from 'lucide-react';
import type { PostMediaItem, SocialPublishType } from '@/services/socialPostsApi';

const IS_VIDEO = /\.(mp4|mov|webm|m4v)(\?|$)/i;

export interface InstagramPreviewProps {
  accountName: string;
  publishType: SocialPublishType;
  items: PostMediaItem[];
  caption: string;
  storyLink?: string;
  storyLinkText?: string;
  className?: string;
}

/** Prévia visual de como o post aparece no Instagram (feed, carrossel, reels ou story). */
export function InstagramPreview({
  accountName, publishType, items, caption, storyLink, storyLinkText, className,
}: InstagramPreviewProps) {
  const [index, setIndex] = useState(0);
  const media = items.filter(i => i.url.trim());
  useEffect(() => { if (index > media.length - 1) setIndex(0); }, [media.length, index]);

  const current = media[index];
  const isStory = publishType === 'stories';
  const aspect = isStory || publishType === 'reels' ? 'aspect-[9/16]' : 'aspect-square';

  const renderMedia = (item?: PostMediaItem) => {
    if (!item) {
      return (
        <div className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground text-xs px-4 text-center">
          Cole o link da mídia para ver a prévia
        </div>
      );
    }
    if (IS_VIDEO.test(item.url)) {
      return <video src={item.url} className="absolute inset-0 h-full w-full object-cover" muted loop playsInline controls />;
    }
    return <img src={item.url} alt={item.label || 'Prévia da publicação'} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />;
  };

  return (
    <div className={cn('mx-auto w-full max-w-[340px] rounded-2xl border border-border bg-card shadow-sm overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-accent" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">{accountName || 'perfil_do_cliente'}</p>
          <p className="text-[10px] text-muted-foreground">
            {publishType === 'carousel' ? 'Carrossel' : publishType === 'reels' ? 'Reels' : isStory ? 'Story' : 'Publicação'}
          </p>
        </div>
      </div>

      <div className={cn('relative w-full bg-muted', aspect)}>
        {renderMedia(current)}

        {publishType === 'carousel' && media.length > 1 && (
          <>
            <span className="absolute top-2 right-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] font-medium text-background">
              {index + 1}/{media.length}
            </span>
            <button
              type="button"
              aria-label="Mídia anterior"
              onClick={() => setIndex(i => (i - 1 + media.length) % media.length)}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full bg-background/80 text-foreground hover:bg-background"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Próxima mídia"
              onClick={() => setIndex(i => (i + 1) % media.length)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full bg-background/80 text-foreground hover:bg-background"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {isStory && storyLink && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <ChevronUp size={16} className="text-background drop-shadow" />
            <span className="flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-[11px] font-medium text-foreground shadow">
              <Link2 size={12} />
              {storyLinkText || 'Saiba mais'}
            </span>
          </div>
        )}
      </div>

      {publishType === 'carousel' && media.length > 1 && (
        <div className="flex justify-center gap-1 py-2">
          {media.map((_, i) => (
            <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i === index ? 'bg-primary' : 'bg-muted-foreground/30')} />
          ))}
        </div>
      )}

      {!isStory && (
        <div className="px-3 pb-3 pt-2 space-y-2">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Heart size={18} /><MessageCircle size={18} /><Send size={18} />
            <Bookmark size={18} className="ml-auto" />
          </div>
          <p className="text-xs whitespace-pre-wrap break-words">
            <span className="font-semibold">{accountName || 'perfil_do_cliente'}</span>{' '}
            {caption || <span className="text-muted-foreground">Sem legenda…</span>}
          </p>
        </div>
      )}
    </div>
  );
}

export default InstagramPreview;

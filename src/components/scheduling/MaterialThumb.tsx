import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { isDirectVideo, type SchedulingItem } from '@/lib/postingSchedule';
import { TYPE_STYLES } from './schedulingStyles';

interface Props {
  item: Pick<SchedulingItem, 'thumb_url' | 'media_url' | 'media_kind' | 'type' | 'title'>;
  className?: string;
  /** Quadro do vídeo (só metadados, quando aparece na tela). Fica de fora nos itens pequenos do mês. */
  videoFrame?: boolean;
}

/** Miniatura leve: imagem pequena quando existe; vídeo só com metadados e só quando visível. */
export default function MaterialThumb({ item, className, videoFrame = false }: Props) {
  const style = TYPE_STYLES[item.type] || TYPE_STYLES.feed;
  const Icon = style.icon;
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const useVideo = videoFrame && !item.thumb_url && item.media_kind === 'video' && isDirectVideo(item.media_url);

  useEffect(() => { setFailed(false); }, [item.thumb_url, item.media_url]);

  useEffect(() => {
    if (!useVideo || visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [useVideo, visible]);

  const placeholder = (
    <div className={cn('flex h-full w-full items-center justify-center', style.soft, style.text)}>
      <Icon className="h-[45%] w-[45%] min-h-3 min-w-3" aria-hidden="true" />
    </div>
  );

  return (
    <div ref={ref} className={cn('relative shrink-0 overflow-hidden rounded-md bg-muted', className)}>
      {item.thumb_url && !failed ? (
        <img
          src={item.thumb_url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : useVideo && visible && !failed ? (
        <video
          src={`${item.media_url}#t=0.5`}
          preload="metadata"
          muted
          playsInline
          onError={() => setFailed(true)}
          className="pointer-events-none h-full w-full object-cover"
        />
      ) : (
        placeholder
      )}
    </div>
  );
}

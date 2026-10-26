import { forwardRef, useState, type VideoHTMLAttributes } from 'react';
import { usePlaybackUrl } from '@/hooks/usePlaybackUrl';

export type PlaybackVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & {
  /** URL original do vídeo (a gravada no banco). */
  src?: string | null;
  /** true: toca o original. */
  original?: boolean;
  /** Link do vídeo avulso (sem login): id do card. */
  avulsoTaskId?: string;
};

/**
 * <video> que toca a versão leve do vídeo quando ela existe (ver src/lib/playbackUrl.ts).
 * O arquivo é escolhido uma vez por vídeo e não troca no meio da reprodução.
 */
const PlaybackVideo = forwardRef<HTMLVideoElement, PlaybackVideoProps>(function PlaybackVideo(
  { src, original, avulsoTaskId, onError, ...rest },
  ref,
) {
  // versão leve que não abriu (ex.: apagada depois da escolha): volta para o original deste vídeo
  const [leveFalhou, setLeveFalhou] = useState<string | null>(null);
  const playback = usePlaybackUrl(src, { original: original || (!!src && leveFalhou === src), avulsoTaskId });
  return (
    <video
      ref={ref}
      {...rest}
      src={playback.src ?? undefined}
      data-playback={playback.variant ?? undefined}
      onError={(event) => {
        if (playback.variant === 'web' && src) setLeveFalhou(src);
        else onError?.(event);
      }}
    />
  );
});

export default PlaybackVideo;

import { useEffect, useState } from 'react';
import { peekPlayback, resolvePlayback, type Playback, type PlaybackVariant } from '@/lib/playbackUrl';

export interface PlaybackOptions {
  /** true: toca o original (ex.: escolha "Original" do usuário). */
  original?: boolean;
  /** Link do vídeo avulso: libera a versão leve só do vídeo daquele card. */
  avulsoTaskId?: string;
}

export interface PlaybackState {
  /** null enquanto decide (no máximo ~2,5 s) ou sem vídeo. */
  src: string | null;
  variant: PlaybackVariant | null;
  loading: boolean;
}

function decideNow(url: string | null | undefined, options: PlaybackOptions): Playback | null {
  if (!url) return null;
  if (options.original) return { url, variant: 'original' };
  return peekPlayback(url, { avulsoTaskId: options.avulsoTaskId });
}

/**
 * URL para assistir: a versão leve quando existe, senão o original. A escolha é fixada por vídeo:
 * depois de decidida, não muda enquanto o mesmo vídeo estiver na tela (trocar o arquivo no meio da
 * reprodução quebra o vídeo). Para baixar, use sempre a URL original.
 */
export function usePlaybackUrl(url: string | null | undefined, options: PlaybackOptions = {}): PlaybackState {
  const key = `${url || ''}|${options.original ? 'original' : 'leve'}|${options.avulsoTaskId || ''}`;
  const [pinned, setPinned] = useState<{ key: string; playback: Playback | null }>(() => ({
    key,
    playback: decideNow(url, options),
  }));

  let current = pinned;
  if (pinned.key !== key) {
    current = { key, playback: decideNow(url, options) };
    setPinned(current);
  }

  const needsAnswer = !!url && !current.playback;
  useEffect(() => {
    if (!needsAnswer || !url) return;
    let cancelled = false;
    resolvePlayback(url, { avulsoTaskId: options.avulsoTaskId }).then((playback) => {
      if (cancelled) return;
      setPinned((prev) => (prev.key === key && !prev.playback ? { key, playback } : prev));
    });
    return () => {
      cancelled = true;
    };
    // a chave já inclui url e opções
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needsAnswer]);

  return {
    src: current.playback?.url ?? null,
    variant: current.playback?.variant ?? null,
    loading: needsAnswer,
  };
}

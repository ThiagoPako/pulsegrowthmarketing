import { useEffect } from 'react';
import {
  subscribeOfficeChannel,
  unsubscribeOfficeChannel,
  trackPresence,
  untrackPresence,
} from '@/lib/virtualOfficeRealtime';

/**
 * Mantém a presença do usuário no canal compartilhado do escritório virtual.
 * Envia heartbeat a cada 10s para refletir online/offline ao vivo.
 */
export function usePresenceHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    subscribeOfficeChannel();
    void trackPresence(userId);

    const interval = window.setInterval(() => {
      void trackPresence(userId);
    }, 10_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void trackPresence(userId);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      void untrackPresence();
      unsubscribeOfficeChannel();
    };
  }, [userId]);
}

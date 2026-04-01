import { useEffect } from 'react';
import {
  subscribeOfficeChannel,
  unsubscribeOfficeChannel,
  trackPresence,
  untrackPresence,
} from '@/lib/virtualOfficeRealtime';

/**
 * Mantém a presença do usuário no canal compartilhado do escritório virtual.
 * Faz track imediato ao entrar e heartbeat curto para refletir online/offline ao vivo.
 */
export function usePresenceHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    let active = true;
    subscribeOfficeChannel();

    const sendHeartbeat = () => {
      if (!active) return;
      void trackPresence(userId);
    };

    sendHeartbeat();

    const interval = window.setInterval(sendHeartbeat, 5_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };

    const onOnline = () => sendHeartbeat();
    const onPageHide = () => {
      void untrackPresence();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      void untrackPresence();
      unsubscribeOfficeChannel();
    };
  }, [userId]);
}

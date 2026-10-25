import { useEffect } from 'react';
import { subscribeOfficeChannel, trackPresence, untrackPresence, sendLeaveBeacon } from '@/lib/virtualOfficeRealtime';

export function usePresenceHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    let active = true;

    subscribeOfficeChannel();

    // O servidor considera online quem deu sinal nos últimos 120 s: sinal a cada
    // 30 s com a aba visível e a cada 60 s com ela escondida (antes era a cada 5 s
    // sempre, e cada sinal reenviava a lista inteira para todos).
    let lastBeatAt = 0;
    const beat = () => {
      if (!active) return;
      lastBeatAt = Date.now();
      void trackPresence(userId);
    };
    beat();

    const iv = window.setInterval(() => {
      if (document.visibilityState === 'hidden' && Date.now() - lastBeatAt < 55_000) return;
      beat();
    }, 30_000);

    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    const onOn = () => beat();
    const onFocus = () => beat();

    // Send leave signal on tab/browser close via sendBeacon (reliable)
    const onBeforeUnload = () => {
      sendLeaveBeacon(userId);
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOn);
    window.addEventListener('focus', onFocus);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      active = false;
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOn);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', onBeforeUnload);
      sendLeaveBeacon(userId);
      void untrackPresence();
    };
  }, [userId]);
}

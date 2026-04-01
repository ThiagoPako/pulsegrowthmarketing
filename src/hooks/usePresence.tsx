import { useEffect } from 'react';
import { subscribeOfficeChannel, trackPresence, untrackPresence } from '@/lib/virtualOfficeRealtime';

export function usePresenceHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    let active = true;

    subscribeOfficeChannel();

    const beat = () => { if (active) void trackPresence(userId); };
    beat();

    const iv = window.setInterval(beat, 5_000);

    const onVis = () => { if (document.visibilityState === 'visible') beat(); };
    const onOn = () => beat();
    const onFocus = () => beat();

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOn);
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOn);
      window.removeEventListener('focus', onFocus);
      void untrackPresence();
    };
  }, [userId]);
}

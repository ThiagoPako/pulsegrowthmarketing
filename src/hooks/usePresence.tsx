import { useEffect } from 'react';
import { supabase as supabaseReal } from '@/integrations/supabase/client';
import { createVirtualOfficeChannel } from '@/lib/virtualOfficeRealtime';

/**
 * Presença em canal realtime compartilhado para refletir online/offline ao vivo.
 */
export function usePresenceHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    const channel = createVirtualOfficeChannel(userId);

    const track = async () => {
      try {
        await channel.track({
          userId,
          heartbeatAt: new Date().toISOString(),
        });
      } catch {
        // ignore
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void track();
    };

    const onFocus = () => {
      void track();
    };

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') void track();
    });

    const interval = window.setInterval(() => {
      void track();
    }, 10_000);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      void channel.untrack();
      void supabaseReal.removeChannel(channel);
    };
  }, [userId]);
}

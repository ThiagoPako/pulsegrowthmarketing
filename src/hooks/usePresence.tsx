import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Updates `last_seen_at` on the profiles table every 60s
 * so other users can see who's online.
 */
export function usePresenceHeartbeat(userId: string | undefined) {
  const ping = useCallback(async () => {
    if (!userId) return;
    await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() } as any).eq('id', userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    ping(); // immediate
    const interval = setInterval(ping, 60_000);
    return () => clearInterval(interval);
  }, [userId, ping]);
}

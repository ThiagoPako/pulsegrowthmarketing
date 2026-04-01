import { useEffect, useCallback } from 'react';
import { supabase as supabaseReal } from '@/integrations/supabase/client';

/**
 * Updates `last_seen_at` on the profiles table every 15s
 * so other users can see who's online in real-time.
 * Uses Supabase Cloud only (VPS profiles table lacks last_seen_at column).
 */
export function usePresenceHeartbeat(userId: string | undefined) {
  const ping = useCallback(async () => {
    if (!userId) return;
    try {
      await supabaseReal.from('profiles').update({ last_seen_at: new Date().toISOString() } as any).eq('id', userId);
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    ping(); // immediate
    const interval = setInterval(ping, 15_000); // every 15s
    return () => clearInterval(interval);
  }, [userId, ping]);
}

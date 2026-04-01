import { useEffect, useCallback } from 'react';
import { supabase } from '@/lib/vpsDb';
import { supabase as supabaseReal } from '@/integrations/supabase/client';

/**
 * Updates `last_seen_at` on the profiles table every 30s
 * so other users can see who's online in real-time.
 */
export function usePresenceHeartbeat(userId: string | undefined) {
  const ping = useCallback(async () => {
    if (!userId) return;
    // Use VPS DB for the update (works with VPS JWT auth)
    await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
    // Also update via real Supabase for realtime triggers
    await supabaseReal.from('profiles').update({ last_seen_at: new Date().toISOString() } as any).eq('id', userId).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    ping(); // immediate
    const interval = setInterval(ping, 15_000); // every 15s for faster detection
    return () => clearInterval(interval);
  }, [userId, ping]);
}

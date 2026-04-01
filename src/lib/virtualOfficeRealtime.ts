import { supabase as supabaseReal } from '@/integrations/supabase/client';

export const VIRTUAL_OFFICE_CHANNEL = 'virtual-office-live';

export interface QuickMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  createdAt: string;
}

/**
 * Creates a channel for the virtual office.
 * Each caller gets its own channel instance with a unique key for presence tracking.
 * The channel name is always the same so all participants share the same presence pool.
 */
export function createVirtualOfficeChannel(presenceKey: string) {
  return supabaseReal.channel(VIRTUAL_OFFICE_CHANNEL + '-' + presenceKey, {
    config: {
      presence: { key: presenceKey },
    },
  });
}

/**
 * Creates a shared channel for viewing presence state and receiving broadcasts.
 * Uses a unique suffix to avoid collision with the heartbeat channels.
 */
export function createVirtualOfficeViewerChannel(viewerKey: string) {
  return supabaseReal.channel('vo-viewer-' + viewerKey, {
    config: {
      presence: { key: viewerKey },
      broadcast: { self: false, ack: true },
    },
  });
}

export function getConversationKey(userA: string, userB: string) {
  return [userA, userB].sort().join(':');
}

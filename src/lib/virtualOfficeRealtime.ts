import { supabase as supabaseReal } from '@/integrations/supabase/client';

export interface QuickMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  createdAt: string;
}

/**
 * A single shared Realtime channel for the entire virtual office.
 * Both the heartbeat (usePresence) and the viewer (VirtualOffice) subscribe
 * to this same channel instance so presence state is unified.
 */
let sharedChannel: ReturnType<typeof supabaseReal.channel> | null = null;
let subscriberCount = 0;

export function getSharedOfficeChannel() {
  if (!sharedChannel) {
    sharedChannel = supabaseReal.channel('vo-shared', {
      config: {
        presence: { key: '' }, // will be overridden per-track call
        broadcast: { self: false, ack: true },
      },
    });
  }
  subscriberCount++;
  return sharedChannel;
}

export function releaseSharedOfficeChannel() {
  subscriberCount--;
  if (subscriberCount <= 0 && sharedChannel) {
    void supabaseReal.removeChannel(sharedChannel);
    sharedChannel = null;
    subscriberCount = 0;
  }
}

export function getConversationKey(userA: string, userB: string) {
  return [userA, userB].sort().join(':');
}

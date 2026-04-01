import { supabase as supabaseReal } from '@/integrations/supabase/client';

export const VIRTUAL_OFFICE_CHANNEL = 'virtual-office-live';

export interface QuickMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  createdAt: string;
}

export function createVirtualOfficeChannel(key: string) {
  return supabaseReal.channel(VIRTUAL_OFFICE_CHANNEL, {
    config: {
      presence: { key },
      broadcast: { self: false, ack: true },
    },
  });
}

export function getConversationKey(userA: string, userB: string) {
  return [userA, userB].sort().join(':');
}

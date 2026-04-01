import type { UserRole } from '@/types';

export interface OfficeMember {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  isOnline: boolean;
  activity?: string; // gravando | edicao | revisao | alteracao | aprovacao | designing | idle
}

export type RoomId =
  | 'studio'
  | 'editing'
  | 'atelier'
  | 'social'
  | 'admin'
  | 'coffee'
  | 'endomarketing'
  | 'photo';

export interface RoomConfig {
  id: RoomId;
  label: string;
  emoji: string;
  bgClass: string;
  roles: UserRole[];
}

export const ROOMS: RoomConfig[] = [
  { id: 'admin', label: 'Administração', emoji: '🏛️', bgClass: 'from-slate-900/20 to-slate-800/10', roles: ['admin'] },
  { id: 'studio', label: 'Estúdio', emoji: '🎬', bgClass: 'from-red-900/15 to-orange-900/10', roles: ['videomaker'] },
  { id: 'editing', label: 'Sala de Edição', emoji: '🖥️', bgClass: 'from-blue-900/15 to-indigo-900/10', roles: ['editor'] },
  { id: 'atelier', label: 'Ateliê Criativo', emoji: '🎨', bgClass: 'from-pink-900/15 to-purple-900/10', roles: ['designer'] },
  { id: 'social', label: 'Mídia Social', emoji: '📱', bgClass: 'from-green-900/15 to-teal-900/10', roles: ['social_media'] },
  { id: 'photo', label: 'Estúdio Foto', emoji: '📷', bgClass: 'from-amber-900/15 to-yellow-900/10', roles: ['fotografo'] },
  { id: 'endomarketing', label: 'Endomarketing', emoji: '📣', bgClass: 'from-cyan-900/15 to-sky-900/10', roles: ['endomarketing', 'parceiro'] },
  { id: 'coffee', label: 'Cantinho do Café ☕', emoji: '☕', bgClass: 'from-amber-800/15 to-orange-700/10', roles: [] },
];

/** Activities that indicate the person is idle / paused */
export const IDLE_ACTIVITIES = ['idle', 'paused'];

export function shouldBeInCoffeeRoom(member: OfficeMember): boolean {
  if (!member.isOnline) return false;
  // Social media is always "working" when online
  if (member.role === 'social_media') return false;
  // If no activity or explicitly idle/paused
  return !member.activity || IDLE_ACTIVITIES.includes(member.activity);
}

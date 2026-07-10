import type { UserRole } from '@/types';

export interface OfficeMember {
  id: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  isOnline: boolean;
  activity?: string;
  gender?: 'male' | 'female';
}

export type RoomId = 'admin' | 'studio' | 'editing' | 'atelier' | 'social' | 'coffee' | 'endomarketing' | 'photo' | 'projetos' | 'copy';

export interface RoomConfig {
  id: RoomId;
  label: string;
  emoji: string;
  floorColor: string;
  wallColor: string;
  roles: UserRole[];
}

export const ROOMS: RoomConfig[] = [
  { id: 'admin', label: 'Administração', emoji: '🏛️', floorColor: '#2a2a2e', wallColor: '#1a1a1e', roles: ['admin'] },
  { id: 'projetos', label: 'Gestão de Projetos', emoji: '💼', floorColor: '#c8a2c8', wallColor: '#7a4a7a', roles: ['gestor_projetos'] },
  { id: 'copy', label: 'Sala de Copy', emoji: '✍️', floorColor: '#b8a888', wallColor: '#6a5540', roles: ['copywriter'] },
  { id: 'studio', label: 'Estúdio', emoji: '🎬', floorColor: '#8b7355', wallColor: '#6b4423', roles: ['videomaker'] },
  { id: 'editing', label: 'Sala de Edição', emoji: '🖥️', floorColor: '#3d4f6a', wallColor: '#2a3a52', roles: ['editor'] },
  { id: 'atelier', label: 'Ateliê Criativo', emoji: '🎨', floorColor: '#7a5c8a', wallColor: '#5a3c6a', roles: ['designer'] },
  { id: 'social', label: 'Mídia Social', emoji: '📱', floorColor: '#4a7a5a', wallColor: '#2a5a3a', roles: ['social_media'] },
  { id: 'photo', label: 'Estúdio Foto', emoji: '📷', floorColor: '#8a7a55', wallColor: '#6a5a35', roles: ['fotografo'] },
  { id: 'endomarketing', label: 'Endomarketing', emoji: '📣', floorColor: '#5a7a8a', wallColor: '#3a5a6a', roles: ['endomarketing', 'parceiro'] },
  { id: 'coffee', label: 'Cantinho do Café', emoji: '☕', floorColor: '#a08060', wallColor: '#806040', roles: [] },
];

/** Admin, Social Media e Gestor de Projetos (quando marcou trabalhando) são SEMPRE trabalhando quando online. */
export function shouldBeInCoffeeRoom(m: OfficeMember): boolean {
  if (!m.isOnline) return false;
  if (m.role === 'admin' || m.role === 'social_media') return false;
  if (m.role === 'gestor_projetos' && m.activity === 'gestao') return false;
  return !m.activity || m.activity === 'idle' || m.activity === 'paused';
}

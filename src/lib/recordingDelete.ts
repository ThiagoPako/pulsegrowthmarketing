import { toast } from 'sonner';
import type { Recording, User } from '@/types';

/** Gravação já realizada: o servidor só deixa admin apagar, e de forma explícita (force). */
export function isRecordingAlreadyDone(rec: Pick<Recording, 'status'>): boolean {
  return rec.status === 'concluida' || rec.status === 'organizando_material';
}

/** Mesmo critério do isAdminUser do servidor: admin ou social_media. */
export function canForceDeleteRecording(user: Pick<User, 'role' | 'roles'> | null | undefined): boolean {
  if (!user) return false;
  const roles = [user.role, ...(user.roles || [])];
  return roles.includes('admin') || roles.includes('social_media');
}

/**
 * Pergunta antes de apagar uma gravação. Devolve null quando o usuário desistiu (ou não pode apagar)
 * e { force } com o modo de exclusão que vai para o servidor.
 */
export function confirmRecordingDelete(
  rec: Pick<Recording, 'status' | 'startTime'>,
  label: string,
  user: Pick<User, 'role' | 'roles'> | null | undefined,
): { force: boolean } | null {
  if (isRecordingAlreadyDone(rec)) {
    if (!canForceDeleteRecording(user)) {
      toast.error('Esta gravação já foi realizada e não pode ser apagada. Use Cancelar ou peça a um admin.');
      return null;
    }
    const confirmed = window.confirm(
      `A gravação de ${label} às ${rec.startTime} já foi realizada.\n\n` +
      'Apagar remove o registro de entrega dela. Os vídeos continuam no Kanban, só perdem o vínculo com a gravação.\n\n' +
      'Apagar mesmo assim? Esta ação não pode ser desfeita.'
    );
    return confirmed ? { force: true } : null;
  }
  const confirmed = window.confirm(
    `Tem certeza que deseja APAGAR permanentemente a gravação de ${label} às ${rec.startTime}?\n\n` +
    'Roteiros que estavam em captação voltam para Ideias. Esta ação não pode ser desfeita.'
  );
  return confirmed ? { force: false } : null;
}

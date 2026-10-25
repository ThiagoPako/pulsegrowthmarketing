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

/** Resultado do DELETE com o motivo da recusa, para a tela mostrar a mensagem do servidor. */
export interface RecordingDeleteResult {
  ok: boolean;
  /** Mensagem do servidor (só recusas 4xx; erro de rede ou 500 fica sem texto) */
  error?: string;
  /** O servidor recusou porque a gravação já foi realizada (entrega ou vídeos em produção) */
  alreadyRecorded?: boolean;
}

function confirmAlreadyRecordedDelete(label: string, startTime: string): boolean {
  return window.confirm(
    `A gravação de ${label} às ${startTime} já foi realizada.\n\n` +
    'Apagar remove o registro de entrega dela. Os vídeos continuam no Kanban, só perdem o vínculo com a gravação.\n\n' +
    'Apagar mesmo assim? Esta ação não pode ser desfeita.'
  );
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
    return confirmAlreadyRecordedDelete(label, rec.startTime) ? { force: true } : null;
  }
  const confirmed = window.confirm(
    `Tem certeza que deseja APAGAR permanentemente a gravação de ${label} às ${rec.startTime}?\n\n` +
    'Roteiros que estavam em captação voltam para Ideias. Esta ação não pode ser desfeita.'
  );
  return confirmed ? { force: false } : null;
}

/**
 * Pergunta e apaga. O servidor também considera realizada a gravação 'agendada' que tem entrega ou
 * vídeos já em produção (ex.: depois do 'Resetar para Agendada'); nesse caso responde 409 e, para
 * admin/social media, a pergunta de 'já realizada' é feita e o DELETE é repetido com force.
 * Devolve null quando o usuário desistiu.
 */
export async function deleteRecordingWithConfirm(
  rec: Pick<Recording, 'id' | 'status' | 'startTime'>,
  label: string,
  user: Pick<User, 'role' | 'roles'> | null | undefined,
  tryDelete: (id: string, options: { force: boolean }) => Promise<RecordingDeleteResult>,
): Promise<RecordingDeleteResult | null> {
  const decision = confirmRecordingDelete(rec, label, user);
  if (!decision) return null;
  const result = await tryDelete(rec.id, decision);
  if (result.ok || !result.alreadyRecorded || decision.force || !canForceDeleteRecording(user)) return result;
  if (!confirmAlreadyRecordedDelete(label, rec.startTime)) return null;
  return tryDelete(rec.id, { force: true });
}

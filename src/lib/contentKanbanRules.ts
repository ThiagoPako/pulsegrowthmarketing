import { profileHasRole, type Profile } from '@/hooks/useAuth';

/**
 * Regras de quem move o quê no fluxo de vídeo (decisões do dono, 26/10/2026). Valem nos Kanbans,
 * nos detalhes do card e no Controle de Edição; o servidor também recusa o envio ao cliente de quem
 * não é da gestão (/api/db/query) e a API dos agentes exige os brutos para entrar em Edição.
 */

/** Gestão: move qualquer card e manda para "Enviado p/ Cliente". */
export const CONTENT_MANAGER_ROLES = ['admin', 'social_media', 'gestor_projetos'] as const;

export function isContentManager(profile: Profile | null | undefined): boolean {
  return profileHasRole(profile, ...CONTENT_MANAGER_ROLES);
}

/** Liberar da Análise para a revisão humana ou devolver para Alteração (além da chefe IA pela API). */
export function canReleaseAnalysis(profile: Profile | null | undefined): boolean {
  return profileHasRole(profile, 'admin', 'social_media');
}

export const SEND_TO_CLIENT_FORBIDDEN_MSG = 'Só a gestão (admin, social media ou gestor de projetos) manda o vídeo para "Enviado p/ Cliente".';
export const ANALYSIS_FORBIDDEN_MSG = 'Liberar ou devolver da Análise é do admin e da social media (ou da chefe).';
export const EDITING_NEEDS_FOOTAGE_MSG = 'O card precisa do link dos brutos (Drive) para entrar em Edição.';

/** Para entrar em Edição só o link dos brutos é obrigatório (responsável não): o card entra livre na fila. */
export function missingFootageForEditing(task: { drive_link?: string | null }): boolean {
  return !task.drive_link?.trim();
}

/**
 * Controle de Edição: a gestão tira e reatribui card de qualquer um. Os outros mexem só nos próprios
 * cards (devolver à fila ou ficar com eles) e podem pegar da fila um card livre para si.
 * Devolve a mensagem de recusa ou null quando pode.
 */
export function editingControlMoveError(opts: {
  isManager: boolean;
  /** O card é de quem está movendo (editou ou está com ele). */
  ownsCard: boolean;
  /** O card está livre na fila. */
  cardIsFree: boolean;
  /** Destino: a fila ('__queue__') ou o id de um editor. */
  target: string;
  /** O destino é o próprio usuário. */
  targetIsSelf: boolean;
}): string | null {
  if (opts.isManager) return null;
  if (!opts.ownsCard && !opts.cardIsFree) return 'Card de outro editor: só a gestão tira ou reatribui.';
  if (opts.target !== '__queue__' && !opts.targetIsSelf) return 'Passar card para outro editor é com a gestão.';
  return null;
}

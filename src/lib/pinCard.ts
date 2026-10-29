/**
 * "Fixar" nos cards de edição de vídeo (Kanban de Conteúdo e Kanban Edição): reserva o card para a
 * equipe presencial. A fila dos agentes de IA ignora card com `pinned_at` e o `pulse pegar` recusa
 * (vps-api-server/agentRoutes.mjs). Fixar um card que está com um agente tira o card dele.
 */
export const PINNABLE_COLUMNS: readonly string[] = ['edicao', 'alteracao'];

interface PinnableTask {
  kanban_column: string;
  assigned_to?: string | null;
  pinned_at?: string | null;
}

/** Campos do update que fixa ou desfixa o card. */
export function pinToggleUpdate(task: PinnableTask, userId: string, agentIds: ReadonlySet<string>): Record<string, string | null> {
  const now = new Date().toISOString();
  if (task.pinned_at) return { pinned_at: null, pinned_by: null, updated_at: now };
  const update: Record<string, string | null> = { pinned_at: now, pinned_by: userId, updated_at: now };
  if (task.assigned_to && agentIds.has(task.assigned_to)) {
    update.assigned_to = null;
    update.editing_started_at = null;
    // em alteração o card segue do editor original (edited_by)
    if (task.kanban_column !== 'alteracao') update.edited_by = null;
  }
  return update;
}

export function pinToggleMessage(pinning: boolean, pulsePlus: boolean): string {
  if (!pinning) return 'Card desfixado.';
  return pulsePlus
    ? '📌 Card fixado para a equipe presencial. A IA não pega até desfixar.'
    : '📌 Card fixado para a equipe presencial.';
}

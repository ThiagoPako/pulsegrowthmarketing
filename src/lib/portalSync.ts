import { portalAction } from '@/lib/portalApi';

/**
 * Sync portal actions back to the internal system.
 * Routes through VPS portal-actions endpoint (sessão do portal ou JWT da equipe).
 */

// Aprovação e ajuste: o próprio approve/request_adjustment do servidor já move o
// content_tasks e avisa a equipe (não há mais sync_approval/sync_adjustment aqui).

/** When a comment is posted in the portal, notify the team */
export async function syncPortalComment(clientId: string, contentTitle: string, authorName: string, authorType: string, message: string) {
  await portalAction({
    action: 'sync_comment',
    client_id: clientId,
    content_title: contentTitle,
    author_name: authorName,
    author_type: authorType,
    message,
  });
}

/** When client changes script priority in Zona Criativa, notify team */
export async function syncPortalScriptPriority(clientId: string, scriptTitle: string, newPriority: string, clientName: string) {
  if (newPriority === 'normal') return;
  await portalAction({
    action: 'sync_script_priority',
    client_id: clientId,
    script_title: scriptTitle,
    new_priority: newPriority,
    client_name: clientName,
  });
}

/** When client edits a script in Zona Criativa, notify team */
export async function syncPortalScriptEdit(clientId: string, scriptId: string, clientName: string) {
  await portalAction({
    action: 'sync_script_edit',
    client_id: clientId,
    script_id: scriptId,
    client_name: clientName,
  });
}

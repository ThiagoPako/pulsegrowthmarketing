import { portalAction } from '@/lib/portalApi';

/**
 * Sync portal actions back to the internal system.
 * Routes through VPS portal-actions endpoint (no JWT required).
 */

/** When content is approved in the portal, sync to content_tasks kanban */
export async function syncPortalApproval(contentId: string, clientId: string, contentTitle: string) {
  await portalAction({
    action: 'sync_approval',
    content_id: contentId,
    client_id: clientId,
    content_title: contentTitle,
  });
}

/** When adjustment is requested in the portal, sync to content_tasks */
export async function syncPortalAdjustment(contentId: string, clientId: string, contentTitle: string, adjustmentNote: string) {
  await portalAction({
    action: 'sync_adjustment',
    content_id: contentId,
    client_id: clientId,
    content_title: contentTitle,
    adjustment_note: adjustmentNote,
  });
}

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

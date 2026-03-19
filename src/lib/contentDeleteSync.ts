import { supabase } from '@/lib/vpsDb';
import { deleteFileFromVps } from '@/services/vpsApi';

/**
 * Centralized cascading delete for content across all modules.
 * Ensures deleting from any module cleans up ALL related records:
 * task_history, social_media_deliveries, client_portal_contents,
 * client_portal_comments, client_portal_notifications,
 * delivery_records, active_recordings, recordings, VPS files.
 */

/** Helper: delete VPS file if URL points to agenciapulse.tech */
async function tryDeleteVpsFile(url: string | null | undefined) {
  if (!url?.includes('agenciapulse.tech')) return;
  try {
    const path = url.replace('https://agenciapulse.tech/uploads/', '');
    await deleteFileFromVps(path);
  } catch (err) {
    console.error('VPS file delete error:', err);
  }
}

/**
 * Delete a content_task and ALL related records across every module.
 */
export async function deleteContentTask(taskId: string) {
  const { data: task } = await supabase
    .from('content_tasks')
    .select('id, client_id, title, edited_video_link, recording_id, script_id')
    .eq('id', taskId)
    .single();

  if (!task) return;

  // 1. Delete task_history
  await supabase.from('task_history').delete().eq('task_id', taskId);

  // 2. Delete social_media_deliveries linked to this task
  await supabase.from('social_media_deliveries').delete().eq('content_task_id', taskId);

  // 3. Delete matching client_portal_contents + their comments/notifications
  const { data: portalContents } = await supabase
    .from('client_portal_contents')
    .select('id, file_url, thumbnail_url')
    .eq('client_id', task.client_id)
    .eq('title', task.title);

  if (portalContents?.length) {
    for (const pc of portalContents) {
      await supabase.from('client_portal_comments').delete().eq('content_id', pc.id);
      await supabase.from('client_portal_notifications').delete().eq('link_content_id', pc.id);
      await tryDeleteVpsFile(pc.file_url);
      await tryDeleteVpsFile(pc.thumbnail_url);
    }
    await supabase
      .from('client_portal_contents')
      .delete()
      .eq('client_id', task.client_id)
      .eq('title', task.title);
  }

  // 4. Delete VPS file for edited video
  await tryDeleteVpsFile(task.edited_video_link);

  // 5. Clean up recording if this was the only task using it
  if (task.recording_id) {
    // Check if other tasks share this recording
    const { count } = await supabase
      .from('content_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('recording_id', task.recording_id)
      .neq('id', taskId);

    if (count === 0) {
      // No other tasks use this recording — safe to delete
      await supabase.from('active_recordings').delete().eq('recording_id', task.recording_id);
      await supabase.from('delivery_records').delete().eq('recording_id', task.recording_id);
      await supabase.from('recordings').delete().eq('id', task.recording_id);
    }
  }

  // 6. Delete the content_task itself
  await supabase.from('content_tasks').delete().eq('id', taskId);
}

/**
 * Delete a social_media_delivery and clean up related content_task video link.
 * Does NOT delete the content_task itself (just unlinks).
 */
export async function deleteSocialDelivery(deliveryId: string) {
  const { data: delivery } = await supabase
    .from('social_media_deliveries')
    .select('id, content_task_id, client_id, title')
    .eq('id', deliveryId)
    .single();

  if (!delivery) return;

  await supabase.from('social_media_deliveries').delete().eq('id', deliveryId);
}

/**
 * Delete a client_portal_content and clean up all related records.
 */
export async function deletePortalContent(contentId: string) {
  const { data: content } = await supabase
    .from('client_portal_contents')
    .select('id, client_id, title, file_url, thumbnail_url')
    .eq('id', contentId)
    .single();

  if (!content) return;

  // 1. Delete related comments
  await supabase.from('client_portal_comments').delete().eq('content_id', contentId);

  // 2. Delete related portal notifications
  await supabase.from('client_portal_notifications').delete().eq('link_content_id', contentId);

  // 3. Delete VPS files
  await tryDeleteVpsFile(content.file_url);
  await tryDeleteVpsFile(content.thumbnail_url);

  // 4. Remove edited_video_link from matching content_task
  const { data: matchingTask } = await supabase
    .from('content_tasks')
    .select('id, edited_video_link')
    .eq('client_id', content.client_id)
    .eq('title', content.title)
    .limit(1);

  if (matchingTask?.[0]?.edited_video_link === content.file_url) {
    await supabase.from('content_tasks').update({
      edited_video_link: null,
      updated_at: new Date().toISOString(),
    } as any).eq('id', matchingTask[0].id);
  }

  // 5. Delete the portal content
  await supabase.from('client_portal_contents').delete().eq('id', contentId);
}

import { supabase } from '@/integrations/supabase/client';
import { deleteFileFromVps } from '@/services/vpsApi';

/**
 * Centralized cascading delete for content across all modules.
 * Ensures deleting from any module cleans up all related records.
 */

/**
 * Delete a content_task and all related records across modules.
 */
export async function deleteContentTask(taskId: string) {
  // 1. Get the task to find related data
  const { data: task } = await supabase
    .from('content_tasks')
    .select('id, client_id, title, edited_video_link')
    .eq('id', taskId)
    .single();

  if (!task) return;

  // 2. Delete from task_history
  await supabase.from('task_history').delete().eq('task_id', taskId);

  // 3. Delete from social_media_deliveries
  await supabase.from('social_media_deliveries').delete().eq('content_task_id', taskId);

  // 4. Delete matching client_portal_contents (by client_id + title)
  await supabase
    .from('client_portal_contents')
    .delete()
    .eq('client_id', task.client_id)
    .eq('title', task.title);

  // 5. Try to delete the VPS file if it's a VPS upload
  if (task.edited_video_link?.includes('agenciapulse.tech')) {
    try {
      const path = task.edited_video_link.replace('https://agenciapulse.tech/uploads/', '');
      await deleteFileFromVps(path);
    } catch (err) {
      console.error('VPS file delete error:', err);
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

  // Delete the delivery
  await supabase.from('social_media_deliveries').delete().eq('id', deliveryId);
}

/**
 * Delete a client_portal_content and clean up related records.
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

  // 3. Try to delete VPS files
  for (const url of [content.file_url, content.thumbnail_url]) {
    if (url?.includes('agenciapulse.tech')) {
      try {
        const path = url.replace('https://agenciapulse.tech/uploads/', '');
        await deleteFileFromVps(path);
      } catch (err) {
        console.error('VPS file delete error:', err);
      }
    }
  }

  // 4. Also remove edited_video_link from matching content_task
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

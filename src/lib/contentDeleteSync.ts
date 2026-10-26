import { supabase } from '@/lib/vpsDb';
import { deleteFileFromVps } from '@/services/vpsApi';
import { cancelLinkedScheduledPosts } from '@/services/socialPostsApi';

/**
 * Centralized cascading delete for content across all modules.
 * Deleting a card from any module cleans up the records that only exist for it:
 * task_history, social_media_deliveries, client_portal_contents (with comments and
 * notifications) and VPS files. A gravação (recordings, delivery_records, active_recordings)
 * NÃO é apagada: ela alimenta a agenda, os relatórios e as métricas do videomaker.
 */

/** Helper: delete VPS file if URL points to agenciapulse.tech (e não está em uso por outro card/portal) */
async function tryDeleteVpsFile(url: string | null | undefined) {
  if (!url?.includes('agenciapulse.tech')) return;
  try {
    // Outro card (ex.: duplicado) ainda usa o mesmo vídeo: mantém o arquivo
    const { data: otherTasks } = await supabase
      .from('content_tasks')
      .select('id')
      .eq('edited_video_link', url)
      .limit(1);
    if (otherTasks?.length) return;
    // keepIfReferenced: o servidor mantém o arquivo se ainda estiver publicado no portal
    await deleteFileFromVps(url, { keepIfReferenced: true });
  } catch (err) {
    console.error('VPS file delete error:', err);
  }
}

/**
 * Delete a content_task and ALL related records across every module.
 */
export async function deleteContentTask(taskId: string) {
  const { data: task, error: fetchError } = await supabase
    .from('content_tasks')
    .select('id, client_id, title, edited_video_link, recording_id, script_id')
    .eq('id', taskId)
    .single();

  if (fetchError) {
    console.error('[deleteContentTask] fetch error:', fetchError);
  }

  const clientId = task?.client_id;
  const title = task?.title;
  const editedVideoLink = task?.edited_video_link;

  // 1. Delete the content_task itself FIRST — verify a row was actually removed.
  // Antes o histórico, o Social Media, o portal e os arquivos eram apagados antes, e um card
  // de outra cidade (ou sem permissão) perdia tudo isso mesmo sem ser excluído.
  const { data: deleted, error: delError } = await supabase
    .from('content_tasks')
    .delete()
    .eq('id', taskId)
    .select('id');

  if (delError) {
    console.error('[deleteContentTask] delete error:', delError);
    throw new Error(delError.message || 'Falha ao excluir tarefa');
  }
  if (!deleted || (Array.isArray(deleted) && deleted.length === 0)) {
    throw new Error('Tarefa não encontrada ou sem permissão para excluir');
  }

  // Postagem automática pendente do card não pode sair depois da exclusão
  await cancelLinkedScheduledPosts({ contentTaskId: taskId, reason: 'o card de conteúdo foi excluído' });

  // 2. Delete task_history
  await supabase.from('task_history').delete().eq('task_id', taskId);

  // 3. Delete social_media_deliveries linked to this task
  await supabase.from('social_media_deliveries').delete().eq('content_task_id', taskId);

  // 4. Delete the client_portal_contents of this card + their comments/notifications.
  // Pelo vínculo (content_task_id). Conteúdo antigo, sem vínculo, casa pelo título — mas só se
  // nenhum outro card do cliente tiver o mesmo título (senão apagava o vídeo do outro card).
  if (clientId) {
    const portalContents: Array<{ id: string; file_url: string | null; thumbnail_url: string | null }> = [];
    const byLink = await supabase
      .from('client_portal_contents')
      .select('id, file_url, thumbnail_url')
      .eq('client_id', clientId)
      .eq('content_task_id', taskId);
    if (!byLink.error && byLink.data?.length) portalContents.push(...(byLink.data as any[]));

    if (title) {
      const { data: sameTitleTasks } = await supabase
        .from('content_tasks')
        .select('id')
        .eq('client_id', clientId)
        .eq('title', title)
        .limit(1);
      if (!sameTitleTasks?.length) {
        let legacy = supabase
          .from('client_portal_contents')
          .select('id, file_url, thumbnail_url')
          .eq('client_id', clientId)
          .eq('title', title);
        // Servidor sem a coluna nova: o filtro do vínculo dá erro e vale só o título (como antes)
        if (!byLink.error) legacy = legacy.is('content_task_id', null);
        const { data: legacyRows } = await legacy;
        if (legacyRows?.length) portalContents.push(...(legacyRows as any[]));
      }
    }

    for (const pc of portalContents) {
      await supabase.from('client_portal_comments').delete().eq('content_id', pc.id);
      await supabase.from('client_portal_notifications').delete().eq('link_content_id', pc.id);
      await supabase.from('client_portal_contents').delete().eq('id', pc.id);
      await tryDeleteVpsFile(pc.file_url);
      await tryDeleteVpsFile(pc.thumbnail_url);
    }
  }

  // 5. Delete VPS file for edited video
  await tryDeleteVpsFile(editedVideoLink);
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

  // Postagem automática pendente da entrega não pode sair depois da exclusão
  await cancelLinkedScheduledPosts({ deliveryId, reason: 'a entrega foi excluída do kanban social' });

  await supabase.from('social_media_deliveries').delete().eq('id', deliveryId);
}

/**
 * Delete a client_portal_content and clean up all related records.
 */
export async function deletePortalContent(contentId: string) {
  const { data: content } = await supabase
    .from('client_portal_contents')
    .select('*')
    .eq('id', contentId)
    .single();

  if (!content) return;

  // 1. Delete related comments
  await supabase.from('client_portal_comments').delete().eq('content_id', contentId);

  // 2. Delete related portal notifications
  await supabase.from('client_portal_notifications').delete().eq('link_content_id', contentId);

  // 3. Remove edited_video_link from the matching content_task (pelo vínculo; sem vínculo, pelo título)
  let matchingTaskQuery = supabase
    .from('content_tasks')
    .select('id, edited_video_link')
    .eq('client_id', content.client_id);
  matchingTaskQuery = content.content_task_id
    ? matchingTaskQuery.eq('id', content.content_task_id)
    : matchingTaskQuery.eq('title', content.title);
  const { data: matchingTask } = await matchingTaskQuery.limit(1);

  if (matchingTask?.[0]?.edited_video_link === content.file_url) {
    await supabase.from('content_tasks').update({
      edited_video_link: null,
      updated_at: new Date().toISOString(),
    } as any).eq('id', matchingTask[0].id);
  }

  // 4. Delete the portal content
  await supabase.from('client_portal_contents').delete().eq('id', contentId);

  // 5. Delete VPS files (depois de soltar o card e o portal: arquivo ainda usado por outro fica)
  await tryDeleteVpsFile(content.file_url);
  await tryDeleteVpsFile(content.thumbnail_url);
}

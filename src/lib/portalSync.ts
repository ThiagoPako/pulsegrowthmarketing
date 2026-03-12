import { supabase } from '@/integrations/supabase/client';

/**
 * Sync portal actions back to the internal system.
 * Called from ClientPortal when clients/team take actions.
 */

/** When content is approved in the portal, sync to content_tasks kanban */
export async function syncPortalApproval(contentId: string, clientId: string, contentTitle: string) {
  // Find matching content_task by title + client
  const { data: task } = await supabase
    .from('content_tasks')
    .select('id, assigned_to, script_id')
    .eq('client_id', clientId)
    .eq('title', contentTitle)
    .in('kanban_column', ['envio', 'revisao', 'agendamentos'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (task) {
    // Move task to agendamentos (approved)
    await supabase.from('content_tasks').update({
      kanban_column: 'agendamentos',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);

    // Log to task_history
    await supabase.from('task_history').insert({
      task_id: task.id,
      action: '✅ Aprovado pelo cliente via Pulse Club',
      details: null,
      user_id: null,
    });
  }

  // Notify social_media and admin
  await supabase.rpc('notify_role', {
    _role: 'social_media',
    _title: '✅ Conteúdo aprovado pelo cliente',
    _message: `"${contentTitle}" foi aprovado no Pulse Club`,
    _type: 'approval',
    _link: '/conteudo',
  });

  await supabase.rpc('notify_role', {
    _role: 'admin',
    _title: '✅ Conteúdo aprovado pelo cliente',
    _message: `"${contentTitle}" foi aprovado no Pulse Club`,
    _type: 'approval',
    _link: '/conteudo',
  });
}

/** When adjustment is requested in the portal, sync to content_tasks */
export async function syncPortalAdjustment(contentId: string, clientId: string, contentTitle: string, adjustmentNote: string) {
  // Find matching content_task
  const { data: task } = await supabase
    .from('content_tasks')
    .select('id, assigned_to')
    .eq('client_id', clientId)
    .eq('title', contentTitle)
    .in('kanban_column', ['envio', 'revisao', 'agendamentos'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (task) {
    // Move to alteracao column
    await supabase.from('content_tasks').update({
      kanban_column: 'alteracao',
      adjustment_notes: adjustmentNote,
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);

    // Log to task_history
    await supabase.from('task_history').insert({
      task_id: task.id,
      action: '🔧 Ajuste solicitado pelo cliente via Pulse Club',
      details: adjustmentNote,
      user_id: null,
    });

    // Notify assigned editor
    if (task.assigned_to) {
      await supabase.rpc('notify_user', {
        _user_id: task.assigned_to,
        _title: '🔧 Ajuste solicitado pelo cliente',
        _message: `"${contentTitle}" precisa de ajustes: ${adjustmentNote.substring(0, 80)}`,
        _type: 'adjustment',
        _link: '/edicao/kanban',
      });
    }
  }

  // Notify social_media
  await supabase.rpc('notify_role', {
    _role: 'social_media',
    _title: '🔧 Ajuste solicitado no Pulse Club',
    _message: `Cliente solicitou ajuste em "${contentTitle}": ${adjustmentNote.substring(0, 80)}`,
    _type: 'adjustment',
    _link: '/entregas-social',
  });

  await supabase.rpc('notify_role', {
    _role: 'admin',
    _title: '🔧 Ajuste solicitado no Pulse Club',
    _message: `Cliente solicitou ajuste em "${contentTitle}": ${adjustmentNote.substring(0, 80)}`,
    _type: 'adjustment',
    _link: '/entregas-social',
  });
}

/** When a comment is posted in the portal, notify the team */
export async function syncPortalComment(clientId: string, contentTitle: string, authorName: string, authorType: string, message: string) {
  // Only notify team when client comments (not when team comments)
  if (authorType === 'client') {
    await supabase.rpc('notify_role', {
      _role: 'social_media',
      _title: `💬 Comentário do cliente`,
      _message: `${authorName} comentou em "${contentTitle}": ${message.substring(0, 60)}`,
      _type: 'comment',
      _link: '/conteudos-portal',
    });

    await supabase.rpc('notify_role', {
      _role: 'admin',
      _title: `💬 Comentário do cliente`,
      _message: `${authorName} comentou em "${contentTitle}": ${message.substring(0, 60)}`,
      _type: 'comment',
      _link: '/conteudos-portal',
    });
  }

  // When team comments, create portal notification for client
  if (authorType === 'team') {
    await supabase.from('client_portal_notifications').insert({
      client_id: clientId,
      title: '💬 Nova mensagem da equipe',
      message: `${authorName} comentou em "${contentTitle}"`,
      type: 'comment',
    } as any);
  }
}

/** When client changes script priority in Zona Criativa, notify team */
export async function syncPortalScriptPriority(clientId: string, scriptTitle: string, newPriority: string, clientName: string) {
  if (newPriority === 'normal') return; // Don't notify on removal

  const emoji = newPriority === 'urgent' ? '🚨' : '⭐';
  const label = newPriority === 'urgent' ? 'URGENTE' : 'Prioridade';

  // Notify social_media, admin, and videomaker
  for (const role of ['social_media', 'admin'] as const) {
    await supabase.rpc('notify_role', {
      _role: role,
      _title: `${emoji} Roteiro marcado como ${label}`,
      _message: `${clientName} marcou "${scriptTitle}" como ${label} no Pulse Club`,
      _type: 'priority',
      _link: '/roteiros',
    });
  }

  // Also update the internal script priority to match
  const { data: script } = await supabase
    .from('scripts')
    .select('id')
    .eq('client_id', clientId)
    .eq('title', scriptTitle)
    .limit(1)
    .maybeSingle();

  if (script) {
    // Create a client portal notification-style entry for visibility
    await supabase.from('client_portal_notifications').insert({
      client_id: clientId,
      title: `${emoji} Roteiro ${label}`,
      message: `"${scriptTitle}" foi marcado como ${label}`,
      type: 'priority',
      link_script_id: script.id,
    } as any);
  }
}

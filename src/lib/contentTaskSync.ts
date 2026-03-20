import { supabase } from '@/lib/vpsDb';
import { format, addDays, getDay } from 'date-fns';
import { getWhatsAppConfig, sendWhatsAppMessage } from '@/services/whatsappService';

/**
 * Centralized sync logic for content_tasks column changes.
 * Every module (ContentKanban, EditorKanban, EditorTaskDetail, SocialMediaDeliveries)
 * should call this after moving a content_task to a new column.
 */

interface SyncContext {
  taskId: string;
  clientId: string;
  title: string;
  contentType: string;
  description: string | null;
  scriptId: string | null;
  recordingId: string | null;
  assignedTo: string | null;
  editedVideoLink: string | null;
  immediateAlteration?: boolean;
  approvedAt?: string | null;
  userId?: string | null;
  clientName?: string;
  clientWhatsapp?: string;
}

// Map kanban columns → social_media_deliveries statuses
const COLUMN_TO_SOCIAL_STATUS: Record<string, string> = {
  revisao: 'revisao',
  alteracao: 'ajuste',
  envio: 'aprovacao_cliente',
  agendamentos: 'entregue',
  acompanhamento: 'agendado',
};

// Map JS getDay() (0=Sun) to our DayOfWeek keys
const NUM_TO_DAYKEY: Record<number, string> = {
  0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado',
};

/**
 * Add hours to a date, but only count business days (Mon-Fri).
 * 48h = 2 business days, 24h = 1 business day, etc.
 * The result NEVER falls on a weekend or non-work day.
 */
function addBusinessHours(from: Date, hours: number, workDays: string[]): Date {
  const HOURS_PER_DAY = 24;
  let daysToAdd = Math.ceil(hours / HOURS_PER_DAY);
  let current = new Date(from);

  while (daysToAdd > 0) {
    current = addDays(current, 1);
    const dayKey = NUM_TO_DAYKEY[getDay(current)];
    if (workDays.includes(dayKey)) {
      daysToAdd--;
    }
  }

  // Preserve original time
  current.setHours(from.getHours(), from.getMinutes(), 0, 0);
  return current;
}

export async function syncContentTaskColumnChange(
  newColumn: string,
  ctx: SyncContext
) {
  const updates: Record<string, any> = {};

  // Fetch deadline settings + work_days
  const { data: settingsRow } = await supabase.from('company_settings').select('editing_deadline_hours, review_deadline_hours, alteration_deadline_hours, approval_deadline_hours, work_days').limit(1).single();
  const deadlineHours = {
    editing: settingsRow?.editing_deadline_hours ?? 48,
    review: settingsRow?.review_deadline_hours ?? 24,
    alteration: settingsRow?.alteration_deadline_hours ?? 24,
    approval: settingsRow?.approval_deadline_hours ?? 6,
  };
  const workDays: string[] = (settingsRow?.work_days as string[]) ?? ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

  // 1. Set editing_started_at and editing_deadline when entering edicao
  if (newColumn === 'edicao') {
    updates.editing_started_at = new Date().toISOString();
    const editingDeadline = addBusinessHours(new Date(), deadlineHours.editing, workDays);
    updates.editing_deadline = editingDeadline.toISOString();
    // Mark script as recorded
    if (ctx.scriptId) {
      await supabase.from('scripts').update({ recorded: true } as any).eq('id', ctx.scriptId);
    }

    // Send WhatsApp to client: video recorded, now in editing
    try {
      const whatsConfig = await getWhatsAppConfig();
      if (whatsConfig?.integrationActive && whatsConfig?.autoTaskEditing && ctx.clientWhatsapp) {
        const editingMsg = whatsConfig.msgTaskEditing
          .replace('{nome_cliente}', ctx.clientName || '')
          .replace('{titulo}', ctx.title);

        await sendWhatsAppMessage({
          number: ctx.clientWhatsapp,
          message: editingMsg,
          clientId: ctx.clientId,
          triggerType: 'auto_recording',
        });
      }
    } catch (err) {
      console.error('WhatsApp editing notification error:', err);
    }
  }

  // 2. Set deadlines based on column transitions (business hours only)
  if (newColumn === 'revisao') {
    const deadline = addBusinessHours(new Date(), deadlineHours.review, workDays);
    updates.review_deadline = deadline.toISOString();
    updates.approval_sent_at = new Date().toISOString();
  }
  if (newColumn === 'alteracao') {
    if (!ctx.immediateAlteration) {
      const deadline = addBusinessHours(new Date(), deadlineHours.alteration, workDays);
      updates.alteration_deadline = deadline.toISOString();
    }
  }
  if (newColumn === 'envio') {
    const deadline = addBusinessHours(new Date(), deadlineHours.approval, workDays);
    updates.approval_deadline = deadline.toISOString();
    updates.approval_sent_at = new Date().toISOString();
  }
  if (newColumn === 'agendamentos') {
    if (!ctx.approvedAt) {
      updates.approved_at = new Date().toISOString();
    }
  }

  // Apply additional field updates to content_tasks
  if (Object.keys(updates).length > 0) {
    await supabase.from('content_tasks').update({
      ...updates,
      updated_at: new Date().toISOString(),
    } as any).eq('id', ctx.taskId);
  }

  // 3. Sync social_media_deliveries
  const socialStatus = COLUMN_TO_SOCIAL_STATUS[newColumn];
  if (socialStatus) {
    const existing = await supabase.from('social_media_deliveries')
      .select('id').eq('content_task_id', ctx.taskId).limit(1);

    if (!existing.data?.length) {
      await supabase.from('social_media_deliveries').insert({
        client_id: ctx.clientId,
        content_type: ctx.contentType,
        title: ctx.title,
        description: ctx.description || null,
        status: socialStatus,
        delivered_at: format(new Date(), 'yyyy-MM-dd'),
        recording_id: ctx.recordingId || null,
        script_id: ctx.scriptId || null,
        created_by: ctx.userId || null,
        content_task_id: ctx.taskId,
      } as any);
    } else {
      await supabase.from('social_media_deliveries').update({
        status: socialStatus,
      } as any).eq('content_task_id', ctx.taskId);
    }
  }

  // If moving out of social-tracked columns (e.g. back to ideias/captacao/edicao), remove the social delivery link status
  // but keep the record for history

  // 4. Column-specific notifications & actions
  if (newColumn === 'revisao') {
    await supabase.rpc('notify_role', {
      _role: 'social_media',
      _title: 'Vídeo para Revisão',
      _message: `${ctx.title} (${ctx.clientName || ''}) está pronto para revisão`,
      _type: 'review',
      _link: '/entregas-social',
    });

    // Auto-upsert to client_portal_contents with 'revisao_interna' status
    // This makes the video visible to team in the portal but NOT to the client
    if (ctx.editedVideoLink) {
      const now = new Date();
      const { data: existing } = await supabase
        .from('client_portal_contents')
        .select('id')
        .eq('client_id', ctx.clientId)
        .eq('title', ctx.title)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing?.length) {
        await supabase.from('client_portal_contents').update({
          file_url: ctx.editedVideoLink,
          status: 'revisao_interna',
          updated_at: now.toISOString(),
        } as any).eq('id', existing[0].id);
      } else {
        await supabase.from('client_portal_contents').insert({
          client_id: ctx.clientId,
          title: ctx.title,
          content_type: ctx.contentType,
          file_url: ctx.editedVideoLink,
          status: 'revisao_interna',
          season_month: now.getMonth() + 1,
          season_year: now.getFullYear(),
          uploaded_by: ctx.userId || null,
        } as any);
      }
    }
  }

  if (newColumn === 'alteracao') {
    // Notify the assigned editor
    if (ctx.assignedTo) {
      const urgencyPrefix = ctx.immediateAlteration ? '🚨 IMEDIATO: ' : '';
      await supabase.rpc('notify_user', {
        _user_id: ctx.assignedTo,
        _title: `${urgencyPrefix}Ajuste solicitado`,
        _message: `\"${ctx.title}\" (${ctx.clientName || ''}) precisa de ajustes${ctx.immediateAlteration ? ' IMEDIATOS' : ''}`,
        _type: 'adjustment',
        _link: '/edicao/kanban',
      });
    }
  }

  if (newColumn === 'envio') {
    // Update portal content from revisao_interna → pendente (now visible to client)
    try {
      const { data: portalContentToPublish } = await supabase
        .from('client_portal_contents')
        .select('id')
        .eq('client_id', ctx.clientId)
        .eq('title', ctx.title)
        .eq('status', 'revisao_interna')
        .order('created_at', { ascending: false })
        .limit(1);

      if (portalContentToPublish?.length) {
        await supabase.from('client_portal_contents').update({
          status: 'pendente',
          updated_at: new Date().toISOString(),
        } as any).eq('id', portalContentToPublish[0].id);
      }
    } catch (err) {
      console.error('Portal content publish error:', err);
    }
    // Auto-send WhatsApp portal invite message
    try {
      const whatsConfig = await getWhatsAppConfig();
      if (whatsConfig?.integrationActive && whatsConfig?.autoVideoApproval && ctx.clientWhatsapp) {
        const portalUrl = `https://pulsegrowthmarketing.lovable.app/portal/${ctx.clientId}`;
        let msg = whatsConfig.msgVideoApproval
          .replace('{nome_cliente}', ctx.clientName || '')
          .replace('{link_video}', portalUrl)
          .replace('{titulo}', ctx.title);

        // If template still has the old drive link pattern, override with portal message
        if (!msg.includes('portal') && !msg.includes('Área do Cliente')) {
          msg = `Olá, ${ctx.clientName || ''}! 😊\n\nSeu conteúdo "${ctx.title}" ficou pronto! 🎬\n\n📱 Acesse a Área do Cliente Pulse para assistir e aprovar:\n${portalUrl}\n\nEquipe Pulse Growth Marketing 🚀`;
        }

        await sendWhatsAppMessage({
          number: ctx.clientWhatsapp,
          message: msg,
          clientId: ctx.clientId,
          triggerType: 'auto_confirmation',
        });
      }
    } catch (err) {
      console.error('WhatsApp auto-send error:', err);
    }

    // Create portal notification for the client
    try {
      // Find the matching portal content if it exists
      const { data: portalContent } = await supabase
        .from('client_portal_contents')
        .select('id')
        .eq('client_id', ctx.clientId)
        .eq('title', ctx.title)
        .order('created_at', { ascending: false })
        .limit(1);

      await supabase.from('client_portal_notifications').insert({
        client_id: ctx.clientId,
        title: '🎬 Novo vídeo para aprovação',
        message: `"${ctx.title}" está pronto para sua análise e aprovação.`,
        type: 'video_approval',
        link_content_id: portalContent?.[0]?.id || null,
      } as any);
    } catch (err) {
      console.error('Portal notification error:', err);
    }
  }

  // 5. Send portal notification for EVERY content movement (except envio, already handled above)
  const portalNotifMap: Record<string, { title: string; message: string; type: string }> = {
    edicao: {
      title: '✂️ Vídeo em edição',
      message: `"${ctx.title}" foi enviado para edição. Prazo previsto: 2 dias úteis.`,
      type: 'editing_started',
    },
    revisao: {
      title: '👁 Revisão interna',
      message: `"${ctx.title}" está em revisão interna de qualidade.`,
      type: 'internal_review',
    },
    alteracao: {
      title: '🔧 Ajuste em andamento',
      message: `"${ctx.title}" está recebendo ajustes solicitados.`,
      type: 'adjustment',
    },
    agendamentos: {
      title: '✅ Vídeo aprovado',
      message: `"${ctx.title}" foi aprovado e está sendo preparado para postagem.`,
      type: 'approved',
    },
    acompanhamento: {
      title: '📅 Vídeo agendado',
      message: `"${ctx.title}" foi agendado para postagem.`,
      type: 'scheduled',
    },
    arquivado: {
      title: '📦 Conteúdo concluído',
      message: `"${ctx.title}" foi finalizado e arquivado.`,
      type: 'completed',
    },
  };

  const portalNotif = portalNotifMap[newColumn];
  if (portalNotif && newColumn !== 'envio') {
    try {
      await supabase.from('client_portal_notifications').insert({
        client_id: ctx.clientId,
        title: portalNotif.title,
        message: portalNotif.message,
        type: portalNotif.type,
      } as any);
    } catch (err) {
      console.error('Portal movement notification error:', err);
    }
  }

  // 6. Log to task_history
  const actionMap: Record<string, string> = {
    ideias: 'Movido para Zona de Ideias',
    captacao: 'Movido para Captação',
    edicao: 'Movido para Edição',
    revisao: 'Enviado para Revisão',
    alteracao: 'Solicitado Alteração',
    envio: 'Enviado para Cliente',
    agendamentos: 'Movido para Agendamentos',
    acompanhamento: 'Agendado para Postagem',
    arquivado: 'Arquivado',
  };

  await supabase.from('task_history').insert({
    task_id: ctx.taskId,
    user_id: ctx.userId || null,
    action: actionMap[newColumn] || `Movido para ${newColumn}`,
    details: null,
  });
}

/**
 * Build SyncContext from a content_task row and optional client data.
 */
export function buildSyncContext(
  task: { id: string; client_id: string; title: string; content_type: string; description: string | null; script_id: string | null; recording_id: string | null; assigned_to: string | null; edited_video_link: string | null; immediate_alteration?: boolean; approved_at?: string | null },
  opts?: { userId?: string; clientName?: string; clientWhatsapp?: string }
): SyncContext {
  return {
    taskId: task.id,
    clientId: task.client_id,
    title: task.title,
    contentType: task.content_type,
    description: task.description,
    scriptId: task.script_id,
    recordingId: task.recording_id,
    assignedTo: task.assigned_to,
    editedVideoLink: task.edited_video_link,
    immediateAlteration: task.immediate_alteration,
    approvedAt: task.approved_at,
    userId: opts?.userId,
    clientName: opts?.clientName,
    clientWhatsapp: opts?.clientWhatsapp,
  };
}

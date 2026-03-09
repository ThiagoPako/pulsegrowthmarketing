import { supabase } from '@/integrations/supabase/client';
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
 * Add hours to a date, but only count hours that fall on work days.
 * Non-work days are skipped entirely (the clock "pauses").
 */
function addBusinessHours(from: Date, hours: number, workDays: string[]): Date {
  const result = new Date(from);
  let remaining = hours;

  while (remaining > 0) {
    const dayKey = NUM_TO_DAYKEY[getDay(result)];
    if (workDays.includes(dayKey)) {
      // This is a work day — consume up to 24h
      const hoursToConsume = Math.min(remaining, 24);
      result.setHours(result.getHours() + hoursToConsume);
      remaining -= hoursToConsume;

      // After adding hours, if we land on a non-work day, jump forward
      if (remaining <= 0) break;
    } else {
      // Skip this entire day
      result.setDate(result.getDate() + 1);
      result.setHours(from.getHours(), from.getMinutes(), 0, 0);
    }
  }

  // If we landed on a non-work day, advance to next work day
  while (!workDays.includes(NUM_TO_DAYKEY[getDay(result)])) {
    result.setDate(result.getDate() + 1);
  }

  return result;
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
      if (whatsConfig?.integrationActive && ctx.clientWhatsapp) {
        const editingMsg = `Olá, ${ctx.clientName || ''}! 🎬\n\nHoje gravamos o vídeo *"${ctx.title}"* e ele já está com o nosso time de edição! ✂️\n\nAssim que estiver pronto, enviaremos o link aqui para sua aprovação. 📲\n\nAgradecemos pela confiança!\n\nEquipe Pulse Growth Marketing 🚀`;

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
    // Auto-send WhatsApp approval message
    try {
      const whatsConfig = await getWhatsAppConfig();
      if (whatsConfig?.integrationActive && whatsConfig?.autoVideoApproval && ctx.clientWhatsapp) {
        let msg = whatsConfig.msgVideoApproval
          .replace('{nome_cliente}', ctx.clientName || '')
          .replace('{link_video}', ctx.editedVideoLink || 'Link não disponível')
          .replace('{titulo}', ctx.title);
        msg += '\\n\\n⏰ Você tem até *6 horas* para avaliar e aprovar o vídeo. Após esse prazo, ele será encaminhado para agendamento automaticamente.';

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
  }

  // 5. Log to task_history
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

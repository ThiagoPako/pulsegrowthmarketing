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
  /** Quem editou o vídeo: é quem corrige a alteração (assigned_to já vem zerado da revisão). */
  editedBy?: string | null;
  editedVideoLink: string | null;
  immediateAlteration?: boolean;
  /** Quem move para Edição está pegando o card agora (o timer começa). Sem isso o card entra na fila. */
  startEditing?: boolean;
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
  arquivado: 'postado',
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
  // Só sincroniza card que existe na cidade ativa. O update de um card de outra cidade (ou já
  // removido) não muda nada no servidor, mas o sync seguia e criava entrega no Social Media,
  // aviso no portal e histórico "fantasmas".
  if (!ctx.taskId) return;
  const { data: currentRow, error: currentRowError } = await supabase
    .from('content_tasks').select('id').eq('id', ctx.taskId).maybeSingle();
  if (!currentRowError && !currentRow) {
    console.warn('[contentTaskSync] card fora da cidade ativa ou removido; sync ignorado:', ctx.taskId);
    return;
  }

  const updates: Record<string, any> = {
    reviewing_by: null,
    reviewing_by_name: null,
    reviewing_at: null,
    // Clear stale deadlines from previous columns to avoid phantom badges
    editing_deadline: null,
    review_deadline: null,
    alteration_deadline: null,
    approval_deadline: null,
  };

  // Fetch deadline settings + work_days + enabled flags
  const { data: settingsRow } = await supabase.from('company_settings').select('editing_deadline_hours, review_deadline_hours, alteration_deadline_hours, approval_deadline_hours, work_days, editing_deadline_enabled, review_deadline_enabled, alteration_deadline_enabled, approval_deadline_enabled').limit(1).single();
  const deadlineHours = {
    editing: settingsRow?.editing_deadline_hours ?? 48,
    review: settingsRow?.review_deadline_hours ?? 24,
    alteration: settingsRow?.alteration_deadline_hours ?? 24,
    approval: settingsRow?.approval_deadline_hours ?? 6,
  };
  const deadlineEnabled = {
    editing: settingsRow?.editing_deadline_enabled ?? true,
    review: settingsRow?.review_deadline_enabled ?? true,
    alteration: settingsRow?.alteration_deadline_enabled ?? true,
    approval: settingsRow?.approval_deadline_enabled ?? true,
  };
  const workDays: string[] = (settingsRow?.work_days as string[]) ?? ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

  // 1. Set editing_started_at and editing_deadline when entering edicao
  if (newColumn === 'edicao') {
    // O timer só começa quando alguém pega o card. Antes toda entrada em Edição gravava agora:
    // o card da fila aparecia como "editando" na Bancada e o tempo de edição vinha inflado.
    updates.editing_started_at = ctx.startEditing ? new Date().toISOString() : null;
    if (deadlineEnabled.editing) {
      const editingDeadline = addBusinessHours(new Date(), deadlineHours.editing, workDays);
      updates.editing_deadline = editingDeadline.toISOString();
    }
    // Mark script as recorded
    if (ctx.scriptId) {
      await supabase.from('scripts').update({ recorded: true } as any).eq('id', ctx.scriptId);
    }

    // Send WhatsApp to client: video recorded, now in editing
    try {
      const whatsConfig = await getWhatsAppConfig();
      if (whatsConfig?.integrationActive && whatsConfig?.autoTaskEditing && ctx.clientWhatsapp) {
        const portalUrl = `https://agenciapulse.tech/portal/${ctx.clientId}`;
        const editingMsg = whatsConfig.msgTaskEditing
          .replace('{nome_cliente}', ctx.clientName || '')
          .replace('{titulo}', ctx.title)
          .replace('{link_portal}', portalUrl);

        await sendWhatsAppMessage({
          number: ctx.clientWhatsapp,
          message: editingMsg,
          clientId: ctx.clientId,
          triggerType: 'auto_recording',
          purpose: 'aprovacao',
        });
      }
    } catch (err) {
      console.error('WhatsApp editing notification error:', err);
    }
  }

  // 2. Set deadlines based on column transitions (business hours only)
  if (newColumn === 'revisao') {
    if (deadlineEnabled.review) {
      const deadline = addBusinessHours(new Date(), deadlineHours.review, workDays);
      updates.review_deadline = deadline.toISOString();
    }
    updates.approval_sent_at = new Date().toISOString();
    updates.assigned_to = null; // Remove editor responsibility on review
  }
  if (newColumn === 'alteracao') {
    if (!ctx.immediateAlteration && deadlineEnabled.alteration) {
      const deadline = addBusinessHours(new Date(), deadlineHours.alteration, workDays);
      updates.alteration_deadline = deadline.toISOString();
    }
    // Reset editing_started_at so timer only starts when editor clicks "Iniciar Alteração"
    updates.editing_started_at = null;
    updates.editing_paused_at = null;
    updates.editing_paused_seconds = 0;
    // Auto-assign alteration to the original editor (edited_by) — only they can fix it
    // assigned_to is cleared until they click "Iniciar Alteração", but edited_by is preserved
    updates.assigned_to = null;
  }
  if (newColumn === 'envio') {
    if (deadlineEnabled.approval) {
      const deadline = addBusinessHours(new Date(), deadlineHours.approval, workDays);
      updates.approval_deadline = deadline.toISOString();
    }
    updates.approval_sent_at = new Date().toISOString();
    updates.assigned_to = null; // Remove editor responsibility on client approval
  }
  if (newColumn === 'agendamentos') {
    // Avulso videos skip scheduling – move directly to arquivado
    if (!ctx.clientId) {
      updates.approved_at = updates.approved_at || new Date().toISOString();
      await supabase.from('content_tasks').update({
        ...updates,
        kanban_column: 'arquivado',
        updated_at: new Date().toISOString(),
      } as any).eq('id', ctx.taskId);
      // Log and return early
      await supabase.from('task_history').insert({
        task_id: ctx.taskId,
        user_id: ctx.userId || null,
        action: 'Vídeo avulso aprovado e arquivado (sem agendamento)',
        details: null,
      });
      return;
    }
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

  // 3. Sync social_media_deliveries (skip for avulso - no client)
  if (ctx.clientId) {
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
    } else {
      // Moving to a non-social-tracked column (ideias, captacao, edicao):
      // Delete the social_media_deliveries record to avoid ghost cards in the social kanban
      const { data: orphanRecords } = await supabase.from('social_media_deliveries')
        .select('id').eq('content_task_id', ctx.taskId).limit(1);
      if (orphanRecords?.length) {
        await supabase.from('social_media_deliveries').delete().eq('content_task_id', ctx.taskId);
      }
    }
  }

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
    // Skip for avulso (no client_id)
    if (ctx.editedVideoLink && ctx.clientId) {
      const now = new Date();
      // O vínculo é pelo título: ignora conteúdos já fechados (aprovado/agendado/publicado),
      // senão o vídeo novo sobrescrevia o de um mês anterior com o mesmo título.
      const { data: existing } = await supabase
        .from('client_portal_contents')
        .select('id')
        .eq('client_id', ctx.clientId)
        .eq('title', ctx.title)
        .not('status', 'in', '(aprovado,agendado,publicado)')
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
    // Avisa o editor do vídeo (edited_by). O assigned_to chega zerado da revisão e do envio,
    // por isso antes o aviso nunca saía. Não avisa quem pediu o ajuste.
    const editorToNotify = ctx.editedBy || ctx.assignedTo;
    if (editorToNotify && editorToNotify !== ctx.userId) {
      const urgencyPrefix = ctx.immediateAlteration ? '🚨 IMEDIATO: ' : '';
      await supabase.rpc('notify_user', {
        _user_id: editorToNotify,
        _title: `${urgencyPrefix}Ajuste solicitado`,
        _message: `\"${ctx.title}\" (${ctx.clientName || ''}) precisa de ajustes${ctx.immediateAlteration ? ' IMEDIATOS' : ''}`,
        _type: 'adjustment',
        _link: '/edicao/kanban',
      });
    }
  }

  if (newColumn === 'envio') {
    // Skip portal/WhatsApp for avulso (no client)
    if (ctx.clientId) {
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
      // Aviso ao cliente pelo WhatsApp: o servidor manda sozinho quando o conteúdo fica "pendente" no portal
      // (uma mensagem só, juntando os vídeos que entram juntos — ver vps-api-server/whatsapp/routes.mjs).

      // Create portal notification for the client (o conteúdo em aberto, não um antigo já fechado)
      try {
        const { data: portalContent } = await supabase
          .from('client_portal_contents')
          .select('id')
          .eq('client_id', ctx.clientId)
          .eq('title', ctx.title)
          .not('status', 'in', '(aprovado,agendado,publicado)')
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
  if (portalNotif && newColumn !== 'envio' && ctx.clientId) {
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
 * Insere um card filho (divisão de otimização ou pacote de stories) e devolve o id criado.
 * Se a coluna parent_task_id ainda não existir, tenta de novo sem ela.
 */
export async function insertChildContentTask(payload: Record<string, any>): Promise<{ id: string | null; error: string | null }> {
  let { data, error } = await supabase.from('content_tasks').insert(payload as any).select('id').single();
  if (error) {
    const { parent_task_id: _parent, ...rest } = payload;
    ({ data, error } = await supabase.from('content_tasks').insert(rest as any).select('id').single());
  }
  if (error) return { id: null, error: error.message || 'erro' };
  const created = Array.isArray(data) ? data[0] : data;
  return { id: created?.id ?? null, error: null };
}

/**
 * Fecha a divisão de um card em vários: o histórico do card original passa para cada filho
 * (antes ficava órfão), a entrega dele no Social Media sai e o card original é apagado.
 */
export async function finishContentTaskSplit(
  parentId: string,
  childIds: string[],
  log: { userId?: string | null; action: string; details?: string | null }
) {
  const { data: history } = await supabase.from('task_history')
    .select('user_id, action, details, created_at').eq('task_id', parentId);
  const rows: Record<string, any>[] = [];
  for (const childId of childIds) {
    for (const h of (history as any[]) || []) {
      rows.push({ task_id: childId, user_id: h.user_id ?? null, action: h.action, details: h.details ?? null, created_at: h.created_at });
    }
    rows.push({ task_id: childId, user_id: log.userId || null, action: log.action, details: log.details || null });
  }
  if (rows.length > 0) await supabase.from('task_history').insert(rows as any);
  await supabase.from('social_media_deliveries').delete().eq('content_task_id', parentId);
  await supabase.from('content_tasks').delete().eq('id', parentId);
}

/**
 * Filtro .or() do "pegar card" (Marcar como Meu / Iniciar): o UPDATE só passa se o card
 * estiver livre ou já for do próprio colaborador (o perfil pode ter vários ids).
 * Use com .select('id'): nenhuma linha de volta = outra pessoa ou um agente pegou antes.
 */
export function claimGuardFilter(identityIds: Array<string | null | undefined>): string {
  const ids = Array.from(new Set(identityIds.filter((id): id is string => !!id)));
  return ids.length > 0
    ? `assigned_to.is.null,assigned_to.in.(${ids.join(',')})`
    : 'assigned_to.is.null';
}

/**
 * Build SyncContext from a content_task row and optional client data.
 */
export function buildSyncContext(
  task: { id: string; client_id: string; title: string; content_type: string; description: string | null; script_id: string | null; recording_id: string | null; assigned_to: string | null; edited_by?: string | null; edited_video_link: string | null; immediate_alteration?: boolean; approved_at?: string | null },
  opts?: { userId?: string; clientName?: string; clientWhatsapp?: string; startEditing?: boolean }
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
    editedBy: task.edited_by ?? null,
    editedVideoLink: task.edited_video_link,
    immediateAlteration: task.immediate_alteration,
    startEditing: opts?.startEditing,
    approvedAt: task.approved_at,
    userId: opts?.userId,
    clientName: opts?.clientName,
    clientWhatsapp: opts?.clientWhatsapp,
  };
}

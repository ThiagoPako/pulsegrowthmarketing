import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppConfig {
  id: string;
  integrationActive: boolean;
  apiToken: string;
  defaultUserId: string;
  defaultQueueId: string;
  sendSignature: boolean;
  closeTicket: boolean;
  autoRecordingScheduled: boolean;
  autoRecordingReminder: boolean;
  autoVideoApproval: boolean;
  autoVideoApproved: boolean;
  autoConfirmation: boolean;
  autoTaskEditing: boolean;
  autoTaskApproved: boolean;
  autoApprovalExpired: boolean;
  msgRecordingScheduled: string;
  msgRecordingReminder: string;
  msgVideoApproval: string;
  msgVideoApproved: string;
  msgConfirmation: string;
  msgConfirmationConfirmed: string;
  msgConfirmationCancelled: string;
  msgBackupInvite: string;
  msgBackupConfirmed: string;
  msgTaskEditing: string;
  msgTaskApproved: string;
  msgApprovalExpired: string;
}

interface SendMessageParams {
  number: string;
  message: string;
  clientId?: string;
  triggerType?: 'manual' | 'auto_recording' | 'auto_reminder' | 'auto_confirmation' | 'auto_backup';
}

export interface WhatsAppMessage {
  id: string;
  phoneNumber: string;
  message: string;
  status: string;
  apiResponse: any;
  sentAt: string;
  sentBy: string | null;
  clientId: string | null;
  triggerType: string;
}

export interface WhatsAppConfirmation {
  id: string;
  recordingId: string;
  clientId: string;
  phoneNumber: string;
  type: 'confirmation' | 'backup_invite';
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  sentAt: string | null;
  respondedAt: string | null;
  responseMessage: string | null;
  createdAt: string;
}

function rowToConfig(r: any): WhatsAppConfig {
  return {
    id: r.id,
    integrationActive: r.integration_active,
    apiToken: r.api_token || '',
    defaultUserId: r.default_user_id,
    defaultQueueId: r.default_queue_id,
    sendSignature: r.send_signature,
    closeTicket: r.close_ticket,
    autoRecordingScheduled: r.auto_recording_scheduled,
    autoRecordingReminder: r.auto_recording_reminder,
    autoVideoApproval: r.auto_video_approval,
    autoVideoApproved: r.auto_video_approved,
    autoConfirmation: r.auto_confirmation,
    msgRecordingScheduled: r.msg_recording_scheduled || '',
    msgRecordingReminder: r.msg_recording_reminder || '',
    msgVideoApproval: r.msg_video_approval || '',
    msgVideoApproved: r.msg_video_approved || '',
    msgConfirmation: r.msg_confirmation || '',
    msgConfirmationConfirmed: r.msg_confirmation_confirmed || '',
    msgConfirmationCancelled: r.msg_confirmation_cancelled || '',
    msgBackupInvite: r.msg_backup_invite || '',
    msgBackupConfirmed: r.msg_backup_confirmed || '',
  };
}

function rowToMessage(r: any): WhatsAppMessage {
  return {
    id: r.id,
    phoneNumber: r.phone_number,
    message: r.message,
    status: r.status,
    apiResponse: r.api_response,
    sentAt: r.sent_at,
    sentBy: r.sent_by,
    clientId: r.client_id,
    triggerType: r.trigger_type,
  };
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  const { data } = await supabase.from('whatsapp_config').select('*').limit(1).single();
  return data ? rowToConfig(data) : null;
}

export async function updateWhatsAppConfig(config: Partial<WhatsAppConfig>): Promise<boolean> {
  const current = await getWhatsAppConfig();
  if (!current) return false;
  
  const updateData: any = {};
  if (config.integrationActive !== undefined) updateData.integration_active = config.integrationActive;
  if (config.apiToken !== undefined) updateData.api_token = config.apiToken;
  if (config.defaultUserId !== undefined) updateData.default_user_id = config.defaultUserId;
  if (config.defaultQueueId !== undefined) updateData.default_queue_id = config.defaultQueueId;
  if (config.sendSignature !== undefined) updateData.send_signature = config.sendSignature;
  if (config.closeTicket !== undefined) updateData.close_ticket = config.closeTicket;
  if (config.autoRecordingScheduled !== undefined) updateData.auto_recording_scheduled = config.autoRecordingScheduled;
  if (config.autoRecordingReminder !== undefined) updateData.auto_recording_reminder = config.autoRecordingReminder;
  if (config.autoVideoApproval !== undefined) updateData.auto_video_approval = config.autoVideoApproval;
  if (config.autoVideoApproved !== undefined) updateData.auto_video_approved = config.autoVideoApproved;
  if (config.autoConfirmation !== undefined) updateData.auto_confirmation = config.autoConfirmation;
  if (config.msgRecordingScheduled !== undefined) updateData.msg_recording_scheduled = config.msgRecordingScheduled;
  if (config.msgRecordingReminder !== undefined) updateData.msg_recording_reminder = config.msgRecordingReminder;
  if (config.msgVideoApproval !== undefined) updateData.msg_video_approval = config.msgVideoApproval;
  if (config.msgVideoApproved !== undefined) updateData.msg_video_approved = config.msgVideoApproved;
  if (config.msgConfirmation !== undefined) updateData.msg_confirmation = config.msgConfirmation;
  if (config.msgConfirmationConfirmed !== undefined) updateData.msg_confirmation_confirmed = config.msgConfirmationConfirmed;
  if (config.msgConfirmationCancelled !== undefined) updateData.msg_confirmation_cancelled = config.msgConfirmationCancelled;
  if (config.msgBackupInvite !== undefined) updateData.msg_backup_invite = config.msgBackupInvite;
  if (config.msgBackupConfirmed !== undefined) updateData.msg_backup_confirmed = config.msgBackupConfirmed;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase.from('whatsapp_config').update(updateData).eq('id', current.id);
  return !error;
}

export async function sendWhatsAppMessage(params: SendMessageParams): Promise<{ success: boolean; error?: string }> {
  const config = await getWhatsAppConfig();
  if (!config?.integrationActive) {
    return { success: false, error: 'Integração WhatsApp desativada' };
  }
  if (!config.apiToken) {
    return { success: false, error: 'Token da API não configurado' };
  }

  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: {
      number: params.number,
      message: params.message,
      userId: config.defaultUserId,
      queueId: config.defaultQueueId,
      sendSignature: config.sendSignature,
      closeTicket: config.closeTicket,
      clientId: params.clientId,
      triggerType: params.triggerType || 'manual',
    },
  });

  if (error) return { success: false, error: error.message };
  return { success: data?.success || false, error: data?.error };
}

export async function getWhatsAppMessages(filters?: {
  clientId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<WhatsAppMessage[]> {
  let query = supabase.from('whatsapp_messages').select('*').order('sent_at', { ascending: false });
  
  if (filters?.clientId) query = query.eq('client_id', filters.clientId);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.dateFrom) query = query.gte('sent_at', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('sent_at', filters.dateTo);

  const { data } = await query;
  return (data || []).map(rowToMessage);
}

export async function getMessageStats(): Promise<{ total: number; sent: number; failed: number }> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('status')
    .gte('sent_at', today + 'T00:00:00');
  
  const messages = data || [];
  return {
    total: messages.length,
    sent: messages.filter((m: any) => m.status === 'sent').length,
    failed: messages.filter((m: any) => m.status === 'failed').length,
  };
}

export async function testWhatsAppConnection(): Promise<{ success: boolean; error?: string }> {
  const config = await getWhatsAppConfig();
  if (!config?.apiToken) return { success: false, error: 'Token não configurado' };

  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: { action: 'test_connection' },
  });

  if (error) return { success: false, error: error.message };
  return { success: data?.success || false, error: data?.error };
}

// ── Build messages from templates ──

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

export async function sendRecordingCancelledNotification(
  clientPhone: string,
  clientName: string,
  clientId: string,
): Promise<{ success: boolean; error?: string }> {
  const config = await getWhatsAppConfig();
  if (!config?.integrationActive) return { success: false, error: 'Integração desativada' };
  if (!clientPhone || !config.apiToken) return { success: false, error: 'Token ou WhatsApp não configurado' };

  const message = applyTemplate(config.msgConfirmationCancelled, {
    nome_cliente: clientName,
  });

  return sendWhatsAppMessage({ number: clientPhone, message, clientId, triggerType: 'auto_confirmation' });
}

export async function sendRecordingConfirmedNotification(
  clientPhone: string,
  clientName: string,
  clientId: string,
  date: string,
  time: string,
): Promise<{ success: boolean; error?: string }> {
  const config = await getWhatsAppConfig();
  if (!config?.integrationActive) return { success: false, error: 'Integração desativada' };
  if (!clientPhone || !config.apiToken) return { success: false, error: 'Token ou WhatsApp não configurado' };

  const message = applyTemplate(config.msgConfirmationConfirmed, {
    nome_cliente: clientName,
    data_gravacao: date,
    hora_gravacao: time,
  });

  return sendWhatsAppMessage({ number: clientPhone, message, clientId, triggerType: 'auto_confirmation' });
}

export async function sendBackupInviteNotification(
  clientPhone: string,
  clientName: string,
  clientId: string,
  date: string,
  time: string,
): Promise<{ success: boolean; error?: string }> {
  const config = await getWhatsAppConfig();
  if (!config?.integrationActive) return { success: false, error: 'Integração desativada' };
  if (!clientPhone || !config.apiToken) return { success: false, error: 'Token ou WhatsApp não configurado' };

  const message = applyTemplate(config.msgBackupInvite, {
    nome_cliente: clientName,
    data_gravacao: date,
    hora_gravacao: time,
  });

  return sendWhatsAppMessage({ number: clientPhone, message, clientId, triggerType: 'auto_backup' });
}

export async function sendRecordingScheduledNotification(
  clientPhone: string,
  clientName: string,
  clientId: string,
  date: string,
  time: string,
  videomakerName: string,
): Promise<void> {
  const config = await getWhatsAppConfig();
  if (!config?.integrationActive || !config.autoRecordingScheduled) return;
  if (!clientPhone || !config.apiToken) return;

  const message = applyTemplate(config.msgRecordingScheduled, {
    nome_cliente: clientName,
    data_gravacao: date,
    hora_gravacao: time,
    videomaker: videomakerName,
  });

  await sendWhatsAppMessage({
    number: clientPhone,
    message,
    clientId,
    triggerType: 'auto_recording',
  });
}

// ── Confirmation functions ──

export async function clearConfirmationHistory(): Promise<boolean> {
  const { error } = await supabase.from('whatsapp_confirmations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  return !error;
}

export async function getWhatsAppConfirmations(): Promise<WhatsAppConfirmation[]> {
  const { data } = await supabase
    .from('whatsapp_confirmations')
    .select('*')
    .order('created_at', { ascending: false });
  
  return (data || []).map((r: any) => ({
    id: r.id,
    recordingId: r.recording_id,
    clientId: r.client_id,
    phoneNumber: r.phone_number,
    type: r.type,
    status: r.status,
    sentAt: r.sent_at,
    respondedAt: r.responded_at,
    responseMessage: r.response_message,
    createdAt: r.created_at,
  }));
}

export async function getConfirmationStats(): Promise<{
  pending: number;
  confirmed: number;
  cancelled: number;
  backupInvites: number;
}> {
  const { data } = await supabase.from('whatsapp_confirmations').select('type, status');
  const items = data || [];
  return {
    pending: items.filter((i: any) => i.type === 'confirmation' && i.status === 'pending').length,
    confirmed: items.filter((i: any) => i.status === 'confirmed').length,
    cancelled: items.filter((i: any) => i.type === 'confirmation' && i.status === 'cancelled').length,
    backupInvites: items.filter((i: any) => i.type === 'backup_invite').length,
  };
}

export function getWebhookUrl(): string {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return `https://${projectId}.supabase.co/functions/v1/whatsapp-webhook`;
}

/**
 * Send a manual confirmation message for a recording.
 * Creates a confirmation record so the cron job skips this recording.
 */
export async function sendManualConfirmation(
  recordingId: string,
  clientId: string,
  clientPhone: string,
  clientName: string,
  date: string,
  time: string,
  videomakerName: string,
): Promise<{ success: boolean; error?: string }> {
  const config = await getWhatsAppConfig();
  if (!config?.integrationActive) return { success: false, error: 'Integração desativada' };
  if (!config.apiToken) return { success: false, error: 'Token não configurado' };
  if (!clientPhone) return { success: false, error: 'Cliente sem WhatsApp' };

  const phoneNumber = clientPhone.replace(/\D/g, '');

  // Check if confirmation already exists for this recording
  const { data: existing } = await supabase
    .from('whatsapp_confirmations')
    .select('id')
    .eq('recording_id', recordingId)
    .eq('type', 'confirmation')
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: false, error: 'Confirmação já enviada para esta gravação' };
  }

  const message = applyTemplate(config.msgConfirmation, {
    nome_cliente: clientName,
    data_gravacao: date,
    hora_gravacao: time,
    videomaker: videomakerName,
  });

  // Create confirmation record (prevents cron from sending duplicate)
  await supabase.from('whatsapp_confirmations').insert({
    recording_id: recordingId,
    client_id: clientId,
    phone_number: phoneNumber,
    type: 'confirmation',
    status: 'pending',
    sent_at: new Date().toISOString(),
  });

  // Update recording confirmation_status
  await supabase.from('recordings').update({
    confirmation_status: 'aguardando',
  }).eq('id', recordingId);

  // Send the message
  const result = await sendWhatsAppMessage({
    number: clientPhone,
    message,
    clientId,
    triggerType: 'auto_confirmation',
  });

  return result;
}

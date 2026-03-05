import { supabase } from '@/integrations/supabase/client';

interface WhatsAppConfig {
  id: string;
  integrationActive: boolean;
  apiTokenConfigured: boolean;
  defaultUserId: string;
  defaultQueueId: string;
  sendSignature: boolean;
  closeTicket: boolean;
  autoRecordingScheduled: boolean;
  autoRecordingReminder: boolean;
  autoVideoApproval: boolean;
  autoVideoApproved: boolean;
}

interface SendMessageParams {
  number: string;
  message: string;
  clientId?: string;
  triggerType?: 'manual' | 'auto_recording' | 'auto_reminder' | 'auto_approval' | 'auto_approved';
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

function rowToConfig(r: any): WhatsAppConfig {
  return {
    id: r.id,
    integrationActive: r.integration_active,
    apiTokenConfigured: r.api_token_configured,
    defaultUserId: r.default_user_id,
    defaultQueueId: r.default_queue_id,
    sendSignature: r.send_signature,
    closeTicket: r.close_ticket,
    autoRecordingScheduled: r.auto_recording_scheduled,
    autoRecordingReminder: r.auto_recording_reminder,
    autoVideoApproval: r.auto_video_approval,
    autoVideoApproved: r.auto_video_approved,
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
  if (config.apiTokenConfigured !== undefined) updateData.api_token_configured = config.apiTokenConfigured;
  if (config.defaultUserId !== undefined) updateData.default_user_id = config.defaultUserId;
  if (config.defaultQueueId !== undefined) updateData.default_queue_id = config.defaultQueueId;
  if (config.sendSignature !== undefined) updateData.send_signature = config.sendSignature;
  if (config.closeTicket !== undefined) updateData.close_ticket = config.closeTicket;
  if (config.autoRecordingScheduled !== undefined) updateData.auto_recording_scheduled = config.autoRecordingScheduled;
  if (config.autoRecordingReminder !== undefined) updateData.auto_recording_reminder = config.autoRecordingReminder;
  if (config.autoVideoApproval !== undefined) updateData.auto_video_approval = config.autoVideoApproval;
  if (config.autoVideoApproved !== undefined) updateData.auto_video_approved = config.autoVideoApproved;
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase.from('whatsapp_config').update(updateData).eq('id', current.id);
  return !error;
}

export async function sendWhatsAppMessage(params: SendMessageParams): Promise<{ success: boolean; error?: string }> {
  const config = await getWhatsAppConfig();
  if (!config?.integrationActive) {
    return { success: false, error: 'Integração WhatsApp desativada' };
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

// ── Automation message templates ──

export function buildRecordingScheduledMessage(clientName: string, date: string, time: string, videomakerName: string): string {
  return `Olá! Sua gravação foi agendada.\n\nCliente: ${clientName}\nData: ${date}\nHorário: ${time}\nVideomaker: ${videomakerName}\n\nEquipe Pulse Growth Marketing`;
}

export function buildRecordingReminderMessage(clientName: string, time: string): string {
  return `Lembrete da sua gravação amanhã.\n\nCliente: ${clientName}\nHorário: ${time}\n\nEquipe Pulse Growth Marketing`;
}

export function buildVideoApprovalMessage(link?: string): string {
  return `Seu vídeo está pronto para aprovação.\n\nAcesse o link abaixo para assistir:\n${link || '[link do vídeo]'}\n\nSe precisar de ajustes nos avise.\n\nEquipe Pulse Growth Marketing`;
}

export function buildVideoApprovedMessage(): string {
  return `Seu vídeo foi aprovado e será publicado em breve.\n\nObrigado pela confiança na Pulse Growth Marketing.`;
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
  if (!clientPhone) return;

  await sendWhatsAppMessage({
    number: clientPhone,
    message: buildRecordingScheduledMessage(clientName, date, time, videomakerName),
    clientId,
    triggerType: 'auto_recording',
  });
}

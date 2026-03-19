/**
 * VPS Edge Functions Service
 * Replaces all supabase.functions.invoke() calls with VPS API calls
 */

import { supabase } from '@/integrations/supabase/client';

const VPS_API_BASE = 'https://agenciapulse.tech/api';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

/**
 * Generic VPS function invoker — drop-in replacement for supabase.functions.invoke
 */
export async function invokeVpsFunction(
  functionName: string,
  options?: { body?: any; method?: string }
): Promise<{ data: any; error: any }> {
  try {
    const headers = await getAuthHeaders();
    const method = options?.method || 'POST';
    
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    let url = `${VPS_API_BASE}/${functionName}`;

    if (method === 'GET' && options?.body) {
      const params = new URLSearchParams(options.body);
      url += `?${params.toString()}`;
    } else if (options?.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: { message: data.error || `HTTP ${response.status}` } };
    }

    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error.message || 'Network error' } };
  }
}

// Convenience exports for each function
export const vpsFinancialChat = (body: any) => invokeVpsFunction('financial-chat', { body });
export const vpsSendWhatsapp = (body: any) => invokeVpsFunction('send-whatsapp', { body });
export const vpsGenerateScript = (body: any) => invokeVpsFunction('generate-script', { body });
export const vpsGenerateCaption = (body: any) => invokeVpsFunction('generate-caption', { body });
export const vpsClientPortalAuth = (body: any) => invokeVpsFunction('client-portal-auth', { body });
export const vpsPortalRecordings = (body: any) => invokeVpsFunction('portal-recordings', { body });
export const vpsPortalMediaProxy = (body: any) => invokeVpsFunction('portal-media-proxy', { body });
export const vpsMetaOauth = (body: any) => invokeVpsFunction('meta-oauth', { body });
export const vpsMetaPublish = (body: any) => invokeVpsFunction('meta-publish', { body });
export const vpsMetaStoreCredentials = (body: any) => invokeVpsFunction('meta-store-credentials', { body });
export const vpsMetaTokenRefresh = (body: any) => invokeVpsFunction('meta-token-refresh', { body });
export const vpsResetPassword = (body: any) => invokeVpsFunction('reset-password', { body });
export const vpsDeleteUser = (body: any) => invokeVpsFunction('delete-user', { body });
export const vpsClientOnboarding = (body: any, method = 'POST') => invokeVpsFunction('client-onboarding', { body, method });
export const vpsBillingAutomation = (body?: any) => invokeVpsFunction('billing-automation', { body });
export const vpsWhatsappWebhook = (body: any) => invokeVpsFunction('whatsapp-webhook', { body });
export const vpsConfirmationCron = (body?: any) => invokeVpsFunction('whatsapp-confirmation-cron', { body });
export const vpsApprovalDeadlineCron = (body?: any) => invokeVpsFunction('approval-deadline-cron', { body });
export const vpsGenerateMonthlyRevenues = (body?: any) => invokeVpsFunction('generate-monthly-revenues', { body });
export const vpsEndoDailyTasksNotify = (body?: any) => invokeVpsFunction('endo-daily-tasks-notify', { body });

/**
 * VPS Edge Functions Service
 * Uses VPS JWT token for authentication
 */

const VPS_API_BASE = 'https://agenciapulse.tech/api';
const TOKEN_KEY = 'pulse_jwt';
const CITY_KEY = 'pulse:active_city';

function getActiveCity(): string {
  if (typeof window === 'undefined') return 'minacu';
  const inMem = (window as any).__PULSE_ACTIVE_CITY__;
  if (inMem === 'minacu' || inMem === 'uruacu') return inMem;
  const stored = localStorage.getItem(CITY_KEY);
  return stored === 'uruacu' ? 'uruacu' : 'minacu';
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-pulse-city': getActiveCity(),
  };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function refreshVpsSession(): Promise<boolean> {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) return false;

  try {
    const response = await fetch(`${VPS_API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-pulse-city': getActiveCity(),
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.token) return false;

    localStorage.setItem(TOKEN_KEY, payload.token);
    window.dispatchEvent(new CustomEvent('pulse:auth-token-refreshed', { detail: { token: payload.token } }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Generic VPS function invoker — drop-in replacement for supabase.functions.invoke
 */
export async function invokeVpsFunction(
  functionName: string,
  options?: { body?: any; method?: string }
): Promise<{ data: any; error: any }> {
  try {
    const headers = getAuthHeaders();
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

    let response = await fetch(url, fetchOptions);

    if (response.status === 401 && await refreshVpsSession()) {
      fetchOptions.headers = getAuthHeaders();
      response = await fetch(url, fetchOptions);
    }

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

/**
 * Call Lovable Cloud edge functions (Supabase-hosted)
 */
export async function invokeCloudFunction(
  functionName: string,
  body?: any
): Promise<{ data: any; error: any }> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(body || {}),
    });

    const data = await response.json();
    if (!response.ok) {
      return { data: null, error: { message: data.error || `HTTP ${response.status}` } };
    }
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error.message || 'Network error' } };
  }
}

export const cloudContentSuggestions = (body: any) => invokeCloudFunction('ai-content-suggestions', body);
export const cloudScriptGenerator = (body: any) => invokeCloudFunction('ai-script-generator', body);

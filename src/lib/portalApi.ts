/**
 * Portal API helper — routes all client-facing portal calls through
 * the VPS /api/portal-actions endpoint.
 *
 * Sessão: o cliente manda o token do login do portal (x-portal-token, guardado
 * no sessionStorage); a equipe que abre o portal manda o próprio JWT (Bearer).
 */
import { refreshVpsSession } from '@/services/vpsEdgeFunctions';

const VPS_API_BASE = 'https://agenciapulse.tech/api';
const TEAM_TOKEN_KEY = 'pulse_jwt';
const PORTAL_TOKEN_KEY = 'portal_token';
const PORTAL_SESSION_KEYS = ['portal_client_id', 'portal_client_name', 'portal_user_name', 'portal_auth_type', PORTAL_TOKEN_KEY];

function readStorage(storage: 'local' | 'session', key: string): string | null {
  try {
    return (storage === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function getPortalToken(): string | null {
  return readStorage('session', PORTAL_TOKEN_KEY);
}

/** Guarda a sessão do cliente depois do login ou do cadastro no portal. */
export function savePortalSession(data: { clientId: string; companyName?: string; userName?: string; token?: string | null }) {
  try {
    sessionStorage.setItem('portal_client_id', data.clientId);
    sessionStorage.setItem('portal_client_name', data.companyName || '');
    sessionStorage.setItem('portal_user_name', data.userName || data.companyName || '');
    sessionStorage.setItem('portal_auth_type', 'client');
    if (data.token) sessionStorage.setItem(PORTAL_TOKEN_KEY, data.token);
    else sessionStorage.removeItem(PORTAL_TOKEN_KEY);
  } catch { /* navegador sem sessionStorage */ }
}

export function clearPortalSession() {
  try {
    PORTAL_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch { /* navegador sem sessionStorage */ }
}

/** Cliente com login válido no portal (precisa do client_id e do token). */
export function hasPortalSession(): boolean {
  return !!readStorage('session', 'portal_client_id') && !!getPortalToken();
}

/** Cabeçalhos de sessão do portal (cliente: x-portal-token; equipe: Bearer) para rotas fora do portal-actions. */
export function portalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const teamToken = readStorage('local', TEAM_TOKEN_KEY);
  if (teamToken) headers['Authorization'] = `Bearer ${teamToken}`;
  const portalToken = getPortalToken();
  if (portalToken) headers['x-portal-token'] = portalToken;
  return headers;
}

/** Sessão do cliente expirou (ou é de antes do token): volta para o login do portal. */
function handlePortalSessionExpired() {
  if (readStorage('local', TEAM_TOKEN_KEY)) return; // equipe: o app cuida da própria sessão
  clearPortalSession();
  const match = typeof window !== 'undefined' ? window.location.pathname.match(/^\/portal\/([^/]+)/) : null;
  if (match) window.location.replace(`/portal-login/${match[1]}`);
}

async function postPortal(path: string, body: Record<string, any>): Promise<{ ok: boolean; status: number; data: any }> {
  const init = (): RequestInit => ({ method: 'POST', headers: portalHeaders(), body: JSON.stringify(body) });
  let response = await fetch(`${VPS_API_BASE}/${path}`, init());
  if (response.status === 401 && readStorage('local', TEAM_TOKEN_KEY) && await refreshVpsSession()) {
    response = await fetch(`${VPS_API_BASE}/${path}`, init());
  }
  const data = await response.json().catch(() => null);
  if (response.status === 401) handlePortalSessionExpired();
  return { ok: response.ok, status: response.status, data };
}

export async function portalAction(body: Record<string, any>): Promise<any> {
  try {
    const { ok, status, data } = await postPortal('portal-actions', body);
    if (!ok) {
      console.error('[portalAction] error:', data);
      return { error: data?.error || `HTTP ${status}` };
    }
    return data;
  } catch (error: any) {
    console.error('[portalAction] network error:', error);
    return { error: error.message || 'Network error' };
  }
}

/** Agenda do portal (/api/portal-recordings) — mesmo formato de retorno do invokeVpsFunction. */
export async function portalRecordings(body: Record<string, any>): Promise<{ data: any; error: { message: string } | null }> {
  try {
    const { ok, status, data } = await postPortal('portal-recordings', body);
    if (!ok) return { data: null, error: { message: data?.error || `HTTP ${status}` } };
    return { data, error: null };
  } catch (error: any) {
    return { data: null, error: { message: error.message || 'Network error' } };
  }
}

export async function avulsoAction(body: Record<string, any>): Promise<any> {
  try {
    const response = await fetch(`${VPS_API_BASE}/avulso-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[avulsoAction] error:', data);
      return { error: data.error || `HTTP ${response.status}` };
    }
    return data;
  } catch (error: any) {
    console.error('[avulsoAction] network error:', error);
    return { error: error.message || 'Network error' };
  }
}

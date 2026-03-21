/**
 * Portal API helper — routes all client-facing portal calls through
 * the VPS /api/portal-actions endpoint (no JWT required).
 */

const VPS_API_BASE = 'https://agenciapulse.tech/api';

export async function portalAction(body: Record<string, any>): Promise<any> {
  try {
    const response = await fetch(`${VPS_API_BASE}/portal-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[portalAction] error:', data);
      return { error: data.error || `HTTP ${response.status}` };
    }
    return data;
  } catch (error: any) {
    console.error('[portalAction] network error:', error);
    return { error: error.message || 'Network error' };
  }
}

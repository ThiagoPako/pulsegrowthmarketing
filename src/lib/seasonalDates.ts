// Seasonal dates - now AI-powered via edge function
// This file keeps NICHE_OPTIONS for reference and a fallback cache system

export const NICHE_OPTIONS = [
  { value: 'farmacia', label: 'Farmácia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'mercado', label: 'Mercado / Supermercado' },
  { value: 'varejo', label: 'Varejo' },
  { value: 'moda', label: 'Moda' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'emagrecimento', label: 'Emagrecimento' },
  { value: 'alimentacao', label: 'Alimentação / Restaurante' },
  { value: 'confeitaria', label: 'Confeitaria / Padaria' },
  { value: 'beleza', label: 'Beleza / Estética' },
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'educacao', label: 'Educação' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'pet', label: 'Pet Shop / Veterinária' },
  { value: 'automotivo', label: 'Automotivo' },
  { value: 'veiculos', label: 'Loja de Veículos' },
  { value: 'imoveis', label: 'Imóveis' },
  { value: 'agropecuaria', label: 'Agropecuária' },
  { value: 'construcao', label: 'Material de Construção' },
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'otica', label: 'Ótica' },
  { value: 'joalheria', label: 'Joalheria / Relojoaria' },
  { value: 'turismo', label: 'Turismo / Hotelaria' },
  { value: 'infantil', label: 'Infantil / Brinquedos' },
  { value: 'moveis', label: 'Móveis / Decoração' },
  { value: 'clinica_veterinaria', label: 'Clínica Veterinária' },
  { value: 'limpeza', label: 'Limpeza / Produtos de Limpeza' },
  { value: 'grafica', label: 'Gráfica / Papelaria' },
  { value: 'juridico', label: 'Jurídico' },
  { value: 'contabilidade', label: 'Contabilidade' },
  { value: 'outro', label: 'Outro' },
] as const;

export type NicheValue = typeof NICHE_OPTIONS[number]['value'];

// Cache key for localStorage
const SEASONAL_CACHE_KEY = 'pulse_seasonal_alerts_cache';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface AISeasonalAlert {
  clientId: string;
  clientName: string;
  niche: string;
  clientLogo?: string | null;
  clientColor?: string | null;
  dates: {
    label: string;
    date: string;
    days_until: number;
    urgency: 'high' | 'medium' | 'low';
    suggestion: string;
  }[];
}

interface CachedAlerts {
  timestamp: number;
  alerts: AISeasonalAlert[];
}

/**
 * Chave do cache por cidade ativa e lista de clientes: antes era uma só, e ao trocar
 * de cidade o card mostrava por até 6 h os clientes da outra cidade.
 */
function seasonalCacheKey(clientIds?: string[]): string {
  let city = 'geral';
  try { city = String((window as any).__PULSE_ACTIVE_CITY__ || 'geral'); } catch { /* sem window */ }
  const ids = Array.isArray(clientIds) && clientIds.length ? [...clientIds].sort().join(',') : 'todos';
  // Hash curto dos ids (djb2) para a chave não crescer com a carteira
  let hash = 5381;
  for (let i = 0; i < ids.length; i++) hash = ((hash << 5) + hash + ids.charCodeAt(i)) | 0;
  return `${SEASONAL_CACHE_KEY}:${city}:${(hash >>> 0).toString(36)}`;
}

export function getCachedAlerts(clientIds?: string[]): AISeasonalAlert[] | null {
  if (typeof window === 'undefined') return null;
  const key = seasonalCacheKey(clientIds);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const cached: CachedAlerts = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return cached.alerts;
  } catch {
    return null;
  }
}

export function setCachedAlerts(alerts: AISeasonalAlert[], clientIds?: string[]) {
  if (typeof window === 'undefined' || alerts.length === 0) return;
  try {
    const cached: CachedAlerts = { timestamp: Date.now(), alerts };
    localStorage.setItem(seasonalCacheKey(clientIds), JSON.stringify(cached));
  } catch { /* ignore quota errors */ }
}

/**
 * Fetch AI-powered seasonal alerts via edge function
 */
export async function fetchAISeasonalAlerts(
  clientIds?: string[]
): Promise<AISeasonalAlert[]> {
  // Check cache first (da mesma cidade e dos mesmos clientes)
  const cached = getCachedAlerts(clientIds);
  if (cached) return cached;

  try {
    const { invokeVpsFunction } = await import('@/services/vpsEdgeFunctions');
    const { data, error } = await invokeVpsFunction('seasonal-alerts', { body: { clientIds } });

    if (error) {
      console.error('Seasonal alerts fetch error:', error.message);
      return [];
    }
    const alerts = data.alerts || [];
    setCachedAlerts(alerts, clientIds);
    return alerts;
  } catch (err) {
    console.error('Seasonal alerts error:', err);
    return [];
  }
}

/**
 * Force refresh cached alerts
 */
export function clearSeasonalCache() {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key === SEASONAL_CACHE_KEY || key.startsWith(`${SEASONAL_CACHE_KEY}:`))) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch { /* storage bloqueado */ }
}

// Legacy compatibility functions - now return empty since AI handles everything
export function getUpcomingSeasonalDates(
  _niche: string,
  _daysAhead: number = 30
): { label: string; date: Date; daysUntil: number }[] {
  return [];
}

export function getSeasonalAlerts(
  _niche: string
): { label: string; date: Date; daysUntil: number; urgency: 'high' | 'medium' | 'low' }[] {
  return [];
}

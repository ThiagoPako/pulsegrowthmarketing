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

export function getCachedAlerts(): AISeasonalAlert[] | null {
  try {
    const raw = localStorage.getItem(SEASONAL_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedAlerts = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(SEASONAL_CACHE_KEY);
      return null;
    }
    return cached.alerts;
  } catch {
    return null;
  }
}

export function setCachedAlerts(alerts: AISeasonalAlert[]) {
  try {
    const cached: CachedAlerts = { timestamp: Date.now(), alerts };
    localStorage.setItem(SEASONAL_CACHE_KEY, JSON.stringify(cached));
  } catch { /* ignore quota errors */ }
}

/**
 * Fetch AI-powered seasonal alerts via edge function
 */
export async function fetchAISeasonalAlerts(
  clientIds?: string[]
): Promise<AISeasonalAlert[]> {
  // Check cache first
  const cached = getCachedAlerts();
  if (cached) return cached;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/seasonal-alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ clientIds }),
    });

    if (!response.ok) {
      console.error('Seasonal alerts fetch error:', response.status);
      return [];
    }

    const data = await response.json();
    const alerts = data.alerts || [];
    setCachedAlerts(alerts);
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
  localStorage.removeItem(SEASONAL_CACHE_KEY);
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

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

export type CityCode = 'minacu' | 'uruacu';

export const CITY_LABELS: Record<CityCode, string> = {
  minacu: 'Minaçu',
  uruacu: 'Uruaçu',
};

const STORAGE_KEY = 'pulse:active_city';
const VPS_API_BASE = 'https://agenciapulse.tech/api';
const TOKEN_KEY = 'pulse_jwt';

interface CityContextValue {
  activeCity: CityCode;
  availableCities: CityCode[];
  isLoading: boolean;
  setActiveCity: (city: CityCode) => void;
}

const CityContext = createContext<CityContextValue | undefined>(undefined);

function readStored(): CityCode {
  if (typeof window === 'undefined') return 'minacu';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'uruacu' ? 'uruacu' : 'minacu';
}

export function CityProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [activeCity, setActiveCityState] = useState<CityCode>(readStored);
  const [availableCities, setAvailableCities] = useState<CityCode[]>(['minacu']);
  const [isLoading, setIsLoading] = useState(true);

  // Garante que o header global está alinhado com o estado inicial
  useEffect(() => {
    (window as any).__PULSE_ACTIVE_CITY__ = activeCity;
  }, [activeCity]);

  useEffect(() => {
    let cancelled = false;
    async function loadCities() {
      if (!user) {
        const hasStoredToken = typeof window !== 'undefined' && !!localStorage.getItem(TOKEN_KEY);
        if (authLoading || hasStoredToken) {
          setIsLoading(true);
          return;
        }
        setAvailableCities(['minacu']);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        const res = await fetch(`${VPS_API_BASE}/me/cities`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await res.json();
        if (cancelled) return;
        const cities: CityCode[] = (json.cities || ['minacu']).filter(
          (c: string) => c === 'minacu' || c === 'uruacu',
        ) as CityCode[];
        const primary: CityCode = (json.primary as CityCode) || cities[0] || 'minacu';
        setAvailableCities(cities.length ? cities : ['minacu']);

        // Se a cidade salva não está mais autorizada, força para a primary
        const stored = readStored();
        const next = cities.includes(stored) ? stored : primary;
        setActiveCityState(next);
        localStorage.setItem(STORAGE_KEY, next);
        (window as any).__PULSE_ACTIVE_CITY__ = next;
      } catch {
        // Fallback silencioso — mantém minacu
        setAvailableCities(['minacu']);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadCities();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const setActiveCity = useCallback((city: CityCode) => {
    if (city === activeCity) return;
    localStorage.setItem(STORAGE_KEY, city);
    (window as any).__PULSE_ACTIVE_CITY__ = city;
    setActiveCityState(city);
    // Nunca recarregue a página: isso interrompe roteiros, uploads, timers e
    // edições em andamento. Somente descarte os dados da cidade anterior para
    // que as telas ativas consultem novamente usando o novo header de cidade.
    void queryClient.cancelQueries().then(() => {
      queryClient.removeQueries();
      window.dispatchEvent(new CustomEvent('pulse:city-changed', { detail: { city } }));
    });
  }, [activeCity, queryClient]);

  return (
    <CityContext.Provider value={{ activeCity, availableCities, isLoading, setActiveCity }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCity(): CityContextValue {
  const ctx = useContext(CityContext);
  if (!ctx) {
    // Fallback seguro fora do provider (ex: páginas públicas)
    return {
      activeCity: readStored(),
      availableCities: ['minacu'],
      isLoading: false,
      setActiveCity: () => {},
    };
  }
  return ctx;
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/contexts/AppContext';
import { useCity } from '@/contexts/CityContext';
import { canSeeTemperature, fetchClientTemperatures, type ClientTemperatureItem } from '@/lib/clientTemperature';

/** Temperatura dos clientes da cidade ativa (só para a gestão; para os outros papéis não busca nada). */
export function useClientTemperatures() {
  const { currentUser } = useApp();
  const { activeCity } = useCity();
  const roles = currentUser?.roles?.length ? currentUser.roles : currentUser ? [currentUser.role] : [];
  const allowed = canSeeTemperature(roles);
  const query = useQuery({
    queryKey: ['client-temperature', activeCity],
    queryFn: fetchClientTemperatures,
    enabled: allowed,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const byClient = useMemo(() => {
    const map: Record<string, ClientTemperatureItem> = {};
    for (const item of query.data?.clientes || []) map[item.client_id] = item;
    return map;
  }, [query.data]);
  return { ...query, allowed, byClient, items: query.data?.clientes || [] };
}

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchModuleAccess } from '@/services/schedulingApi';

/**
 * Módulos ocultos liberados por lista no servidor (tabela module_access), além do papel.
 * Hoje: 'agendamentos'. Sem resposta do servidor, nada é liberado.
 */
export function useModuleAccess() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['module-access', user?.id ?? null],
    queryFn: fetchModuleAccess,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const modules = query.data ?? [];
  return {
    modules,
    has: (module: string) => modules.includes(module),
    loading: !!user && query.isLoading,
  };
}

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useModuleAccess } from '@/hooks/useModuleAccess';

/**
 * Tela de módulo oculto: sem estar na lista do servidor, volta para o início (nem o admin passa).
 * Com uma lista, basta um dos módulos (ex.: Treinar agentes abre com Pulse Plus ou com 'treino_agentes').
 */
export default function RequireModuleAccess({ module, children }: { module: string | string[]; children: ReactNode }) {
  const { has, loading } = useModuleAccess();
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }
  const modules = Array.isArray(module) ? module : [module];
  if (!modules.some((m) => has(m))) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

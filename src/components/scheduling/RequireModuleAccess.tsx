import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useModuleAccess } from '@/hooks/useModuleAccess';

/** Tela de módulo oculto: sem estar na lista do servidor, volta para o início (nem o admin passa). */
export default function RequireModuleAccess({ module, children }: { module: string; children: ReactNode }) {
  const { has, loading } = useModuleAccess();
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }
  if (!has(module)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

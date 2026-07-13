import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function RequireSocioGestor({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/gestao/login" replace state={{ from: location }} />;
  const role = profile?.role;
  const allowed = role === 'socio_gestor' || role === 'admin';
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-bold">Acesso restrito</h1>
          <p className="text-muted-foreground">
            Este painel é exclusivo para <strong>Sócios Gestores</strong>. Fale com o administrador para receber acesso.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

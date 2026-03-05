import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import VideomakerDashboard from "@/pages/VideomakerDashboard";
import EndomarketingDashboard from "@/pages/EndomarketingDashboard";
import EndomarketingClientes from "@/pages/EndomarketingClientes";
import EndomarketingAgenda from "@/pages/EndomarketingAgenda";
import Clients from "@/pages/Clients";
import Team from "@/pages/Team";
import Schedule from "@/pages/Schedule";
import Goals from "@/pages/Goals";
import CompanySettings from "@/pages/CompanySettings";
import Scripts from "@/pages/Scripts";
import WhatsAppDashboard from "@/pages/WhatsAppDashboard";
import Plans from "@/pages/Plans";
import DeliveryRecords from "@/pages/DeliveryRecords";
import Reports from "@/pages/Reports";
import InternalReports from "@/pages/InternalReports";
import SocialMediaDeliveries from "@/pages/SocialMediaDeliveries";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Carregando...</p></div>;
  if (!user) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { currentUser } = useApp();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          {currentUser?.role === 'videomaker' ? <VideomakerDashboard /> :
           currentUser?.role === 'endomarketing' ? <EndomarketingDashboard /> :
           <Dashboard />}
        </ProtectedRoute>
      } />
      <Route path="/agenda" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
      <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/equipe" element={<ProtectedRoute><Team /></ProtectedRoute>} />
      <Route path="/roteiros" element={<ProtectedRoute><Scripts /></ProtectedRoute>} />
      <Route path="/metas" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><CompanySettings /></ProtectedRoute>} />
      <Route path="/endomarketing" element={<ProtectedRoute><EndomarketingDashboard /></ProtectedRoute>} />
      <Route path="/endomarketing/clientes" element={<ProtectedRoute><EndomarketingClientes /></ProtectedRoute>} />
      <Route path="/endomarketing/agenda" element={<ProtectedRoute><EndomarketingAgenda /></ProtectedRoute>} />
      <Route path="/planos" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
      <Route path="/entregas" element={<ProtectedRoute><DeliveryRecords /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/desempenho" element={<ProtectedRoute><InternalReports /></ProtectedRoute>} />
      <Route path="/entregas-social" element={<ProtectedRoute><SocialMediaDeliveries /></ProtectedRoute>} />
      <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppDashboard /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <AppProvider>
            <AppRoutes />
          </AppProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

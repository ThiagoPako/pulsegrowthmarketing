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
import EndomarketingContracts from "@/pages/EndomarketingContracts";
import EndomarketingTasks from "@/pages/EndomarketingTasks";
import EndomarketingReports from "@/pages/EndomarketingReports";
import EndomarketingCalendar from "@/pages/EndomarketingCalendar";
import EndomarketingPartnerPanel from "@/pages/EndomarketingPartnerPanel";
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
import ContentKanban from "@/pages/ContentKanban";
import EditorDashboard from "@/pages/EditorDashboard";
import EditorKanban from "@/pages/EditorKanban";
import FinancialDashboard from "@/pages/FinancialDashboard";
import FinancialContracts from "@/pages/FinancialContracts";
import FinancialRevenues from "@/pages/FinancialRevenues";
import FinancialExpenses from "@/pages/FinancialExpenses";
import FinancialDelinquency from "@/pages/FinancialDelinquency";
import FinancialReports from "@/pages/FinancialReports";
import FinancialSettings from "@/pages/FinancialSettings";
import FinancialCashReserve from "@/pages/FinancialCashReserve";
import FinancialMovements from "@/pages/FinancialMovements";
import FinancialPartners from "@/pages/FinancialPartners";
import NotFound from "@/pages/NotFound";
import ClientOnboarding from "@/pages/ClientOnboarding";
import DesignerKanban from "@/pages/DesignerKanban";

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
           currentUser?.role === 'editor' ? <EditorDashboard /> :
           currentUser?.role === 'parceiro' ? <EndomarketingDashboard /> :
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
      <Route path="/endomarketing/contratos" element={<ProtectedRoute><EndomarketingContracts /></ProtectedRoute>} />
      <Route path="/endomarketing/tarefas" element={<ProtectedRoute><EndomarketingTasks /></ProtectedRoute>} />
      <Route path="/endomarketing/relatorios" element={<ProtectedRoute><EndomarketingReports /></ProtectedRoute>} />
      <Route path="/endomarketing/calendario" element={<ProtectedRoute><EndomarketingCalendar /></ProtectedRoute>} />
      {/* Legacy redirects */}
      <Route path="/endomarketing/clientes" element={<Navigate to="/endomarketing/contratos" replace />} />
      <Route path="/endomarketing/agenda" element={<Navigate to="/endomarketing/tarefas" replace />} />
      <Route path="/planos" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
      <Route path="/entregas" element={<ProtectedRoute><DeliveryRecords /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/desempenho" element={<ProtectedRoute><InternalReports /></ProtectedRoute>} />
      <Route path="/entregas-social" element={<ProtectedRoute><SocialMediaDeliveries /></ProtectedRoute>} />
      <Route path="/conteudo" element={<ProtectedRoute><ContentKanban /></ProtectedRoute>} />
      <Route path="/edicao" element={<ProtectedRoute><EditorDashboard /></ProtectedRoute>} />
      <Route path="/edicao/kanban" element={<ProtectedRoute><EditorKanban /></ProtectedRoute>} />
      <Route path="/designer" element={<ProtectedRoute><DesignerKanban /></ProtectedRoute>} />
      <Route path="/whatsapp" element={<ProtectedRoute><WhatsAppDashboard /></ProtectedRoute>} />
      <Route path="/financeiro" element={<ProtectedRoute><FinancialDashboard /></ProtectedRoute>} />
      <Route path="/financeiro/contratos" element={<ProtectedRoute><FinancialContracts /></ProtectedRoute>} />
      <Route path="/financeiro/receitas" element={<ProtectedRoute><FinancialRevenues /></ProtectedRoute>} />
      <Route path="/financeiro/despesas" element={<ProtectedRoute><FinancialExpenses /></ProtectedRoute>} />
      <Route path="/financeiro/inadimplencia" element={<ProtectedRoute><FinancialDelinquency /></ProtectedRoute>} />
      <Route path="/financeiro/relatorios" element={<ProtectedRoute><FinancialReports /></ProtectedRoute>} />
      <Route path="/financeiro/configuracoes" element={<ProtectedRoute><FinancialSettings /></ProtectedRoute>} />
      <Route path="/financeiro/caixa" element={<ProtectedRoute><FinancialCashReserve /></ProtectedRoute>} />
      <Route path="/financeiro/movimentacoes" element={<ProtectedRoute><FinancialMovements /></ProtectedRoute>} />
      <Route path="/financeiro/parceiros" element={<ProtectedRoute><FinancialPartners /></ProtectedRoute>} />
      <Route path="/onboarding/:clientId" element={<ClientOnboarding />} />
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

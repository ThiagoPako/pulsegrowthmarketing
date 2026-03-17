import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";
import Login from "@/pages/Login";

// Lazy-loaded pages for code splitting
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const VideomakerDashboard = lazy(() => import("@/pages/VideomakerDashboard"));
const EndomarketingDashboard = lazy(() => import("@/pages/EndomarketingDashboard"));
const EndomarketingContracts = lazy(() => import("@/pages/EndomarketingContracts"));
const EndomarketingTasks = lazy(() => import("@/pages/EndomarketingTasks"));
const EndomarketingReports = lazy(() => import("@/pages/EndomarketingReports"));
const EndomarketingCalendar = lazy(() => import("@/pages/EndomarketingCalendar"));
const EndomarketingPartnerPanel = lazy(() => import("@/pages/EndomarketingPartnerPanel"));
const Clients = lazy(() => import("@/pages/Clients"));
const Team = lazy(() => import("@/pages/Team"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const Goals = lazy(() => import("@/pages/Goals"));
const CompanySettings = lazy(() => import("@/pages/CompanySettings"));
const Scripts = lazy(() => import("@/pages/Scripts"));
const WhatsAppDashboard = lazy(() => import("@/pages/WhatsAppDashboard"));
const Plans = lazy(() => import("@/pages/Plans"));
const DeliveryRecords = lazy(() => import("@/pages/DeliveryRecords"));
const Reports = lazy(() => import("@/pages/Reports"));
const InternalReports = lazy(() => import("@/pages/InternalReports"));
const SocialMediaDeliveries = lazy(() => import("@/pages/SocialMediaDeliveries"));
const ContentKanban = lazy(() => import("@/pages/ContentKanban"));
const EditorDashboard = lazy(() => import("@/pages/EditorDashboard"));
const EditorKanban = lazy(() => import("@/pages/EditorKanban"));
const FinancialDashboard = lazy(() => import("@/pages/FinancialDashboard"));
const FinancialContracts = lazy(() => import("@/pages/FinancialContracts"));
const FinancialRevenues = lazy(() => import("@/pages/FinancialRevenues"));
const FinancialExpenses = lazy(() => import("@/pages/FinancialExpenses"));
const FinancialDelinquency = lazy(() => import("@/pages/FinancialDelinquency"));
const FinancialReports = lazy(() => import("@/pages/FinancialReports"));
const FinancialSettings = lazy(() => import("@/pages/FinancialSettings"));
const FinancialCashReserve = lazy(() => import("@/pages/FinancialCashReserve"));
const FinancialMovements = lazy(() => import("@/pages/FinancialMovements"));
const FinancialPartners = lazy(() => import("@/pages/FinancialPartners"));
const FinancialChat = lazy(() => import("@/pages/FinancialChat"));
const FinancialApiSettings = lazy(() => import("@/pages/FinancialApiSettings"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const ClientOnboarding = lazy(() => import("@/pages/ClientOnboarding"));
const DesignerKanban = lazy(() => import("@/pages/DesignerKanban"));
const DesignerDashboard = lazy(() => import("@/pages/DesignerDashboard"));
const DesignerReports = lazy(() => import("@/pages/DesignerReports"));
const OnboardingManagement = lazy(() => import("@/pages/OnboardingManagement"));
const ClientBriefing = lazy(() => import("@/pages/ClientBriefing"));
const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
const ContentManager = lazy(() => import("@/pages/ContentManager"));
const ClientPortalLogin = lazy(() => import("@/pages/ClientPortalLogin"));
const ClientPortalRegister = lazy(() => import("@/pages/ClientPortalRegister"));
const TrafficManagement = lazy(() => import("@/pages/TrafficManagement"));
const AutomationFlows = lazy(() => import("@/pages/AutomationFlows"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { currentUser } = useApp();

  if (loading) return <PageLoader />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            {currentUser?.role === 'videomaker' ? <VideomakerDashboard /> :
             currentUser?.role === 'endomarketing' ? <EndomarketingDashboard /> :
             currentUser?.role === 'editor' ? <EditorDashboard /> :
             currentUser?.role === 'designer' ? <DesignerDashboard /> :
             currentUser?.role === 'fotografo' ? <DesignerDashboard /> :
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
        <Route path="/designer/relatorios" element={<ProtectedRoute><DesignerReports /></ProtectedRoute>} />
        <Route path="/onboarding-gestao" element={<ProtectedRoute><OnboardingManagement /></ProtectedRoute>} />
        <Route path="/briefing/:clientId" element={<ClientBriefing />} />
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
        <Route path="/financeiro/chat" element={<ProtectedRoute><FinancialChat /></ProtectedRoute>} />
        <Route path="/financeiro/apis" element={<ProtectedRoute><FinancialApiSettings /></ProtectedRoute>} />
        <Route path="/onboarding/:clientId" element={<ClientOnboarding />} />
        <Route path="/portal-login/:clientId" element={<ClientPortalLogin />} />
        <Route path="/portal-registro/:clientId" element={<ClientPortalRegister />} />
        <Route path="/portal/:clientId" element={<ClientPortal />} />
        <Route path="/conteudos-portal" element={<ProtectedRoute><ContentManager /></ProtectedRoute>} />
        <Route path="/trafego" element={<ProtectedRoute><TrafficManagement /></ProtectedRoute>} />
        <Route path="/automacoes" element={<ProtectedRoute><AutomationFlows /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <ErrorBoundary>
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
  </ErrorBoundary>
);

export default App;

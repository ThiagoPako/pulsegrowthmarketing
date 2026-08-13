import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Toaster as Sonner, Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CityProvider } from "@/contexts/CityContext";
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
const ReportsHub = lazy(() => import("@/pages/ReportsHub"));
const CostByContentType = lazy(() => import("@/pages/CostByContentType"));
const InternalReports = lazy(() => import("@/pages/InternalReports"));
const SocialMediaDeliveries = lazy(() => import("@/pages/SocialMediaDeliveries"));
const ContentKanban = lazy(() => import("@/pages/ContentKanban"));
const EditorDashboard = lazy(() => import("@/pages/EditorDashboard"));
const EditorKanban = lazy(() => import("@/pages/EditorKanban"));
const FinancialDashboard = lazy(() => import("@/pages/FinancialDashboard"));
const FinancialContracts = lazy(() => import("@/pages/FinancialContracts"));
const ContractsManagement = lazy(() => import("@/pages/ContractsManagement"));
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
const FinancialEmpresaSaude = lazy(() => import("@/pages/FinancialEmpresaSaude"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const ClientOnboarding = lazy(() => import("@/pages/ClientOnboarding"));
const DesignerKanban = lazy(() => import("@/pages/DesignerKanban"));
const DesignerDashboard = lazy(() => import("@/pages/DesignerDashboard"));
const DesignerReports = lazy(() => import("@/pages/DesignerReports"));
const ClientArtPlaybook = lazy(() => import("@/pages/ClientArtPlaybook"));
const OnboardingManagement = lazy(() => import("@/pages/OnboardingManagement"));
const ClientBriefing = lazy(() => import("@/pages/ClientBriefing"));
const GestaoLogin = lazy(() => import("@/pages/GestaoLogin"));
const GestaoDashboard = lazy(() => import("@/pages/GestaoDashboard"));
const GestaoCustos = lazy(() => import("@/pages/GestaoCustos"));
const GestaoHistorico = lazy(() => import("@/pages/GestaoHistorico"));
const RequireSocioGestor = lazy(() => import("@/components/gestao/RequireSocioGestor"));
const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
const ContentManager = lazy(() => import("@/pages/ContentManager"));
const ClientPortalLogin = lazy(() => import("@/pages/ClientPortalLogin"));
const ClientPortalRegister = lazy(() => import("@/pages/ClientPortalRegister"));
const TrafficManagement = lazy(() => import("@/pages/TrafficManagement"));
const AutomationFlows = lazy(() => import("@/pages/AutomationFlows"));
const FlyerTemplates = lazy(() => import("@/pages/FlyerTemplates"));
const PortalVideosAdmin = lazy(() => import("@/pages/PortalVideosAdmin"));
const ClientRelationship = lazy(() => import("@/pages/ClientRelationship"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const ClientFeedback = lazy(() => import("@/pages/ClientFeedback"));
const TestimonialsAdmin = lazy(() => import("@/pages/TestimonialsAdmin"));
const LandingPageAdmin = lazy(() => import("@/pages/LandingPageAdmin"));
const Apresentacao = lazy(() => import("@/pages/Apresentacao"));
const ApresentacaoPlano = lazy(() => import("@/pages/ApresentacaoPlano"));
const PlanPromotionsAdmin = lazy(() => import("@/pages/PlanPromotionsAdmin"));
const CommercialProposal = lazy(() => import("@/pages/CommercialProposal"));
const ProposalViewer = lazy(() => import("@/pages/ProposalViewer"));
const RecordingControl = lazy(() => import("@/pages/RecordingControl"));
const EditingControl = lazy(() => import("@/pages/EditingControl"));
const AvulsoApproval = lazy(() => import("@/pages/AvulsoApproval"));
const DiscountClub = lazy(() => import("@/pages/DiscountClub"));
const DiscountClubHome = lazy(() => import("@/pages/DiscountClubHome"));
const DiscountAdmin = lazy(() => import("@/pages/DiscountAdmin"));
const TvDashboard = lazy(() => import("@/pages/TvDashboard"));
const TvPanelControl = lazy(() => import("@/pages/TvPanelControl"));
const CancellationReports = lazy(() => import("@/pages/CancellationReports"));
const EventRegistration = lazy(() => import("@/pages/EventRegistration"));
const TrainingManager = lazy(() => import("@/pages/TrainingManager"));
const CRM = lazy(() => import("@/pages/CRM"));
const LinkShortener = lazy(() => import("@/pages/LinkShortener"));
const ShortLinkRedirect = lazy(() => import("@/pages/ShortLinkRedirect"));
const PublicReschedule = lazy(() => import("@/pages/PublicReschedule"));
const Regulations = lazy(() => import("@/pages/Regulations"));
const RegulationRedirect = lazy(() => import("@/pages/RegulationRedirect"));
const Training = lazy(() => import("@/pages/Training"));
const TrainingRegister = lazy(() => import("@/pages/TrainingRegister"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const CampaignDetail = lazy(() => import("@/pages/CampaignDetail"));
const OptimizationFormatsGuide = lazy(() => import("@/pages/OptimizationFormatsGuide"));
const CampaignPlaybook = lazy(() => import("@/pages/CampaignPlaybook"));
const TeamOrgChart = lazy(() => import("@/pages/TeamOrgChart"));
const TeamPresentation = lazy(() => import("@/pages/TeamPresentation"));
const Copy = lazy(() => import("@/pages/Copy"));
const RepairAuth = lazy(() => import("@/pages/RepairAuth"));



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

/**
 * Route guard: só renderiza a rota protegida depois que a sessão (`user`) E o
 * perfil/role (`currentUser`) estiverem resolvidos. Isso evita o "flash" do
 * Painel de Controle genérico e o carregamento pesado desnecessário antes de
 * sabermos qual painel pertence ao usuário.
 *
 * Fallback de segurança: se o perfil não resolver em 8s (ex.: erro de rede),
 * liberamos a renderização para não travar o app em loader infinito.
 */
function ProtectedRoute({
  children,
  noLayout = false,
  requireProfile = true,
}: {
  children: React.ReactNode;
  noLayout?: boolean;
  requireProfile?: boolean;
}) {
  const { user, loading } = useAuth();
  const { currentUser } = useApp();
  const [profileTimedOut, setProfileTimedOut] = useState(false);
  const profileResolvedOnce = useRef(false);

  if (currentUser) profileResolvedOnce.current = true;

  useEffect(() => {
    if (currentUser || !user) {
      setProfileTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setProfileTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, [currentUser, user]);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (requireProfile && !currentUser && !profileResolvedOnce.current && !profileTimedOut) return <PageLoader />;
  if (noLayout) return <>{children}</>;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { currentUser } = useApp();

  if (loading) return <PageLoader />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/gestao/login" element={<GestaoLogin />} />
        <Route path="/gestao" element={<RequireSocioGestor><GestaoDashboard /></RequireSocioGestor>} />
        <Route path="/gestao/custos" element={<RequireSocioGestor><GestaoCustos /></RequireSocioGestor>} />
        <Route path="/gestao/historico" element={<RequireSocioGestor><GestaoHistorico /></RequireSocioGestor>} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            {/* A role já está resolvida aqui (garantido pelo ProtectedRoute),
                então o painel correto é renderizado direto, sem flash. */}
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
        <Route path="/equipe/apresentacao" element={<TeamPresentation />} />
        <Route path="/roteiros" element={<ProtectedRoute><Scripts /></ProtectedRoute>} />
        <Route path="/copy" element={<ProtectedRoute><Copy /></ProtectedRoute>} />
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
        <Route path="/relatorios" element={<ProtectedRoute><ReportsHub /></ProtectedRoute>} />
        <Route path="/relatorios/geral" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/desempenho" element={<ProtectedRoute><InternalReports /></ProtectedRoute>} />
        <Route path="/relatorios/custo-conteudo" element={<ProtectedRoute><CostByContentType /></ProtectedRoute>} />
        <Route path="/custo-conteudo" element={<ProtectedRoute><CostByContentType /></ProtectedRoute>} />

        <Route path="/entregas-social" element={<ProtectedRoute><SocialMediaDeliveries /></ProtectedRoute>} />
        <Route path="/conteudo" element={<ProtectedRoute><ContentKanban /></ProtectedRoute>} />
        <Route path="/edicao" element={<ProtectedRoute><EditorDashboard /></ProtectedRoute>} />
        <Route path="/edicao/kanban" element={<ProtectedRoute><EditorKanban /></ProtectedRoute>} />
        <Route path="/videomakers" element={<ProtectedRoute><VideomakerDashboard /></ProtectedRoute>} />
        <Route path="/designer" element={<ProtectedRoute><DesignerKanban /></ProtectedRoute>} />
        <Route path="/designer/relatorios" element={<ProtectedRoute><DesignerReports /></ProtectedRoute>} />
        <Route path="/onboarding-gestao" element={<ProtectedRoute><OnboardingManagement /></ProtectedRoute>} />
        <Route path="/gestao/contratos" element={<ProtectedRoute><ContractsManagement /></ProtectedRoute>} />
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
        <Route path="/financeiro/saude" element={<ProtectedRoute><FinancialEmpresaSaude /></ProtectedRoute>} />
        <Route path="/onboarding/:clientId" element={<ClientOnboarding />} />
        <Route path="/portal-login/:clientId" element={<ClientPortalLogin />} />
        <Route path="/portal-registro/:clientId" element={<ClientPortalRegister />} />
        <Route path="/portal/:clientId" element={<ClientPortal />} />
        <Route path="/conteudos-portal" element={<ProtectedRoute><ContentManager /></ProtectedRoute>} />
        <Route path="/trafego" element={<ProtectedRoute><TrafficManagement /></ProtectedRoute>} />
        <Route path="/automacoes" element={<ProtectedRoute><AutomationFlows /></ProtectedRoute>} />
        <Route path="/panfletagem" element={<ProtectedRoute><FlyerTemplates /></ProtectedRoute>} />
        <Route path="/portal-videos" element={<ProtectedRoute><PortalVideosAdmin /></ProtectedRoute>} />
        <Route path="/relacionamento" element={<ProtectedRoute><ClientRelationship /></ProtectedRoute>} />
        <Route path="/depoimentos" element={<ProtectedRoute><TestimonialsAdmin /></ProtectedRoute>} />
        <Route path="/landing-admin" element={<ProtectedRoute><LandingPageAdmin /></ProtectedRoute>} />
        <Route path="/propostas" element={<ProtectedRoute><CommercialProposal /></ProtectedRoute>} />
        <Route path="/apresentacao" element={<ProtectedRoute><Apresentacao /></ProtectedRoute>} />
        <Route path="/apresentacao/promocoes" element={<ProtectedRoute><PlanPromotionsAdmin /></ProtectedRoute>} />
        <Route path="/apresentacao/:plano" element={<ProtectedRoute><ApresentacaoPlano /></ProtectedRoute>} />
        {/* Rotas públicas para envio ao cliente (sem login) */}
        <Route path="/p/planos" element={<Apresentacao />} />
        <Route path="/p/planos/:plano" element={<ApresentacaoPlano />} />
        <Route path="/controle-gravacoes" element={<ProtectedRoute><RecordingControl /></ProtectedRoute>} />
        <Route path="/controle-edicao" element={<ProtectedRoute><EditingControl /></ProtectedRoute>} />
        <Route path="/proposta/:token" element={<ProposalViewer />} />
        <Route path="/avulso/:taskId" element={<AvulsoApproval />} />
        <Route path="/video-avulso/:taskId" element={<AvulsoApproval />} />
        <Route path="/feedback" element={<ClientFeedback />} />
        <Route path="/clube" element={<DiscountClubHome />} />
        <Route path="/clube/:clientId" element={<DiscountClub />} />
        <Route path="/clube-descontos" element={<ProtectedRoute><DiscountAdmin /></ProtectedRoute>} />
        <Route path="/painel-tv" element={<ProtectedRoute><TvPanelControl /></ProtectedRoute>} />
        <Route path="/cancelamentos" element={<ProtectedRoute><CancellationReports /></ProtectedRoute>} />
        <Route path="/treinamento-gestao" element={<ProtectedRoute><TrainingManager /></ProtectedRoute>} />
        <Route path="/treinamento" element={<ProtectedRoute noLayout><Training /></ProtectedRoute>} />
        <Route path="/treinamento/otimizacao-conteudo" element={<ProtectedRoute><OptimizationFormatsGuide /></ProtectedRoute>} />
        <Route path="/treinamento/campanhas-playbook" element={<ProtectedRoute><CampaignPlaybook /></ProtectedRoute>} />
        <Route path="/treinamento/organograma" element={<ProtectedRoute><TeamOrgChart /></ProtectedRoute>} />
        <Route path="/treinamento-registro" element={<TrainingRegister />} />
        <Route path="/evento/:token" element={<EventRegistration />} />
        <Route path="/crm" element={<ProtectedRoute><CRM /></ProtectedRoute>} />
        <Route path="/encurtador" element={<ProtectedRoute><LinkShortener /></ProtectedRoute>} />
        <Route path="/campanhas" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
        <Route path="/campanhas/:id" element={<ProtectedRoute><CampaignDetail /></ProtectedRoute>} />
        <Route path="/r/:slug" element={<ShortLinkRedirect />} />
        <Route path="/reagendar/:token" element={<Suspense fallback={<PageLoader />}><PublicReschedule /></Suspense>} />
        <Route path="/regulamentos" element={<ProtectedRoute><Regulations /></ProtectedRoute>} />
        <Route path="/regulamento/:slug" element={<RegulationRedirect />} />

        <Route path="/tv" element={<Suspense fallback={<PageLoader />}><TvDashboard /></Suspense>} />
        <Route path="/designer/playbook/:clientId" element={<ProtectedRoute><ClientArtPlaybook /></ProtectedRoute>} />
        <Route path="/repair-auth" element={<RepairAuth />} />
        <Route path="*" element={<NotFound />} />

      </Routes>
    </Suspense>
  );
}

const App = () => {
  useEffect(() => {
    // Cache-busting: Verifica se há uma nova versão e limpa cache se necessário
    const checkVersion = async () => {
      try {
        const response = await fetch('/build-version.json?t=' + Date.now());
        if (response.ok) {
          const data = await response.json();
          const lastVersion = localStorage.getItem('pulse_build_version');
          if (lastVersion && lastVersion !== data.version) {
            console.log('Nova versão detectada, limpando cache...');
            localStorage.setItem('pulse_build_version', data.version);
            window.location.reload();
          } else {
            localStorage.setItem('pulse_build_version', data.version);
          }
        }
      } catch (e) {
        console.warn('Falha ao verificar versão do build');
      }
    };
    checkVersion();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Sonner />

          <AuthProvider>
            <CityProvider>
              <BrowserRouter>
                <AppProvider>
                  <AppRoutes />
                </AppProvider>
              </BrowserRouter>
            </CityProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;

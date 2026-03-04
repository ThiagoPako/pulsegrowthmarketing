import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "@/contexts/AppContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import VideomakerDashboard from "@/pages/VideomakerDashboard";
import Clients from "@/pages/Clients";
import Team from "@/pages/Team";
import Schedule from "@/pages/Schedule";

import Goals from "@/pages/Goals";
import CompanySettings from "@/pages/CompanySettings";
import Scripts from "@/pages/Scripts";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { currentUser } = useApp();
  return (
    <Routes>
      <Route path="/" element={currentUser ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={<ProtectedRoute>{currentUser?.role === 'videomaker' ? <VideomakerDashboard /> : <Dashboard />}</ProtectedRoute>} />
      <Route path="/agenda" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
      <Route path="/clientes" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/equipe" element={<ProtectedRoute><Team /></ProtectedRoute>} />
      
      <Route path="/roteiros" element={<ProtectedRoute><Scripts /></ProtectedRoute>} />
      <Route path="/metas" element={<ProtectedRoute><Goals /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><CompanySettings /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AppProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

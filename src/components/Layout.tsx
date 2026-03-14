import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABELS } from '@/types';
import pulseLogo from '@/assets/pulse_logo.png';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/UserAvatar';
import ProfileDialog from '@/components/ProfileDialog';
import {
  LayoutDashboard, Users, Building2, Calendar, CalendarDays, Settings, LogOut, Target, Search, FileText, Megaphone, MessageSquare, Package, ClipboardList, BarChart3, Share2, DollarSign, Kanban, Scissors, Palette, UserPlus, MonitorPlay
} from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';

type NavCategory = {
  label: string;
  items: { path: string; label: string; icon: any; roles: string[] }[];
};

const navCategories: NavCategory[] = [
  {
    label: 'Principal',
    items: [
      { path: '/dashboard', label: 'Início', icon: LayoutDashboard, roles: ['admin', 'videomaker', 'social_media', 'editor', 'endomarketing', 'parceiro', 'designer', 'fotografo'] },
      { path: '/conteudo', label: 'Conteúdo', icon: Kanban, roles: ['admin', 'social_media', 'videomaker', 'editor'] },
      { path: '/agenda', label: 'Agenda', icon: Calendar, roles: ['admin', 'videomaker', 'social_media'] },
      { path: '/roteiros', label: 'Roteiros', icon: FileText, roles: ['admin', 'social_media', 'videomaker'] },
    ],
  },
  {
    label: 'Produção',
    items: [
      { path: '/entregas-social', label: 'Social', icon: Share2, roles: ['admin', 'social_media'] },
      { path: '/edicao', label: 'Edição', icon: Scissors, roles: ['admin', 'editor', 'social_media'] },
      { path: '/designer', label: 'Designer', icon: Palette, roles: ['admin', 'social_media', 'fotografo', 'designer'] },
      { path: '/designer/relatorios', label: 'Produtividade D.', icon: BarChart3, roles: ['admin', 'social_media', 'designer'] },
      { path: '/conteudos-portal', label: 'Portal', icon: MonitorPlay, roles: ['admin', 'social_media', 'editor'] },
      { path: '/entregas', label: 'Entregas', icon: ClipboardList, roles: ['admin', 'social_media'] },
      { path: '/desempenho', label: 'Desempenho', icon: Target, roles: ['admin', 'social_media'] },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { path: '/clientes', label: 'Clientes', icon: Building2, roles: ['admin', 'social_media', 'designer', 'fotografo'] },
      { path: '/onboarding-gestao', label: 'Onboarding', icon: UserPlus, roles: ['admin', 'social_media'] },
      { path: '/equipe', label: 'Equipe', icon: Users, roles: ['admin', 'social_media'] },
      { path: '/planos', label: 'Planos', icon: Package, roles: ['admin', 'social_media'] },
      { path: '/metas', label: 'Metas', icon: Target, roles: ['admin', 'social_media'] },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { path: '/endomarketing', label: 'Endomkt', icon: Megaphone, roles: ['admin', 'endomarketing', 'social_media', 'parceiro'] },
      { path: '/endomarketing/contratos', label: 'Contratos E.', icon: Package, roles: ['admin', 'endomarketing', 'parceiro'] },
      { path: '/endomarketing/tarefas', label: 'Tarefas E.', icon: ClipboardList, roles: ['admin', 'endomarketing', 'parceiro'] },
      { path: '/endomarketing/relatorios', label: 'Relatórios E.', icon: BarChart3, roles: ['admin', 'endomarketing', 'parceiro'] },
      { path: '/endomarketing/calendario', label: 'Calendário E.', icon: CalendarDays, roles: ['admin', 'endomarketing', 'parceiro'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { path: '/financeiro', label: 'Financeiro', icon: DollarSign, roles: ['admin'] },
      { path: '/integracoes', label: 'Integrações', icon: Settings, roles: ['admin', 'social_media'] },
      { path: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'social_media'] },
      { path: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, roles: ['admin', 'social_media'] },
      { path: '/configuracoes', label: 'Config', icon: Settings, roles: ['admin', 'social_media'] },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const filteredCategories = navCategories
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item => currentUser && item.roles.includes(currentUser.role)),
    }))
    .filter(cat => cat.items.length > 0);

  const allFilteredItems = filteredCategories.flatMap(c => c.items);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Collapsible sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-300 ease-in-out ${sidebarExpanded ? 'w-[210px]' : 'w-[60px]'}`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <div className={`p-3 flex items-center border-b border-sidebar-border gap-2 ${sidebarExpanded ? 'px-4' : 'justify-center'}`}>
          <img src={pulseLogo} alt="Pulse" className="w-8 h-8 rounded-lg object-cover shrink-0" />
          {sidebarExpanded && (
            <span className="font-display font-bold text-sm text-foreground whitespace-nowrap overflow-hidden">Pulse</span>
          )}
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 py-2 px-1.5 overflow-y-auto">
          {filteredCategories.map((cat, catIdx) => (
            <div key={cat.label} className="w-full">
              {catIdx > 0 && (
                <div className="my-1.5 mx-2 h-px bg-sidebar-border" />
              )}
              {sidebarExpanded && (
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 mb-1 block whitespace-nowrap overflow-hidden">
                  {cat.label}
                </span>
              )}
              {cat.items.map(item => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`w-full group flex items-center gap-2.5 rounded-xl transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm ${
                      sidebarExpanded ? 'px-3 py-2' : 'flex-col px-2 py-2'
                    } ${active ? 'bg-sidebar-accent text-primary shadow-sm' : 'text-sidebar-foreground'}`}
                    title={!sidebarExpanded ? item.label : undefined}
                  >
                    <item.icon size={18} strokeWidth={active ? 2.2 : 1.5} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                    {sidebarExpanded ? (
                      <span className="text-[13px] font-medium whitespace-nowrap overflow-hidden">{item.label}</span>
                    ) : (
                      <span className="text-[10px] font-medium leading-none">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={`p-2 border-t border-sidebar-border flex flex-col gap-2 ${sidebarExpanded ? 'items-stretch' : 'items-center'}`}>
          <ProfileDialog>
            <button
              className={`flex items-center gap-2.5 rounded-xl transition-all duration-200 hover:bg-sidebar-accent ${sidebarExpanded ? 'px-3 py-2 w-full' : 'w-9 h-9 justify-center'} overflow-hidden`}
              title={currentUser?.displayName || currentUser?.name}
            >
              {currentUser && <UserAvatar user={currentUser} size="sm" />}
              {sidebarExpanded && currentUser && (
                <span className="text-xs font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                  {currentUser.displayName || currentUser.name}
                </span>
              )}
            </button>
          </ProfileDialog>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2.5 rounded-xl text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group ${sidebarExpanded ? 'px-3 py-2 w-full' : 'justify-center px-2 py-2'}`}
            title="Sair"
          >
            <LogOut size={16} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
            {sidebarExpanded && <span className="text-[13px] font-medium whitespace-nowrap">Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-4 shrink-0">
          {/* Mobile nav */}
          <div className="flex md:hidden gap-1 overflow-x-auto shrink-0">
            {allFilteredItems.slice(0, 5).map(item => {
              const active = location.pathname === item.path;
              return (
                <button key={item.path} onClick={() => navigate(item.path)}
                  className={`p-2 rounded-lg shrink-0 ${active ? 'bg-accent text-primary' : 'text-muted-foreground'}`}>
                  <item.icon size={18} />
                </button>
              );
            })}
          </div>

          <div className="flex-1 flex items-center gap-3 max-w-xl">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar clientes, gravações..." className="pl-9 bg-secondary border-0 h-9" />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <NotificationBell />
            {/* Mobile avatar */}
            <div className="md:hidden">
              <ProfileDialog>
                <button className="rounded-full overflow-hidden">
                  {currentUser && <UserAvatar user={currentUser} size="sm" />}
                </button>
              </ProfileDialog>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABELS } from '@/types';
import { useMyPermissions, AVAILABLE_MODULES } from '@/hooks/useUserPermissions';
import { useIsMobile } from '@/hooks/use-mobile';
import pulseLogo from '@/assets/pulse_logo.png';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/UserAvatar';
import ProfileDialog from '@/components/ProfileDialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutDashboard, Users, Building2, Calendar, CalendarDays, Settings, LogOut, Target, Search, FileText, Megaphone, MessageSquare, Package, ClipboardList, BarChart3, Share2, DollarSign, Kanban, Scissors, Palette, UserPlus, MonitorPlay, TrendingUp, Bot, Plug, Car, Menu, X, Video, Handshake, Star, Rocket, Type
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import NotificationBell from '@/components/NotificationBell';
import BirthdayOverlay from '@/components/BirthdayOverlay';
import ProductionAssistant from '@/components/ProductionAssistant';
import WelcomeRocket from '@/components/WelcomeRocket';

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
      { path: '/trafego', label: 'Tráfego', icon: TrendingUp, roles: ['admin', 'social_media'] },
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
      { path: '/relacionamento', label: 'Relacionamento', icon: Handshake, roles: ['admin', 'social_media'] },
      { path: '/depoimentos', label: 'Depoimentos', icon: Star, roles: ['admin', 'social_media'] },
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
      { path: '/financeiro/chat', label: 'Chat IA', icon: Bot, roles: ['admin'] },
      { path: '/financeiro/apis', label: 'APIs', icon: Plug, roles: ['admin'] },
      { path: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'social_media'] },
      { path: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, roles: ['admin', 'social_media'] },
      { path: '/automacoes', label: 'Automações', icon: Bot, roles: ['admin', 'social_media'] },
      { path: '/panfletagem', label: 'Panfletagem', icon: Car, roles: ['admin'] },
      { path: '/portal-videos', label: 'Vídeos Portal', icon: Video, roles: ['admin'] },
      { path: '/landing-admin', label: 'Landing Page', icon: Rocket, roles: ['admin'] },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { hasModuleAccess } = useMyPermissions();
  const isMobile = useIsMobile();

  const { updateProfile } = useAuth();
  const FONT_SCALES = [
    { label: 'Pequena', value: 'font-scale-sm', size: '13px' },
    { label: 'Normal', value: 'font-scale-base', size: '14px' },
    { label: 'Grande', value: 'font-scale-lg', size: '16px' },
    { label: 'Extra Grande', value: 'font-scale-xl', size: '18px' },
    { label: 'Padrão Victor', value: 'font-scale-victor', size: '22px' },
  ];
  const [fontScale, setFontScale] = useState(() => {
    return currentUser?.fontScale || localStorage.getItem('pulse_font_scale') || 'font-scale-base';
  });

  // Sync from profile when user loads
  useEffect(() => {
    if (currentUser?.fontScale && currentUser.fontScale !== fontScale) {
      setFontScale(currentUser.fontScale);
    }
  }, [currentUser?.fontScale]);

  useEffect(() => {
    const root = document.documentElement;
    FONT_SCALES.forEach(s => root.classList.remove(s.value));
    root.classList.add(fontScale);
  }, [fontScale]);

  const handleFontScaleChange = (newScale: string) => {
    setFontScale(newScale);
    // Persist to database
    updateProfile({ font_scale: newScale } as any);
  };

  const filteredCategories = navCategories
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item => {
        if (!currentUser) return false;
        if (!item.roles.includes(currentUser.role)) return false;
        if (currentUser.role === 'admin') return true;
        return hasModuleAccess(item.path);
      }),
    }))
    .filter(cat => cat.items.length > 0);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await signOut();
    navigate('/');
  };

  const handleNavigate = (path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  // Shared nav content renderer
  const renderNavItems = (expanded: boolean, onNav?: (path: string) => void) => (
    <nav className="flex-1 flex flex-col gap-0.5 py-2 px-1.5 overflow-y-auto">
      {filteredCategories.map((cat, catIdx) => (
        <div key={cat.label} className="w-full">
          {catIdx > 0 && (
            <div className="my-1.5 mx-2 h-px bg-sidebar-border" />
          )}
          {expanded && (
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-3 mb-1 block whitespace-nowrap overflow-hidden">
              {cat.label}
            </span>
          )}
          {cat.items.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => (onNav || navigate)(item.path)}
                className={`w-full group flex items-center gap-2.5 rounded-xl transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-sm ${
                  expanded ? 'px-3 py-2' : 'flex-col px-2 py-2'
                } ${active ? 'bg-sidebar-accent text-primary shadow-sm' : 'text-sidebar-foreground'}`}
                title={!expanded ? item.label : undefined}
              >
                <item.icon size={18} strokeWidth={active ? 2.2 : 1.5} className="shrink-0 transition-transform duration-200 group-hover:scale-110" />
                {expanded ? (
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
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <BirthdayOverlay />

      {/* Desktop sidebar */}
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

        {renderNavItems(sidebarExpanded)}

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
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center px-3 sm:px-4 lg:px-6 gap-2 sm:gap-4 shrink-0">
          {/* Mobile hamburger */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0">
                <Menu size={22} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 bg-sidebar border-sidebar-border flex flex-col">
              {/* Drawer header */}
              <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
                <img src={pulseLogo} alt="Pulse" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                <span className="font-display font-bold text-sm text-foreground">Pulse</span>
              </div>

              {/* Drawer nav */}
              {renderNavItems(true, handleNavigate)}

              {/* Drawer footer */}
              <div className="p-3 border-t border-sidebar-border flex flex-col gap-2">
                <ProfileDialog>
                  <button
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 w-full hover:bg-sidebar-accent transition-all duration-200 overflow-hidden"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {currentUser && <UserAvatar user={currentUser} size="sm" />}
                    {currentUser && (
                      <div className="flex flex-col items-start min-w-0">
                        <span className="text-xs font-medium text-foreground truncate max-w-[180px]">
                          {currentUser.displayName || currentUser.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                          {ROLE_LABELS[currentUser.role] || currentUser.role}
                        </span>
                      </div>
                    )}
                  </button>
                </ProfileDialog>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 rounded-xl text-sidebar-foreground px-3 py-2 w-full hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 group"
                >
                  <LogOut size={16} className="shrink-0" />
                  <span className="text-[13px] font-medium">Sair</span>
                </button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Search */}
          <div className="flex-1 flex items-center gap-3 max-w-xl min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={isMobile ? "Buscar..." : "Buscar clientes, gravações..."} className="pl-9 bg-secondary border-0 h-9 text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            {/* Font size control */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Tamanho da fonte">
                  <Type size={18} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2" align="end">
                <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Tamanho da Fonte</p>
                {FONT_SCALES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => handleFontScaleChange(s.value)}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${fontScale === s.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                  >
                    <span style={{ fontSize: s.size }}>{s.label}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
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
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Production Assistant Mascot */}
      <ProductionAssistant />
      <WelcomeRocket />
    </div>
  );
}

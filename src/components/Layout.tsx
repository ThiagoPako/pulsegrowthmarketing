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
  LayoutDashboard, Users, Building2, Calendar, CalendarDays, Settings, LogOut, Target, Search, FileText, Megaphone, MessageSquare, Package, ClipboardList, BarChart3, Share2, DollarSign, Kanban, Scissors, Palette, UserPlus, MonitorPlay, TrendingUp, Bot, Plug, Car, Menu, X, Video, Handshake, Star, Rocket, Type, Gift, Monitor, UserMinus, BookOpen, Sun, Moon, Gauge, Flame, Pin, PinOff
  , Sparkles, type LucideIcon,
} from 'lucide-react';

import { useTheme } from '@/hooks/useTheme';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import NotificationBell from '@/components/NotificationBell';
import MentionPopupListener from '@/components/MentionPopupListener';
import MentionsIndicator from '@/components/MentionsIndicator';
import BirthdayOverlay from '@/components/BirthdayOverlay';
import ProductionAssistant from '@/components/ProductionAssistant';
import WelcomeRocket from '@/components/WelcomeRocket';
import VirtualOffice from '@/components/VirtualOffice';
import QuickShortcutsBar from '@/components/QuickShortcutsBar';
import CitySwitcher from '@/components/CitySwitcher';
import { CATEGORY_TINT, CATEGORY_RGB, getTintForPath, type TintKey } from '@/lib/navTint';
import type { Profile } from '@/hooks/useAuth';

type NavCategory = {
  label: string;
  color: TintKey;
  speedometer?: boolean;
  featured?: boolean;
  highlight?: boolean;
  items: { path: string; label: string; icon: LucideIcon; roles: string[]; highlight?: boolean }[];
};




const navCategories: NavCategory[] = [

  {
    label: 'Principal',
    color: 'blue',
    items: [
      { path: '/dashboard', label: 'Início', icon: LayoutDashboard, roles: ['admin', 'videomaker', 'social_media', 'editor', 'endomarketing', 'parceiro', 'designer', 'fotografo', 'copywriter', 'gestor_projetos'] },
      { path: '/conteudo', label: 'Conteúdo', icon: Kanban, roles: ['admin', 'social_media', 'videomaker', 'editor', 'gestor_projetos'] },
    ],
  },

  {
    label: 'Tráfego',
    color: 'cyan',
    highlight: true,
    items: [
      { path: '/trafego', label: 'Tráfego', icon: TrendingUp, roles: ['admin', 'social_media'] },
    ],
  },


  {
    label: 'Gestão de Tarefas',
    color: 'emerald',
    items: [
      { path: '/controle-gravacoes', label: 'Controle Grav.', icon: Video, roles: ['admin', 'gestor_projetos'] },
      { path: '/controle-edicao', label: 'Controle Edição', icon: Scissors, roles: ['admin', 'gestor_projetos'] },
      { path: '/agenda', label: 'Agenda', icon: Calendar, roles: ['admin', 'videomaker', 'social_media', 'gestor_projetos'] },
    ],
  },

  {
    label: 'Produção',
    color: 'violet',
    items: [
      { path: '/edicao', label: 'Edição', icon: Scissors, roles: ['admin', 'editor', 'social_media', 'videomaker', 'gestor_projetos'] },
      { path: '/edicao/kanban', label: 'Kanban Edição', icon: Kanban, roles: ['admin', 'editor', 'social_media', 'videomaker', 'gestor_projetos'] },
      { path: '/videomakers', label: 'Videomakers', icon: Video, roles: ['admin', 'videomaker', 'social_media', 'gestor_projetos'] },
    ],
  },

  {
    label: 'Produção Criativa',
    color: 'cyan',
    items: [
      { path: '/entregas-social', label: 'Social', icon: Share2, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/roteiros', label: 'Roteiros', icon: FileText, roles: ['admin', 'social_media', 'videomaker', 'copywriter', 'gestor_projetos'] },
      { path: '/campanhas', label: 'Campanhas', icon: Megaphone, roles: ['admin', 'social_media', 'copywriter', 'gestor_projetos'] },
      { path: '/designer', label: 'Designer', icon: Palette, roles: ['admin', 'social_media', 'fotografo', 'designer', 'gestor_projetos'] },
      { path: '/landing-admin', label: 'Landing Page', icon: Rocket, roles: ['admin'] },
    ],
  },

  {
    label: 'Portal',
    color: 'violet',
    highlight: true,
    items: [
      { path: '/conteudos-portal', label: 'Portal', icon: MonitorPlay, roles: ['admin', 'social_media', 'editor'] },
    ],
  },

  {
    label: 'Gestão',
    color: 'amber',
    items: [
      { path: '/clientes', label: 'Clientes', icon: Building2, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/relacionamento', label: 'Relacionamento', icon: Handshake, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/depoimentos', label: 'Depoimentos', icon: Star, roles: ['admin', 'social_media'] },
      { path: '/onboarding-gestao', label: 'Onboarding', icon: UserPlus, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/equipe', label: 'Equipe', icon: Users, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/planos', label: 'Planos', icon: Package, roles: ['admin', 'social_media'] },
      { path: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/desempenho', label: 'Desempenho', icon: Target, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/endomarketing/tarefas', label: 'Tarefas E.', icon: ClipboardList, roles: ['admin', 'endomarketing', 'parceiro'] },
    ],
  },

  {
    label: 'Comercial',
    color: 'rose',
    featured: true,
    items: [
      { path: '/crm', label: 'CRM', icon: Kanban, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/propostas', label: 'Propostas', icon: FileText, roles: ['admin'] },
      { path: '/apresentacao', label: 'Apresentação', icon: Sparkles, roles: ['admin'] },
      { path: '/metas', label: 'Metas', icon: Target, roles: ['admin', 'social_media', 'gestor_projetos'] },
    ],
  },

  {
    label: 'Endomarketing',
    color: 'emerald',
    items: [
      { path: '/endomarketing', label: 'Endomkt', icon: Megaphone, roles: ['admin', 'endomarketing', 'social_media', 'parceiro'] },
      { path: '/endomarketing/contratos', label: 'Contratos E.', icon: Package, roles: ['admin', 'endomarketing', 'parceiro'] },
      { path: '/endomarketing/relatorios', label: 'Relatórios E.', icon: BarChart3, roles: ['admin', 'endomarketing', 'parceiro'] },
      { path: '/endomarketing/calendario', label: 'Calendário E.', icon: CalendarDays, roles: ['admin', 'endomarketing', 'parceiro'] },
    ],
  },

  {
    label: 'Administrativa',
    color: 'emerald',
    speedometer: true,
    items: [
      { path: '/financeiro', label: 'Financeiro', icon: Gauge, roles: ['admin'] },
      { path: '/custo-conteudo', label: 'Pente Fino', icon: Flame, roles: ['admin'] },
    ],
  },

  {
    label: 'Ferramentas',
    color: 'slate',
    items: [
      { path: '/panfletagem', label: 'Panfletagem', icon: Car, roles: ['admin'] },
      { path: '/encurtador', label: 'Encurtador', icon: Type, roles: ['admin', 'social_media'] },
      { path: '/clube-descontos', label: 'Clube Descontos', icon: Gift, roles: ['admin', 'social_media'] },
      { path: '/regulamentos', label: 'Regulamentos', icon: FileText, roles: ['admin', 'social_media'] },
    ],
  },

  {
    label: 'Sistema',
    color: 'slate',
    items: [
      { path: '/financeiro/chat', label: 'Chat IA', icon: Bot, roles: ['admin'] },
      { path: '/financeiro/apis', label: 'APIs', icon: Plug, roles: ['admin'] },
      { path: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/automacoes', label: 'Automações', icon: Bot, roles: ['admin', 'social_media', 'gestor_projetos'] },
      { path: '/painel-tv', label: 'Painel TV', icon: Monitor, roles: ['admin'] },
      { path: '/treinamento', label: 'Treinamento', icon: BookOpen, roles: ['admin', 'videomaker', 'social_media', 'editor', 'designer', 'fotografo', 'endomarketing'] },
      { path: '/treinamento-gestao', label: 'Gestão Trein.', icon: Settings, roles: ['admin'] },
      { path: '/portal-videos', label: 'Vídeos Portal', icon: Video, roles: ['admin'] },
      { path: '/configuracoes', label: 'Config', icon: Settings, roles: ['admin', 'social_media'] },
    ],
  },

];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarPinned, setSidebarPinned] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pulse:sidebarPinned') === '1';
  });
  const [sidebarHover, setSidebarHover] = useState(false);
  const sidebarExpanded = sidebarPinned || sidebarHover;
  const setSidebarExpanded = setSidebarHover; // legacy no-op alias (não usado após refactor)
  useEffect(() => {
    localStorage.setItem('pulse:sidebarPinned', sidebarPinned ? '1' : '0');
  }, [sidebarPinned]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { hasModuleAccess } = useMyPermissions();
  const isMobile = useIsMobile();
  const { theme, toggleTheme } = useTheme();

  const { updateProfile } = useAuth();
  const FONT_SCALES = [
    { label: 'Pequena', value: 'font-scale-sm', size: '13px' },
    { label: 'Normal', value: 'font-scale-base', size: '14px' },
    { label: 'Grande', value: 'font-scale-lg', size: '16px' },
    { label: 'Extra Grande', value: 'font-scale-xl', size: '18px' },
    { label: 'Padrão Victor', value: 'font-scale-victor', size: '22px' },
    { label: 'Victor 1.0', value: 'font-scale-victor1', size: '26px' },
  ];
  const [fontScale, setFontScale] = useState(() => {
    return currentUser?.fontScale || localStorage.getItem('pulse_font_scale') || 'font-scale-base';
  });

  // Sync from profile when user loads
  useEffect(() => {
    if (currentUser?.fontScale && currentUser.fontScale !== fontScale) {
      setFontScale(currentUser.fontScale);
      localStorage.setItem('pulse_font_scale', currentUser.fontScale);
    }
  }, [currentUser?.fontScale]);

  useEffect(() => {
    const root = document.documentElement;
    FONT_SCALES.forEach(s => root.classList.remove(s.value));
    root.classList.add(fontScale);
  }, [fontScale]);

  const handleFontScaleChange = (newScale: string) => {
    setFontScale(newScale);
    localStorage.setItem('pulse_font_scale', newScale);
    // Persist to database
    updateProfile({ font_scale: newScale } satisfies Partial<Profile>);
  };

  const filteredCategories = navCategories
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item => {
        if (!currentUser) return false;
        
        // Check role(s) — considera função principal + adicionais
        const userRoles = currentUser.roles && currentUser.roles.length ? currentUser.roles : [currentUser.role];
        const hasRole = item.roles.some(r => userRoles.includes(r as any));
        if (!hasRole) return false;

        // Admin has full access to everything in their roles
        if (userRoles.includes('admin' as any)) return true;

        // For others, check custom module permissions
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
      {filteredCategories.map((cat, catIdx) => {
        const tint = CATEGORY_TINT[cat.color] || CATEGORY_TINT.slate;
        const speed = cat.speedometer;
        const featured = cat.featured;
        const highlight = cat.highlight;
        return (
        <div key={cat.label} className="w-full">
          {catIdx > 0 && (
            <div className="my-1.5 mx-2 h-px bg-sidebar-border" />
          )}
          {expanded && !speed && !featured && !highlight && (
            <span
              className="text-[11px] uppercase tracking-wider font-bold mx-2 mb-1.5 px-2.5 py-1 rounded-md flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-white"
              style={{
                background: `linear-gradient(90deg, rgba(${CATEGORY_RGB[cat.color]},0.18), rgba(${CATEGORY_RGB[cat.color]},0.04))`,
                boxShadow: `inset 0 0 0 1px rgba(${CATEGORY_RGB[cat.color]},0.35), 0 0 12px -4px rgba(${CATEGORY_RGB[cat.color]},0.55)`,
              }}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${tint.dot}`}
                style={{ boxShadow: `0 0 8px rgba(${CATEGORY_RGB[cat.color]},0.9)` }}
              />
              {cat.label}
            </span>
          )}

          {/* Comercial (featured) — sem label textual, igual ao Administrativa/speed:
              o próprio painel neon abaixo já comunica o destaque. */}



          {featured && (
            <div className="relative mx-1 my-1 rounded-xl p-[1.5px] bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500 shadow-[0_0_18px_-4px_rgba(244,63,94,0.6)] animate-[pulse_3s_ease-in-out_infinite]">

              <div className="rounded-[10px] bg-sidebar/90 backdrop-blur-sm p-1 space-y-0.5">
                {cat.items.map(item => {
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        if (item.path === '/apresentacao') {
                          window.open(item.path, '_blank', 'noopener,noreferrer');
                        } else {
                          (onNav || navigate)(item.path);
                        }
                      }}
                      className={`w-full group flex items-center rounded-lg transition-all duration-200 ${
                        expanded ? 'gap-2.5 px-2.5 py-2' : 'flex-col gap-1 px-1 py-2'
                      } ${
                        active
                          ? 'bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500 text-white shadow-md shadow-pink-500/40'
                          : 'text-foreground hover:bg-gradient-to-r hover:from-rose-500/15 hover:via-pink-500/15 hover:to-fuchsia-500/15'
                      }`}
                      title={!expanded ? item.label : undefined}
                    >
                      <item.icon
                        size={expanded ? 18 : 20}
                        strokeWidth={2.2}
                        className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                          active ? 'text-white drop-shadow-[0_0_6px_rgba(244,114,182,0.9)]' : 'text-rose-500 drop-shadow-[0_0_4px_rgba(244,63,94,0.5)]'
                        }`}
                      />
                      {expanded ? (
                        <span className={`text-[13px] whitespace-nowrap font-bold tracking-wide ${active ? 'text-white' : 'text-foreground'}`}>{item.label}</span>
                      ) : (
                        <span className={`text-[9px] font-bold leading-none uppercase tracking-wider ${active ? 'text-white' : 'text-foreground/80'}`}>{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {speed && (
            <div className={`relative mx-1 my-1 rounded-xl p-[1.5px] bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 shadow-[0_0_18px_-4px_rgba(249,115,22,0.65)] animate-[pulse_2.5s_ease-in-out_infinite]`}>
              <div className="rounded-[10px] bg-sidebar/90 backdrop-blur-sm p-1 space-y-0.5">
                {cat.items.map(item => {
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => (onNav || navigate)(item.path)}
                      className={`w-full group flex items-center rounded-lg transition-all duration-200 ${
                        expanded ? 'gap-2.5 px-2.5 py-2' : 'flex-col gap-1 px-1 py-2'
                      } ${
                        active
                          ? 'bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 text-white shadow-md shadow-orange-500/40'
                          : 'text-orange-100 hover:bg-gradient-to-r hover:from-red-600/20 hover:via-orange-500/20 hover:to-yellow-400/20'
                      }`}
                      title={!expanded ? item.label : undefined}
                    >
                      <item.icon
                        size={expanded ? 18 : 20}
                        strokeWidth={2.2}
                        className={`shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6 ${
                          active ? 'text-white drop-shadow-[0_0_6px_rgba(255,180,60,0.9)]' : 'text-orange-400 drop-shadow-[0_0_4px_rgba(249,115,22,0.6)]'
                        }`}
                      />
                      {expanded ? (
                        <span className={`text-[13px] whitespace-nowrap font-bold tracking-wide ${active ? 'text-white' : 'text-foreground'}`}>{item.label}</span>
                      ) : (
                        <span className={`text-[9px] font-bold leading-none uppercase tracking-wider ${active ? 'text-white' : 'text-foreground/80'}`}>{item.label}</span>
                      )}
                      {active && expanded && (
                        <Flame size={14} className="ml-auto text-yellow-200 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {highlight && (() => {
            const rgb = CATEGORY_RGB[cat.color];
            return (
            <div
              className="relative mx-1 my-1 rounded-xl p-[1.5px] animate-[pulse_3s_ease-in-out_infinite]"
              style={{
                background: `linear-gradient(90deg, rgba(${rgb},0.9), rgba(${rgb},0.6), rgba(${rgb},0.9))`,
                boxShadow: `0 0 18px -4px rgba(${rgb},0.7)`,
              }}
            >
              <div className="rounded-[10px] bg-sidebar/90 backdrop-blur-sm p-1 space-y-0.5">
                {cat.items.map(item => {
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => (onNav || navigate)(item.path)}
                      className={`w-full group rounded-lg transition-all duration-200 ${
                        expanded ? 'px-2.5 py-2' : 'flex flex-col items-center gap-1 px-1 py-2'
                      } ${active ? 'text-white shadow-md' : 'text-foreground'}`}
                      style={active ? {
                        background: `linear-gradient(90deg, rgba(${rgb},1), rgba(${rgb},0.75))`,
                        boxShadow: `0 4px 12px -2px rgba(${rgb},0.5)`,
                      } : undefined}
                      title={!expanded ? item.label : undefined}
                    >
                      {(() => {
                        const isTrafego = item.path === '/trafego';
                        const MetaChip = (
                          <span
                            title="Meta Ads"
                            aria-label="Meta Ads"
                            className={`inline-flex items-center justify-center h-[18px] w-[18px] rounded-full shrink-0 ${active ? 'bg-white' : 'bg-white ring-1 ring-border/60'}`}
                          >
                            <svg viewBox="0 0 40 40" className="h-2.5 w-2.5 block" xmlns="http://www.w3.org/2000/svg">
                              <defs>
                                <linearGradient id={`metaGrad-${expanded ? 'e' : 'c'}`} x1="0%" y1="100%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor="#0064E1" />
                                  <stop offset="50%" stopColor="#0082FB" />
                                  <stop offset="100%" stopColor="#00C6FF" />
                                </linearGradient>
                              </defs>
                              <path fill={`url(#metaGrad-${expanded ? 'e' : 'c'})`} d="M20 6c-3.6 0-6.4 2.4-9 6.4C8.3 16.6 6 21.7 6 25.4c0 3.5 1.8 5.6 4.6 5.6 2.4 0 4.1-1.1 6.8-5.3l2.8-4.4c.3-.5.6-1 .9-1.4-.3-.5-.6-.9-.9-1.3-2.7-3.9-4.3-5-6.5-5-1.3 0-2.5.5-3.5 1.4 1.9-2.3 4.2-4 6.8-4 3 0 5.3 1.6 7.8 5.2 2.5 3.6 4.9 8.3 4.9 12.1 0 3.5-1.8 5.7-4.6 5.7-2.2 0-3.3-1-5.4-4.3l-2.1-3.4c1.4-2.2 2.4-3.6 3-4.4l.2-.3c1.2 2 1.9 3 3 4.7 1.1 1.7 1.7 2.2 2.5 2.2 1 0 1.5-.8 1.5-2 0-2.4-1.9-6.1-3.9-9-2-2.9-3.7-4-5.6-4-1.7 0-3.1 1-4.9 3.6l-.2.3c-.6.8-1.5 2.2-2.9 4.5l-2 3.2c-2 3.3-3.1 4.3-5.3 4.3z"/>
                            </svg>
                          </span>
                        );
                        const GoogleChip = (
                          <span
                            title="Google Ads"
                            aria-label="Google Ads"
                            className={`inline-flex items-center justify-center h-[18px] w-[18px] rounded-full shrink-0 ${active ? 'bg-white' : 'bg-white ring-1 ring-border/60'}`}
                          >
                            <svg viewBox="0 0 192 192" className="h-2.5 w-2.5 block" xmlns="http://www.w3.org/2000/svg">
                              <path fill="#FBBC04" d="M63.7 15.4L7.6 112.4c-8.2 14.2-3.3 32.4 10.9 40.6 14.2 8.2 32.4 3.3 40.6-10.9l56.1-97.1c8.2-14.2 3.3-32.4-10.9-40.6-14.2-8.2-32.4-3.3-40.6 10.9z"/>
                              <path fill="#4285F4" d="M128.3 15.4l56.1 97.1c8.2 14.2 3.3 32.4-10.9 40.6-14.2 8.2-32.4 3.3-40.6-10.9L76.8 45.1c-8.2-14.2-3.3-32.4 10.9-40.6 14.2-8.2 32.4-3.3 40.6 10.9z"/>
                              <circle fill="#34A853" cx="30.8" cy="141.7" r="29.7"/>
                            </svg>
                          </span>
                        );

                        if (expanded) {
                          return (
                            <div className="flex items-center gap-2 w-full">
                              {isTrafego ? (
                                <span className="inline-flex items-center gap-1 shrink-0">
                                  {MetaChip}
                                  {GoogleChip}
                                </span>
                              ) : (
                                <item.icon
                                  size={18}
                                  strokeWidth={2.2}
                                  className="shrink-0 transition-transform duration-200 group-hover:scale-110"
                                  style={{
                                    color: active ? '#fff' : `rgb(${rgb})`,
                                    filter: `drop-shadow(0 0 4px rgba(${rgb},0.7))`,
                                  }}
                                />
                              )}
                              <span className={`text-[13px] font-bold tracking-wide truncate flex-1 min-w-0 ${active ? 'text-white' : 'text-foreground'}`}>{item.label}</span>
                            </div>
                          );
                        }
                        return (
                          <>
                            {isTrafego ? (
                              <span className="inline-flex items-center gap-1">
                                {MetaChip}
                                {GoogleChip}
                              </span>
                            ) : (
                              <item.icon
                                size={20}
                                strokeWidth={2.2}
                                className="shrink-0 transition-transform duration-200 group-hover:scale-110"
                                style={{
                                  color: active ? '#fff' : `rgb(${rgb})`,
                                  filter: `drop-shadow(0 0 4px rgba(${rgb},0.7))`,
                                }}
                              />
                            )}
                            <span className={`text-[9px] font-bold leading-none uppercase tracking-wider ${active ? 'text-white' : 'text-foreground/80'}`}>{item.label}</span>
                          </>
                        );
                      })()}

                    </button>
                  );
                })}
              </div>
            </div>
            );
          })()}
          {!speed && !featured && !highlight && (
            <div className={`mx-1 my-1 rounded-xl p-1 space-y-0.5 transition-all duration-300 ${tint.panel}`}>
              {cat.items.map(item => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      if (item.path === '/apresentacao') {
                        window.open(item.path, '_blank', 'noopener,noreferrer');
                      } else {
                        (onNav || navigate)(item.path);
                      }
                    }}
                    className={`w-full group flex items-center gap-2.5 rounded-lg transition-all duration-200 ${
                      expanded ? 'px-2.5 py-2' : 'flex-col px-1 py-2'
                    } ${
                      active
                        ? `${tint.activeBg} ${tint.activeText} ${tint.ring} ${tint.glow}`
                        : `text-sidebar-foreground ${tint.hoverBg} ${tint.hoverRing} ${tint.hoverGlow}`
                    }`}
                    title={!expanded ? item.label : undefined}
                  >
                    <item.icon
                      size={18}
                      strokeWidth={active ? 2.2 : 1.8}
                      className={`shrink-0 transition-all duration-200 group-hover:scale-110 ${tint.icon} ${active ? tint.iconGlow : tint.hoverIconGlow}`}
                    />

                    {expanded ? (
                      <span className="text-[13px] whitespace-nowrap overflow-hidden font-semibold">{item.label}</span>
                    ) : (
                      <span className="text-[10px] font-medium leading-none">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

        </div>
        );
      })}


    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <BirthdayOverlay />

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-300 ease-in-out ${sidebarExpanded ? 'w-[210px]' : 'w-[60px]'}`}
        onMouseEnter={() => !sidebarPinned && setSidebarHover(true)}
        onMouseLeave={() => !sidebarPinned && setSidebarHover(false)}
      >
        <div className={`p-3 flex items-center border-b border-sidebar-border gap-2 ${sidebarExpanded ? 'px-4' : 'justify-center'}`}>
          <img src={pulseLogo} alt="Pulse" className="w-8 h-8 rounded-lg object-cover shrink-0" />
          {sidebarExpanded && (
            <>
              <span className="font-display font-bold text-sm text-foreground whitespace-nowrap overflow-hidden flex-1">Pulse</span>
              <button
                type="button"
                onClick={() => setSidebarPinned(v => !v)}
                title={sidebarPinned ? 'Auto-esconder menu' : 'Fixar menu aberto'}
                aria-label={sidebarPinned ? 'Auto-esconder menu' : 'Fixar menu aberto'}
                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              >
                {sidebarPinned ? <Pin size={14} className="text-primary" /> : <PinOff size={14} />}
              </button>
            </>
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
        <header
          className="h-14 bg-card border-b flex items-center px-3 sm:px-4 lg:px-6 gap-2 sm:gap-4 shrink-0 transition-colors"
          style={{
            borderBottomColor: `rgba(${CATEGORY_RGB[getTintForPath(location.pathname)]}, 0.35)`,
            boxShadow: `0 1px 0 0 rgba(${CATEGORY_RGB[getTintForPath(location.pathname)]}, 0.15), 0 8px 24px -18px rgba(${CATEGORY_RGB[getTintForPath(location.pathname)]}, 0.55)`,
          }}
        >
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
            <CitySwitcher />
            {/* Virtual Office button */}
            <Dialog>
              <DialogTrigger asChild>
                <button className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Escritório Virtual">
                  <Building2 size={18} />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0 gap-0">
                <VirtualOffice />
              </DialogContent>
            </Dialog>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-all hover:scale-110"
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
            >
              {theme === 'dark' ? <Sun size={18} className="text-warning" /> : <Moon size={18} />}
            </button>
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

        {/* Quick shortcuts bar */}
        <QuickShortcutsBar />

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 relative">
          {/* Accent tint bar por categoria — consistência com sidebar/quick shortcuts */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px] transition-colors"
            style={{
              background: `linear-gradient(90deg, transparent, rgba(${CATEGORY_RGB[getTintForPath(location.pathname)]}, 0.85), transparent)`,
              boxShadow: `0 0 18px 0 rgba(${CATEGORY_RGB[getTintForPath(location.pathname)]}, 0.55)`,
            }}
          />
          {/* Breadcrumb tint hook: qualquer <nav aria-label="breadcrumb"> ou [data-page-header]
              dentro do main herda a cor da categoria via CSS custom property abaixo. */}
          <div
            className="min-h-full"
            style={{
              // Disponibilizamos a cor da categoria como variáveis CSS pra páginas
              // usarem em breadcrumbs/cabeçalhos sem precisar importar nada.
              ['--tint-rgb' as any]: CATEGORY_RGB[getTintForPath(location.pathname)],
              ['--tint' as any]: `rgb(${CATEGORY_RGB[getTintForPath(location.pathname)]})`,
            }}
            data-tint={getTintForPath(location.pathname)}
          >
            {children}
          </div>
        </main>
      </div>


      {/* Production Assistant Mascot */}
      <ProductionAssistant />
      <WelcomeRocket />
      <MentionPopupListener />
      <MentionsIndicator />
    </div>
  );
}

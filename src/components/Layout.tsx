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
  LayoutDashboard, Users, Building2, Calendar, Settings, LogOut, Target, Search, Plus, Bell, FileText, Megaphone, MessageSquare, Package, ClipboardList, BarChart3, Share2, DollarSign, Kanban, Scissors
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Início', icon: LayoutDashboard, roles: ['admin', 'videomaker', 'social_media', 'editor', 'endomarketing'] },
  { path: '/agenda', label: 'Agenda', icon: Calendar, roles: ['admin', 'videomaker'] },
  { path: '/roteiros', label: 'Roteiros', icon: FileText, roles: ['admin', 'social_media', 'videomaker'] },
  { path: '/clientes', label: 'Clientes', icon: Building2, roles: ['admin'] },
  { path: '/equipe', label: 'Equipe', icon: Users, roles: ['admin'] },
  { path: '/metas', label: 'Metas', icon: Target, roles: ['admin'] },
  { path: '/endomarketing', label: 'Endomkt', icon: Megaphone, roles: ['admin', 'endomarketing'] },
  { path: '/endomarketing/clientes', label: 'Clientes E.', icon: Building2, roles: ['endomarketing'] },
  { path: '/endomarketing/agenda', label: 'Agenda E.', icon: Calendar, roles: ['endomarketing'] },
  { path: '/planos', label: 'Planos', icon: Package, roles: ['admin'] },
  { path: '/entregas', label: 'Entregas', icon: ClipboardList, roles: ['admin'] },
  { path: '/entregas-social', label: 'Social', icon: Share2, roles: ['admin', 'social_media'] },
  { path: '/conteudo', label: 'Conteúdo', icon: Kanban, roles: ['admin', 'social_media', 'videomaker'] },
  { path: '/edicao', label: 'Edição', icon: Scissors, roles: ['admin', 'editor'] },
  { path: '/edicao/kanban', label: 'Kanban Ed.', icon: Kanban, roles: ['admin', 'editor'] },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin'] },
  { path: '/desempenho', label: 'Desempenho', icon: Target, roles: ['admin'] },
  { path: '/financeiro', label: 'Financeiro', icon: DollarSign, roles: ['admin'] },
  { path: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, roles: ['admin'] },
  { path: '/configuracoes', label: 'Config', icon: Settings, roles: ['admin'] },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { currentUser } = useApp();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const filteredNav = navItems.filter(item =>
    currentUser && item.roles.includes(currentUser.role)
  );

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Icon sidebar */}
      <aside className="hidden md:flex flex-col w-[72px] bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="p-3 flex justify-center border-b border-sidebar-border">
          <img src={pulseLogo} alt="Pulse" className="w-10 h-10 rounded-lg object-cover" />
        </div>

        <nav className="flex-1 flex flex-col items-center gap-1 py-3 px-1.5 overflow-y-auto">
          {filteredNav.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`nav-icon-btn w-full ${active ? 'active' : ''}`}
                title={item.label}
              >
                <item.icon size={20} strokeWidth={active ? 2.2 : 1.5} />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-2 border-t border-sidebar-border flex flex-col items-center gap-2">
          <ProfileDialog>
            <button
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center"
              title={currentUser?.displayName || currentUser?.name}
            >
              {currentUser && <UserAvatar user={currentUser} />}
            </button>
          </ProfileDialog>
          <button
            onClick={handleLogout}
            className="nav-icon-btn w-full"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center px-4 lg:px-6 gap-4 shrink-0">
          {/* Mobile nav */}
          <div className="flex md:hidden gap-1 overflow-x-auto shrink-0">
            {filteredNav.slice(0, 5).map(item => {
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
            <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
              <Bell size={18} />
            </button>
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

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { ROLE_LABELS } from '@/types';
import pulseLogo from '@/assets/pulse_logo.png';
import {
  LayoutDashboard, Users, Building2, Calendar, Kanban, Settings, LogOut, Menu, X, Target
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'videomaker', 'social_media', 'editor'] },
  { path: '/agenda', label: 'Agenda', icon: Calendar, roles: ['admin', 'videomaker'] },
  { path: '/clientes', label: 'Clientes', icon: Building2, roles: ['admin'] },
  { path: '/equipe', label: 'Equipe', icon: Users, roles: ['admin'] },
  { path: '/kanban', label: 'Endomarketing', icon: Kanban, roles: ['admin', 'social_media', 'videomaker'] },
  { path: '/metas', label: 'Metas', icon: Target, roles: ['admin'] },
  { path: '/configuracoes', label: 'Configurações', icon: Settings, roles: ['admin'] },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { currentUser, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNav = navItems.filter(item =>
    currentUser && item.roles.includes(currentUser.role)
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b border-sidebar-border">
          <img src={pulseLogo} alt="Pulse" className="h-10 object-contain" />
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredNav.map(item => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${active ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
              {currentUser?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{currentUser?.name}</p>
              <p className="text-xs text-muted-foreground">{currentUser && ROLE_LABELS[currentUser.role]}</p>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-4 lg:px-6 shrink-0">
          <button className="lg:hidden mr-3" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <h2 className="font-display font-semibold text-lg">
            {filteredNav.find(n => n.path === location.pathname)?.label || 'Pulse'}
          </h2>
        </header>
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

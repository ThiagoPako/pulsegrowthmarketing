import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { useMyPermissions } from '@/hooks/useUserPermissions';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Kanban, Calendar, Palette, Scissors, Share2,
  Building2, DollarSign, MessageSquare, BarChart3, FileText, Megaphone,
} from 'lucide-react';

const SHORTCUTS = [
  { path: '/dashboard', label: 'Início', icon: LayoutDashboard, roles: ['admin', 'videomaker', 'social_media', 'editor', 'endomarketing', 'parceiro', 'designer', 'fotografo'] },
  { path: '/conteudo', label: 'Conteúdo', icon: Kanban, roles: ['admin', 'social_media', 'videomaker', 'editor'] },
  { path: '/agenda', label: 'Agenda', icon: Calendar, roles: ['admin', 'videomaker', 'social_media'] },
  { path: '/designer', label: 'Designer', icon: Palette, roles: ['admin', 'social_media', 'fotografo', 'designer'] },
  { path: '/edicao/kanban', label: 'Edição', icon: Scissors, roles: ['admin', 'editor', 'social_media', 'videomaker'] },
  { path: '/entregas-social', label: 'Social', icon: Share2, roles: ['admin', 'social_media'] },
  { path: '/clientes', label: 'Clientes', icon: Building2, roles: ['admin', 'social_media'] },
  { path: '/roteiros', label: 'Roteiros', icon: FileText, roles: ['admin', 'social_media', 'videomaker'] },
  { path: '/endomarketing', label: 'Endomkt', icon: Megaphone, roles: ['admin', 'endomarketing', 'social_media', 'parceiro'] },
  { path: '/financeiro', label: 'Financeiro', icon: DollarSign, roles: ['admin'] },
  { path: '/whatsapp', label: 'WhatsApp', icon: MessageSquare, roles: ['admin', 'social_media'] },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'social_media'] },
];

export default function QuickShortcutsBar() {
  const { currentUser } = useApp();
  const { hasModuleAccess } = useMyPermissions();
  const navigate = useNavigate();
  const location = useLocation();

  if (!currentUser) return null;

  const items = SHORTCUTS.filter(item => {
    if (!item.roles.includes(currentUser.role)) return false;
    if (currentUser.role === 'admin') return true;
    return hasModuleAccess(item.path);
  });

  if (items.length === 0) return null;

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm overflow-x-auto scrollbar-thin">
      <div className="flex items-center gap-1 px-3 sm:px-4 lg:px-6 py-1.5 min-w-max">
        {items.map(item => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon size={12} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

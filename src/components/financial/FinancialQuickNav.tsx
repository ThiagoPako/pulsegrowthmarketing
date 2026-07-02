import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, FileText, DollarSign, CreditCard, AlertTriangle,
  BarChart3, ArrowLeftRight, Wallet, Users, Settings, MessageCircle, Plug, HeartPulse
} from 'lucide-react';

const navItems = [
  { path: '/financeiro', label: 'Painel', icon: LayoutDashboard },
  { path: '/financeiro/contratos', label: 'Contratos', icon: FileText },
  { path: '/financeiro/receitas', label: 'Receitas', icon: DollarSign },
  { path: '/financeiro/despesas', label: 'Despesas', icon: CreditCard },
  { path: '/financeiro/movimentacoes', label: 'Movimentações', icon: ArrowLeftRight },
  { path: '/financeiro/caixa', label: 'Caixa', icon: Wallet },
  { path: '/financeiro/inadimplencia', label: 'Inadimplência', icon: AlertTriangle },
  { path: '/financeiro/parceiros', label: 'Parceiros', icon: Users },
  { path: '/financeiro/relatorios', label: 'Relatórios', icon: BarChart3 },
  { path: '/financeiro/chat', label: 'Chat IA', icon: MessageCircle },
  { path: '/financeiro/configuracoes', label: 'Config', icon: Settings },
  { path: '/financeiro/apis', label: 'APIs', icon: Plug },
];

export default function FinancialQuickNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {navItems.map(item => {
        const active = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

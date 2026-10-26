import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, History, LogOut, Crown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const items = [
  { to: '/gestao', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/gestao/custos', label: 'Custos Unitários', icon: Settings },
  { to: '/gestao/historico', label: 'Histórico', icon: History },
];

export default function GestaoLayout({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => { await signOut(); navigate('/gestao/login'); };

  return (
    <div className="min-h-screen bg-[#0b0d10] text-slate-100 flex flex-col md:flex-row">
      {/* Celular: barra de cima com os links e o Sair (a lateral não cabe) */}
      <header className="md:hidden border-b border-white/5 bg-[#0f1216] px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Crown size={18} className="text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold tracking-widest uppercase">Pulse</div>
              <div className="text-[10px] text-amber-400/80 tracking-widest truncate">GESTÃO EXECUTIVA</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-white/5 shrink-0"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto">
          {items.map(it => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition',
                  isActive
                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    : 'text-slate-300 hover:bg-white/5'
                )
              }
            >
              <it.icon size={14} />
              {it.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <aside className="hidden md:flex md:shrink-0 w-60 border-r border-white/5 bg-[#0f1216] flex-col">
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Crown size={20} className="text-amber-400" />
            <div>
              <div className="text-sm font-bold tracking-widest uppercase">Pulse</div>
              <div className="text-[10px] text-amber-400/80 tracking-widest">GESTÃO EXECUTIVA</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map(it => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition',
                  isActive
                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    : 'text-slate-300 hover:bg-white/5'
                )
              }
            >
              <it.icon size={16} />
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/5 space-y-2">
          <div className="text-[10px] text-slate-400 truncate px-1">{profile?.name || profile?.email}</div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}

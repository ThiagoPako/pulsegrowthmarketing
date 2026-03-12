import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Lock, User, Eye, EyeOff, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function ClientPortalLogin() {
  const { clientId: paramSlug } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientColor, setClientColor] = useState('217 91% 60%');
  const [clientLogo, setClientLogo] = useState<string | null>(null);

  // Load client info for branding
  useState(() => {
    if (!paramSlug) return;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramSlug);
    const slug = decodeURIComponent(paramSlug);
    
    const query = isUUID
      ? supabase.from('clients').select('company_name, color, logo_url').eq('id', slug).single()
      : supabase.from('clients').select('company_name, color, logo_url').ilike('company_name', slug.replace(/-/g, ' ')).single();
    
    query.then(({ data }) => {
      if (data) {
        setClientName((data as any).company_name);
        setClientColor((data as any).color || '217 91% 60%');
        setClientLogo((data as any).logo_url);
      }
    });
  });

  const handleLogin = async () => {
    if (!login.trim() || !password.trim()) {
      toast.error('Preencha login e senha');
      return;
    }
    setLoading(true);

    // Check credentials against clients table
    const { data, error } = await supabase
      .from('clients')
      .select('id, company_name, client_login, client_password')
      .eq('client_login', login.trim())
      .single();

    if (error || !data) {
      toast.error('Login não encontrado');
      setLoading(false);
      return;
    }

    if ((data as any).client_password !== password) {
      toast.error('Senha incorreta');
      setLoading(false);
      return;
    }

    // Store session in sessionStorage
    sessionStorage.setItem('portal_client_id', (data as any).id);
    sessionStorage.setItem('portal_client_name', (data as any).company_name);
    sessionStorage.setItem('portal_auth_type', 'client');

    // Navigate to portal
    const portalSlug = encodeURIComponent((data as any).company_name.replace(/\s+/g, '-').toLowerCase());
    navigate(`/portal/${portalSlug}`);
  };

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, hsl(${clientColor} / 0.08), transparent 70%)` }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
      >
        <div className="bg-[#14141f] border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
          {/* Logo / Branding */}
          <div className="text-center mb-8">
            {clientLogo ? (
              <img src={clientLogo} alt={clientName} className="w-16 h-16 rounded-2xl object-cover mx-auto ring-2 ring-white/10" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mx-auto" style={{ background: `hsl(${clientColor})` }}>
                {clientName?.charAt(0) || 'P'}
              </div>
            )}
            <h1 className="text-lg font-bold text-white mt-4">{clientName || 'Pulse Club'}</h1>
            <p className="text-xs text-white/40 mt-1">Acesse seu conteúdo</p>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Login"
                value={login}
                onChange={e => setLogin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
              />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
              style={{ background: `hsl(${clientColor})` }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={16} />
                  Entrar
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

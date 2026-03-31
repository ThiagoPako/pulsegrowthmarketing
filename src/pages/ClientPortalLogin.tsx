import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { Lock, User, Eye, EyeOff, LogIn, UserPlus, Rocket } from 'lucide-react';
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
  const [rememberMe, setRememberMe] = useState(false);

  // Check if already logged in
  useEffect(() => {
    const storedClientId = sessionStorage.getItem('portal_client_id');
    if (storedClientId) {
      navigate(`/portal/${storedClientId}`, { replace: true });
      return;
    }
    // Check localStorage for remembered login
    const remembered = localStorage.getItem('portal_remembered_login');
    if (remembered) {
      setLogin(remembered);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (!paramSlug) return;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paramSlug);
    const slug = decodeURIComponent(paramSlug);

    supabase.functions.invoke('client-portal-auth', {
      body: {
        action: 'get_info',
        ...(isUUID ? { client_id: slug } : { slug }),
      },
    }).then(({ data }) => {
      if (data) {
        setClientName(data.company_name);
        setClientColor(data.color || '217 91% 60%');
        setClientLogo(data.logo_url);
      }
    });
  }, [paramSlug]);

  const handleLogin = async () => {
    if (!login.trim()) {
      toast.error('Preencha o campo de login');
      return;
    }
    if (!password.trim()) {
      toast.error('Preencha o campo de senha');
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('client-portal-auth', {
      body: { action: 'login', login: login.trim(), password },
    });

    if (error || !data?.success) {
      toast.error(data?.error || 'Login ou senha incorretos');
      setLoading(false);
      return;
    }

    // Remember login
    if (rememberMe) {
      localStorage.setItem('portal_remembered_login', login.trim());
    } else {
      localStorage.removeItem('portal_remembered_login');
    }

    sessionStorage.setItem('portal_client_id', data.client_id);
    sessionStorage.setItem('portal_client_name', data.company_name);
    sessionStorage.setItem('portal_user_name', data.display_name || data.company_name);
    sessionStorage.setItem('portal_auth_type', 'client');

    toast.success(`Bem-vindo, ${data.display_name || data.company_name}! 🚀`);
    navigate(`/portal/${data.client_id}`);
  };

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, hsl(${clientColor} / 0.08), transparent 70%)` }} />
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 20% 80%, hsl(${clientColor} / 0.04), transparent 50%)` }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-sm"
      >
        <div className="bg-[#14141f] border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            {clientLogo ? (
              <motion.img
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                src={clientLogo}
                alt={clientName}
                className="w-20 h-20 rounded-2xl object-cover mx-auto ring-2 ring-white/10 shadow-lg"
              />
            ) : (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white mx-auto shadow-lg"
                style={{ background: `linear-gradient(135deg, hsl(${clientColor}), hsl(${clientColor} / 0.7))` }}
              >
                {clientName?.charAt(0) || 'P'}
              </motion.div>
            )}
            <h1 className="text-xl font-bold text-white mt-4">{clientName || 'Pulse Club'}</h1>
            <p className="text-xs text-white/40 mt-1">Acesse sua área exclusiva</p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Seu login"
                value={login}
                onChange={e => setLogin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
              />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Sua senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
              />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setRememberMe(!rememberMe)}
                className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${
                  rememberMe ? 'border-transparent' : 'border-white/20 bg-white/[0.06]'
                }`}
                style={rememberMe ? { background: `hsl(${clientColor})` } : {}}
              >
                {rememberMe && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-white"><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></motion.div>}
              </div>
              <span className="text-xs text-white/40">Lembrar meu login</span>
            </label>

            <motion.button
              onClick={handleLogin}
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
              style={{
                background: `linear-gradient(135deg, hsl(${clientColor}), hsl(${clientColor} / 0.8))`,
                boxShadow: `0 8px 24px -4px hsl(${clientColor} / 0.3)`,
              }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={16} /> Entrar
                </>
              )}
            </motion.button>
          </div>

          {/* Register link */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
            <p className="text-xs text-white/30 mb-2">Primeiro acesso?</p>
            <button
              onClick={() => navigate(`/portal-register/${paramSlug}`)}
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
              style={{ color: `hsl(${clientColor})` }}
            >
              <UserPlus size={14} /> Criar minha conta
            </button>
          </div>
        </div>

        {/* Powered by */}
        <div className="text-center mt-6 flex items-center justify-center gap-1.5">
          <Rocket size={10} className="text-white/20" />
          <span className="text-[10px] text-white/20">Pulse Club</span>
        </div>
      </motion.div>
    </div>
  );
}

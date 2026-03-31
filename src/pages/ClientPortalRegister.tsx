import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { Lock, User, Eye, EyeOff, UserPlus, Users, ArrowLeft, CheckCircle2, AlertCircle, Rocket } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function ClientPortalRegister() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientColor, setClientColor] = useState('217 91% 60%');
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState(0);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    supabase.functions.invoke('client-portal-auth', {
      body: { action: 'get_info', client_id: clientId },
    }).then(({ data }) => {
      if (data) {
        setClientName(data.company_name);
        setClientColor(data.color || '217 91% 60%');
        setClientLogo(data.logo_url);
        setRegisteredUsers(data.registered_users || 0);
      }
    });
  }, [clientId]);

  // Auto-sync display name with login
  useEffect(() => {
    if (displayName && !login) {
      setLogin(displayName.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    }
  }, [displayName]);

  const passwordStrength = password.length === 0 ? 0 : password.length < 4 ? 1 : password.length < 8 ? 2 : 3;
  const passwordMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleRegister = async () => {
    if (!displayName.trim()) { toast.error('Preencha seu nome completo'); return; }
    if (!login.trim()) { toast.error('Preencha o nome de usuário'); return; }
    if (login.trim().length < 3) { toast.error('O nome de usuário deve ter pelo menos 3 caracteres'); return; }
    if (!password.trim()) { toast.error('Crie uma senha'); return; }
    if (password !== confirmPassword) { toast.error('As senhas não coincidem'); return; }
    if (password.length < 4) { toast.error('A senha deve ter no mínimo 4 caracteres'); return; }
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('client-portal-auth', {
      body: { action: 'register', client_id: clientId, login: login.trim(), password, display_name: displayName.trim() },
    });

    if (error || !data?.success) {
      toast.error(data?.error || 'Erro ao criar conta. Tente outro nome de usuário.');
      setLoading(false);
      return;
    }

    const resolvedClientId = data.client_id || clientId;

    setSuccess(true);
    sessionStorage.setItem('portal_client_id', resolvedClientId);
    sessionStorage.setItem('portal_client_name', data.company_name || clientName);
    sessionStorage.setItem('portal_user_name', data.display_name || displayName.trim());
    sessionStorage.setItem('portal_auth_type', 'client');

    // Redirect after success animation
    setTimeout(() => {
      navigate(`/portal/${resolvedClientId}`);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, hsl(${clientColor} / 0.08), transparent 70%)` }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative w-full max-w-sm">
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#14141f] border border-white/[0.08] rounded-2xl p-8 shadow-2xl text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              >
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `hsl(${clientColor} / 0.15)` }}>
                  <CheckCircle2 size={40} style={{ color: `hsl(${clientColor})` }} />
                </div>
              </motion.div>
              <h2 className="text-xl font-bold text-white">Conta criada! 🚀</h2>
              <p className="text-sm text-white/40 mt-2">Bem-vindo(a), {displayName}!</p>
              <p className="text-xs text-white/30 mt-1">Redirecionando para o portal...</p>
              <div className="mt-4">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" style={{ borderTopColor: `hsl(${clientColor})` }} />
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" className="bg-[#14141f] border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
              {/* Back button */}
              <button
                onClick={() => navigate(`/portal-login/${clientId}`)}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors mb-6"
              >
                <ArrowLeft size={14} /> Voltar ao login
              </button>

              <div className="text-center mb-6">
                {clientLogo ? (
                  <img src={clientLogo} alt={clientName} className="w-16 h-16 rounded-2xl object-cover mx-auto ring-2 ring-white/10" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mx-auto" style={{ background: `linear-gradient(135deg, hsl(${clientColor}), hsl(${clientColor} / 0.7))` }}>
                    {clientName?.charAt(0) || 'P'}
                  </div>
                )}
                <h1 className="text-lg font-bold text-white mt-4">Criar conta</h1>
                <p className="text-xs text-white/40 mt-1">{clientName || 'Pulse Club'}</p>
                {registeredUsers > 0 && (
                  <div className="flex items-center justify-center gap-1 mt-2 text-xs text-white/30">
                    <Users size={12} />
                    <span>{registeredUsers} colaborador{registeredUsers > 1 ? 'es' : ''}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {/* Name */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Nome completo</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      placeholder="Ex: João Silva"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
                    />
                  </div>
                </div>

                {/* Login */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Nome de usuário (login)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm font-mono">@</span>
                    <input
                      type="text"
                      placeholder="joao.silva"
                      value={login}
                      onChange={e => setLogin(e.target.value.replace(/\s/g, '').toLowerCase())}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-white/25 mt-1">Este será seu nome de exibição no portal</p>
                </div>

                {/* Password */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 4 caracteres"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
                    />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {/* Password strength */}
                  {password.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {[1, 2, 3].map(level => (
                        <div
                          key={level}
                          className="h-1 flex-1 rounded-full transition-all"
                          style={{
                            background: passwordStrength >= level
                              ? level === 1 ? '#ef4444' : level === 2 ? '#eab308' : '#22c55e'
                              : 'rgba(255,255,255,0.1)',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Confirmar senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Repita a senha"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleRegister()}
                      className={`w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.06] border text-white text-sm placeholder:text-white/30 focus:outline-none focus:bg-white/[0.08] transition-all ${
                        confirmPassword.length > 0
                          ? passwordMatch ? 'border-emerald-500/40' : 'border-red-500/40'
                          : 'border-white/[0.08] focus:border-white/20'
                      }`}
                    />
                    {confirmPassword.length > 0 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {passwordMatch ? (
                          <CheckCircle2 size={16} className="text-emerald-400" />
                        ) : (
                          <AlertCircle size={16} className="text-red-400" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <motion.button
                  onClick={handleRegister}
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg mt-2"
                  style={{
                    background: `linear-gradient(135deg, hsl(${clientColor}), hsl(${clientColor} / 0.8))`,
                    boxShadow: `0 8px 24px -4px hsl(${clientColor} / 0.3)`,
                  }}
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><UserPlus size={16} /> Criar minha conta</>}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-center mt-6 flex items-center justify-center gap-1.5">
          <Rocket size={10} className="text-white/20" />
          <span className="text-[10px] text-white/20">Pulse Club</span>
        </div>
      </motion.div>
    </div>
  );
}

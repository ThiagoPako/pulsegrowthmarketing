import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { Lock, User, Eye, EyeOff, UserPlus, Users } from 'lucide-react';
import { motion } from 'framer-motion';
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

  const handleRegister = async () => {
    if (!displayName.trim()) { toast.error('Preencha seu nome'); return; }
    if (!login.trim()) { toast.error('Preencha o nome de usuário'); return; }
    if (!password.trim()) { toast.error('Preencha a senha'); return; }
    if (password !== confirmPassword) { toast.error('As senhas não coincidem'); return; }
    if (password.length < 4) { toast.error('A senha deve ter no mínimo 4 caracteres'); return; }
    setLoading(true);

    const { data, error } = await supabase.functions.invoke('client-portal-auth', {
      body: { action: 'register', client_id: clientId, login: login.trim(), password, display_name: displayName.trim() },
    });

    if (error || !data?.success) {
      toast.error(data?.error || 'Erro ao criar conta');
      setLoading(false);
      return;
    }

    const resolvedClientId = data.client_id || clientId;

    toast.success('Conta criada com sucesso!');
    sessionStorage.setItem('portal_client_id', resolvedClientId);
    sessionStorage.setItem('portal_client_name', data.company_name || clientName);
    sessionStorage.setItem('portal_user_name', data.display_name || displayName.trim());
    sessionStorage.setItem('portal_auth_type', 'client');

    navigate(`/portal/${resolvedClientId}`);
  };

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 30%, hsl(${clientColor} / 0.08), transparent 70%)` }} />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-sm">
        <div className="bg-[#14141f] border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            {clientLogo ? (
              <img src={clientLogo} alt={clientName} className="w-16 h-16 rounded-2xl object-cover mx-auto ring-2 ring-white/10" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mx-auto" style={{ background: `hsl(${clientColor})` }}>
                {clientName?.charAt(0) || 'P'}
              </div>
            )}
            <h1 className="text-lg font-bold text-white mt-4">Cadastre-se</h1>
            <p className="text-xs text-white/40 mt-1">{clientName || 'Pulse Club'} — Acesse seu conteúdo</p>
            {registeredUsers > 0 && (
              <div className="flex items-center justify-center gap-1 mt-2 text-xs text-white/30">
                <Users size={12} />
                <span>{registeredUsers} colaborador{registeredUsers > 1 ? 'es' : ''} cadastrado{registeredUsers > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input type="text" placeholder="Seu nome completo" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors" />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm font-mono">@</span>
              <input type="text" placeholder="Nome de usuário (login)" value={login} onChange={e => setLogin(e.target.value.replace(/\s/g, '').toLowerCase())} className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors" />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input type={showPassword ? 'text' : 'password'} placeholder="Crie uma senha" value={password} onChange={e => setPassword(e.target.value)} className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors" />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input type={showPassword ? 'text' : 'password'} placeholder="Confirme a senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors" />
            </div>
            <button onClick={handleRegister} disabled={loading} className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50" style={{ background: `hsl(${clientColor})` }}>
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><UserPlus size={16} /> Criar Conta</>}
            </button>
            <button onClick={() => navigate(`/portal-login/${clientId}`)} className="w-full py-2 text-xs text-white/40 hover:text-white/60 transition-colors">
              Já tem conta? Faça login
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

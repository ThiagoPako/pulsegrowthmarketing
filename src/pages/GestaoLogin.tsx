import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function GestaoLogin() {
  const { signIn, user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user && (profile?.role === 'socio_gestor' || profile?.role === 'admin')) {
      navigate('/gestao', { replace: true });
    }
  }, [loading, user, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) return toast.error(error);
    toast.success('Autenticando...');
  };

  return (
    <div className="min-h-screen bg-[#0b0d10] text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.08),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(251,191,36,0.05),transparent_50%)]" />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
            <Crown size={14} className="text-amber-400" />
            <span className="text-[11px] tracking-[0.2em] uppercase text-amber-300">Acesso Executivo</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Painel de Gestão</h1>
          <p className="text-sm text-slate-400 mt-2">Área restrita aos Sócios Gestores da Pulse</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#12161c] border border-white/5 rounded-2xl p-6 space-y-4 shadow-2xl">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">E-mail</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-amber-500/50 outline-none text-sm"
              placeholder="socio@agenciapulse.tech"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Senha</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-amber-500/50 outline-none text-sm"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={submitting}
            className="w-full h-11 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : 'Entrar no Painel'}
          </button>
          <p className="text-[11px] text-slate-500 text-center pt-2">
            Não é sócio? Voltar para o <a href="/login" className="text-amber-400 hover:underline">login geral</a>
          </p>
        </form>
      </div>
    </div>
  );
}

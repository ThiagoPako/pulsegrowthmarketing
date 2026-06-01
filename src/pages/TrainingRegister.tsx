
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Lock, User, Eye, EyeOff, UserPlus, ArrowLeft, CheckCircle2, Rocket, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export default function TrainingRegister() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    
    setLoading(true);
    // Role default for new collaborators could be 'videomaker' or similar
    // We pass isSelfRegister = true so the backend knows it's a new collaborator
    const { error } = await signUp(email, password, name, 'videomaker', true);
    
    if (error) {
      toast.error(error);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center px-4 font-sans text-white">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#e5091422,transparent_70%)]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="relative w-full max-w-md"
      >
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#000000bb] border border-white/10 rounded-lg p-10 shadow-2xl text-center backdrop-blur-xl"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle2 size={40} className="text-emerald-500" />
              </motion.div>
              <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-2">Conta Criada!</h2>
              <p className="text-gray-400 mb-8">Sua conta de colaborador foi criada com sucesso. Redirecionando para o login...</p>
              <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
            </motion.div>
          ) : (
            <div className="bg-[#000000bb] border border-white/10 rounded-lg p-10 shadow-2xl backdrop-blur-xl">
              <div className="text-center mb-8">
                <h1 className="text-4xl font-black italic uppercase tracking-tighter text-red-600">Pulse <span className="text-white">Academy</span></h1>
                <p className="text-gray-400 text-sm mt-2 font-medium">Área de Membros para Colaboradores</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Nome Completo</label>
                  <div className="relative">
                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Seu nome"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-[#333] border-none rounded-md py-4 pl-12 pr-4 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-red-600 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Email Corporativo</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="email"
                      placeholder="email@agenciapulse.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full bg-[#333] border-none rounded-md py-4 pl-12 pr-4 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-red-600 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Senha</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-[#333] border-none rounded-md py-4 pl-12 pr-12 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-red-600 transition-all"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 py-4 rounded-md font-black italic uppercase tracking-widest transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><UserPlus size={18} /> Criar Conta de Acesso</>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-white/10 text-center">
                <button 
                  onClick={() => navigate('/login')}
                  className="text-sm text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto"
                >
                  <ArrowLeft size={16} /> Já tenho acesso. Fazer login
                </button>
              </div>
            </div>
          )}
        </AnimatePresence>

        <div className="text-center mt-8 flex items-center justify-center gap-2">
          <Rocket size={14} className="text-gray-600" />
          <span className="text-xs font-black uppercase tracking-widest text-gray-600 italic">Pulse <span className="text-gray-700">Academy</span></span>
        </div>
      </motion.div>
    </div>
  );
}

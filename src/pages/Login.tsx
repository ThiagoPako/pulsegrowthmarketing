import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import pulseLogo from '@/assets/pulse_logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;
    if (!cleanEmail || !cleanPassword) {
      toast.error('Preencha email e senha');
      return;
    }
    setLoading(true);
    const { error } = await signIn(cleanEmail, cleanPassword);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-4">
        <div className="glass-card p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-foreground rounded-2xl flex items-center justify-center p-2">
              <img src={pulseLogo} alt="Pulse" className="h-10" />
            </div>
          </div>
          <h2 className="text-center font-display font-bold text-xl mb-6">Pulse</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Senha</Label>
              <Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-muted flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground text-center">
              Novo colaborador?
            </p>
            <Button variant="outline" className="w-full text-xs font-bold uppercase tracking-widest gap-2" onClick={() => navigate('/treinamento-registro')}>
              <UserPlus size={14} /> Criar conta de acesso
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

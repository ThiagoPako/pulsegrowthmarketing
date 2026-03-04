import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import pulseLogo from '@/assets/pulse_logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROLE_LABELS } from '@/types';
import { toast } from 'sonner';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);

  // Login form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Signup form
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupRole, setSignupRole] = useState<AppRole>('editor');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error('Email ou senha inválidos');
    } else {
      navigate('/dashboard');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim()) { toast.error('Nome é obrigatório'); return; }
    if (signupPassword.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return; }
    setLoading(true);
    const { error } = await signUp(signupEmail, signupPassword, signupName, signupRole);
    setLoading(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Conta criada com sucesso! Fazendo login...');
      // Auto-login after signup (auto-confirm is enabled)
      const loginResult = await signIn(signupEmail, signupPassword);
      if (!loginResult.error) {
        navigate('/dashboard');
      }
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

          <Tabs value={tab} onValueChange={v => setTab(v as 'login' | 'signup')}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
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
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={signupName} onChange={e => setSignupName(e.target.value)} placeholder="Seu nome" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} placeholder="seu@email.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Senha</Label>
                  <Input type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Função</Label>
                  <Select value={signupRole} onValueChange={v => setSignupRole(v as AppRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['admin', 'videomaker', 'social_media', 'editor', 'endomarketing'] as AppRole[]).map(r => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Cadastrando...' : 'Criar conta'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

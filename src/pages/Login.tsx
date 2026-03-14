import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import pulseLogo from '@/assets/pulse_logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from 'sonner';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    
    if (error) {
      if (error === 'Your account is pending administrator approval.') {
        toast.error('Sua conta ainda está pendente de aprovação.', {
          description: 'Aguarde um administrador aprovar seu acesso.'
        });
      } else {
        toast.error('Email ou senha inválidos');
      }
    } else {
      navigate('/dashboard');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }
    
    setLoading(true);
    // Users create themselves as partners by default just as a base role, or editor
    const { error } = await signUp(regEmail, regPassword, regName, 'editor', 'pending');
    setLoading(false);
    
    if (error) {
      toast.error(error);
    } else {
      toast.success('Cadastro realizado com sucesso!', {
        description: 'Aguarde a aprovação do administrador para acessar o sistema.'
      });
      // Clear form
      setRegName('');
      setRegEmail('');
      setRegPassword('');
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

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="register">Cadastre-se</TabsTrigger>
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
                  {loading ? 'Processando...' : 'Entrar'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Nome Completo</Label>
                  <Input id="reg-name" type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="João Silva" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="seu@email.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">Senha</Label>
                  <Input id="reg-password" type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="••••••" required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Processando...' : 'Solicitar Acesso'}
                </Button>
                <div className="bg-muted/50 p-3 rounded-lg text-xs text-muted-foreground text-center mt-2">
                  <p>Seu cadastro precisará ser aprovado por um administrador antes de você conseguir entrar.</p>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ROLE_LABELS } from '@/types';
import type { UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, KeyRound } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

const ROLES: UserRole[] = ['admin', 'videomaker', 'social_media', 'editor', 'endomarketing'];

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  displayName?: string;
  jobTitle?: string;
}

export default function Team() {
  const { currentUser } = useApp();
  const { signUp, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'videomaker' as UserRole });

  // Reset password state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchMembers = async () => {
    const { data } = await supabase.from('profiles').select('*');
    if (data) {
      setMembers(data.map((p: any) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role as UserRole,
        avatarUrl: p.avatar_url,
        displayName: p.display_name,
        jobTitle: p.job_title,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.email || !form.password) { toast.error('Preencha todos os campos'); return; }
    if (form.password.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return; }

    const { error } = await signUp(form.email, form.password, form.name, form.role as AppRole);
    if (error) {
      toast.error(error);
    } else {
      toast.success('Usuário cadastrado com sucesso!');
      setOpen(false);
      setForm({ name: '', email: '', password: '', role: 'videomaker' });
      setTimeout(fetchMembers, 1000);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) { toast.error('Digite a nova senha'); return; }
    if (newPassword.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return; }

    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { userId: resetTarget.id, newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Senha de ${resetTarget.displayName || resetTarget.name} redefinida!`);
      setResetOpen(false);
      setNewPassword('');
      setResetTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao redefinir senha');
    } finally {
      setResetting(false);
    }
  };

  const roleColors: Record<UserRole, string> = {
    admin: 'bg-primary/20 text-primary',
    videomaker: 'bg-info/20 text-info',
    social_media: 'bg-warning/20 text-warning',
    editor: 'bg-success/20 text-success',
    endomarketing: 'bg-accent text-accent-foreground',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Equipe</h1>
        {currentUser?.role === 'admin' && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm({ name: '', email: '', password: '', role: 'videomaker' })}><Plus size={16} className="mr-2" /> Novo Usuário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1"><Label>Nome</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1"><Label>Senha</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
                <div className="space-y-1">
                  <Label>Função</Label>
                  <Select value={form.role} onValueChange={v => setForm({ ...form, role: v as UserRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSave} className="w-full">Cadastrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); if (!v) { setNewPassword(''); setResetTarget(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Redefinir Senha</DialogTitle></DialogHeader>
          {resetTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Redefinindo senha de <span className="font-medium text-foreground">{resetTarget.displayName || resetTarget.name}</span> ({resetTarget.email})
              </p>
              <div className="space-y-1">
                <Label>Nova Senha</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <Button onClick={handleResetPassword} className="w-full" disabled={resetting}>
                {resetting ? 'Redefinindo...' : 'Redefinir Senha'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <p>Carregando equipe...</p>
        </div>
      ) : members.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Users size={40} className="mx-auto mb-3 opacity-50" /><p>Nenhum usuário cadastrado</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {members.map(u => (
            <div key={u.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <UserAvatar user={u} size="lg" />
                <div>
                  <p className="font-medium">{u.displayName || u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}{u.jobTitle ? ` · ${u.jobTitle}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColors[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                {currentUser?.role === 'admin' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Redefinir senha"
                    onClick={() => { setResetTarget(u); setResetOpen(true); }}
                  >
                    <KeyRound size={16} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

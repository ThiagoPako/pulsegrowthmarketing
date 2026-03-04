import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { ROLE_LABELS } from '@/types';
import type { User, UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

const ROLES: UserRole[] = ['admin', 'videomaker', 'social_media', 'editor'];

export default function Team() {
  const { users, addUser, updateUser, deleteUser } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'videomaker' as UserRole });

  const handleOpen = (user?: User) => {
    if (user) { setEditing(user); setForm({ name: user.name, email: user.email, password: user.password, role: user.role }); }
    else { setEditing(null); setForm({ name: '', email: '', password: '', role: 'videomaker' }); }
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.email || !form.password) { toast.error('Preencha todos os campos'); return; }
    if (editing) {
      updateUser({ ...editing, ...form });
      toast.success('Usuário atualizado');
    } else {
      const ok = addUser({ ...form, id: crypto.randomUUID() });
      if (!ok) { toast.error('Email já cadastrado'); return; }
      toast.success('Usuário cadastrado');
    }
    setOpen(false);
  };

  const roleColors: Record<UserRole, string> = {
    admin: 'bg-primary/20 text-primary',
    videomaker: 'bg-info/20 text-info',
    social_media: 'bg-warning/20 text-warning',
    editor: 'bg-success/20 text-success',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Equipe</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpen()}><Plus size={16} className="mr-2" /> Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1"><Label>Nome</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Senha</Label><Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
              <div className="space-y-1">
                <Label>Função</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v as UserRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} className="w-full">{editing ? 'Salvar' : 'Cadastrar'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {users.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Users size={40} className="mx-auto mb-3 opacity-50" /><p>Nenhum usuário cadastrado</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {users.map(u => (
            <div key={u.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <UserAvatar user={u} size="lg" />
                <div>
                  <p className="font-medium">{u.displayName || u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}{u.jobTitle ? ` · ${u.jobTitle}` : ''}</p>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleColors[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                <Button variant="ghost" size="icon" onClick={() => handleOpen(u)}><Pencil size={16} /></Button>
                <Button variant="ghost" size="icon" onClick={() => { deleteUser(u.id); toast.success('Removido'); }}><Trash2 size={16} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

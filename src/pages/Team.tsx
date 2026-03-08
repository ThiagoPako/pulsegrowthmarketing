import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ROLE_LABELS } from '@/types';
import type { UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, KeyRound, Users, Handshake, Trash2 } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';

const ROLES: UserRole[] = ['admin', 'videomaker', 'social_media', 'editor', 'endomarketing', 'parceiro', 'fotografo'];

const PARTNER_FUNCTIONS = [
  { value: 'fotografo', label: 'Fotografia' },
  { value: 'videomaker', label: 'Videomaker' },
  { value: 'editor', label: 'Editor' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'endomarketing', label: 'Endomarketing' },
];

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  displayName?: string;
  jobTitle?: string;
}

interface PartnerInfo {
  id: string;
  user_id: string;
  company_name: string | null;
  service_function: string;
  fixed_rate: number;
  phone: string;
  notes: string;
  active: boolean;
}

export default function Team() {
  const { currentUser } = useApp();
  const { signUp, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [partners, setPartners] = useState<PartnerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'videomaker' as UserRole });
  const [partnerForm, setPartnerForm] = useState({ companyName: '', serviceFunction: '', fixedRate: 0, phone: '', notes: '' });

  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [tab, setTab] = useState<'equipe' | 'parceiros'>('equipe');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerCreateForm, setPartnerCreateForm] = useState({ name: '', email: '', password: '', serviceFunction: 'fotografo', companyName: '', fixedRate: 0, phone: '', notes: '' });

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

  const fetchPartners = async () => {
    const { data } = await supabase.from('partners').select('*');
    if (data) setPartners(data as PartnerInfo[]);
  };

  useEffect(() => { fetchMembers(); fetchPartners(); }, []);

  const handleSave = async () => {
    if (!form.name || !form.email || !form.password) { toast.error('Preencha todos os campos'); return; }
    if (form.password.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return; }

    const { error } = await signUp(form.email, form.password, form.name, form.role as AppRole);
    if (error) {
      toast.error(error);
      return;
    }

    // If creating a partner, we need to create the partner record after user is created
    if (form.role === 'parceiro') {
      // Wait a moment for profile to be created by trigger
      setTimeout(async () => {
        const { data: profile } = await supabase.from('profiles').select('id').eq('email', form.email).single();
        if (profile) {
          await supabase.from('partners').insert({
            user_id: profile.id,
            company_name: partnerForm.companyName || null,
            service_function: partnerForm.serviceFunction,
            fixed_rate: partnerForm.fixedRate,
            phone: partnerForm.phone,
            notes: partnerForm.notes,
          } as any);
        }
        fetchPartners();
      }, 1500);
    }

    toast.success('Usuário cadastrado com sucesso!');
    setOpen(false);
    setForm({ name: '', email: '', password: '', role: 'videomaker' });
    setPartnerForm({ companyName: '', serviceFunction: '', fixedRate: 0, phone: '', notes: '' });
    setTimeout(fetchMembers, 1000);
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

  const handleDeleteMember = async (member: TeamMember) => {
    if (member.id === currentUser?.id) { toast.error('Você não pode excluir a si mesmo'); return; }
    if (!confirm(`Tem certeza que deseja excluir ${member.displayName || member.name}? Esta ação é irreversível.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', { body: { userId: member.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${member.displayName || member.name} removido com sucesso`);
      fetchMembers();
      fetchPartners();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir membro');
    }
  };

  const handleSavePartner = async () => {
    if (!partnerCreateForm.name || !partnerCreateForm.email || !partnerCreateForm.password) { toast.error('Preencha todos os campos'); return; }
    if (partnerCreateForm.password.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return; }

    // Register with 'parceiro' role so they appear in the partners list
    const { error } = await signUp(partnerCreateForm.email, partnerCreateForm.password, partnerCreateForm.name, 'parceiro' as AppRole);
    if (error) { toast.error(error); return; }

    // Create partner record after profile is created by trigger
    setTimeout(async () => {
      const { data: profile } = await supabase.from('profiles').select('id').eq('email', partnerCreateForm.email).single();
      if (profile) {
        await supabase.from('partners').insert({
          user_id: profile.id,
          company_name: partnerCreateForm.companyName || null,
          service_function: PARTNER_FUNCTIONS.find(f => f.value === partnerCreateForm.serviceFunction)?.label || partnerCreateForm.serviceFunction,
          fixed_rate: partnerCreateForm.fixedRate,
          phone: partnerCreateForm.phone,
          notes: partnerCreateForm.notes,
        } as any);
      }
      fetchPartners();
      fetchMembers();
    }, 1500);

    toast.success('Parceiro cadastrado com sucesso!');
    setPartnerOpen(false);
    setPartnerCreateForm({ name: '', email: '', password: '', serviceFunction: 'fotografo', companyName: '', fixedRate: 0, phone: '', notes: '' });
  };

  const roleColors: Record<UserRole, string> = {
    admin: 'bg-primary/20 text-primary',
    videomaker: 'bg-info/20 text-info',
    social_media: 'bg-warning/20 text-warning',
    editor: 'bg-success/20 text-success',
    endomarketing: 'bg-accent text-accent-foreground',
    parceiro: 'bg-purple-100 text-purple-700',
    fotografo: 'bg-pink-100 text-pink-700',
  };

  const partnerUserIds = partners.map(p => p.user_id);
  const teamMembers = members.filter(m => !partnerUserIds.includes(m.id));
  const partnerMembers = members.filter(m => partnerUserIds.includes(m.id));

  const getPartnerInfo = (userId: string) => partners.find(p => p.user_id === userId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Equipe</h1>
        {currentUser?.role === 'admin' && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm({ name: '', email: '', password: '', role: 'videomaker' }); setPartnerForm({ companyName: '', serviceFunction: '', fixedRate: 0, phone: '', notes: '' }); }}>
                <Plus size={16} className="mr-2" /> Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
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

                {form.role === 'parceiro' && (
                  <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-sm font-semibold flex items-center gap-2"><Handshake size={16} /> Dados do Parceiro</p>
                    <div className="space-y-1">
                      <Label>Empresa (opcional)</Label>
                      <Input value={partnerForm.companyName} onChange={e => setPartnerForm({ ...partnerForm, companyName: e.target.value })} placeholder="Nome da empresa" />
                    </div>
                    <div className="space-y-1">
                      <Label>Função/Serviço *</Label>
                      <Input value={partnerForm.serviceFunction} onChange={e => setPartnerForm({ ...partnerForm, serviceFunction: e.target.value })} placeholder="Ex: Fotógrafo, Designer, Tráfego..." />
                    </div>
                    <div className="space-y-1">
                      <Label>WhatsApp</Label>
                      <Input value={partnerForm.phone} onChange={e => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="5511999999999" />
                    </div>
                    <div className="space-y-1">
                      <Label>Observações</Label>
                      <Textarea value={partnerForm.notes} onChange={e => setPartnerForm({ ...partnerForm, notes: e.target.value })} rows={2} />
                    </div>
                  </div>
                )}

                <Button onClick={handleSave} className="w-full">Cadastrar</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant={tab === 'equipe' ? 'default' : 'outline'} size="sm" onClick={() => setTab('equipe')} className="gap-2">
            <Users size={14} /> Equipe ({teamMembers.length})
          </Button>
          <Button variant={tab === 'parceiros' ? 'default' : 'outline'} size="sm" onClick={() => setTab('parceiros')} className="gap-2">
            <Handshake size={14} /> Parceiros ({partnerMembers.length})
          </Button>
        </div>
        {tab === 'parceiros' && currentUser?.role === 'admin' && (
          <Dialog open={partnerOpen} onOpenChange={setPartnerOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => { setPartnerCreateForm({ name: '', email: '', password: '', serviceFunction: 'fotografo', companyName: '', fixedRate: 0, phone: '', notes: '' }); }}>
                <Plus size={16} className="mr-2" /> Novo Parceiro
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Novo Parceiro</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1"><Label>Nome</Label><Input value={partnerCreateForm.name} onChange={e => setPartnerCreateForm({ ...partnerCreateForm, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Email</Label><Input type="email" value={partnerCreateForm.email} onChange={e => setPartnerCreateForm({ ...partnerCreateForm, email: e.target.value })} /></div>
                <div className="space-y-1"><Label>Senha</Label><Input type="password" value={partnerCreateForm.password} onChange={e => setPartnerCreateForm({ ...partnerCreateForm, password: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
                <div className="space-y-1">
                  <Label>Função no Sistema</Label>
                  <Select value={partnerCreateForm.serviceFunction} onValueChange={v => setPartnerCreateForm({ ...partnerCreateForm, serviceFunction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PARTNER_FUNCTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">O parceiro terá acesso ao sistema de acordo com esta função</p>
                </div>
                <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-sm font-semibold flex items-center gap-2"><Handshake size={16} /> Dados do Parceiro</p>
                  <div className="space-y-1">
                    <Label>Empresa (opcional)</Label>
                    <Input value={partnerCreateForm.companyName} onChange={e => setPartnerCreateForm({ ...partnerCreateForm, companyName: e.target.value })} placeholder="Nome da empresa" />
                  </div>
                  <div className="space-y-1">
                    <Label>WhatsApp</Label>
                    <Input value={partnerCreateForm.phone} onChange={e => setPartnerCreateForm({ ...partnerCreateForm, phone: e.target.value })} placeholder="5511999999999" />
                  </div>
                  <div className="space-y-1">
                    <Label>Observações</Label>
                    <Textarea value={partnerCreateForm.notes} onChange={e => setPartnerCreateForm({ ...partnerCreateForm, notes: e.target.value })} rows={2} />
                  </div>
                </div>
                <Button onClick={handleSavePartner} className="w-full">Cadastrar Parceiro</Button>
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
      ) : tab === 'equipe' ? (
        teamMembers.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted-foreground">
            <Users size={40} className="mx-auto mb-3 opacity-50" /><p>Nenhum usuário cadastrado</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {teamMembers.map(u => (
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
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Redefinir senha" onClick={() => { setResetTarget(u); setResetOpen(true); }}>
                        <KeyRound size={16} />
                      </Button>
                      {u.id !== currentUser?.id && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir membro" onClick={() => handleDeleteMember(u)}>
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        partnerMembers.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted-foreground">
            <Handshake size={40} className="mx-auto mb-3 opacity-50" /><p>Nenhum parceiro cadastrado</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {partnerMembers.map(u => {
              const info = getPartnerInfo(u.id);
              return (
                <div key={u.id} className="glass-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <UserAvatar user={u} size="lg" />
                      <div>
                        <p className="font-medium">{u.displayName || u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        {info && (
                          <div className="flex items-center gap-2 mt-1">
                            {info.company_name && <span className="text-xs bg-muted px-2 py-0.5 rounded">{info.company_name}</span>}
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{info.service_function}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      {info && (
                        <div>
                          <p className="text-sm font-bold">R$ {Number(info.fixed_rate).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <p className="text-[10px] text-muted-foreground">por serviço</p>
                        </div>
                      )}
                      {currentUser?.role === 'admin' && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Redefinir senha" onClick={() => { setResetTarget(u); setResetOpen(true); }}>
                            <KeyRound size={16} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir parceiro" onClick={() => handleDeleteMember(u)}>
                            <Trash2 size={16} />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Users, Plus, Trash2, Upload, Save, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  specialty: string | null;
  bio: string;
  photo_url: string | null;
  display_order: number;
  active: boolean;
}

export default function TeamMembersAdmin() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) toast.error('Erro ao carregar equipe');
    else setMembers((data || []) as TeamMember[]);
    setLoading(false);
  }

  async function addMember() {
    const nextOrder = members.length > 0 ? Math.max(...members.map(m => m.display_order)) + 1 : 0;
    const { data, error } = await supabase
      .from('team_members')
      .insert({
        name: 'Novo membro',
        role: 'Cargo',
        specialty: '',
        bio: 'Breve bio do profissional...',
        display_order: nextOrder,
        active: true,
      })
      .select()
      .single();
    if (error) return toast.error('Erro ao adicionar: ' + error.message);
    setMembers([...members, data as TeamMember]);
    toast.success('Membro adicionado');
  }

  function updateLocal(id: string, patch: Partial<TeamMember>) {
    setMembers(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function saveMember(member: TeamMember) {
    setSavingId(member.id);
    const { error } = await supabase
      .from('team_members')
      .update({
        name: member.name,
        role: member.role,
        specialty: member.specialty,
        bio: member.bio,
        photo_url: member.photo_url,
        active: member.active,
        display_order: member.display_order,
      })
      .eq('id', member.id);
    setSavingId(null);
    if (error) toast.error('Erro ao salvar: ' + error.message);
    else toast.success('Salvo!');
  }

  async function deleteMember(id: string) {
    if (!confirm('Remover este membro da equipe?')) return;
    const { error } = await supabase.from('team_members').delete().eq('id', id);
    if (error) return toast.error('Erro: ' + error.message);
    setMembers(prev => prev.filter(m => m.id !== id));
    toast.success('Removido');
  }

  async function handlePhotoUpload(member: TeamMember, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Selecione uma imagem');
    if (file.size > 10 * 1024 * 1024) return toast.error('Imagem muito grande (máx 10MB)');

    setUploadingId(member.id);
    try {
      const ext = file.name.split('.').pop();
      const path = `team/${member.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-content').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('client-content').getPublicUrl(path);
      const newUrl = urlData.publicUrl;
      updateLocal(member.id, { photo_url: newUrl });
      await supabase.from('team_members').update({ photo_url: newUrl }).eq('id', member.id);
      toast.success('Foto enviada!');
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + err.message);
    } finally {
      setUploadingId(null);
    }
  }

  async function moveMember(id: string, direction: -1 | 1) {
    const idx = members.findIndex(m => m.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= members.length) return;
    const a = members[idx];
    const b = members[swapIdx];
    const newList = [...members];
    newList[idx] = { ...b, display_order: a.display_order };
    newList[swapIdx] = { ...a, display_order: b.display_order };
    setMembers(newList);
    await Promise.all([
      supabase.from('team_members').update({ display_order: a.display_order }).eq('id', b.id),
      supabase.from('team_members').update({ display_order: b.display_order }).eq('id', a.id),
    ]);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users size={18} className="text-primary" />
              Equipe — Especialistas da Pulse
            </CardTitle>
            <CardDescription>
              Gerencie os membros da equipe exibidos na landing page (seção "Nossa Equipe").
            </CardDescription>
          </div>
          <Button onClick={addMember} size="sm" className="gap-1.5">
            <Plus size={14} /> Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum membro cadastrado. Clique em "Adicionar" para começar.
          </p>
        ) : (
          members.map((m, idx) => (
            <div key={m.id} className="p-4 rounded-xl border border-border bg-muted/30 space-y-3">
              <div className="flex items-start gap-3">
                {/* Photo */}
                <div className="shrink-0 space-y-2">
                  <div className="w-24 h-32 rounded-lg overflow-hidden bg-muted border border-border flex items-center justify-center">
                    {m.photo_url ? (
                      <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
                    ) : (
                      <Users size={24} className="text-muted-foreground" />
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handlePhotoUpload(m, e)}
                    className="hidden"
                    id={`photo-${m.id}`}
                    disabled={uploadingId === m.id}
                  />
                  <Button asChild size="sm" variant="outline" className="w-24 h-7 text-xs gap-1">
                    <label htmlFor={`photo-${m.id}`} className="cursor-pointer">
                      <Upload size={11} />
                      {uploadingId === m.id ? '...' : 'Foto'}
                    </label>
                  </Button>
                </div>

                {/* Fields */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input value={m.name} onChange={e => updateLocal(m.id, { name: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Cargo</Label>
                    <Input value={m.role} onChange={e => updateLocal(m.id, { role: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Especialidade (destaque)</Label>
                    <Input
                      value={m.specialty || ''}
                      onChange={e => updateLocal(m.id, { specialty: e.target.value })}
                      placeholder="Ex: Especialista em campanhas de tráfego pago"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Bio</Label>
                    <Textarea
                      rows={3}
                      value={m.bio}
                      onChange={e => updateLocal(m.id, { bio: e.target.value })}
                    />
                  </div>
                </div>

                {/* Order */}
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveMember(m.id, -1)} disabled={idx === 0}>
                    <ArrowUp size={12} />
                  </Button>
                  <GripVertical size={14} className="text-muted-foreground mx-auto" />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveMember(m.id, 1)} disabled={idx === members.length - 1}>
                    <ArrowDown size={12} />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <Switch checked={m.active} onCheckedChange={v => updateLocal(m.id, { active: v })} />
                  <span className="text-xs text-muted-foreground">{m.active ? 'Visível' : 'Oculto'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-1" onClick={() => deleteMember(m.id)}>
                    <Trash2 size={13} /> Remover
                  </Button>
                  <Button size="sm" onClick={() => saveMember(m)} disabled={savingId === m.id} className="gap-1">
                    <Save size={13} /> {savingId === m.id ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

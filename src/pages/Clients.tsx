import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { DAY_LABELS, CONTENT_TYPE_LABELS } from '@/types';
import type { Client, DayOfWeek, ContentType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';

const DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const CONTENT_TYPES: ContentType[] = ['reels', 'story', 'produto'];

const emptyClient = (): Partial<Client> => ({
  companyName: '', responsiblePerson: '', phone: '', fixedDay: 'segunda', fixedTime: '09:00',
  videomaker: '', backupTime: '14:00', backupDay: 'terca', extraDay: 'quarta',
  extraContentTypes: [], acceptsExtra: false, weeklyGoal: 10,
});

export default function Clients() {
  const { clients, users, addClient, updateClient, deleteClient } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client>>(emptyClient());

  const videomakers = users.filter(u => u.role === 'videomaker');

  const handleOpen = (client?: Client) => {
    if (client) { setEditing(client); setForm(client); }
    else { setEditing(null); setForm(emptyClient()); }
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.companyName || !form.responsiblePerson || !form.phone || !form.videomaker) {
      toast.error('Preencha todos os campos obrigatórios'); return;
    }
    if (editing) {
      updateClient({ ...editing, ...form } as Client);
      toast.success('Cliente atualizado');
    } else {
      const ok = addClient({ ...form, id: crypto.randomUUID() } as Client);
      if (!ok) { toast.error('Empresa já cadastrada'); return; }
      toast.success('Cliente cadastrado');
    }
    setOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!deleteClient(id)) {
      toast.error('Não é possível excluir cliente com gravações futuras'); return;
    }
    toast.success('Cliente removido');
  };

  const toggleContentType = (ct: ContentType) => {
    const types = form.extraContentTypes || [];
    setForm({ ...form, extraContentTypes: types.includes(ct) ? types.filter(t => t !== ct) : [...types, ct] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Clientes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpen()}><Plus size={16} className="mr-2" /> Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Nome da Empresa *</Label>
                  <Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Responsável *</Label>
                  <Input value={form.responsiblePerson} onChange={e => setForm({ ...form, responsiblePerson: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Telefone *</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Dia Fixo de Gravação</Label>
                  <Select value={form.fixedDay} onValueChange={v => setForm({ ...form, fixedDay: v as DayOfWeek })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{DAY_LABELS[d]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Horário Fixo</Label>
                  <Input type="time" value={form.fixedTime} onChange={e => setForm({ ...form, fixedTime: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Videomaker Responsável *</Label>
                  <Select value={form.videomaker} onValueChange={v => setForm({ ...form, videomaker: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Dia Backup</Label>
                  <Select value={form.backupDay} onValueChange={v => setForm({ ...form, backupDay: v as DayOfWeek })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{DAY_LABELS[d]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Horário Backup</Label>
                  <Input type="time" value={form.backupTime} onChange={e => setForm({ ...form, backupTime: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Dia Extra</Label>
                  <Select value={form.extraDay} onValueChange={v => setForm({ ...form, extraDay: v as DayOfWeek })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{DAY_LABELS[d]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Meta Semanal</Label>
                  <Input type="number" min={1} value={form.weeklyGoal} onChange={e => setForm({ ...form, weeklyGoal: Number(e.target.value) })} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={form.acceptsExtra} onCheckedChange={v => setForm({ ...form, acceptsExtra: v })} />
                <Label>Aceita conteúdo extra?</Label>
              </div>

              {form.acceptsExtra && (
                <div className="space-y-2">
                  <Label>Tipos de Conteúdo Extra</Label>
                  <div className="flex gap-2">
                    {CONTENT_TYPES.map(ct => (
                      <button key={ct} onClick={() => toggleContentType(ct)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${form.extraContentTypes?.includes(ct) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                        {CONTENT_TYPE_LABELS[ct]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleSave} className="w-full">{editing ? 'Salvar Alterações' : 'Cadastrar'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Building2 size={40} className="mx-auto mb-3 opacity-50" />
          <p>Nenhum cliente cadastrado</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {clients.map(c => (
            <div key={c.id} className="glass-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                  {c.companyName.charAt(0)}
                </div>
                <div>
                  <p className="font-medium">{c.companyName}</p>
                  <p className="text-xs text-muted-foreground">
                    {DAY_LABELS[c.fixedDay]} às {c.fixedTime} · {users.find(u => u.id === c.videomaker)?.name || '—'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => handleOpen(c)}><Pencil size={16} /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 size={16} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

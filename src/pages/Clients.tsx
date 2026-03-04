import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { DAY_LABELS, CONTENT_TYPE_LABELS, CLIENT_COLORS } from '@/types';
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
  companyName: '', responsiblePerson: '', phone: '', color: CLIENT_COLORS[0].value,
  fixedDay: 'segunda', fixedTime: '09:00',
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
    if (!deleteClient(id)) { toast.error('Não é possível excluir cliente com gravações futuras'); return; }
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

                {/* Color picker */}
                <div className="col-span-2 space-y-2">
                  <Label>Cor de Identificação</Label>
                  <div className="flex gap-2 flex-wrap">
                    {CLIENT_COLORS.map(c => (
                      <button key={c.value} onClick={() => setForm({ ...form, color: c.value })}
                        title={c.name}
                        className={`w-8 h-8 rounded-lg transition-all ${form.color === c.value ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'}`}
                        style={{ backgroundColor: `hsl(${c.value})` }}
                      />
                    ))}
                  </div>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map(c => (
            <div key={c.id} className="glass-card p-4 flex items-center justify-between"
              style={{ borderLeftWidth: 4, borderLeftColor: `hsl(${c.color || '220 10% 50%'})` }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ backgroundColor: `hsl(${c.color || '220 10% 50%'} / 0.15)`, color: `hsl(${c.color || '220 10% 50%'})` }}>
                  {c.companyName.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.companyName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {DAY_LABELS[c.fixedDay]} · {c.fixedTime} · {users.find(u => u.id === c.videomaker)?.name || '—'}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpen(c)}><Pencil size={14} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(c.id)}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

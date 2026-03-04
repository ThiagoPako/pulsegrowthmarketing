import { useState, useMemo } from 'react';
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
import { Plus, Pencil, Trash2, Building2, Star, Clock, CalendarCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const CONTENT_TYPES: ContentType[] = ['reels', 'story', 'produto'];

const emptyClient = (): Partial<Client> => ({
  companyName: '', responsiblePerson: '', phone: '', color: CLIENT_COLORS[0].value,
  fixedDay: 'segunda', fixedTime: '09:00',
  videomaker: '', backupTime: '14:00', backupDay: 'terca', extraDay: 'quarta',
  extraContentTypes: [], acceptsExtra: false, weeklyGoal: 10,
  hasEndomarketing: false, weeklyStories: 0, presenceDays: 1,
});

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface SlotInfo {
  day: DayOfWeek;
  time: string;
  videomakerId: string;
  videomkerName: string;
  occupiedSlots: number;
  totalSlots: number;
  freeSlots: number;
}

export default function Clients() {
  const { clients, users, recordings, settings, addClient, updateClient, deleteClient } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client>>(emptyClient());

  const videomakers = users.filter(u => u.role === 'videomaker');

  // Calculate available slots per videomaker per day
  const availableSlots = useMemo(() => {
    if (!form.videomaker && videomakers.length === 0) return [];

    const targetVideomakers = form.videomaker ? [form.videomaker] : videomakers.map(v => v.id);
    const slots: SlotInfo[] = [];
    const workStart = timeToMinutes(settings.startTime);
    const workEnd = timeToMinutes(settings.endTime);
    const duration = 120; // 2 hours

    for (const vmId of targetVideomakers) {
      const vm = users.find(u => u.id === vmId);
      if (!vm) continue;

      for (const day of settings.workDays) {
        let totalSlots = 0;
        let occupiedSlots = 0;

        // Count how many 2h slots fit and how many are taken
        for (let t = workStart; t + duration <= workEnd; t += duration) {
          totalSlots++;
          const timeStr = minutesToTime(t);

          // Check if any client has this slot on this day for this videomaker
          const isOccupied = clients.some(c => {
            if (editing && c.id === editing.id) return false;
            return c.videomaker === vmId && c.fixedDay === day && c.fixedTime === timeStr;
          });

          if (!isOccupied) {
            slots.push({
              day,
              time: timeStr,
              videomakerId: vmId,
              videomkerName: vm.name,
              occupiedSlots,
              totalSlots,
              freeSlots: totalSlots - occupiedSlots,
            });
          } else {
            occupiedSlots++;
          }
        }
      }
    }

    return slots;
  }, [form.videomaker, videomakers, settings, clients, users, editing]);

  // Best slot = day with most free slots for selected videomaker
  const bestSlot = useMemo(() => {
    if (availableSlots.length === 0) return null;

    const targetVm = form.videomaker;
    const filtered = targetVm ? availableSlots.filter(s => s.videomakerId === targetVm) : availableSlots;
    if (filtered.length === 0) return null;

    // Group by day+videomaker, count free per day
    const dayMap = new Map<string, { count: number; day: DayOfWeek; vmId: string; vmName: string; firstTime: string }>();
    for (const s of filtered) {
      const key = `${s.videomakerId}-${s.day}`;
      const existing = dayMap.get(key);
      if (!existing) {
        dayMap.set(key, { count: 1, day: s.day, vmId: s.videomakerId, vmName: s.videomkerName, firstTime: s.time });
      } else {
        existing.count++;
      }
    }

    let best: { count: number; day: DayOfWeek; vmId: string; vmName: string; firstTime: string } | null = null;
    for (const entry of dayMap.values()) {
      if (!best || entry.count > best.count) best = entry;
    }
    return best;
  }, [availableSlots, form.videomaker]);

  // Available times for selected day + videomaker
  const availableTimesForDay = useMemo(() => {
    if (!form.videomaker || !form.fixedDay) return [];
    return availableSlots.filter(s => s.videomakerId === form.videomaker && s.day === form.fixedDay);
  }, [availableSlots, form.videomaker, form.fixedDay]);

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

  const selectBestSlot = () => {
    if (!bestSlot) return;
    setForm(prev => ({
      ...prev,
      videomaker: bestSlot.vmId,
      fixedDay: bestSlot.day,
      fixedTime: bestSlot.firstTime,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Clientes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpen()}><Plus size={16} className="mr-2" /> Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle></DialogHeader>
            <div className="space-y-5">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Nome da Empresa *</Label>
                  <Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} />
                </div>

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
              </div>

              {/* Videomaker selection */}
              <div className="space-y-1">
                <Label>Videomaker Responsável *</Label>
                <Select value={form.videomaker} onValueChange={v => setForm({ ...form, videomaker: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Best slot suggestion */}
              {bestSlot && (
                <button
                  onClick={selectBestSlot}
                  className="w-full p-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-left flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Star size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary">Melhor horário disponível</p>
                    <p className="text-xs text-muted-foreground">
                      {bestSlot.vmName} · {DAY_LABELS[bestSlot.day]} às {bestSlot.firstTime} — {bestSlot.count} vagas livres
                    </p>
                  </div>
                  <Badge variant="secondary" className="ml-auto shrink-0 bg-primary/15 text-primary border-0">
                    Sugerido
                  </Badge>
                </button>
              )}

              {/* Day + Time selection with availability */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Dia Fixo de Gravação</Label>
                  <Select value={form.fixedDay} onValueChange={v => setForm({ ...form, fixedDay: v as DayOfWeek, fixedTime: '' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS.filter(d => settings.workDays.includes(d)).map(d => {
                        const freeCount = form.videomaker
                          ? availableSlots.filter(s => s.videomakerId === form.videomaker && s.day === d).length
                          : availableSlots.filter(s => s.day === d).length;
                        const isBest = bestSlot?.day === d && (!form.videomaker || bestSlot?.vmId === form.videomaker);
                        return (
                          <SelectItem key={d} value={d}>
                            <span className="flex items-center gap-2">
                              {DAY_LABELS[d]}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${freeCount === 0 ? 'bg-destructive/15 text-destructive' : isBest ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'}`}>
                                {freeCount} {freeCount === 1 ? 'vaga' : 'vagas'}
                              </span>
                              {isBest && <Star size={10} className="text-primary" />}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Horário Fixo</Label>
                  {form.videomaker && availableTimesForDay.length > 0 ? (
                    <Select value={form.fixedTime} onValueChange={v => setForm({ ...form, fixedTime: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {availableTimesForDay.map(s => (
                          <SelectItem key={s.time} value={s.time}>
                            <span className="flex items-center gap-2">
                              <Clock size={12} className="text-muted-foreground" />
                              {s.time} – {minutesToTime(timeToMinutes(s.time) + 120)}
                              {bestSlot?.firstTime === s.time && bestSlot?.day === form.fixedDay && (
                                <Star size={10} className="text-primary" />
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3">
                      <span className="text-sm text-muted-foreground">
                        {!form.videomaker ? 'Selecione o videomaker primeiro' :
                          availableTimesForDay.length === 0 ? 'Sem vagas neste dia' : 'Selecione'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Backup + Extra */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Dia Backup</Label>
                  <Select value={form.backupDay} onValueChange={v => setForm({ ...form, backupDay: v as DayOfWeek })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.filter(d => settings.workDays.includes(d)).map(d => <SelectItem key={d} value={d}>{DAY_LABELS[d]}</SelectItem>)}</SelectContent>
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
                    <SelectContent>{DAYS.filter(d => settings.workDays.includes(d)).map(d => <SelectItem key={d} value={d}>{DAY_LABELS[d]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Meta Semanal (vídeos)</Label>
                  <Input type="number" min={1} value={form.weeklyGoal} onChange={e => setForm({ ...form, weeklyGoal: Number(e.target.value) })} />
                </div>
              </div>

              {/* New fields: Stories, Presença, Endomarketing */}
              <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-4">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <CalendarCheck size={16} className="text-primary" /> Produção Semanal
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Qtd. Stories por Semana</Label>
                    <Input type="number" min={0} value={form.weeklyStories ?? 0} onChange={e => setForm({ ...form, weeklyStories: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Dias de Presença</Label>
                    <Input type="number" min={1} max={7} value={form.presenceDays ?? 1} onChange={e => setForm({ ...form, presenceDays: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.hasEndomarketing ?? false} onCheckedChange={v => setForm({ ...form, hasEndomarketing: v })} />
                  <Label>Tem Endomarketing?</Label>
                </div>
              </div>

              {/* Extra content */}
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
                  <div className="flex gap-1 mt-1">
                    {c.hasEndomarketing && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Endo</Badge>}
                    {(c.weeklyStories ?? 0) > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{c.weeklyStories} stories</Badge>}
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{c.presenceDays ?? 1}d presença</Badge>
                  </div>
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

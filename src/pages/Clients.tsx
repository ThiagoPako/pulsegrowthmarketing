import { useState, useMemo, useRef, useEffect } from 'react';
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
import { Plus, Pencil, Trash2, Building2, Star, Clock, CalendarCheck, ChevronRight, ChevronLeft, AlertTriangle, User, Video, Target, Upload, X, MessageSquare, Send, Package, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { sendWhatsAppMessage } from '@/services/whatsappService';
import { Textarea } from '@/components/ui/textarea';

const DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const CONTENT_TYPES: ContentType[] = ['reels', 'story', 'produto'];

type PreferredShift = 'turnoA' | 'turnoB' | 'ambos';

const emptyClient = (): Partial<Client> => ({
  companyName: '', responsiblePerson: '', phone: '', whatsapp: '', color: CLIENT_COLORS[0].value,
  fixedDay: 'segunda', fixedTime: '09:00',
  videomaker: '', backupTime: '14:00', backupDay: 'terca', extraDay: 'quarta',
  extraContentTypes: [], acceptsExtra: false, extraClientAppears: false,
  weeklyReels: 0, weeklyCreatives: 0, weeklyGoal: 10,
  hasEndomarketing: false, weeklyStories: 0, presenceDays: 1,
  monthlyRecordings: 4,
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

const STEP_LABELS = [
  { icon: User, label: 'Dados do Cliente' },
  { icon: Video, label: 'Agenda & Gravação' },
  { icon: Target, label: 'Metas Semanais' },
  { icon: DollarSign, label: 'Financeiro' },
];

export default function Clients() {
  const { clients, users, recordings, settings, addClient, updateClient, deleteClient, generateScheduleForClient } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client>>(emptyClient());
  const [step, setStep] = useState(0);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [preferredShift, setPreferredShift] = useState<PreferredShift>('ambos');
  const [sendWaOpen, setSendWaOpen] = useState(false);
  const [sendWaClient, setSendWaClient] = useState<Client | null>(null);
  const [sendWaMsg, setSendWaMsg] = useState('');
  const [sendWaLoading, setSendWaLoading] = useState(false);
  
  // Plan-related state
  const [plans, setPlans] = useState<{ id: string; name: string; status: string }[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [contractStartDate, setContractStartDate] = useState('');
  const [autoRenewal, setAutoRenewal] = useState(false);
  
  // Financial contract state
  const [contractValue, setContractValue] = useState(0);
  const [dueDay, setDueDay] = useState(10);
  const [paymentMethod, setPaymentMethod] = useState('pix');

  useEffect(() => {
    supabase.from('plans').select('id, name, status').eq('status', 'ativo').then(({ data }) => {
      if (data) setPlans(data as any[]);
    });
  }, []);

  const videomakers = users.filter(u => u.role === 'videomaker');

  // Calculate available slots per videomaker per day
  const availableSlots = useMemo(() => {
    if (!form.videomaker && videomakers.length === 0) return [];
    const targetVideomakers = form.videomaker ? [form.videomaker] : videomakers.map(v => v.id);
    const slots: SlotInfo[] = [];
    const shiftAStart = timeToMinutes(settings.shiftAStart);
    const shiftAEnd = timeToMinutes(settings.shiftAEnd);
    const shiftBStart = timeToMinutes(settings.shiftBStart);
    const shiftBEnd = timeToMinutes(settings.shiftBEnd);
    const duration = settings.recordingDuration;

    for (const vmId of targetVideomakers) {
      const vm = users.find(u => u.id === vmId);
      if (!vm) continue;
      for (const day of settings.workDays) {
        let occupiedSlots = 0;
        let totalSlots = 0;
        const shiftRanges: number[][] = [];
        if (preferredShift === 'turnoA' || preferredShift === 'ambos') shiftRanges.push([shiftAStart, shiftAEnd]);
        if (preferredShift === 'turnoB' || preferredShift === 'ambos') shiftRanges.push([shiftBStart, shiftBEnd]);
        for (const [sStart, sEnd] of shiftRanges) {
          for (let t = sStart; t + duration <= sEnd; t += duration + 30) {
            totalSlots++;
            const timeStr = minutesToTime(t);
            const isOccupied = clients.some(c => {
              if (editing && c.id === editing.id) return false;
              return c.videomaker === vmId && c.fixedDay === day && c.fixedTime === timeStr;
            });
            if (!isOccupied) {
              slots.push({ day, time: timeStr, videomakerId: vmId, videomkerName: vm.name, occupiedSlots, totalSlots, freeSlots: totalSlots - occupiedSlots });
            } else {
              occupiedSlots++;
            }
          }
        }
      }
    }
    return slots;
  }, [form.videomaker, videomakers, settings, clients, users, editing, preferredShift]);

  // Top 2 best slot suggestions for selected videomaker
  const bestSlots = useMemo(() => {
    if (!form.videomaker || availableSlots.length === 0) return [];
    const filtered = availableSlots.filter(s => s.videomakerId === form.videomaker);
    if (filtered.length === 0) return [];

    // Group by day, count free per day, pick first available time
    const dayMap = new Map<string, { count: number; day: DayOfWeek; vmId: string; vmName: string; firstTime: string }>();
    for (const s of filtered) {
      const key = s.day;
      const existing = dayMap.get(key);
      if (!existing) {
        dayMap.set(key, { count: 1, day: s.day, vmId: s.videomakerId, vmName: s.videomkerName, firstTime: s.time });
      } else {
        existing.count++;
      }
    }

    return Array.from(dayMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 2);
  }, [availableSlots, form.videomaker]);

  // Available times for selected day + videomaker
  const availableTimesForDay = useMemo(() => {
    if (!form.videomaker || !form.fixedDay) return [];
    return availableSlots.filter(s => s.videomakerId === form.videomaker && s.day === form.fixedDay);
  }, [availableSlots, form.videomaker, form.fixedDay]);

  // Available backup times for selected backup day + videomaker
  const availableBackupTimes = useMemo(() => {
    if (!form.videomaker || !form.backupDay) return [];
    return availableSlots.filter(s => s.videomakerId === form.videomaker && s.day === form.backupDay);
  }, [availableSlots, form.videomaker, form.backupDay]);

  const handleOpen = (client?: Client) => {
    if (client) {
      setEditing(client);
      setForm(client);
      setLogoPreview(client.logoUrl || null);
      // Load plan data for editing
      supabase.from('clients').select('plan_id, contract_start_date, auto_renewal').eq('id', client.id).single().then(({ data }) => {
        if (data) {
          setPlanId((data as any).plan_id || null);
          setContractStartDate((data as any).contract_start_date || '');
          setAutoRenewal((data as any).auto_renewal || false);
        }
      });
      // Load financial contract for editing
      supabase.from('financial_contracts').select('*').eq('client_id', client.id).maybeSingle().then(({ data }) => {
        if (data) {
          setContractValue(Number((data as any).contract_value) || 0);
          setDueDay((data as any).due_day || 10);
          setPaymentMethod((data as any).payment_method || 'pix');
        } else {
          setContractValue(0); setDueDay(10); setPaymentMethod('pix');
        }
      });
    }
    else {
      setEditing(null);
      setForm(emptyClient());
      setLogoPreview(null);
      setPlanId(null);
      setContractStartDate('');
      setAutoRenewal(false);
      setPreferredShift('ambos');
      setContractValue(0);
      setDueDay(10);
      setPaymentMethod('pix');
    }
    setLogoFile(null);
    setStep(0);
    setOpen(true);
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo deve ter no máximo 2MB'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setForm(prev => ({ ...prev, logoUrl: undefined }));
  };

  const uploadLogo = async (clientId: string): Promise<string | null> => {
    if (!logoFile) return form.logoUrl || null;
    setUploadingLogo(true);
    try {
      const ext = logoFile.name.split('.').pop();
      const path = `${clientId}.${ext}`;
      // Remove old logo if exists
      await supabase.storage.from('client-logos').remove([path]);
      const { error } = await supabase.storage.from('client-logos').upload(path, logoFile, { upsert: true });
      if (error) { console.error('Logo upload error:', error); return null; }
      const { data: urlData } = supabase.storage.from('client-logos').getPublicUrl(path);
      return urlData.publicUrl + '?t=' + Date.now();
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!form.companyName || !form.responsiblePerson || !form.whatsapp || !form.videomaker) {
      toast.error('Preencha todos os campos obrigatórios'); return;
    }
    if (editing) {
      const logoUrl = await uploadLogo(editing.id);
      updateClient({ ...editing, ...form, logoUrl: logoUrl || undefined } as Client);
      // Update plan fields
      await supabase.from('clients').update({ plan_id: planId || null, contract_start_date: contractStartDate || null, auto_renewal: autoRenewal } as any).eq('id', editing.id);
      // Upsert financial contract
      await supabase.from('financial_contracts').upsert({
        client_id: editing.id,
        plan_id: planId || null,
        contract_value: contractValue,
        contract_start_date: contractStartDate || new Date().toISOString().split('T')[0],
        due_day: dueDay,
        payment_method: paymentMethod,
        status: 'ativo',
      } as any, { onConflict: 'client_id' });
      toast.success('Cliente atualizado');
    } else {
      const clientId = crypto.randomUUID();
      const logoUrl = await uploadLogo(clientId);
      const newClient = { ...form, id: clientId, logoUrl: logoUrl || undefined } as Client;
      const ok = addClient(newClient);
      if (!ok) { toast.error('Empresa já cadastrada'); return; }
      // Update plan fields after insert
      await supabase.from('clients').update({ plan_id: planId || null, contract_start_date: contractStartDate || null, auto_renewal: autoRenewal } as any).eq('id', clientId);
      // Create financial contract
      await supabase.from('financial_contracts').insert({
        client_id: clientId,
        plan_id: planId || null,
        contract_value: contractValue,
        contract_start_date: contractStartDate || new Date().toISOString().split('T')[0],
        due_day: dueDay,
        payment_method: paymentMethod,
        status: 'ativo',
      } as any);
      const count = await generateScheduleForClient(newClient);
      if (count > 0) {
        toast.success(`Cliente cadastrado — ${count} gravação(ões) criada(s) na agenda`);
      } else {
        toast.success('Cliente cadastrado');
      }
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

  const selectSuggestion = (slot: { day: DayOfWeek; firstTime: string; vmId: string }) => {
    setForm(prev => ({ ...prev, videomaker: slot.vmId, fixedDay: slot.day, fixedTime: slot.firstTime }));
  };

  // Build full schedule grid data for selected videomaker
  const scheduleGrid = useMemo(() => {
    if (!form.videomaker) return null;
    const vm = users.find(u => u.id === form.videomaker);
    if (!vm) return null;

    const duration = settings.recordingDuration;
    const shiftAStart = timeToMinutes(settings.shiftAStart);
    const shiftAEnd = timeToMinutes(settings.shiftAEnd);
    const shiftBStart = timeToMinutes(settings.shiftBStart);
    const shiftBEnd = timeToMinutes(settings.shiftBEnd);

    // All time slots across both shifts
    const timeSlots: number[] = [];
    if (preferredShift === 'turnoA' || preferredShift === 'ambos') {
      for (let t = shiftAStart; t + duration <= shiftAEnd; t += duration + 30) timeSlots.push(t);
    }
    if (preferredShift === 'turnoB' || preferredShift === 'ambos') {
      for (let t = shiftBStart; t + duration <= shiftBEnd; t += duration + 30) timeSlots.push(t);
    }

    const workDays = settings.workDays;

    // Build grid: for each time slot × day, determine status
    const grid: { time: number; timeStr: string; days: { day: DayOfWeek; status: 'free' | 'occupied'; clientName?: string }[] }[] = [];

    for (const t of timeSlots) {
      const timeStr = minutesToTime(t);
      const row: typeof grid[0] = { time: t, timeStr, days: [] };
      for (const day of workDays) {
        const occupyingClient = clients.find(c => {
          if (editing && c.id === editing.id) return false;
          return c.videomaker === form.videomaker && c.fixedDay === day && c.fixedTime === timeStr;
        });
        row.days.push({
          day,
          status: occupyingClient ? 'occupied' : 'free',
          clientName: occupyingClient?.companyName,
        });
      }
      grid.push(row);
    }

    return { vmName: vm.name, workDays, grid };
  }, [form.videomaker, settings, clients, users, editing, preferredShift]);

  const canProceedStep0 = form.companyName && form.responsiblePerson && form.whatsapp;
  const canProceedStep1 = form.videomaker && form.fixedDay && form.fixedTime;

  // ========== STEP RENDERERS ==========

  const renderStep0 = () => (
    <div className="space-y-4">
      {/* Logo upload */}
      <div className="space-y-2">
        <Label>Logo da Empresa</Label>
        <div className="flex items-center gap-4">
          <div className="relative">
            {logoPreview ? (
              <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-border">
                <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                <button onClick={removeLogo}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button onClick={() => logoInputRef.current?.click()}
                className="w-16 h-16 rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <Upload size={16} className="text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground">Logo</span>
              </button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            <p>Clique para adicionar o logo do cliente.</p>
            <p>PNG, JPG ou SVG (máx. 2MB)</p>
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Nome da Empresa *</Label>
        <Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="Ex: Padaria do João" />
      </div>
      <div className="space-y-1">
        <Label>Nome do Responsável *</Label>
        <Input value={form.responsiblePerson} onChange={e => setForm({ ...form, responsiblePerson: e.target.value })} placeholder="Ex: João Silva" />
      </div>
      <div className="space-y-1">
        <Label>Telefone</Label>
        <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(62) 99999-9999" />
      </div>
      <div className="space-y-1">
        <Label>WhatsApp do Cliente *</Label>
        <Input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="5562999999999" />
        <p className="text-[10px] text-muted-foreground">Formato: 55 + DDD + número (ex: 5562999999999)</p>
      </div>
      <div className="space-y-2">
        <Label>Cor de Identificação</Label>
        <div className="flex gap-2 flex-wrap">
          {CLIENT_COLORS.map(c => (
            <button key={c.value} onClick={() => setForm({ ...form, color: c.value })} title={c.name}
              className={`w-8 h-8 rounded-lg transition-all ${form.color === c.value ? 'ring-2 ring-offset-2 ring-foreground scale-110' : 'hover:scale-105'}`}
              style={{ backgroundColor: `hsl(${c.value})` }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep1 = () => {
    const shiftALabel = `${settings.shiftAStart} – ${settings.shiftAEnd}`;
    const shiftBLabel = `${settings.shiftBStart} – ${settings.shiftBEnd}`;
    
    return (
    <div className="space-y-5">
      {/* Recording preferences - before scheduling */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Video size={16} className="text-primary" /> Preferências de Gravação
        </p>
        <p className="text-xs text-muted-foreground">
          Defina com o cliente quantas gravações por mês ele deseja e em qual período prefere gravar. 
          Cada sessão de gravação leva até <strong className="text-foreground">90 minutos</strong>.
        </p>
        
        {/* Monthly recordings quantity */}
        <div className="space-y-2">
          <Label>Gravações por mês *</Label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, monthlyRecordings: n }))}
                className={`p-3 rounded-xl border-2 text-center transition-all ${
                  form.monthlyRecordings === n
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <span className="text-lg font-bold block">{n}x</span>
                <span className="text-[10px] text-muted-foreground block">{n === 1 ? 'por mês' : 'por mês'}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock size={10} /> {form.monthlyRecordings ?? 4} gravação(ões) × ~90 min = ~{(form.monthlyRecordings ?? 4) * 90} min/mês
          </p>
        </div>

        {/* Preferred shift */}
        <div className="space-y-2">
          <Label>Período preferido para gravação *</Label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPreferredShift('turnoA')}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                preferredShift === 'turnoA'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/40 hover:bg-primary/5'
              }`}
            >
              <span className="text-xs font-bold block">☀️ Manhã</span>
              <span className="text-[10px] text-muted-foreground block">{shiftALabel}</span>
            </button>
            <button
              type="button"
              onClick={() => setPreferredShift('turnoB')}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                preferredShift === 'turnoB'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/40 hover:bg-primary/5'
              }`}
            >
              <span className="text-xs font-bold block">🌙 Tarde</span>
              <span className="text-[10px] text-muted-foreground block">{shiftBLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => setPreferredShift('ambos')}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                preferredShift === 'ambos'
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/40 hover:bg-primary/5'
              }`}
            >
              <span className="text-xs font-bold block">🔄 Ambos</span>
              <span className="text-[10px] text-muted-foreground block">Qualquer horário</span>
            </button>
          </div>
        </div>
      </div>

      {/* Videomaker */}
      <div className="space-y-1">
        <Label>Videomaker Responsável *</Label>
        <Select value={form.videomaker} onValueChange={v => setForm({ ...form, videomaker: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione o videomaker" /></SelectTrigger>
          <SelectContent>{videomakers.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Visual schedule grid */}
      {form.videomaker && scheduleGrid && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Agenda de {scheduleGrid.vmName}
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-16">Horário</th>
                    {scheduleGrid.workDays.map(d => (
                      <th key={d} className="px-1 py-1.5 text-center font-medium text-muted-foreground">
                        {DAY_LABELS[d].substring(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleGrid.grid.map((row, ri) => (
                    <tr key={ri} className="border-t border-border/50">
                      <td className="px-2 py-1 text-muted-foreground font-mono text-[10px] whitespace-nowrap">
                        {row.timeStr}
                      </td>
                      {row.days.map((cell, ci) => {
                        const isSelected = form.fixedDay === cell.day && form.fixedTime === row.timeStr;
                        const isBackup = form.backupDay === cell.day && form.backupTime === row.timeStr;
                        return (
                          <td key={ci} className="px-0.5 py-0.5">
                            {cell.status === 'occupied' ? (
                              <div className="rounded-md bg-destructive/12 border border-destructive/20 px-1 py-1 text-center truncate"
                                title={cell.clientName}>
                                <span className="text-destructive/80 font-medium text-[9px]">{cell.clientName?.substring(0, 6) || 'Ocupado'}</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => setForm(prev => ({ ...prev, fixedDay: cell.day, fixedTime: row.timeStr }))}
                                className={`w-full rounded-md px-1 py-1 text-center transition-all text-[9px] font-medium ${
                                  isSelected
                                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                                    : isBackup
                                    ? 'bg-accent border border-accent-foreground/20 text-accent-foreground'
                                    : 'bg-emerald-500/8 border border-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                                }`}
                              >
                                {isSelected ? '✓ Fixo' : isBackup ? 'Backup' : 'Livre'}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Legend */}
            <div className="flex gap-3 px-3 py-1.5 bg-muted/30 border-t border-border/50 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/30" /> Livre</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-destructive/15 border border-destructive/25" /> Ocupado</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-primary" /> Selecionado</span>
            </div>
          </div>
        </div>
      )}

      {/* Best slots suggestions (up to 2) */}
      {form.videomaker && bestSlots.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <Star size={14} /> Melhores horários disponíveis
          </p>
          <div className="grid grid-cols-1 gap-2">
            {bestSlots.map((slot, i) => (
              <button key={i} onClick={() => selectSuggestion(slot)}
                className={`w-full p-3 rounded-xl border-2 transition-colors text-left flex items-center gap-3 ${
                  form.fixedDay === slot.day && form.fixedTime === slot.firstTime
                    ? 'border-primary bg-primary/10'
                    : 'border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Star size={16} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{DAY_LABELS[slot.day]} às {slot.firstTime}</p>
                  <p className="text-xs text-muted-foreground">{slot.count} vagas livres neste dia</p>
                </div>
                <Badge variant="secondary" className="ml-auto shrink-0 bg-primary/15 text-primary border-0 text-[10px]">
                  {i === 0 ? 'Melhor opção' : '2ª opção'}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual day/time selection */}
      {form.videomaker && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Ou selecione manualmente:</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Dia Fixo</Label>
              <Select value={form.fixedDay} onValueChange={v => setForm({ ...form, fixedDay: v as DayOfWeek, fixedTime: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.filter(d => settings.workDays.includes(d)).map(d => {
                    const freeCount = availableSlots.filter(s => s.videomakerId === form.videomaker && s.day === d).length;
                    const isBest = bestSlots[0]?.day === d;
                    return (
                      <SelectItem key={d} value={d}>
                        <span className="flex items-center gap-2">
                          {DAY_LABELS[d]}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${freeCount === 0 ? 'bg-destructive/15 text-destructive' : isBest ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'}`}>
                            {freeCount} {freeCount === 1 ? 'vaga' : 'vagas'}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Horário Fixo</Label>
              {availableTimesForDay.length > 0 ? (
                <Select value={form.fixedTime} onValueChange={v => setForm({ ...form, fixedTime: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {availableTimesForDay.map(s => (
                      <SelectItem key={s.time} value={s.time}>
                        <span className="flex items-center gap-2">
                          <Clock size={12} className="text-muted-foreground" />
                          {s.time} – {minutesToTime(timeToMinutes(s.time) + settings.recordingDuration)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3">
                  <span className="text-sm text-muted-foreground">Sem vagas neste dia</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Backup day/time — only with responsible videomaker */}
      {form.videomaker && (
        <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <CalendarCheck size={14} /> Dia de Backup
          </p>
          <p className="text-xs text-muted-foreground">Segunda opção na semana com o videomaker responsável, caso tenha vaga.</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Dia Backup</Label>
              <Select value={form.backupDay} onValueChange={v => setForm({ ...form, backupDay: v as DayOfWeek })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.filter(d => settings.workDays.includes(d) && d !== form.fixedDay).map(d => {
                    const freeCount = availableSlots.filter(s => s.videomakerId === form.videomaker && s.day === d).length;
                    return (
                      <SelectItem key={d} value={d}>
                        <span className="flex items-center gap-2">
                          {DAY_LABELS[d]}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${freeCount === 0 ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                            {freeCount} {freeCount === 1 ? 'vaga' : 'vagas'}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Horário Backup</Label>
              {availableBackupTimes.length > 0 ? (
                <Select value={form.backupTime} onValueChange={v => setForm({ ...form, backupTime: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {availableBackupTimes.map(s => (
                      <SelectItem key={s.time} value={s.time}>
                        <span className="flex items-center gap-2">
                          <Clock size={12} className="text-muted-foreground" />
                          {s.time} – {minutesToTime(timeToMinutes(s.time) + settings.recordingDuration)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3">
                  <span className="text-sm text-muted-foreground">Sem vagas neste dia</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Extra content */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
        <Switch checked={form.acceptsExtra} onCheckedChange={v => setForm({ ...form, acceptsExtra: v })} />
        <Label className="font-medium">Aceita conteúdo extra?</Label>
      </div>

      {form.acceptsExtra && (
        <div className="p-4 rounded-xl bg-accent/50 border border-border space-y-4">
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
          <div className="flex items-center gap-3">
            <Switch checked={form.extraClientAppears ?? false} onCheckedChange={v => setForm({ ...form, extraClientAppears: v })} />
            <Label>Cliente aceita aparecer sem aviso prévio?</Label>
          </div>

          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-2 items-start">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              O conteúdo extra depende da disponibilidade de agenda e pode ser produzido por <strong>qualquer videomaker disponível</strong> na agência, não necessariamente o responsável pelo cliente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
  };

  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Target size={16} className="text-primary" /> Metas de Entrega Semanal
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Qtd. Reels</Label>
            <Input type="number" min={0} value={form.weeklyReels ?? 0} onChange={e => setForm({ ...form, weeklyReels: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Qtd. Criativos</Label>
            <Input type="number" min={0} value={form.weeklyCreatives ?? 0} onChange={e => setForm({ ...form, weeklyCreatives: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Stories/Semana</Label>
            <Input type="number" min={0} value={form.weeklyStories ?? 0} onChange={e => setForm({ ...form, weeklyStories: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Meta Total (vídeos)</Label>
            <Input type="number" min={1} value={form.weeklyGoal} onChange={e => setForm({ ...form, weeklyGoal: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      {/* Plan selection */}
      <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Package size={16} className="text-primary" /> Plano Contratado
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Plano</Label>
            <Select value={planId || 'none'} onValueChange={v => setPlanId(v === 'none' ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem plano</SelectItem>
                {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Início do contrato</Label>
            <Input type="date" value={contractStartDate} onChange={e => setContractStartDate(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={autoRenewal} onCheckedChange={setAutoRenewal} />
          <Label>Renovação automática</Label>
        </div>
      </div>

     </div>
   );

  const renderStep3 = () => (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <DollarSign size={16} className="text-primary" /> Contrato Financeiro
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Valor do Contrato (R$)</Label>
            <Input type="number" min={0} step={0.01} value={contractValue} onChange={e => setContractValue(Number(e.target.value))} placeholder="0,00" />
          </div>
          <div className="space-y-1">
            <Label>Dia de Vencimento</Label>
            <Input type="number" min={1} max={28} value={dueDay} onChange={e => setDueDay(Number(e.target.value))} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Forma de Pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="boleto">Boleto</SelectItem>
              <SelectItem value="cartao">Cartão</SelectItem>
              <SelectItem value="transferencia">Transferência</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Final Summary */}
      <div className="p-4 rounded-xl border border-border space-y-3">
        <p className="text-sm font-semibold">Resumo do Cadastro</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Empresa:</span>
          <span className="font-medium">{form.companyName}</span>
          <span className="text-muted-foreground">Videomaker:</span>
          <span className="font-medium">{users.find(u => u.id === form.videomaker)?.name || '—'}</span>
          <span className="text-muted-foreground">Dia fixo:</span>
          <span className="font-medium">{form.fixedDay ? DAY_LABELS[form.fixedDay] : '—'} às {form.fixedTime || '—'}</span>
          <span className="text-muted-foreground">Valor:</span>
          <span className="font-medium">{contractValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          <span className="text-muted-foreground">Vencimento:</span>
          <span className="font-medium">Dia {dueDay}</span>
          <span className="text-muted-foreground">Pagamento:</span>
          <span className="font-medium capitalize">{paymentMethod}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Clientes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpen()}><Plus size={16} className="mr-2" /> Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            </DialogHeader>

            {/* Stepper indicator */}
            {!editing && (
              <div className="flex items-center gap-1 mb-2">
                {STEP_LABELS.map((s, i) => {
                  const Icon = s.icon;
                  const isActive = i === step;
                  const isDone = i < step;
                  return (
                    <div key={i} className="flex items-center gap-1 flex-1">
                      <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors w-full justify-center ${
                        isActive ? 'bg-primary text-primary-foreground' : isDone ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        <Icon size={13} />
                        <span className="hidden sm:inline">{s.label}</span>
                        <span className="sm:hidden">{i + 1}</span>
                      </div>
                      {i < STEP_LABELS.length - 1 && <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step content */}
            <div className="min-h-[200px]">
              {editing ? (
                // Editing: show all fields together
                <div className="space-y-5">
                  {renderStep0()}
                  {renderStep1()}
                  {renderStep2()}
                  {renderStep3()}
                </div>
              ) : (
                <>
                  {step === 0 && renderStep0()}
                  {step === 1 && renderStep1()}
                  {step === 2 && renderStep2()}
                  {step === 3 && renderStep3()}
                </>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-2 pt-2">
              {editing ? (
                <Button onClick={handleSave} className="w-full">Salvar Alterações</Button>
              ) : (
                <>
                  {step > 0 && (
                    <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1">
                      <ChevronLeft size={14} /> Voltar
                    </Button>
                  )}
                  {step < 3 ? (
                    <Button onClick={() => setStep(s => s + 1)} className="ml-auto gap-1"
                      disabled={step === 0 ? !canProceedStep0 : step === 1 ? !canProceedStep1 : false}>
                      Próximo <ChevronRight size={14} />
                    </Button>
                  ) : (
                    <Button onClick={handleSave} className="ml-auto gap-1">
                      <CalendarCheck size={14} /> Cadastrar Cliente
                    </Button>
                  )}
                </>
              )}
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
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt={c.companyName} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ backgroundColor: `hsl(${c.color || '220 10% 50%'} / 0.15)`, color: `hsl(${c.color || '220 10% 50%'})` }}>
                    {c.companyName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.companyName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {DAY_LABELS[c.fixedDay]} · {c.fixedTime} · {users.find(u => u.id === c.videomaker)?.name || '—'}
                  </p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {(c.weeklyReels ?? 0) > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{c.weeklyReels} reels</Badge>}
                    {(c.weeklyCreatives ?? 0) > 0 && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{c.weeklyCreatives} criativos</Badge>}
                    {c.acceptsExtra && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Extra{c.extraClientAppears ? ' · Aparece' : ''}</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {c.whatsapp && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={() => {
                    setSendWaClient(c);
                    setSendWaOpen(true);
                  }}><MessageSquare size={14} /></Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpen(c)}><Pencil size={14} /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(c.id)}><Trash2 size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* WhatsApp Send Dialog */}
      <Dialog open={sendWaOpen} onOpenChange={setSendWaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MessageSquare size={18} className="text-success" /> Enviar WhatsApp</DialogTitle>
          </DialogHeader>
          {sendWaClient && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="font-medium text-sm">{sendWaClient.companyName}</p>
                <p className="text-xs text-muted-foreground">{sendWaClient.whatsapp}</p>
              </div>
              <div className="space-y-1">
                <Label>Mensagem</Label>
                <Textarea value={sendWaMsg} onChange={e => setSendWaMsg(e.target.value)} placeholder="Digite a mensagem..." rows={5} />
              </div>
              <Button onClick={async () => {
                if (!sendWaMsg) { toast.error('Digite uma mensagem'); return; }
                setSendWaLoading(true);
                const result = await sendWhatsAppMessage({
                  number: sendWaClient.whatsapp,
                  message: sendWaMsg,
                  clientId: sendWaClient.id,
                  triggerType: 'manual',
                });
                setSendWaLoading(false);
                if (result.success) {
                  toast.success('Mensagem enviada!');
                  setSendWaOpen(false);
                  setSendWaMsg('');
                } else {
                  toast.error(result.error || 'Erro ao enviar');
                }
              }} disabled={sendWaLoading} className="w-full gap-2">
                <Send size={16} /> {sendWaLoading ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

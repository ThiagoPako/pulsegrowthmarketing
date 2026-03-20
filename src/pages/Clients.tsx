import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { generateClientCardPdf } from '@/lib/clientCardPdf';
import { NICHE_OPTIONS, getSeasonalAlerts } from '@/lib/seasonalDates';
import { DAY_LABELS, CONTENT_TYPE_LABELS, CLIENT_COLORS } from '@/types';
import type { Client, DayOfWeek, ContentType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Building2, Star, Clock, CalendarCheck, ChevronRight, ChevronLeft, AlertTriangle, User, Video, Target, Upload, X, MessageSquare, Send, Package, DollarSign, Instagram, Facebook, Link2, Unlink, RefreshCw, Globe, Info, Printer, FolderOpen, KeyRound, Copy, ExternalLink, Database, FileText as FileTextIcon, MonitorPlay, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { sendWhatsAppMessage } from '@/services/whatsappService';
import { Textarea } from '@/components/ui/textarea';
import { useOnboarding } from '@/hooks/useOnboarding';
import ClientArtDatabaseDialog from '@/components/ClientArtDatabaseDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import ClientGoalRocket from '@/components/ClientGoalRocket';

const DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const CONTENT_TYPES: ContentType[] = ['reels', 'story', 'produto'];

type PreferredShift = 'turnoA' | 'turnoB' | 'ambos';

const emptyClient = (): Partial<Client> & { clientType?: string } => ({
  companyName: '', responsiblePerson: '', phone: '', whatsapp: '', email: '', city: '', color: CLIENT_COLORS[0].value,
  fixedDay: 'segunda', fixedTime: '09:00',
  videomaker: '', backupTime: '14:00', backupDay: 'terca', extraDay: 'quarta',
  extraContentTypes: [], acceptsExtra: false, extraClientAppears: false,
  weeklyReels: 0, weeklyCreatives: 0, weeklyGoal: 10,
  hasEndomarketing: false, hasVehicleFlyer: false, weeklyStories: 0, presenceDays: 1,
  monthlyRecordings: 4, niche: '',
  clientLogin: '', clientPassword: '', driveLink: '', driveFotos: '', driveIdentidadeVisual: '',
  editorial: '',
  fullShiftRecording: false, preferredShift: 'manha',
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

interface SocialAccountState {
  instagram: { connected: boolean; accountName: string; username: string; pageId: string; businessId: string };
  facebook: { connected: boolean; accountName: string; pageId: string };
}

const emptySocialAccounts = (): SocialAccountState => ({
  instagram: { connected: false, accountName: '', username: '', pageId: '', businessId: '' },
  facebook: { connected: false, accountName: '', pageId: '' },
});

const STEP_LABELS = [
  { icon: User, label: 'Dados da Empresa' },
  { icon: Globe, label: 'Redes Sociais' },
  { icon: Target, label: 'Metas Semanais' },
  { icon: DollarSign, label: 'Financeiro' },
];

export default function Clients() {
  const { clients, users, recordings, settings, addClient, updateClient, deleteClient, generateScheduleForClient, currentUser } = useApp();
  const { createOnboardingForClient } = useOnboarding();
  const isDesignerOnly = currentUser?.role === 'designer' || currentUser?.role === 'fotografo';
  const [briefingClient, setBriefingClient] = useState<Client | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client> & { clientType?: string }>(emptyClient());
  const [clientType, setClientType] = useState<'novo' | 'existente'>('novo');
  const [step, setStep] = useState(0);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [preferredShift, setPreferredShift] = useState<PreferredShift>('ambos');
  const [sendWaOpen, setSendWaOpen] = useState(false);
  const [sendWaClient, setSendWaClient] = useState<Client | null>(null);
  const [sendWaMsg, setSendWaMsg] = useState('');
  const [sendWaLoading, setSendWaLoading] = useState(false);
  const [artDbClient, setArtDbClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Plan-related state
  const [plans, setPlans] = useState<{ id: string; name: string; status: string; reels_qty: number; creatives_qty: number; stories_qty: number; recording_sessions: number; accepts_extra_content: boolean }[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [contractStartDate, setContractStartDate] = useState('');
  const [autoRenewal, setAutoRenewal] = useState(false);
  const [contractDurationMonths, setContractDurationMonths] = useState(12);
  const [showMetrics, setShowMetrics] = useState(true);
  
  // Financial contract state
  const [contractValue, setContractValue] = useState(0);
  const [dueDay, setDueDay] = useState(10);
  const [paymentMethod, setPaymentMethod] = useState('pix');

  // Social accounts state
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountState>(emptySocialAccounts());
  const [existingSocialAccounts, setExistingSocialAccounts] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('plans').select('id, name, status, reels_qty, creatives_qty, stories_qty, recording_sessions, accepts_extra_content').eq('status', 'ativo').then(({ data }) => {
      if (data) setPlans(data as any[]);
    });
  }, []);

  const videomakers = users.filter(u => u.role === 'videomaker');

  const shiftSlotTimes = useMemo(() => {
    const buildSlots = (startTime: string, endTime: string) => {
      const slots: string[] = [];
      const start = timeToMinutes(startTime);
      const end = timeToMinutes(endTime);

      for (let t = start; t + settings.recordingDuration <= end; t += settings.recordingDuration + 30) {
        slots.push(minutesToTime(t));
      }

      return slots;
    };

    return {
      manha: buildSlots(settings.shiftAStart, settings.shiftAEnd),
      tarde: buildSlots(settings.shiftBStart, settings.shiftBEnd),
    };
  }, [settings]);

  const clientOccupiesSlot = useCallback((client: Client, videomakerId: string, day: DayOfWeek, time: string) => {
    if (client.videomaker !== videomakerId || client.fixedDay !== day) return false;

    if (client.fullShiftRecording) {
      const shift = client.preferredShift || 'manha';
      return shiftSlotTimes[shift].includes(time);
    }

    return client.fixedTime === time;
  }, [shiftSlotTimes]);

  const getOccupyingClient = useCallback((videomakerId: string, day: DayOfWeek, time: string) => {
    return clients.find(c => {
      if (editing && c.id === editing.id) return false;
      return clientOccupiesSlot(c, videomakerId, day, time);
    });
  }, [clients, editing, clientOccupiesSlot]);

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
            const occupyingClient = getOccupyingClient(vmId, day, timeStr);
            if (!occupyingClient) {
              slots.push({ day, time: timeStr, videomakerId: vmId, videomkerName: vm.name, occupiedSlots, totalSlots, freeSlots: totalSlots - occupiedSlots });
            } else {
              occupiedSlots++;
            }
          }
        }
      }
    }
    return slots;
  }, [form.videomaker, videomakers, settings, users, preferredShift, getOccupyingClient]);

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

  const fullShiftPeriods = useMemo(() => {
    if (!form.videomaker) return [];

    const requestedShifts: Array<'manha' | 'tarde'> = preferredShift === 'turnoA'
      ? ['manha']
      : preferredShift === 'turnoB'
        ? ['tarde']
        : ['manha', 'tarde'];

    return settings.workDays.flatMap(day =>
      requestedShifts.map(shift => {
        const occupyingClient = shiftSlotTimes[shift]
          .map(time => getOccupyingClient(form.videomaker as string, day, time))
          .find((client): client is Client => Boolean(client));

        return {
          day,
          shift,
          available: !occupyingClient,
          occupiedBy: occupyingClient?.companyName || null,
          label: shift === 'manha'
            ? `${settings.shiftAStart} – ${settings.shiftAEnd}`
            : `${settings.shiftBStart} – ${settings.shiftBEnd}`,
        };
      })
    );
  }, [form.videomaker, preferredShift, settings.workDays, settings.shiftAStart, settings.shiftAEnd, settings.shiftBStart, settings.shiftBEnd, shiftSlotTimes, getOccupyingClient]);

  const bestFullShiftPeriods = useMemo(() => {
    return fullShiftPeriods.filter(period => period.available).slice(0, 2);
  }, [fullShiftPeriods]);

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
      setPreferredShift(client.fullShiftRecording ? (client.preferredShift === 'tarde' ? 'turnoB' : 'turnoA') : 'ambos');
      // Load plan data for editing
      supabase.from('clients').select('plan_id, contract_start_date, auto_renewal, contract_duration_months').eq('id', client.id).single().then(({ data }) => {
        if (data) {
          setPlanId((data as any).plan_id || null);
          setContractStartDate((data as any).contract_start_date || '');
          setAutoRenewal((data as any).auto_renewal || false);
          setContractDurationMonths((data as any).contract_duration_months || 12);
          setShowMetrics((data as any).show_metrics !== false);
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
      // Load social accounts for editing
      supabase.from('social_accounts').select('*').eq('client_id', client.id).then(({ data }) => {
        setExistingSocialAccounts(data || []);
        const ig = (data || []).find((a: any) => a.platform === 'instagram');
        const fb = (data || []).find((a: any) => a.platform === 'facebook');
        setSocialAccounts({
          instagram: ig ? { connected: true, accountName: ig.account_name, username: ig.account_name, pageId: ig.facebook_page_id || '', businessId: ig.instagram_business_id || '' } : emptySocialAccounts().instagram,
          facebook: fb ? { connected: true, accountName: fb.account_name, pageId: fb.facebook_page_id || '' } : emptySocialAccounts().facebook,
        });
      });
    }
    else {
      setEditing(null);
      setForm(emptyClient());
      setLogoPreview(null);
      setPlanId(null);
      setContractStartDate('');
      setAutoRenewal(false);
      setContractDurationMonths(12);
      setShowMetrics(true);
      setPreferredShift('ambos');
      setContractValue(0);
      setDueDay(10);
      setPaymentMethod('pix');
      setSocialAccounts(emptySocialAccounts());
      setExistingSocialAccounts([]);
    }
    setLogoFile(null);
    setStep(0);
    setOpen(true);
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
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
      const url = await uploadFileToVps(logoFile, `logos/${clientId}`);
      return url + '?t=' + Date.now();
    } catch (err) {
      console.error('Logo upload error:', err);
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.companyName || !form.responsiblePerson || !form.whatsapp) {
      toast.error('Preencha todos os campos obrigatórios'); return;
    }
    setSaving(true);
    try {
    if (editing) {
      const logoUrl = await uploadLogo(editing.id);
      updateClient({ ...editing, ...form, logoUrl: logoUrl || undefined } as Client);
      // Update plan fields
      await supabase.from('clients').update({ plan_id: planId || null, contract_start_date: contractStartDate || null, auto_renewal: autoRenewal, contract_duration_months: contractDurationMonths, show_metrics: showMetrics } as any).eq('id', editing.id);
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
      // Save social accounts
      await saveSocialAccounts(editing.id);
      toast.success('Cliente atualizado');
    } else {
      const clientId = crypto.randomUUID();
      const logoUrl = await uploadLogo(clientId);
      const newClient = { ...form, id: clientId, logoUrl: logoUrl || undefined } as Client;
      // Auto-generate login credentials if empty
      if (!newClient.clientLogin) {
        newClient.clientLogin = form.companyName!.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }
      const ok = addClient(newClient);
      if (!ok) { toast.error('Empresa já cadastrada'); return; }
      // Update plan fields after insert
      await supabase.from('clients').update({ plan_id: planId || null, contract_start_date: contractStartDate || null, auto_renewal: autoRenewal, contract_duration_months: contractDurationMonths, client_type: clientType, client_login: newClient.clientLogin, show_metrics: showMetrics } as any).eq('id', clientId);
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
      // Save social accounts
      await saveSocialAccounts(clientId);
      // Generate onboarding tasks for new clients
      if (clientType === 'novo') {
        await createOnboardingForClient.mutateAsync(clientId);
      }
      const count = await generateScheduleForClient(newClient);
      if (count > 0) {
        toast.success(`Cliente cadastrado — ${count} gravação(ões) criada(s) na agenda`);
      } else {
        toast.success('Cliente cadastrado');
      }
    }
    setOpen(false);
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
      toast.error('Erro ao salvar cliente');
    } finally {
      setSaving(false);
    }
  };

  const saveSocialAccounts = async (clientId: string) => {
    // Delete existing social accounts for this client
    await supabase.from('social_accounts').delete().eq('client_id', clientId);
    
    const accounts = [];
    if (socialAccounts.instagram.connected) {
      accounts.push({
        client_id: clientId,
        platform: 'instagram',
        facebook_page_id: socialAccounts.instagram.pageId || null,
        instagram_business_id: socialAccounts.instagram.businessId || null,
        account_name: socialAccounts.instagram.username || socialAccounts.instagram.accountName,
        status: 'connected',
      });
    }
    if (socialAccounts.facebook.connected) {
      accounts.push({
        client_id: clientId,
        platform: 'facebook',
        facebook_page_id: socialAccounts.facebook.pageId || null,
        account_name: socialAccounts.facebook.accountName,
        status: 'connected',
      });
    }
    if (accounts.length > 0) {
      await supabase.from('social_accounts').insert(accounts as any);
      // Log the connection
      for (const acc of accounts) {
        await supabase.from('integration_logs').insert({
          client_id: clientId,
          platform: acc.platform,
          action: 'connect',
          status: 'success',
          message: `Conta ${acc.platform} conectada: ${acc.account_name}`,
        } as any);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza? Todos os dados deste cliente serão removidos permanentemente.')) return;
    await deleteClient(id);
    toast.success('Cliente e todos os dados relacionados foram removidos');
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
        const occupyingClient = getOccupyingClient(form.videomaker, day, timeStr);
        row.days.push({
          day,
          status: occupyingClient ? 'occupied' : 'free',
          clientName: occupyingClient?.companyName,
        });
      }
      grid.push(row);
    }

    return { vmName: vm.name, workDays, grid };
  }, [form.videomaker, settings, users, preferredShift, getOccupyingClient]);

  const canProceedStep0 = form.companyName && form.responsiblePerson && form.whatsapp;

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
            <p>PNG, JPG ou SVG</p>
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
        </div>
      </div>

      {/* Client Type - only on create */}
      {!editing && (
        <div className="space-y-2">
          <Label>Tipo de Cliente *</Label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setClientType('novo')}
              className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${
                clientType === 'novo' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
              }`}>
              <span className="font-semibold block">🆕 Cliente Novo</span>
              <span className="text-[10px] text-muted-foreground">Gera onboarding automático</span>
            </button>
            <button type="button" onClick={() => setClientType('existente')}
              className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${
                clientType === 'existente' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
              }`}>
              <span className="font-semibold block">📋 Cliente Existente</span>
              <span className="text-[10px] text-muted-foreground">Sem onboarding</span>
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label>Nome da Empresa *</Label>
        <Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="Ex: Padaria do João" />
      </div>
      <div className="space-y-1">
        <Label>Nome do Responsável *</Label>
        <Input value={form.responsiblePerson} onChange={e => setForm({ ...form, responsiblePerson: e.target.value })} placeholder="Ex: João Silva" />
      </div>
      <div className="space-y-1">
        <Label>Cidade</Label>
        <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Goiânia - GO" />
      </div>
      <div className="space-y-1">
        <Label>WhatsApp do Cliente *</Label>
        <Input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="5562999999999" />
        <p className="text-[10px] text-muted-foreground">Formato: 55 + DDD + número (ex: 5562999999999)</p>
      </div>
      <div className="space-y-1">
        <Label>Grupo WhatsApp (opcional)</Label>
        <Input value={form.whatsappGroup || ''} onChange={e => setForm({ ...form, whatsappGroup: e.target.value })} placeholder="ID do grupo ou número do grupo" />
        <p className="text-[10px] text-muted-foreground">Se preenchido, mensagens automáticas serão enviadas para o grupo em vez do número pessoal</p>
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

      {/* Niche selector */}
      <div className="space-y-1">
        <Label>Nicho de Atuação *</Label>
        <Select value={form.niche || ''} onValueChange={v => setForm({ ...form, niche: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o nicho do cliente" />
          </SelectTrigger>
          <SelectContent>
            {NICHE_OPTIONS.map(n => (
              <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Panfletagem Digital (for vehicle niches) */}
      {(form.niche === 'veiculos' || form.niche === 'automotivo') && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Switch
            checked={form.hasVehicleFlyer ?? false}
            onCheckedChange={(v) => setForm({ ...form, hasVehicleFlyer: v })}
          />
          <div>
            <Label className="text-sm font-medium">Panfletagem Digital Pulse</Label>
            <p className="text-xs text-muted-foreground">Habilitar módulo de panfletagem digital para veículos no portal do cliente</p>
          </div>
        </div>
      )}

      {/* Seasonal dates alert preview */}
      {form.niche && form.niche !== 'outro' && (() => {
        const alerts = getSeasonalAlerts(form.niche);
        if (alerts.length === 0) return null;
        return (
          <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1.5 text-warning">
              <AlertTriangle size={14} /> Datas sazonais próximas para este nicho
            </p>
            <div className="space-y-1">
              {alerts.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className={`font-medium ${a.urgency === 'high' ? 'text-destructive' : a.urgency === 'medium' ? 'text-warning' : 'text-foreground'}`}>
                    {a.urgency === 'high' ? '🔴' : a.urgency === 'medium' ? '🟡' : '🟢'} {a.label}
                  </span>
                  <span className="text-muted-foreground">
                    {a.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {a.daysUntil}d
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              O sistema notificará sobre datas importantes para criação de conteúdo sazonal.
            </p>
          </div>
        );
      })()}

      {/* Editorial / Linha Editorial */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <FileTextIcon size={14} className="text-primary" /> Linha Editorial
        </Label>
        <Textarea
          value={(form as any).editorial || ''}
          onChange={e => setForm({ ...form, editorial: e.target.value } as any)}
          placeholder="Descreva o posicionamento, tom de voz, público-alvo, diferenciais e estilo de comunicação do cliente. Essa informação será usada como base para geração de roteiros."
          className="min-h-[120px] text-sm"
        />
        <p className="text-[10px] text-muted-foreground">
          A linha editorial será utilizada como referência na criação automática de roteiros para este cliente.
        </p>
      </div>

      {/* Access & Drive links */}
      <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <KeyRound size={16} className="text-primary" /> Acessos e Links
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Login</Label>
            <Input value={form.clientLogin || ''} onChange={e => setForm({ ...form, clientLogin: e.target.value })} placeholder="login@email.com" />
          </div>
          <div className="space-y-1">
            <Label>Senha</Label>
            <Input value={form.clientPassword || ''} onChange={e => setForm({ ...form, clientPassword: e.target.value })} placeholder="••••••••" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1"><FolderOpen size={12} /> Link do Drive (Geral)</Label>
          <Input value={form.driveLink || ''} onChange={e => setForm({ ...form, driveLink: e.target.value })} placeholder="https://drive.google.com/..." />
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1"><FolderOpen size={12} /> Drive de Fotos</Label>
          <Input value={form.driveFotos || ''} onChange={e => setForm({ ...form, driveFotos: e.target.value })} placeholder="https://drive.google.com/..." />
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1"><FolderOpen size={12} /> Drive de Identidade Visual</Label>
          <Input value={form.driveIdentidadeVisual || ''} onChange={e => setForm({ ...form, driveIdentidadeVisual: e.target.value })} placeholder="https://drive.google.com/..." />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
          <div>
            <p className="text-sm font-medium">Métricas no Portal</p>
            <p className="text-xs text-muted-foreground">Permitir que o cliente veja as métricas no Pulse Club</p>
          </div>
          <Switch checked={showMetrics} onCheckedChange={setShowMetrics} />
        </div>
      </div>
    </div>
  );

  const connectViaOAuth = async () => {
    const clientId = editing?.id || 'new';
    try {
      const redirectUri = `${window.location.origin}/`;
      
      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: {
          action: 'get_oauth_url',
          client_id: clientId,
          redirect_uri: redirectUri,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao gerar link de conexão. Configure o App Meta em Gerenciamento de APIs primeiro.');
        return;
      }

      // Store client context for the callback
      sessionStorage.setItem('meta_oauth_client_id', clientId);
      sessionStorage.setItem('meta_oauth_redirect_uri', redirectUri);
      sessionStorage.setItem('meta_oauth_company_name', form.companyName || '');

      // Open OAuth popup
      const popup = window.open(data.oauth_url, 'meta_oauth', 'width=600,height=700,scrollbars=yes');
      
      // Listen for the callback
      const handleMessage = async () => {
        const interval = setInterval(async () => {
          try {
            if (popup?.closed) {
              clearInterval(interval);
              // Check URL params for code
              const urlParams = new URLSearchParams(window.location.search);
              const code = urlParams.get('code');
              const state = urlParams.get('state');

              if (code) {
                toast.info('Conectando contas...');
                let parsedClientId = clientId;
                try {
                  const stateObj = JSON.parse(decodeURIComponent(state || '{}'));
                  parsedClientId = stateObj.client_id || clientId;
                } catch {}

                const { data: result, error: exchangeError } = await supabase.functions.invoke('meta-oauth', {
                  body: {
                    action: 'exchange_code',
                    code,
                    redirect_uri: redirectUri,
                    client_id: parsedClientId,
                  },
                });

                if (exchangeError || result?.error) {
                  toast.error(result?.error || 'Erro ao conectar contas');
                } else {
                  const accounts = result.accounts || [];
                  const ig = accounts.find((a: any) => a.platform === 'instagram');
                  const fb = accounts.find((a: any) => a.platform === 'facebook');

                  setSocialAccounts({
                    instagram: ig ? { connected: true, accountName: ig.name, username: `@${ig.username || ig.name}`, pageId: ig.pageId || '', businessId: ig.businessId || '' } : emptySocialAccounts().instagram,
                    facebook: fb ? { connected: true, accountName: fb.name, pageId: fb.pageId || '' } : emptySocialAccounts().facebook,
                  });

                  toast.success(`✅ ${accounts.length} conta(s) conectada(s) automaticamente!`);
                }

                // Clean URL
                window.history.replaceState({}, '', window.location.pathname);
              }
            }
          } catch {}
        }, 500);
      };

      handleMessage();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  // Handle OAuth redirect on page load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code) {
      const savedClientId = sessionStorage.getItem('meta_oauth_client_id');
      const savedRedirectUri = sessionStorage.getItem('meta_oauth_redirect_uri');

      if (savedClientId && savedRedirectUri) {
        (async () => {
          toast.info('Finalizando conexão com Meta...');
          
          let parsedClientId = savedClientId;
          try {
            const stateObj = JSON.parse(decodeURIComponent(state || '{}'));
            parsedClientId = stateObj.client_id || savedClientId;
          } catch {}

          const { data: result, error } = await supabase.functions.invoke('meta-oauth', {
            body: {
              action: 'exchange_code',
              code,
              redirect_uri: savedRedirectUri,
              client_id: parsedClientId,
            },
          });

          if (error || result?.error) {
            toast.error(result?.error || 'Erro ao conectar contas');
          } else {
            const accounts = result.accounts || [];
            const ig = accounts.find((a: any) => a.platform === 'instagram');
            const fb = accounts.find((a: any) => a.platform === 'facebook');

            setSocialAccounts({
              instagram: ig ? { connected: true, accountName: ig.name, username: `@${ig.username || ig.name}`, pageId: ig.pageId || '', businessId: ig.businessId || '' } : emptySocialAccounts().instagram,
              facebook: fb ? { connected: true, accountName: fb.name, pageId: fb.pageId || '' } : emptySocialAccounts().facebook,
            });

            toast.success(`✅ ${accounts.length} conta(s) conectada(s)!`);
          }

          sessionStorage.removeItem('meta_oauth_client_id');
          sessionStorage.removeItem('meta_oauth_redirect_uri');
          sessionStorage.removeItem('meta_oauth_company_name');
          window.history.replaceState({}, '', window.location.pathname);
        })();
      }
    }
  }, []);

  const disconnectAccount = (platform: 'instagram' | 'facebook') => {
    if (platform === 'instagram') {
      setSocialAccounts(prev => ({ ...prev, instagram: emptySocialAccounts().instagram }));
    } else {
      setSocialAccounts(prev => ({ ...prev, facebook: emptySocialAccounts().facebook }));
    }
    toast.success(`${platform === 'instagram' ? 'Instagram' : 'Facebook'} desconectado`);
  };

  const renderStep1 = () => (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Globe size={16} className="text-primary" /> Conectar Redes Sociais
        </p>
        <p className="text-xs text-muted-foreground">
          Para permitir publicação automática de conteúdo, conecte as contas da empresa.
        </p>
      </div>

      {/* Connect Button - Single OAuth for both platforms */}
      {!socialAccounts.instagram.connected && !socialAccounts.facebook.connected ? (
        <div className="space-y-3">
          <Button className="w-full gap-2" onClick={connectViaOAuth}>
            <Link2 size={16} /> Conectar Facebook e Instagram via Meta
          </Button>
          <div className="p-3 rounded-lg bg-accent/50 border border-accent flex gap-2 items-start">
            <Info size={16} className="text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Ao clicar, você será redirecionado para o Facebook. Após autorizar, as contas (Páginas e Instagram vinculado) serão conectadas automaticamente. Você pode conectar depois no perfil do cliente.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Instagram status */}
          <div className={`p-4 rounded-xl border-2 transition-all ${
            socialAccounts.instagram.connected 
              ? 'border-primary/40 bg-primary/5' 
              : 'border-border bg-muted/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  socialAccounts.instagram.connected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  <Instagram size={20} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Instagram</p>
                  {socialAccounts.instagram.connected ? (
                    <p className="text-xs text-primary flex items-center gap-1">🟢 Conectado · {socialAccounts.instagram.username}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Não vinculado à página</p>
                  )}
                </div>
              </div>
              {socialAccounts.instagram.connected && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive gap-1" onClick={() => disconnectAccount('instagram')}>
                  <Unlink size={12} /> Remover
                </Button>
              )}
            </div>
          </div>

          {/* Facebook status */}
          <div className={`p-4 rounded-xl border-2 transition-all ${
            socialAccounts.facebook.connected 
              ? 'border-primary/40 bg-primary/5' 
              : 'border-border bg-muted/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  socialAccounts.facebook.connected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  <Facebook size={20} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Facebook</p>
                  {socialAccounts.facebook.connected ? (
                    <p className="text-xs text-primary flex items-center gap-1">🟢 Conectado · {socialAccounts.facebook.accountName}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Não vinculado</p>
                  )}
                </div>
              </div>
              {socialAccounts.facebook.connected && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive gap-1" onClick={() => disconnectAccount('facebook')}>
                  <Unlink size={12} /> Remover
                </Button>
              )}
            </div>
          </div>

          {/* Reconnect button */}
          <Button variant="outline" className="w-full gap-2 text-xs" onClick={connectViaOAuth}>
            <RefreshCw size={14} /> Reconectar contas via Meta
          </Button>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => {
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
          {planId && (
            <p className="text-xs text-primary flex items-center gap-1"><Info size={12} /> Definido pelo plano selecionado</p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => !planId && setForm(prev => ({ ...prev, monthlyRecordings: n }))}
                disabled={!!planId}
                className={`p-3 rounded-xl border-2 text-center transition-all ${
                  form.monthlyRecordings === n
                    ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40 hover:bg-primary/5'
                } ${planId ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <span className="text-lg font-bold block">{n}x</span>
                <span className="text-[10px] text-muted-foreground block">por mês</span>
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

      {/* Full shift recording toggle */}
      {form.videomaker && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
          <div className="flex items-center gap-3">
            <Switch 
              checked={form.fullShiftRecording || false} 
              onCheckedChange={v => setForm(prev => ({ ...prev, fullShiftRecording: v, fixedTime: v ? (prev.preferredShift === 'tarde' ? settings.shiftBStart : settings.shiftAStart) : prev.fixedTime }))} 
            />
            <div>
              <Label className="font-medium">⏱️ Gravação por Turno Inteiro</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                O cliente ocupa o turno completo (manhã ou tarde) — reserva todos os horários do período selecionado.
              </p>
            </div>
          </div>
          {form.fullShiftRecording && (
            <div className="space-y-1">
              <Label>Turno Preferido</Label>
              <Select value={form.preferredShift || 'manha'} onValueChange={v => setForm(prev => ({ ...prev, preferredShift: v as 'manha' | 'tarde', fixedTime: v === 'tarde' ? settings.shiftBStart : settings.shiftAStart }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manha">☀️ Manhã ({settings.shiftAStart} – {settings.shiftAEnd})</SelectItem>
                  <SelectItem value="tarde">🌙 Tarde ({settings.shiftBStart} – {settings.shiftBEnd})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Manual day/time selection */}
      {form.videomaker && !form.fullShiftRecording && (
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

  const renderStep3 = () => (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Target size={16} className="text-primary" /> Metas de Entrega Semanal
        </p>
        {planId && (() => {
          const sp = plans.find(p => p.id === planId);
          if (!sp) return null;
          return (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary space-y-1">
              <p className="font-semibold">Metas calculadas automaticamente pelo plano</p>
              <p className="text-muted-foreground">
                Entrega mínima do plano: {Math.ceil(sp.reels_qty / 4)} reels, {Math.ceil(sp.creatives_qty / 4)} criativos, {Math.ceil(sp.stories_qty / 4)} stories/semana.
                Gravações mensais: <strong>{sp.recording_sessions || 4}x</strong>.
                A meta semanal é sempre <strong>+1 a mais</strong> que o mínimo para adiantar conteúdos.
              </p>
            </div>
          );
        })()}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Meta Reels/Sem.</Label>
            <Input type="number" min={0} value={form.weeklyReels ?? 0} onChange={e => setForm({ ...form, weeklyReels: Number(e.target.value) })} disabled={!!planId} className={planId ? 'opacity-70' : ''} />
          </div>
          <div className="space-y-1">
            <Label>Meta Criativos/Sem.</Label>
            <Input type="number" min={0} value={form.weeklyCreatives ?? 0} onChange={e => setForm({ ...form, weeklyCreatives: Number(e.target.value) })} disabled={!!planId} className={planId ? 'opacity-70' : ''} />
          </div>
          <div className="space-y-1">
            <Label>Meta Stories/Sem.</Label>
            <Input type="number" min={0} value={form.weeklyStories ?? 0} onChange={e => setForm({ ...form, weeklyStories: Number(e.target.value) })} disabled={!!planId} className={planId ? 'opacity-70' : ''} />
          </div>
          <div className="space-y-1">
            <Label>Meta Total/Sem.</Label>
            <Input type="number" min={1} value={form.weeklyGoal} onChange={e => setForm({ ...form, weeklyGoal: Number(e.target.value) })} disabled={!!planId} className={planId ? 'opacity-70' : ''} />
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
            <Select value={planId || 'none'} onValueChange={v => {
                const newPlanId = v === 'none' ? null : v;
                setPlanId(newPlanId);
                if (newPlanId) {
                  const selectedPlan = plans.find(p => p.id === newPlanId);
                  if (selectedPlan) {
                    const weeklyReels = Math.ceil(selectedPlan.reels_qty / 4);
                    const weeklyCreatives = Math.ceil(selectedPlan.creatives_qty / 4);
                    const weeklyStories = Math.ceil(selectedPlan.stories_qty / 4);
                    const weeklyGoal = weeklyReels + weeklyCreatives + weeklyStories + 1;
                    const monthlyRecordings = selectedPlan.recording_sessions || 4;
                    setForm(prev => ({ ...prev, weeklyReels: weeklyReels + 1, weeklyCreatives: weeklyCreatives + 1, weeklyStories: weeklyStories + 1, weeklyGoal, monthlyRecordings, acceptsExtra: selectedPlan.accepts_extra_content }));
                  }
                }
              }}>
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
        <div className="space-y-1">
          <Label>Duração do Contrato</Label>
          <Select value={String(contractDurationMonths)} onValueChange={v => setContractDurationMonths(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={autoRenewal} onCheckedChange={setAutoRenewal} />
          <Label>Renovação automática</Label>
        </div>
      </div>

     </div>
   );

  const renderStep4 = () => (
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
          <span className="text-muted-foreground">Nicho:</span>
          <span className="font-medium">{NICHE_OPTIONS.find(n => n.value === form.niche)?.label || '—'}</span>
          <span className="text-muted-foreground">Videomaker:</span>
          <span className="font-medium">{users.find(u => u.id === form.videomaker)?.name || '—'}</span>
          <span className="text-muted-foreground">Dia fixo:</span>
          <span className="font-medium">
            {form.fixedDay ? DAY_LABELS[form.fixedDay] : '—'} 
            {form.fullShiftRecording 
              ? ` · Turno ${form.preferredShift === 'tarde' ? 'Tarde' : 'Manhã'}` 
              : ` às ${form.fixedTime || '—'}`}
          </span>
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
        {!isDesignerOnly && (
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
                    {renderStep4()}
                  </div>
                ) : (
                  <>
                    {step === 0 && renderStep0()}
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep3()}
                    {step === 3 && renderStep4()}
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
                        disabled={step === 0 ? !canProceedStep0 : false}>
                        Próximo <ChevronRight size={14} />
                      </Button>
                    ) : (
                      <Button onClick={handleSave} className="ml-auto gap-1" disabled={saving}>
                        {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CalendarCheck size={14} /> Cadastrar Cliente</>}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Client Goal Rocket Widget */}
      <ClientGoalRocket currentClients={clients.length} />

      {/* Search filter */}
      <div className="w-full max-w-sm">
        <Input
          placeholder="Buscar cliente pelo nome..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="h-10"
        />
      </div>

      {(() => {
        const filtered = clients.filter(c =>
          c.companyName.toLowerCase().includes(searchTerm.toLowerCase())
        );
        return filtered.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted-foreground">
            <Building2 size={40} className="mx-auto mb-3 opacity-50" />
            <p>{searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</p>
          </div>
        ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => (
            <div key={c.id} className="glass-card overflow-hidden"
              style={{ borderLeftWidth: 4, borderLeftColor: `hsl(${c.color || '220 10% 50%'})` }}>
              {/* Header row */}
              <div className="p-4 pb-3 flex items-start gap-3">
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt={c.companyName} className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border" />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ backgroundColor: `hsl(${c.color || '220 10% 50%'} / 0.15)`, color: `hsl(${c.color || '220 10% 50%'})` }}>
                    {c.companyName.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-base leading-tight truncate">{c.companyName}</p>
                  {!isDesignerOnly && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {DAY_LABELS[c.fixedDay]} · {c.fullShiftRecording ? `Turno ${c.preferredShift === 'tarde' ? 'Tarde' : 'Manhã'}` : c.fixedTime} · {users.find(u => u.id === c.videomaker)?.name || '—'}
                    </p>
                  )}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {c.niche && c.niche !== 'outro' && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                        {NICHE_OPTIONS.find(n => n.value === c.niche)?.label || c.niche}
                      </Badge>
                    )}
                    {!isDesignerOnly && (
                      <>
                        {(c.weeklyReels ?? 0) > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{c.weeklyReels} reels</Badge>}
                        {(c.weeklyCreatives ?? 0) > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{c.weeklyCreatives} criativos</Badge>}
                        {c.acceptsExtra && <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">Extra{c.extraClientAppears ? ' · Aparece' : ''}</Badge>}
                        {c.fullShiftRecording && <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-600 border-amber-500/30">⏱️ Turno {c.preferredShift === 'tarde' ? 'Tarde' : 'Manhã'}</Badge>}
                      </>
                    )}
                  </div>
                </div>
              </div>
              {/* Action buttons row */}
              <div className="px-3 pb-3 flex items-center gap-0.5 flex-wrap border-t border-border/50 pt-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver Briefing" onClick={() => setBriefingClient(c)}>
                  <FileTextIcon size={15} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Banco de Artes" onClick={() => setArtDbClient(c)}>
                  <Database size={15} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Pulse Club" onClick={() => window.open(`/portal/${encodeURIComponent(c.companyName.replace(/\s+/g, '-').toLowerCase())}`, '_blank')}>
                  <MonitorPlay size={15} />
                </Button>
                {!isDesignerOnly && (
                  <>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Link do portal"
                      onClick={() => {
                        const link = `${window.location.origin}/portal-registro/${c.id}`;
                        navigator.clipboard.writeText(link);
                        toast.success('Link de registro do portal copiado!');
                      }}>
                      <KeyRound size={15} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Link de onboarding"
                      onClick={() => {
                        const link = `${window.location.origin}/onboarding/${c.id}`;
                        navigator.clipboard.writeText(link);
                        toast.success('Link de onboarding copiado!');
                      }}>
                      <Copy size={15} />
                    </Button>
                    {c.whatsapp && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-success" title="WhatsApp" onClick={() => {
                        setSendWaClient(c);
                        setSendWaOpen(true);
                      }}><MessageSquare size={15} /></Button>
                    )}
                    <div className="flex-1" />
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Ficha PDF" onClick={() => {
                      const vmName = users.find(u => u.id === c.videomaker)?.name || '—';
                      generateClientCardPdf(c, vmName);
                    }}><Printer size={15} /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => handleOpen(c)}><Pencil size={15} /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir" onClick={() => handleDelete(c.id)}><Trash2 size={15} /></Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        );
      })()}

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

      {/* Art Database Dialog */}
      {artDbClient && (
        <ClientArtDatabaseDialog client={artDbClient} open={!!artDbClient} onOpenChange={o => !o && setArtDbClient(null)} />
      )}

      {/* Briefing Dialog */}
      <Dialog open={!!briefingClient} onOpenChange={o => !o && setBriefingClient(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileTextIcon size={18} className="text-primary" />
              Briefing — {briefingClient?.companyName}
            </DialogTitle>
          </DialogHeader>
          {briefingClient && <ClientBriefingView client={briefingClient} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ==================== Briefing Viewer for Designer ==================== */
function ClientBriefingView({ client }: { client: Client }) {
  const briefing = (client as any).briefingData || {};
  const editorial = (client as any).editorial || '';
  const niche = client.niche;
  const nicheLabel = NICHE_OPTIONS.find(n => n.value === niche)?.label || niche || '—';

  const briefingFields: { label: string; value: string }[] = [
    { label: 'Empresa', value: client.companyName },
    { label: 'Responsável', value: client.responsiblePerson },
    { label: 'Nicho', value: nicheLabel },
    { label: 'Cidade', value: (client as any).city || '—' },
  ];

  // Extract briefing_data fields
  const briefingDataFields: { label: string; value: string }[] = [];
  if (briefing && typeof briefing === 'object') {
    const fieldMap: Record<string, string> = {
      business_description: 'Descrição do Negócio',
      target_audience: 'Público-Alvo',
      differentials: 'Diferenciais',
      tone_of_voice: 'Tom de Voz',
      competitors: 'Concorrentes',
      goals: 'Objetivos',
      visual_references: 'Referências Visuais',
      brand_colors: 'Cores da Marca',
      avoid: 'Evitar',
      additional_notes: 'Observações',
      products_services: 'Produtos/Serviços',
      social_media_links: 'Redes Sociais',
    };
    for (const [key, label] of Object.entries(fieldMap)) {
      if (briefing[key]) {
        briefingDataFields.push({ label, value: String(briefing[key]) });
      }
    }
    // Also capture any other keys not in the map
    for (const [key, val] of Object.entries(briefing)) {
      if (!fieldMap[key] && val && typeof val === 'string' && val.trim()) {
        briefingDataFields.push({ label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: val });
      }
    }
  }

  const driveIV = (client as any).driveIdentidadeVisual;

  return (
    <ScrollArea className="max-h-[65vh]">
      <div className="space-y-4 pr-2">
        {/* Basic info */}
        <div className="grid grid-cols-2 gap-3">
          {briefingFields.map(f => (
            <div key={f.label} className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.label}</p>
              <p className="text-sm font-medium mt-0.5">{f.value || '—'}</p>
            </div>
          ))}
        </div>

        {/* Drive Identidade Visual */}
        {driveIV && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Drive de Identidade Visual</p>
            <a href={driveIV} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1.5">
              <ExternalLink size={12} /> Abrir Drive
            </a>
          </div>
        )}

        {/* Editorial line */}
        {editorial && (
          <div className="rounded-lg border border-accent bg-accent/10 p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
              <FileTextIcon size={10} /> Linha Editorial
            </p>
            <div className="text-sm leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: editorial }} />
          </div>
        )}

        {/* Briefing data */}
        {briefingDataFields.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dados do Briefing</p>
            {briefingDataFields.map(f => (
              <div key={f.label} className="rounded-lg border border-border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.label}</p>
                <p className="text-sm mt-1 whitespace-pre-line">{f.value}</p>
              </div>
            ))}
          </div>
        ) : (
          !editorial && (
            <div className="text-center py-8 text-muted-foreground">
              <FileTextIcon size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum briefing preenchido para este cliente</p>
              <p className="text-xs mt-1">O briefing é preenchido durante o onboarding do cliente</p>
            </div>
          )
        )}
      </div>
    </ScrollArea>
  );
}

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { generateClientCardPdf } from '@/lib/clientCardPdf';
import { generateBriefingPdf } from '@/lib/briefingPdf';
import { parseEditorial } from '@/lib/editorialFormatter';
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
import { Plus, Pencil, Trash2, Building2, Star, Clock, CalendarCheck, ChevronRight, ChevronLeft, AlertTriangle, User, Video, Target, Upload, X, MessageSquare, Send, Package, DollarSign, Instagram, Facebook, Link2, Unlink, RefreshCw, Globe, Info, Printer, FolderOpen, KeyRound, Copy, ExternalLink, Database, FileText as FileTextIcon, MonitorPlay, Loader2, UserMinus, Sparkles, Palette, Users as UsersIcon, Megaphone, Lightbulb, Camera, Award, Layers, MoveHorizontal, ArrowRightLeft } from 'lucide-react';
import { TransferClientDialog } from '@/components/TransferClientDialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/vpsDb';
import { uploadFileToVps } from '@/services/vpsApi';
import { sendWhatsAppMessage } from '@/services/whatsappService';
import { Textarea } from '@/components/ui/textarea';
import { useOnboarding } from '@/hooks/useOnboarding';
import ClientArtDatabaseDialog from '@/components/ClientArtDatabaseDialog';
import BriefingVersionsDialog from '@/components/BriefingVersionsDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import ClientGoalRocket from '@/components/ClientGoalRocket';
import { syncFinancialContract } from '@/lib/financialContracts';
import ProposalChecklist from '@/components/ProposalChecklist';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';

const DAYS: DayOfWeek[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
const CONTENT_TYPES: ContentType[] = ['reels', 'story', 'produto'];

type PreferredShift = 'turnoA' | 'turnoB' | 'ambos';

const emptyClient = (): Partial<Client> & { clientType?: string } => ({
  companyName: '', responsiblePerson: '', phone: '', whatsapp: '', email: '', city: '', color: CLIENT_COLORS[0].value,
  fixedDay: 'segunda', fixedTime: '08:30',
  videomaker: '', backupTime: '14:30', backupDay: 'terca', extraDay: 'quarta',
  extraContentTypes: [], acceptsExtra: false, extraClientAppears: false,
  weeklyReels: 0, weeklyCreatives: 0, weeklyGoal: 0,
  hasEndomarketing: false, hasVehicleFlyer: false, weeklyStories: 0, presenceDays: 1,
  monthlyRecordings: 4, niche: '', artRequestsLimit: null as number | null,
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

const STEP_LABELS_WITH_META = [
  { icon: User, label: 'Dados da Empresa' },
  { icon: Globe, label: 'Redes Sociais' },
  { icon: Target, label: 'Metas Semanais' },
  { icon: DollarSign, label: 'Financeiro' },
];

const STEP_LABELS_NO_META = [
  { icon: User, label: 'Dados da Empresa' },
  { icon: Target, label: 'Metas Semanais' },
  { icon: DollarSign, label: 'Financeiro' },
];

const STEP_LABELS_SEM_CONTRATO = [
  { icon: User, label: 'Dados da Empresa' },
];

export default function Clients() {
  const { clients, users, recordings, settings, addClient, updateClient, deleteClient, generateScheduleForClient, regenerateScheduleForClient, currentUser, refetchData } = useApp();
  const { createOnboardingForClient } = useOnboarding();
  const isDesignerOnly = currentUser?.role === 'designer' || currentUser?.role === 'fotografo';
  const [briefingClient, setBriefingClient] = useState<Client | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelClient, setCancelClient] = useState<Client | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client> & { clientType?: string }>(emptyClient());
  const [clientType, setClientType] = useState<'novo' | 'existente' | 'sem_contrato'>('novo');
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<{ id: string; client_name: string; client_company: string; status: string; proposal_type: string; bonus_services: any; plan_snapshot: any; whatsapp_number: string | null; system_data: any }[]>([]);
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
  const [generatingChecklistFor, setGeneratingChecklistFor] = useState<string | null>(null);
  const [checklistClient, setChecklistClient] = useState<Client | null>(null);
  const [transferClient, setTransferClient] = useState<Client | null>(null);
  
  // Plan-related state
  const [plans, setPlans] = useState<{ id: string; name: string; status: string; reels_qty: number; creatives_qty: number; stories_qty: number; recording_sessions: number; accepts_extra_content: boolean }[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [contractStartDate, setContractStartDate] = useState('');
  const [autoRenewal, setAutoRenewal] = useState(false);
  const [contractDurationMonths, setContractDurationMonths] = useState(12);
  const [showMetrics, setShowMetrics] = useState(true);
  const [specialPlan, setSpecialPlan] = useState(false);
  
  // Financial contract state
  const [contractValue, setContractValue] = useState(0);
  const [dueDay, setDueDay] = useState(10);
  const [paymentMethod, setPaymentMethod] = useState('pix');

  // Social accounts state
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountState>(emptySocialAccounts());
  const [existingSocialAccounts, setExistingSocialAccounts] = useState<any[]>([]);
  const [hasMetaApi, setHasMetaApi] = useState(false);

  // ============ Validação de coerência das metas x plano ============
  // Regras:
  // 1. Sem plano e sem "Plano Especial" → metas semanais DEVEM ser 0 (senão gera copy sem base).
  // 2. Plano padrão selecionado → metas DEVEM refletir o plano (reels/4, creatives/4, stories/4).
  // 3. Plano Especial → pelo menos uma meta > 0 (senão o toggle é inútil e não gera demanda).
  const planTargetsValidation = useMemo(() => {
    const wReels = form.weeklyReels ?? 0;
    const wCre = form.weeklyCreatives ?? 0;
    const wSto = form.weeklyStories ?? 0;
    const wGoal = form.weeklyGoal ?? 0;
    const total = wReels + wCre + wSto;

    if (specialPlan) {
      if (total === 0) {
        return { ok: false, level: 'error' as const, message: 'Plano Especial ativo mas todas as metas estão em 0. Defina ao menos 1 entrega mensal (reels, criativos ou stories) — caso contrário nenhuma demanda de copy será gerada.' };
      }
      if (wGoal !== total) {
        return { ok: false, level: 'warn' as const, message: `Meta Total (${wGoal * 4}/mês) diferente da soma das metas (${total * 4}/mês). Isso pode gerar demandas incoerentes no módulo Copy.` };
      }
      return { ok: true as const };
    }

    if (!planId) {
      if (total > 0) {
        return { ok: false, level: 'error' as const, message: 'Sem plano selecionado, mas há metas mensais preenchidas. Selecione um plano OU ative "Plano Especial" para justificar essas metas.' };
      }
      return { ok: true as const };
    }

    const plan = plans.find(p => p.id === planId);
    if (!plan) return { ok: true as const };
    const expectedReels = Math.ceil((plan.reels_qty || 0) / 4);
    const expectedCre = Math.ceil((plan.creatives_qty || 0) / 4);
    const expectedSto = Math.ceil((plan.stories_qty || 0) / 4);
    if (wReels !== expectedReels || wCre !== expectedCre || wSto !== expectedSto) {
      return {
        ok: false,
        level: 'error' as const,
        message: `Metas divergem do plano "${plan.name}" (esperado ${plan.reels_qty || 0} reels, ${plan.creatives_qty || 0} criativos, ${plan.stories_qty || 0} stories/mês). Reselecione o plano ou ative "Plano Especial" para editar manualmente.`,
      };
    }
    return { ok: true as const };
  }, [specialPlan, planId, plans, form.weeklyReels, form.weeklyCreatives, form.weeklyStories, form.weeklyGoal]);

  useEffect(() => {
    supabase.from('plans').select('id, name, status, reels_qty, creatives_qty, stories_qty, recording_sessions, accepts_extra_content').eq('status', 'ativo').then(({ data }) => {
      if (data) setPlans(data as any[]);
    });
    supabase.from('api_integrations').select('id').eq('provider', 'meta').eq('status', 'ativo').limit(1).then(({ data }) => {
      setHasMetaApi(!!(data && data.length > 0));
    });
    supabase.from('commercial_proposals').select('id, client_name, client_company, status, proposal_type, bonus_services, plan_snapshot, whatsapp_number, system_data').eq('status', 'aceita').then(({ data }) => {
      if (data) setProposals(data as any[]);
    });
  }, []);

  // Sincronização automática: sempre que planId mudar (e não estiver em Plano Especial),
  // recalcula as metas mensais a partir do plano contratado.
  useEffect(() => {
    if (specialPlan) return;
    if (!planId) return;
    const selectedPlan = plans.find(p => p.id === planId);
    if (!selectedPlan) return;
    const wReels = Math.ceil((selectedPlan.reels_qty || 0) / 4);
    const wCreatives = Math.ceil((selectedPlan.creatives_qty || 0) / 4);
    const wStories = Math.ceil((selectedPlan.stories_qty || 0) / 4);
    const monthlyRecordings = selectedPlan.recording_sessions || 4;
    setForm(prev => {
      if (
        prev.weeklyReels === wReels &&
        prev.weeklyCreatives === wCreatives &&
        prev.weeklyStories === wStories &&
        prev.weeklyGoal === wReels + wCreatives + wStories &&
        prev.monthlyRecordings === monthlyRecordings &&
        prev.acceptsExtra === selectedPlan.accepts_extra_content
      ) return prev;
      return {
        ...prev,
        weeklyReels: wReels,
        weeklyCreatives: wCreatives,
        weeklyStories: wStories,
        weeklyGoal: wReels + wCreatives + wStories,
        monthlyRecordings,
        acceptsExtra: selectedPlan.accepts_extra_content,
      };
    });
  }, [planId, specialPlan, plans]);



  const videomakers = users.filter(u => u.role === 'videomaker');

  // Fallback: when client.videomaker is empty (legacy/missing assignment),
  // derive the responsible videomaker from the most frequent in their recordings.
  const videomakerByClient = useMemo(() => {
    const map: Record<string, string> = {};
    const counts: Record<string, Record<string, number>> = {};
    for (const r of recordings) {
      if (!r.clientId || !r.videomakerId) continue;
      counts[r.clientId] = counts[r.clientId] || {};
      counts[r.clientId][r.videomakerId] = (counts[r.clientId][r.videomakerId] || 0) + 1;
    }
    for (const [cid, vmCounts] of Object.entries(counts)) {
      const top = Object.entries(vmCounts).sort((a, b) => b[1] - a[1])[0];
      if (top) map[cid] = top[0];
    }
    return map;
  }, [recordings]);

  const getClientVideomakerId = useCallback((c: Client) => {
    return c.videomaker || videomakerByClient[c.id] || '';
  }, [videomakerByClient]);

  const getClientVideomakerName = useCallback((c: Client) => {
    const vmId = getClientVideomakerId(c);
    return users.find(u => u.id === vmId)?.name || '—';
  }, [getClientVideomakerId, users]);

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
      // Restore clientType and proposalId from client data
      setClientType(((client as any).clientType as any) || 'novo');
      setProposalId((client as any).proposalId || null);
      // Load plan data for editing
      supabase.from('clients').select('plan_id, contract_start_date, auto_renewal, contract_duration_months, client_type, proposal_id').eq('id', client.id).single().then(({ data }) => {
        if (data) {
          setPlanId((data as any).plan_id || null);
          // If no plan but weekly targets exist, treat as special plan
          setSpecialPlan(!((data as any).plan_id) && ((client.weeklyReels || 0) + (client.weeklyCreatives || 0) + (client.weeklyStories || 0) > 0));
          setContractStartDate((data as any).contract_start_date || '');
          setAutoRenewal((data as any).auto_renewal || false);
          setContractDurationMonths((data as any).contract_duration_months || 12);
          setShowMetrics((data as any).show_metrics !== false);
          // Ensure clientType is correctly loaded from DB
          if ((data as any).client_type) setClientType((data as any).client_type as any);
          if ((data as any).proposal_id) setProposalId((data as any).proposal_id);
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
      setSpecialPlan(false);
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
      setClientType('novo');
      setProposalId(null);
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

  const fetchProposalForChecklist = async (selectedProposalId: string) => {
    const cachedProposal = proposals.find(p => p.id === selectedProposalId);
    if (cachedProposal) return cachedProposal;

    const { data, error } = await supabase
      .from('commercial_proposals')
      .select('id, client_name, client_company, status, proposal_type, bonus_services, plan_snapshot, system_data')
      .eq('id', selectedProposalId)
      .single();

    if (error) {
      throw new Error(error.message || 'Erro ao carregar proposta vinculada');
    }

    return data as any;
  };

  const buildProposalChecklistItems = (clientId: string, proposal: { proposal_type: string; bonus_services: any; plan_snapshot: any; system_data: any }) => {
    const items: { client_id: string; title: string; description: string | null; sort_order: number }[] = [];
    let o = 0;
    const add = (title: string, desc: string | null = null) => items.push({ client_id: clientId, title, description: desc, sort_order: o++ });
    const pType = proposal.proposal_type || 'marketing';

    // ===== CRONOGRAMA: each deliverable is a checklist item =====
    if (pType === 'cronograma') {
      const sys = (proposal.system_data || {}) as any;
      const deliverables = sys.deliverables as any[];
      if (Array.isArray(deliverables) && deliverables.length > 0) {
        deliverables.forEach((d: any) => {
          const qty = d.quantity || 1;
          const name = d.name || d.title || '';
          if (name) {
            const qtyLabel = qty > 1 ? ` (${qty}x)` : '';
            add(`${name}${qtyLabel}`, d.description || null);
          }
        });
      }
    }

    // ===== PERSONALIZADA: each service item =====
    if (pType === 'personalizada') {
      const sys = (proposal.system_data || {}) as any;
      if (sys.videos) add(`${sys.videos} Vídeo(s)`, 'Vídeos produzidos');
      if (sys.stories) add(`${sys.stories} Stories`, 'Stories produzidos');
      if (sys.arts) add(`${sys.arts} Artes`, 'Artes gráficas');
      if (sys.eventCoverage) add(`${sys.eventCoverage} Cobertura(s) de Evento`, 'Cobertura de eventos');
      if (sys.socialMedia) add('Gestão de Redes Sociais', 'Gerenciamento de mídias sociais');
      if (sys.trafficMgmt) add('Gestão de Tráfego', 'Tráfego pago');
      if (sys.recordings) add(`${sys.recordings} Gravação(ões)`, 'Sessões de gravação');
      // Deliverables inside personalizada system_data
      const deliverables = sys.deliverables as any[];
      if (Array.isArray(deliverables)) {
        deliverables.forEach((d: any) => {
          const name = d.name || d.title || '';
          if (name) add(name, d.description || null);
        });
      }
    }

    // ===== SISTEMA: scope items as deliverables =====
    if (pType === 'sistema') {
      const sys = (proposal.system_data || {}) as any;
      const scope = sys.scope as any[];
      if (Array.isArray(scope)) {
        scope.forEach((s: any) => {
          const desc = s.description || s.name || '';
          if (desc) add(desc);
        });
      }
      const deliverables = sys.deliverables as any[];
      if (Array.isArray(deliverables)) {
        deliverables.forEach((d: any) => {
          const name = d.name || d.title || '';
          if (name) add(name, d.description || null);
        });
      }
    }

    // ===== MARKETING: plan_snapshot items =====
    if (pType === 'marketing') {
      const snap = proposal.plan_snapshot as any;
      if (snap) {
        const sessions = snap.recording_sessions || 0;
        if (snap.has_recording !== false && sessions > 0) {
          add(`${sessions} Sessão(ões) de Gravação`, `${snap.recording_hours || 2}h por sessão`);
        }
        const reels = snap.reels_qty || 0;
        if (reels > 0) add(`${reels} Reels`, 'Reels gravados e editados');
        const creatives = snap.creatives_qty || 0;
        if (creatives > 0) add(`${creatives} Criativos`, 'Artes criativas produzidas');
        const stories = snap.stories_qty || 0;
        if (stories > 0) add(`${stories} Stories`, 'Stories produzidos e publicados');
        const arts = snap.arts_qty || 0;
        if (arts > 0) add(`${arts} Artes`, 'Artes gráficas produzidas');
        if (snap.has_photography) add('Ensaio Fotográfico', 'Sessão de fotos realizada');
        if (snap.accepts_extra_content) add('Conteúdo Extra', 'Produção de conteúdo adicional');
        const services = snap.services as any[];
        if (Array.isArray(services)) {
          services.forEach((s: any) => {
            const name = typeof s === 'string' ? s : (s.name || s.title || '');
            if (name) add(name, typeof s === 'object' ? (s.description || null) : null);
          });
        }
      }
    }

    // ===== ENDOMARKETING =====
    if (pType === 'endomarketing') {
      const endo = (proposal as any).endomarketing_data || {};
      if (endo.plan) add(`Plano ${endo.plan}`, 'Plano de endomarketing contratado');
      if (endo.daysPerWeek) add(`${endo.daysPerWeek}x por semana`, 'Presença semanal');
      if (endo.storiesPerDay) add(`${endo.storiesPerDay} Stories/dia`, 'Stories diários');
    }

    // Bônus / serviços extras (all types)
    const bonuses = proposal.bonus_services as any[];
    if (Array.isArray(bonuses)) {
      bonuses.forEach((b: any) => {
        const name = b.name || b.title;
        if (name) add(name, b.description || null);
      });
    }

    // Fallback
    if (items.length === 0) {
      add('Briefing Inicial', 'Reunião de alinhamento');
      add('Entrega de Materiais', 'Materiais enviados ao cliente');
      add('Aprovação Final', 'Cliente aprovou as entregas');
    }

    return items;
  };

  const replaceProposalChecklist = async (clientId: string, selectedProposalId: string) => {
    const proposal = await fetchProposalForChecklist(selectedProposalId);
    const checklistItems = buildProposalChecklistItems(clientId, proposal);

    const deleteResult = await supabase.from('proposal_checklist_items').delete().eq('client_id', clientId);
    if (deleteResult.error) {
      throw new Error(deleteResult.error.message || 'Erro ao limpar checklist atual');
    }

    const insertResult = await supabase.from('proposal_checklist_items').insert(checklistItems as any);
    if (insertResult.error) {
      throw new Error(insertResult.error.message || 'Erro ao gerar checklist da proposta');
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.companyName || !form.responsiblePerson || !form.whatsapp) {
      toast.error('Preencha todos os campos obrigatórios'); return;
    }
    if (clientType === 'sem_contrato' && !proposalId) {
      toast.error('Selecione uma proposta para Pacotes de Serviços'); return;
    }
    if (!planTargetsValidation.ok && planTargetsValidation.level === 'error') {
      toast.error(planTargetsValidation.message);
      return;
    }
    if (!planTargetsValidation.ok && planTargetsValidation.level === 'warn') {
      const proceed = window.confirm(`${planTargetsValidation.message}\n\nDeseja salvar mesmo assim?`);
      if (!proceed) return;
    }

    setSaving(true);
    try {
      if (editing) {
        const logoUrl = await uploadLogo(editing.id);
        const updatedClient = {
          ...editing,
          ...form,
          clientType,
          proposalId: clientType === 'sem_contrato' ? proposalId : null,
          logoUrl: logoUrl || undefined,
        } as Client;

        await updateClient(updatedClient);

        const clientMetaUpdate = await supabase.from('clients').update({
          plan_id: planId || null,
          contract_start_date: contractStartDate || null,
          auto_renewal: autoRenewal,
          contract_duration_months: contractDurationMonths,
          show_metrics: showMetrics,
          client_type: clientType,
          proposal_id: clientType === 'sem_contrato' ? proposalId : null,
        } as any).eq('id', editing.id);

        if (clientMetaUpdate.error) {
          throw new Error(clientMetaUpdate.error.message || 'Erro ao atualizar dados contratuais do cliente');
        }

        // Checklist is now generated manually via button on the card

        await saveSocialAccounts(editing.id);

        if (clientType !== 'sem_contrato') {
          await syncFinancialContract({
            client_id: editing.id,
            plan_id: planId || null,
            contract_value: contractValue,
            contract_start_date: contractStartDate || new Date().toISOString().split('T')[0],
            due_day: dueDay,
            payment_method: paymentMethod,
            status: 'ativo',
          });

          const scheduleFieldsChanged =
            editing.fixedDay !== updatedClient.fixedDay ||
            editing.fixedTime !== updatedClient.fixedTime ||
            editing.videomaker !== updatedClient.videomaker ||
            editing.backupDay !== updatedClient.backupDay ||
            editing.backupTime !== updatedClient.backupTime ||
            editing.extraDay !== updatedClient.extraDay ||
            editing.acceptsExtra !== updatedClient.acceptsExtra ||
            editing.fullShiftRecording !== updatedClient.fullShiftRecording ||
            editing.preferredShift !== updatedClient.preferredShift ||
            editing.monthlyRecordings !== updatedClient.monthlyRecordings;

          if (scheduleFieldsChanged) {
            const { deleted, created } = await regenerateScheduleForClient(updatedClient);
            toast.success(`Cliente atualizado — agenda regenerada: ${deleted} removida(s), ${created} criada(s)`);
          } else {
            toast.success('Cliente atualizado');
          }
        } else {
          toast.success('Cliente atualizado');
        }
      } else {
        const clientId = crypto.randomUUID();
        const logoUrl = await uploadLogo(clientId);
        const newClient = {
          ...form,
          id: clientId,
          clientType,
          proposalId: clientType === 'sem_contrato' ? proposalId : null,
          logoUrl: logoUrl || undefined,
        } as Client;

        if (!newClient.clientLogin) {
          newClient.clientLogin = form.companyName!.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        const ok = await addClient(newClient);
        if (!ok) { toast.error('Empresa já cadastrada'); return; }

        const clientMetaUpdate = await supabase.from('clients').update({
          plan_id: planId || null,
          contract_start_date: contractStartDate || null,
          auto_renewal: autoRenewal,
          contract_duration_months: contractDurationMonths,
          client_type: clientType,
          client_login: newClient.clientLogin,
          show_metrics: showMetrics,
          proposal_id: clientType === 'sem_contrato' ? proposalId : null,
        } as any).eq('id', clientId);

        if (clientMetaUpdate.error) {
          throw new Error(clientMetaUpdate.error.message || 'Erro ao complementar dados do cliente');
        }

        if (clientType !== 'sem_contrato') {
          await syncFinancialContract({
            client_id: clientId,
            plan_id: planId || null,
            contract_value: contractValue,
            contract_start_date: contractStartDate || new Date().toISOString().split('T')[0],
            due_day: dueDay,
            payment_method: paymentMethod,
            status: 'ativo',
          });
        }

        await saveSocialAccounts(clientId);

        if (clientType === 'novo') {
          await createOnboardingForClient.mutateAsync(clientId);
        }

        if (clientType !== 'sem_contrato') {
          const count = await generateScheduleForClient(newClient);
          if (count > 0) {
            toast.success(`Cliente cadastrado — ${count} gravação(ões) criada(s) na agenda`);
          } else {
            toast.success('Cliente cadastrado');
          }
        } else {
          // Checklist is now generated manually via button on the card
          toast.success('Cliente cadastrado (Pacotes de Serviços, vinculado à proposta)');
        }
      }

      setOpen(false);
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar cliente');
    } finally {
      setSaving(false);
    }
  };

  const saveSocialAccounts = async (clientId: string) => {
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

  const handleCancel = async () => {
    if (!cancelClient) return;
    try {
      // 1. Mark client as cancelled
      await supabase.from('clients').update({
        status: 'cancelado',
        cancellation_date: new Date().toISOString().split('T')[0],
        cancellation_reason: cancelReason || 'Não informado',
        updated_at: new Date().toISOString(),
      } as any).eq('id', cancelClient.id);

      // 2. Cancel the financial contract
      await supabase.from('financial_contracts').update({
        status: 'cancelado',
        updated_at: new Date().toISOString(),
      } as any).eq('client_id', cancelClient.id);

      // 3. Delete all pending activities (revenues "prevista", and also cleanup other pendencies as requested)
      await supabase.from('revenues').delete()
        .eq('client_id', cancelClient.id)
        .in('status', ['prevista', 'em_atraso', 'vencido']);

      // 4. Delete future scheduled recordings
      const today = new Date().toISOString().split('T')[0];
      await supabase.from('recordings').delete()
        .eq('client_id', cancelClient.id)
        .eq('status', 'agendada')
        .gte('date', today);

      // 5. Delete pending content tasks
      await supabase.from('content_tasks').delete()
        .eq('client_id', cancelClient.id)
        .in('kanban_column', ['ideias', 'aguardando_roteiro', 'roteirizacao', 'aguardando_gravacao']);

      // 6. Delete pending scripts
      await supabase.from('scripts').delete()
        .eq('client_id', cancelClient.id)
        .eq('recorded', false);

      toast.success(`${cancelClient.companyName} cancelado e pendências eliminadas`);
      setCancelDialogOpen(false);
      setCancelClient(null);
      setCancelReason('');
      await refetchData();

      // 4. Delete related cash_reserve_movements for deleted revenues
      // (future entries linked to this client that haven't been received)

      setCancelDialogOpen(false);
      setCancelClient(null);
      setCancelReason('');
      await refetchData();
    } catch (err) {
      toast.error('Erro ao cancelar cliente');
    }
  };

  const handleReactivate = async (client: Client) => {
    if (!confirm(`Reativar ${client.companyName}?`)) return;
    await supabase.from('clients').update({
      status: 'ativo',
      cancellation_date: null,
      cancellation_reason: null,
      updated_at: new Date().toISOString(),
    } as any).eq('id', client.id);
    // Reactivate the financial contract too
    await supabase.from('financial_contracts').update({
      status: 'ativo',
      updated_at: new Date().toISOString(),
    } as any).eq('client_id', client.id);
    toast.success(`${client.companyName} foi reativado com contrato financeiro`);
    window.location.reload();
  };

  const toggleContentType = (ct: ContentType) => {
    const types = form.extraContentTypes || [];
    setForm({ ...form, extraContentTypes: types.includes(ct) ? types.filter(t => t !== ct) : [...types, ct] });
  };

  const selectSuggestion = (slot: { day: DayOfWeek; firstTime: string; vmId: string }) => {
    setForm(prev => ({ ...prev, videomaker: slot.vmId, fixedDay: slot.day, fixedTime: slot.firstTime }));
  };

  const selectFullShiftSuggestion = (slot: { day: DayOfWeek; shift: 'manha' | 'tarde' }) => {
    setPreferredShift(slot.shift === 'tarde' ? 'turnoB' : 'turnoA');
    setForm(prev => ({
      ...prev,
      fullShiftRecording: true,
      fixedDay: slot.day,
      preferredShift: slot.shift,
      fixedTime: slot.shift === 'tarde' ? settings.shiftBStart : settings.shiftAStart,
    }));
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
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setClientType('novo')}
              className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${
                clientType === 'novo' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
              }`}>
              <span className="font-semibold block">🆕 Novo</span>
              <span className="text-[10px] text-muted-foreground">Com onboarding</span>
            </button>
            <button type="button" onClick={() => setClientType('existente')}
              className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${
                clientType === 'existente' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
              }`}>
              <span className="font-semibold block">📋 Existente</span>
              <span className="text-[10px] text-muted-foreground">Sem onboarding</span>
            </button>
            <button type="button" onClick={() => setClientType('sem_contrato')}
              className={`p-3 rounded-xl border-2 text-center transition-all text-sm ${
                clientType === 'sem_contrato' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
              }`}>
              <span className="font-semibold block">📦 Pacotes</span>
              <span className="text-[10px] text-muted-foreground">Pacotes de Serviços</span>
            </button>
          </div>
          {clientType === 'sem_contrato' && (
            <div className="mt-3 space-y-2">
              <Label>Vincular a Proposta Aceita *</Label>
              <Select value={proposalId || 'none'} onValueChange={v => {
                const selectedId = v === 'none' ? null : v;
                setProposalId(selectedId);
                if (selectedId) {
                  const p = proposals.find(pr => pr.id === selectedId);
                  if (p) {
                    setForm(prev => ({
                      ...prev,
                      companyName: p.client_company || prev.companyName || '',
                      responsiblePerson: p.client_name || prev.responsiblePerson || '',
                      whatsapp: p.whatsapp_number || prev.whatsapp || '',
                    }));
                  }
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione uma proposta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma proposta</SelectItem>
                  {proposals.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.client_company || p.client_name} — {p.proposal_type === 'marketing' ? 'Marketing' : p.proposal_type === 'sistema' ? 'Sistema' : p.proposal_type === 'endomarketing' ? 'Endomarketing' : p.proposal_type === 'cronograma' ? 'Cronograma' : 'Personalizada'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {proposalId && (
                <p className="text-[10px] text-green-600">✅ Dados preenchidos da proposta. O checklist pode ser gerado após cadastrar.</p>
              )}
              {proposals.length === 0 && (
                <p className="text-[10px] text-muted-foreground">Nenhuma proposta aceita encontrada. Crie uma proposta primeiro.</p>
              )}
            </div>
          )}
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

      {/* Cliente Star toggle - moved here from Step 2 */}
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
        <div className="flex items-center gap-3">
          <Switch
            checked={form.fullShiftRecording || false}
            onCheckedChange={v => {
              setPreferredShift(v ? ((form.preferredShift || 'manha') === 'tarde' ? 'turnoB' : 'turnoA') : 'ambos');
              setForm(prev => ({
                ...prev,
                fullShiftRecording: v,
                preferredShift: v ? (prev.preferredShift || 'manha') : prev.preferredShift,
                fixedTime: v ? ((prev.preferredShift || 'manha') === 'tarde' ? settings.shiftBStart : settings.shiftAStart) : prev.fixedTime,
              }));
            }}
          />
          <div>
            <Label className="font-medium flex items-center gap-1.5"><Star size={14} className="text-amber-500" /> Cliente Star</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Reserva o turno inteiro (manhã ou tarde) para este cliente.
            </p>
          </div>
        </div>
        {form.fullShiftRecording && (
          <div className="space-y-1">
            <Label>Turno Preferido</Label>
            <Select value={form.preferredShift || 'manha'} onValueChange={v => {
              setPreferredShift(v === 'tarde' ? 'turnoB' : 'turnoA');
              setForm(prev => ({ ...prev, preferredShift: v as 'manha' | 'tarde', fixedTime: v === 'tarde' ? settings.shiftBStart : settings.shiftAStart }));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manha">☀️ Manhã ({settings.shiftAStart} – {settings.shiftAEnd})</SelectItem>
                <SelectItem value="tarde">🌙 Tarde ({settings.shiftBStart} – {settings.shiftBEnd})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
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
      {form.videomaker && scheduleGrid && !form.fullShiftRecording && (
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
                              <div className="rounded-md bg-destructive/12 border border-destructive/20 px-1 py-1 text-center truncate" title={cell.clientName}>
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
            <div className="flex gap-3 px-3 py-1.5 bg-muted/30 border-t border-border/50 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/30" /> Livre</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-destructive/15 border border-destructive/25" /> Ocupado</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-primary" /> Selecionado</span>
            </div>
          </div>
        </div>
      )}

      {form.videomaker && form.fullShiftRecording && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Agenda por período de {users.find(u => u.id === form.videomaker)?.name}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fullShiftPeriods.map((period, index) => {
              const isSelected = form.fixedDay === period.day && (form.preferredShift || 'manha') === period.shift;
              return (
                <button
                  key={`${period.day}-${period.shift}-${index}`}
                  type="button"
                  disabled={!period.available}
                  onClick={() => period.available && selectFullShiftSuggestion({ day: period.day, shift: period.shift })}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : period.available
                        ? 'border-border hover:border-primary/40 hover:bg-primary/5'
                        : 'border-destructive/20 bg-destructive/5 opacity-70 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {DAY_LABELS[period.day]} · {period.shift === 'tarde' ? 'Tarde' : 'Manhã'}
                      </p>
                      <p className="text-xs text-muted-foreground">{period.label}</p>
                    </div>
                    <Badge variant="secondary" className={period.available ? 'bg-primary/15 text-primary border-0' : 'bg-destructive/10 text-destructive border-0'}>
                      {period.available ? 'Livre' : 'Ocupado'}
                    </Badge>
                  </div>
                  {!period.available && period.occupiedBy && (
                    <p className="mt-2 text-xs text-muted-foreground">Reservado por {period.occupiedBy}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!form.fullShiftRecording && form.videomaker && bestSlots.length > 0 && (
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

      {form.fullShiftRecording && form.videomaker && bestFullShiftPeriods.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <Star size={14} /> Melhores períodos disponíveis
          </p>
          <div className="grid grid-cols-1 gap-2">
            {bestFullShiftPeriods.map((slot, i) => (
              <button
                key={`${slot.day}-${slot.shift}-${i}`}
                type="button"
                onClick={() => selectFullShiftSuggestion({ day: slot.day, shift: slot.shift })}
                className={`w-full p-3 rounded-xl border-2 transition-colors text-left flex items-center gap-3 ${
                  form.fixedDay === slot.day && (form.preferredShift || 'manha') === slot.shift
                    ? 'border-primary bg-primary/10'
                    : 'border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Star size={16} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{DAY_LABELS[slot.day]} · {slot.shift === 'tarde' ? 'Tarde' : 'Manhã'}</p>
                  <p className="text-xs text-muted-foreground">{slot.label}</p>
                </div>
                <Badge variant="secondary" className="ml-auto shrink-0 bg-primary/15 text-primary border-0 text-[10px]">
                  {i === 0 ? 'Melhor opção' : '2ª opção'}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cliente Star toggle was moved to Step 1 */}

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

  const renderStep3 = () => {
    // Entregas exibidas e editadas como MENSAL. Persistência continua em campos semanais (weekly = ceil(monthly/4)).
    const monthlyReels = (form.weeklyReels ?? 0) * 4;
    const monthlyCreatives = (form.weeklyCreatives ?? 0) * 4;
    const monthlyStories = (form.weeklyStories ?? 0) * 4;
    const monthlyTotal = form.weeklyGoal ? form.weeklyGoal * 4 : (monthlyReels + monthlyCreatives + monthlyStories);

    const setMonthly = (patch: Partial<{ reels: number; creatives: number; stories: number; total: number }>) => {
      setForm(prev => {
        const next = { ...prev };
        if (patch.reels !== undefined) next.weeklyReels = Math.ceil(Math.max(0, patch.reels) / 4);
        if (patch.creatives !== undefined) next.weeklyCreatives = Math.ceil(Math.max(0, patch.creatives) / 4);
        if (patch.stories !== undefined) next.weeklyStories = Math.ceil(Math.max(0, patch.stories) / 4);
        if (patch.total !== undefined) next.weeklyGoal = Math.ceil(Math.max(0, patch.total) / 4);
        return next;
      });
    };
    const planLabel = planId && !specialPlan
      ? (plans.find(p => p.id === planId)?.name || 'plano')
      : null;
    return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Target size={16} className="text-primary" /> Metas de Entrega Mensal
          </p>
          {planLabel && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Definido pelo plano · {planLabel}
            </span>
          )}
        </div>
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 space-y-1">
          <p className="font-semibold">⚠️ Como funciona</p>
          <p className="text-muted-foreground">
            Selecione um plano abaixo para preencher automaticamente as entregas mensais, ou ative <strong>Plano Especial</strong> para editar manualmente a meta mensal deste cliente.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>Reels/Mês</Label>
            <Input type="number" min={0} disabled={!!planId && !specialPlan} value={monthlyReels} onChange={e => setMonthly({ reels: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Criativos/Mês</Label>
            <Input type="number" min={0} disabled={!!planId && !specialPlan} value={monthlyCreatives} onChange={e => setMonthly({ creatives: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Stories/Mês</Label>
            <Input type="number" min={0} disabled={!!planId && !specialPlan} value={monthlyStories} onChange={e => setMonthly({ stories: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>Limite Artes/Mês</Label>
            <Input
              type="number"
              min={0}
              value={form.artRequestsLimit ?? ''}
              onChange={e => setForm({ ...form, artRequestsLimit: e.target.value ? Number(e.target.value) : null })}
              placeholder="Sem limite"
            />
            <p className="text-[10px] text-muted-foreground">Vazio = sem limite de solicitações</p>
          </div>
          <div className="space-y-1">
            <Label>Meta Total/Mês</Label>
            <Input type="number" min={0} disabled={!!planId && !specialPlan} value={monthlyTotal} onChange={e => setMonthly({ total: Number(e.target.value) })} />
          </div>
        </div>
        {!planTargetsValidation.ok && (
          <div className={`p-3 rounded-lg border text-xs flex gap-2 items-start ${
            planTargetsValidation.level === 'error'
              ? 'bg-destructive/10 border-destructive/30 text-destructive'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
          }`}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {planTargetsValidation.level === 'error' ? 'Configuração incoerente — bloqueia salvamento' : 'Atenção'}
              </p>
              <p>{planTargetsValidation.message}</p>
            </div>
          </div>
        )}
      </div>


      {/* Plan selection */}
      <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Package size={16} className="text-primary" /> Plano Contratado
          </p>
          <div className="flex items-center gap-2">
            <Switch checked={specialPlan} onCheckedChange={(v) => {
              setSpecialPlan(v);
              if (v) {
                // Ativando Plano Especial: mantém metas atuais como ponto de partida, remove plano padrão
                setPlanId(null);
              } else if (!planId) {
                // Desativando sem plano definido: zera metas para evitar geração de copy sem base contratual
                setForm(prev => ({ ...prev, weeklyReels: 0, weeklyCreatives: 0, weeklyStories: 0, weeklyGoal: 0 }));
                toast.info('Metas mensais zeradas — selecione um plano para gerar demandas de copy.');
              }
            }} />
            <Label className="text-xs cursor-pointer">Plano Especial (metas personalizadas)</Label>
          </div>
        </div>
        {specialPlan ? (
          <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-700 dark:text-violet-300">
            🎯 <strong>Plano Especial ativo.</strong> Edite as metas mensais acima manualmente conforme o combinado com o cliente.
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Plano</Label>
            <Select value={planId || 'none'} onValueChange={v => {
                const newPlanId = v === 'none' ? null : v;
                setPlanId(newPlanId);
                if (newPlanId) {
                  const selectedPlan = plans.find(p => p.id === newPlanId);
                  if (selectedPlan) {
                    const monthlyRecordings = selectedPlan.recording_sessions || 4;
                    const wReels = Math.ceil((selectedPlan.reels_qty || 0) / 4);
                    const wCreatives = Math.ceil((selectedPlan.creatives_qty || 0) / 4);
                    const wStories = Math.ceil((selectedPlan.stories_qty || 0) / 4);
                    setForm(prev => ({
                      ...prev,
                      monthlyRecordings,
                      acceptsExtra: selectedPlan.accepts_extra_content,
                      weeklyReels: wReels,
                      weeklyCreatives: wCreatives,
                      weeklyStories: wStories,
                      weeklyGoal: wReels + wCreatives + wStories,
                    }));
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
        )}
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
   };



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
              {!editing && (() => {
                const stepLabels = clientType === 'sem_contrato' ? STEP_LABELS_SEM_CONTRATO : (hasMetaApi ? STEP_LABELS_WITH_META : STEP_LABELS_NO_META);
                const maxStep = stepLabels.length - 1;
                return (
                <div className="flex items-center gap-1 mb-2">
                  {stepLabels.map((s, i) => {
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
                        {i < stepLabels.length - 1 && <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                      </div>
                    );
                  })}
                </div>
                );
              })()}

              {/* Step content */}
              <div className="min-h-[200px]">
                {editing ? (
                  // Editing: show fields based on client type
                  clientType === 'sem_contrato' ? (
                    <div className="space-y-5">
                      {renderStep0()}
                      {/* Proposal selector for sem_contrato editing */}
                      <div className="space-y-2 border-t border-border/50 pt-4">
                        <Label>Tipo de Cliente</Label>
                        <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">📦 Pacotes de Serviços</Badge>
                        <div className="mt-2">
                         <Label>Vincular a Proposta Aceita *</Label>
                          <Select value={proposalId || 'none'} onValueChange={v => {
                            const selectedId = v === 'none' ? null : v;
                            setProposalId(selectedId);
                            if (selectedId) {
                              const p = proposals.find(pr => pr.id === selectedId);
                              if (p) {
                                setForm(prev => ({
                                  ...prev,
                                  companyName: p.client_company || prev.companyName || '',
                                  responsiblePerson: p.client_name || prev.responsiblePerson || '',
                                  whatsapp: p.whatsapp_number || prev.whatsapp || '',
                                }));
                              }
                            }
                          }}>
                            <SelectTrigger><SelectValue placeholder="Selecione uma proposta" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhuma proposta</SelectItem>
                              {proposals.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.client_company || p.client_name} — {p.proposal_type === 'marketing' ? 'Marketing' : p.proposal_type === 'sistema' ? 'Sistema' : p.proposal_type === 'endomarketing' ? 'Endomarketing' : p.proposal_type === 'cronograma' ? 'Cronograma' : 'Personalizada'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {renderStep0()}
                      {hasMetaApi && renderStep1()}
                      {renderStep2()}
                      {renderStep3()}
                      {renderStep4()}
                    </div>
                  )
                ) : clientType === 'sem_contrato' ? (
                  <>
                    {step === 0 && renderStep0()}
                  </>
                ) : hasMetaApi ? (
                  <>
                    {step === 0 && renderStep0()}
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep3()}
                    {step === 3 && renderStep4()}
                  </>
                ) : (
                  <>
                    {step === 0 && renderStep0()}
                    {step === 1 && renderStep3()}
                    {step === 2 && renderStep4()}
                  </>
                )}
              </div>

              {/* Navigation buttons */}
              <div className="flex gap-2 pt-2">
                {editing ? (
                  <Button onClick={handleSave} className="w-full">Salvar Alterações</Button>
                ) : (() => {
                  const stepLabelsUsed = clientType === 'sem_contrato' ? STEP_LABELS_SEM_CONTRATO : (hasMetaApi ? STEP_LABELS_WITH_META : STEP_LABELS_NO_META);
                  const maxStep = stepLabelsUsed.length - 1;
                  return (
                  <>
                    {step > 0 && (
                      <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1">
                        <ChevronLeft size={14} /> Voltar
                      </Button>
                    )}
                    {step < maxStep ? (
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
                  );
                })()}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Client Goal Rocket Widget */}
      <ClientGoalRocket currentClients={clients.filter(c => c.status === 'ativo').length} />

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
              {/* Header row - clickable for sem_contrato */}
              <div className={`p-4 pb-3 flex items-start gap-3 ${(c as any).clientType === 'sem_contrato' ? 'cursor-pointer hover:bg-accent/30 transition-colors' : ''}`}
                onClick={() => { if ((c as any).clientType === 'sem_contrato') setChecklistClient(c); }}>
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
                      {DAY_LABELS[c.fixedDay]} · {c.fullShiftRecording ? `Turno ${c.preferredShift === 'tarde' ? 'Tarde' : 'Manhã'}` : c.fixedTime} · {getClientVideomakerName(c)}
                    </p>
                  )}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {(c as any).status === 'cancelado' && (
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-destructive/20 text-destructive border-destructive/30">❌ Cancelado</Badge>
                    )}
                   {(c as any).clientType === 'sem_contrato' && (
                      <Badge className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-600 border-blue-500/30">📦 Pacotes de Serviços</Badge>
                    )}
                    {(c as any).clientType === 'sem_contrato' && (
                      <ProposalChecklist clientId={c.id} editable={false} compact={true} />
                    )}
                    {c.niche && c.niche !== 'outro' && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                        {NICHE_OPTIONS.find(n => n.value === c.niche)?.label || c.niche}
                      </Badge>
                    )}
                    {!isDesignerOnly && (
                      <>
                        {(c.weeklyReels ?? 0) > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{(c.weeklyReels ?? 0) * 4} reels/mês</Badge>}
                        {(c.weeklyCreatives ?? 0) > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{(c.weeklyCreatives ?? 0) * 4} criativos/mês</Badge>}
                        {(c.weeklyStories ?? 0) > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">{(c.weeklyStories ?? 0) * 4} stories/mês</Badge>}
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
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Pulse Club" onClick={() => window.open(`/portal/${c.id}`, '_blank')}>
                  <MonitorPlay size={15} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" title="Transferir Cidade" onClick={() => setTransferClient(c)}>
                  <MoveHorizontal size={15} />
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Link de onboarding completo"
                      onClick={() => {
                        const link = `${window.location.origin}/onboarding/${c.id}`;
                        navigator.clipboard.writeText(link);
                        toast.success('Link de onboarding copiado!');
                      }}>
                      <Copy size={15} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500" title="Link só do briefing"
                      onClick={() => {
                        const link = `${window.location.origin}/briefing/${c.id}`;
                        navigator.clipboard.writeText(link);
                        toast.success('Link do briefing copiado! Envie ao cliente para preenchimento.');
                      }}>
                      <FileTextIcon size={15} />
                    </Button>
                    {c.whatsapp && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-success" title="WhatsApp" onClick={() => {
                        setSendWaClient(c);
                        setSendWaOpen(true);
                      }}><MessageSquare size={15} /></Button>
                    )}
                    <div className="flex-1" />
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Ficha PDF" onClick={() => {
                      const vmName = getClientVideomakerName(c);
                      generateClientCardPdf(c, vmName);
                    }}><Printer size={15} /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => handleOpen(c)}><Pencil size={15} /></Button>
                    {(c as any).status === 'cancelado' ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500" title="Reativar" onClick={() => handleReactivate(c)}><RefreshCw size={15} /></Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500" title="Cancelar Cliente" onClick={() => { setCancelClient(c); setCancelDialogOpen(true); }}><UserMinus size={15} /></Button>
                    )}
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

      {/* Checklist Management Dialog for Pacotes de Serviços */}
      <Dialog open={!!checklistClient} onOpenChange={o => !o && setChecklistClient(null)}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package size={18} className="text-primary" />
              Checklist — {checklistClient?.companyName}
            </DialogTitle>
          </DialogHeader>
          {checklistClient && (
            <ChecklistManager
              clientId={checklistClient.id}
              proposalId={(checklistClient as any).proposalId}
              onGenerate={async () => {
                if (!(checklistClient as any).proposalId) {
                  toast.error('Este cliente não possui proposta vinculada');
                  return;
                }
                setGeneratingChecklistFor(checklistClient.id);
                try {
                  await replaceProposalChecklist(checklistClient.id, (checklistClient as any).proposalId);
                  toast.success('Checklist gerado com sucesso!');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Erro ao gerar checklist');
                } finally {
                  setGeneratingChecklistFor(null);
                }
              }}
              generating={generatingChecklistFor === checklistClient?.id}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Briefing Dialog */}
      <Dialog open={!!briefingClient} onOpenChange={o => !o && setBriefingClient(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 bg-[#0a0a0a] border-white/10 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Briefing — {briefingClient?.companyName}</DialogTitle>
          </DialogHeader>

          {briefingClient && <ClientBriefingView client={briefingClient} />}
        </DialogContent>
      </Dialog>

      {/* Cancel Client Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus size={18} className="text-amber-500" />
              Cancelar Cliente
            </DialogTitle>
          </DialogHeader>
          {cancelClient && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="font-medium text-sm">{cancelClient.companyName}</p>
                <p className="text-xs text-muted-foreground">{cancelClient.responsiblePerson}</p>
              </div>
              <div className="space-y-1">
                <Label>Motivo do Cancelamento</Label>
                <Select value={cancelReason} onValueChange={setCancelReason}>
                  <SelectTrigger><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insatisfacao">Insatisfação com o serviço</SelectItem>
                    <SelectItem value="financeiro">Problemas financeiros</SelectItem>
                    <SelectItem value="concorrencia">Migrou para concorrente</SelectItem>
                    <SelectItem value="encerramento">Encerrou as atividades</SelectItem>
                    <SelectItem value="mudanca_foco">Mudança de foco/estratégia</SelectItem>
                    <SelectItem value="sazonalidade">Sazonalidade do negócio</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setCancelDialogOpen(false)} className="flex-1">Voltar</Button>
                <Button variant="destructive" onClick={handleCancel} className="flex-1 gap-2">
                  <UserMinus size={16} /> Confirmar Cancelamento
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {transferClient && (
        <TransferClientDialog
          client={transferClient}
          open={!!transferClient}
          onOpenChange={o => !o && setTransferClient(null)}
        />
      )}
    </div>
  );
}

/* ==================== Checklist Manager for Pacotes de Serviços ==================== */
function ChecklistManager({ clientId, proposalId, onGenerate, generating }: { clientId: string; proposalId: string | null; onGenerate: () => Promise<void>; generating: boolean }) {
  const [items, setItems] = useState<{ id: string; title: string; description: string | null; is_completed: boolean; completed_at: string | null; sort_order: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('proposal_checklist_items')
      .select('*')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setItems(data as any[]);
        setLoading(false);
      });
  }, [clientId, key]);

  const toggleItem = async (item: typeof items[0]) => {
    const newCompleted = !item.is_completed;
    setItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, is_completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null } : i
    ));
    await supabase.from('proposal_checklist_items').update({
      is_completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } as any).eq('id', item.id);
  };

  const completed = items.filter(i => i.is_completed).length;
  const total = items.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <ScrollArea className="max-h-[60vh]">
      <div className="space-y-4 pr-2">
        {/* Generate / Regenerate button */}
        {proposalId && (
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={generating}
            onClick={async () => {
              await onGenerate();
              setKey(k => k + 1);
            }}
          >
            {generating ? (
              <><Loader2 size={14} className="animate-spin" /> Gerando checklist...</>
            ) : items.length > 0 ? (
              <><RefreshCw size={14} /> Regenerar Checklist da Proposta</>
            ) : (
              <><Plus size={14} /> Gerar Checklist da Proposta</>
            )}
          </Button>
        )}

        {!proposalId && (
          <div className="text-center py-6 text-muted-foreground">
            <Package size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Este cliente não possui proposta vinculada.</p>
            <p className="text-xs mt-1">Edite o cliente para vincular uma proposta aceita.</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : items.length > 0 ? (
          <>
            {/* Progress */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{completed}/{total} itens concluídos</span>
              <span className={`text-xs font-bold ${progress === 100 ? 'text-green-600' : 'text-primary'}`}>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />

            {/* Items */}
            <div className="space-y-1.5">
              {items.map(item => (
                <div
                  key={item.id}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border transition-colors cursor-pointer ${
                    item.is_completed
                      ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800'
                      : 'bg-card border-border hover:border-primary/40'
                  }`}
                  onClick={() => toggleItem(item)}
                >
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={() => toggleItem(item)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${item.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : proposalId ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">Nenhum checklist gerado ainda.</p>
            <p className="text-xs mt-1">Clique no botão acima para gerar.</p>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

/* ==================== Briefing Viewer for Designer (Pulse Academy style) ==================== */
function ClientBriefingView({ client }: { client: Client }) {
  const briefing = (client as any).briefingData || {};
  const editorial = (client as any).editorial || '';
  const niche = client.niche;
  const [historyOpen, setHistoryOpen] = useState(false);
  const currentVersion = briefing?._version;
  const submittedAt = briefing?._submittedAt;
  const nicheLabel = NICHE_OPTIONS.find(n => n.value === niche)?.label || niche || '—';
  const driveIV = (client as any).driveIdentidadeVisual;

  const fmt = (v: any): string => {
    if (v == null || v === '') return '';
    if (Array.isArray(v)) return v.filter(x => x != null && x !== '').join(', ');
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    return String(v);
  };
  const has = (k: string) => {
    const v = briefing[k];
    if (v == null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  };

  const LABELS: Record<string, string> = {
    ownerName: 'Responsável', mainDifferential: 'Principal Diferencial',
    productsServices: 'Produtos / Serviços', focusProducts: 'Produtos em Foco',
    businessGoals: 'Objetivos do Negócio', attendanceType: 'Forma de Atendimento',
    targetCities: 'Cidades-alvo', hasVisualIdentity: 'Possui Identidade Visual?',
    hasSite: 'Site', useRealPhotos: 'Usar Fotos Reais?', comfortOnCamera: 'Conforto na Câmera',
    socialLinks: 'Links das Redes', idealClient: 'Cliente Ideal',
    ageRangesTarget: 'Faixa Etária do Público', ageRangesBuyer: 'Faixa Etária de Quem Compra',
    educationLevel: 'Escolaridade', socialClass: 'Classe Social',
    clientUsesSocial: 'Cliente Usa Redes?', isAuthority: 'É Autoridade?',
    socialObjectives: 'Objetivos nas Redes', importantTopics: 'Assuntos Importantes',
    keywords: 'Palavras-chave', dislikedCommunication: 'Comunicação que Não Gosta',
    desiredRecognition: 'Reconhecimento Desejado', undesiredRecognition: 'Reconhecimento Indesejado',
    digitalReferences: 'Referências Digitais', nicheReferences: 'Referências do Nicho',
    contentReferences: 'Referências de Conteúdo', competitors: 'Concorrentes',
    digitalDifficulty: 'Dificuldade no Digital', businessDifficulty: 'Dificuldade no Negócio',
    finalNotes: 'Considerações Finais',
    // legado
    business_description: 'Descrição do Negócio', target_audience: 'Público-Alvo',
    differentials: 'Diferenciais', tone_of_voice: 'Tom de Voz', goals: 'Objetivos',
    visual_references: 'Referências Visuais', brand_colors: 'Cores da Marca',
    avoid: 'Evitar', additional_notes: 'Observações',
    products_services: 'Produtos/Serviços', social_media_links: 'Redes Sociais',
  };

  type Sec = { key: string; title: string; accent: string; icon: any; fields: string[] };
  const SECTIONS: Sec[] = [
    { key: 'identidade', title: 'Identidade do Negócio', accent: 'from-red-600 to-orange-500', icon: Building2,
      fields: ['ownerName','mainDifferential','businessGoals','goals','productsServices','products_services','focusProducts','attendanceType','targetCities','business_description','differentials'] },
    { key: 'publico', title: 'Público-Alvo', accent: 'from-fuchsia-500 to-pink-500', icon: UsersIcon,
      fields: ['idealClient','target_audience','ageRangesTarget','ageRangesBuyer','educationLevel','socialClass','clientUsesSocial','isAuthority'] },
    { key: 'comunicacao', title: 'Comunicação & Voz', accent: 'from-amber-500 to-yellow-500', icon: Megaphone,
      fields: ['socialObjectives','importantTopics','keywords','tone_of_voice','dislikedCommunication','desiredRecognition','undesiredRecognition','avoid'] },
    { key: 'visual', title: 'Marca & Visual', accent: 'from-violet-500 to-indigo-500', icon: Palette,
      fields: ['hasVisualIdentity','brand_colors','useRealPhotos','comfortOnCamera','hasSite','socialLinks','social_media_links'] },
    { key: 'refs', title: 'Referências', accent: 'from-cyan-500 to-sky-500', icon: Lightbulb,
      fields: ['digitalReferences','nicheReferences','contentReferences','visual_references','competitors'] },
    { key: 'desafios', title: 'Desafios & Notas Finais', accent: 'from-emerald-500 to-teal-500', icon: Award,
      fields: ['digitalDifficulty','businessDifficulty','finalNotes','additional_notes'] },
  ];

  const mappedKeys = new Set(SECTIONS.flatMap(s => s.fields));
  const extras = Object.entries(briefing)
    .filter(([k, v]) => !k.startsWith('_') && !mappedKeys.has(k) && !['niche','city'].includes(k) && v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => ({ label: LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: fmt(v) }));

  const totalFilled = SECTIONS.reduce((n, s) => n + s.fields.filter(has).length, 0) + extras.length;
  const hasBriefing = totalFilled > 0;

  const handleDownloadPdf = async () => {
    try {
      await generateBriefingPdf({
        companyName: client.companyName,
        responsiblePerson: client.responsiblePerson,
        niche: nicheLabel,
        city: (client as any).city,
        briefingData: briefing,
        editorial,
        submittedAt,
      });
    } catch {
      toast.error('Erro ao gerar PDF do briefing');
    }
  };

  return (
    <div className="bg-[#0a0a0a] text-white max-h-[90vh] overflow-hidden flex flex-col">
      {/* ── HERO ── */}
      <div className="relative shrink-0 overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 via-fuchsia-600/10 to-transparent" />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-red-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
        <div className="relative px-6 sm:px-10 py-6 sm:py-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black uppercase tracking-[0.35em] text-red-500">Pulse</span>
            <span className="text-[10px] font-black uppercase tracking-[0.35em] text-white/70">Briefing</span>
            {currentVersion && (
              <Badge className="bg-white/10 text-white border-white/10 text-[9px] font-black uppercase tracking-widest px-2 py-0">v{currentVersion}</Badge>
            )}
          </div>
          <h1 className="text-2xl sm:text-4xl font-black italic uppercase tracking-tighter leading-[0.95]">
            {client.companyName}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
            {client.responsiblePerson && (<span className="flex items-center gap-1.5"><User size={11} />{client.responsiblePerson}</span>)}
            {nicheLabel !== '—' && (<><span className="text-white/20">·</span><span className="flex items-center gap-1.5"><Layers size={11} />{nicheLabel}</span></>)}
            {(client as any).city && (<><span className="text-white/20">·</span><span className="flex items-center gap-1.5"><Globe size={11} />{(client as any).city}</span></>)}
            <span className="text-white/20">·</span>
            <span className="flex items-center gap-1.5"><Sparkles size={11} className="text-emerald-400" />{totalFilled} respostas</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleDownloadPdf} className="bg-white text-black hover:bg-gray-200 font-black uppercase tracking-widest text-[10px] h-8 gap-1.5">
              <Printer size={12} /> Baixar PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} className="bg-white/10 hover:bg-white/20 text-white font-black uppercase tracking-widest text-[10px] h-8 gap-1.5 border border-white/10">
              <FileTextIcon size={12} /> Histórico
            </Button>
            {driveIV && (
              <Button size="sm" asChild variant="ghost" className="bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 font-black uppercase tracking-widest text-[10px] h-8 gap-1.5 border border-violet-500/20">
                <a href={driveIV} target="_blank" rel="noopener noreferrer"><Palette size={12} /> Identidade Visual</a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <BriefingVersionsDialog open={historyOpen} onOpenChange={setHistoryOpen} clientId={client.id} companyName={client.companyName} />

      {/* ── BODY ── */}
      <ScrollArea className="flex-1">
        <div className="px-6 sm:px-10 py-6 sm:py-8 space-y-8">
          {!hasBriefing && !editorial ? (
            <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
              <FileTextIcon size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold uppercase tracking-widest text-white/60">Briefing ainda não preenchido</p>
              <p className="text-xs mt-2 text-white/40">Envie o link do briefing para o cliente responder.</p>
            </div>
          ) : (
            <>
              {/* Editorial */}
              {editorial && (() => {
                const blocks = parseEditorial(editorial);
                if (blocks.length === 0) return null;
                return (
                  <section>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-8 w-1 rounded bg-gradient-to-b from-red-600 to-orange-500" />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-500">Fonte de verdade</p>
                        <h3 className="text-lg font-black italic uppercase tracking-tighter">Linha Editorial</h3>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {blocks.map((b, i) => (
                        <div
                          key={i}
                          className={cn(
                            'rounded-2xl border p-5 sm:p-6 transition-colors',
                            b.level === 1
                              ? 'border-red-600/25 bg-gradient-to-br from-red-600/10 via-red-600/5 to-transparent'
                              : 'border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent ml-0 sm:ml-6'
                          )}
                        >
                          {b.heading && (
                            <div className="flex items-center gap-2 mb-3">
                              {b.level === 2 && <span className="h-1 w-6 rounded bg-orange-400/60" />}
                              <h4 className={cn(
                                'font-black italic uppercase tracking-tight',
                                b.level === 1 ? 'text-base sm:text-lg text-white' : 'text-sm text-orange-200'
                              )}>
                                {b.heading}
                              </h4>
                            </div>
                          )}
                          {b.paragraphs.map((p, j) => (
                            <p key={j} className="text-sm text-white/85 leading-relaxed mb-2 last:mb-0">{p}</p>
                          ))}
                          {b.bullets && b.bullets.length > 0 && (
                            <ul className="mt-3 space-y-1.5">
                              {b.bullets.map((it, k) => (
                                <li key={k} className="flex gap-2 text-sm text-white/85 leading-relaxed">
                                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                                  <span>{it}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}

              {/* Sections */}
              {SECTIONS.map((sec) => {
                const items = sec.fields.filter(has).map(k => ({ key: k, label: LABELS[k] || k, value: fmt(briefing[k]) }));
                if (items.length === 0) return null;
                const Icon = sec.icon;
                return (
                  <section key={sec.key}>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-1 rounded bg-gradient-to-b ${sec.accent}`} />
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">{items.length} {items.length === 1 ? 'resposta' : 'respostas'}</p>
                          <h3 className="text-lg font-black italic uppercase tracking-tighter flex items-center gap-2">
                            <Icon size={16} className="text-white/70" /> {sec.title}
                          </h3>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {items.map(it => {
                        const isLong = it.value.length > 120;
                        return (
                          <div
                            key={it.key}
                            className={cn(
                              'group relative rounded-xl border border-white/5 bg-gradient-to-b from-zinc-900/80 to-zinc-900/20 p-4 transition-all hover:border-white/20 hover:shadow-[0_0_25px_rgba(255,255,255,0.03)]',
                              isLong && 'md:col-span-2'
                            )}
                          >
                            <div className={`absolute left-0 top-0 h-full w-[2px] rounded-l bg-gradient-to-b ${sec.accent} opacity-40 group-hover:opacity-100 transition-opacity`} />
                            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 mb-1.5">{it.label}</p>
                            <p className="text-sm text-white/90 whitespace-pre-line leading-relaxed">{it.value}</p>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {/* Extras não mapeados */}
              {extras.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-1 rounded bg-gradient-to-b from-zinc-500 to-zinc-700" />
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">{extras.length} campos</p>
                      <h3 className="text-lg font-black italic uppercase tracking-tighter flex items-center gap-2">
                        <Info size={16} className="text-white/70" /> Outras Informações
                      </h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {extras.map((it, i) => (
                      <div key={i} className="rounded-xl border border-white/5 bg-zinc-900/40 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 mb-1.5">{it.label}</p>
                        <p className="text-sm text-white/90 whitespace-pre-line leading-relaxed">{it.value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


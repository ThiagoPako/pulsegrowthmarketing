import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/vpsDb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, ChevronLeft, ChevronRight, Video, Calendar, Shield, Sparkles, Clock, User, Camera, AlertTriangle, ImageIcon, FileText, Zap, Star, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster as Sonner } from '@/components/ui/sonner';

type DayOfWeek = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo';

const DAY_LABELS: Record<string, string> = {
  segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado', domingo: 'Domingo',
};

const CONTENT_TYPE_LABELS: Record<string, string> = { reels: 'Reels', story: 'Story', produto: 'Vídeo de Produto' };

function timeToMinutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minutesToTime(m: number) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

interface Videomaker { id: string; name: string; display_name: string | null; avatar_url: string | null; bio: string | null; job_title: string | null; }
interface Settings { shift_a_start: string; shift_a_end: string; shift_b_start: string; shift_b_end: string; work_days: string[]; recording_duration: number; }
interface ExistingClient { id: string; videomaker_id: string | null; fixed_day: string; fixed_time: string; }

interface BriefingData {
  niche: string;
  differentials: string;
  products_services: string;
  service_mode: string;
  target_cities: string;
  has_identity: string;
  website: string;
  social_links: string;
  competitors: string;
  social_objectives: string[];
  comfortable_on_camera: string;
  focus_topics: string;
  target_age: string[];
  target_class: string;
  ideal_client: string;
  brand_voice: string;
  avoid_voice: string;
  additional_info: string;
  instagram_login: string;
  instagram_password: string;
}

const EMPTY_BRIEFING: BriefingData = {
  niche: '', differentials: '', products_services: '', service_mode: '',
  target_cities: '', has_identity: '', website: '', social_links: '',
  competitors: '', social_objectives: [], comfortable_on_camera: '',
  focus_topics: '', target_age: [], target_class: '', ideal_client: '',
  brand_voice: '', avoid_voice: '', additional_info: '',
  instagram_login: '', instagram_password: '',
};

export default function ClientOnboarding() {
  const { clientId } = useParams<{ clientId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  // Data from API
  const [client, setClient] = useState<any>(null);
  const [videomakers, setVideomakers] = useState<Videomaker[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [existingClients, setExistingClients] = useState<ExistingClient[]>([]);
  const [plan, setPlan] = useState<{ id: string; name: string; recording_sessions: number; accepts_extra_content?: boolean; has_recording?: boolean; has_photography?: boolean; services?: string[]; plan_type?: string } | null>(null);

  // Form state
  const [selectedVm, setSelectedVm] = useState('');
  const [monthlyRecordings, setMonthlyRecordings] = useState(4);
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([1, 2, 3, 4]);
  const [preferredShift, setPreferredShift] = useState<'turnoA' | 'turnoB' | 'ambos'>('ambos');
  const [fixedDay, setFixedDay] = useState<DayOfWeek>('segunda');
  const [fixedTime, setFixedTime] = useState('');
  const [backupDay, setBackupDay] = useState<DayOfWeek>('terca');
  const [backupTime, setBackupTime] = useState('');
  const [acceptsExtra, setAcceptsExtra] = useState(false);
  const [extraTypes, setExtraTypes] = useState<string[]>([]);
  const [extraAppears, setExtraAppears] = useState(false);
  const [fullShiftRecording, setFullShiftRecording] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Photo preferences
  const [photoPreference, setPhotoPreference] = useState<string>('nao_precisa');
  const [hasPhotoShoot, setHasPhotoShoot] = useState(false);
  const [acceptsPhotoShootCost, setAcceptsPhotoShootCost] = useState(false);

  // Briefing (new clients only)
  const [briefing, setBriefing] = useState<BriefingData>(EMPTY_BRIEFING);
  const [isNewClient, setIsNewClient] = useState(false);

  const updateBriefing = (field: keyof BriefingData, value: any) => {
    setBriefing(prev => ({ ...prev, [field]: value }));
  };

  const toggleBriefingArray = (field: 'social_objectives' | 'target_age', value: string) => {
    setBriefing(prev => {
      const arr = prev[field] as string[];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  useEffect(() => {
    if (!clientId) return;
    const fetchData = async () => {
      try {
        const url = `https://agenciapulse.tech/api/client-onboarding?clientId=${clientId}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) { toast.error('Cliente não encontrado'); return; }
        setClient(data.client);
        setVideomakers(data.videomakers || []);
        setSettings(data.settings);
        setExistingClients(data.existingClients || []);
        if (data.plan) setPlan(data.plan);
        if (data.client.onboarding_completed) setCompleted(true);
        if (data.client.videomaker_id) setSelectedVm(data.client.videomaker_id);
        if (data.client.monthly_recordings) setMonthlyRecordings(data.client.monthly_recordings);
        if (data.client.client_type === 'novo') setIsNewClient(true);
        if (data.client.photo_preference) setPhotoPreference(data.client.photo_preference);
        if (data.client.has_photo_shoot) setHasPhotoShoot(data.client.has_photo_shoot);
        if (data.client.accepts_photo_shoot_cost) setAcceptsPhotoShootCost(data.client.accepts_photo_shoot_cost);
        if (data.client.briefing_data && Object.keys(data.client.briefing_data).length > 0) {
          setBriefing({ ...EMPTY_BRIEFING, ...data.client.briefing_data });
        }

        const planName = data.plan?.name?.toLowerCase() || '';
        const planMaxWeeks = planName.includes('booster') || planName.includes('boost') ? 3 
          : planName.includes('premium') ? 4 
          : data.plan?.recording_sessions || 4;
        if (data.client.selected_weeks?.length) {
          const clamped = data.client.selected_weeks.slice(0, planMaxWeeks);
          setSelectedWeeks(clamped);
          setMonthlyRecordings(clamped.length);
        } else {
          const defaultWeeks = [1, 2, 3].slice(0, planMaxWeeks);
          setSelectedWeeks(defaultWeeks);
          setMonthlyRecordings(defaultWeeks.length);
        }
        if (data.client.fixed_day) setFixedDay(data.client.fixed_day);
        if (data.client.fixed_time) setFixedTime(data.client.fixed_time);
        if (data.client.backup_day) setBackupDay(data.client.backup_day);
        if (data.client.backup_time) setBackupTime(data.client.backup_time);
        // Sync accepts_extra from plan if available
        if (data.plan?.accepts_extra_content !== undefined) {
          setAcceptsExtra(data.plan.accepts_extra_content);
        } else if (data.client.accepts_extra) {
          setAcceptsExtra(data.client.accepts_extra);
        }
        if (data.client.extra_content_types?.length) setExtraTypes(data.client.extra_content_types);
        if (data.client.extra_client_appears) setExtraAppears(data.client.extra_client_appears);
      } catch (err) {
        console.error(err);
        toast.error('Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [clientId]);

  // Each recording = 90 minutes (1h30min)
  const RECORDING_DURATION = 90;
  const BUFFER = 30;

  const availableSlots = useMemo(() => {
    if (!selectedVm || !settings) return [];
    const duration = RECORDING_DURATION;
    const slots: { day: DayOfWeek; time: string }[] = [];
    const shiftRanges: number[][] = [];
    if (preferredShift !== 'turnoB') shiftRanges.push([timeToMinutes(settings.shift_a_start), timeToMinutes(settings.shift_a_end)]);
    if (preferredShift !== 'turnoA') shiftRanges.push([timeToMinutes(settings.shift_b_start), timeToMinutes(settings.shift_b_end)]);

    for (const day of settings.work_days as DayOfWeek[]) {
      for (const [sStart, sEnd] of shiftRanges) {
        for (let t = sStart; t + duration <= sEnd; t += duration + BUFFER) {
          const timeStr = minutesToTime(t);
          const occupied = existingClients.some(c =>
            c.id !== clientId && c.videomaker_id === selectedVm && c.fixed_day === day && c.fixed_time === timeStr
          );
          if (!occupied) slots.push({ day, time: timeStr });
        }
      }
    }
    return slots;
  }, [selectedVm, settings, existingClients, preferredShift, clientId]);

  // Count available slots per day to support stacking
  const slotsPerDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of availableSlots) {
      map.set(s.day, (map.get(s.day) || 0) + 1);
    }
    return map;
  }, [availableSlots]);

  const slotsForDay = useMemo(() => availableSlots.filter(s => s.day === fixedDay), [availableSlots, fixedDay]);
  const backupSlotsForDay = useMemo(() => availableSlots.filter(s => s.day === backupDay && s.day !== fixedDay), [availableSlots, backupDay, fixedDay]);

  const bestDays = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of availableSlots) {
      map.set(s.day, (map.get(s.day) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([day, count]) => ({ day: day as DayOfWeek, count }));
  }, [availableSlots]);

  const toggleExtraType = (t: string) => {
    setExtraTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleSave = async () => {
    if (!acceptTerms) { toast.error('Aceite os termos para continuar'); return; }
    const needsTime = planHasRecording && !fullShiftRecording;
    if (planHasRecording && (!selectedVm || !fixedDay || (needsTime && !fixedTime))) { toast.error('Preencha todos os campos obrigatórios'); return; }
    if (photoPreference === 'fotos_reais' && !hasPhotoShoot && !acceptsPhotoShootCost) {
      toast.error('Aceite o agendamento do ensaio fotográfico para continuar'); return;
    }
    setSaving(true);
    try {
      const url = `https://agenciapulse.tech/api/client-onboarding`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          videomaker_id: selectedVm,
          fixed_day: fixedDay,
          fixed_time: fullShiftRecording ? (preferredShift === 'turnoB' ? settings?.shift_b_start : settings?.shift_a_start) || '08:30' : fixedTime,
          backup_day: backupDay,
          backup_time: backupTime || '14:00',
          monthly_recordings: monthlyRecordings,
          selected_weeks: selectedWeeks,
          accepts_extra: acceptsExtra,
          extra_content_types: extraTypes,
          extra_client_appears: extraAppears,
          photo_preference: photoPreference,
          has_photo_shoot: hasPhotoShoot,
          accepts_photo_shoot_cost: acceptsPhotoShootCost,
          full_shift_recording: fullShiftRecording,
          preferred_shift: fullShiftRecording ? (preferredShift === 'turnoB' ? 'tarde' : 'manha') : (preferredShift === 'turnoA' ? 'manha' : preferredShift === 'turnoB' ? 'tarde' : 'manha'),
          briefing_data: isNewClient ? briefing : undefined,
        }),
      });
      const data = await response.json();
      if (data.error) { toast.error(data.error); return; }
      setCompleted(true);
      toast.success('Preferências salvas com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Carregando...</div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold">Cliente não encontrado</p>
        <p className="text-sm text-muted-foreground">O link pode estar incorreto ou expirado.</p>
      </div>
    </div>
  );

  if (completed) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Sonner />
      <div className="text-center space-y-4 max-w-md mx-auto px-6">
        <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} className="text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Tudo certo, {client.responsible_person}!</h1>
        <p className="text-muted-foreground">Suas preferências de gravação foram salvas. Nossa equipe vai preparar tudo e entrar em contato em breve.</p>
        <img src="/pulse_header.png" alt="Pulse Growth Marketing" className="h-8 mx-auto opacity-60 mt-8" />
      </div>
    </div>
  );

  // Determine which features are available based on plan
  const planHasRecording = plan?.has_recording !== false;
  const planHasPhotography = plan?.has_photography !== false;
  const planArtsQty = plan ? (plan as any).arts_qty : 1;
  const showPhotoStep = planHasPhotography && planArtsQty > 0;

  // Dynamic steps based on client type and plan features
  const STEPS = [
    ...(planHasRecording ? [
      { icon: Camera, label: 'Videomaker' },
      { icon: Calendar, label: 'Agenda' },
    ] : []),
    ...(showPhotoStep ? [{ icon: ImageIcon, label: 'Fotos' }] : []),
    ...(isNewClient ? [{ icon: FileText, label: 'Briefing' }] : []),
    { icon: Sparkles, label: planHasRecording ? 'Extra & Termos' : 'Termos' },
  ];

  // Calculate step indices dynamically
  const VM_STEP = planHasRecording ? 0 : -1;
  const AGENDA_STEP = planHasRecording ? 1 : -1;
  const PHOTO_STEP = showPhotoStep ? (planHasRecording ? 2 : 0) : -1;
  const BRIEFING_STEP = isNewClient ? (PHOTO_STEP >= 0 ? PHOTO_STEP + 1 : (planHasRecording ? 2 : 0)) : -1;
  const EXTRA_STEP = STEPS.length - 1;
  const LAST_STEP = STEPS.length - 1;

  const canProceed = () => {
    if (step === VM_STEP) return !!selectedVm;
    if (step === AGENDA_STEP) return fullShiftRecording ? (!!fixedDay && preferredShift !== 'ambos') : !!fixedTime;
    if (step === PHOTO_STEP) {
      if (photoPreference === 'fotos_reais' && !hasPhotoShoot && !acceptsPhotoShootCost) return false;
      return true;
    }
    if (step === BRIEFING_STEP) return !!briefing.niche && !!briefing.differentials;
    if (step === EXTRA_STEP) return acceptTerms;
    return true;
  };

  return (
    <div className="min-h-screen bg-background">
      <Sonner />
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <img src="/pulse_header.png" alt="Pulse Growth Marketing" className="h-8" />
          <Badge variant="secondary" className="text-xs">{client.company_name}</Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold">Olá, {client.responsible_person}! 👋</h1>
          <p className="text-sm text-muted-foreground">Configure suas preferências em poucos passos.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                <div className={`flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors w-full justify-center ${
                  i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  <Icon size={13} className="shrink-0" />
                  <span className="truncate">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Step 0: Videomaker Selection */}
        {step === VM_STEP && planHasRecording && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-sm font-semibold flex items-center gap-2 mb-1">
                <Camera size={16} className="text-primary" /> Escolha seu Videomaker
              </p>
              <p className="text-xs text-muted-foreground">
                Selecione o profissional que será responsável pelas suas gravações.
              </p>
            </div>

            <div className="grid gap-3">
              {videomakers.map(vm => (
                <button
                  key={vm.id}
                  onClick={() => setSelectedVm(vm.id)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                    selectedVm === vm.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  {vm.avatar_url ? (
                    <img src={vm.avatar_url} alt={vm.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <User size={24} className="text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{vm.display_name || vm.name}</p>
                    {vm.job_title && <p className="text-xs text-primary font-medium">{vm.job_title}</p>}
                    {vm.bio && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{vm.bio}</p>}
                  </div>
                  {selectedVm === vm.id && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <CheckCircle2 size={16} className="text-primary-foreground" />
                    </div>
                  )}
                </button>
              ))}
              {videomakers.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum videomaker disponível no momento.</p>
              )}
            </div>

            {/* Monthly recordings */}
            {selectedVm && (() => {
              const maxWeeks = plan 
                ? (plan.name.toLowerCase().includes('booster') || plan.name.toLowerCase().includes('boost') ? 3 
                  : plan.name.toLowerCase().includes('premium') ? 4 
                  : plan.recording_sessions || 4)
                : client.monthly_recordings || 4;
              
              const frequencyOptions = Array.from({ length: Math.min(maxWeeks, 4) }, (_, i) => i + 1);
              
              const toggleWeek = (week: number) => {
                if (selectedWeeks.includes(week)) {
                  if (selectedWeeks.length > 1) {
                    setSelectedWeeks(prev => prev.filter(w => w !== week).sort());
                  }
                } else if (selectedWeeks.length < monthlyRecordings) {
                  setSelectedWeeks(prev => [...prev, week].sort());
                }
              };
              
              const WEEK_LABELS = ['1ª Semana', '2ª Semana', '3ª Semana', '4ª Semana'];
              
              return (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <Video size={16} className="text-primary" /> Quantas gravações por mês?
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Cada gravação tem duração de <strong className="text-foreground">1h30min</strong>. Você pode agendar várias no mesmo dia.
                    </p>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(frequencyOptions.length, 4)}, 1fr)` }}>
                      {frequencyOptions.map(n => (
                        <button
                          key={n}
                          onClick={() => {
                            setMonthlyRecordings(n);
                            if (n <= 4) {
                              setSelectedWeeks(prev => prev.slice(0, n));
                            }
                          }}
                          className={`p-3 rounded-xl border-2 text-center transition-all ${
                            monthlyRecordings === n
                              ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <span className="text-lg font-bold block">{n}x</span>
                          <span className="text-[10px] text-muted-foreground">por mês</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock size={10} /> {monthlyRecordings} gravação(ões) × 1h30min = {Math.floor(monthlyRecordings * 90 / 60)}h{(monthlyRecordings * 90) % 60 > 0 ? `${(monthlyRecordings * 90) % 60}min` : ''}/mês
                    </p>
                  </div>

                  {/* Concentrated Recording Option - shown when 1x/month */}
                  {monthlyRecordings === 1 && (
                    <div className={`p-4 rounded-xl border-2 transition-all space-y-3 ${
                      fullShiftRecording 
                        ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/30' 
                        : 'border-amber-400/60 bg-gradient-to-br from-amber-50/80 to-orange-50/50 dark:from-amber-900/10 dark:to-orange-900/5'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          fullShiftRecording ? 'bg-primary/20' : 'bg-amber-400/20'
                        }`}>
                          <Zap size={20} className={fullShiftRecording ? 'text-primary' : 'text-amber-600'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold">⚡ Gravação Concentrada</p>
                            <Badge className="bg-amber-500 text-white border-0 text-[9px] px-1.5 py-0">RECOMENDADO</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Para sua <strong className="text-foreground">comodidade</strong>, podemos gravar todo o conteúdo do mês em um <strong className="text-foreground">único período</strong> (manhã ou tarde). 
                            Assim você evita desgastes no fluxo de trabalho diário da sua operação!
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-lg bg-background/60 border border-border/50">
                        <Switch
                          checked={fullShiftRecording}
                          onCheckedChange={(checked) => {
                            setFullShiftRecording(checked);
                            if (checked) {
                              setPreferredShift('turnoA');
                            } else {
                              setPreferredShift('ambos');
                            }
                          }}
                        />
                        <div>
                          <p className="text-xs font-semibold">{fullShiftRecording ? '✅ Gravação concentrada ativada!' : 'Ativar gravação concentrada'}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {fullShiftRecording 
                              ? 'Você escolherá o período (manhã ou tarde) no próximo passo.' 
                              : 'Reservamos um período inteiro para gravar tudo de uma vez.'}
                          </p>
                        </div>
                      </div>

                      {fullShiftRecording && (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                            <Star size={14} className="text-primary mx-auto mb-1" />
                            <p className="text-[10px] font-semibold">Mais prático</p>
                            <p className="text-[9px] text-muted-foreground">Tudo em 1 dia</p>
                          </div>
                          <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                            <TrendingUp size={14} className="text-primary mx-auto mb-1" />
                            <p className="text-[10px] font-semibold">Mais produtivo</p>
                            <p className="text-[9px] text-muted-foreground">Sem interrupções</p>
                          </div>
                          <div className="p-2 rounded-lg bg-background/80 border border-border/50">
                            <Clock size={14} className="text-primary mx-auto mb-1" />
                            <p className="text-[10px] font-semibold">Otimize tempo</p>
                            <p className="text-[9px] text-muted-foreground">Fluxo contínuo</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {monthlyRecordings > 1 && (
                    <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Calendar size={16} className="text-primary" /> Em quais semanas do mês prefere gravar?
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Selecione até {Math.min(monthlyRecordings, 4)} semana{monthlyRecordings > 1 ? 's' : ''}. 
                        {monthlyRecordings > 4 && ' Se tiver mais gravações que semanas, elas serão empilhadas no mesmo dia.'}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map(n => (
                          <button
                            key={n}
                            onClick={() => toggleWeek(n)}
                            className={`p-3 rounded-xl border-2 text-center transition-all ${
                              selectedWeeks.includes(n)
                                ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                                : selectedWeeks.length >= Math.min(monthlyRecordings, 4)
                                  ? 'border-border opacity-40 cursor-not-allowed'
                                  : 'border-border hover:border-primary/40'
                            }`}
                          >
                            <span className="text-lg font-bold block">{n}ª</span>
                            <span className="text-[10px] text-muted-foreground">semana</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        {selectedWeeks.length}/{Math.min(monthlyRecordings, 4)} selecionada{selectedWeeks.length > 1 ? 's' : ''} 
                        {selectedWeeks.length > 0 && <> — {selectedWeeks.map(w => WEEK_LABELS[w-1]).join(', ')}</>}
                      </p>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-accent/50 border border-accent text-xs text-muted-foreground">
                    <p>
                      <strong className="text-foreground">💡 Importante:</strong> Você pode concentrar várias gravações no mesmo dia, 
                      desde que haja disponibilidade na agenda do videomaker. Cada sessão ocupa <strong>1h30min + 30min de intervalo</strong>.
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Step 1: Schedule */}
        {step === AGENDA_STEP && planHasRecording && settings && (
          <div className="space-y-5">
            {/* Concentrated recording: simplified shift selection */}
            {fullShiftRecording ? (
              <>
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap size={18} className="text-primary" />
                    <p className="text-sm font-bold">Gravação Concentrada</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Escolha o <strong className="text-foreground">dia da semana</strong> e o <strong className="text-foreground">período</strong> que deseja reservar. 
                    Nosso videomaker ficará dedicado exclusivamente a você durante todo o período escolhido.
                  </p>
                </div>

                {/* Day selection */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Calendar size={16} className="text-primary" /> Dia da gravação
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {(settings.work_days as DayOfWeek[]).map(d => {
                      const count = availableSlots.filter(s => s.day === d).length;
                      return (
                        <button
                          key={d}
                          onClick={() => setFixedDay(d)}
                          className={`p-3 rounded-xl border-2 text-center transition-all ${
                            fixedDay === d ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <span className="text-xs font-bold block">{DAY_LABELS[d]}</span>
                          <span className="text-[9px] text-muted-foreground">{count} vagas</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Shift selection */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Qual período?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPreferredShift('turnoA')}
                      className={`p-4 rounded-xl border-2 text-center transition-all space-y-1 ${
                        preferredShift === 'turnoA' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <span className="text-2xl block">☀️</span>
                      <span className="text-sm font-bold block">Manhã</span>
                      <span className="text-xs text-muted-foreground block">{settings.shift_a_start} – {settings.shift_a_end}</span>
                      <span className="text-[10px] text-primary font-medium block">~{Math.floor((timeToMinutes(settings.shift_a_end) - timeToMinutes(settings.shift_a_start)) / 60)}h de gravação</span>
                    </button>
                    <button
                      onClick={() => setPreferredShift('turnoB')}
                      className={`p-4 rounded-xl border-2 text-center transition-all space-y-1 ${
                        preferredShift === 'turnoB' ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <span className="text-2xl block">🌙</span>
                      <span className="text-sm font-bold block">Tarde</span>
                      <span className="text-xs text-muted-foreground block">{settings.shift_b_start} – {settings.shift_b_end}</span>
                      <span className="text-[10px] text-primary font-medium block">~{Math.floor((timeToMinutes(settings.shift_b_end) - timeToMinutes(settings.shift_b_start)) / 60)}h de gravação</span>
                    </button>
                  </div>
                </div>

                {/* Benefit reminder */}
                <div className="p-3 rounded-lg bg-accent/50 border border-accent text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    <Star size={12} className="text-primary" /> Vantagens da gravação concentrada:
                  </p>
                  <ul className="space-y-0.5 ml-4 list-disc">
                    <li>Todo conteúdo do mês gravado em <strong className="text-foreground">um único dia</strong></li>
                    <li>Sem interrupções no fluxo de trabalho diário da sua empresa</li>
                    <li>Videomaker dedicado exclusivamente para você no período</li>
                    <li>Maior variedade de conteúdo com continuidade criativa</li>
                  </ul>
                </div>

                {/* Backup day */}
                <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Shield size={14} className="text-primary" /> Dia de Backup
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Caso precise cancelar, escolha <strong>1 dia de backup</strong> sujeito à disponibilidade.
                  </p>
                  <div className="space-y-1">
                    <Label>Dia Backup</Label>
                    <Select value={backupDay} onValueChange={v => { setBackupDay(v as DayOfWeek); setBackupTime(''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(settings.work_days as string[]).filter(d => d !== fixedDay).map(d => (
                          <SelectItem key={d} value={d}>{DAY_LABELS[d]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : (
              /* Normal flow: shift preference + day + time */
              <>
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                  <p className="text-sm font-semibold">Em qual período prefere gravar?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: 'turnoA' as const, icon: '☀️', label: 'Manhã', desc: `${settings.shift_a_start} – ${settings.shift_a_end}` },
                      { key: 'turnoB' as const, icon: '🌙', label: 'Tarde', desc: `${settings.shift_b_start} – ${settings.shift_b_end}` },
                      { key: 'ambos' as const, icon: '🔄', label: 'Ambos', desc: 'Qualquer horário' },
                    ] as const).map(s => (
                      <button
                        key={s.key}
                        onClick={() => setPreferredShift(s.key)}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          preferredShift === s.key ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <span className="text-xs font-bold block">{s.icon} {s.label}</span>
                        <span className="text-[10px] text-muted-foreground block">{s.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {bestDays.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-primary flex items-center gap-2">
                      <Sparkles size={14} /> Melhores dias disponíveis
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {bestDays.map((bd, i) => (
                        <button
                          key={bd.day}
                          onClick={() => {
                            setFixedDay(bd.day);
                            const firstSlot = availableSlots.find(s => s.day === bd.day);
                            if (firstSlot) setFixedTime(firstSlot.time);
                          }}
                          className={`p-3 rounded-xl border-2 text-center transition-all ${
                            fixedDay === bd.day ? 'border-primary bg-primary/10' : 'border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10'
                          }`}
                        >
                          <span className="text-sm font-semibold block">{DAY_LABELS[bd.day]}</span>
                          <span className="text-xs text-muted-foreground">{bd.count} vagas livres</span>
                          {monthlyRecordings > 1 && bd.count >= monthlyRecordings && (
                            <Badge variant="secondary" className="mt-1 text-[10px] bg-primary/15 text-primary border-0">
                              Cabe {monthlyRecordings} gravações
                            </Badge>
                          )}
                          {monthlyRecordings <= 1 && <Badge variant="secondary" className="mt-1 text-[10px]">{i === 0 ? 'Melhor opção' : '2ª opção'}</Badge>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">Selecione o dia e horário fixo de gravação:</p>
                  
                  {/* Stacking info */}
                  {monthlyRecordings > 1 && fixedDay && (
                    <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                      (slotsPerDay.get(fixedDay) || 0) >= monthlyRecordings 
                        ? 'bg-primary/5 border border-primary/20 text-primary' 
                        : 'bg-muted border border-border text-muted-foreground'
                    }`}>
                      <Calendar size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">
                          {(slotsPerDay.get(fixedDay) || 0) >= monthlyRecordings 
                            ? `✅ Este dia comporta todas as ${monthlyRecordings} gravações consecutivas!`
                            : `Este dia tem ${slotsPerDay.get(fixedDay) || 0} vaga(s) — para ${monthlyRecordings} gravações, distribua entre semanas diferentes.`
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Dia da Semana</Label>
                      <Select value={fixedDay} onValueChange={v => { setFixedDay(v as DayOfWeek); setFixedTime(''); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(settings.work_days as string[]).map(d => {
                            const count = availableSlots.filter(s => s.day === d).length;
                            const canStack = count >= monthlyRecordings;
                            return (
                              <SelectItem key={d} value={d}>
                                {DAY_LABELS[d]} ({count} vagas){canStack && monthlyRecordings > 1 ? ' ⭐' : ''}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Horário Inicial</Label>
                      {slotsForDay.length > 0 ? (
                        <Select value={fixedTime} onValueChange={setFixedTime}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {slotsForDay.map(s => (
                              <SelectItem key={s.time} value={s.time}>
                                <span className="flex items-center gap-1">
                                  <Clock size={12} /> {s.time} – {minutesToTime(timeToMinutes(s.time) + RECORDING_DURATION)}
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

                <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Shield size={14} className="text-primary" /> Dia de Backup
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Caso precise cancelar, escolha <strong>1 dia de backup</strong> sujeito à disponibilidade.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Dia Backup</Label>
                      <Select value={backupDay} onValueChange={v => { setBackupDay(v as DayOfWeek); setBackupTime(''); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(settings.work_days as string[]).filter(d => d !== fixedDay).map(d => {
                            const count = availableSlots.filter(s => s.day === d).length;
                            return <SelectItem key={d} value={d}>{DAY_LABELS[d]} ({count} vagas)</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Horário Backup</Label>
                      {backupSlotsForDay.length > 0 ? (
                        <Select value={backupTime} onValueChange={setBackupTime}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {backupSlotsForDay.map(s => (
                              <SelectItem key={s.time} value={s.time}>
                                <span className="flex items-center gap-1"><Clock size={12} /> {s.time}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3">
                          <span className="text-sm text-muted-foreground">Sem vagas</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Photo Preferences */}
        {step === PHOTO_STEP && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-sm font-semibold flex items-center gap-2 mb-1">
                <ImageIcon size={16} className="text-primary" /> Fotos para Artes
              </p>
              <p className="text-xs text-muted-foreground">
                As artes (posts, banners, criativos) da sua marca podem usar fotos reais suas ou da equipe. Defina sua preferência abaixo.
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Como você prefere que as artes sejam feitas?</Label>
              <RadioGroup value={photoPreference} onValueChange={setPhotoPreference} className="space-y-2">
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  photoPreference === 'fotos_reais' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}>
                  <RadioGroupItem value="fotos_reais" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Quero fotos reais (minhas ou da equipe)</p>
                    <p className="text-xs text-muted-foreground">As artes serão criadas com fotos suas, dos colaboradores ou do ambiente da empresa.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  photoPreference === 'banco_imagens' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}>
                  <RadioGroupItem value="banco_imagens" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Pode usar banco de imagens</p>
                    <p className="text-xs text-muted-foreground">Usaremos fotos profissionais de bancos de imagem que combinem com sua marca.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  photoPreference === 'nao_precisa' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                }`}>
                  <RadioGroupItem value="nao_precisa" className="mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Não preciso de fotos nas artes</p>
                    <p className="text-xs text-muted-foreground">Artes com design gráfico, ícones e elementos visuais sem fotos.</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {photoPreference === 'fotos_reais' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
                  <Label className="text-sm font-semibold">Você já possui ensaio fotográfico para nos enviar?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setHasPhotoShoot(true)}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        hasPhotoShoot ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <span className="text-sm font-semibold block">✅ Sim, tenho</span>
                      <span className="text-xs text-muted-foreground">Vou enviar as fotos</span>
                    </button>
                    <button
                      onClick={() => { setHasPhotoShoot(false); setAcceptsPhotoShootCost(false); }}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        !hasPhotoShoot ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <span className="text-sm font-semibold block">❌ Não tenho</span>
                      <span className="text-xs text-muted-foreground">Preciso agendar</span>
                    </button>
                  </div>
                </div>

                {!hasPhotoShoot && (
                  <div className="p-4 rounded-xl border-2 border-warning/40 bg-warning/5 space-y-3">
                    <div className="flex gap-2 items-start">
                      <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold">Ensaio Fotográfico</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Para usar fotos reais nas artes, é necessário um ensaio fotográfico profissional. 
                          Vamos agendar com nosso fotógrafo parceiro. <strong>Este serviço tem custo adicional</strong> que será informado pela equipe.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2 border-t border-warning/20">
                      <Checkbox
                        id="photo-cost"
                        checked={acceptsPhotoShootCost}
                        onCheckedChange={v => setAcceptsPhotoShootCost(v === true)}
                      />
                      <label htmlFor="photo-cost" className="text-sm font-medium cursor-pointer">
                        Aceito agendar o ensaio fotográfico (custo adicional do fotógrafo)
                      </label>
                    </div>
                  </div>
                )}

                {hasPhotoShoot && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
                    <p><strong className="text-foreground">📸 Ótimo!</strong> Após concluir o onboarding, envie as fotos do ensaio para nossa equipe pelo WhatsApp ou pelo link do Google Drive que compartilharemos.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Briefing Step (new clients only) */}
        {step === BRIEFING_STEP && isNewClient && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-sm font-semibold flex items-center gap-2 mb-1">
                <FileText size={16} className="text-primary" /> Briefing do seu Negócio
              </p>
              <p className="text-xs text-muted-foreground">
                Responda com calma — vamos usar essas informações para criar a melhor estratégia para sua marca. Quanto mais detalhes, melhor!
              </p>
            </div>

            {/* Section: Sobre o Negócio */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">🏢 Sobre o seu Negócio</h3>

              <div className="space-y-2">
                <Label className="text-sm">Qual seu nicho de atuação? <span className="text-destructive">*</span></Label>
                <Input
                  value={briefing.niche}
                  onChange={e => updateBriefing('niche', e.target.value)}
                  placeholder="Ex: Odontologia, Advocacia, Restaurante..."
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Qual o seu principal diferencial? <span className="text-destructive">*</span></Label>
                <Textarea
                  value={briefing.differentials}
                  onChange={e => updateBriefing('differentials', e.target.value)}
                  placeholder="O que te diferencia dos concorrentes?"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Quais produtos/serviços deseja divulgar?</Label>
                <Textarea
                  value={briefing.products_services}
                  onChange={e => updateBriefing('products_services', e.target.value)}
                  placeholder="Liste os principais produtos ou serviços"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Forma de atendimento</Label>
                <RadioGroup value={briefing.service_mode} onValueChange={v => updateBriefing('service_mode', v)} className="flex gap-3">
                  {['Digital', 'Presencial', 'Ambos'].map(opt => (
                    <label key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      briefing.service_mode === opt ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                    }`}>
                      <RadioGroupItem value={opt} />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Cidades que deseja atingir</Label>
                <Input
                  value={briefing.target_cities}
                  onChange={e => updateBriefing('target_cities', e.target.value)}
                  placeholder="Ex: São Paulo, Campinas, região metropolitana"
                  maxLength={300}
                />
              </div>
            </div>

            {/* Section: Identidade & Redes */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">📱 Identidade & Redes Sociais</h3>

              <div className="space-y-2">
                <Label className="text-sm">Já possui identidade visual (logo, cores, fontes)?</Label>
                <RadioGroup value={briefing.has_identity} onValueChange={v => updateBriefing('has_identity', v)} className="flex gap-3">
                  {['Sim', 'Não'].map(opt => (
                    <label key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      briefing.has_identity === opt ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                    }`}>
                      <RadioGroupItem value={opt} />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Link do site (se tiver)</Label>
                <Input
                  value={briefing.website}
                  onChange={e => updateBriefing('website', e.target.value)}
                  placeholder="https://www.seusite.com.br"
                  maxLength={300}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Links das redes sociais atuais</Label>
                <Textarea
                  value={briefing.social_links}
                  onChange={e => updateBriefing('social_links', e.target.value)}
                  placeholder="Instagram, Facebook, TikTok, YouTube... (um por linha)"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Objetivo com as redes sociais</Label>
                <div className="flex flex-wrap gap-2">
                  {['Captar clientes', 'Aumentar visibilidade', 'Gerar autoridade', 'Iniciar novo negócio', 'Manter presença'].map(obj => (
                    <button
                      key={obj}
                      onClick={() => toggleBriefingArray('social_objectives', obj)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        briefing.social_objectives.includes(obj) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {obj}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Você se sente confortável aparecendo em vídeos/stories?</Label>
                <RadioGroup value={briefing.comfortable_on_camera} onValueChange={v => updateBriefing('comfortable_on_camera', v)} className="flex gap-2 flex-wrap">
                  {['Sim', 'Não', 'Ainda não, mas quero melhorar'].map(opt => (
                    <label key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                      briefing.comfortable_on_camera === opt ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                    }`}>
                      <RadioGroupItem value={opt} />
                      {opt}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Temas que deseja abordar nas redes</Label>
                <Textarea
                  value={briefing.focus_topics}
                  onChange={e => updateBriefing('focus_topics', e.target.value)}
                  placeholder="Assuntos importantes para o seu público"
                  rows={2}
                  maxLength={500}
                />
              </div>
            </div>

            {/* Section: Público & Concorrentes */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">👥 Público & Concorrentes</h3>

              <div className="space-y-2">
                <Label className="text-sm">Faixa etária do público-alvo</Label>
                <div className="flex flex-wrap gap-2">
                  {['18-24', '25-34', '35-45', '45+'].map(age => (
                    <button
                      key={age}
                      onClick={() => toggleBriefingArray('target_age', age)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        briefing.target_age.includes(age) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {age} anos
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Classe social do público</Label>
                <RadioGroup value={briefing.target_class} onValueChange={v => updateBriefing('target_class', v)} className="flex gap-2 flex-wrap">
                  {['A', 'B', 'C', 'D', 'Misto'].map(opt => (
                    <label key={opt} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                      briefing.target_class === opt ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'
                    }`}>
                      <RadioGroupItem value={opt} />
                      Classe {opt}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Principais concorrentes (nome e Instagram)</Label>
                <Textarea
                  value={briefing.competitors}
                  onChange={e => updateBriefing('competitors', e.target.value)}
                  placeholder="Liste os 3 principais concorrentes"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Descreva seu cliente ideal</Label>
                <Textarea
                  value={briefing.ideal_client}
                  onChange={e => updateBriefing('ideal_client', e.target.value)}
                  placeholder="Como seria o cliente perfeito do seu negócio?"
                  rows={2}
                  maxLength={500}
                />
              </div>
            </div>

            {/* Section: Tom de Comunicação */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">🎯 Tom de Comunicação</h3>

              <div className="space-y-2">
                <Label className="text-sm">Como gostaria que sua marca fosse reconhecida?</Label>
                <Textarea
                  value={briefing.brand_voice}
                  onChange={e => updateBriefing('brand_voice', e.target.value)}
                  placeholder="Ex: Profissional e acessível, divertido e próximo..."
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Como NÃO gostaria que fosse reconhecida?</Label>
                <Textarea
                  value={briefing.avoid_voice}
                  onChange={e => updateBriefing('avoid_voice', e.target.value)}
                  placeholder="O que deve ser evitado na comunicação?"
                  rows={2}
                  maxLength={500}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Algo mais que devemos saber?</Label>
                <Textarea
                  value={briefing.additional_info}
                  onChange={e => updateBriefing('additional_info', e.target.value)}
                  placeholder="Informações extras, história da empresa, curiosidades..."
                  rows={3}
                  maxLength={1000}
                />
              </div>
            </div>

            {/* Section: Acesso */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">🔐 Acesso às Redes</h3>
              <p className="text-xs text-muted-foreground">Precisamos do acesso para gerenciar e publicar conteúdo. Seus dados estão seguros.</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">Login do Instagram</Label>
                  <Input
                    value={briefing.instagram_login}
                    onChange={e => updateBriefing('instagram_login', e.target.value)}
                    placeholder="Seu login"
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Senha do Instagram</Label>
                  <Input
                    type="password"
                    value={briefing.instagram_password}
                    onChange={e => updateBriefing('instagram_password', e.target.value)}
                    placeholder="Sua senha"
                    maxLength={100}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Last Step: Extra content + Terms */}
        {step === EXTRA_STEP && (
           <div className="space-y-5">
            {planHasRecording && (
            <>
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> Conteúdo Extra
              </p>
              <p className="text-xs text-muted-foreground">
                Caso algum videomaker tenha vaga livre, podemos enviar um profissional à sua empresa 
                <strong> sem aviso prévio</strong> para produzir conteúdo extra gratuitamente.
              </p>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <Switch checked={acceptsExtra} onCheckedChange={setAcceptsExtra} />
              <Label className="font-medium">Aceito receber conteúdo extra</Label>
            </div>

            {acceptsExtra && (
              <div className="p-4 rounded-xl bg-accent/50 border border-border space-y-4">
                <div className="space-y-2">
                  <Label>Que tipo de conteúdo extra você aceita?</Label>
                  <div className="flex gap-2">
                    {['reels', 'story', 'produto'].map(ct => (
                      <button
                        key={ct}
                        onClick={() => toggleExtraType(ct)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          extraTypes.includes(ct)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {CONTENT_TYPE_LABELS[ct]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={extraAppears} onCheckedChange={setExtraAppears} />
                  <Label>Tenho interesse em aparecer no conteúdo extra</Label>
                </div>

                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 flex gap-2 items-start">
                  <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    O conteúdo extra depende da disponibilidade e pode ser produzido por <strong>qualquer videomaker</strong> da agência.
                  </p>
                </div>
              </div>
            )}
            </>
            )}

            {/* Terms */}
            <div className="p-4 rounded-xl border-2 border-border space-y-3">
              <p className="text-sm font-semibold">Termos e Condições</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Ao aceitar, você concorda com os seguintes termos:</p>
                <ul className="list-disc pl-4 space-y-1">
                  {planHasRecording && <>
                    <li>O dia e horário fixo de gravação serão reservados exclusivamente para sua empresa.</li>
                    <li>Cancelamentos podem ser reagendados para o dia de backup, sujeito à disponibilidade.</li>
                    <li>O conteúdo extra (se aceito) será produzido sem aviso prévio.</li>
                    <li>A quantidade de gravações mensais pode ser ajustada com aviso prévio de 7 dias.</li>
                  </>}
                  {!planHasRecording && <>
                    <li>Os materiais brutos (vídeos, fotos) devem ser enviados pela sua empresa para edição.</li>
                    <li>Entregas de conteúdo editado seguem o prazo acordado no contrato.</li>
                    <li>Estratégias e roteiros serão entregues conforme a frequência contratada.</li>
                  </>}
                  {photoPreference === 'fotos_reais' && !hasPhotoShoot && planHasPhotography && (
                    <li className="text-warning font-medium">O ensaio fotográfico tem custo adicional e será agendado pela equipe.</li>
                  )}
                </ul>
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Checkbox
                  id="terms"
                  checked={acceptTerms}
                  onCheckedChange={v => setAcceptTerms(v === true)}
                />
                <label htmlFor="terms" className="text-sm font-medium cursor-pointer">
                  Li e aceito todos os termos acima
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-2 pb-8">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-1">
              <ChevronLeft size={14} /> Voltar
            </Button>
          )}
          {step < LAST_STEP ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              className="ml-auto gap-1"
              disabled={!canProceed()}
            >
              Próximo <ChevronRight size={14} />
            </Button>
          ) : (
            <Button onClick={handleSave} className="ml-auto gap-1" disabled={saving || !acceptTerms}>
              <CheckCircle2 size={14} /> {saving ? 'Salvando...' : 'Confirmar Preferências'}
            </Button>
          )}
        </div>

        <div className="text-center pb-6">
          <img src="/pulse_header.png" alt="Pulse Growth Marketing" className="h-6 mx-auto opacity-40" />
        </div>
      </div>
    </div>
  );
}

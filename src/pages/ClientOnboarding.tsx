import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, ChevronLeft, ChevronRight, Video, Calendar, Shield, Sparkles, Clock, User, Camera, AlertTriangle } from 'lucide-react';
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
  const [plan, setPlan] = useState<{ id: string; name: string; recording_sessions: number } | null>(null);

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
  const [acceptTerms, setAcceptTerms] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const fetchData = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-onboarding?clientId=${clientId}`;
        const response = await fetch(url, {
          headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }
        });
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
        if (data.client.selected_weeks?.length) setSelectedWeeks(data.client.selected_weeks);
        if (data.client.fixed_day) setFixedDay(data.client.fixed_day);
        if (data.client.fixed_time) setFixedTime(data.client.fixed_time);
        if (data.client.backup_day) setBackupDay(data.client.backup_day);
        if (data.client.backup_time) setBackupTime(data.client.backup_time);
        if (data.client.accepts_extra) setAcceptsExtra(data.client.accepts_extra);
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

  // Compute available slots for selected videomaker
  const availableSlots = useMemo(() => {
    if (!selectedVm || !settings) return [];
    const duration = settings.recording_duration;
    const slots: { day: DayOfWeek; time: string }[] = [];
    const shiftRanges: number[][] = [];
    if (preferredShift !== 'turnoB') shiftRanges.push([timeToMinutes(settings.shift_a_start), timeToMinutes(settings.shift_a_end)]);
    if (preferredShift !== 'turnoA') shiftRanges.push([timeToMinutes(settings.shift_b_start), timeToMinutes(settings.shift_b_end)]);

    for (const day of settings.work_days as DayOfWeek[]) {
      for (const [sStart, sEnd] of shiftRanges) {
        for (let t = sStart; t + duration <= sEnd; t += duration + 30) {
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

  const slotsForDay = useMemo(() => availableSlots.filter(s => s.day === fixedDay), [availableSlots, fixedDay]);
  const backupSlotsForDay = useMemo(() => availableSlots.filter(s => s.day === backupDay && s.day !== fixedDay), [availableSlots, backupDay, fixedDay]);

  // Group available slots by day for best suggestions
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
    if (!selectedVm || !fixedDay || !fixedTime) { toast.error('Preencha todos os campos obrigatórios'); return; }
    setSaving(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-onboarding`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          videomaker_id: selectedVm,
          fixed_day: fixedDay,
          fixed_time: fixedTime,
          backup_day: backupDay,
          backup_time: backupTime || '14:00',
          monthly_recordings: monthlyRecordings,
          accepts_extra: acceptsExtra,
          extra_content_types: extraTypes,
          extra_client_appears: extraAppears,
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

  const STEPS = [
    { icon: Camera, label: 'Videomaker' },
    { icon: Calendar, label: 'Agenda' },
    { icon: Sparkles, label: 'Extra & Termos' },
  ];

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
          <p className="text-sm text-muted-foreground">Configure suas preferências de gravação em poucos passos.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors w-full justify-center ${
                  i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  <Icon size={14} />
                  <span>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* Step 0: Videomaker Selection */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-sm font-semibold flex items-center gap-2 mb-1">
                <Camera size={16} className="text-primary" /> Escolha seu Videomaker
              </p>
              <p className="text-xs text-muted-foreground">
                Selecione o profissional que será responsável pelas suas gravações. Cada videomaker tem um estilo e especialidade.
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
            {selectedVm && (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Video size={16} className="text-primary" /> Quantas vezes por mês deseja gravar?
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => setMonthlyRecordings(n)}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          monthlyRecordings === n
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <span className="text-lg font-bold block">{n}x</span>
                        <span className="text-[10px] text-muted-foreground">/mês</span>
                      </button>
                    ))}
                  </div>
                  <div className="p-3 rounded-lg bg-accent/50 border border-accent text-xs text-muted-foreground">
                    <p>
                      <strong className="text-foreground">💡 Importante:</strong> Gravar menos vezes por mês <strong>não significa produzir menos conteúdo</strong>. 
                      Vamos otimizar cada sessão para extrair o máximo de material, sem interferir no fluxo da sua empresa. 
                      Menos visitas = menos interrupção na sua rotina, com a mesma qualidade e volume de entrega.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Schedule */}
        {step === 1 && settings && (
          <div className="space-y-5">
            {/* Preferred shift */}
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

            {/* Best day suggestions */}
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
                      <Badge variant="secondary" className="mt-1 text-[10px]">{i === 0 ? 'Melhor opção' : '2ª opção'}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Day and time selection */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Selecione o dia e horário fixo de gravação:</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Dia da Semana</Label>
                  <Select value={fixedDay} onValueChange={v => { setFixedDay(v as DayOfWeek); setFixedTime(''); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(settings.work_days as string[]).map(d => {
                        const count = availableSlots.filter(s => s.day === d).length;
                        return (
                          <SelectItem key={d} value={d}>
                            {DAY_LABELS[d]} ({count} vagas)
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Horário</Label>
                  {slotsForDay.length > 0 ? (
                    <Select value={fixedTime} onValueChange={setFixedTime}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {slotsForDay.map(s => (
                          <SelectItem key={s.time} value={s.time}>
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {s.time} – {minutesToTime(timeToMinutes(s.time) + (settings?.recording_duration || 90))}
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

            {/* Backup section */}
            <div className="p-4 rounded-xl bg-muted/50 border border-border space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Shield size={14} className="text-primary" /> Dia de Backup
              </p>
              <p className="text-xs text-muted-foreground">
                Caso precise cancelar a gravação no dia marcado, você pode escolher <strong>1 dia de backup na semana</strong> para 
                dar continuidade à entrega. Esse backup fica sujeito à disponibilidade de agenda. Se não houver espaço, a gravação 
                segue normalmente na próxima semana.
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
          </div>
        )}

        {/* Step 2: Extra content + Terms */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Extra content */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> Conteúdo Extra
              </p>
              <p className="text-xs text-muted-foreground">
                Caso algum videomaker tenha uma vaga livre na agenda, podemos enviar um profissional à sua empresa 
                <strong> sem aviso prévio</strong> para produzir conteúdo adicional gratuitamente. Escolha se deseja receber esse benefício.
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
                    O conteúdo extra depende da disponibilidade de agenda e pode ser produzido por <strong>qualquer videomaker disponível</strong> da agência.
                  </p>
                </div>
              </div>
            )}

            {/* Terms */}
            <div className="p-4 rounded-xl border-2 border-border space-y-3">
              <p className="text-sm font-semibold">Termos e Condições</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Ao aceitar, você concorda com os seguintes termos:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>O dia e horário fixo de gravação serão reservados exclusivamente para sua empresa.</li>
                  <li>Cancelamentos no dia da gravação podem ser reagendados para o dia de backup, sujeito à disponibilidade.</li>
                  <li>Se não houver vaga no backup, a gravação será realizada na semana seguinte no horário fixo.</li>
                  <li>O conteúdo extra (se aceito) será produzido sem aviso prévio, por qualquer profissional disponível.</li>
                  <li>A quantidade de gravações mensais pode ser ajustada com aviso prévio de 7 dias.</li>
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
          {step < 2 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              className="ml-auto gap-1"
              disabled={step === 0 ? !selectedVm : step === 1 ? !fixedTime : false}
            >
              Próximo <ChevronRight size={14} />
            </Button>
          ) : (
            <Button onClick={handleSave} className="ml-auto gap-1" disabled={saving || !acceptTerms}>
              <CheckCircle2 size={14} /> {saving ? 'Salvando...' : 'Confirmar Preferências'}
            </Button>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pb-6">
          <img src="/pulse_header.png" alt="Pulse Growth Marketing" className="h-6 mx-auto opacity-40" />
        </div>
      </div>
    </div>
  );
}

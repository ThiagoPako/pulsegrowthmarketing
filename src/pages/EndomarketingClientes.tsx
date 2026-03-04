import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useEndoClientes, useEndoAgendamentos, useEndoProfissionais, type EndoCliente } from '@/hooks/useEndomarketing';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plus, Building2, ArrowLeft, Edit2, Trash2, Clock, Calendar as CalIcon, FileText, Video, Users as UsersIcon } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CLIENT_COLORS, DAY_LABELS } from '@/types';
import { format, parseISO, isWithinInterval, startOfWeek, endOfWeek, addDays, getDay, addWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DAYS = [
  { value: 'segunda', label: 'Segunda' },
  { value: 'terca', label: 'Terça' },
  { value: 'quarta', label: 'Quarta' },
  { value: 'quinta', label: 'Quinta' },
  { value: 'sexta', label: 'Sexta' },
];

const DURATION_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h30' },
];

type FormStep = 'select_client' | 'plan_config' | 'details';

interface FormData {
  client_id: string;
  company_name: string;
  responsible_person: string;
  phone: string;
  color: string;
  active: boolean;
  stories_per_week: number;
  presence_days_per_week: number;
  selected_days: string[];
  session_duration: number;
  execution_type: string;
  plan_type: string;
  total_contracted_hours: number;
  notes: string;
  editorial: string;
  profissional_user_id: string;
  start_time: string;
}

const emptyForm: FormData = {
  client_id: '',
  company_name: '',
  responsible_person: '',
  phone: '',
  color: '217 91% 60%',
  active: true,
  stories_per_week: 5,
  presence_days_per_week: 3,
  selected_days: ['segunda', 'quarta', 'sexta'],
  session_duration: 60,
  execution_type: 'sozinho',
  plan_type: '',
  total_contracted_hours: 0,
  notes: '',
  editorial: '',
  profissional_user_id: '',
  start_time: '09:00',
};

export default function EndomarketingClientes() {
  const { clients: appClients, users } = useApp();
  const { clientes, addCliente, updateCliente, deleteCliente } = useEndoClientes();
  const { agendamentos, addAgendamento } = useEndoAgendamentos();
  const { profissionais, addProfissional } = useEndoProfissionais();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<EndoCliente | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [step, setStep] = useState<FormStep>('select_client');

  const detailId = searchParams.get('detail');
  const detailCliente = clientes.find(c => c.id === detailId);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  // Active clients from the main system that are NOT yet in endomarketing
  const availableClients = useMemo(() => {
    const endoClientIds = clientes.map(c => c.client_id).filter(Boolean);
    return appClients.filter(c => !endoClientIds.includes(c.id));
  }, [appClients, clientes]);

  const openCreate = () => {
    setEditingCliente(null);
    setForm(emptyForm);
    setStep('select_client');
    setDialogOpen(true);
  };

  const openEdit = (c: EndoCliente) => {
    setEditingCliente(c);
    setForm({
      client_id: c.client_id || '',
      company_name: c.company_name,
      responsible_person: c.responsible_person || '',
      phone: c.phone || '',
      color: c.color,
      active: c.active,
      stories_per_week: c.stories_per_week,
      presence_days_per_week: c.presence_days_per_week,
      selected_days: c.selected_days,
      session_duration: c.session_duration,
      execution_type: c.execution_type,
      plan_type: c.plan_type,
      total_contracted_hours: c.total_contracted_hours,
      notes: c.notes || '',
      editorial: c.editorial || '',
      profissional_user_id: '',
      start_time: '09:00',
    });
    setStep('plan_config');
    setDialogOpen(true);
  };

  const selectExistingClient = (clientId: string) => {
    const client = appClients.find(c => c.id === clientId);
    if (client) {
      setForm(prev => ({
        ...prev,
        client_id: client.id,
        company_name: client.companyName,
        responsible_person: client.responsiblePerson,
        phone: client.phone,
        color: client.color,
      }));
    }
    setStep('plan_config');
  };

  const selectNewClient = () => {
    setForm(prev => ({ ...prev, client_id: '' }));
    setStep('plan_config');
  };

  const selectPlanType = (planType: string) => {
    if (planType === 'gravacao_concentrada') {
      setForm(prev => ({
        ...prev,
        plan_type: planType,
        session_duration: 120,
        execution_type: 'com_videomaker',
        presence_days_per_week: 1,
        selected_days: prev.selected_days.length > 0 ? [prev.selected_days[0]] : ['segunda'],
      }));
    } else {
      setForm(prev => ({
        ...prev,
        plan_type: planType,
        session_duration: 60,
      }));
    }
    setStep('details');
  };

  const DAY_TO_JS: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  };

  const generateAgendamentos = async (clienteId: string, profissionalId: string) => {
    const weeks = 4;
    const today = new Date();
    
    for (let w = 0; w < weeks; w++) {
      const weekStart = startOfWeek(addWeeks(today, w), { weekStartsOn: 1 });
      for (const day of form.selected_days) {
        const jsDayNum = DAY_TO_JS[day];
        if (jsDayNum === undefined) continue;
        // Monday=0 offset in our week
        const dayOffset = jsDayNum === 0 ? 6 : jsDayNum - 1;
        const date = addDays(weekStart, dayOffset);
        // Skip past dates
        if (date < today) continue;
        const dateStr = format(date, 'yyyy-MM-dd');
        await addAgendamento({
          cliente_id: clienteId,
          profissional_id: profissionalId,
          date: dateStr,
          start_time: form.start_time,
          duration: form.session_duration,
          status: 'agendado',
          checklist: { stories: false, reels: false, institucional: false, estrategico: false },
        });
      }
    }
  };

  const ensureProfissional = async (userId: string): Promise<string> => {
    // Check if profissional already exists for this user
    const existing = profissionais.find(p => p.user_id === userId);
    if (existing) return existing.id;
    // Create profissional entry
    const { data } = await supabase
      .from('endomarketing_profissionais')
      .insert({ user_id: userId, active: true } as any)
      .select('id')
      .single();
    return data?.id || '';
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!form.plan_type) { toast.error('Selecione o tipo de plano'); return; }
    
    const payload: any = { ...form };
    delete payload.client_id;
    delete payload.profissional_user_id;
    delete payload.start_time;
    if (form.client_id) payload.client_id = form.client_id;

    if (editingCliente) {
      await updateCliente(editingCliente.id, payload);
      toast.success('Cliente atualizado');
    } else {
      if (!form.profissional_user_id) { toast.error('Selecione o profissional responsável'); return; }
      
      // Insert client and get ID
      const { data: newClient, error } = await supabase
        .from('endomarketing_clientes')
        .insert(payload)
        .select('id')
        .single();
      
      if (error || !newClient) {
        toast.error('Erro ao adicionar cliente');
        return;
      }

      // Ensure profissional exists
      const profId = await ensureProfissional(form.profissional_user_id);
      if (!profId) {
        toast.error('Erro ao configurar profissional');
        return;
      }

      // Auto-generate agendamentos for next 4 weeks
      await generateAgendamentos(newClient.id, profId);
      toast.success('Cliente cadastrado e agenda gerada para as próximas 4 semanas!');
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteCliente(id);
    toast.success('Cliente removido');
    if (detailId === id) setSearchParams({});
  };

  const toggleDay = (day: string) => {
    if (form.plan_type === 'gravacao_concentrada') {
      // Concentrada: only 1 day allowed
      setForm(prev => ({ ...prev, selected_days: [day] }));
    } else {
      setForm(prev => ({
        ...prev,
        selected_days: prev.selected_days.includes(day)
          ? prev.selected_days.filter(d => d !== day)
          : [...prev.selected_days, day],
      }));
    }
  };

  // ─── Detail view ───
  if (detailCliente) {
    const clientSchedules = agendamentos.filter(a => a.cliente_id === detailCliente.id);
    const weekSchedules = clientSchedules.filter(a => {
      try {
        return isWithinInterval(parseISO(a.date), { start: weekStart, end: weekEnd }) && a.status !== 'cancelado';
      } catch { return false; }
    });
    const completedCount = clientSchedules.filter(a => a.status === 'concluido').length;
    const cancelledCount = clientSchedules.filter(a => a.status === 'cancelado').length;
    const totalHoursExecuted = clientSchedules.filter(a => a.status === 'concluido').reduce((s, a) => s + a.duration, 0) / 60;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            <ArrowLeft size={16} className="mr-1" /> Voltar
          </Button>
          <h1 className="text-xl font-bold font-display" style={{ color: `hsl(${detailCliente.color})` }}>
            {detailCliente.company_name}
          </h1>
          <Button variant="outline" size="sm" onClick={() => openEdit(detailCliente)}>
            <Edit2 size={14} className="mr-1" /> Editar
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Responsável:</strong> {detailCliente.responsible_person || '–'}</p>
              <p><strong>Telefone:</strong> {detailCliente.phone || '–'}</p>
              <p><strong>Tipo:</strong> {detailCliente.plan_type === 'gravacao_concentrada' ? 'Gravação Concentrada' : 'Presencial Recorrente'}</p>
              <p><strong>Execução:</strong> {detailCliente.execution_type === 'com_videomaker' ? 'Com Videomaker' : 'Sozinho'}</p>
              <p><strong>Duração/sessão:</strong> {detailCliente.session_duration}min</p>
              <p><strong>Stories/semana:</strong> {detailCliente.stories_per_week}</p>
              <p><strong>Dias presenciais:</strong> {detailCliente.presence_days_per_week}</p>
              <p><strong>Horas contratadas:</strong> {detailCliente.total_contracted_hours}h</p>
              <div className="flex gap-1 flex-wrap">
                <strong>Dias fixos:</strong>
                {detailCliente.selected_days.map(d => (
                  <Badge key={d} variant="secondary" className="text-[10px]">{DAY_LABELS[d as keyof typeof DAY_LABELS] || d}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Performance</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Gravações realizadas:</strong> {completedCount}</p>
              <p><strong>Cancelamentos:</strong> {cancelledCount}</p>
              <p><strong>Taxa de cancelamento:</strong> {clientSchedules.length > 0 ? ((cancelledCount / clientSchedules.length) * 100).toFixed(0) : 0}%</p>
              <p><strong>Horas executadas:</strong> {totalHoursExecuted.toFixed(1)}h</p>
              <p><strong>Esta semana:</strong> {weekSchedules.length} agendamentos</p>
            </CardContent>
          </Card>
        </div>

        {/* Editorial */}
        {detailCliente.editorial && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText size={14} className="text-primary" /> Editorial do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{detailCliente.editorial}</p>
            </CardContent>
          </Card>
        )}

        {detailCliente.notes && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Observações Estratégicas</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">{detailCliente.notes}</p></CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Próximos Agendamentos</CardTitle></CardHeader>
          <CardContent>
            {clientSchedules.filter(a => a.date >= format(new Date(), 'yyyy-MM-dd') && a.status !== 'cancelado').length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
            ) : (
              <div className="space-y-2">
                {clientSchedules
                  .filter(a => a.date >= format(new Date(), 'yyyy-MM-dd') && a.status !== 'cancelado')
                  .slice(0, 10)
                  .map(a => (
                    <div key={a.id} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-secondary">
                      <CalIcon size={14} className="text-muted-foreground" />
                      <span>{format(parseISO(a.date), "dd/MM (EEE)", { locale: ptBR })}</span>
                      <Clock size={14} className="text-muted-foreground" />
                      <span>{a.start_time} ({a.duration}min)</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{a.status}</Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── List view ───
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display">Clientes Endomarketing</h1>
          <p className="text-sm text-muted-foreground">{clientes.length} clientes cadastrados</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus size={16} className="mr-1.5" /> Novo Cliente</Button>
      </div>

      {clientes.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum cliente cadastrado ainda.</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clientes.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card
                className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
                style={{ borderLeftColor: `hsl(${c.color})` }}
                onClick={() => setSearchParams({ detail: c.id })}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold truncate">{c.company_name}</h3>
                    <div className="flex gap-1">
                      <button onClick={e => { e.stopPropagation(); openEdit(c); }} className="p-1 hover:bg-secondary rounded"><Edit2 size={14} /></button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }} className="p-1 hover:bg-destructive/10 rounded text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>📱 {c.stories_per_week} stories/sem · 📅 {c.presence_days_per_week} dias/sem</p>
                    <p>⏱ {c.session_duration}min · {c.plan_type === 'gravacao_concentrada' ? '🎬 Concentrada' : '🏢 Recorrente'}</p>
                    {c.execution_type === 'com_videomaker' && <Badge variant="outline" className="text-[10px]">Com videomaker</Badge>}
                    {c.editorial && (
                      <div className="flex items-center gap-1 mt-1">
                        <FileText size={10} className="text-primary" />
                        <span className="text-[10px] text-primary">Editorial disponível</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ─── Create/Edit Dialog (Step-based) ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCliente ? 'Editar Cliente' : (
                step === 'select_client' ? '1. Selecionar Cliente' :
                step === 'plan_config' ? '2. Tipo de Gravação' :
                '3. Configuração do Plano'
              )}
            </DialogTitle>
            {!editingCliente && (
              <div className="flex gap-1 mt-2">
                {['select_client', 'plan_config', 'details'].map((s, i) => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${
                    (['select_client', 'plan_config', 'details'].indexOf(step) >= i) ? 'bg-primary' : 'bg-secondary'
                  }`} />
                ))}
              </div>
            )}
          </DialogHeader>

          {/* ── Step 1: Select client ── */}
          {step === 'select_client' && !editingCliente && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Selecione um cliente ativo do sistema ou cadastre um novo:</p>
              
              {availableClients.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Clientes ativos</Label>
                  <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                    {availableClients.map(c => (
                      <button key={c.id} onClick={() => selectExistingClient(c.id)}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-all text-left group">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: `hsl(${c.color})` }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{c.companyName}</p>
                          <p className="text-xs text-muted-foreground">{c.responsiblePerson} · {c.phone}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          Selecionar
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <button onClick={selectNewClient}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed border-border hover:border-primary hover:bg-accent/50 transition-all text-left">
                <Plus size={16} className="text-primary" />
                <div>
                  <p className="font-medium text-sm">Cadastrar novo cliente</p>
                  <p className="text-xs text-muted-foreground">Cliente ainda não está no sistema</p>
                </div>
              </button>
            </div>
          )}

          {/* ── Step 2: Plan type ── */}
          {step === 'plan_config' && (
            <div className="space-y-4">
              {/* Show selected client info */}
              {form.company_name && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${form.color})` }} />
                  <span className="text-sm font-medium">{form.company_name}</span>
                  {!editingCliente && (
                    <button onClick={() => setStep('select_client')} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Trocar</button>
                  )}
                </div>
              )}

              {/* If new client, show name input */}
              {!form.client_id && !editingCliente && (
                <div className="space-y-3">
                  <div>
                    <Label>Nome da empresa *</Label>
                    <Input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} placeholder="Nome do cliente" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Responsável</Label>
                      <Input value={form.responsible_person} onChange={e => setForm(p => ({ ...p, responsible_person: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Telefone</Label>
                      <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label>Cor</Label>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {CLIENT_COLORS.map(c => (
                        <button key={c.value} className={`w-6 h-6 rounded-full border-2 transition-transform ${form.color === c.value ? 'border-foreground scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: `hsl(${c.value})` }} onClick={() => setForm(p => ({ ...p, color: c.value }))} title={c.name} />
                      ))}
                    </div>
                  </div>
                  <Separator />
                </div>
              )}

              <p className="text-sm font-medium">Qual o tipo de gravação?</p>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => selectPlanType('presencial_recorrente')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    form.plan_type === 'presencial_recorrente' ? 'border-primary bg-accent/50' : 'border-border hover:border-primary/50'
                  }`}>
                  <UsersIcon size={24} className="text-primary mb-2" />
                  <p className="font-semibold text-sm">Presencial Recorrente</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Visitas presenciais em múltiplos dias da semana com duração flexível</p>
                </button>
                <button onClick={() => selectPlanType('gravacao_concentrada')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    form.plan_type === 'gravacao_concentrada' ? 'border-primary bg-accent/50' : 'border-border hover:border-primary/50'
                  }`}>
                  <Video size={24} className="text-primary mb-2" />
                  <p className="font-semibold text-sm">Gravação Concentrada</p>
                  <p className="text-[11px] text-muted-foreground mt-1">1 dia por semana · 2 horas fixas · Videomaker obrigatório</p>
                </button>
              </div>

              {editingCliente && form.plan_type && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setStep('details')}>Continuar →</Button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Details ── */}
          {step === 'details' && (
            <div className="space-y-4">
              {/* Summary header */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${form.color})` }} />
                <span className="text-sm font-medium">{form.company_name}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {form.plan_type === 'gravacao_concentrada' ? '🎬 Concentrada' : '🏢 Recorrente'}
                </Badge>
              </div>

              {/* Concentrada: fixed config shown */}
              {form.plan_type === 'gravacao_concentrada' && (
                <Card className="bg-accent/30 border-primary/20">
                  <CardContent className="p-3 space-y-2 text-sm">
                    <p className="font-medium flex items-center gap-2"><Clock size={14} /> Duração: <strong>2 horas</strong> (fixo)</p>
                    <p className="font-medium flex items-center gap-2"><Video size={14} /> Videomaker: <strong>Obrigatório</strong></p>
                    <p className="font-medium flex items-center gap-2"><CalIcon size={14} /> Frequência: <strong>1x por semana</strong></p>
                  </CardContent>
                </Card>
              )}

              {/* Day selection */}
              <div>
                <Label>{form.plan_type === 'gravacao_concentrada' ? 'Dia da gravação semanal' : 'Dias da semana'}</Label>
                <div className="flex gap-2 mt-1.5">
                  {DAYS.map(d => (
                    <button key={d.value} onClick={() => toggleDay(d.value)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                        form.selected_days.includes(d.value)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary text-muted-foreground border-transparent hover:border-primary/30'
                      }`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recorrente: extra options */}
              {form.plan_type === 'presencial_recorrente' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Duração por sessão</Label>
                      <Select value={String(form.session_duration)} onValueChange={v => setForm(p => ({ ...p, session_duration: +v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DURATION_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tipo de execução</Label>
                      <Select value={form.execution_type} onValueChange={v => setForm(p => ({ ...p, execution_type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sozinho">Sozinho</SelectItem>
                          <SelectItem value="com_videomaker">Com Videomaker</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Dias presenciais/semana</Label>
                      <Input type="number" min={1} max={5} value={form.presence_days_per_week} onChange={e => setForm(p => ({ ...p, presence_days_per_week: +e.target.value }))} />
                    </div>
                    <div>
                      <Label>Horas contratadas/mês</Label>
                      <Input type="number" min={0} step={0.5} value={form.total_contracted_hours} onChange={e => setForm(p => ({ ...p, total_contracted_hours: +e.target.value }))} />
                    </div>
                  </div>
                </>
              )}

              {/* Common fields */}
              <div>
                <Label>Stories por semana</Label>
                <Input type="number" min={0} value={form.stories_per_week} onChange={e => setForm(p => ({ ...p, stories_per_week: +e.target.value }))} />
              </div>

              {/* Profissional + Horário (only for new clients) */}
              {!editingCliente && (
                <>
                  <Separator />
                  <p className="text-sm font-medium flex items-center gap-2">
                    <CalIcon size={14} className="text-primary" />
                    Agendamento automático
                  </p>
                  <p className="text-[11px] text-muted-foreground -mt-2">
                    Os agendamentos serão criados automaticamente para as próximas 4 semanas nos dias selecionados.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Profissional responsável *</Label>
                      <Select value={form.profissional_user_id} onValueChange={v => setForm(p => ({ ...p, profissional_user_id: v }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Horário fixo *</Label>
                      <Input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Editorial */}
              <div>
                <Label className="flex items-center gap-2">
                  <FileText size={14} className="text-primary" />
                  Editorial do Cliente
                </Label>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Descreva o posicionamento, tom de voz, público-alvo e diretrizes de conteúdo para que toda equipe entenda este cliente.
                </p>
                <Textarea
                  value={form.editorial}
                  onChange={e => setForm(p => ({ ...p, editorial: e.target.value }))}
                  rows={4}
                  placeholder="Ex: Cliente do ramo alimentício, foco em público jovem (18-30). Tom de voz descontraído e direto. Prioridade em conteúdo de bastidores e receitas rápidas. Evitar linguagem formal..."
                />
              </div>

              {/* Notes */}
              <div>
                <Label>Observações estratégicas</Label>
                <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Notas internas sobre o cliente..." />
              </div>
            </div>
          )}

          {/* Footer */}
          <DialogFooter>
            {step !== 'select_client' && !editingCliente && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step === 'details' ? 'plan_config' : 'select_client')} className="mr-auto">
                ← Voltar
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            {(step === 'details' || editingCliente) && (
              <Button onClick={handleSave}>{editingCliente ? 'Salvar' : 'Cadastrar'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

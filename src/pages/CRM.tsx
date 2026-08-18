// CRM Inteligente com gestão de leads e metas
// CORREÇÃO: Implementada transferência completa de clientes entre cidades (Minaçu <-> Uruaçu) com cascata automática para todos os registros vinculados.
// CORREÇÃO: Criada e liberada a tabela 'scheduled_recordings' no backend (VPS) para permitir transferência de clientes.
// Implementada validação atômica no backend (VPS) para intervalo de 1h30 entre reuniões no CRM.
// CRM: Sistema de Briefing SDR -> Closer e lembretes 24h ativos.
import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, vpsAuthedFetch } from '@/lib/vpsDb';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { 
  Plus, Flame, Snowflake, RotateCcw, MessageSquare, 
  Briefcase, Phone, UserPlus, Target, TrendingUp, 
  DollarSign, Users, LayoutDashboard, Filter, Search,
  Calendar as CalendarIcon, Clock, Pencil, Trash2, UserMinus,
  Sprout, Handshake, Info, ArrowRightLeft, Loader2, Sparkles
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { LeadHarvester } from '@/components/crm/LeadHarvester';
import { CRMBanner } from '@/components/crm/CRMBanner';

import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isSameDay, isToday, parseISO, addDays, isWithinInterval, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function normalizeMeetingDateInput(value?: string | null) {
  if (!value || typeof value !== 'string') return '';

  const trimmedValue = value.trim();
  const isoDate = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

  const brDate = trimmedValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!brDate) return '';

  const day = Number(brDate[1]);
  const month = Number(brDate[2]);
  const rawYear = Number(brDate[3]);
  const year = rawYear < 100 ? rawYear + 2000 : rawYear;
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return '';
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseMeetingDate(value?: string | null) {
  const normalized = normalizeMeetingDateInput(value);
  if (!normalized) return null;

  const [year, month, day] = normalized.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  return parsed;
}

function formatMeetingDate(value: string | null | undefined, pattern: string, fallback = '—') {
  const parsed = parseMeetingDate(value);
  if (!parsed) return fallback;
  return format(parsed, pattern, { locale: ptBR });
}

function getAvailableTimeSlots(dateStr: string, allLeads: Lead[], excludeLeadId?: string) {
  const slots = [];
  for (let h = 8; h <= 18; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 18 && m > 0) break;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }

  const existingMeetings = allLeads.filter(l => 
    l.meeting_date === dateStr && 
    l.meeting_time && 
    l.id !== excludeLeadId
  );

  return slots.filter(slot => {
    const [h, m] = slot.split(':').map(Number);
    const slotMinutes = h * 60 + m;

    return !existingMeetings.some(l => {
      const [lh, lm] = l.meeting_time!.split(':').map(Number);
      const leadMinutes = lh * 60 + lm;
      return Math.abs(slotMinutes - leadMinutes) < 90;
    });
  });
}



type LeadStatus = 'lead' | 'contacted' | 'meeting' | 'contracted' | 'lost' | 'recovery_followup_1' | 'recovery_followup_2' | 'fridge';
type LeadTag = 'hot' | 'cold';

interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  contract_value: number;
  status: LeadStatus;
  tag: LeadTag | null;
  meeting_date: string | null;
  meeting_time: string | null;
  return_date?: string | null;
  city: string | null;
  description: string | null;
  source_tag: string | null;
  referral_info: { referrer_name?: string; referrer_notes?: string } | null;
  sdr_briefing: string | null;
  meeting_notes: string | null;
  sdr_id: string | null;
  closer_id: string | null;
  reminder_sent_24h: boolean | null;
}



interface Goal {
  id: string;
  type: 'clients' | 'faturamento' | 'lucro';
  title: string;
  target_value: number;
  current_value: number;
  status: 'em_andamento' | 'concluida' | 'cancelada';
}

const STAGES: { id: LeadStatus; label: string; color: string; icon: any }[] = [
  { id: 'lead', label: 'Possíveis Clientes', color: 'border-t-slate-400', icon: Users },
  { id: 'contacted', label: 'Contato Efetuado', color: 'border-t-blue-400', icon: Phone },
  { id: 'meeting', label: 'Reunião Agendada', color: 'border-t-purple-400', icon: Briefcase },
  { id: 'fridge', label: 'Geladeira', color: 'border-t-cyan-300', icon: Snowflake },
  { id: 'recovery_followup_1', label: 'Follow-up 1', color: 'border-t-orange-400', icon: RotateCcw },
  { id: 'recovery_followup_2', label: 'Follow-up 2', color: 'border-t-red-400', icon: RotateCcw },
  { id: 'contracted', label: 'Contrato Fechado', color: 'border-t-green-400 bg-green-50/30 ring-2 ring-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]', icon: Target },
  { id: 'lost', label: 'Leads Desistentes', color: 'border-t-zinc-500 grayscale opacity-70', icon: UserMinus },
];





export default function CRM() {
  const { user, profile } = useAuth();
  const canEdit = profile?.role === 'admin' || profile?.role === 'social_media';
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'pipeline' | 'goals' | 'calendar' | 'harvester' | 'meetings'>('pipeline');
  const [isRecoveryView, setIsRecoveryView] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedMeetingDate, setSelectedMeetingDate] = useState<string>('');
  const [meetingRefreshKey, setMeetingRefreshKey] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [newLeadStatus, setNewLeadStatus] = useState<LeadStatus>('lead');

  useEffect(() => {
    if (isAddDialogOpen) {
      if (newLeadStatus === 'meeting' && calendarSelectedDate) {
        setSelectedMeetingDate(format(calendarSelectedDate, 'yyyy-MM-dd'));
      } else {
        setSelectedMeetingDate('');
      }
    }
  }, [isAddDialogOpen, newLeadStatus, calendarSelectedDate]);


  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['crm_leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ['crm_goals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return [];
      return (data as any) as Goal[];

    },
  });

  const incrementActivePromosIfClosed = async (leadId: string, newStatus: LeadStatus) => {
    if (newStatus !== 'contracted') return;
    const { data: prev } = await supabase.from('crm_leads').select('status').eq('id', leadId).maybeSingle();
    if ((prev as any)?.status === 'contracted') return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: promos } = await supabase
      .from('plan_promotions' as any)
      .select('id, max_redemptions, redemptions_count, starts_at, ends_at')
      .eq('active', true);
    for (const p of (promos as any[]) || []) {
      if (p.starts_at && p.starts_at > today) continue;
      if (p.ends_at && p.ends_at < today) continue;
      if (p.max_redemptions != null && (p.redemptions_count ?? 0) >= p.max_redemptions) continue;
      await supabase.rpc('increment_promotion_redemption' as any, { _promo_id: p.id });
    }
  };

  const updateLeadStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      await incrementActivePromosIfClosed(id, status);
      const { error } = await supabase
        .from('crm_leads')
        .update({ status } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
      setMeetingRefreshKey(prev => prev + 1);
      toast.success('Lead atualizado!');
    },
  });


  const updateLead = useMutation({
    mutationFn: async (lead: Partial<Lead> & { id: string }) => {
      if (lead.status) await incrementActivePromosIfClosed(lead.id, lead.status);
      const { error } = await supabase
        .from('crm_leads')
        .update({
          name: lead.name,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          contract_value: lead.contract_value,
          status: lead.status,
          source_tag: lead.source_tag,
          referral_info: lead.referral_info
        } as any)
        .eq('id', lead.id);
      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
      setMeetingRefreshKey(prev => prev + 1);
      toast.success('Lead atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao atualizar lead');
    }
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_leads')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
      setMeetingRefreshKey(prev => prev + 1);
      toast.success('Lead excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erro ao excluir lead');
    }
  });

  const createLead = useMutation({
    mutationFn: async (newLead: Partial<Lead>) => {
      if (!newLead.name) throw new Error('Nome é obrigatório');
      if (!user?.id) throw new Error('Sua sessão expirou. Faça login novamente para cadastrar o lead.');

      const { error } = await supabase
        .from('crm_leads')
        .insert([{ 
          name: newLead.name,
          company: newLead.company?.trim() || null,
          email: newLead.email?.trim() || null,
          phone: newLead.phone?.trim() || null,
          contract_value: Number.isFinite(newLead.contract_value) ? newLead.contract_value : 0,
          status: newLead.status || 'lead',
          user_id: user.id,
          city: newLead.city || null,
          description: newLead.description || null,
          source_tag: newLead.source_tag || null,
          referral_info: newLead.referral_info || null,
          meeting_date: newLead.meeting_date || null,
          meeting_time: newLead.meeting_time || null,
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
      setIsAddDialogOpen(false);
      setNewLeadStatus('lead');
      setMeetingRefreshKey(prev => prev + 1);
      toast.success('Novo lead cadastrado!');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Não foi possível cadastrar o lead.');
    },
  });

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    if (destination.droppableId === result.source.droppableId) return;
    updateLeadStatus.mutate({ id: draggableId, status: destination.droppableId as LeadStatus });
  };

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.company?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );
  }, [leads, searchTerm]);

  const totals = useMemo(() => {
    const stats: Record<string, number> = {};
    leads.forEach(lead => {
      stats[lead.status] = (stats[lead.status] || 0) + Number(lead.contract_value);
    });
    return stats;
  }, [leads]);

  const currentStages = isRecoveryView 
    ? STAGES.filter(s => ['lost', 'recovery_followup_1', 'recovery_followup_2'].includes(s.id))
    : STAGES.filter(s => !['lost', 'recovery_followup_1', 'recovery_followup_2'].includes(s.id));

  return (
    <div className="p-4 md:p-6 h-full flex flex-col gap-6 bg-background/50">
      <div className="mb-6">
        <CRMBanner key={meetingRefreshKey} />
      </div>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="text-primary" />
            CRM Inteligente
          </h1>
          <p className="text-muted-foreground">Pipeline de vendas integrado com metas reais</p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input 
              placeholder="Buscar leads..." 
              className="pl-9 h-10 bg-card border-none shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <Button 
            variant="outline" 
            onClick={() => setIsRecoveryView(!isRecoveryView)}
            className={`h-10 transition-all ${isRecoveryView ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-card'}`}
          >
            <RotateCcw className={`mr-2 h-4 w-4 ${isRecoveryView ? 'animate-spin-slow' : ''}`} />
            {isRecoveryView ? 'Pipeline Principal' : 'Recuperação'}
          </Button>


          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-10 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-95">
                <UserPlus className="mr-2 h-4 w-4" />
                Novo Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{newLeadStatus === 'meeting' ? 'Agendar Nova Reunião' : 'Novo Lead Comercial'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const mDate = formData.get('meeting_date') as string;
                const mTime = formData.get('meeting_time') as string;
                const dateToCheck = mDate || (calendarSelectedDate ? format(calendarSelectedDate, 'yyyy-MM-dd') : null);

                if (newLeadStatus === 'meeting' && dateToCheck && mTime) {
                  const existingMeetings = leads.filter(l => l.meeting_date === dateToCheck && l.meeting_time);
                  const newTimeMinutes = (() => {
                    const [h, m] = mTime.split(':').map(Number);
                    return h * 60 + m;
                  })();

                  const hasConflict = existingMeetings.some(l => {
                    const [lh, lm] = l.meeting_time!.split(':').map(Number);
                    const leadTimeMinutes = lh * 60 + lm;
                    return Math.abs(newTimeMinutes - leadTimeMinutes) < 90;
                  });

                  if (hasConflict) {
                    toast.error('Já existe uma reunião agendada em um horário muito próximo (mínimo 1h30 de intervalo).');
                    return;
                  }
                }

                createLead.mutate({
                  name: formData.get('name') as string,
                  company: formData.get('company') as string,
                  email: formData.get('email') as string,
                  phone: formData.get('phone') as string,
                  contract_value: Number(formData.get('value')),
                  city: formData.get('city') as string,
                  description: formData.get('description') as string,
                  status: newLeadStatus,
                  meeting_date: newLeadStatus === 'meeting' ? dateToCheck : null,
                  meeting_time: newLeadStatus === 'meeting' ? (mTime || null) : null,
                  source_tag: formData.get('source_tag') as string || null,
                  referral_info: formData.get('source_tag') === 'indicacao' ? {
                    referrer_name: formData.get('referrer_name') as string,
                    referrer_notes: formData.get('referrer_notes') as string,
                  } : null
                });
              }} className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome do Decisor</Label>
                  <Input id="name" name="name" required placeholder="Ex: Rodrigo Pulse" className="bg-muted/50" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="company">Empresa / Negócio</Label>
                  <Input id="company" name="company" placeholder="Ex: Pulse Agency" className="bg-muted/50" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="contato@empresa.com" className="bg-muted/50" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Select name="city" defaultValue="Minaçu">
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue placeholder="Selecione a cidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Minaçu">Minaçu</SelectItem>
                      <SelectItem value="Uruaçu">Uruaçu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição / Observações</Label>
                  <Textarea id="description" name="description" placeholder="Algum detalhe importante sobre o lead..." className="bg-muted/50 resize-none h-20" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="value">Valor Possível</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="value" name="value" type="number" step="0.01" placeholder="0.00" className="pl-9 bg-muted/50" />
                    </div>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="source_tag">Origem do Lead</Label>
                  <Select name="source_tag" defaultValue="manual">
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue placeholder="Selecione a origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="indicacao">Indicação</SelectItem>
                      <SelectItem value="marketing">Marketing Social</SelectItem>
                      <SelectItem value="colheita">Colheita de Leads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Campos condicionais para Indicação */}
                <div className="space-y-4 pt-2 border-t border-muted/50 data-[visible=false]:hidden" id="referral-fields">
                  <div className="grid gap-2">
                    <Label htmlFor="referrer_name">Quem indicou?</Label>
                    <Input id="referrer_name" name="referrer_name" placeholder="Nome do indicador" className="bg-muted/50" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="referrer_notes">Informações do indicador sobre o lead</Label>
                    <Textarea id="referrer_notes" name="referrer_notes" placeholder="O que o indicador falou?" className="bg-muted/50 resize-none h-16" />
                  </div>
                </div>

                <script dangerouslySetInnerHTML={{ __html: `
                  document.querySelector('select[name="source_tag"]')?.addEventListener('change', (e) => {
                    const el = document.getElementById('referral-fields');
                    if (el) el.setAttribute('data-visible', e.target.value === 'indicacao');
                  });
                `}} />

                <div className="grid gap-2">
                    <Label htmlFor="phone">WhatsApp</Label>
                    <Input id="phone" name="phone" placeholder="(00) 00000-0000" className="bg-muted/50" />
                  </div>
                </div>

                {newLeadStatus === 'meeting' && (
                  <div className="space-y-4 pt-4 border-t border-muted/50 mt-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="meeting_date">Data da Reunião</Label>
                        <Input 
                          id="meeting_date" 
                          name="meeting_date" 
                          type="date" 
                          required 
                          className="bg-muted/50"
                          value={selectedMeetingDate}
                          onChange={(e) => setSelectedMeetingDate(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="meeting_time">Horário Disponível</Label>
                        <Select name="meeting_time" required>
                          <SelectTrigger className="bg-muted/50">
                            <SelectValue placeholder="Selecione o horário" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedMeetingDate ? (
                              getAvailableTimeSlots(selectedMeetingDate, leads).length > 0 ? (
                                getAvailableTimeSlots(selectedMeetingDate, leads).map(slot => (
                                  <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                                ))
                              ) : (
                                <SelectItem value="none" disabled>Nenhum horário disponível</SelectItem>
                              )
                            ) : (
                              <SelectItem value="none" disabled>Selecione a data primeiro</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                      <p className="text-[10px] text-blue-700 leading-tight">
                        <strong>Dica SDR:</strong> O sistema mostra apenas horários com pelo menos 1h30 de intervalo para garantir a qualidade da reunião.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="status">Status Inicial</Label>
                  <Select value={newLeadStatus} onValueChange={(value) => setNewLeadStatus(value as LeadStatus)}>
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full mt-4" disabled={createLead.isPending}>
                  {createLead.isPending ? 'Cadastrando...' : (newLeadStatus === 'meeting' ? 'Agendar e Criar Lead' : 'Criar Oportunidade')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between bg-card/50 p-1 rounded-lg border w-fit self-center md:self-start">
          <TabsList className="bg-transparent h-9">
            <TabsTrigger value="pipeline" className="gap-2 px-6">
              <Filter className="h-4 w-4" /> Pipeline
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-2 px-6">
              <Target className="h-4 w-4" /> Metas de Vendas
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2 px-6">
              <CalendarIcon className="h-4 w-4" /> Calendário
            </TabsTrigger>
            <TabsTrigger value="meetings" className="gap-2 px-6">
              <Clock className="h-4 w-4" /> Gestão de Reuniões
            </TabsTrigger>
            <TabsTrigger value="harvester" className="gap-2 px-6">
              <Sprout className="h-4 w-4" /> Colheita de Leads
            </TabsTrigger>
          </TabsList>
        </div>


        <TabsContent value="pipeline" className="flex-1 overflow-hidden m-0">
          <div className="h-full overflow-x-auto custom-scrollbar">
            <DragDropContext onDragEnd={onDragEnd}>
              <div className="flex gap-6 h-full min-w-max pb-4">
                {currentStages.map((stage) => (
                  <div key={stage.id} className="w-[320px] flex flex-col gap-4">
                    <div className={`p-4 rounded-xl border-t-4 ${stage.color} bg-card shadow-sm flex flex-col gap-2 relative overflow-hidden group`}>
                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-md bg-muted group-hover:bg-primary/10 transition-colors`}>
                            <stage.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <h3 className="font-bold text-sm text-foreground/80">{stage.label}</h3>
                        </div>
                        <Badge variant="secondary" className="rounded-full h-5 min-w-[20px] flex items-center justify-center bg-muted text-muted-foreground">
                          {leads.filter(l => l.status === stage.id).length}
                        </Badge>
                      </div>
                      <div className="flex items-baseline gap-1 relative z-10">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Volume Total</span>
                        <p className="text-sm font-bold text-primary">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals[stage.id] || 0)}
                        </p>
                      </div>
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <stage.icon className="h-12 w-12" />
                      </div>
                    </div>

                    <Droppable droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className={`flex-1 flex flex-col gap-3 p-2 rounded-xl transition-colors min-h-[200px] ${
                            snapshot.isDraggingOver ? 'bg-primary/5 border-2 border-dashed border-primary/20' : 'bg-transparent'
                          }`}
                        >
                          <AnimatePresence>
                            {filteredLeads
                              .filter((lead) => lead.status === stage.id)
                              .map((lead, index) => (
                                <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      className="z-10"
                                    >
                                      <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.2 }}
                                      >
                                        <Card className={`group border-none shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${snapshot.isDragging ? 'rotate-3 scale-105 shadow-xl' : ''}`}>
                                          <div className="p-4 space-y-3 relative">
                                            <div className="flex justify-between items-start gap-2">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                  <h4 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{lead.name}</h4>
                                                  {lead.source_tag === 'colheita' && (
                                                    <Badge variant="outline" className="h-4 px-1 text-[8px] bg-green-50 text-green-700 border-green-200">
                                                      COLHEITA
                                                    </Badge>
                                                  )}
                                                  {lead.source_tag === 'indicacao' && (
                                                    <Badge variant="outline" className="h-4 px-1 text-[8px] bg-blue-50 text-blue-700 border-blue-200">
                                                      INDICAÇÃO
                                                    </Badge>
                                                  )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                                  <Briefcase className="h-3 w-3" /> {lead.company || 'Pessoa Física'} {lead.city && <span className="text-primary/70">· {lead.city}</span>}
                                                </p>
                                              </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-muted/50">
                                              <div className="flex flex-col">
                                                <span className="text-[9px] uppercase font-semibold text-muted-foreground tracking-tighter">Budget Est.</span>
                                                <span className="text-xs font-bold text-primary">
                                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.contract_value)}
                                                </span>
                                              </div>
                                              
                                              {lead.status === 'meeting' && parseMeetingDate(lead.meeting_date) && (
                                                <div className="flex flex-col items-end">
                                                  <span className="text-[9px] uppercase font-semibold text-muted-foreground tracking-tighter">Agendado</span>
                                                  <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600">
                                                    <CalendarIcon className="h-3 w-3" /> {formatMeetingDate(lead.meeting_date, 'dd/MM')} às {lead.meeting_time?.slice(0, 5) || '—'}
                                                  </div>
                                                </div>
                                              )}
                                              {lead.status === 'fridge' && lead.return_date && (
                                                <div className="flex flex-col items-end">
                                                  <span className="text-[9px] uppercase font-semibold text-muted-foreground tracking-tighter">Retorno</span>
                                                  <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-600">
                                                    <CalendarIcon className="h-3 w-3" /> {format(parseISO(lead.return_date), 'dd/MM', { locale: ptBR })}
                                                  </div>
                                                </div>
                                              )}



                                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                                <LeadDetailsDialog 
                                                  lead={lead} 
                                                  onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crm_leads'] })}
                                                  onEdit={(data) => updateLead.mutate(data)}
                                                  onDelete={(id) => deleteLead.mutate(id)}
                                                  onSetRefreshKey={setMeetingRefreshKey}
                                                />
                                              </div>

                                            </div>
                                          </div>

                                        </Card>
                                      </motion.div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                          </AnimatePresence>
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </div>
            </DragDropContext>
          </div>
        </TabsContent>

        <TabsContent value="goals" className="m-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="bg-primary text-primary-foreground p-6 flex flex-col justify-between overflow-hidden relative">
              <div className="relative z-10">
                <p className="text-primary-foreground/70 text-sm font-medium">Faturamento Potencial (CRM)</p>
                <h3 className="text-3xl font-bold mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                    leads.reduce((sum, l) => sum + (l.status !== 'contracted' ? Number(l.contract_value) : 0), 0)
                  )}
                </h3>
                <p className="text-xs mt-2 opacity-80 flex items-center gap-1">
                   <TrendingUp className="h-3 w-3" /> Volume em negociação aberta
                </p>
              </div>
              <DollarSign className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10" />
            </Card>

            <AnimatePresence>
              {goalsLoading ? (
                Array(2).fill(0).map((_, i) => (
                  <Card key={i} className="animate-pulse bg-muted h-[160px]" />
                ))
              ) : goals.length > 0 ? (
                goals.filter(g => g.status === 'em_andamento').map((goal) => (
                  <motion.div
                    key={goal.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <Card className="p-6 space-y-4 hover:shadow-lg transition-all border-none shadow-sm relative overflow-hidden group">
                      <div className="flex justify-between items-start relative z-10">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-primary uppercase tracking-wider">{goal.type === 'faturamento' ? 'Faturamento' : 'Volume de Clientes'}</p>
                          <h4 className="font-bold text-lg group-hover:text-primary transition-colors">{goal.title}</h4>
                        </div>
                        <div className="bg-primary/10 p-2 rounded-lg text-primary">
                          {goal.type === 'faturamento' ? <DollarSign className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                        </div>
                      </div>

                      <div className="space-y-2 relative z-10">
                        <div className="flex justify-between text-xs font-medium">
                          <span>Progresso: {Math.round((goal.current_value / goal.target_value) * 100)}%</span>
                          <span>Alvo: {goal.type === 'faturamento' ? `R$ ${goal.target_value.toLocaleString()}` : goal.target_value}</span>
                        </div>
                        <Progress value={(goal.current_value / goal.target_value) * 100} className="h-2 rounded-full" />
                      </div>
                      
                      <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-5 transition-opacity">
                         <Target className="h-24 w-24" />
                      </div>
                    </Card>
                  </motion.div>
                ))
              ) : (
                <div className="col-span-full py-12 text-center text-muted-foreground bg-card rounded-xl border-2 border-dashed">
                  Nenhuma meta ativa vinculada ao financeiro.
                </div>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>
        <TabsContent value="calendar" className="m-0">
          <Card className="p-6 bg-card border-none shadow-sm mb-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
              <CalendarIcon className="h-5 w-5 text-primary" /> 
              Calendário de Reuniões
            </h3>
            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex-none">
                <Calendar
                  mode="single"
                  selected={calendarSelectedDate}
                  onSelect={(date) => {
                    setCalendarSelectedDate(date);
                    if (date) {
                      setNewLeadStatus('meeting');
                      setIsAddDialogOpen(true);
                    }
                  }}
                  className="rounded-md border bg-card cursor-pointer"
                  locale={ptBR}
                  modifiers={{
                    meeting: (date) => leads.some((l) => {
                      const meetingDate = parseMeetingDate(l.meeting_date);
                      return meetingDate ? isSameDay(meetingDate, date) : false;
                    })
                  }}
                  modifiersStyles={{
                    meeting: { fontWeight: 'bold', color: 'var(--primary)', textDecoration: 'underline' }
                  }}
                />
              </div>
              <div className="flex-1 space-y-4">
                <div className="grid gap-3">
                  <DragDropContext onDragEnd={(result) => {
                    if (!result.destination) return;
                    const leadId = result.draggableId;
                    const newDateStr = result.destination.droppableId; // format: 'YYYY-MM-DD'
                    
                    const lead = leads.find(l => l.id === leadId);
                    if (lead && lead.meeting_date !== newDateStr) {
                      // Check for conflicts on the destination date if time exists
                      if (lead.meeting_time) {
                        const existingOnDate = leads.filter(l => l.meeting_date === newDateStr && l.meeting_time && l.id !== lead.id);
                        const [h, m] = lead.meeting_time.split(':').map(Number);
                        const movingTimeMinutes = h * 60 + m;

                        const hasConflict = existingOnDate.some(l => {
                          const [lh, lm] = l.meeting_time!.split(':').map(Number);
                          const leadTimeMinutes = lh * 60 + lm;
                          return Math.abs(movingTimeMinutes - leadTimeMinutes) < 90;
                        });

                        if (hasConflict) {
                          toast.error('Conflito de horário: Mínimo 1h30 entre reuniões.');
                          return;
                        }
                      }

                      updateLead.mutate({
                        id: leadId,
                        meeting_date: newDateStr,
                        status: 'meeting'
                      });
                      toast.success(`Reunião de ${lead.name} movida para ${format(parseISO(newDateStr), 'dd/MM', { locale: ptBR })}`);
                    }
                  }}>
                    {/* Exibir os próximos 7 dias como áreas de drop se quisermos Drag & Drop entre dias na lista */}
                    {Array.from({ length: 7 }).map((_, i) => {
                      const date = addDays(startOfDay(new Date()), i);
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const dayLeads = leads.filter(l => l.meeting_date === dateStr);

                      return (
                        <div key={dateStr} className="space-y-2">
                          <h4 className="text-[10px] font-bold uppercase text-muted-foreground px-1 flex items-center gap-2">
                            <CalendarIcon className="h-3 w-3" />
                            {isToday(date) ? 'Hoje' : format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                          </h4>
                          
                          <Droppable droppableId={dateStr}>
                            {(provided, snapshot) => (
                              <div
                                {...provided.droppableProps}
                                ref={provided.innerRef}
                                className={`min-h-[50px] rounded-xl transition-colors ${
                                  snapshot.isDraggingOver ? 'bg-primary/5 border-2 border-dashed border-primary/20' : 'bg-transparent'
                                }`}
                              >
                                {dayLeads.map((lead, index) => (
                                  <Draggable key={lead.id} draggableId={lead.id} index={index}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className="mb-2 last:mb-0"
                                      >
                                        <div className={`flex items-center justify-between p-4 rounded-xl bg-card border border-muted/50 hover:shadow-md transition-all ${snapshot.isDragging ? 'rotate-2 scale-105 shadow-xl z-50' : ''}`}>
                                          <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-lg flex flex-col items-center min-w-[50px] ${lead.status === 'meeting' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                              <span className="text-xl font-black">{lead.meeting_time?.slice(0, 5) || '--:--'}</span>
                                            </div>
                                            <div>
                                              <p className="font-bold text-sm">{lead.name}</p>
                                              <p className="text-[10px] text-muted-foreground">
                                                {lead.company || 'Pessoa Física'}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <MeetingActions lead={lead} leads={leads} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crm_leads'] })} onSetRefreshKey={setMeetingRefreshKey} />
                                            <LeadDetailsDialog 
                                              lead={lead} 
                                              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crm_leads'] })}
                                              onEdit={(data) => updateLead.mutate(data)}
                                              onDelete={(id) => deleteLead.mutate(id)}
                                              onSetRefreshKey={setMeetingRefreshKey}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                                {dayLeads.length === 0 && !snapshot.isDraggingOver && (
                                  <div className="py-4 text-center text-[10px] text-muted-foreground italic border border-dashed rounded-xl opacity-50">
                                    Nenhuma reunião
                                  </div>
                                )}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      );
                    })}
                  </DragDropContext>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
        
        <TabsContent value="meetings" className="m-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Reuniões de Hoje */}
            <Card className="p-6 border-none shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                  <CalendarIcon className="h-5 w-5" /> Hoje
                </h3>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
                  {leads.filter(l => l.meeting_date && isToday(parseISO(l.meeting_date))).length} Agendadas
                </Badge>
              </div>
              <div className="space-y-3">
                {leads
                  .filter(l => l.meeting_date && isToday(parseISO(l.meeting_date)))
                  .sort((a, b) => (a.meeting_time || '').localeCompare(b.meeting_time || ''))
                  .map(lead => (
                    <div key={lead.id} className="p-4 rounded-xl bg-muted/30 border border-muted/50 hover:bg-muted/50 transition-colors group">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{lead.meeting_time?.slice(0, 5)}</span>
                            <span className="text-xs font-medium text-muted-foreground tracking-tighter uppercase">· {lead.name}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">{lead.company || 'Pessoa Física'}</p>
                          <div className="flex items-center gap-2 mt-2">
                            {lead.reminder_sent_24h ? (
                              <Badge variant="outline" className="text-[9px] bg-green-50 text-green-600 border-green-200">
                                Lembrete Enviado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] bg-orange-50 text-orange-600 border-orange-200">
                                Lembrete Pendente
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <MeetingActions lead={lead} leads={leads} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crm_leads'] })} onSetRefreshKey={setMeetingRefreshKey} />
                          <LeadDetailsDialog 
                            lead={lead} 
                            onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crm_leads'] })}
                            onEdit={(data) => updateLead.mutate(data)}
                            onDelete={(id) => deleteLead.mutate(id)}
                            onSetRefreshKey={setMeetingRefreshKey}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                {leads.filter(l => l.meeting_date && isToday(parseISO(l.meeting_date))).length === 0 && (
                  <p className="text-center py-8 text-sm text-muted-foreground italic">Nenhuma reunião para hoje.</p>
                )}
              </div>
            </Card>

            {/* Próximos 7 Dias */}
            <Card className="p-6 border-none shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                  <TrendingUp className="h-5 w-5" /> Próximos 7 Dias
                </h3>
                <Badge variant="secondary" className="bg-muted text-muted-foreground border-none">
                  {leads.filter(l => {
                    if (!l.meeting_date) return false;
                    const date = parseISO(l.meeting_date);
                    const today = startOfDay(new Date());
                    const next7Days = addDays(today, 7);
                    return isWithinInterval(date, { start: addDays(today, 1), end: next7Days });
                  }).length} Total
                </Badge>
              </div>
              <div className="space-y-3">
                {leads
                  .filter(l => {
                    if (!l.meeting_date) return false;
                    const date = parseISO(l.meeting_date);
                    const today = startOfDay(new Date());
                    const next7Days = addDays(today, 7);
                    return isWithinInterval(date, { start: addDays(today, 1), end: next7Days });
                  })
                  .sort((a, b) => (a.meeting_date || '').localeCompare(b.meeting_date || ''))
                  .map(lead => (
                    <div key={lead.id} className="p-4 rounded-xl bg-muted/30 border border-muted/50 hover:bg-muted/50 transition-colors flex justify-between items-center group">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-bold">
                            {format(parseISO(lead.meeting_date!), 'dd/MM')}
                          </Badge>
                          <span className="text-sm font-bold">{lead.meeting_time?.slice(0, 5)}</span>
                          <span className="text-xs text-muted-foreground tracking-tighter uppercase">· {lead.name}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{lead.company || 'Pessoa Física'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <MeetingActions lead={lead} leads={leads} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crm_leads'] })} onSetRefreshKey={setMeetingRefreshKey} />
                        <LeadDetailsDialog 
                          lead={lead} 
                          onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crm_leads'] })}
                          onEdit={(data) => updateLead.mutate(data)}
                          onDelete={(id) => deleteLead.mutate(id)}
                          onSetRefreshKey={setMeetingRefreshKey}
                        />
                      </div>
                    </div>
                  ))}
                {leads.filter(l => {
                  if (!l.meeting_date) return false;
                  const date = parseISO(l.meeting_date);
                  const today = startOfDay(new Date());
                  const next7Days = addDays(today, 7);
                  return isWithinInterval(date, { start: addDays(today, 1), end: next7Days });
                }).length === 0 && (
                  <p className="text-center py-8 text-sm text-muted-foreground italic">Nenhuma reunião nos próximos 7 dias.</p>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="harvester" className="m-0">
          <LeadHarvester />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function TagSelector({ leadId, currentTag }: { leadId: string, currentTag: LeadTag | null }) {
  const queryClient = useQueryClient();
  const updateTag = useMutation({
    mutationFn: async (tag: LeadTag | null) => {
      const { error } = await supabase.from('crm_leads').update({ tag }).eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
    }
  });

  return (
    <div className="flex gap-1.5 mt-2">
      <Badge 
        variant="outline" 
        className={`text-[9px] px-2 py-0.5 cursor-pointer transition-all border-none ${
          currentTag === 'hot' ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
        }`}
        onClick={() => updateTag.mutate(currentTag === 'hot' ? null : 'hot')}
      >
        Quente
      </Badge>
      <Badge 
        variant="outline" 
        className={`text-[9px] px-2 py-0.5 cursor-pointer transition-all border-none ${
          currentTag === 'cold' ? 'bg-blue-500 text-white shadow-md shadow-blue-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
        }`}
        onClick={() => updateTag.mutate(currentTag === 'cold' ? null : 'cold')}
      >
        Frio
      </Badge>
    </div>
  );
}

function LeadDetailsDialog({ 
  lead, 
  onUpdate,
  onEdit,
  onDelete,
  onSetRefreshKey
}: { 
  lead: Lead, 
  onUpdate: () => void,
  onEdit?: (lead: Partial<Lead> & { id: string }) => void,
  onDelete?: (id: string) => void,
  onSetRefreshKey?: React.Dispatch<React.SetStateAction<number>>
}) {
  const [note, setNote] = useState('');
  const { data: notes = [] } = useQuery({
    queryKey: ['lead_notes', lead.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('crm_notes').insert([{
        lead_id: lead.id,
        content: note,
        stage: lead.status
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      setNote('');
      onUpdate();
      toast.success('Nota registrada no histórico!');
    }
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5">
          <MessageSquare size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl border-none shadow-2xl">
        <div className="flex h-[600px]">
          {/* Coluna Esquerda: Dados */}
          <div className="w-2/5 bg-muted/30 p-8 flex flex-col gap-6 overflow-y-auto">
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">Dados da Oportunidade</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-primary uppercase">Ações Rápidas</p>
                  <div className="flex flex-wrap gap-2">
                    {lead.phone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-[10px] bg-green-50 text-green-600 border-green-200 hover:bg-green-100"
                        onClick={() => window.open(`https://wa.me/55${lead.phone.replace(/\D/g, '')}`, '_blank')}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" /> WhatsApp
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-primary uppercase">Contato</p>
                  <p className="font-bold text-lg flex items-center gap-2">
                    {lead.name}
                    {lead.source_tag === 'colheita' && (
                      <Badge variant="outline" className="h-4 px-1 text-[8px] bg-green-50 text-green-700 border-green-200">
                        COLHEITA
                      </Badge>
                    )}
                  </p>
                </div>
                {lead.source_tag === 'indicacao' && lead.referral_info?.referrer_name && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 space-y-1">
                    <p className="text-[10px] font-bold text-blue-700 uppercase flex items-center gap-1">
                      <Handshake className="h-3 w-3" /> Indicação de:
                    </p>
                    <p className="text-sm font-bold text-blue-900">{lead.referral_info.referrer_name}</p>
                    {lead.referral_info.referrer_notes && (
                      <p className="text-[11px] text-blue-800/80 italic leading-tight">"{lead.referral_info.referrer_notes}"</p>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-primary uppercase">Empresa</p>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    {lead.company || 'Pessoa Física'}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-primary uppercase">Etiqueta de Temperatura</p>
                  <TagSelector leadId={lead.id} currentTag={lead.tag} />
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-primary uppercase">Links da Proposta</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[10px] bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                      onClick={() => {
                        const url = `${window.location.origin}/apresentacao/mensal?lead=${lead.id}${lead.source_tag === 'promo_6_6' ? '&type=promo_6_6' : ''}`;
                        window.open(url, '_blank');
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" /> Abrir Proposta
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[10px] bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                      onClick={async () => {
                        const url = `${window.location.origin}/p/planos/mensal?lead=${lead.id}${lead.source_tag === 'promo_6_6' ? '&type=promo_6_6' : ''}`;
                        await navigator.clipboard.writeText(url);
                        toast.success('Link público copiado!');
                      }}
                    >
                      <Link className="h-3 w-3 mr-1" /> Copiar Link Público
                    </Button>
                  </div>
                </div>

                {lead.status === 'meeting' && (
                  <div className="p-4 rounded-xl bg-purple-50 border border-purple-100 space-y-4">
                    <p className="text-[10px] font-bold text-purple-700 uppercase flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> Briefing do SDR para o Closer
                    </p>
                    
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-purple-900/60 uppercase">O que o SDR conversou?</Label>
                        <p className="text-xs text-purple-900 leading-relaxed bg-white/50 p-2 rounded border border-purple-200/50 italic">
                          {lead.sdr_briefing || "Nenhum briefing registrado pelo SDR."}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-purple-900/60 uppercase">Notas da Reunião (Closer)</Label>
                        <Textarea 
                          placeholder="O que foi decidido na reunião?" 
                          className="bg-white border-purple-200 min-h-[80px] text-xs"
                          defaultValue={lead.meeting_notes || ''}
                          onBlur={async (e) => {
                            const val = e.target.value;
                            if (val !== lead.meeting_notes) {
                              const { error } = await supabase.from('crm_leads').update({ meeting_notes: val } as any).eq('id', lead.id);
                              if (!error) toast.success('Notas da reunião salvas!');
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>


            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-primary uppercase">Valor Negociado</p>
                <p className="text-2xl font-black text-primary">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.contract_value)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <TransferClientDialog lead={lead} onUpdate={onUpdate} />
                {onEdit && <EditLeadDialog lead={lead} onUpdate={onEdit} />}
                {onDelete && <DeleteLeadDialog leadName={lead.name} onDelete={() => onDelete(lead.id)} />}
              </div>

              
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Mover para Estágio</Label>

                <div className="flex flex-wrap gap-2">
                  {STAGES.map(s => (
                    <Button 
                      key={s.id} 
                      size="sm" 
                      variant={lead.status === s.id ? 'default' : 'outline'}
                      className="h-8 text-[10px] px-2 flex-1 min-w-[100px]"
                      onClick={async () => {
                        const { error } = await supabase.from('crm_leads').update({ status: s.id } as any).eq('id', lead.id);
                        if (!error) {
                          onUpdate();
                          if (onSetRefreshKey) onSetRefreshKey(prev => prev + 1);
                          toast.success(`Lead movido para ${s.label}`);
                        }
                      }}
                    >
                      <s.icon className="h-3 w-3 mr-1" /> {s.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-muted-foreground">Nova Atualização</Label>
                <Textarea 
                  placeholder="Registre pontos relevantes da conversa..." 
                  className="bg-card border-none min-h-[120px] shadow-inner resize-none"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button onClick={() => addNote.mutate()} disabled={!note} className="w-full h-11 shadow-lg shadow-primary/20">
                  Salvar Observação
                </Button>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Histórico */}
          <div className="flex-1 p-8 overflow-y-auto flex flex-col gap-6 bg-card">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Jornada do Cliente
            </h3>
            <div className="space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-0 before:w-0.5 before:bg-muted">
              {notes.map((n: any) => (
                <div key={n.id} className="pl-10 relative">
                  <div className="absolute left-[7px] top-1.5 h-3 w-3 rounded-full bg-primary border-4 border-card z-10" />
                  <div className="bg-muted/50 p-4 rounded-xl border-l-2 border-primary space-y-2 group hover:bg-muted transition-colors">
                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 h-4 bg-card">
                        {n.stage}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {new Date(n.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{n.content}</p>
                  </div>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                  <div className="p-4 rounded-full bg-muted/50">
                    <MessageSquare className="h-8 w-8 opacity-20" />
                  </div>
                  <p className="text-sm italic">Nenhuma interação registrada ainda.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingActions({ lead, leads, onUpdate, onSetRefreshKey }: { lead: Lead; leads: Lead[]; onUpdate: () => void; onSetRefreshKey?: React.Dispatch<React.SetStateAction<number>> }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedRescheduleDate, setSelectedRescheduleDate] = useState<string>(normalizeMeetingDateInput(lead.meeting_date));


  const handleReschedule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const m_date = normalizeMeetingDateInput(formData.get('date') as string);
    const m_time = formData.get('time') as string;
    const briefing = formData.get('sdr_briefing') as string;

    if (!m_date || !m_time) {
      toast.error('Data e horário são obrigatórios.');
      return;
    }

    const { error } = await supabase
      .from('crm_leads')
      .update({ 
        meeting_date: m_date, 
        meeting_time: m_time, 
        sdr_briefing: briefing,
        status: 'meeting' 
      } as any)
      .eq('id', lead.id);
    if (error) {
      toast.error('Não foi possível reagendar.');
      return;
    }
    setOpen(false);
    onUpdate();
    if (onSetRefreshKey) onSetRefreshKey(prev => prev + 1);
    toast.success('Reunião reagendada!');
  };

  const handleDelete = async () => {
    const { error } = await supabase
      .from('crm_leads')
      .update({ meeting_date: null, meeting_time: null, status: 'contacted' } as any)
      .eq('id', lead.id);
    if (error) {
      toast.error('Não foi possível apagar a reunião.');
      return;
    }
    setConfirmDelete(false);
    onUpdate();
    if (onSetRefreshKey) onSetRefreshKey(prev => prev + 1);
    toast.success('Reunião removida. Lead voltou para Contato Efetuado.');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-blue-600 hover:bg-blue-50" title="Reagendar reunião">
            <Pencil size={14} />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar/Reagendar Reunião - {lead.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReschedule}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Data da Reunião</Label>
                  <Input
                    type="date"
                    name="date"
                    required
                    value={selectedRescheduleDate}
                    onChange={(e) => setSelectedRescheduleDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Horário Disponível</Label>
                  <Select name="time" required defaultValue={lead.meeting_time?.slice(0, 5) ?? ''}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o horário" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedRescheduleDate ? (
                        getAvailableTimeSlots(selectedRescheduleDate, leads, lead.id).length > 0 ? (
                          getAvailableTimeSlots(selectedRescheduleDate, leads, lead.id).map(slot => (
                            <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>Nenhum horário disponível</SelectItem>
                        )
                      ) : (
                        <SelectItem value="none" disabled>Selecione a data primeiro</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Briefing do SDR (Contexto para o Closer)</Label>
                <Textarea 
                  name="sdr_briefing"
                  placeholder="O que foi conversado? Qual a dor do cliente? O que ele espera da reunião?"
                  className="min-h-[100px] bg-muted/30"
                  defaultValue={lead.sdr_briefing || ''}
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                <p className="text-[10px] text-blue-700 leading-tight">
                  <strong>Regra de Intervalo:</strong> O sistema exige um intervalo mínimo de 1h30 entre as reuniões para garantir a qualidade do atendimento.
                </p>
              </div>

              <Button type="submit" className="w-full">Confirmar Agendamento</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50" title="Apagar reunião">
            <Trash2 size={14} />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar reunião?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A reunião de <strong>{lead.name}</strong> será removida do calendário e o lead voltará para "Contato Efetuado". Você pode agendar novamente depois.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditLeadDialog({ lead, onUpdate }: { lead: Lead; onUpdate: (lead: Partial<Lead> & { id: string }) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-blue-600 hover:bg-blue-50" title="Editar lead">
          <Pencil size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Lead - {lead.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          onUpdate({
            id: lead.id,
            name: formData.get('name') as string,
            company: formData.get('company') as string,
            email: formData.get('email') as string,
            phone: formData.get('phone') as string,
            contract_value: Number(formData.get('value')),
            city: formData.get('city') as string,
            description: formData.get('description') as string,
            status: formData.get('status') as LeadStatus,
            source_tag: formData.get('source_tag') as string,
            referral_info: {
              ...lead.referral_info,
              promo_value: formData.get('promo_value') ? Number(formData.get('promo_value')) : undefined
            } as any
          });
          setOpen(false);
        }} className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Nome do Decisor</Label>
            <Input id="edit-name" name="name" defaultValue={lead.name} required className="bg-muted/50" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-company">Empresa / Negócio</Label>
            <Input id="edit-company" name="company" defaultValue={lead.company || ''} className="bg-muted/50" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" name="email" type="email" defaultValue={lead.email || ''} className="bg-muted/50" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-city">Cidade</Label>
            <Select name="city" defaultValue={lead.city || 'Minaçu'}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue placeholder="Selecione a cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Minaçu">Minaçu</SelectItem>
                <SelectItem value="Uruaçu">Uruaçu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-description">Descrição / Observações</Label>
            <Textarea id="edit-description" name="description" defaultValue={lead.description || ''} className="bg-muted/50 resize-none h-20" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-value">Valor Possível</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="edit-value" name="value" type="number" step="0.01" defaultValue={lead.contract_value} className="pl-9 bg-muted/50" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-phone">WhatsApp</Label>
              <Input id="edit-phone" name="phone" defaultValue={lead.phone || ''} className="bg-muted/50" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-status">Status</Label>
            <Select name="status" defaultValue={lead.status}>
              <SelectTrigger className="bg-muted/50">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 border-t pt-4 mt-2">
            <Label className="text-[#FF6B00] font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Oferta Especial (Anual 6+6)
            </Label>
            <div className="flex flex-col gap-3 bg-primary/5 p-3 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Status da Oferta</p>
                  <p className="text-xs font-medium">Ativar valor promocional para os primeiros 6 meses</p>
                </div>
                <Button 
                  type="button"
                  size="sm"
                  variant={lead.source_tag === 'promo_6_6' ? 'default' : 'outline'}
                  className="h-8 text-[10px]"
                  onClick={() => {
                    const input = document.getElementById('edit-source-tag') as HTMLInputElement;
                    const promoValueInput = document.getElementById('edit-promo-value') as HTMLInputElement;
                    
                    if (lead.source_tag === 'promo_6_6') {
                      if (input) input.value = 'manual';
                      toast.success('Oferta Desativada');
                    } else {
                      if (input) input.value = 'promo_6_6';
                      // Se não tiver valor promo ainda, sugere 50% do valor atual
                      if (promoValueInput && !promoValueInput.value) {
                        const baseVal = Number((document.getElementById('edit-value') as HTMLInputElement)?.value || 0);
                        promoValueInput.value = (baseVal * 0.8).toFixed(2);
                      }
                      toast.success('Oferta 6+6 Ativada!');
                    }
                    // Força re-render para mostrar o campo de valor se necessário (na prática o usuário verá o campo agora)
                    const container = document.getElementById('promo-value-container');
                    if (container) container.classList.toggle('hidden', input?.value !== 'promo_6_6');
                  }}
                >
                  {lead.source_tag === 'promo_6_6' ? 'Ativado' : 'Ativar'}
                </Button>
              </div>
              
              <div id="promo-value-container" className={lead.source_tag === 'promo_6_6' ? '' : 'hidden'}>
                <Label htmlFor="edit-promo-value" className="text-[10px] uppercase font-bold text-muted-foreground">Valor nos primeiros 6 meses</Label>
                <div className="relative mt-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input 
                    id="edit-promo-value" 
                    name="promo_value" 
                    type="number" 
                    step="0.01" 
                    placeholder="Valor promocional"
                    defaultValue={(lead.referral_info as any)?.promo_value || ''} 
                    className="pl-8 h-8 text-sm bg-background" 
                  />
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">Este valor será aplicado automaticamente nas primeiras 6 parcelas da proposta anual.</p>
              </div>
              
              <input type="hidden" id="edit-source-tag" name="source_tag" defaultValue={lead.source_tag || ''} />
            </div>
          </div>
          <Button type="submit" className="w-full mt-4">
            Salvar Alterações
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteLeadDialog({ leadName, onDelete }: { leadName: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50" title="Excluir lead">
          <Trash2 size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir lead?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir o lead <strong>{leadName}</strong>? Esta ação não pode ser desfeita.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => {
            onDelete();
            setOpen(false);
          }}>Excluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TransferPreviewRow {
  table: string;
  label: string;
  count: number;
}

interface TransferPreview {
  client: { id: string; name: string };
  from: string;
  to: string;
  same_city: boolean;
  total_records: number;
  tables_affected: number;
  details: TransferPreviewRow[];
}

const CITY_LABELS: Record<string, string> = { minacu: 'Minaçu', uruacu: 'Uruaçu' };

function TransferClientDialog({ lead, onUpdate }: { lead: Lead; onUpdate: () => void }) {
  const [open, setOpen] = useState(false);
  const [targetCity, setTargetCity] = useState(lead.city?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c') === 'minacu' ? 'Uruaçu' : 'Minaçu');
  const [isBusy, setIsBusy] = useState(false);
  const [step, setStep] = useState<'confirm' | 'validating' | 'preview' | 'preparing' | 'done'>('confirm');
  const [preview, setPreview] = useState<TransferPreview | null>(null);

  const resetState = () => {
    setStep('confirm');
    setPreview(null);
  };

  // Etapa 1: pré-validação (dry-run) — apenas contagem, nada é alterado no banco.
  const handleValidate = async () => {
    setIsBusy(true);
    setStep('validating');
    try {
      const normalizedCity = targetCity.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ç/g, 'c');
      const res = await vpsAuthedFetch(
        `/api/clients/${lead.id}/transfer-preview?city=${encodeURIComponent(normalizedCity)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao validar a transferência');
      }
      const data: TransferPreview = await res.json();
      setPreview(data);
      setStep('preview');
    } catch (error: any) {
      toast.error(error.message);
      setStep('confirm');
    } finally {
      setIsBusy(false);
    }
  };

  // Etapa 2: execução real da transferência (cascata atômica no backend).
  const handleTransfer = async () => {
    setIsBusy(true);
    setStep('preparing');
    try {
      const res = await vpsAuthedFetch(`/api/clients/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify({ city: targetCity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao transferir cliente');
      }

      setStep('done');
      toast.success(`Cliente ${lead.name} transferido para ${targetCity} com sucesso!`);
      setTimeout(() => {
        setOpen(false);
        onUpdate();
        resetState();
      }, 1500);
    } catch (error: any) {
      toast.error(error.message);
      setStep('preview');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val);
        if (!val) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-[10px] bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100">
          <ArrowRightLeft className="h-3 w-3 mr-1" /> Transferir
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-orange-500" />
            Transferência de Cidade
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {step === 'confirm' && (
            <>
              <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg text-xs text-orange-800 space-y-2">
                <p><strong>Atenção:</strong> Ao transferir este cliente, todos os dados vinculados (histórico, tarefas, roteiros, financeiro) serão movidos para a cidade selecionada.</p>
                <p>O card sairá da pipeline de <strong>{lead.city}</strong> e aparecerá apenas em <strong>{targetCity}</strong>.</p>
              </div>

              <div className="space-y-2">
                <Label>Cidade de Destino</Label>
                <Select value={targetCity} onValueChange={setTargetCity}>
                  <SelectTrigger className="bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minacu">Minaçu</SelectItem>
                    <SelectItem value="uruacu">Uruaçu</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isBusy}>Cancelar</Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleValidate}
                  disabled={isBusy}
                >
                  Validar transferência
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'validating' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
              <div className="text-center space-y-1">
                <p className="font-bold">Analisando registros...</p>
                <p className="text-xs text-muted-foreground">Nenhum dado foi alterado ainda</p>
              </div>
            </div>
          )}

          {step === 'preview' && preview && (
            <>
              <div className="flex items-center justify-center gap-3 text-sm font-bold">
                <Badge variant="outline">{CITY_LABELS[preview.from.toLowerCase()] || preview.from}</Badge>
                <ArrowRightLeft className="h-4 w-4 text-orange-500" />
                <Badge className="bg-orange-500 text-white border-none">{CITY_LABELS[preview.to.toLowerCase()] || preview.to}</Badge>
              </div>

              {preview.same_city && (
                <div className="p-3 rounded-lg bg-muted text-xs text-muted-foreground">
                  Este cliente já pertence a esta cidade. Nenhuma mudança será feita.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-muted/40 text-center">
                  <p className="text-2xl font-bold text-orange-500">{preview.total_records}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Registros afetados</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/40 text-center">
                  <p className="text-2xl font-bold text-orange-500">{preview.tables_affected}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Módulos envolvidos</p>
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
                {preview.details.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">Nenhum registro vinculado encontrado além do cadastro do cliente.</p>
                )}
                {preview.details.map((row) => (
                  <div key={row.table} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-medium">{row.label}</span>
                    <Badge variant="secondary" className="text-[10px]">{row.count}</Badge>
                  </div>
                ))}
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={resetState} disabled={isBusy}>Voltar</Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleTransfer}
                  disabled={isBusy || preview.same_city}
                >
                  OK, transferir agora
                </Button>
              </DialogFooter>
            </>
          )}

          {step === 'preparing' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="h-10 w-10 text-orange-500 animate-spin" />
              <div className="text-center space-y-1">
                <p className="font-bold">Organizando dados...</p>
                <p className="text-xs text-muted-foreground">Movendo histórico e registros para {targetCity}</p>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Badge className="bg-green-500 text-white border-none">OK</Badge>
              </div>
              <div className="text-center space-y-1">
                <p className="font-bold text-green-600">Transferência Concluída!</p>
                <p className="text-xs text-muted-foreground">O cliente agora pertence à unidade {targetCity}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


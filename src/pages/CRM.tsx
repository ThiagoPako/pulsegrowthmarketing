import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Flame, Snowflake, RotateCcw, MessageSquare, Briefcase, Phone, UserPlus } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { toast } from 'sonner';

type LeadStatus = 'lead' | 'contacted' | 'meeting' | 'contracted' | 'recovery_followup_1' | 'recovery_followup_2';
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
}

const STAGES: { id: LeadStatus; label: string; color: string }[] = [
  { id: 'lead', label: 'Possíveis Clientes', color: 'bg-slate-100' },
  { id: 'contacted', label: 'Contato Efetuado', color: 'bg-blue-50' },
  { id: 'meeting', label: 'Reunião Agendada', color: 'bg-purple-50' },
  { id: 'contracted', label: 'Contrato Fechado', color: 'bg-green-50' },
];

const RECOVERY_STAGES: { id: LeadStatus; label: string; color: string }[] = [
  { id: 'recovery_followup_1', label: 'Follow-up 1', color: 'bg-orange-50' },
  { id: 'recovery_followup_2', label: 'Follow-up 2', color: 'bg-red-50' },
];

export default function CRM() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isRecoveryView, setIsRecoveryView] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const { data: leads = [], isLoading } = useQuery({
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

  const updateLeadStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase
        .from('crm_leads')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
      toast.success('Lead atualizado com sucesso!');
    },
  });

  const createLead = useMutation({
    mutationFn: async (newLead: Partial<Lead>) => {
      if (!newLead.name) throw new Error('Nome é obrigatório');
      const { error } = await supabase
        .from('crm_leads')
        .insert([{ 
          name: newLead.name,
          company: newLead.company,
          phone: newLead.phone,
          contract_value: newLead.contract_value,
          status: newLead.status || 'lead',
          user_id: user?.id 
        }]);
      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm_leads'] });
      setIsAddDialogOpen(false);
      toast.success('Novo lead cadastrado!');
    },
  });

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    updateLeadStatus.mutate({ id: draggableId, status: destination.droppableId as LeadStatus });
  };

  const totals = useMemo(() => {
    const stats: Record<string, number> = {};
    leads.forEach(lead => {
      stats[lead.status] = (stats[lead.status] || 0) + Number(lead.contract_value);
    });
    return stats;
  }, [leads]);

  const currentStages = isRecoveryView ? RECOVERY_STAGES : STAGES;

  return (
    <div className="p-6 h-full flex flex-col gap-6 bg-background">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            CRM - {isRecoveryView ? 'Recuperação de Vendas' : 'Pipeline Principal'}
          </h1>
          <p className="text-muted-foreground text-sm">Gerencie seus leads e oportunidades</p>
        </div>
        
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => setIsRecoveryView(!isRecoveryView)}
            className="flex items-center gap-2"
          >
            {isRecoveryView ? <RotateCcw size={16} /> : <RotateCcw size={16} />}
            {isRecoveryView ? 'Ver Pipeline Principal' : 'Ver Recuperação'}
          </Button>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <UserPlus size={16} />
                Novo Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Lead</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                createLead.mutate({
                  name: formData.get('name') as string,
                  company: formData.get('company') as string,
                  phone: formData.get('phone') as string,
                  contract_value: Number(formData.get('value')),
                  status: 'lead'
                });
              }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome do Contato</Label>
                  <Input name="name" required placeholder="Ex: João Silva" />
                </div>
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Input name="company" placeholder="Ex: Pulse Agency" />
                </div>
                <div className="space-y-2">
                  <Label>Valor do Contrato Possível</Label>
                  <Input name="value" type="number" step="0.01" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp / Telefone</Label>
                  <Input name="phone" placeholder="(00) 00000-0000" />
                </div>
                <Button type="submit" className="w-full" disabled={createLead.isPending}>
                  Cadastrar Lead
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full min-w-max pb-4">
            {currentStages.map((stage) => (
              <div key={stage.id} className={`w-80 flex flex-col rounded-lg border bg-slate-50/50 p-3 h-full`}>
                <div className="flex flex-col mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm">{stage.label}</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {leads.filter(l => l.status === stage.id).length}
                    </Badge>
                  </div>
                  <p className="text-xs font-bold text-primary">
                    Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals[stage.id] || 0)}
                  </p>
                </div>

                <Droppable droppableId={stage.id}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="flex-1 space-y-3 overflow-y-auto"
                    >
                      {leads
                        .filter((lead) => lead.status === stage.id)
                        .map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided) => (
                              <Card
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className="p-3 shadow-sm border-l-4 border-l-primary hover:shadow-md transition-shadow group relative"
                              >
                                <div className="flex flex-col gap-2">
                                  <div className="flex justify-between items-start">
                                    <span className="font-medium text-sm truncate pr-6">{lead.name}</span>
                                    <div className="absolute top-2 right-2 flex gap-1">
                                      {lead.tag === 'hot' && <Flame className="text-orange-500" size={14} />}
                                      {lead.tag === 'cold' && <Snowflake className="text-blue-500" size={14} />}
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <Briefcase size={12} />
                                    <span className="truncate">{lead.company || 'N/A'}</span>
                                  </div>

                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-xs font-bold text-primary">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.contract_value)}
                                    </span>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {stage.id === 'contacted' && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                                          title="Enviar para Recuperação"
                                          onClick={() => updateLeadStatus.mutate({ id: lead.id, status: 'recovery_followup_1' })}
                                        >
                                          <RotateCcw size={14} />
                                        </Button>
                                      )}
                                      {(stage.id === 'recovery_followup_1' || stage.id === 'recovery_followup_2') && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7 text-purple-500 hover:text-purple-600 hover:bg-purple-50"
                                          title="Voltar para Reunião"
                                          onClick={() => updateLeadStatus.mutate({ id: lead.id, status: 'meeting' })}
                                        >
                                          <Briefcase size={14} />
                                        </Button>
                                      )}
                                      <LeadDetailsDialog lead={lead} onUpdate={() => queryClient.invalidateQueries({ queryKey: ['crm_leads'] })} />
                                    </div>
                                  </div>

                                  <div className="flex gap-1 mt-1">
                                    <TagSelector leadId={lead.id} currentTag={lead.tag} />
                                  </div>
                                </div>
                              </Card>
                            )}
                          </Draggable>
                        ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}

function TagSelector({ leadId, currentTag, onUpdate }: { leadId: string, currentTag: LeadTag | null, onUpdate?: () => void }) {
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
    <div className="flex gap-1">
      <Badge 
        variant={currentTag === 'hot' ? 'default' : 'outline'} 
        className={`text-[9px] cursor-pointer hover:bg-orange-100 ${currentTag === 'hot' ? 'bg-orange-500 text-white' : ''}`}
        onClick={() => updateTag.mutate(currentTag === 'hot' ? null : 'hot')}
      >
        Quente
      </Badge>
      <Badge 
        variant={currentTag === 'cold' ? 'default' : 'outline'} 
        className={`text-[9px] cursor-pointer hover:bg-blue-100 ${currentTag === 'cold' ? 'bg-blue-500 text-white' : ''}`}
        onClick={() => updateTag.mutate(currentTag === 'cold' ? null : 'cold')}
      >
        Frio
      </Badge>
    </div>
  );
}

function LeadDetailsDialog({ lead, onUpdate }: { lead: Lead, onUpdate: () => void }) {
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
      toast.success('Informação adicionada!');
    }
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary">
          <MessageSquare size={14} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Informações do Lead: {lead.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-6 mt-4">
          <div className="space-y-4">
            <div className="p-3 bg-secondary rounded-lg space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Dados Gerais</p>
              <div className="flex items-center gap-2 text-sm">
                <Briefcase size={14} className="text-primary" />
                <span>{lead.company || 'Não informado'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone size={14} className="text-primary" />
                <span>{lead.phone || 'Não informado'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold text-primary">Valor: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.contract_value)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Adicionar Observação Relevante</Label>
              <Textarea 
                placeholder="Descreva o que aconteceu nesta etapa..." 
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button onClick={() => addNote.mutate()} disabled={!note} className="w-full">Salvar Informação</Button>
            </div>
          </div>

          <div className="space-y-4">
            <Label>Histórico da Jornada</Label>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {notes.map((n: any) => (
                <div key={n.id} className="p-3 border rounded-lg bg-slate-50 relative">
                  <Badge variant="outline" className="text-[9px] absolute top-2 right-2 uppercase">
                    {n.stage}
                  </Badge>
                  <p className="text-xs whitespace-pre-wrap mt-1">{n.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {new Date(n.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-center text-muted-foreground text-xs py-10">Nenhuma observação registrada.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

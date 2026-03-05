import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Package, DollarSign, Film, Image, BookImage, Palette } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  description: string;
  reels_qty: number;
  creatives_qty: number;
  stories_qty: number;
  arts_qty: number;
  recording_sessions: number;
  recording_hours: number;
  extra_content_allowed: number;
  price: number;
  periodicity: string;
  status: string;
}

const PERIODICITY_LABELS: Record<string, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

const emptyPlan = (): Partial<Plan> => ({
  name: '', description: '', reels_qty: 0, creatives_qty: 0, stories_qty: 0, arts_qty: 0,
  recording_sessions: 0, recording_hours: 0, extra_content_allowed: 0, price: 0,
  periodicity: 'mensal', status: 'ativo',
});

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<Partial<Plan>>(emptyPlan());
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase.from('plans').select('*').order('created_at', { ascending: false });
    if (data) setPlans(data as Plan[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleOpen = (plan?: Plan) => {
    if (plan) { setEditing(plan); setForm(plan); }
    else { setEditing(null); setForm(emptyPlan()); }
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('Nome do plano é obrigatório'); return; }
    if (editing) {
      const { error } = await supabase.from('plans').update({
        name: form.name, description: form.description, reels_qty: form.reels_qty,
        creatives_qty: form.creatives_qty, stories_qty: form.stories_qty, arts_qty: form.arts_qty,
        recording_sessions: form.recording_sessions, recording_hours: form.recording_hours,
        extra_content_allowed: form.extra_content_allowed, price: form.price,
        periodicity: form.periodicity, status: form.status, updated_at: new Date().toISOString(),
      } as any).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar plano'); return; }
      toast.success('Plano atualizado');
    } else {
      const { error } = await supabase.from('plans').insert({
        name: form.name, description: form.description, reels_qty: form.reels_qty,
        creatives_qty: form.creatives_qty, stories_qty: form.stories_qty, arts_qty: form.arts_qty,
        recording_sessions: form.recording_sessions, recording_hours: form.recording_hours,
        extra_content_allowed: form.extra_content_allowed, price: form.price,
        periodicity: form.periodicity, status: form.status,
      } as any);
      if (error) { toast.error('Erro ao criar plano'); return; }
      toast.success('Plano criado');
    }
    setOpen(false);
    fetchPlans();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este plano?')) return;
    await supabase.from('plans').delete().eq('id', id);
    toast.success('Plano removido');
    fetchPlans();
  };

  const toggleStatus = async (plan: Plan) => {
    const newStatus = plan.status === 'ativo' ? 'inativo' : 'ativo';
    await supabase.from('plans').update({ status: newStatus } as any).eq('id', plan.id);
    fetchPlans();
  };

  const setField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planos</h1>
          <p className="text-sm text-muted-foreground">Gerencie os planos de marketing da agência</p>
        </div>
        <Button onClick={() => handleOpen()} className="gap-2"><Plus size={16} /> Novo Plano</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Package size={40} className="text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhum plano cadastrado</p>
            <Button variant="outline" onClick={() => handleOpen()} className="gap-2"><Plus size={16} /> Criar Plano</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map(plan => (
            <Card key={plan.id} className={`relative transition-all ${plan.status === 'inativo' ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{plan.name}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">{plan.description || 'Sem descrição'}</CardDescription>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpen(plan)}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(plan.id)}><Trash2 size={14} /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">R$ {Number(plan.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <Badge variant={plan.status === 'ativo' ? 'default' : 'secondary'} className="cursor-pointer" onClick={() => toggleStatus(plan)}>
                    {plan.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <Badge variant="outline">{PERIODICITY_LABELS[plan.periodicity] || plan.periodicity}</Badge>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5"><Film size={12} className="text-primary" /><span>{plan.reels_qty} Reels</span></div>
                  <div className="flex items-center gap-1.5"><Image size={12} className="text-primary" /><span>{plan.creatives_qty} Criativos</span></div>
                  {plan.stories_qty > 0 && <div className="flex items-center gap-1.5"><BookImage size={12} className="text-primary" /><span>{plan.stories_qty} Stories</span></div>}
                  {plan.arts_qty > 0 && <div className="flex items-center gap-1.5"><Palette size={12} className="text-primary" /><span>{plan.arts_qty} Artes</span></div>}
                  <div className="flex items-center gap-1.5"><span className="text-muted-foreground">{plan.recording_sessions} gravações</span></div>
                  <div className="flex items-center gap-1.5"><span className="text-muted-foreground">{plan.recording_hours}h gravação</span></div>
                  {plan.extra_content_allowed > 0 && <div className="col-span-2 text-muted-foreground">+{plan.extra_content_allowed} extras permitidos</div>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome do Plano *</Label>
              <Input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Ex: Plano Growth" />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Descrição do plano..." rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Reels</Label>
                <Input type="number" min={0} value={form.reels_qty} onChange={e => setField('reels_qty', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Criativos</Label>
                <Input type="number" min={0} value={form.creatives_qty} onChange={e => setField('creatives_qty', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Stories (opcional)</Label>
                <Input type="number" min={0} value={form.stories_qty} onChange={e => setField('stories_qty', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Artes (opcional)</Label>
                <Input type="number" min={0} value={form.arts_qty} onChange={e => setField('arts_qty', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Gravações presenciais</Label>
                <Input type="number" min={0} value={form.recording_sessions} onChange={e => setField('recording_sessions', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Horas de gravação</Label>
                <Input type="number" min={0} step={0.5} value={form.recording_hours} onChange={e => setField('recording_hours', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Extras permitidos</Label>
                <Input type="number" min={0} value={form.extra_content_allowed} onChange={e => setField('extra_content_allowed', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input type="number" min={0} step={0.01} value={form.price} onChange={e => setField('price', parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Periodicidade</Label>
                <Select value={form.periodicity} onValueChange={v => setField('periodicity', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERIODICITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setField('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>{editing ? 'Salvar' : 'Criar Plano'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

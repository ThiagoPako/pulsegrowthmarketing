import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Target, Users, DollarSign, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type GoalType = 'clients' | 'faturamento' | 'lucro';
type GoalPeriod = 'semanal' | 'mensal' | 'trimestral' | 'anual';
type GoalStatus = 'em_andamento' | 'concluida' | 'cancelada';

interface Goal {
  id: string;
  type: GoalType;
  title: string;
  target_value: number;
  current_value: number;
  period: GoalPeriod;
  start_date: string;
  end_date: string;
  status: GoalStatus;
  notes: string | null;
  created_at: string;
}

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  semanal: 'Semanal',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

const STATUS_LABELS: Record<GoalStatus, string> = {
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const TYPE_CONFIG: Record<GoalType, { label: string; icon: React.ReactNode; unit: string }> = {
  clients: { label: 'Clientes', icon: <Users size={18} />, unit: 'clientes' },
  faturamento: { label: 'Faturamento', icon: <DollarSign size={18} />, unit: 'R$' },
  lucro: { label: 'Lucro', icon: <TrendingUp size={18} />, unit: 'R$' },
};

const emptyForm = {
  title: '',
  target_value: '',
  current_value: '',
  period: 'mensal' as GoalPeriod,
  start_date: format(new Date(), 'yyyy-MM-dd'),
  end_date: '',
  status: 'em_andamento' as GoalStatus,
  notes: '',
};

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<GoalType>('clients');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchGoals = useCallback(async () => {
    const { data, error } = await supabase.from('goals').select('*').order('created_at', { ascending: false });
    if (error) { toast.error('Erro ao carregar metas'); return; }
    setGoals((data as Goal[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const openNew = () => {
    setEditingGoal(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setForm({
      title: goal.title,
      target_value: String(goal.target_value),
      current_value: String(goal.current_value),
      period: goal.period,
      start_date: goal.start_date,
      end_date: goal.end_date,
      status: goal.status,
      notes: goal.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.target_value) { toast.error('Preencha título e valor alvo'); return; }
    const payload = {
      type: activeTab,
      title: form.title,
      target_value: Number(form.target_value),
      current_value: Number(form.current_value) || 0,
      period: form.period,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      status: form.status,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    };

    if (editingGoal) {
      const { error } = await supabase.from('goals').update(payload).eq('id', editingGoal.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Meta atualizada');
    } else {
      const { error } = await supabase.from('goals').insert(payload);
      if (error) { toast.error('Erro ao criar'); return; }
      toast.success('Meta criada');
    }
    setDialogOpen(false);
    fetchGoals();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta meta?')) return;
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir'); return; }
    toast.success('Meta excluída');
    fetchGoals();
  };

  const filtered = goals.filter(g => g.type === activeTab);

  const formatValue = (val: number, type: GoalType) =>
    type === 'clients' ? String(val) : `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const GoalCard = ({ goal }: { goal: Goal }) => {
    const progress = goal.target_value > 0 ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100)) : 0;
    return (
      <Card className="group">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-base">{goal.title}</h3>
                <Badge variant={goal.status === 'concluida' ? 'default' : goal.status === 'cancelada' ? 'destructive' : 'secondary'} className="text-[10px]">
                  {STATUS_LABELS[goal.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {PERIOD_LABELS[goal.period]} · {format(parseISO(goal.start_date), "dd/MM/yy")} → {format(parseISO(goal.end_date), "dd/MM/yy")}
              </p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(goal)}><Pencil size={14} /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(goal.id)}><Trash2 size={14} /></Button>
            </div>
          </div>

          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs text-muted-foreground">Atual</p>
              <p className="text-lg font-bold">{formatValue(goal.current_value, goal.type)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Meta</p>
              <p className="text-lg font-bold text-primary">{formatValue(goal.target_value, goal.type)}</p>
            </div>
          </div>

          <Progress value={progress} className="h-2.5 mb-1.5" />
          <p className={`text-xs font-medium text-right ${progress >= 100 ? 'text-green-500' : progress >= 70 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
            {progress}%
          </p>

          {goal.notes && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{goal.notes}</p>}
        </CardContent>
      </Card>
    );
  };

  const summaryForType = (type: GoalType) => {
    const items = goals.filter(g => g.type === type && g.status === 'em_andamento');
    const totalTarget = items.reduce((s, g) => s + g.target_value, 0);
    const totalCurrent = items.reduce((s, g) => s + g.current_value, 0);
    const avgProgress = items.length > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
    return { count: items.length, avgProgress: isNaN(avgProgress) ? 0 : Math.min(100, avgProgress) };
  };

  if (loading) return <div className="flex items-center justify-center p-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2"><Target size={24} /> Metas</h1>
          <p className="text-sm text-muted-foreground">Gerencie metas de clientes, faturamento e lucro</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus size={16} /> Nova Meta</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(['clients', 'faturamento', 'lucro'] as GoalType[]).map(type => {
          const { count, avgProgress } = summaryForType(type);
          const cfg = TYPE_CONFIG[type];
          return (
            <Card key={type} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab(type)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">{cfg.icon}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground">{count} meta(s) ativa(s)</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${avgProgress >= 100 ? 'text-green-500' : avgProgress >= 70 ? 'text-yellow-500' : 'text-foreground'}`}>{avgProgress}%</p>
                  <p className="text-[10px] text-muted-foreground">média</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as GoalType)}>
        <TabsList>
          <TabsTrigger value="clients" className="gap-1.5"><Users size={14} /> Clientes</TabsTrigger>
          <TabsTrigger value="faturamento" className="gap-1.5"><DollarSign size={14} /> Faturamento</TabsTrigger>
          <TabsTrigger value="lucro" className="gap-1.5"><TrendingUp size={14} /> Lucro</TabsTrigger>
        </TabsList>

        {(['clients', 'faturamento', 'lucro'] as GoalType[]).map(type => (
          <TabsContent key={type} value={type}>
            {filtered.length === 0 ? (
              <Card><CardContent className="p-12 text-center text-muted-foreground">
                Nenhuma meta de {TYPE_CONFIG[type].label.toLowerCase()} cadastrada
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map(g => <GoalCard key={g.id} goal={g} />)}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGoal ? 'Editar Meta' : 'Nova Meta'} — {TYPE_CONFIG[activeTab].label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Atingir 30 clientes ativos" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor Alvo {activeTab !== 'clients' && '(R$)'}</Label>
                <Input type="number" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} />
              </div>
              <div>
                <Label>Valor Atual {activeTab !== 'clients' && '(R$)'}</Label>
                <Input type="number" value={form.current_value} onChange={e => setForm(f => ({ ...f, current_value: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Período</Label>
                <Select value={form.period} onValueChange={v => setForm(f => ({ ...f, period: v as GoalPeriod }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERIOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as GoalStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>Data Fim</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingGoal ? 'Salvar' : 'Criar Meta'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

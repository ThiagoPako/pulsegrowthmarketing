import { useMemo, useState, useEffect } from 'react';
import { useEndoTasks, getTaskTypeLabel } from '@/hooks/useEndomarketing';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle, Clock, Calendar, Megaphone, DollarSign, TrendingUp } from 'lucide-react';

interface PartnerEarnings {
  endoContracts: { client_name: string; partner_cost: number; status: string }[];
  completedTasks: number;
  totalEarnings: number;
}

export default function EndomarketingPartnerPanel() {
  const { user } = useAuth();
  const { tasks, loading, completeTask } = useEndoTasks(user?.id);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState('');
  const [earnings, setEarnings] = useState<PartnerEarnings>({ endoContracts: [], completedTasks: 0, totalEarnings: 0 });
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  // Fetch partner's financial data
  useEffect(() => {
    if (!user?.id) return;
    const fetchEarnings = async () => {
      // Endo contracts where this user is the partner
      const { data: endoContracts } = await supabase
        .from('client_endomarketing_contracts')
        .select('*, clients!client_endomarketing_contracts_client_id_fkey(company_name)')
        .eq('partner_id', user.id);

      // Completed tasks this month
      const [yearStr, monthStr] = selectedMonth.split('-');
      const monthStart = `${yearStr}-${monthStr}-01`;
      const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
      const monthEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

      const { data: monthTasks } = await supabase
        .from('endomarketing_partner_tasks')
        .select('*')
        .eq('partner_id', user.id)
        .eq('status', 'concluida')
        .gte('date', monthStart)
        .lte('date', monthEnd);

      const activeContracts = (endoContracts || []).filter(c => c.status === 'ativo');
      const totalMonthly = activeContracts.reduce((sum, c) => sum + Number(c.partner_cost || 0), 0);

      setEarnings({
        endoContracts: (endoContracts || []).map(c => ({
          client_name: (c as any).clients?.company_name || 'Cliente',
          partner_cost: Number(c.partner_cost || 0),
          status: c.status,
        })),
        completedTasks: (monthTasks || []).length,
        totalEarnings: totalMonthly,
      });
    };
    fetchEarnings();
  }, [user?.id, selectedMonth]);
  const [notes, setNotes] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const todayTasks = useMemo(() => tasks.filter(t => t.date === today), [tasks, today]);
  const weekTasks = useMemo(() => tasks.filter(t => t.date >= weekStart && t.date <= weekEnd), [tasks, weekStart, weekEnd]);
  const myClients = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    tasks.forEach(t => { if (t.clients) map.set(t.client_id, { name: t.clients.company_name, color: t.clients.color }); });
    return [...map.values()];
  }, [tasks]);

  const stats = {
    todayTotal: todayTasks.length,
    todayDone: todayTasks.filter(t => t.status === 'concluida').length,
    weekTotal: weekTasks.length,
    weekDone: weekTasks.filter(t => t.status === 'concluida').length,
  };

  const openComplete = (id: string) => {
    setCompletingTaskId(id); setNotes(''); setCompleteDialogOpen(true);
  };

  const handleComplete = async () => {
    await completeTask(completingTaskId, notes);
    toast.success('Tarefa concluída! ✅');
    setCompleteDialogOpen(false);
  };

  if (loading) return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Megaphone size={28} className="text-primary" />
        <div>
          <h1 className="text-2xl font-display font-bold">Painel do Parceiro</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <Clock size={20} className="mx-auto mb-1 text-yellow-500" />
          <p className="text-2xl font-bold">{stats.todayTotal - stats.todayDone}</p>
          <p className="text-xs text-muted-foreground">Pendentes Hoje</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <CheckCircle size={20} className="mx-auto mb-1 text-emerald-500" />
          <p className="text-2xl font-bold">{stats.todayDone}</p>
          <p className="text-xs text-muted-foreground">Concluídas Hoje</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <Calendar size={20} className="mx-auto mb-1 text-blue-500" />
          <p className="text-2xl font-bold">{stats.weekTotal}</p>
          <p className="text-xs text-muted-foreground">Tarefas Semana</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{myClients.length}</p>
          <p className="text-xs text-muted-foreground">Meus Clientes</p>
        </CardContent></Card>
      </div>

      {/* Today's Tasks */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📋 Tarefas de Hoje</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {todayTasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa para hoje</p>}
          {todayTasks.map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 rounded-full" style={{ backgroundColor: `hsl(${t.clients?.color || '217 91% 60%'})` }} />
                <div>
                  <p className="text-sm font-medium">{t.clients?.company_name}</p>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px]">{getTaskTypeLabel(t.task_type)}</Badge>
                    <span className="text-xs text-muted-foreground">{t.duration_minutes}min</span>
                  </div>
                </div>
              </div>
              {t.status === 'pendente' ? (
                <Button size="sm" onClick={() => openComplete(t.id)}>
                  <CheckCircle size={14} className="mr-1" /> Concluir
                </Button>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">✅ Feito</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Week Tasks */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📅 Semana ({weekStart} a {weekEnd})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {weekTasks.filter(t => t.date !== today).map(t => (
            <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border border-border/50 bg-muted/10">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: `hsl(${t.clients?.color || '217 91% 60%'})` }} />
                <div>
                  <p className="text-xs font-medium">{t.clients?.company_name}</p>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(t.date + 'T12:00:00'), 'EEE dd/MM', { locale: ptBR })} · {getTaskTypeLabel(t.task_type)}</span>
                </div>
              </div>
              <Badge variant={t.status === 'concluida' ? 'default' : 'secondary'} className="text-[10px]">
                {t.status === 'concluida' ? '✅' : '⏳'}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* My Clients */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🏢 Meus Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {myClients.map(c => (
              <Badge key={c.name} variant="outline" className="text-sm py-1 px-3" style={{ borderColor: `hsl(${c.color})` }}>
                <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: `hsl(${c.color})` }} />
                {c.name}
              </Badge>
            ))}
            {myClients.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente atribuído</p>}
          </div>
        </CardContent>
      </Card>

      {/* Complete Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Concluir Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Como foi a execução..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleComplete}>✅ Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

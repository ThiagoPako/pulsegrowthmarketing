import { useState, useMemo } from 'react';
import { useEndoTasks, useEndoContracts, getTaskTypeLabel } from '@/hooks/useEndomarketing';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Zap, CheckCircle, XCircle, Clock, CalendarPlus, Filter, Send, MessageCircle } from 'lucide-react';

export default function EndomarketingTasks() {
  const { tasks, loading, completeTask, cancelTask, generateTasks } = useEndoTasks();
  const { contracts } = useEndoContracts();
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [genDialogOpen, setGenDialogOpen] = useState(false);
  const [genContractId, setGenContractId] = useState('');
  const [genFrom, setGenFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [genTo, setGenTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sendingNotifications, setSendingNotifications] = useState(false);

  const activeContracts = contracts.filter(c => c.status === 'ativo');

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterDate && t.date !== filterDate) return false;
      return true;
    });
  }, [tasks, filterStatus, filterDate]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(t => {
      const arr = map.get(t.date) || [];
      arr.push(t);
      map.set(t.date, arr);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const handleGenerate = async () => {
    if (!genContractId) { toast.error('Selecione um contrato'); return; }
    setGenerating(true);
    const ok = await generateTasks(genContractId, genFrom, genTo);
    setGenerating(false);
    if (ok) toast.success('Tarefas geradas com sucesso!');
    else toast.error('Erro ao gerar tarefas');
    setGenDialogOpen(false);
  };

  const openComplete = (taskId: string) => {
    setCompletingTaskId(taskId);
    setCompleteNotes('');
    setCompleteDialogOpen(true);
  };

  const handleComplete = async () => {
    await completeTask(completingTaskId, completeNotes);
    toast.success('Tarefa concluída! ✅');
    setCompleteDialogOpen(false);
  };

  const handleCancel = async (id: string) => {
    await cancelTask(id);
    toast.success('Tarefa cancelada');
  };

  const handleSendDailyNotifications = async () => {
    setSendingNotifications(true);
    try {
      const { data, error } = await supabase.functions.invoke('endo-daily-tasks-notify', {});
      if (error) throw error;
      const result = data as any;
      if (result.sent > 0) {
        toast.success(`📱 Notificações enviadas para ${result.sent} parceiro(s)!`, {
          description: result.errors?.length ? `⚠️ ${result.errors.length} erro(s)` : undefined,
        });
      } else {
        toast.info(result.message || 'Sem tarefas pendentes para hoje');
      }
    } catch (err: any) {
      toast.error('Erro ao enviar notificações', { description: err.message });
    }
    setSendingNotifications(false);
  };

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pendente').length,
    completed: tasks.filter(t => t.status === 'concluida').length,
    cancelled: tasks.filter(t => t.status === 'cancelada').length,
  };

  if (loading) return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Tarefas Endomarketing</h1>
          <p className="text-sm text-muted-foreground">{stats.pending} pendentes · {stats.completed} concluídas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSendDailyNotifications} disabled={sendingNotifications}>
            <MessageCircle size={16} className="mr-1" />
            {sendingNotifications ? 'Enviando...' : 'Enviar Tarefas via WhatsApp'}
          </Button>
          <Button onClick={() => setGenDialogOpen(true)}>
            <CalendarPlus size={16} className="mr-1" /> Gerar Tarefas
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="glass-card"><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p><p className="text-xs text-muted-foreground">Pendentes</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-emerald-500">{stats.completed}</p><p className="text-xs text-muted-foreground">Concluídas</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-red-400">{stats.cancelled}</p><p className="text-xs text-muted-foreground">Canceladas</p>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data</Label>
          <Input type="date" className="w-[160px]" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        </div>
        {filterDate && <Button variant="ghost" size="sm" onClick={() => setFilterDate('')}>Limpar</Button>}
      </div>

      {/* Task List grouped by date */}
      <div className="space-y-4">
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa encontrada</p>
        )}
        {grouped.map(([date, dateTasks]) => (
          <div key={date}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">
              {format(new Date(date + 'T12:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h3>
            <div className="space-y-2">
              {dateTasks.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 rounded-full" style={{ backgroundColor: `hsl(${t.clients?.color || '217 91% 60%'})` }} />
                    <div>
                      <p className="text-sm font-medium">{t.clients?.company_name}</p>
                      <div className="flex gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px]">{getTaskTypeLabel(t.task_type)}</Badge>
                        <span className="text-xs text-muted-foreground">{t.duration_minutes}min</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === 'pendente' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleCancel(t.id)}>
                          <XCircle size={14} className="text-red-400" />
                        </Button>
                        <Button size="sm" onClick={() => openComplete(t.id)}>
                          <CheckCircle size={14} className="mr-1" /> Concluir
                        </Button>
                      </>
                    )}
                    {t.status === 'concluida' && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">✅ Concluída</Badge>}
                    {t.status === 'cancelada' && <Badge variant="destructive">Cancelada</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Generate Tasks Dialog */}
      <Dialog open={genDialogOpen} onOpenChange={setGenDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar Tarefas Automáticas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Contrato</Label>
              <Select value={genContractId} onValueChange={setGenContractId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activeContracts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.clients?.company_name} — {c.endomarketing_packages?.package_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>De</Label>
                <Input type="date" value={genFrom} onChange={e => setGenFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Até</Label>
                <Input type="date" value={genTo} onChange={e => setGenTo(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              As tarefas pendentes existentes no período serão substituídas. Tarefas já concluídas serão mantidas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? 'Gerando...' : 'Gerar Tarefas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Task Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Concluir Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Observações (opcional)</Label>
              <Textarea value={completeNotes} onChange={e => setCompleteNotes(e.target.value)} placeholder="Detalhes da execução..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleComplete}>✅ Confirmar Conclusão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

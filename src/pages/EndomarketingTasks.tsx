import { useState, useMemo } from 'react';
import { useEndoTasks, useEndoContracts, getTaskTypeLabel } from '@/hooks/useEndomarketing';
import { supabase } from '@/lib/vpsDb';
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
import { Rocket, CheckCircle, XCircle, Clock, CalendarPlus, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function EndomarketingTasks() {
  const { tasks, loading, completeTask, cancelTask, generateTasks } = useEndoTasks();
  const { contracts } = useEndoContracts(false);
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

  const formatTaskGroupDate = (dateValue: string) => {
    const parsed = new Date(`${dateValue}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return format(parsed, "EEEE, dd 'de' MMMM", { locale: ptBR });
  };

  const activeContracts = contracts.filter(c => c.status === 'ativo');

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterDate && t.date !== filterDate) return false;
      return true;
    });
  }, [tasks, filterStatus, filterDate]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach(t => {
      if (!t.date) return;
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

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <motion.div animate={{ y: [0, -10, 0], rotate: [0, -15, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
        <Rocket size={32} className="text-primary -rotate-45" />
      </motion.div>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-5 px-1 sm:px-0">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ y: [0, -5, 0], rotate: [0, -10, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative shrink-0"
          >
            <Rocket size={22} className="text-primary -rotate-45" />
            <motion.div
              animate={{ opacity: [0.5, 1, 0.3], scale: [0.8, 1.2, 0.6] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-3 rounded-full bg-gradient-to-t from-warning via-primary to-transparent blur-[2px] rotate-45"
            />
          </motion.div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-display font-bold truncate">Tarefas Endomarketing</h1>
            <p className="text-[10px] sm:text-sm text-muted-foreground">{stats.pending} pendentes · {stats.completed} concluídas</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:gap-2">
          <Button variant="outline" size="sm" onClick={handleSendDailyNotifications} disabled={sendingNotifications} className="text-[10px] sm:text-sm h-8 px-2 sm:px-3 gap-1">
            <MessageCircle size={13} />
            <span className="truncate">{sendingNotifications ? 'Enviando...' : 'WhatsApp'}</span>
          </Button>
          <Button size="sm" onClick={() => setGenDialogOpen(true)} className="text-[10px] sm:text-sm h-8 px-2 sm:px-3 gap-1">
            <CalendarPlus size={13} /> <span className="truncate">Gerar Tarefas</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground', border: 'border-border', bg: '' },
          { label: 'Pendentes', value: stats.pending, color: 'text-warning', border: 'border-warning/30', bg: 'bg-warning/5' },
          { label: 'Concluídas', value: stats.completed, color: 'text-success', border: 'border-success/30', bg: 'bg-success/5' },
          { label: 'Canceladas', value: stats.cancelled, color: 'text-destructive', border: 'border-destructive/30', bg: 'bg-destructive/5' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ scale: 1.03 }}
          >
            <Card className={`glass-card border-2 ${s.border} ${s.bg} relative overflow-hidden`}>
              <CardContent className="p-3 text-center">
                <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</p>
                <motion.div
                  animate={{ y: [10, -20], opacity: [0, 0.15, 0] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                  className="absolute top-1 right-1"
                >
                  <Rocket size={8} className="text-muted-foreground/20 -rotate-45" />
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[120px] sm:w-[140px] h-8 sm:h-9 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
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
          <Input type="date" className="w-[140px] sm:w-[160px] h-8 sm:h-9 text-xs sm:text-sm" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        </div>
        {filterDate && <Button variant="ghost" size="sm" onClick={() => setFilterDate('')} className="text-xs h-8">Limpar</Button>}
      </div>

      {/* Task List */}
      <div className="space-y-4">
        {grouped.length === 0 && (
          <div className="text-center py-8">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
              <Rocket size={28} className="text-muted-foreground/30 -rotate-45 mx-auto" />
            </motion.div>
            <p className="text-sm text-muted-foreground mt-2">Nenhuma tarefa encontrada</p>
          </div>
        )}
        {grouped.map(([date, dateTasks]) => (
          <motion.div key={date} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
            <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2 capitalize">
              {formatTaskGroupDate(date)}
            </h3>
            <div className="space-y-1.5 sm:space-y-2">
              {dateTasks.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="rounded-xl border-2 border-border bg-card hover:bg-muted/30 transition-colors"
                >
                  {/* Main info row */}
                  <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3">
                    <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: `hsl(${t.clients?.color || '217 91% 60%'})` }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate">{t.clients?.company_name}</p>
                      <div className="flex gap-1.5 mt-0.5 flex-wrap items-center">
                        <Badge variant="outline" className="text-[9px] sm:text-[10px]">{getTaskTypeLabel(t.task_type)}</Badge>
                        <span className="text-[10px] sm:text-xs text-muted-foreground">{t.duration_minutes}min</span>
                        {t.start_time && (
                          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                            <Clock size={10} /> {t.start_time}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Desktop actions */}
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      {t.status === 'pendente' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleCancel(t.id)}>
                            <XCircle size={14} className="text-destructive" />
                          </Button>
                          <Button size="sm" onClick={() => openComplete(t.id)} className="gap-1">
                            <CheckCircle size={14} /> Concluir
                          </Button>
                        </>
                      )}
                      {t.status === 'concluida' && <Badge className="bg-success/15 text-success border border-success/30 text-xs">✅ Concluída</Badge>}
                      {t.status === 'cancelada' && <Badge variant="destructive" className="text-xs">Cancelada</Badge>}
                    </div>
                    {/* Mobile status badge */}
                    <div className="sm:hidden shrink-0">
                      {t.status === 'concluida' && <Badge className="bg-success/15 text-success border border-success/30 text-[9px]">✅</Badge>}
                      {t.status === 'cancelada' && <Badge variant="destructive" className="text-[9px]">❌</Badge>}
                    </div>
                  </div>
                  {/* Mobile action buttons */}
                  {t.status === 'pendente' && (
                    <div className="flex sm:hidden gap-1.5 px-2.5 pb-2.5">
                      <Button size="sm" variant="outline" onClick={() => handleCancel(t.id)} className="flex-1 h-8 text-xs gap-1 text-destructive border-destructive/30">
                        <XCircle size={12} /> Cancelar
                      </Button>
                      <Button size="sm" onClick={() => openComplete(t.id)} className="flex-1 h-8 text-xs gap-1">
                        <CheckCircle size={12} /> Concluir
                      </Button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Generate Tasks Dialog */}
      <Dialog open={genDialogOpen} onOpenChange={setGenDialogOpen}>
        <DialogContent className="mx-2 sm:mx-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-sm sm:text-base">Gerar Tarefas Automáticas</DialogTitle></DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">Contrato</Label>
              <Select value={genContractId} onValueChange={setGenContractId}>
                <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {activeContracts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.clients?.company_name} — {c.endomarketing_packages?.package_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">De</Label>
                <Input type="date" value={genFrom} onChange={e => setGenFrom(e.target.value)} className="h-8 sm:h-9 text-xs sm:text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Até</Label>
                <Input type="date" value={genTo} onChange={e => setGenTo(e.target.value)} className="h-8 sm:h-9 text-xs sm:text-sm" />
              </div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              As tarefas pendentes existentes no período serão substituídas. Tarefas já concluídas serão mantidas.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setGenDialogOpen(false)} size="sm">Cancelar</Button>
            <Button onClick={handleGenerate} disabled={generating} size="sm" className="gap-1">
              <Rocket size={14} className="-rotate-45" />
              {generating ? 'Gerando...' : 'Gerar Tarefas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Task Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="mx-2 sm:mx-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-sm sm:text-base">Concluir Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs sm:text-sm">Observações (opcional)</Label>
              <Textarea value={completeNotes} onChange={e => setCompleteNotes(e.target.value)} placeholder="Detalhes da execução..." rows={3} className="text-xs sm:text-sm" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)} size="sm">Cancelar</Button>
            <Button onClick={handleComplete} size="sm" className="gap-1">
              <CheckCircle size={14} /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { KanbanColumn, KanbanTask } from '@/types';
import { COLUMN_LABELS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, GripVertical } from 'lucide-react';
import { startOfWeek, format } from 'date-fns';
import { motion } from 'framer-motion';

const COLUMNS: KanbanColumn[] = ['backlog', 'em_producao', 'gravado', 'finalizado'];
const columnColors: Record<KanbanColumn, string> = {
  backlog: 'border-t-muted-foreground',
  em_producao: 'border-t-warning',
  gravado: 'border-t-info',
  finalizado: 'border-t-success',
};

export default function KanbanBoard() {
  const { tasks, clients, addTask, updateTask, deleteTask } = useApp();
  const [newOpen, setNewOpen] = useState(false);
  const [filterClient, setFilterClient] = useState('all');
  const [form, setForm] = useState({ clientId: '', title: '', checklistText: '' });

  const currentWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const filtered = useMemo(() => {
    let t = tasks.filter(t => t.weekStart === currentWeek);
    if (filterClient !== 'all') t = t.filter(t => t.clientId === filterClient);
    return t;
  }, [tasks, filterClient, currentWeek]);

  const getColumnTasks = (col: KanbanColumn) => filtered.filter(t => t.column === col);

  const moveTask = (task: KanbanTask, newCol: KanbanColumn) => {
    updateTask({ ...task, column: newCol });
  };

  const toggleChecklist = (task: KanbanTask, checkId: string) => {
    const updated = { ...task, checklist: task.checklist.map(c => c.id === checkId ? { ...c, done: !c.done } : c) };
    updateTask(updated);
  };

  const getProgress = (task: KanbanTask) => {
    if (task.checklist.length === 0) return task.column === 'finalizado' ? 100 : 0;
    return Math.round((task.checklist.filter(c => c.done).length / task.checklist.length) * 100);
  };

  const handleBulkCreate = () => {
    if (!form.clientId) { toast.error('Selecione um cliente'); return; }
    const client = clients.find(c => c.id === form.clientId);
    if (!client) return;
    const count = client.weeklyGoal || 10;
    for (let i = 0; i < count; i++) {
      addTask({
        id: crypto.randomUUID(),
        clientId: form.clientId,
        title: `${form.title || 'Story'} ${i + 1}`,
        column: 'backlog',
        checklist: [
          { id: crypto.randomUUID(), text: 'Roteiro', done: false },
          { id: crypto.randomUUID(), text: 'Gravação', done: false },
          { id: crypto.randomUUID(), text: 'Edição', done: false },
        ],
        weekStart: currentWeek,
      });
    }
    toast.success(`${count} tarefas criadas`);
    setNewOpen(false);
  };

  const getClientName = (id: string) => clients.find(c => c.id === id)?.companyName || '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold">Endomarketing</h1>
        <div className="flex items-center gap-3">
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setForm({ clientId: '', title: 'Story', checklistText: '' }); setNewOpen(true); }}>
            <Plus size={16} className="mr-2" /> Gerar Tarefas
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 min-h-[400px]">
        {COLUMNS.map(col => (
          <div key={col} className={`glass-card border-t-2 ${columnColors[col]} p-3`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{COLUMN_LABELS[col]}</h3>
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{getColumnTasks(col).length}</span>
            </div>
            <div className="space-y-2">
              {getColumnTasks(col).map(task => (
                <motion.div key={task.id} layout className="bg-secondary/60 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{getClientName(task.clientId)}</p>
                    </div>
                    <GripVertical size={14} className="text-muted-foreground" />
                  </div>
                  <Progress value={getProgress(task)} className="h-1.5" />
                  <div className="space-y-1">
                    {task.checklist.map(item => (
                      <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={item.done} onCheckedChange={() => toggleChecklist(task, item.id)} />
                        <span className={item.done ? 'line-through text-muted-foreground' : ''}>{item.text}</span>
                      </label>
                    ))}
                  </div>
                  {/* Move buttons */}
                  <div className="flex gap-1 pt-1">
                    {COLUMNS.filter(c => c !== col).map(c => (
                      <button key={c} onClick={() => moveTask(task, c)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                        → {COLUMN_LABELS[c].split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar Tarefas Semanais</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Cliente</Label>
              <Select value={form.clientId} onValueChange={v => setForm({ ...form, clientId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName} (meta: {c.weeklyGoal})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Prefixo do título</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Story" />
            </div>
            <Button onClick={handleBulkCreate} className="w-full">Criar Tarefas</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

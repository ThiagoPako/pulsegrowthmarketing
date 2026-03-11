import { useState, useMemo, useCallback, DragEvent } from 'react';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask, DesignTaskColumn } from '@/hooks/useDesignTasks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Kanban, List, Clock, GripVertical } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import DesignTaskCreateDialog from '@/components/designer/DesignTaskCreateDialog';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';
import { toast } from 'sonner';

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon?: any }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  media: { label: 'Média', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  alta: { label: 'Alta', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed',
  story: 'Story',
  logomarca: 'Logomarca',
  midia_fisica: 'Mídia Física',
};

export default function DesignerKanban() {
  const { tasksQuery, updateTask, addHistory } = useDesignTasks();
  const { currentUser } = useApp();
  const { user } = useAuth();
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [createOpen, setCreateOpen] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = tasksQuery.data || [];
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  const tasksByColumn = useMemo(() => {
    const map: Record<string, DesignTask[]> = {};
    DESIGN_COLUMNS.forEach(c => { map[c.key] = []; });
    tasks.forEach(t => {
      if (map[t.kanban_column]) map[t.kanban_column].push(t);
    });
    return map;
  }, [tasks]);

  const handleDragStart = useCallback((e: DragEvent, task: DesignTask) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(task.id);
  }, []);

  const handleDragOver = useCallback((e: DragEvent, colKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(colKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent, targetColumn: DesignTaskColumn) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDraggingTaskId(null);

    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.kanban_column === targetColumn) return;

    const targetLabel = DESIGN_COLUMNS.find(c => c.key === targetColumn)?.label || targetColumn;

    // Build extra fields based on target column
    const extraFields: Record<string, any> = {};

    // Moving TO executando: set started_at and assigned_to
    if (targetColumn === 'executando') {
      if (!task.started_at) {
        extraFields.started_at = new Date().toISOString();
      }
      if (!task.assigned_to && user?.id) {
        extraFields.assigned_to = user.id;
      }
    }

    // Moving TO em_analise: validate attachment
    if (targetColumn === 'em_analise') {
      const hasAttachment = task.attachment_url || (task as any).mockup_url;
      if (!hasAttachment) {
        toast.error('Anexe a arte ou mockup antes de enviar para análise');
        return;
      }
    }

    // Moving TO aprovado: set completed_at and client_approved_at
    if (targetColumn === 'aprovado') {
      extraFields.completed_at = new Date().toISOString();
      extraFields.client_approved_at = new Date().toISOString();
    }

    // Moving TO enviar_cliente: mark as sent
    if (targetColumn === 'enviar_cliente') {
      if (!task.sent_to_client_at) {
        extraFields.sent_to_client_at = new Date().toISOString();
      }
    }

    try {
      await updateTask.mutateAsync({
        id: taskId,
        kanban_column: targetColumn,
        ...extraFields,
      } as any);

      await addHistory.mutateAsync({
        task_id: taskId,
        action: `Movido para ${targetLabel}`,
        user_id: user?.id,
      });

      toast.success(`Tarefa movida para "${targetLabel}"`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao mover tarefa');
    }
  }, [tasks, user, updateTask, addHistory]);

  const handleDragEnd = useCallback(() => {
    setDraggingTaskId(null);
    setDragOverColumn(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Designer</h1>
          <p className="text-sm text-muted-foreground">Gerenciamento de tarefas de design</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={v => setView(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="kanban" className="text-xs gap-1"><Kanban size={14} /> Kanban</TabsTrigger>
              <TabsTrigger value="lista" className="text-xs gap-1"><List size={14} /> Lista</TabsTrigger>
            </TabsList>
          </Tabs>
          {(currentUser?.role === 'admin' || currentUser?.role === 'social_media') && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={16} className="mr-1" /> Nova Tarefa
            </Button>
          )}
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {DESIGN_COLUMNS.map(col => (
            <div
              key={col.key}
              className={`min-w-[260px] w-[260px] flex-shrink-0 rounded-lg transition-colors ${
                dragOverColumn === col.key
                  ? 'bg-primary/10 ring-2 ring-primary/30'
                  : ''
              }`}
              onDragOver={e => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.key)}
            >
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${col.color})` }} />
                <span className="text-xs font-semibold uppercase tracking-wide">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] h-5">{tasksByColumn[col.key]?.length || 0}</Badge>
              </div>
              <div className="space-y-2 min-h-[60px] p-1">
                {tasksByColumn[col.key]?.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isDragging={draggingTaskId === task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    onDragStart={e => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs">
                <th className="text-left p-3">Cliente</th>
                <th className="text-left p-3">Título</th>
                <th className="text-left p-3">Formato</th>
                <th className="text-left p-3">Prioridade</th>
                <th className="text-left p-3">Etapa</th>
                <th className="text-left p-3">Criado</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedTaskId(task.id)}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
                      <span className="text-xs font-medium">{task.clients?.company_name}</span>
                    </div>
                  </td>
                  <td className="p-3 font-medium">{task.title}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[10px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge></td>
                  <td className="p-3"><Badge className={`text-[10px] ${PRIORITY_CONFIG[task.priority]?.color}`}>{PRIORITY_CONFIG[task.priority]?.label}</Badge></td>
                  <td className="p-3"><Badge variant="secondary" className="text-[10px]">{DESIGN_COLUMNS.find(c => c.key === task.kanban_column)?.label}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(task.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DesignTaskCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      {selectedTask && (
        <DesignTaskDetailSheet task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTaskId(null)} />
      )}
    </div>
  );
}

interface TaskCardProps {
  task: DesignTask;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function TaskCard({ task, isDragging, onClick, onDragStart, onDragEnd }: TaskCardProps) {
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`bg-card border rounded-xl p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all space-y-2 ${
        isDragging ? 'opacity-40 scale-95 ring-2 ring-primary/40' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical size={12} className="text-muted-foreground/40 shrink-0" />
        <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
        <span className="text-[11px] text-muted-foreground truncate">{task.clients?.company_name}</span>
      </div>
      <p className="text-sm font-medium line-clamp-2">{task.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge>
        <Badge className={`text-[10px] ${priorityCfg.color}`}>{priorityCfg.label}</Badge>
        {task.timer_running && (
          <Badge variant="secondary" className="text-[10px] gap-0.5"><Clock size={10} /> Em andamento</Badge>
        )}
      </div>
    </div>
  );
}

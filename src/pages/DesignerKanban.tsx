import { useState, useMemo } from 'react';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask, DesignTaskColumn } from '@/hooks/useDesignTasks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Kanban, List, Clock, AlertTriangle } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import DesignTaskCreateDialog from '@/components/designer/DesignTaskCreateDialog';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';

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
  const { tasksQuery } = useDesignTasks();
  const { currentUser } = useApp();
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DesignTask | null>(null);

  const tasks = tasksQuery.data || [];

  const tasksByColumn = useMemo(() => {
    const map: Record<string, DesignTask[]> = {};
    DESIGN_COLUMNS.forEach(c => { map[c.key] = []; });
    tasks.forEach(t => {
      if (map[t.kanban_column]) map[t.kanban_column].push(t);
    });
    return map;
  }, [tasks]);

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
            <div key={col.key} className="min-w-[260px] w-[260px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `hsl(${col.color})` }} />
                <span className="text-xs font-semibold uppercase tracking-wide">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] h-5">{tasksByColumn[col.key]?.length || 0}</Badge>
              </div>
              <div className="space-y-2">
                {tasksByColumn[col.key]?.map(task => (
                  <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
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
                <tr key={task.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedTask(task)}>
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
        <DesignTaskDetailSheet task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTask(null)} />
      )}
    </div>
  );
}

function TaskCard({ task, onClick }: { task: DesignTask; onClick: () => void }) {
  const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
  return (
    <div
      onClick={onClick}
      className="bg-card border rounded-xl p-3 cursor-pointer hover:shadow-md transition-shadow space-y-2"
    >
      <div className="flex items-center gap-2">
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

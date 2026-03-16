import { useState, useMemo, useCallback, useRef, DragEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask, DesignTaskColumn } from '@/hooks/useDesignTasks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Kanban, List, Clock, GripVertical, Sparkles, Zap, Eye, Send, CheckCircle2, RotateCcw } from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import DesignTaskCreateDialog from '@/components/designer/DesignTaskCreateDialog';
import DesignTaskDetailSheet from '@/components/designer/DesignTaskDetailSheet';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
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

const COLUMN_CONFIG: Record<string, { icon: React.ReactNode; gradient: string }> = {
  nova_tarefa: { icon: <Sparkles size={15} />, gradient: 'from-blue-500/20 to-blue-600/10 dark:from-blue-500/30 dark:to-blue-600/10' },
  executando: { icon: <Zap size={15} />, gradient: 'from-amber-500/20 to-yellow-500/10 dark:from-amber-500/30 dark:to-yellow-500/10' },
  em_analise: { icon: <Eye size={15} />, gradient: 'from-purple-500/20 to-violet-500/10 dark:from-purple-500/30 dark:to-violet-500/10' },
  enviar_cliente: { icon: <Send size={15} />, gradient: 'from-cyan-500/20 to-teal-500/10 dark:from-cyan-500/30 dark:to-teal-500/10' },
  aprovado: { icon: <CheckCircle2 size={15} />, gradient: 'from-emerald-500/20 to-green-500/10 dark:from-emerald-500/30 dark:to-green-500/10' },
  ajustes: { icon: <RotateCcw size={15} />, gradient: 'from-red-500/20 to-rose-500/10 dark:from-red-500/30 dark:to-rose-500/10' },
};

/* ── Drag-to-scroll container ── */
function DragScrollContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftRef = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, [draggable="true"], [role="button"]')) return;
    isDragging.current = true;
    startX.current = e.pageX - (ref.current?.offsetLeft || 0);
    scrollLeftRef.current = ref.current?.scrollLeft || 0;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    ref.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const onMouseUp = () => { isDragging.current = false; };

  return (
    <div
      ref={ref}
      className={`overflow-x-auto ${isDragging.current ? 'cursor-grabbing select-none' : 'cursor-grab'} ${className || ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {children}
    </div>
  );
}

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

  const handleDragLeave = useCallback(() => { setDragOverColumn(null); }, []);

  const handleDrop = useCallback(async (e: DragEvent, targetColumn: DesignTaskColumn) => {
    e.preventDefault();
    setDragOverColumn(null);
    setDraggingTaskId(null);

    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.kanban_column === targetColumn) return;

    const targetLabel = DESIGN_COLUMNS.find(c => c.key === targetColumn)?.label || targetColumn;
    const extraFields: Record<string, any> = {};

    if (targetColumn === 'executando') {
      if (!task.started_at) extraFields.started_at = new Date().toISOString();
      if (!task.assigned_to && user?.id) extraFields.assigned_to = user.id;
    }

    if (targetColumn === 'em_analise') {
      const hasAttachment = task.attachment_url || (task as any).mockup_url;
      if (!hasAttachment) {
        toast.error('Anexe a arte ou mockup antes de enviar para análise');
        return;
      }
    }

    if (targetColumn === 'aprovado') {
      extraFields.completed_at = new Date().toISOString();
      extraFields.client_approved_at = new Date().toISOString();
      if (task.format_type === 'logomarca' && task.client_id) {
        const fileUrl = task.attachment_url || (task as any).mockup_url;
        if (fileUrl) {
          await supabase.from('clients').update({ drive_identidade_visual: fileUrl }).eq('id', task.client_id);
          toast.info('Drive de Identidade Visual do cliente atualizado!');
        }
      }
    }

    if (targetColumn === 'enviar_cliente') {
      if (!task.sent_to_client_at) extraFields.sent_to_client_at = new Date().toISOString();
    }

    try {
      await updateTask.mutateAsync({ id: taskId, kanban_column: targetColumn, ...extraFields } as any);
      await addHistory.mutateAsync({ task_id: taskId, action: `Movido para ${targetLabel}`, user_id: user?.id });
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
          {(currentUser?.role === 'admin' || currentUser?.role === 'social_media' || currentUser?.role === 'designer') && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={16} className="mr-1" /> Nova Tarefa
            </Button>
          )}
        </div>
      </div>

      {view === 'kanban' ? (
        <DragScrollContainer className="pb-4">
          <div className="flex gap-3 min-w-max">
            {DESIGN_COLUMNS.map((col, colIdx) => {
              const cfg = COLUMN_CONFIG[col.key];
              const colTasks = tasksByColumn[col.key] || [];
              return (
                <motion.div
                  key={col.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: colIdx * 0.07, duration: 0.35 }}
                  className={`min-w-[270px] w-[270px] flex-shrink-0 rounded-xl transition-all duration-200 ${
                    dragOverColumn === col.key ? 'ring-2 ring-primary/40 bg-primary/5 scale-[1.01]' : ''
                  }`}
                  onDragOver={e => handleDragOver(e, col.key)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, col.key)}
                >
                  {/* Column header */}
                  <motion.div
                    className={`relative overflow-hidden rounded-xl p-3 mb-3 bg-gradient-to-r ${cfg.gradient} border border-border/50`}
                    whileHover={{ scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    {/* Shimmer */}
                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                    <div className="flex items-center gap-2 relative z-10">
                      <motion.span
                        className="text-foreground/80"
                        animate={{ rotate: [0, -6, 6, 0] }}
                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
                      >
                        {cfg.icon}
                      </motion.span>
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground/90">{col.label}</span>
                      <motion.div
                        key={colTasks.length}
                        initial={{ scale: 1.4 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500 }}
                      >
                        <Badge variant="secondary" className="text-[10px] h-5 ml-auto">{colTasks.length}</Badge>
                      </motion.div>
                    </div>
                  </motion.div>

                  {/* Cards */}
                  <div className="space-y-2 min-h-[60px] px-1">
                    <AnimatePresence mode="popLayout">
                      {colTasks.map((task, i) => (
                        <motion.div
                          key={task.id}
                          layout
                          initial={{ opacity: 0, scale: 0.92, y: 12 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -8 }}
                          transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 25 }}
                        >
                          <TaskCard
                            task={task}
                            isDragging={draggingTaskId === task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            onDragStart={e => handleDragStart(e, task)}
                            onDragEnd={handleDragEnd}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {colTasks.length === 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-8 text-muted-foreground/40"
                      >
                        <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                          {cfg.icon}
                        </motion.div>
                        <span className="text-[10px] mt-2">Nenhuma tarefa</span>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </DragScrollContainer>
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

/* ── Enhanced Task Card ── */
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
      className={`bg-card border border-border/60 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 space-y-2.5 group ${
        isDragging ? 'opacity-40 scale-95 ring-2 ring-primary/40' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <GripVertical size={12} className="text-muted-foreground/30 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />
        <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
        <span className="text-[11px] text-muted-foreground truncate">{task.clients?.company_name}</span>
      </div>
      <p className="text-sm font-medium line-clamp-2 group-hover:text-primary/90 transition-colors">{task.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{FORMAT_LABELS[task.format_type] || task.format_type}</Badge>
        <Badge className={`text-[10px] ${priorityCfg.color}`}>{priorityCfg.label}</Badge>
        {task.timer_running && (
          <Badge variant="secondary" className="text-[10px] gap-0.5 animate-pulse"><Clock size={10} /> Em andamento</Badge>
        )}
      </div>
    </motion.div>
  );
}

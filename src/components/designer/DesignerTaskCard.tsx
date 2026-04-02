import { useState, useEffect, useRef } from 'react';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask, DesignTaskColumn } from '@/hooks/useDesignTasks';
import { useAuth } from '@/hooks/useAuth';
import { uploadFileToVps } from '@/services/vpsApi';
import ClientLogo from '@/components/ClientLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Play, Pause, Square, Send, Clock, Upload, Link2, CheckCircle,
  RotateCcw, Flame, ArrowRight, Loader2, Eye, Image
} from 'lucide-react';

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string; slaHours: number }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground', slaHours: 96 },
  media: { label: 'Média', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-500', slaHours: 72 },
  alta: { label: 'Alta', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-500', slaHours: 48 },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 animate-pulse', dot: 'bg-red-500', slaHours: 24 },
};

const FORMAT_LABELS: Record<string, string> = {
  feed: 'Feed', story: 'Story', logomarca: 'Logomarca', midia_fisica: 'Mídia Física',
};

const COL_LABELS: Record<string, string> = {
  nova_tarefa: 'Nova', executando: 'Executando', ajustes: 'Ajustes',
  em_analise: 'Análise', enviar_cliente: 'P/ Cliente', aprovado: 'Aprovado',
};

interface Props {
  task: DesignTask;
  index: number;
  onOpenDetail: (id: string) => void;
}

function getDesignDeadlineStatus(task: DesignTask) {
  if (['aprovado'].includes(task.kanban_column)) return { label: 'Concluído', variant: 'success' as const, progress: 100 };
  const sla = PRIORITY_CONFIG[task.priority]?.slaHours || 72;
  const deadline = new Date(new Date(task.created_at).getTime() + sla * 3600000);
  const now = new Date();
  const elapsed = (now.getTime() - new Date(task.created_at).getTime()) / 3600000;
  const progress = Math.min(100, Math.max(0, Math.round((elapsed / sla) * 100)));
  const hoursLeft = Math.round((deadline.getTime() - now.getTime()) / 3600000);

  if (hoursLeft <= 0) return { label: 'Atrasado', variant: 'destructive' as const, progress: 100 };
  if (hoursLeft <= 6) return { label: `${hoursLeft}h`, variant: 'warning' as const, progress };
  if (hoursLeft <= 24) return { label: `${hoursLeft}h`, variant: 'warning' as const, progress };
  const days = Math.ceil(hoursLeft / 24);
  return { label: `${days}d`, variant: 'default' as const, progress };
}

export default function DesignerTaskCard({ task, index, onOpenDetail }: Props) {
  const { updateTask, addHistory } = useDesignTasks();
  const { user } = useAuth();
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [artLink, setArtLink] = useState('');
  const [showArtInput, setShowArtInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Live timer
  useEffect(() => {
    if (!task.timer_running || !task.timer_started_at) {
      // Show accumulated time
      setElapsed(task.time_spent_seconds || 0);
      return;
    }
    const startedAt = new Date(task.timer_started_at).getTime();
    const base = task.time_spent_seconds || 0;
    const update = () => setElapsed(base + Math.floor((Date.now() - startedAt) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [task.timer_running, task.timer_started_at, task.time_spent_seconds]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h${m.toString().padStart(2, '0')}m`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date().toISOString();
    await updateTask.mutateAsync({
      id: task.id,
      kanban_column: 'executando',
      started_at: task.started_at || now,
      assigned_to: user?.id || task.assigned_to,
      timer_running: true,
      timer_started_at: now,
    } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Iniciou execução', user_id: user?.id });
    toast.success('Timer iniciado! 🎨');
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date().toISOString();
    await updateTask.mutateAsync({
      id: task.id,
      timer_running: true,
      timer_started_at: now,
    } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Timer retomado', user_id: user?.id });
    toast.success('Timer retomado!');
  };

  const handlePause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task.timer_started_at) return;
    const additionalSeconds = Math.floor((Date.now() - new Date(task.timer_started_at).getTime()) / 1000);
    const totalSeconds = (task.time_spent_seconds || 0) + additionalSeconds;
    await updateTask.mutateAsync({
      id: task.id,
      timer_running: false,
      timer_started_at: null,
      time_spent_seconds: totalSeconds,
    } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Timer pausado', details: `Tempo acumulado: ${formatTime(totalSeconds)}`, user_id: user?.id });
    toast.info('Timer pausado ⏸');
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const publicUrl = await uploadFileToVps(file, `design/artes/${task.client_id}`);
      await updateTask.mutateAsync({ id: task.id, attachment_url: publicUrl } as any);
      await addHistory.mutateAsync({ task_id: task.id, action: 'Arte anexada', details: file.name, user_id: user?.id });
      toast.success('Arte anexada com sucesso! 🎉');
      setShowArtInput(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!artLink.trim()) { toast.error('Cole o link da arte'); return; }
    await updateTask.mutateAsync({ id: task.id, attachment_url: artLink } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Arte anexada via link', details: artLink, user_id: user?.id });
    toast.success('Link da arte salvo!');
    setArtLink('');
    setShowArtInput(false);
  };

  const handleSendForReview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task.attachment_url) { toast.error('Anexe a arte antes de enviar para análise'); return; }
    // Pause timer if running
    let totalSeconds = task.time_spent_seconds || 0;
    if (task.timer_running && task.timer_started_at) {
      const additional = Math.floor((Date.now() - new Date(task.timer_started_at).getTime()) / 1000);
      totalSeconds += additional;
    }
    await updateTask.mutateAsync({
      id: task.id,
      kanban_column: 'em_analise',
      timer_running: false,
      timer_started_at: null,
      time_spent_seconds: totalSeconds,
    } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Enviado para análise', user_id: user?.id });
    toast.success('Enviado para análise! ✅');
  };

  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
  const color = task.clients?.color || '217 91% 60%';
  const deadlineStatus = getDesignDeadlineStatus(task);
  const isNew = task.kanban_column === 'nova_tarefa';
  const isExecuting = task.kanban_column === 'executando';
  const isAdjustment = task.kanban_column === 'ajustes';
  const hasArt = !!task.attachment_url;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ delay: index * 0.02 }}
      className={`rounded-xl border transition-all ${
        deadlineStatus.variant === 'destructive'
          ? 'border-destructive/40 bg-destructive/5'
          : isAdjustment
            ? 'border-orange-400/30 bg-orange-500/5'
            : isExecuting
              ? 'border-primary/30 bg-primary/5'
              : 'border-border bg-card'
      }`}
    >
      {/* Main row - clickable to open detail */}
      <div
        onClick={() => onOpenDetail(task.id)}
        className="flex items-center gap-3 p-3 cursor-pointer group hover:shadow-md transition-all"
      >
        {/* Color bar */}
        <div className="w-1 h-14 rounded-full shrink-0" style={{ backgroundColor: `hsl(${color})` }} />

        {/* Client logo */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ClientLogo
                  client={{ companyName: task.clients?.company_name || '', color, logoUrl: task.clients?.logo_url }}
                  size="md"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs font-medium">{task.clients?.company_name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Task info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            {isAdjustment && <RotateCcw size={12} className="text-orange-500 shrink-0" />}
            {isExecuting && task.timer_running && <Play size={12} className="text-primary shrink-0 animate-pulse" />}
            {task.priority === 'urgente' && <Flame size={12} className="text-destructive shrink-0 animate-pulse" />}
            <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">{task.title}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">{task.clients?.company_name}</span>
            <span className="text-muted-foreground/40">•</span>
            <span>{FORMAT_LABELS[task.format_type] || task.format_type}</span>
            {task.version > 1 && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span>v{task.version}</span>
              </>
            )}
          </div>
          {/* Deadline bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 max-w-[200px]">
              <Progress
                value={deadlineStatus.progress}
                className={`h-1.5 ${
                  deadlineStatus.variant === 'destructive' ? '[&>div]:bg-destructive' :
                  deadlineStatus.variant === 'warning' ? '[&>div]:bg-orange-500' :
                  '[&>div]:bg-emerald-500'
                }`}
              />
            </div>
            <span className={`text-[10px] font-medium flex items-center gap-1 ${
              deadlineStatus.variant === 'destructive' ? 'text-destructive' :
              deadlineStatus.variant === 'warning' ? 'text-orange-500' :
              'text-muted-foreground'
            }`}>
              <Clock size={10} />
              {deadlineStatus.label}
            </span>
          </div>
        </div>

        {/* Timer display */}
        {(isExecuting || elapsed > 0) && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold shrink-0 ${
            task.timer_running 
              ? 'bg-primary/15 text-primary border border-primary/30 animate-pulse' 
              : 'bg-muted text-muted-foreground'
          }`}>
            <Clock size={12} />
            {formatTime(elapsed)}
          </div>
        )}

        {/* Right side badges */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={`text-[9px] ${p.color}`}>{p.label}</Badge>
          <Badge variant="outline" className="text-[9px]">{COL_LABELS[task.kanban_column] || task.kanban_column}</Badge>
          {hasArt && (
            <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[9px]">
              <CheckCircle size={8} className="mr-0.5" /> Arte
            </Badge>
          )}
        </div>

        <ArrowRight size={14} className="text-muted-foreground/30 shrink-0 group-hover:text-primary/60 transition-colors" />
      </div>

      {/* Action bar - always visible for actionable tasks */}
      {(isNew || isExecuting || isAdjustment) && (
        <div className="px-3 pb-3 pt-0">
          <div className="flex items-center gap-2 flex-wrap border-t border-border/50 pt-2.5">
            {/* START button for new tasks */}
            {isNew && (
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90" onClick={handleStart}>
                <Play size={12} /> Iniciar Execução
              </Button>
            )}

            {/* Timer controls for executing/adjustments */}
            {(isExecuting || isAdjustment) && (
              <>
                {task.timer_running ? (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-orange-400/50 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20" onClick={handlePause}>
                    <Pause size={12} /> Pausar
                  </Button>
                ) : (
                  <Button size="sm" className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90" onClick={isNew ? handleStart : handleResume}>
                    <Play size={12} /> {elapsed > 0 ? 'Retomar' : 'Iniciar'}
                  </Button>
                )}
              </>
            )}

            {/* Art attachment */}
            {(isExecuting || isAdjustment) && (
              <>
                {hasArt ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a href={task.attachment_url!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-emerald-400/50 text-emerald-600">
                            <Eye size={12} /> Ver Arte
                          </Button>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>Arte já anexada</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); setShowArtInput(!showArtInput); }}>
                    <Image size={12} /> Anexar Arte
                  </Button>
                )}

                {/* Send for review */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 border-purple-400/50 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 ml-auto"
                  onClick={handleSendForReview}
                  disabled={!hasArt}
                >
                  <Send size={12} /> Enviar p/ Análise
                </Button>
              </>
            )}
          </div>

          {/* Art input row */}
          {showArtInput && !hasArt && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2 flex items-center gap-2"
              onClick={e => e.stopPropagation()}
            >
              <Input
                value={artLink}
                onChange={e => setArtLink(e.target.value)}
                placeholder="Cole o link da arte..."
                className="h-8 text-xs flex-1"
              />
              <Button size="sm" variant="secondary" className="h-8 text-xs gap-1" onClick={handleSaveLink}>
                <Link2 size={11} /> Salvar
              </Button>
              <span className="text-muted-foreground/40 text-xs">ou</span>
              <input ref={fileRef} type="file" accept="image/*,.pdf,.ai,.psd,.svg,.eps" className="hidden" onChange={handleUploadFile} />
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs gap-1"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                {uploading ? 'Enviando...' : 'Upload'}
              </Button>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}

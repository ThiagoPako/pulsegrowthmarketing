import { useState, useEffect, useRef } from 'react';
import { useDesignTasks, DesignTask } from '@/hooks/useDesignTasks';
import { useAuth } from '@/hooks/useAuth';
import { uploadFileToVps } from '@/services/vpsApi';
import ClientLogo from '@/components/ClientLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import rocketGirlsImg from '@/assets/rocket-girls.png';
import {
  Play, Pause, Send, Clock, Upload, Link2, CheckCircle,
  RotateCcw, Flame, Loader2, Eye, Image, Sparkles, Heart, Pencil, Trash2
} from 'lucide-react';

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string; slaHours: number }> = {
  baixa: { label: 'Baixa', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', dot: 'bg-emerald-500', slaHours: 72 },
  media: { label: 'Média', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', dot: 'bg-violet-500', slaHours: 72 },
  alta: { label: 'Alta', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300', dot: 'bg-rose-500', slaHours: 48 },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-500', slaHours: 24 },
};

const FORMAT_LABELS: Record<string, string> = {
  feed: '📐 Feed', story: '📱 Story', logomarca: '🎨 Logo', midia_fisica: '🖨 Mídia Física',
};

const COL_LABELS: Record<string, { label: string; emoji: string }> = {
  nova_tarefa: { label: 'Nova', emoji: '✨' },
  executando: { label: 'Em execução', emoji: '🎨' },
  ajustes: { label: 'Ajustes', emoji: '🔄' },
  em_analise: { label: 'Em análise', emoji: '👀' },
  enviar_cliente: { label: 'P/ Cliente', emoji: '💌' },
  aprovado: { label: 'Aprovado', emoji: '💖' },
};

interface Props {
  task: DesignTask;
  index: number;
  onOpenDetail: (id: string) => void;
}

function getDesignDeadlineStatus(task: DesignTask) {
  if (['aprovado'].includes(task.kanban_column)) return { label: 'Concluído 💖', variant: 'success' as const, progress: 100 };
  const sla = PRIORITY_CONFIG[task.priority]?.slaHours || 72;
  const deadline = new Date(new Date(task.created_at).getTime() + sla * 3600000);
  const now = new Date();
  const elapsed = (now.getTime() - new Date(task.created_at).getTime()) / 3600000;
  const progress = Math.min(100, Math.max(0, Math.round((elapsed / sla) * 100)));
  const hoursLeft = Math.round((deadline.getTime() - now.getTime()) / 3600000);

  if (hoursLeft <= 0) return { label: 'Atrasado!', variant: 'destructive' as const, progress: 100 };
  if (hoursLeft <= 6) return { label: `${hoursLeft}h restantes`, variant: 'warning' as const, progress };
  if (hoursLeft <= 24) return { label: `${hoursLeft}h restantes`, variant: 'warning' as const, progress };
  const days = Math.ceil(hoursLeft / 24);
  return { label: `${days} dia${days > 1 ? 's' : ''}`, variant: 'default' as const, progress };
}

export default function DesignerTaskCard({ task, index, onOpenDetail }: Props) {
  const { updateTask, addHistory, deleteTask } = useDesignTasks();
  const { user } = useAuth();
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [artLink, setArtLink] = useState('');
  const [showArtInput, setShowArtInput] = useState(false);
  const [showRocket, setShowRocket] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task.timer_running || !task.timer_started_at) {
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
    // Show rocket celebration
    setShowRocket(true);
    setTimeout(() => setShowRocket(false), 3000);

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
    toast.success('Bora criar! 🎨✨');
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date().toISOString();
    await updateTask.mutateAsync({ id: task.id, timer_running: true, timer_started_at: now } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Timer retomado', user_id: user?.id });
    toast.success('Continuando... 💪');
  };

  const handlePause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task.timer_started_at) return;
    const additionalSeconds = Math.floor((Date.now() - new Date(task.timer_started_at).getTime()) / 1000);
    const totalSeconds = (task.time_spent_seconds || 0) + additionalSeconds;
    await updateTask.mutateAsync({
      id: task.id, timer_running: false, timer_started_at: null, time_spent_seconds: totalSeconds,
    } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Timer pausado', details: `Tempo: ${formatTime(totalSeconds)}`, user_id: user?.id });
    toast.info('Pausado ☕');
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
      toast.success('Arte anexada! 🎉');
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
    await addHistory.mutateAsync({ task_id: task.id, action: 'Arte via link', details: artLink, user_id: user?.id });
    toast.success('Link salvo! 💜');
    setArtLink('');
    setShowArtInput(false);
  };

  const handleSendForReview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!task.attachment_url) { toast.error('Anexe a arte antes'); return; }
    let totalSeconds = task.time_spent_seconds || 0;
    if (task.timer_running && task.timer_started_at) {
      totalSeconds += Math.floor((Date.now() - new Date(task.timer_started_at).getTime()) / 1000);
    }
    // Show rocket celebration for sending
    setShowRocket(true);
    setTimeout(() => setShowRocket(false), 3000);
    await updateTask.mutateAsync({
      id: task.id, kanban_column: 'em_analise', timer_running: false, timer_started_at: null, time_spent_seconds: totalSeconds,
    } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Enviado para análise', user_id: user?.id });
    toast.success('Enviado para análise! 🚀');
  };

  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;
  const color = task.clients?.color || '217 91% 60%';
  const deadlineStatus = getDesignDeadlineStatus(task);
  const isNew = task.kanban_column === 'nova_tarefa';
  const isExecuting = task.kanban_column === 'executando';
  const isAdjustment = task.kanban_column === 'ajustes';
  const hasArt = !!task.attachment_url;
  const colInfo = COL_LABELS[task.kanban_column] || { label: task.kanban_column, emoji: '📋' };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 300, damping: 30 }}
      className="relative overflow-hidden"
    >
      {/* Rocket celebration overlay */}
      <AnimatePresence>
        {showRocket && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, transparent 70%)' }}
          >
            <motion.img
              src={rocketGirlsImg}
              alt="Foguete"
              width={120}
              height={120}
              initial={{ y: 100, opacity: 0, scale: 0.5, rotate: -10 }}
              animate={{ y: -200, opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1, 0.8], rotate: [-10, 5, 0, 10] }}
              transition={{ duration: 2.5, ease: 'easeOut' }}
              className="drop-shadow-2xl"
            />
            {/* Sparkle particles */}
            {Array.from({ length: 8 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                  x: (Math.random() - 0.5) * 200,
                  y: (Math.random() - 0.5) * 200,
                }}
                transition={{ duration: 1.5, delay: 0.2 + i * 0.1 }}
                className="absolute w-2 h-2 rounded-full"
                style={{ background: ['#ec4899', '#a855f7', '#f59e0b', '#10b981'][i % 4] }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`rounded-2xl border-2 transition-all duration-300 backdrop-blur-sm relative group/card ${
        deadlineStatus.variant === 'destructive'
          ? 'border-rose-300/60 bg-gradient-to-r from-rose-50/80 to-pink-50/40 dark:from-rose-950/30 dark:to-pink-950/20'
          : isAdjustment
            ? 'border-amber-300/50 bg-gradient-to-r from-amber-50/60 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10'
            : isExecuting
              ? 'border-violet-300/50 bg-gradient-to-r from-violet-50/60 to-fuchsia-50/30 dark:from-violet-950/20 dark:to-fuchsia-950/10'
              : 'border-pink-200/40 bg-gradient-to-r from-card to-pink-50/20 dark:to-pink-950/10 hover:border-pink-300/60'
      } hover:shadow-lg hover:shadow-pink-200/20 dark:hover:shadow-pink-900/10`}>

        {/* Quick action buttons */}
        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDetail(task.id); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 dark:bg-background/80 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shadow-sm border border-border/40"
            title="Editar"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (window.confirm(`Excluir "${task.title}"? Esta ação não pode ser desfeita.`)) {
                await deleteTask.mutateAsync(task.id);
              }
            }}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 dark:bg-background/80 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shadow-sm border border-border/40"
            title="Excluir"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Main row */}
        <div
          onClick={() => onOpenDetail(task.id)}
          className="flex items-center gap-3 p-4 cursor-pointer group"
        >
          {/* Color accent */}
          <div className="w-1.5 h-16 rounded-full shrink-0 transition-all group-hover:h-20" style={{ background: `linear-gradient(180deg, hsl(${color}), hsl(${color} / 0.4))` }} />

          {/* Logo */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <ClientLogo client={{ companyName: task.clients?.company_name || '', color, logoUrl: task.clients?.logo_url }} size="md" />
                  {task.timer_running && (
                    <motion.div
                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="absolute -inset-1 rounded-full border-2 border-violet-400"
                    />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{task.clients?.company_name}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-1.5">
              {isAdjustment && <RotateCcw size={13} className="text-amber-500 shrink-0" />}
              {isExecuting && task.timer_running && (
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                  <Sparkles size={13} className="text-violet-500 shrink-0" />
                </motion.div>
              )}
              {task.priority === 'urgente' && <Flame size={13} className="text-rose-500 shrink-0 animate-pulse" />}
              <span className="font-semibold text-sm truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                {task.title}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">{task.clients?.company_name}</span>
              <span className="text-pink-300">•</span>
              <span>{FORMAT_LABELS[task.format_type] || task.format_type}</span>
              {task.version > 1 && (
                <>
                  <span className="text-pink-300">•</span>
                  <span className="text-violet-500 font-medium">v{task.version}</span>
                </>
              )}
            </div>
            {/* Deadline */}
            <div className="flex items-center gap-2">
              <div className="flex-1 max-w-[180px]">
                <Progress
                  value={deadlineStatus.progress}
                  className={`h-1.5 rounded-full ${
                    deadlineStatus.variant === 'destructive' ? '[&>div]:bg-gradient-to-r [&>div]:from-rose-500 [&>div]:to-red-500' :
                    deadlineStatus.variant === 'warning' ? '[&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-orange-500' :
                    '[&>div]:bg-gradient-to-r [&>div]:from-emerald-400 [&>div]:to-teal-500'
                  }`}
                />
              </div>
              <span className={`text-[10px] font-medium flex items-center gap-1 ${
                deadlineStatus.variant === 'destructive' ? 'text-rose-500' :
                deadlineStatus.variant === 'warning' ? 'text-amber-500' :
                'text-muted-foreground'
              }`}>
                <Clock size={10} />
                {deadlineStatus.label}
              </span>
            </div>
          </div>

          {/* Timer */}
          {(isExecuting || elapsed > 0) && (
            <motion.div
              animate={task.timer_running ? { boxShadow: ['0 0 0px rgba(139,92,246,0)', '0 0 15px rgba(139,92,246,0.4)', '0 0 0px rgba(139,92,246,0)'] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold shrink-0 ${
                task.timer_running
                  ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-violet-600 dark:text-violet-400 border border-violet-300/50'
                  : 'bg-muted/60 text-muted-foreground'
              }`}
            >
              <Clock size={12} />
              {formatTime(elapsed)}
            </motion.div>
          )}

          {/* Badges */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge className={`text-[9px] rounded-full px-2 ${p.color}`}>{p.label}</Badge>
            <Badge variant="outline" className="text-[9px] rounded-full px-2 border-pink-200/60">
              {colInfo.emoji} {colInfo.label}
            </Badge>
            {hasArt && (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200/50 text-[9px] rounded-full px-2">
                <CheckCircle size={8} className="mr-0.5" /> Arte ✓
              </Badge>
            )}
          </div>
        </div>

        {/* Action bar */}
        {(isNew || isExecuting || isAdjustment) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="px-4 pb-4 pt-0"
          >
            <div className="flex items-center gap-2 flex-wrap border-t border-pink-200/30 dark:border-pink-800/20 pt-3">
              {/* START - feminine glowing button */}
              {isNew && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    size="sm"
                    className="h-9 text-xs gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-lg shadow-violet-300/40 dark:shadow-violet-900/40 font-semibold"
                    onClick={handleStart}
                  >
                    <Play size={13} fill="currentColor" /> Aceitar & Iniciar ✨
                  </Button>
                </motion.div>
              )}

              {/* Timer controls */}
              {(isExecuting || isAdjustment) && (
                <>
                  {task.timer_running ? (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs gap-2 rounded-xl border-amber-300/60 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-semibold"
                        onClick={handlePause}
                      >
                        <Pause size={13} /> Pausar ☕
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        className="h-9 text-xs gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-lg shadow-violet-300/40 font-semibold"
                        onClick={handleResume}
                      >
                        <Play size={13} fill="currentColor" /> {elapsed > 0 ? 'Retomar 💜' : 'Iniciar ✨'}
                      </Button>
                    </motion.div>
                  )}
                </>
              )}

              {/* Art attachment */}
              {(isExecuting || isAdjustment) && (
                <>
                  {hasArt ? (
                    <a href={task.attachment_url!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="outline" className="h-9 text-xs gap-2 rounded-xl border-emerald-300/60 text-emerald-600 font-semibold">
                        <Eye size={13} /> Ver Arte 🎨
                      </Button>
                    </a>
                  ) : (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs gap-2 rounded-xl border-pink-300/60 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-900/20 font-semibold"
                        onClick={(e) => { e.stopPropagation(); setShowArtInput(!showArtInput); }}
                      >
                        <Image size={13} /> Anexar Arte
                      </Button>
                    </motion.div>
                  )}

                  {/* Send for review */}
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="ml-auto">
                    <Button
                      size="sm"
                      className="h-9 text-xs gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg shadow-pink-300/40 font-semibold disabled:opacity-40"
                      onClick={handleSendForReview}
                      disabled={!hasArt}
                    >
                      <Send size={13} /> Enviar p/ Análise 🚀
                    </Button>
                  </motion.div>
                </>
              )}
            </div>

            {/* Art input */}
            <AnimatePresence>
              {showArtInput && !hasArt && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 flex items-center gap-2"
                  onClick={e => e.stopPropagation()}
                >
                  <Input
                    value={artLink}
                    onChange={e => setArtLink(e.target.value)}
                    placeholder="Cole o link da arte aqui... 🔗"
                    className="h-9 text-xs flex-1 rounded-xl border-pink-200/50 focus:border-violet-400"
                  />
                  <Button size="sm" variant="secondary" className="h-9 text-xs gap-1.5 rounded-xl" onClick={handleSaveLink}>
                    <Link2 size={12} /> Salvar
                  </Button>
                  <span className="text-pink-300 text-xs">ou</span>
                  <input ref={fileRef} type="file" accept="image/*,.pdf,.ai,.psd,.svg,.eps" className="hidden" onChange={handleUploadFile} />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-9 text-xs gap-1.5 rounded-xl"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    {uploading ? 'Enviando...' : 'Upload'}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

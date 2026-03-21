import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/vpsDb';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format, differenceInHours, differenceInMinutes, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Eye, ExternalLink, Upload, Send, History, MessageSquare, Clock,
  AlertTriangle, Check, Film, Megaphone, Image, Palette, Link2, Play,
  Video, Camera, CircleCheck, CircleDot, Circle, Rocket, Star, Trophy,
  PartyPopper
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { highlightQuotes } from '@/lib/highlightQuotes';
import { syncContentTaskColumnChange, buildSyncContext } from '@/lib/contentTaskSync';
import { uploadFileToVps } from '@/services/vpsApi';
import type { EditorTask } from '@/pages/EditorDashboard';
import { getDeadlineStatus, getTypeConfig } from '@/pages/EditorDashboard';

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
}

interface HistoryEntry {
  id: string;
  task_id: string;
  user_id: string;
  action: string;
  details: string | null;
  created_at: string;
}

interface Props {
  task: EditorTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

const TIMELINE_STAGES = [
  { key: 'created', label: 'Criado', icon: Circle },
  { key: 'captured', label: 'Captação', icon: Camera },
  { key: 'editing', label: 'Edição', icon: Video },
  { key: 'review', label: 'Revisão', icon: Eye },
  { key: 'done', label: 'Concluído', icon: CircleCheck },
] as const;

function getStageIndex(column: string): number {
  switch (column) {
    case 'ideias': return 0;
    case 'captacao': return 1;
    case 'edicao': case 'alteracao': return 2;
    case 'revisao': return 3;
    case 'envio': case 'concluido': return 4;
    default: return 0;
  }
}

/* ─── Live Timer ──────────────────────────────────────────── */
function LiveTimer({ startedAt, large }: { startedAt: string; large?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return (
    <motion.span
      className={`font-mono font-bold text-primary tabular-nums ${large ? 'text-2xl' : 'text-sm'}`}
      animate={{ opacity: [1, 0.6, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
      {h > 0 && `${h}:`}{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </motion.span>
  );
}

/* ─── Score Celebration ───────────────────────────────────── */
function ScoreCelebration({ points, show, onDone }: { points: number; show: boolean; onDone: () => void }) {
  useEffect(() => {
    if (show) {
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }
  }, [show, onDone]);
  if (!show) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: [0, 1.3, 1], rotate: [−20, 10, 0] }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="flex flex-col items-center gap-3"
      >
        {/* Rocket launching */}
        <motion.svg width="80" height="80" viewBox="0 0 64 64" fill="none"
          animate={{ y: [0, -30, -60] }} transition={{ duration: 1.5, ease: 'easeIn' }}>
          <motion.ellipse cx="32" cy="58" rx="8" ry="5"
            animate={{ ry: [5, 8, 5], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 0.3, repeat: Infinity }}
            fill="url(#cFlameGrad)" />
          <path d="M32 8C26 8 22 18 22 32V46C22 49 26 52 32 52C38 52 42 49 42 46V32C42 18 38 8 32 8Z" fill="hsl(var(--primary))" />
          <circle cx="32" cy="28" r="7" fill="#1a1a2e" stroke="#e0e0e0" strokeWidth="1.5" />
          <ellipse cx="30" cy="27" rx="3" ry="3.5" fill="white" />
          <ellipse cx="35" cy="27" rx="2.5" ry="3" fill="white" />
          <circle cx="30.5" cy="27.5" r="1.5" fill="#1a1a2e" />
          <circle cx="35" cy="27.5" r="1.2" fill="#1a1a2e" />
          <path d="M22 38L16 46C16 46 18 48 22 46V38Z" fill="hsl(var(--primary))" />
          <path d="M42 38L48 46C48 46 46 48 42 46V38Z" fill="hsl(var(--primary))" />
          <defs>
            <radialGradient id="cFlameGrad">
              <stop stopColor="#fbbf24" />
              <stop offset="1" stopColor="#ef4444" />
            </radialGradient>
          </defs>
        </motion.svg>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <div className="flex items-center gap-2 bg-amber-500 text-white font-black text-2xl px-5 py-2 rounded-full shadow-xl">
            <Star size={20} /> +{points} pts
          </div>
          <p className="text-sm text-foreground font-semibold mt-2">Mandou bem!</p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function EditorTaskDetail({ task, open, onOpenChange, onRefresh }: Props) {
  const { clients, scripts, users } = useApp();
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [videoLink, setVideoLink] = useState(task.edited_video_link || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videomakerName, setVideomakerName] = useState<string | null>(null);
  const [videomakerAvatar, setVideomakerAvatar] = useState<string | null>(null);
  const [fetchedScript, setFetchedScript] = useState<any>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationPoints, setCelebrationPoints] = useState(0);

  const client = clients.find(c => c.id === task.client_id);
  const contextScript = task.script_id ? scripts.find(s => s.id === task.script_id) : null;
  const script = contextScript || fetchedScript;
  const deadline = getDeadlineStatus(task.editing_deadline);
  const cfg = getTypeConfig(task.content_type);
  const isEditing = !!task.editing_started_at;

  useEffect(() => {
    if (!open || !task.script_id || contextScript) { setFetchedScript(null); return; }
    (async () => {
      try {
        const { data } = await supabase.from('scripts').select('*').eq('id', task.script_id!).single();
        if (data) setFetchedScript({ id: data.id, title: data.title, content: data.content, videoType: data.video_type, contentFormat: data.content_format });
      } catch {}
    })();
  }, [open, task.script_id, contextScript]);

  useEffect(() => {
    if (!open || !task.recording_id) return;
    (async () => {
      const { data: rec } = await supabase.from('recordings').select('videomaker_id').eq('id', task.recording_id!).single();
      if (rec?.videomaker_id) {
        const vm = users.find(u => u.id === rec.videomaker_id);
        if (vm) {
          setVideomakerName(vm.displayName || vm.name);
          setVideomakerAvatar(vm.avatarUrl || null);
        }
      }
    })();
  }, [open, task.recording_id, users]);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at', { ascending: true });
    if (data) {
      const enriched = data.map(c => ({ ...c, user_name: users.find(u => u.id === c.user_id)?.name || 'Usuário' }));
      setComments(enriched);
    }
  }, [task.id, users]);

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase.from('task_history').select('*').eq('task_id', task.id).order('created_at', { ascending: false });
    if (data) setHistory(data as HistoryEntry[]);
  }, [task.id]);

  useEffect(() => {
    if (open) { fetchComments(); fetchHistory(); setVideoLink(task.edited_video_link || ''); }
  }, [open, fetchComments, fetchHistory, task.edited_video_link]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase.channel(`task_comments_${task.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${task.id}` }, () => fetchComments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, task.id, fetchComments]);

  const addComment = async () => {
    if (!newComment.trim() || !user) return;
    await supabase.from('task_comments').insert({ task_id: task.id, user_id: user.id, content: newComment.trim() });
    setNewComment('');
  };

  const logAction = async (action: string, details?: string) => {
    await supabase.from('task_history').insert({ task_id: task.id, user_id: user?.id || null, action, details: details || null });
  };

  /* ─── Start Editing (claim + timer) ─────────────────────── */
  const startEditing = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('content_tasks').update({
      assigned_to: user.id,
      editing_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', task.id);
    await logAction('Edição iniciada');
    toast.success('Edição iniciada! Timer rodando.');
    onRefresh();
    setSaving(false);
  };

  const saveVideoLink = async () => {
    if (!videoLink.trim()) return;
    setSaving(true);
    await supabase.from('content_tasks').update({
      edited_video_link: videoLink.trim(),
      edited_video_type: 'link',
      updated_at: new Date().toISOString()
    }).eq('id', task.id);
    await logAction('Vídeo editado anexado', videoLink.trim());
    toast.success('Link do vídeo salvo!');
    onRefresh();
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) { toast.error('Máximo: 500MB'); return; }
    setUploading(true);
    setUploadProgress(`Enviando ${file.name}...`);
    try {
      const folder = `content/${task.client_id}/${task.id}`;
      const url = await uploadFileToVps(file, folder);
      await supabase.from('content_tasks').update({
        edited_video_link: url, edited_video_type: 'upload', updated_at: new Date().toISOString()
      }).eq('id', task.id);
      setVideoLink(url);
      await logAction('Vídeo editado enviado via upload', url);
      toast.success('Vídeo enviado!');
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ─── Finalize & Send for Approval (with celebration) ───── */
  const sendForApproval = async () => {
    const currentLink = videoLink.trim() || task.edited_video_link;
    if (!currentLink) { toast.error('Adicione o vídeo editado primeiro'); return; }
    setSaving(true);
    await supabase.from('content_tasks').update({
      kanban_column: 'revisao',
      updated_at: new Date().toISOString(),
    }).eq('id', task.id);
    const cl = clients.find(c => c.id === task.client_id);
    const ctx = buildSyncContext({ ...task, edited_video_link: currentLink } as any, {
      userId: user?.id, clientName: cl?.companyName, clientWhatsapp: (cl as any)?.whatsapp,
    });
    await syncContentTaskColumnChange('revisao', ctx);
    await logAction('Enviado para aprovação');

    // Trigger celebration
    const pts = cfg ? (getTypeConfig(task.content_type).points || 0) : 5;
    setCelebrationPoints(pts);
    setShowCelebration(true);

    toast.success('Enviado para aprovação!');
    onRefresh();
    setSaving(false);
  };

  const markAsFinished = async () => {
    setSaving(true);
    await supabase.from('content_tasks').update({
      kanban_column: 'envio', approved_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', task.id);
    const cl = clients.find(c => c.id === task.client_id);
    const ctx = buildSyncContext({ ...task, approved_at: new Date().toISOString() } as any, {
      userId: user?.id, clientName: cl?.companyName, clientWhatsapp: (cl as any)?.whatsapp,
    });
    await syncContentTaskColumnChange('envio', ctx);
    await logAction('Vídeo finalizado');
    toast.success('Vídeo finalizado!');
    onRefresh();
    onOpenChange(false);
    setSaving(false);
  };

  const getCountdown = () => {
    if (!task.editing_deadline) return null;
    const dl = new Date(task.editing_deadline);
    const now = new Date();
    if (isPast(dl)) {
      const overHours = differenceInHours(now, dl);
      return { text: `Atrasado há ${overHours}h`, overdue: true };
    }
    const hoursLeft = differenceInHours(dl, now);
    const minsLeft = differenceInMinutes(dl, now) % 60;
    if (hoursLeft < 24) return { text: `${hoursLeft}h ${minsLeft}min restantes`, overdue: false };
    const daysLeft = Math.ceil(hoursLeft / 24);
    return { text: `${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`, overdue: false };
  };

  const countdown = getCountdown();
  const currentStageIdx = getStageIndex(task.kanban_column);

  const stageDates: Record<string, string | null> = {
    created: task.created_at,
    captured: task.editing_deadline ? (() => {
      const d = new Date(task.editing_deadline);
      d.setDate(d.getDate() - 2);
      return d.toISOString();
    })() : task.created_at,
    editing: task.editing_started_at || (currentStageIdx >= 2 ? task.updated_at : null),
    review: task.approval_sent_at,
    done: task.approved_at,
  };

  return (
    <>
      <AnimatePresence>
        <ScoreCelebration points={celebrationPoints} show={showCelebration}
          onDone={() => { setShowCelebration(false); onOpenChange(false); }} />
      </AnimatePresence>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <cfg.icon size={18} className={cfg.color.split(' ')[0]} />
              {task.title}
            </DialogTitle>
            {videomakerName && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border border-purple-500/20">
                <div className="relative">
                  {videomakerAvatar ? (
                    <img src={videomakerAvatar} alt={videomakerName} className="w-7 h-7 rounded-full object-cover ring-2 ring-purple-400/50" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center ring-2 ring-purple-400/50">
                      <span className="text-[10px] font-bold text-white">{videomakerName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <Camera size={10} className="absolute -bottom-0.5 -right-0.5 text-purple-500 bg-background rounded-full p-[1px]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground leading-none">Gravado por</span>
                  <span className="text-xs font-semibold text-foreground leading-tight">{videomakerName}</span>
                </div>
              </div>
            )}
          </DialogHeader>

          <div className="space-y-4 pb-4">
            {/* Client + Meta */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                {client && <ClientLogo client={client as any} size="sm" />}
                <span className="text-sm font-bold text-foreground">{client?.companyName || 'Cliente'}</span>
              </div>
              <Badge className={`${cfg.color} border-0 text-xs`}><cfg.icon size={11} className="mr-0.5" /> {cfg.label}</Badge>
              <Badge variant="outline" className="text-xs">
                {task.kanban_column === 'edicao' ? (isEditing ? 'Editando' : 'Aguardando') :
                 task.kanban_column === 'revisao' ? 'Em Revisão' :
                 task.kanban_column === 'alteracao' ? 'Ajuste' : 'Finalizado'}
              </Badge>
              {/* Points badge */}
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                <Star size={10} className="mr-0.5" /> {getTypeConfig(task.content_type).points} pts
              </Badge>
            </div>

            {/* ─── EDITING TIMER HERO ─────────────────────────── */}
            {isEditing && task.editing_started_at && task.kanban_column === 'edicao' && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border-2 border-primary/30 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                    <Rocket size={28} className="text-primary" />
                  </motion.div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Tempo de edição</p>
                    <LiveTimer startedAt={task.editing_started_at} large />
                  </div>
                </div>
                <motion.div className="w-3 h-3 rounded-full bg-primary"
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }} />
              </motion.div>
            )}

            {/* Timeline */}
            <div className="relative px-2 py-3">
              <div className="flex items-start justify-between relative">
                <div className="absolute top-3 left-0 right-0 h-0.5 bg-border" />
                <motion.div className="absolute top-3 left-0 h-0.5 bg-gradient-to-r from-emerald-500 via-primary to-violet-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(currentStageIdx / (TIMELINE_STAGES.length - 1)) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }} />
                {TIMELINE_STAGES.map((stage, idx) => {
                  const isPassed = idx <= currentStageIdx;
                  const isCurrent = idx === currentStageIdx;
                  const date = stageDates[stage.key];
                  const StageIcon = stage.icon;
                  return (
                    <motion.div key={stage.key} className="flex flex-col items-center relative z-10"
                      style={{ width: `${100 / TIMELINE_STAGES.length}%` }}
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.15 * idx + 0.2 }}>
                      <motion.div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          isCurrent ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                          isPassed ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground border-2 border-border'
                        }`}
                        initial={{ scale: 0 }} animate={{ scale: isCurrent ? 1.1 : 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.15 * idx + 0.3 }}>
                        {isPassed && !isCurrent ? <Check size={12} /> : <StageIcon size={12} />}
                      </motion.div>
                      <span className={`text-[10px] mt-1.5 font-medium text-center leading-tight ${
                        isCurrent ? 'text-primary font-bold' : isPassed ? 'text-foreground' : 'text-muted-foreground'
                      }`}>{stage.label}</span>
                      {date && isPassed && (
                        <span className="text-[9px] text-muted-foreground mt-0.5">
                          {format(new Date(date), 'dd/MM', { locale: ptBR })}
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Deadline countdown */}
            {countdown && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                countdown.overdue ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
              }`}>
                <Clock size={16} />
                <div>
                  <p className="text-sm font-bold">{countdown.text}</p>
                  {task.editing_deadline && (
                    <p className="text-xs opacity-80">Prazo: {format(new Date(task.editing_deadline), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                  )}
                </div>
              </div>
            )}

            {/* Adjustment notes */}
            {task.kanban_column === 'alteracao' && task.adjustment_notes && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Ajustes solicitados:</p>
                <p className="text-sm text-foreground">{task.adjustment_notes}</p>
              </div>
            )}

            {/* Script alteration warnings */}
            {(task as any).script_alteration_type === 'altered' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-600 mb-1">ROTEIRO ALTERADO</p>
                <p className="text-sm text-foreground mb-1">Não siga o roteiro original.</p>
                {(task as any).script_alteration_notes && <p className="text-sm text-foreground/70 mt-1">{(task as any).script_alteration_notes}</p>}
              </div>
            )}
            {(task as any).script_alteration_type === 'verbal' && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-xs font-bold text-blue-600 mb-1">ALTERAÇÃO VERBAL</p>
                {(task as any).script_alteration_notes && <p className="text-sm text-foreground/70 mt-1">{(task as any).script_alteration_notes}</p>}
              </div>
            )}

            <Tabs defaultValue="upload" className="space-y-3">
              <TabsList className="h-8 flex flex-wrap">
                <TabsTrigger value="upload" className="text-xs gap-1"><Upload size={11} /> Vídeo</TabsTrigger>
                <TabsTrigger value="script" className="text-xs gap-1"><Eye size={11} /> Roteiro</TabsTrigger>
                <TabsTrigger value="materials" className="text-xs gap-1"><ExternalLink size={11} /> Materiais</TabsTrigger>
                <TabsTrigger value="comments" className="text-xs gap-1"><MessageSquare size={11} /> Chat</TabsTrigger>
                <TabsTrigger value="history" className="text-xs gap-1"><History size={11} /> Log</TabsTrigger>
              </TabsList>

              {/* Upload / Link */}
              <TabsContent value="upload">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-2">ENVIAR ARQUIVO DE VÍDEO</p>
                    <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                      <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} className="hidden" id="editor-video-upload-detail" />
                      <label htmlFor="editor-video-upload-detail" className="cursor-pointer flex flex-col items-center gap-2">
                        <Upload size={24} className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{uploading ? uploadProgress : 'Clique para enviar'}</span>
                        <span className="text-xs text-muted-foreground/60">MP4, MOV — até 500MB</span>
                      </label>
                      {uploading && (
                        <div className="mt-3 flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          <span className="text-xs text-primary font-medium">Enviando...</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground font-medium">OU</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-2">LINK DO VÍDEO</p>
                    <div className="flex gap-2">
                      <Input placeholder="Cole o link..." value={videoLink} onChange={e => setVideoLink(e.target.value)} className="flex-1" />
                      <Button size="sm" onClick={saveVideoLink} disabled={saving || !videoLink.trim()}>
                        <Link2 size={14} className="mr-1" /> Salvar
                      </Button>
                    </div>
                  </div>
                  {task.edited_video_link && (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-2 border border-green-200 dark:border-green-800">
                      <Check size={14} /> Vídeo editado anexado
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Script */}
              <TabsContent value="script">
                {script ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Tema: <span className="font-semibold text-foreground">{script.title}</span></p>
                    <div className="prose prose-sm max-w-none p-4 rounded-xl bg-muted/30 border border-border min-h-[150px]"
                      dangerouslySetInnerHTML={{ __html: highlightQuotes(script.content) || '<em>Sem conteúdo</em>' }} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic p-4">Nenhum roteiro vinculado.</p>
                )}
              </TabsContent>

              {/* Materials */}
              <TabsContent value="materials">
                {task.drive_link ? (
                  <a href={task.drive_link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-3 border border-blue-200 dark:border-blue-800">
                    <ExternalLink size={16} /> Abrir materiais no Drive
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic p-4">Nenhum link disponível.</p>
                )}
              </TabsContent>

              {/* Comments */}
              <TabsContent value="comments">
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic p-4">Nenhum comentário.</p>
                    ) : comments.map(c => (
                      <div key={c.id} className={`p-3 rounded-lg border ${c.user_id === user?.id ? 'bg-primary/5 border-primary/20 ml-6' : 'bg-muted/30 border-border mr-6'}`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-foreground">{c.user_name}</span>
                          <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                        </div>
                        <p className="text-sm text-foreground">{c.content}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea placeholder="Escreva um comentário..." value={newComment} onChange={e => setNewComment(e.target.value)}
                      className="min-h-[60px] flex-1" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }} />
                    <Button size="sm" onClick={addComment} disabled={!newComment.trim()} className="self-end"><Send size={14} /></Button>
                  </div>
                </div>
              </TabsContent>

              {/* History */}
              <TabsContent value="history">
                <div className="space-y-1.5">
                  <HistoryLine label="Criado em" date={task.created_at} />
                  {task.editing_started_at && <HistoryLine label="Edição iniciada" date={task.editing_started_at} />}
                  {task.approval_sent_at && <HistoryLine label="Enviado para aprovação" date={task.approval_sent_at} />}
                  {task.approved_at && <HistoryLine label="Aprovado" date={task.approved_at} />}
                  {history.length > 0 && (
                    <div className="border-t border-border pt-2 mt-2 space-y-1.5">
                      <p className="text-xs font-bold text-muted-foreground">LOG DETALHADO</p>
                      {history.map(h => (
                        <div key={h.id} className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-28 shrink-0">{format(new Date(h.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                          <span className="text-foreground font-medium">{h.action}</span>
                          {h.details && <span className="text-muted-foreground truncate">— {h.details}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* ─── ACTION BUTTONS ─────────────────────────────── */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
              {/* Start Editing */}
              {task.kanban_column === 'edicao' && !task.editing_started_at && (
                <motion.div whileTap={{ scale: 0.92 }}>
                  <Button onClick={startEditing} disabled={saving}
                    className="gap-1.5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md">
                    <Rocket size={15} /> Iniciar Edição
                  </Button>
                </motion.div>
              )}

              {/* Finalize: send for approval */}
              {(task.kanban_column === 'edicao' && isEditing) || task.kanban_column === 'alteracao' ? (
                <motion.div whileTap={{ scale: 0.92 }}>
                  <Button onClick={sendForApproval}
                    disabled={saving || (!videoLink.trim() && !task.edited_video_link)}
                    className="gap-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-md">
                    <Send size={14} /> Finalizar e Enviar
                  </Button>
                </motion.div>
              ) : null}

              {!videoLink.trim() && !task.edited_video_link && (task.kanban_column === 'edicao' || task.kanban_column === 'alteracao') && (
                <p className="text-[10px] text-destructive self-center">Adicione o vídeo editado primeiro</p>
              )}

              {task.kanban_column === 'revisao' && (
                <motion.div whileTap={{ scale: 0.92 }}>
                  <Button onClick={markAsFinished} disabled={saving}
                    className="gap-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-md">
                    <Check size={14} /> Marcar como Finalizado
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HistoryLine({ label, date }: { label: string; date: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground">{format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/vpsDb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Film, Megaphone, Image, Palette, ExternalLink, Clock, AlertTriangle,
  Eye, Star, TrendingUp, BarChart3, Timer, Scissors, ArrowRight, Check,
  Search, Users, Upload, Send, History, Zap, Flame,
  Play, Rocket, Trophy, FileText, FolderOpen, X, Link2, Video, Pause
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import DeadlineBadge from '@/components/DeadlineBadge';
import { highlightQuotes } from '@/lib/highlightQuotes';
import { format, differenceInHours, isPast, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { syncContentTaskColumnChange, buildSyncContext } from '@/lib/contentTaskSync';
import { uploadFileToVps } from '@/services/vpsApi';

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400', points: 10 },
  { value: 'criativo', label: 'Criativos', icon: Megaphone, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400', points: 5 },
  { value: 'story', label: 'Story', icon: Image, color: 'text-pink-600 bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400', points: 3 },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400', points: 2 },
];

export interface EditorTask {
  id: string;
  client_id: string;
  title: string;
  content_type: string;
  kanban_column: string;
  description: string | null;
  script_id: string | null;
  recording_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  drive_link: string | null;
  editing_deadline: string | null;
  editing_started_at: string | null;
  edited_video_link: string | null;
  edited_video_type: string | null;
  approval_sent_at: string | null;
  approved_at: string | null;
  adjustment_notes: string | null;
  editing_priority: boolean;
  immediate_alteration: boolean;
  review_deadline: string | null;
  alteration_deadline: string | null;
  approval_deadline: string | null;
  editing_paused_at: string | null;
  editing_paused_seconds: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export function getDeadlineStatus(deadline: string | null) {
  if (!deadline) return { label: 'Sem prazo', variant: 'default' as const };
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const hoursLeft = differenceInHours(deadlineDate, now);
  if (isPast(deadlineDate)) return { label: 'Atrasado', variant: 'destructive' as const };
  if (hoursLeft <= 12) return { label: 'Vence hoje', variant: 'warning' as const };
  if (hoursLeft <= 24) return { label: 'Vence amanhã', variant: 'warning' as const };
  return { label: `${Math.ceil(hoursLeft / 24)}d restantes`, variant: 'success' as const };
}

export function getTypeConfig(type: string) {
  return CONTENT_TYPES.find(t => t.value === type) || CONTENT_TYPES[0];
}

/* ─── Animated Rocket Mascot ──────────────────────────────── */
function RocketMascot({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <motion.div className={className}
      animate={{ y: [0, -6, 0], rotate: [0, 3, -3, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <motion.ellipse cx="32" cy="58" rx="6" ry="4"
          animate={{ ry: [4, 6, 4], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 0.4, repeat: Infinity }}
          fill="url(#flameGradE)" />
        <path d="M32 8C26 8 22 18 22 32V46C22 49 26 52 32 52C38 52 42 49 42 46V32C42 18 38 8 32 8Z" fill="url(#bodyGradE)" />
        <circle cx="32" cy="28" r="7" fill="#1a1a2e" stroke="#e0e0e0" strokeWidth="1.5" />
        <ellipse cx="30" cy="27" rx="3" ry="3.5" fill="white" />
        <ellipse cx="35" cy="27" rx="2.5" ry="3" fill="white" />
        <motion.circle cx="30.5" cy="27.5" r="1.5" fill="#1a1a2e"
          animate={{ cx: [30.5, 31, 30, 30.5] }}
          transition={{ duration: 2.5, repeat: Infinity }} />
        <motion.circle cx="35" cy="27.5" r="1.2" fill="#1a1a2e"
          animate={{ cx: [35, 35.5, 34.5, 35] }}
          transition={{ duration: 2.5, repeat: Infinity }} />
        <path d="M22 38L16 46C16 46 18 48 22 46V38Z" fill="hsl(var(--primary))" />
        <path d="M42 38L48 46C48 46 46 48 42 46V38Z" fill="hsl(var(--primary))" />
        <path d="M28 8C28 8 32 2 36 8" fill="hsl(var(--destructive))" />
        <defs>
          <linearGradient id="bodyGradE" x1="32" y1="8" x2="32" y2="52">
            <stop stopColor="hsl(var(--primary))" />
            <stop offset="1" stopColor="hsl(var(--primary)/0.7)" />
          </linearGradient>
          <radialGradient id="flameGradE">
            <stop stopColor="#fbbf24" />
            <stop offset="1" stopColor="#ef4444" />
          </radialGradient>
        </defs>
      </svg>
    </motion.div>
  );
}

/* ─── Live Timer with pause support ───────────────────────── */
function LiveTimer({ startedAt, large, pausedAt, pausedSeconds }: { startedAt: string; large?: boolean; pausedAt?: string | null; pausedSeconds?: number }) {
  const [elapsed, setElapsed] = useState(0);
  const isPaused = !!pausedAt;
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const paused = pausedSeconds || 0;
    if (isPaused) {
      const pauseTime = new Date(pausedAt!).getTime();
      setElapsed(Math.floor((pauseTime - start) / 1000) - paused);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000) - paused);
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt, isPaused, pausedAt, pausedSeconds]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return (
    <motion.span className={`font-mono font-bold tabular-nums ${isPaused ? 'text-warning' : 'text-primary'} ${large ? 'text-3xl' : 'text-xs'}`}
      animate={isPaused ? { opacity: [1, 0.4, 1] } : { opacity: [1, 0.6, 1] }} transition={{ duration: isPaused ? 1 : 1.5, repeat: Infinity }}>
      {h > 0 && `${h}:`}{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </motion.span>
  );
}

/* ─── Score Celebration ───────────────────────────────────── */
function ScoreCelebration({ points, show, onDone }: { points: number; show: boolean; onDone: () => void }) {
  useEffect(() => {
    if (show) { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }
  }, [show, onDone]);
  if (!show) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
      <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: [0, 1.3, 1], rotate: [-20, 10, 0] }}
        transition={{ duration: 0.6 }} className="flex flex-col items-center gap-3">
        <motion.svg width="80" height="80" viewBox="0 0 64 64" fill="none"
          animate={{ y: [0, -30, -60] }} transition={{ duration: 1.5, ease: 'easeIn' }}>
          <motion.ellipse cx="32" cy="58" rx="8" ry="5"
            animate={{ ry: [5, 8, 5], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 0.3, repeat: Infinity }}
            fill="url(#cFlameGradE)" />
          <path d="M32 8C26 8 22 18 22 32V46C22 49 26 52 32 52C38 52 42 49 42 46V32C42 18 38 8 32 8Z" fill="hsl(var(--primary))" />
          <circle cx="32" cy="28" r="7" fill="#1a1a2e" stroke="#e0e0e0" strokeWidth="1.5" />
          <ellipse cx="30" cy="27" rx="3" ry="3.5" fill="white" />
          <ellipse cx="35" cy="27" rx="2.5" ry="3" fill="white" />
          <circle cx="30.5" cy="27.5" r="1.5" fill="#1a1a2e" />
          <circle cx="35" cy="27.5" r="1.2" fill="#1a1a2e" />
          <path d="M22 38L16 46C16 46 18 48 22 46V38Z" fill="hsl(var(--primary))" />
          <path d="M42 38L48 46C48 46 46 48 42 46V38Z" fill="hsl(var(--primary))" />
          <defs>
            <radialGradient id="cFlameGradE"><stop stopColor="#fbbf24" /><stop offset="1" stopColor="#ef4444" /></radialGradient>
          </defs>
        </motion.svg>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-center">
          <div className="flex items-center gap-2 bg-amber-500 text-white font-black text-2xl px-5 py-2 rounded-full shadow-xl">
            <Star size={20} /> +{points} pts
          </div>
          <p className="text-sm text-foreground font-semibold mt-2">Mandou bem!</p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function EditorDashboard() {
  const { clients, scripts, users } = useApp();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<EditorTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClient, setFilterClient] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationPoints, setCelebrationPoints] = useState(0);
  const [showPerformance, setShowPerformance] = useState(false);
  // Active editing overlay state
  const [activeEditTask, setActiveEditTask] = useState<EditorTask | null>(null);
  const [scriptData, setScriptData] = useState<any>(null);
  const [showScript, setShowScript] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [videoLink, setVideoLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditorRole = profile?.role === 'editor';

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase.from('content_tasks').select('*')
      .in('kanban_column', ['edicao', 'revisao', 'alteracao', 'envio'])
      .order('position', { ascending: true });
    if (data) {
      setTasks(data as EditorTask[]);
      // Refresh active task if exists
      if (activeEditTask) {
        const refreshed = (data as EditorTask[]).find(t => t.id === activeEditTask.id);
        if (refreshed) setActiveEditTask(refreshed);
      }
    }
    setLoading(false);
  }, [activeEditTask?.id]);

  useEffect(() => { fetchTasks(); }, []);

  useEffect(() => {
    const channel = supabase.channel('editor_dash_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_tasks' }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  // Fetch script when active task changes
  useEffect(() => {
    if (!activeEditTask?.script_id) { setScriptData(null); return; }
    const contextScript = scripts.find(s => s.id === activeEditTask.script_id);
    if (contextScript) { setScriptData(contextScript); return; }
    (async () => {
      const { data } = await supabase.from('scripts').select('*').eq('id', activeEditTask.script_id!).single();
      if (data) setScriptData({ id: data.id, title: data.title, content: data.content, videoType: data.video_type });
    })();
  }, [activeEditTask?.script_id, scripts]);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const visibleTasks = useMemo(() => {
    if (!isEditorRole || !user) return tasks;
    return tasks.filter(t => {
      if (t.kanban_column === 'edicao') return !t.assigned_to || t.assigned_to === user.id;
      return !t.assigned_to || t.assigned_to === user.id;
    });
  }, [tasks, isEditorRole, user]);

  const pendingTasks = visibleTasks.filter(t => t.kanban_column === 'edicao' && !t.editing_started_at);
  const inEditTasks = visibleTasks.filter(t => t.kanban_column === 'edicao' && t.editing_started_at);
  const completedTasks = visibleTasks.filter(t => t.kanban_column === 'envio');
  const overdueCount = visibleTasks.filter(t => t.kanban_column === 'edicao' && getDeadlineStatus(t.editing_deadline).variant === 'destructive').length;

  const todayCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: todayStart, end: todayEnd }));
  const weekCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: weekStart, end: weekEnd }));
  const monthCompleted = completedTasks.filter(t => isWithinInterval(parseISO(t.updated_at), { start: monthStart, end: monthEnd }));

  const calcPoints = (list: EditorTask[]) => list.reduce((sum, t) => sum + (getTypeConfig(t.content_type).points || 0), 0);
  const weekPoints = calcPoints(weekCompleted);
  const monthPoints = calcPoints(monthCompleted);

  // Queue tasks (edição + alteração, excluding actively editing ones shown in hero)
  const queueTasks = useMemo(() => {
    return visibleTasks.filter(t =>
      (t.kanban_column === 'edicao' && !t.editing_started_at) ||
      t.kanban_column === 'alteracao'
    );
  }, [visibleTasks]);

  const filteredQueue = useMemo(() => {
    return queueTasks.filter(t => {
      if (filterClient !== 'all' && t.client_id !== filterClient) return false;
      if (filterType !== 'all' && t.content_type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const client = clients.find((c: any) => c.id === t.client_id);
        if (!t.title.toLowerCase().includes(q) && !(client?.companyName || '').toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.immediate_alteration && !b.immediate_alteration) return -1;
      if (b.immediate_alteration && !a.immediate_alteration) return 1;
      if (a.editing_priority && !b.editing_priority) return -1;
      if (b.editing_priority && !a.editing_priority) return 1;
      const aS = getDeadlineStatus(a.editing_deadline);
      const bS = getDeadlineStatus(b.editing_deadline);
      if (aS.variant === 'destructive' && bS.variant !== 'destructive') return -1;
      if (bS.variant === 'destructive' && aS.variant !== 'destructive') return 1;
      if (!a.editing_deadline && !b.editing_deadline) return 0;
      if (!a.editing_deadline) return 1;
      if (!b.editing_deadline) return -1;
      return new Date(a.editing_deadline).getTime() - new Date(b.editing_deadline).getTime();
    });
  }, [queueTasks, filterClient, filterType, searchQuery, clients]);

  /* ─── Actions ──────────────────────────────────────────── */
  const handleStartEditing = async (task: EditorTask) => {
    if (!user) return;
    const { error } = await supabase.from('content_tasks').update({
      assigned_to: user.id,
      editing_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    if (error) { toast.error('Erro ao iniciar edição'); return; }
    await supabase.from('task_history').insert({ task_id: task.id, user_id: user.id, action: 'Edição iniciada' });
    toast.success('Edição iniciada!');
    const updated = { ...task, assigned_to: user.id, editing_started_at: new Date().toISOString() };
    setActiveEditTask(updated);
    setShowUpload(false);
    setShowScript(false);
    setVideoLink('');
    fetchTasks();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeEditTask) return;
    if (file.size > 500 * 1024 * 1024) { toast.error('Máximo: 500MB'); return; }
    setUploading(true);
    setUploadProgress(`Enviando ${file.name}...`);
    try {
      const folder = `content/${activeEditTask.client_id}/${activeEditTask.id}`;
      const url = await uploadFileToVps(file, folder);
      await supabase.from('content_tasks').update({
        edited_video_link: url, edited_video_type: 'upload', updated_at: new Date().toISOString()
      }).eq('id', activeEditTask.id);
      setVideoLink(url);
      await supabase.from('task_history').insert({ task_id: activeEditTask.id, user_id: user?.id, action: 'Vídeo enviado via upload', details: url });
      toast.success('Vídeo enviado!');
      fetchTasks();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveVideoLink = async () => {
    if (!videoLink.trim() || !activeEditTask) return;
    setSaving(true);
    await supabase.from('content_tasks').update({
      edited_video_link: videoLink.trim(), edited_video_type: 'link', updated_at: new Date().toISOString()
    }).eq('id', activeEditTask.id);
    toast.success('Link salvo!');
    fetchTasks();
    setSaving(false);
  };

  const sendForReview = async () => {
    if (!activeEditTask) return;
    const link = videoLink.trim() || activeEditTask.edited_video_link;
    if (!link) { toast.error('Adicione o vídeo primeiro'); return; }
    setSaving(true);
    await supabase.from('content_tasks').update({
      kanban_column: 'revisao', updated_at: new Date().toISOString(),
    }).eq('id', activeEditTask.id);
    const cl = clients.find(c => c.id === activeEditTask.client_id);
    const ctx = buildSyncContext({ ...activeEditTask, edited_video_link: link } as any, {
      userId: user?.id, clientName: cl?.companyName, clientWhatsapp: (cl as any)?.whatsapp,
    });
    await syncContentTaskColumnChange('revisao', ctx);
    await supabase.from('task_history').insert({ task_id: activeEditTask.id, user_id: user?.id, action: 'Enviado para revisão' });

    const pts = getTypeConfig(activeEditTask.content_type).points || 5;
    setCelebrationPoints(pts);
    setShowCelebration(true);
    setActiveEditTask(null);
    setShowUpload(false);
    setShowScript(false);
    toast.success('Enviado para revisão!');
    fetchTasks();
    setSaving(false);
  };

  /* ─── Pause / Resume ───────────────────────────────────── */
  const handlePauseEditing = async () => {
    if (!activeEditTask) return;
    await supabase.from('content_tasks').update({
      editing_paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', activeEditTask.id);
    await supabase.from('task_history').insert({ task_id: activeEditTask.id, user_id: user?.id, action: 'Edição pausada' });
    toast.info('Edição pausada ⏸️');
    setActiveEditTask({ ...activeEditTask, editing_paused_at: new Date().toISOString() });
    fetchTasks();
  };

  const handleResumeEditing = async () => {
    if (!activeEditTask || !activeEditTask.editing_paused_at) return;
    const pausedDuration = Math.floor((Date.now() - new Date(activeEditTask.editing_paused_at).getTime()) / 1000);
    const newPausedSeconds = (activeEditTask.editing_paused_seconds || 0) + pausedDuration;
    await supabase.from('content_tasks').update({
      editing_paused_at: null,
      editing_paused_seconds: newPausedSeconds,
      updated_at: new Date().toISOString(),
    } as any).eq('id', activeEditTask.id);
    await supabase.from('task_history').insert({ task_id: activeEditTask.id, user_id: user?.id, action: 'Edição retomada', details: `Pausa de ${Math.floor(pausedDuration / 60)}min` });
    toast.success('Edição retomada! ▶️');
    setActiveEditTask({ ...activeEditTask, editing_paused_at: null, editing_paused_seconds: newPausedSeconds });
    fetchTasks();
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <RocketMascot size={64} />
      <p className="text-muted-foreground animate-pulse">Carregando sua bancada...</p>
    </div>
  );

  const activeClient = activeEditTask ? clients.find(c => c.id === activeEditTask.client_id) : null;
  const activeCfg = activeEditTask ? getTypeConfig(activeEditTask.content_type) : null;
  const hasVideo = !!(videoLink.trim() || activeEditTask?.edited_video_link);

  return (
    <div className="space-y-5">
      <AnimatePresence>
        <ScoreCelebration points={celebrationPoints} show={showCelebration} onDone={() => setShowCelebration(false)} />
      </AnimatePresence>

      {/* ═══════ HEADER ═══════ */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <RocketMascot size={36} />
          <div>
            <h1 className="text-lg font-bold text-foreground">Bancada de Edição</h1>
            <p className="text-xs text-muted-foreground">
              {inEditTasks.length > 0 && <span className="text-primary font-semibold">{inEditTasks.length} editando</span>}
              {inEditTasks.length > 0 && pendingTasks.length > 0 && ' · '}
              {pendingTasks.length > 0 && `${pendingTasks.length} na fila`}
              {overdueCount > 0 && <span className="text-destructive font-semibold"> · {overdueCount} atrasado{overdueCount !== 1 ? 's' : ''}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setShowPerformance(!showPerformance)}
            className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1.5 cursor-pointer">
            <Trophy size={14} className="text-amber-500" />
            <span className="text-sm font-black text-amber-600">{weekPoints}</span>
            <span className="text-[10px] text-muted-foreground">pts</span>
          </motion.button>
        </div>
      </motion.div>

      {/* ═══════ PERFORMANCE STATS (toggle) ═══════ */}
      <AnimatePresence>
        {showPerformance && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-2">
              {[
                { label: 'Hoje', value: todayCompleted.length, icon: Scissors, color: 'text-primary', bg: 'bg-primary/10' },
                { label: 'Semana', value: weekCompleted.length, icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'Mês', value: monthCompleted.length, icon: BarChart3, color: 'text-green-500', bg: 'bg-green-500/10' },
                { label: 'Pontos', value: monthPoints, icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`${s.bg} rounded-xl p-3 border border-border/50`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <s.icon size={14} className={s.color} />
                    <span className="text-[11px] text-muted-foreground">{s.label}</span>
                  </div>
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ ACTIVE EDITING HERO CARD ═══════ */}
      <AnimatePresence>
        {activeEditTask && activeEditTask.editing_started_at && (
          <motion.div
            key={activeEditTask.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="relative rounded-2xl overflow-hidden"
          >
            {/* Animated glowing border */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary via-blue-500 to-primary bg-[length:200%_100%] animate-[shimmer_3s_linear_infinite] p-[2px]">
              <div className="w-full h-full bg-card rounded-2xl" />
            </div>
            <div className="relative z-10 p-5 space-y-4">
              {/* Top bar */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                    <RocketMascot size={36} />
                  </motion.div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-primary font-bold">Edição em andamento</p>
                    <p className="text-base font-bold text-foreground leading-tight">{activeEditTask.title}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActiveEditTask(null)}>
                  <X size={14} />
                </Button>
              </div>

              {/* Client + Timer row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {activeClient && <ClientLogo client={activeClient as any} size="sm" />}
                  <span className="text-sm font-semibold text-foreground">{activeClient?.companyName}</span>
                  {activeCfg && (
                    <Badge className={`text-[10px] px-1.5 py-0 ${activeCfg.color} border-0`}>
                      <activeCfg.icon size={10} className="mr-0.5" />{activeCfg.label}
                    </Badge>
                  )}
                </div>
                {/* Live timer */}
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-4 py-2">
                  <motion.div className="w-2.5 h-2.5 rounded-full bg-primary"
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }} />
                  <LiveTimer startedAt={activeEditTask.editing_started_at!} large />
                </div>
              </div>

              {/* Deadline warning */}
              {activeEditTask.editing_deadline && (
                <DeadlineBadge deadline={activeEditTask.editing_deadline} label="Prazo de edição" />
              )}

              {/* Adjustment notes */}
              {activeEditTask.kanban_column === 'alteracao' && activeEditTask.adjustment_notes && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Ajustes solicitados</p>
                  <p className="text-sm text-foreground">{activeEditTask.adjustment_notes}</p>
                </div>
              )}

              {/* Quick action buttons */}
              <div className="flex flex-wrap gap-2">
                {/* Materiais */}
                <motion.div whileTap={{ scale: 0.93 }}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    disabled={!activeEditTask.drive_link}
                    onClick={() => activeEditTask.drive_link && window.open(activeEditTask.drive_link, '_blank')}>
                    <FolderOpen size={14} /> Materiais
                  </Button>
                </motion.div>

                {/* Roteiro */}
                <motion.div whileTap={{ scale: 0.93 }}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    disabled={!activeEditTask.script_id}
                    onClick={() => setShowScript(!showScript)}>
                    <FileText size={14} /> Roteiro
                  </Button>
                </motion.div>

                {/* Vídeo anexado indicator */}
                {hasVideo && (
                  <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/30 gap-1">
                    <Check size={12} /> Vídeo pronto
                  </Badge>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* FINALIZAR — main CTA */}
                <motion.div whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.03 }}>
                  <Button
                    onClick={() => {
                      if (hasVideo) { sendForReview(); }
                      else { setShowUpload(true); }
                    }}
                    disabled={saving}
                    className="gap-2 text-sm font-bold bg-gradient-to-r from-primary via-blue-500 to-primary bg-[length:200%_100%] animate-[shimmer_3s_linear_infinite] text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
                  >
                    <Rocket size={16} />
                    {hasVideo ? 'Enviar para Revisão' : 'Finalizar'}
                  </Button>
                </motion.div>
              </div>

              {/* ─── Script overlay ──────────────────────── */}
              <AnimatePresence>
                {showScript && scriptData && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <FileText size={13} className="text-primary" /> {scriptData.title}
                        </p>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowScript(false)}>
                          <X size={12} />
                        </Button>
                      </div>
                      <div className="prose prose-sm max-w-none text-foreground max-h-[300px] overflow-y-auto rounded-lg bg-background p-3 border border-border"
                        dangerouslySetInnerHTML={{ __html: highlightQuotes(scriptData.content) || '<em>Sem conteúdo</em>' }} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ─── Upload overlay ──────────────────────── */}
              <AnimatePresence>
                {showUpload && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Upload size={13} className="text-primary" /> Enviar vídeo editado
                        </p>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowUpload(false)}>
                          <X size={12} />
                        </Button>
                      </div>

                      {/* File upload */}
                      <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                        <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} className="hidden" id="hero-video-upload" />
                        <label htmlFor="hero-video-upload" className="cursor-pointer flex flex-col items-center gap-2">
                          <Video size={24} className="text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{uploading ? uploadProgress : 'Clique para enviar vídeo'}</span>
                          <span className="text-[10px] text-muted-foreground/60">MP4, MOV — até 500MB</span>
                        </label>
                        {uploading && (
                          <div className="mt-2 flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <span className="text-xs text-primary font-medium">Enviando...</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] text-muted-foreground">OU COLE O LINK</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <div className="flex gap-2">
                        <Input placeholder="Cole o link do vídeo..." value={videoLink} onChange={e => setVideoLink(e.target.value)} className="flex-1 h-9" />
                        <Button size="sm" onClick={saveVideoLink} disabled={saving || !videoLink.trim()} className="gap-1 h-9">
                          <Link2 size={13} /> Salvar
                        </Button>
                      </div>

                      {hasVideo && (
                        <>
                          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 rounded-lg px-3 py-2 border border-green-500/30">
                            <Check size={14} /> Vídeo pronto
                          </div>
                          <motion.div whileTap={{ scale: 0.93 }}>
                            <Button onClick={sendForReview} disabled={saving}
                              className="w-full gap-2 font-bold bg-gradient-to-r from-primary to-blue-500 text-primary-foreground shadow-md">
                              <Send size={14} /> Enviar para Revisão
                            </Button>
                          </motion.div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ ALSO EDITING (other in-edit tasks, small cards) ═══════ */}
      {inEditTasks.filter(t => t.id !== activeEditTask?.id).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Também em edição</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {inEditTasks.filter(t => t.id !== activeEditTask?.id).map(task => {
              const cl = clients.find(c => c.id === task.client_id);
              const cfg = getTypeConfig(task.content_type);
              return (
                <motion.div key={task.id} whileTap={{ scale: 0.97 }}
                  onClick={() => { setActiveEditTask(task); setShowUpload(false); setShowScript(false); setVideoLink(task.edited_video_link || ''); }}
                  className="bg-card border border-primary/20 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-primary/40 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    {cl && <ClientLogo client={cl as any} size="sm" />}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{task.title}</p>
                      <Badge className={`text-[9px] px-1 py-0 ${cfg.color} border-0`}>{cfg.label}</Badge>
                    </div>
                  </div>
                  {task.editing_started_at && (
                    <div className="flex items-center gap-1 bg-primary/10 rounded-full px-2 py-0.5 shrink-0">
                      <motion.div className="w-1.5 h-1.5 rounded-full bg-primary" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                      <LiveTimer startedAt={task.editing_started_at} />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ EDITING QUEUE ═══════ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Scissors size={15} className="text-primary" />
            Fila de Edição
            {filteredQueue.length > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{filteredQueue.length}</Badge>
            )}
          </h2>
        </div>

        {/* Compact filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[140px] max-w-[240px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs" />
          </div>
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {CONTENT_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filteredQueue.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-card border border-border rounded-xl p-8 text-center">
            <RocketMascot size={48} className="mx-auto mb-2" />
            <p className="text-foreground font-semibold text-sm">Fila limpa!</p>
            <p className="text-xs text-muted-foreground">Todos os conteúdos foram editados</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredQueue.map((task, i) => (
              <QueueCard key={task.id} task={task} clients={clients} index={i}
                onStartEditing={() => handleStartEditing(task)}
                currentUserId={user?.id}
                users={users} />
            ))}
          </div>
        )}
      </div>

      {/* Shimmer animation keyframe */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </div>
  );
}

/* ─── Queue Card ──────────────────────────────────────────── */
function QueueCard({ task, clients, index, onStartEditing, currentUserId, users }: {
  task: EditorTask; clients: any[]; index: number;
  onStartEditing: () => void; currentUserId?: string; users?: any[];
}) {
  const client = clients.find(c => c.id === task.client_id);
  const cfg = getTypeConfig(task.content_type);
  const deadline = getDeadlineStatus(task.editing_deadline);
  const clientColor = client?.color || '217 91% 60%';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      whileHover={{ scale: 1.01 }}
      className={`relative bg-card border border-border rounded-xl overflow-hidden transition-all ${
        deadline.variant === 'destructive' ? 'ring-1 ring-destructive/40' : ''
      } ${task.immediate_alteration ? 'ring-1 ring-red-500/60' : ''} ${task.editing_priority && !task.immediate_alteration ? 'ring-1 ring-amber-500/40' : ''}`}
    >
      {/* Priority banner */}
      {(task.immediate_alteration || task.editing_priority) && (
        <div className={`px-3 py-1 flex items-center gap-1.5 text-[10px] font-bold ${
          task.immediate_alteration ? 'bg-red-500/15 text-red-600' : 'bg-amber-500/15 text-amber-600'
        }`}>
          {task.immediate_alteration ? <><Zap size={10} className="animate-pulse" /> ALTERAÇÃO IMEDIATA</> : <><Flame size={10} /> PRIORIDADE</>}
        </div>
      )}

      <div className="h-1" style={{ backgroundColor: `hsl(${clientColor})` }} />
      <div className="p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {client && <ClientLogo client={client as any} size="sm" />}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate">{client?.companyName || 'Cliente'}</p>
              <Badge className={`text-[9px] px-1 py-0 ${cfg.color} border-0`}>
                <cfg.icon size={9} className="mr-0.5" />{cfg.label}
              </Badge>
            </div>
          </div>
          <Badge variant="outline" className={`text-[9px] shrink-0 ${
            task.kanban_column === 'alteracao' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-blue-500/10 text-blue-600 border-blue-500/30'
          }`}>
            {task.kanban_column === 'alteracao' ? 'Ajuste' : 'Na fila'}
          </Badge>
        </div>

        <p className="text-sm font-semibold text-foreground leading-tight">{task.title}</p>

        {task.editing_deadline && <DeadlineBadge deadline={task.editing_deadline} label="Edição" />}

        {/* Assigned editor */}
        {task.assigned_to && users && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 rounded-md px-2 py-1">
            <Scissors size={10} />
            <span>Editor: <strong className="text-foreground">{users.find((u: any) => u.id === task.assigned_to)?.name || 'Editor'}</strong></span>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {task.script_id && <span className="flex items-center gap-0.5"><Eye size={10} /> Roteiro</span>}
          {task.drive_link && <span className="flex items-center gap-0.5"><ExternalLink size={10} /> Drive</span>}
        </div>

        {/* Start Editing CTA */}
        {!task.assigned_to && (
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button size="sm" className="w-full gap-1.5 h-8 text-xs bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-md"
              onClick={(e) => { e.stopPropagation(); onStartEditing(); }}>
              <Rocket size={13} /> Iniciar Edição
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

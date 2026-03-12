import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Megaphone, Image, Palette, Calendar, User, FileText, CheckCircle2,
  AlertTriangle, Clock, ExternalLink, ThumbsUp, MessageSquareWarning, Link2,
  ArrowRight, Send, Eye, Zap, Flame, MessageSquare, CalendarClock, Trash2, Edit,
  History, Lightbulb, Video, Scissors, ScanEye, Pencil, MailCheck, CalendarCheck, MonitorCheck,
  Upload, Loader2, Rocket
} from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import ClientLogo from '@/components/ClientLogo';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { syncContentTaskColumnChange, buildSyncContext } from '@/lib/contentTaskSync';
import { sendWhatsAppMessage, getWhatsAppConfig } from '@/services/whatsappService';
import type { Client, Script } from '@/types';

const CONTENT_TYPES = [
  { value: 'reels', label: 'Reels', icon: Film, color: 'text-blue-700 bg-blue-50 border border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
  { value: 'criativo', label: 'Criativos', icon: Megaphone, color: 'text-purple-700 bg-purple-50 border border-purple-200/60 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800' },
  { value: 'story', label: 'Story', icon: Image, color: 'text-pink-700 bg-pink-50 border border-pink-200/60 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800' },
  { value: 'arte', label: 'Arte', icon: Palette, color: 'text-amber-700 bg-amber-50 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
];

const KANBAN_COLUMNS = [
  { id: 'ideias', label: 'Zona de Ideias', icon: '💡' },
  { id: 'captacao', label: 'Captação', icon: '📹' },
  { id: 'edicao', label: 'Edição de Vídeo', icon: '🎬' },
  { id: 'revisao', label: 'Revisão', icon: '👁' },
  { id: 'alteracao', label: 'Alteração', icon: '✏️' },
  { id: 'envio', label: 'Enviado p/ Cliente', icon: '📤' },
  { id: 'agendamentos', label: 'Agendamentos', icon: '📅' },
  { id: 'acompanhamento', label: 'Acompanhamento', icon: '👀' },
];

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'LinkedIn'];

// Rocket Launch Button with floating animation
const RocketLaunchButton = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => {
  const [rockets, setRockets] = useState<{ id: number; x: number; y: number }[]>([]);

  const handleClick = () => {
    if (disabled) return;
    const newRockets = Array.from({ length: 6 }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 80 + 10,
      y: Math.random() * 20 + 40,
    }));
    setRockets(prev => [...prev, ...newRockets]);
    setTimeout(() => {
      setRockets(prev => prev.filter(r => !newRockets.find(nr => nr.id === r.id)));
    }, 1800);
    onClick();
  };

  return (
    <>
      <AnimatePresence>
        {rockets.map(r => (
          <motion.div
            key={r.id}
            initial={{ opacity: 1, left: `${r.x}%`, top: `${r.y}%`, scale: 1, rotate: -15 }}
            animate={{
              opacity: [1, 1, 0],
              top: '-10%',
              left: `${r.x + (Math.random() - 0.5) * 30}%`,
              scale: [1, 1.4, 0.5],
              rotate: [-15, -30 + Math.random() * 20, -45],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 + Math.random() * 0.5, ease: 'easeOut' }}
            className="fixed z-[9999] pointer-events-none text-3xl"
          >
            🚀
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.button
        whileHover={disabled ? {} : { scale: 1.03, boxShadow: '0 0 20px hsl(var(--primary) / 0.4)' }}
        whileTap={disabled ? {} : { scale: 0.97 }}
        onClick={handleClick}
        disabled={disabled}
        className={`
          w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm
          transition-all duration-300 relative overflow-hidden group
          ${disabled
            ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
            : 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg hover:shadow-xl cursor-pointer'
          }
        `}
      >
        {!disabled && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
            animate={{ x: ['-200%', '200%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />
        )}
        <motion.span
          animate={disabled ? {} : { y: [0, -3, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-lg relative z-10"
        >
          🚀
        </motion.span>
        <span className="relative z-10">Finalizar Etapa → {label}</span>
        <ArrowRight size={16} className="ml-auto relative z-10 group-hover:translate-x-1 transition-transform" />
      </motion.button>
    </>
  );
};

interface ContentTask {
  id: string;
  client_id: string;
  title: string;
  content_type: string;
  kanban_column: string;
  description: string | null;
  recording_id: string | null;
  script_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  scheduled_recording_date: string | null;
  scheduled_recording_time: string | null;
  drive_link: string | null;
  edited_video_link: string | null;
  adjustment_notes: string | null;
  approved_at: string | null;
  approval_sent_at: string | null;
  editing_priority: boolean;
  immediate_alteration: boolean;
  review_deadline: string | null;
  alteration_deadline: string | null;
  approval_deadline: string | null;
  position: number;
  editing_started_at: string | null;
  editing_deadline: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskHistory {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
}

interface Props {
  task: ContentTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

// ─── JOURNEY TIMELINE STAGES ─────────────────────────────
const JOURNEY_STAGES = [
  { id: 'ideias', label: 'Criado', icon: Lightbulb },
  { id: 'captacao', label: 'Captação', icon: Video },
  { id: 'edicao', label: 'Edição', icon: Scissors },
  { id: 'revisao', label: 'Revisão', icon: ScanEye },
  { id: 'envio', label: 'Enviado', icon: MailCheck },
  { id: 'agendamentos', label: 'Agendado', icon: CalendarCheck },
  { id: 'acompanhamento', label: 'Publicado', icon: MonitorCheck },
];

function getStageIndex(column: string) {
  if (column === 'alteracao') return 3;
  if (column === 'arquivado') return 7;
  const idx = JOURNEY_STAGES.findIndex(s => s.id === column);
  return idx >= 0 ? idx : 0;
}

interface TimelineUser {
  name: string;
  avatarUrl?: string | null;
}

interface JourneyTimelineProps {
  currentColumn: string;
  task: ContentTask;
  users: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  scripts: Script[];
  history: TaskHistory[];
  recordings: Array<{ id: string; videomaker_id: string }>;
}

function JourneyTimeline({ currentColumn, task, users, scripts, history, recordings }: JourneyTimelineProps) {
  const activeIdx = getStageIndex(currentColumn);
  const isAlteracao = currentColumn === 'alteracao';

  const createdBy = task.created_by ? users.find(u => u.id === task.created_by) : null;
  const linkedScript = task.script_id ? scripts.find(s => s.id === task.script_id) : null;
  const scriptCreator = (!createdBy && linkedScript?.createdBy) ? users.find(u => u.id === linkedScript.createdBy) : null;
  const assignedEditor = task.assigned_to ? users.find(u => u.id === task.assigned_to) : null;

  const findHistoryEntry = (keywords: string[]) => {
    return history.find(h => keywords.some(k => h.action.toLowerCase().includes(k.toLowerCase())));
  };

  const linkedRecording = task.recording_id ? recordings.find(r => r.id === task.recording_id) : null;
  const recordingVideomaker = linkedRecording ? users.find(u => u.id === linkedRecording.videomaker_id) : null;

  const captacaoEntry = findHistoryEntry(['captação', 'Captação', 'gravação', 'gravado']);
  const edicaoEntry = findHistoryEntry(['edição', 'Edição', 'editor']);
  const revisaoEntry = findHistoryEntry(['revisão', 'Revisão']);
  const envioEntry = findHistoryEntry(['enviado', 'Enviado', 'cliente']);
  const agendamentoEntry = findHistoryEntry(['agendado', 'Agendado', 'agendar']);
  const publicadoEntry = findHistoryEntry(['postado', 'Postado', 'publicado']);

  const getUserFromHistory = (entry: TaskHistory | undefined): TimelineUser | null => {
    if (!entry?.user_id) return null;
    const u = users.find(usr => usr.id === entry.user_id);
    return u ? { name: u.name, avatarUrl: u.avatarUrl } : null;
  };

  const stages = [
    {
      ...JOURNEY_STAGES[0],
      person: createdBy ? { name: createdBy.name, avatarUrl: createdBy.avatarUrl } : (scriptCreator ? { name: scriptCreator.name, avatarUrl: scriptCreator.avatarUrl } : null),
      detail: linkedScript ? `Roteiro: ${linkedScript.title}` : null,
      date: task.created_at,
    },
    {
      ...JOURNEY_STAGES[1],
      person: recordingVideomaker ? { name: recordingVideomaker.name, avatarUrl: recordingVideomaker.avatarUrl } : (captacaoEntry ? getUserFromHistory(captacaoEntry) : null),
      detail: task.scheduled_recording_date ? `Gravação: ${format(new Date(task.scheduled_recording_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}${task.scheduled_recording_time ? ` às ${task.scheduled_recording_time}` : ''}` : null,
      date: captacaoEntry?.created_at || null,
    },
    {
      ...JOURNEY_STAGES[2],
      person: assignedEditor ? { name: assignedEditor.name, avatarUrl: assignedEditor.avatarUrl } : (edicaoEntry ? getUserFromHistory(edicaoEntry) : null),
      detail: task.editing_priority ? '⚡ Prioridade de edição' : null,
      date: task.editing_started_at || edicaoEntry?.created_at || null,
    },
    {
      ...JOURNEY_STAGES[3],
      person: revisaoEntry ? getUserFromHistory(revisaoEntry) : null,
      detail: task.approved_at ? `Aprovado em ${format(new Date(task.approved_at), "dd/MM HH:mm", { locale: ptBR })}` : null,
      date: revisaoEntry?.created_at || null,
    },
    {
      ...JOURNEY_STAGES[4],
      person: envioEntry ? getUserFromHistory(envioEntry) : null,
      detail: task.approval_sent_at ? `Enviado ao cliente` : null,
      date: envioEntry?.created_at || task.approval_sent_at || null,
    },
    {
      ...JOURNEY_STAGES[5],
      person: agendamentoEntry ? getUserFromHistory(agendamentoEntry) : null,
      detail: null,
      date: agendamentoEntry?.created_at || null,
    },
    {
      ...JOURNEY_STAGES[6],
      person: publicadoEntry ? getUserFromHistory(publicadoEntry) : null,
      detail: null,
      date: publicadoEntry?.created_at || null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <ArrowRight size={13} className="text-primary" />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
          Jornada do Conteúdo
        </span>
      </div>

      {/* Horizontal progress bar */}
      <div className="relative px-1 pt-2 pb-1">
        <div className="absolute top-[22px] left-4 right-4 h-1 rounded-full bg-muted" />
        <motion.div
          className="absolute top-[22px] left-4 h-1 rounded-full bg-gradient-to-r from-primary/80 to-primary"
          initial={{ width: '0%' }}
          animate={{ width: `${Math.min((activeIdx / (JOURNEY_STAGES.length - 1)) * 100, 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          style={{ maxWidth: 'calc(100% - 2rem)' }}
        />
        <div className="relative flex justify-between">
          {JOURNEY_STAGES.map((stage, idx) => {
            const isCompleted = idx < activeIdx;
            const isCurrent = idx === activeIdx;
            const StageIcon = stage.icon;
            return (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.06, duration: 0.35 }}
                className="flex flex-col items-center gap-1 z-10"
              >
                <motion.div
                  className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground shadow-md ring-3 ring-primary/20'
                      : isCompleted
                        ? 'bg-primary/80 text-primary-foreground'
                        : 'bg-muted border-2 border-border text-muted-foreground/40'
                  }`}
                  animate={isCurrent ? { scale: [1, 1.08, 1] } : {}}
                  transition={isCurrent ? { repeat: Infinity, duration: 2.5, ease: 'easeInOut' } : {}}
                >
                  {isCompleted ? <CheckCircle2 size={12} /> : <StageIcon size={10} />}
                  {isCurrent && (
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-primary/40"
                      animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                    />
                  )}
                </motion.div>
                <span className={`text-[8px] font-semibold leading-tight text-center max-w-[3rem] ${
                  isCurrent ? 'text-primary' : isCompleted ? 'text-foreground/70' : 'text-muted-foreground/40'
                }`}>
                  {stage.label}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {isAlteracao && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20"
        >
          <Pencil size={13} className="text-amber-600" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Em alteração — aguardando correções do editor
          </span>
        </motion.div>
      )}

      {/* Vertical detail cards */}
      <div className="relative ml-3 mt-1">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" />

        {stages.map((stage, idx) => {
          const isCompleted = idx < activeIdx;
          const isCurrent = idx === activeIdx;
          const isFuture = idx > activeIdx;
          const StageIcon = stage.icon;

          if (isFuture) return null;

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + idx * 0.08, duration: 0.35 }}
              className="relative pl-6 pb-3 last:pb-0"
            >
              <div className={`absolute left-0 top-2.5 w-2.5 h-2.5 rounded-full -translate-x-[5px] ring-2 ring-card ${
                isCurrent ? 'bg-primary shadow-sm shadow-primary/30' : 'bg-primary/60'
              }`} />

              <div className={`rounded-xl px-3 py-2.5 transition-all duration-200 ${
                isCurrent
                  ? 'bg-primary/5 border border-primary/15 shadow-sm'
                  : 'bg-muted/30 border border-border/40'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <StageIcon size={12} className={isCurrent ? 'text-primary' : 'text-muted-foreground'} />
                  <span className={`text-[11px] font-bold uppercase tracking-wide ${
                    isCurrent ? 'text-primary' : 'text-foreground/70'
                  }`}>
                    {stage.label}
                  </span>
                  {stage.date && (
                    <span className="text-[9px] text-muted-foreground/60 ml-auto font-medium">
                      {format(new Date(stage.date), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                </div>

                {stage.person && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <UserAvatar user={{ name: stage.person.name, avatarUrl: stage.person.avatarUrl || undefined }} size="sm" />
                    <span className="text-xs font-medium text-foreground/80">{stage.person.name}</span>
                  </div>
                )}

                {stage.detail && (
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{stage.detail}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── HISTORY HELPERS ─────────────────────────────────────
function getHistoryIcon(action: string): string {
  if (action.includes('Criado') || action.includes('criado')) return '✨';
  if (action.includes('Captação') || action.includes('captação')) return '📹';
  if (action.includes('Edição') || action.includes('edição') || action.includes('editor')) return '🎬';
  if (action.includes('Revisão') || action.includes('revisão')) return '👁';
  if (action.includes('Alteração') || action.includes('alteração') || action.includes('ajuste')) return '✏️';
  if (action.includes('Aprovado') || action.includes('aprovado') || action.includes('aprovou')) return '✅';
  if (action.includes('Enviado') || action.includes('enviado') || action.includes('cliente')) return '📤';
  if (action.includes('Agendado') || action.includes('agendado')) return '📅';
  if (action.includes('WhatsApp') || action.includes('whatsapp')) return '💬';
  if (action.includes('Prioridade') || action.includes('prioridade')) return '⚡';
  if (action.includes('Postado') || action.includes('postado')) return '🎯';
  return '📝';
}

function getHistoryColor(action: string): string {
  if (action.includes('Aprovado') || action.includes('aprovado')) return 'bg-green-500';
  if (action.includes('Alteração') || action.includes('ajuste')) return 'bg-amber-500';
  if (action.includes('Prioridade')) return 'bg-red-500';
  return 'bg-primary';
}

export default function ContentTaskDetailSheet({ task, open, onOpenChange, onRefresh }: Props) {
  const { clients, users, scripts, recordings } = useApp();
  const { user } = useAuth();
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // Adjustment dialog state
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [adjustmentImmediate, setAdjustmentImmediate] = useState(false);

  // Schedule state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedPlatform, setSchedPlatform] = useState('');

  // Link state
  const [showLinkForm, setShowLinkForm] = useState<'drive' | 'video' | null>(null);
  const [linkValue, setLinkValue] = useState('');

  // Video upload state
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Fetch history
  useEffect(() => {
    if (!task?.id || !open) return;
    supabase.from('task_history').select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setHistory(data as TaskHistory[]); });
  }, [task?.id, open]);

  // Reset forms when task changes
  useEffect(() => {
    setShowAdjustmentForm(false);
    setShowScheduleForm(false);
    setShowLinkForm(null);
    setAdjustmentNotes('');
    setAdjustmentImmediate(false);
  }, [task?.id]);

  if (!task) return null;

  const client = clients.find(c => c.id === task.client_id);
  const assignedUser = task.assigned_to ? users.find(u => u.id === task.assigned_to) : null;
  const linkedScript = task.script_id ? scripts.find(s => s.id === task.script_id) : null;
  const typeConfig = CONTENT_TYPES.find(t => t.value === task.content_type) || CONTENT_TYPES[0];
  const TypeIcon = typeConfig.icon;
  const colConfig = KANBAN_COLUMNS.find(c => c.id === task.kanban_column);

  const syncTask = async (newColumn: string) => {
    const ctx = buildSyncContext(task as any, {
      userId: user?.id,
      clientName: client?.companyName,
      clientWhatsapp: client?.whatsapp,
    });
    await syncContentTaskColumnChange(newColumn, ctx);
  };

  // ─── VIDEO UPLOAD ──────────────────────────────────────────
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    try {
      const ext = file.name.split('.').pop() || 'mp4';
      const filePath = `${task.client_id}/${task.id}/video_${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from('client-content')
        .upload(filePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('client-content')
        .getPublicUrl(filePath);

      const videoUrl = urlData.publicUrl;

      await supabase.from('content_tasks').update({
        edited_video_link: videoUrl,
        updated_at: new Date().toISOString(),
      } as any).eq('id', task.id);

      toast.success('🎬 Vídeo enviado com sucesso!');
      onRefresh();
    } catch (err: any) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  // ─── ADD TO CLIENT PORTAL ──────────────────────────────────
  const addToClientPortal = async () => {
    if (!task.edited_video_link) return;
    
    const now = new Date();
    const contentTypeMap: Record<string, string> = {
      'reels': 'reel',
      'criativo': 'criativo',
      'story': 'story',
      'arte': 'arte',
    };

    // Check if already exists in portal
    const { data: existing } = await supabase
      .from('client_portal_contents')
      .select('id')
      .eq('client_id', task.client_id)
      .eq('title', task.title)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing
      await supabase.from('client_portal_contents').update({
        file_url: task.edited_video_link,
        status: 'pendente',
        updated_at: now.toISOString(),
      } as any).eq('id', existing[0].id);
    } else {
      // Create new
      await supabase.from('client_portal_contents').insert({
        client_id: task.client_id,
        title: task.title,
        content_type: contentTypeMap[task.content_type] || 'reel',
        file_url: task.edited_video_link,
        status: 'pendente',
        season_month: now.getMonth() + 1,
        season_year: now.getFullYear(),
        uploaded_by: user?.id || null,
      } as any);
    }
  };

  // ─── ACTIONS ──────────────────────────────────────────────
  const handleApprove = async () => {
    await supabase.from('content_tasks').update({
      kanban_column: 'envio',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);

    // Add video to client portal
    await addToClientPortal();

    await syncTask('envio');
    toast.success('✅ Aprovado! Vídeo adicionado ao Portal do Cliente');
    onRefresh();
    onOpenChange(false);
  };

  const handleRequestAdjustments = async () => {
    if (!adjustmentNotes.trim()) { toast.error('Descreva os ajustes'); return; }
    await supabase.from('content_tasks').update({
      kanban_column: 'alteracao',
      adjustment_notes: adjustmentNotes.trim(),
      immediate_alteration: adjustmentImmediate,
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    await syncTask('alteracao');
    toast.success(adjustmentImmediate ? '🚨 Alteração IMEDIATA solicitada!' : '📝 Ajustes solicitados');
    onRefresh();
    onOpenChange(false);
  };

  const handleSendWhatsApp = async () => {
    if (!client?.whatsapp) { toast.error('Cliente sem WhatsApp'); return; }
    setSendingWhatsApp(true);
    try {
      const portalUrl = `${window.location.origin}/portal/${client.id}`;
      const msg = `Olá, ${client.responsiblePerson || client.companyName}! 😊\n\nSeu conteúdo "${task.title}" ficou pronto e está disponível para aprovação! 🎬\n\n📱 Acesse a Área do Cliente Pulse para assistir e aprovar:\n${portalUrl}\n\nLá você pode assistir ao vídeo, aprovar ou solicitar ajustes diretamente.\n\nEquipe Pulse Growth Marketing 🚀`;
      const result = await sendWhatsAppMessage({
        number: client.whatsapp,
        message: msg,
        clientId: client.id,
        triggerType: 'manual',
      });
      if (result.success) {
        toast.success('✅ WhatsApp enviado ao cliente!');
      } else {
        toast.error(result.error || 'Erro ao enviar');
      }
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleClientApproved = async () => {
    await supabase.from('content_tasks').update({
      kanban_column: 'agendamentos',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);

    await supabase.from('social_media_deliveries').update({
      status: 'entregue',
    } as any).eq('content_task_id', task.id);

    // Update portal content status to approved
    await supabase.from('client_portal_contents').update({
      status: 'aprovado',
      approved_at: new Date().toISOString(),
    } as any).eq('client_id', task.client_id).eq('title', task.title);

    await syncTask('agendamentos');
    toast.success('👍 Aprovado pelo cliente! Pronto para agendar');
    onRefresh();
    onOpenChange(false);
  };

  const handleSchedulePost = async () => {
    if (!schedDate || !schedTime) { toast.error('Preencha data e horário'); return; }
    await supabase.from('content_tasks').update({
      scheduled_recording_date: schedDate,
      scheduled_recording_time: schedTime,
      kanban_column: 'acompanhamento',
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);

    await supabase.from('social_media_deliveries').update({
      status: 'agendado',
      posted_at: schedDate,
      scheduled_time: schedTime,
      platform: schedPlatform || null,
    } as any).eq('content_task_id', task.id);

    await syncTask('acompanhamento');
    toast.success('📅 Agendado para postagem!');
    onRefresh();
    onOpenChange(false);
  };

  const handleConfirmPosted = async () => {
    await supabase.from('content_tasks').update({
      kanban_column: 'arquivado',
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    await supabase.from('social_media_deliveries').update({
      status: 'postado',
      posted_at: format(new Date(), 'yyyy-MM-dd'),
    } as any).eq('content_task_id', task.id);
    toast.success('✅ Confirmado como postado e arquivado!');
    onRefresh();
    onOpenChange(false);
  };

  const handleTogglePriority = async () => {
    const newPriority = !task.editing_priority;
    await supabase.from('content_tasks').update({
      editing_priority: newPriority,
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    if (newPriority) {
      await supabase.rpc('notify_role', {
        _role: 'editor',
        _title: '⚡ Vídeo Prioritário',
        _message: `"${task.title}" (${client?.companyName || ''}) foi marcado como prioridade`,
        _type: 'priority',
        _link: '/edicao/kanban',
      });
      toast.success('⚡ Marcado como prioridade!');
    } else {
      toast.success('Prioridade removida');
    }
    onRefresh();
  };

  const handleSaveLink = async () => {
    if (!linkValue.trim()) { toast.error('Insira um link válido'); return; }
    const field = showLinkForm === 'drive' ? 'drive_link' : 'edited_video_link';
    await supabase.from('content_tasks').update({
      [field]: linkValue.trim(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    toast.success(showLinkForm === 'drive' ? '📁 Link do Drive salvo!' : '🎬 Link do vídeo salvo!');
    setShowLinkForm(null);
    setLinkValue('');
    onRefresh();
  };

  const handleResubmitFromAlteracao = async () => {
    if (!task.edited_video_link) {
      toast.error('Adicione o link do vídeo editado antes de reenviar');
      return;
    }
    await supabase.from('content_tasks').update({
      kanban_column: 'revisao',
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    await syncTask('revisao');
    toast.success('🔄 Reenviado para Revisão!');
    onRefresh();
    onOpenChange(false);
  };

  const handleMoveToNext = async (targetColumn: string) => {
    if (targetColumn === 'edicao' && !task.drive_link) {
      toast.error('Adicione o link dos materiais (Drive) primeiro');
      return;
    }
    if (targetColumn === 'revisao' && !task.edited_video_link) {
      toast.error('Adicione o link do vídeo editado primeiro');
      return;
    }
    await supabase.from('content_tasks').update({
      kanban_column: targetColumn,
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    await syncTask(targetColumn);
    const label = KANBAN_COLUMNS.find(c => c.id === targetColumn)?.label;
    toast.success(`Movido para ${label}`);
    onRefresh();
    onOpenChange(false);
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return 'Sistema';
    return users.find(u => u.id === userId)?.name || 'Usuário';
  };

  const renderDeadline = (deadline: string | null, label: string) => {
    if (!deadline) return null;
    const now = new Date();
    const dl = new Date(deadline);
    const diffMs = dl.getTime() - now.getTime();
    const isExpired = diffMs <= 0;
    const hours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
    const mins = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));
    const timeStr = isExpired
      ? `Expirado há ${hours}h${mins}m`
      : hours > 0 ? `${hours}h${mins}m restantes` : `${mins}m restantes`;
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
        isExpired ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted border border-border'
      }`}>
        <Clock size={14} className={isExpired ? 'text-destructive' : 'text-muted-foreground'} />
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block">{label}</span>
          <span className={`text-xs font-bold ${isExpired ? 'text-destructive' : 'text-foreground'}`}>{timeStr}</span>
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border space-y-3">
          <div className="flex items-center gap-3">
            {client && <ClientLogo client={client} size="md" />}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-foreground truncate" style={{ fontFamily: 'var(--font-display)' }}>
                {client?.companyName || 'Cliente'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-lg leading-none">{colConfig?.icon}</span>
                <span className="text-xs text-muted-foreground font-medium">{colConfig?.label}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground leading-tight">{task.title}</h3>
            <div className="flex flex-wrap gap-1.5">
              <Badge className={`${typeConfig.color} border-0 gap-1 text-[10px]`}>
                <TypeIcon size={10} /> {typeConfig.label}
              </Badge>
              {task.editing_priority && (
                <Badge className="bg-red-50 text-red-700 border border-red-200/60 dark:bg-red-900/30 dark:text-red-400 text-[10px] gap-1">
                  ⚡ Prioridade
                </Badge>
              )}
              {task.immediate_alteration && task.kanban_column === 'alteracao' && (
                <Badge className="bg-red-100 text-red-800 border border-red-300/60 dark:bg-red-900/40 dark:text-red-300 text-[10px] gap-1 animate-pulse">
                  🚨 Imediato
                </Badge>
              )}
              {task.adjustment_notes && !task.immediate_alteration && (
                <Badge className="bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] gap-1">
                  🔄 Alterado
                </Badge>
              )}
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4">
            {/* ─── TWO COLUMN LAYOUT ──────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* ─── LEFT COLUMN: Journey + History ──────── */}
              <div className="space-y-4">
                <JourneyTimeline currentColumn={task.kanban_column} task={task} users={users} scripts={scripts} history={history} recordings={recordings.map(r => ({ id: r.id, videomaker_id: r.videomakerId }))} />

                <Separator />

                {/* Script */}
                {linkedScript && (
                  <div className="px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/15 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <FileText size={12} className="text-primary shrink-0" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/60">Roteiro</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{linkedScript.title}</p>
                    {linkedScript.content && (
                      <div className="mt-2 p-2.5 rounded bg-muted/50 border border-border/50 max-h-32 overflow-y-auto">
                        <div className="prose prose-sm max-w-none text-foreground/80 text-xs" dangerouslySetInnerHTML={{ __html: linkedScript.content }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Adjustment notes */}
                {task.adjustment_notes && (
                  <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Notas de Ajuste</span>
                    <p className="text-sm text-amber-700 dark:text-amber-400">{task.adjustment_notes}</p>
                  </div>
                )}

                <Separator />

                {/* History Timeline */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                      <History size={13} className="text-primary" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                      Histórico
                    </span>
                    {history.length > 0 && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{history.length}</Badge>
                    )}
                  </div>
                  {history.length === 0 ? (
                    <div className="flex flex-col items-center py-6 text-center">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
                        <Clock size={16} className="text-muted-foreground/40" />
                      </div>
                      <p className="text-xs text-muted-foreground/60 italic">Nenhum registro ainda</p>
                    </div>
                  ) : (
                    <div className="relative ml-3">
                      <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-primary/30 via-border to-transparent" />
                      <AnimatePresence>
                        {history.map((h, idx) => {
                          const actionIcon = getHistoryIcon(h.action);
                          const actionColor = getHistoryColor(h.action);
                          return (
                            <motion.div
                              key={h.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05, duration: 0.3 }}
                              className="relative pl-6 pb-4 last:pb-0 group"
                            >
                              <div className={`absolute left-0 top-1 w-2 h-2 rounded-full -translate-x-[3.5px] ring-2 ring-card transition-all duration-200 group-hover:scale-125 ${
                                idx === 0 ? `${actionColor} shadow-sm` : 'bg-border'
                              }`} />
                              <div className={`rounded-lg px-3 py-2 transition-all duration-200 ${
                                idx === 0 ? 'bg-primary/5 border border-primary/10' : 'hover:bg-muted/50'
                              }`}>
                                <div className="flex items-start gap-2">
                                  <span className="text-sm leading-none mt-0.5">{actionIcon}</span>
                                  <div className="min-w-0 flex-1">
                                    <span className={`text-xs leading-snug block ${idx === 0 ? 'text-foreground font-medium' : 'text-foreground/70'}`}>
                                      {h.action}
                                    </span>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-[10px] font-medium text-primary/70">{getUserName(h.user_id)}</span>
                                      <span className="text-[10px] text-muted-foreground/40">·</span>
                                      <span className="text-[10px] text-muted-foreground/50">
                                        {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: ptBR })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── RIGHT COLUMN: Details + Actions ──────── */}
              <div className="space-y-4">
                {/* Deadlines */}
                {task.kanban_column === 'edicao' && renderDeadline(task.editing_deadline, 'Prazo de Edição')}
                {task.kanban_column === 'revisao' && renderDeadline(task.review_deadline, 'Prazo de Revisão')}
                {task.kanban_column === 'alteracao' && !task.immediate_alteration && renderDeadline(task.alteration_deadline, 'Prazo de Alteração')}
                {task.kanban_column === 'envio' && renderDeadline(task.approval_deadline, 'Prazo de Aprovação')}

                {/* Assigned user */}
                {assignedUser && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/15">
                    <UserAvatar user={{ name: assignedUser.name, avatarUrl: assignedUser.avatarUrl }} size="sm" />
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 block">Responsável</span>
                      <span className="text-sm font-bold text-foreground">{assignedUser.name}</span>
                    </div>
                  </div>
                )}

                {/* Scheduled date */}
                {task.scheduled_recording_date && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted border border-border">
                    <Calendar size={16} className="text-muted-foreground shrink-0" />
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                        {task.kanban_column === 'acompanhamento' ? 'Agendado para' : 'Data de gravação'}
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {format(new Date(task.scheduled_recording_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                        {task.scheduled_recording_time ? ` às ${task.scheduled_recording_time}` : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* Links */}
                <div className="space-y-2">
                  {task.drive_link && (
                    <a href={task.drive_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 transition-colors">
                      <Link2 size={14} className="text-blue-600 shrink-0" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-400 truncate flex-1">Materiais (Drive)</span>
                      <ExternalLink size={12} className="text-blue-500/60 shrink-0" />
                    </a>
                  )}
                  {task.edited_video_link && (
                    <a href={task.edited_video_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/15 border border-teal-500/20 transition-colors">
                      <Film size={14} className="text-teal-600 shrink-0" />
                      <span className="text-sm font-medium text-teal-700 dark:text-teal-400 truncate flex-1">🎬 Assistir Vídeo Editado</span>
                      <ExternalLink size={12} className="text-teal-500/60 shrink-0" />
                    </a>
                  )}
                </div>

                <Separator />

                {/* ─── AÇÕES DA ETAPA ──────────────────────── */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Zap size={13} className="text-primary" />
                    </div>
                    Ações da Etapa
                  </span>

                  {/* Add links */}
                  {(task.kanban_column === 'captacao' || task.kanban_column === 'edicao') && !task.drive_link && (
                    <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={() => { setShowLinkForm('drive'); setLinkValue(''); }}>
                      <Link2 size={14} className="text-blue-600" /> Adicionar Link Drive
                    </Button>
                  )}
                  
                  {/* Video: Upload file OR paste link */}
                  {(task.kanban_column === 'edicao' || task.kanban_column === 'alteracao') && !task.edited_video_link && (
                    <div className="space-y-2">
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleVideoUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 justify-start border-teal-300 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:border-teal-700"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={uploadingVideo}
                      >
                        {uploadingVideo ? (
                          <><Loader2 size={14} className="animate-spin" /> Enviando vídeo...</>
                        ) : (
                          <><Upload size={14} /> Enviar Arquivo de Vídeo</>
                        )}
                      </Button>
                      <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={() => { setShowLinkForm('video'); setLinkValue(''); }}>
                        <Film size={14} className="text-teal-600" /> Colar Link do Vídeo
                      </Button>
                    </div>
                  )}

                  {/* Link form inline */}
                  {showLinkForm && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                      <Label className="text-xs">{showLinkForm === 'drive' ? 'URL do Google Drive' : 'URL do vídeo editado'}</Label>
                      <Input value={linkValue} onChange={e => setLinkValue(e.target.value)} placeholder="https://..." autoFocus className="h-9" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveLink} className="flex-1">Salvar</Button>
                        <Button size="sm" variant="outline" onClick={() => setShowLinkForm(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}

                  {/* Finalizar Etapa buttons */}
                  {task.kanban_column === 'ideias' && (
                    <RocketLaunchButton label="Captação" onClick={() => handleMoveToNext('captacao')} />
                  )}

                  {task.kanban_column === 'captacao' && (
                    <RocketLaunchButton label="Edição" onClick={() => handleMoveToNext('edicao')} disabled={!task.drive_link} />
                  )}

                  {task.kanban_column === 'edicao' && task.edited_video_link && (
                    <RocketLaunchButton label="Revisão" onClick={() => handleMoveToNext('revisao')} />
                  )}

                  {/* Toggle priority (edição) */}
                  {task.kanban_column === 'edicao' && (
                    <Button
                      variant={task.editing_priority ? 'default' : 'outline'}
                      size="sm"
                      className={`w-full gap-2 justify-start ${task.editing_priority ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                      onClick={handleTogglePriority}
                    >
                      <Zap size={14} /> {task.editing_priority ? '⚡ Prioritário' : 'Marcar Prioridade'}
                    </Button>
                  )}

                  {/* Revisão: Approve / Adjustments */}
                  {task.kanban_column === 'revisao' && (
                    <>
                      <Button size="sm" className="w-full gap-2 justify-start bg-green-600 hover:bg-green-700" onClick={handleApprove}>
                        <ThumbsUp size={14} /> Aprovar e Enviar ao Portal
                      </Button>
                      <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700" onClick={() => setShowAdjustmentForm(true)}>
                        <MessageSquareWarning size={14} /> Solicitar Ajustes
                      </Button>
                    </>
                  )}

                  {/* Alteração: Resubmit */}
                  {task.kanban_column === 'alteracao' && (
                    <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-teal-600 border-teal-300 hover:bg-teal-50 dark:text-teal-400 dark:border-teal-700" onClick={handleResubmitFromAlteracao}>
                      <Send size={14} /> Reenviar para Revisão
                    </Button>
                  )}

                  {/* Envio: Client approved / Send WhatsApp / Request alteration */}
                  {task.kanban_column === 'envio' && (
                    <>
                      <Button size="sm" className="w-full gap-2 justify-start bg-green-600 hover:bg-green-700" onClick={handleClientApproved}>
                        <CheckCircle2 size={14} /> Cliente Aprovou
                      </Button>
                      <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={handleSendWhatsApp} disabled={sendingWhatsApp}>
                        <MessageSquare size={14} className="text-green-600" /> {sendingWhatsApp ? 'Enviando...' : 'Convidar via WhatsApp'}
                      </Button>
                      <p className="text-[10px] text-muted-foreground/60 px-1">
                        💡 A mensagem convida o cliente a visitar a Área do Cliente Pulse para aprovar o vídeo
                      </p>
                      <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700" onClick={() => setShowAdjustmentForm(true)}>
                        <MessageSquareWarning size={14} /> Solicitar Alteração
                      </Button>
                    </>
                  )}

                  {/* Agendamentos: Schedule */}
                  {task.kanban_column === 'agendamentos' && (
                    <Button size="sm" className="w-full gap-2 justify-start" onClick={() => { setShowScheduleForm(true); setSchedDate(''); setSchedTime(''); setSchedPlatform(''); }}>
                      <CalendarClock size={14} /> Agendar Postagem
                    </Button>
                  )}

                  {/* Acompanhamento: Confirm posted */}
                  {task.kanban_column === 'acompanhamento' && (
                    <Button size="sm" className="w-full gap-2 justify-start" onClick={handleConfirmPosted}>
                      <CheckCircle2 size={14} /> Confirmar Postagem
                    </Button>
                  )}

                  {/* Adjustment form inline */}
                  {showAdjustmentForm && (
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-3">
                      <Label className="text-xs font-semibold text-amber-700">Descreva os ajustes necessários</Label>
                      <Textarea
                        value={adjustmentNotes}
                        onChange={e => setAdjustmentNotes(e.target.value)}
                        rows={3}
                        placeholder="Ex: Ajustar corte no segundo 15..."
                        autoFocus
                      />
                      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
                        <input
                          type="checkbox"
                          checked={adjustmentImmediate}
                          onChange={e => setAdjustmentImmediate(e.target.checked)}
                          className="h-4 w-4 rounded border-destructive/40"
                          id="detail-immediate"
                        />
                        <label htmlFor="detail-immediate" className="text-xs cursor-pointer">
                          <span className="font-semibold text-destructive">🚨 Alteração Imediata</span>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={handleRequestAdjustments}>
                          <MessageSquareWarning size={14} /> Enviar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowAdjustmentForm(false)}>Cancelar</Button>
                      </div>
                    </div>
                  )}

                  {/* Schedule form inline */}
                  {showScheduleForm && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Data *</Label>
                          <Input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Horário *</Label>
                          <Input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="h-9" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Plataforma</Label>
                        <Select value={schedPlatform} onValueChange={setSchedPlatform}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={handleSchedulePost}>
                          <Calendar size={14} /> Agendar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowScheduleForm(false)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

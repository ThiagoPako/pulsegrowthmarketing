import { useState, useEffect } from 'react';
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
import {
  Film, Megaphone, Image, Palette, Calendar, User, FileText, CheckCircle2,
  AlertTriangle, Clock, ExternalLink, ThumbsUp, MessageSquareWarning, Link2,
  ArrowRight, Send, Eye, Zap, Flame, MessageSquare, CalendarClock, Trash2, Edit,
  History
} from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import ClientLogo from '@/components/ClientLogo';
import { format } from 'date-fns';
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

export default function ContentTaskDetailSheet({ task, open, onOpenChange, onRefresh }: Props) {
  const { clients, users, scripts } = useApp();
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
  const clientColor = client?.color || '217 91% 60%';

  const syncTask = async (newColumn: string) => {
    const ctx = buildSyncContext(task as any, {
      userId: user?.id,
      clientName: client?.companyName,
      clientWhatsapp: client?.whatsapp,
    });
    await syncContentTaskColumnChange(newColumn, ctx);
  };

  // ─── ACTIONS ──────────────────────────────────────────────
  const handleApprove = async () => {
    await supabase.from('content_tasks').update({
      kanban_column: 'envio',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', task.id);
    await syncTask('envio');
    toast.success('✅ Aprovado! Enviado para o cliente');
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
      const videoLink = task.edited_video_link || task.drive_link || '';
      const msg = `Olá, ${client.responsiblePerson || client.companyName}! 😊\n\nSeu conteúdo "${task.title}" ficou pronto! 🎬\n\n${videoLink ? `📎 Acesse aqui: ${videoLink}\n\n` : ''}Por favor, avalie e nos diga se está aprovado ou se precisa de algum ajuste.\n\nEquipe Pulse Growth Marketing 🚀`;
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

    // Update social delivery too
    await supabase.from('social_media_deliveries').update({
      status: 'entregue',
    } as any).eq('content_task_id', task.id);

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

    // Update social delivery
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
    // Validations
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

  // Deadline helper
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
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
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
          <div className="px-5 py-4 space-y-4">
            {/* Description */}
            {task.description && (
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Descrição</span>
                <p className="text-sm text-foreground/80 leading-relaxed">{task.description}</p>
              </div>
            )}

            {/* Deadlines */}
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

            {/* ─── ACTIONS ──────────────────────────────────── */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</span>

              {/* Add links */}
              {(task.kanban_column === 'captacao' || task.kanban_column === 'edicao') && !task.drive_link && (
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={() => { setShowLinkForm('drive'); setLinkValue(''); }}>
                  <Link2 size={14} className="text-blue-600" /> Adicionar Link Drive
                </Button>
              )}
              {(task.kanban_column === 'edicao' || task.kanban_column === 'alteracao') && !task.edited_video_link && (
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={() => { setShowLinkForm('video'); setLinkValue(''); }}>
                  <Film size={14} className="text-teal-600" /> Adicionar Link Vídeo
                </Button>
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

              {/* Move to next column */}
              {task.kanban_column === 'captacao' && task.drive_link && (
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start" onClick={() => handleMoveToNext('edicao')}>
                  <ArrowRight size={14} className="text-primary" /> Mover para Edição
                </Button>
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
                    <ThumbsUp size={14} /> Aprovar Revisão
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
                    <MessageSquare size={14} className="text-green-600" /> {sendingWhatsApp ? 'Enviando...' : 'Enviar WhatsApp'}
                  </Button>
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

            <Separator />

            {/* History */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <History size={13} className="text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Histórico</span>
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic">Nenhum registro</p>
              ) : (
                <div className="space-y-1.5">
                  {history.map(h => (
                    <div key={h.id} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-foreground/80">{h.action}</span>
                        <span className="text-muted-foreground/60 block text-[10px]">
                          {getUserName(h.user_id)} · {format(new Date(h.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

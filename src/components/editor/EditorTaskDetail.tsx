import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { format, differenceInHours, differenceInMinutes, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Eye, ExternalLink, Upload, Send, History, MessageSquare, Clock,
  AlertTriangle, Check, Film, Megaphone, Image, Palette, Link2, Play
} from 'lucide-react';
import ClientLogo from '@/components/ClientLogo';
import { highlightQuotes } from '@/lib/highlightQuotes';
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

export default function EditorTaskDetail({ task, open, onOpenChange, onRefresh }: Props) {
  const { clients, scripts, users } = useApp();
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [videoLink, setVideoLink] = useState(task.edited_video_link || '');
  const [saving, setSaving] = useState(false);

  const client = clients.find(c => c.id === task.client_id);
  const script = task.script_id ? scripts.find(s => s.id === task.script_id) : null;
  const deadline = getDeadlineStatus(task.editing_deadline);
  const cfg = getTypeConfig(task.content_type);

  const fetchComments = useCallback(async () => {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at', { ascending: true });
    if (data) {
      const enriched = data.map(c => ({
        ...c,
        user_name: users.find(u => u.id === c.user_id)?.name || 'Usuário'
      }));
      setComments(enriched);
    }
  }, [task.id, users]);

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase.from('task_history').select('*').eq('task_id', task.id).order('created_at', { ascending: false });
    if (data) setHistory(data as HistoryEntry[]);
  }, [task.id]);

  useEffect(() => {
    if (open) {
      fetchComments();
      fetchHistory();
      setVideoLink(task.edited_video_link || '');
    }
  }, [open, fetchComments, fetchHistory, task.edited_video_link]);

  // Realtime comments
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

  const startEditing = async () => {
    setSaving(true);
    await supabase.from('content_tasks').update({
      editing_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', task.id);
    await logAction('Edição iniciada');
    toast.success('Edição iniciada!');
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

  const sendForApproval = async () => {
    setSaving(true);
    await supabase.from('content_tasks').update({
      kanban_column: 'revisao',
      approval_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', task.id);
    await logAction('Enviado para aprovação');
    toast.success('Enviado para aprovação!');
    onRefresh();
    onOpenChange(false);
    setSaving(false);
  };

  const markAsFinished = async () => {
    setSaving(true);
    await supabase.from('content_tasks').update({
      kanban_column: 'envio',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', task.id);
    // Auto-register delivery
    const existing = await supabase.from('social_media_deliveries')
      .select('id').eq('title', task.title).eq('client_id', task.client_id).limit(1);
    if (!existing.data?.length) {
      await supabase.from('social_media_deliveries').insert({
        client_id: task.client_id, content_type: task.content_type,
        title: task.title, description: task.description || null,
        status: 'entregue', delivered_at: format(new Date(), 'yyyy-MM-dd'),
        script_id: task.script_id || null, recording_id: task.recording_id || null,
        created_by: user?.id || null,
      } as any);
    }
    await logAction('Vídeo finalizado');
    toast.success('Vídeo finalizado!');
    onRefresh();
    onOpenChange(false);
    setSaving(false);
  };

  // Countdown
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <cfg.icon size={18} className={cfg.color.split(' ')[0]} />
            {task.title}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 pb-4">
            {/* Client + Meta */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <ClientLogo client={client as any} size="sm" />
                <span className="text-sm font-bold text-foreground">{client?.companyName || 'Cliente'}</span>
              </div>
              <Badge className={`${cfg.color} border-0 text-xs`}>
                <cfg.icon size={11} className="mr-0.5" /> {cfg.label}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {task.kanban_column === 'edicao' ? 'Aguardando edição' :
                 task.kanban_column === 'revisao' ? 'Aguardando aprovação' :
                 task.kanban_column === 'alteracao' ? 'Solicitado ajuste' : 'Finalizado'}
              </Badge>
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
                    <p className="text-xs opacity-80">
                      Prazo: {format(new Date(task.editing_deadline), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Adjustment notes (if any) */}
            {task.kanban_column === 'alteracao' && task.adjustment_notes && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Ajustes solicitados:</p>
                <p className="text-sm text-foreground">{task.adjustment_notes}</p>
              </div>
            )}

            {task.description && (
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1">DESCRIÇÃO</p>
                <p className="text-sm text-foreground">{task.description}</p>
              </div>
            )}

            <Tabs defaultValue="script" className="space-y-3">
              <TabsList className="h-8">
                <TabsTrigger value="script" className="text-xs gap-1"><Eye size={11} /> Roteiro</TabsTrigger>
                <TabsTrigger value="materials" className="text-xs gap-1"><ExternalLink size={11} /> Materiais</TabsTrigger>
                <TabsTrigger value="upload" className="text-xs gap-1"><Upload size={11} /> Vídeo Editado</TabsTrigger>
                <TabsTrigger value="comments" className="text-xs gap-1"><MessageSquare size={11} /> Comentários</TabsTrigger>
                <TabsTrigger value="history" className="text-xs gap-1"><History size={11} /> Histórico</TabsTrigger>
              </TabsList>

              {/* Script */}
              <TabsContent value="script">
                {script ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Tema: <span className="font-semibold text-foreground">{script.title}</span></p>
                    <div className="prose prose-sm max-w-none p-4 rounded-xl bg-muted/30 border border-border min-h-[150px]"
                      dangerouslySetInnerHTML={{ __html: highlightQuotes(script.content) || '<em>Sem conteúdo</em>' }} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic p-4">Nenhum roteiro vinculado a este conteúdo.</p>
                )}
              </TabsContent>

              {/* Materials */}
              <TabsContent value="materials">
                <div className="space-y-3">
                  {task.drive_link ? (
                    <a href={task.drive_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-3 border border-blue-200 dark:border-blue-800">
                      <ExternalLink size={16} /> 📁 Abrir materiais brutos no Google Drive
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground italic p-4">Nenhum link de materiais disponível.</p>
                  )}
                </div>
              </TabsContent>

              {/* Upload / Link */}
              <TabsContent value="upload">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-2">LINK DO VÍDEO EDITADO</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Cole o link do Google Drive, Frame.io, etc..."
                        value={videoLink}
                        onChange={e => setVideoLink(e.target.value)}
                        className="flex-1"
                      />
                      <Button size="sm" onClick={saveVideoLink} disabled={saving || !videoLink.trim()}>
                        <Link2 size={14} className="mr-1" /> Salvar
                      </Button>
                    </div>
                  </div>
                  {task.edited_video_link && (
                    <a href={task.edited_video_link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400 hover:underline bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-3 border border-green-200 dark:border-green-800">
                      <Play size={16} /> 🎬 Abrir vídeo editado
                    </a>
                  )}
                </div>
              </TabsContent>

              {/* Comments */}
              <TabsContent value="comments">
                <div className="space-y-3">
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic p-4">Nenhum comentário ainda.</p>
                    ) : (
                      comments.map(c => (
                        <div key={c.id} className={`p-3 rounded-lg border ${c.user_id === user?.id ? 'bg-primary/5 border-primary/20 ml-6' : 'bg-muted/30 border-border mr-6'}`}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-foreground">{c.user_name}</span>
                            <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                          </div>
                          <p className="text-sm text-foreground">{c.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Textarea placeholder="Escreva um comentário..." value={newComment} onChange={e => setNewComment(e.target.value)}
                      className="min-h-[60px] flex-1" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }} />
                    <Button size="sm" onClick={addComment} disabled={!newComment.trim()} className="self-end">
                      <Send size={14} />
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* History */}
              <TabsContent value="history">
                <div className="space-y-2">
                  {/* Auto-generated timeline */}
                  <div className="space-y-1.5">
                    <HistoryLine label="Criado em" date={task.created_at} />
                    {task.editing_started_at && <HistoryLine label="Edição iniciada" date={task.editing_started_at} />}
                    {task.approval_sent_at && <HistoryLine label="Enviado para aprovação" date={task.approval_sent_at} />}
                    {task.approved_at && <HistoryLine label="Aprovado / Finalizado" date={task.approved_at} />}
                  </div>
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

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {task.kanban_column === 'edicao' && !task.editing_started_at && (
                <Button onClick={startEditing} disabled={saving} className="gap-1.5">
                  <Play size={14} /> Iniciar Edição
                </Button>
              )}
              {(task.kanban_column === 'edicao' || task.kanban_column === 'alteracao') && (
                <Button onClick={sendForApproval} disabled={saving} variant="default" className="gap-1.5 bg-teal-600 hover:bg-teal-700">
                  <Send size={14} /> Enviar para Aprovação
                </Button>
              )}
              {task.kanban_column === 'revisao' && (
                <Button onClick={markAsFinished} disabled={saving} variant="default" className="gap-1.5 bg-green-600 hover:bg-green-700">
                  <Check size={14} /> Marcar como Finalizado
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
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

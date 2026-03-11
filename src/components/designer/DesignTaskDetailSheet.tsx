import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask, DesignTaskColumn } from '@/hooks/useDesignTasks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import ClientLogo from '@/components/ClientLogo';
import { Play, Pause, Square, Send, CheckCircle, RotateCcw, Clock, ExternalLink, History } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  task: DesignTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMAT_LABELS: Record<string, string> = { feed: 'Feed', story: 'Story', midia_fisica: 'Mídia Física' };
const PRIORITY_LABELS: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };

export default function DesignTaskDetailSheet({ task, open, onOpenChange }: Props) {
  const { updateTask, addHistory, historyQuery } = useDesignTasks();
  const { currentUser } = useApp();
  const { user } = useAuth();
  const [observations, setObservations] = useState(task.observations || '');
  const [attachmentUrl, setAttachmentUrl] = useState(task.attachment_url || '');
  const [editableFileUrl, setEditableFileUrl] = useState(task.editable_file_url || '');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [timerDisplay, setTimerDisplay] = useState('00:00:00');

  const history = historyQuery(task.id);

  // Timer display
  useEffect(() => {
    if (!task.timer_running) {
      const h = Math.floor(task.time_spent_seconds / 3600);
      const m = Math.floor((task.time_spent_seconds % 3600) / 60);
      const s = task.time_spent_seconds % 60;
      setTimerDisplay(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = task.timer_started_at
        ? Math.floor((Date.now() - new Date(task.timer_started_at).getTime()) / 1000) + task.time_spent_seconds
        : task.time_spent_seconds;
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setTimerDisplay(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [task.timer_running, task.timer_started_at, task.time_spent_seconds]);

  const moveToColumn = async (column: DesignTaskColumn, extraFields?: Partial<DesignTask>) => {
    await updateTask.mutateAsync({ id: task.id, kanban_column: column, ...extraFields } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: `Movido para ${DESIGN_COLUMNS.find(c => c.key === column)?.label}`, user_id: user?.id });
  };

  const handleStartTask = async () => {
    await moveToColumn('executando', { started_at: new Date().toISOString(), assigned_to: user?.id } as any);
    toast.success('Tarefa iniciada!');
  };

  const handleStartTimer = async () => {
    await updateTask.mutateAsync({ id: task.id, timer_running: true, timer_started_at: new Date().toISOString() } as any);
  };

  const handlePauseTimer = async () => {
    const elapsed = task.timer_started_at
      ? Math.floor((Date.now() - new Date(task.timer_started_at).getTime()) / 1000)
      : 0;
    await updateTask.mutateAsync({
      id: task.id,
      timer_running: false,
      time_spent_seconds: task.time_spent_seconds + elapsed,
      timer_started_at: null,
    } as any);
  };

  const handleSendForReview = async () => {
    if (!attachmentUrl) { toast.error('Anexe a arte antes de enviar'); return; }
    await updateTask.mutateAsync({ id: task.id, kanban_column: 'em_analise', attachment_url: attachmentUrl, editable_file_url: editableFileUrl, observations } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Enviado para análise', attachment_url: attachmentUrl, user_id: user?.id });
    // Notify social media
    await supabase.rpc('notify_role', { _role: 'social_media', _title: 'Arte em análise', _message: `Arte "${task.title}" pronta para revisão`, _type: 'design', _link: '/designer' });
    toast.success('Enviado para análise!');
  };

  const handleApprove = async () => {
    await moveToColumn('enviar_cliente');
    await supabase.rpc('notify_role', { _role: 'fotografo', _title: 'Arte aprovada internamente', _message: `"${task.title}" aprovada pela social media`, _type: 'design', _link: '/designer' });
    toast.success('Aprovada internamente!');
  };

  const handleRequestAdjustments = async () => {
    if (!adjustmentNotes) { toast.error('Descreva os ajustes necessários'); return; }
    await updateTask.mutateAsync({ id: task.id, kanban_column: 'ajustes', observations: adjustmentNotes } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Ajustes solicitados', details: adjustmentNotes, user_id: user?.id });
    await supabase.rpc('notify_role', { _role: 'fotografo', _title: 'Ajustes solicitados', _message: `"${task.title}": ${adjustmentNotes}`, _type: 'design', _link: '/designer' });
    toast.success('Ajustes solicitados!');
    setAdjustmentNotes('');
  };

  const handleSendToClient = async () => {
    // Send via WhatsApp
    try {
      const { data: whatsConfig } = await supabase.from('whatsapp_config').select('*').limit(1).single();
      if (whatsConfig?.integration_active && whatsConfig?.api_token && task.clients?.whatsapp) {
        const clientName = task.clients?.responsible_person || task.clients?.company_name;
        const msg = `Olá, ${clientName}! 🎨\n\nSegue a arte criada para sua empresa. Pode nos confirmar se está aprovado?\n\n${attachmentUrl || task.attachment_url || ''}`;
        
        await fetch('https://api.atendeclique.com.br/api/messages/send', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${whatsConfig.api_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: task.clients.whatsapp.replace(/\D/g, ''),
            body: msg,
            userId: whatsConfig.default_user_id || '',
            queueId: whatsConfig.default_queue_id || '',
            sendSignature: whatsConfig.send_signature || false,
            closeTicket: whatsConfig.close_ticket || false,
          }),
        });

        await supabase.from('whatsapp_messages').insert({
          phone_number: task.clients.whatsapp.replace(/\D/g, ''),
          message: msg,
          status: 'sent',
          client_id: task.client_id,
          trigger_type: 'auto_recording',
        } as any);
      }
    } catch (err) {
      console.error('WhatsApp send error:', err);
    }

    await updateTask.mutateAsync({ id: task.id, sent_to_client_at: new Date().toISOString() } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Enviado para cliente via WhatsApp', user_id: user?.id });
    toast.success('Arte enviada ao cliente!');
  };

  const handleClientApproval = async () => {
    await updateTask.mutateAsync({ id: task.id, kanban_column: 'aprovado', client_approved_at: new Date().toISOString(), completed_at: new Date().toISOString() } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Aprovado pelo cliente', user_id: user?.id });
    toast.success('Arte aprovada pelo cliente!');
  };

  const isDesigner = currentUser?.role === 'fotografo' || currentUser?.role === 'admin';
  const isSocialMedia = currentUser?.role === 'social_media' || currentUser?.role === 'admin';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[450px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClientLogo name={task.clients?.company_name || ''} color={task.clients?.color || '217 91% 60%'} logoUrl={task.clients?.logo_url} size="sm" />
            <span className="truncate">{task.title}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Info badges */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{FORMAT_LABELS[task.format_type]}</Badge>
            <Badge variant="secondary">{PRIORITY_LABELS[task.priority]}</Badge>
            <Badge style={{ backgroundColor: `hsl(${DESIGN_COLUMNS.find(c => c.key === task.kanban_column)?.color})`, color: 'white' }}>
              {DESIGN_COLUMNS.find(c => c.key === task.kanban_column)?.label}
            </Badge>
          </div>

          {/* Timer */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Clock size={16} className="text-muted-foreground" />
            <span className="font-mono text-lg font-bold">{timerDisplay}</span>
            <div className="ml-auto flex gap-1">
              {!task.timer_running ? (
                <Button size="sm" variant="outline" onClick={handleStartTimer}><Play size={14} /></Button>
              ) : (
                <Button size="sm" variant="outline" onClick={handlePauseTimer}><Pause size={14} /></Button>
              )}
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <p className="text-sm mt-1">{task.description}</p>
            </div>
          )}

          {/* Copy */}
          {task.copy_text && (
            <div>
              <Label className="text-xs text-muted-foreground">Copy</Label>
              <p className="text-sm mt-1 bg-muted/50 p-2 rounded">{task.copy_text}</p>
            </div>
          )}

          {/* References */}
          {task.references_links?.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Referências</Label>
              <div className="space-y-1 mt-1">
                {task.references_links.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                    <ExternalLink size={12} /> {link}
                  </a>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Actions based on column */}
          {task.kanban_column === 'nova_tarefa' && isDesigner && (
            <Button onClick={handleStartTask} className="w-full"><Play size={16} className="mr-2" /> Iniciar Tarefa</Button>
          )}

          {(task.kanban_column === 'executando' || task.kanban_column === 'ajustes') && isDesigner && (
            <div className="space-y-3">
              <div>
                <Label>Link da arte</Label>
                <Input value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)} placeholder="https://drive.google.com/..." />
              </div>
              <div>
                <Label>Arquivo editável (opcional)</Label>
                <Input value={editableFileUrl} onChange={e => setEditableFileUrl(e.target.value)} placeholder="Link do arquivo editável" />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={observations} onChange={e => setObservations(e.target.value)} rows={2} />
              </div>
              <Button onClick={handleSendForReview} className="w-full"><Send size={16} className="mr-2" /> Enviar para Análise</Button>
            </div>
          )}

          {task.kanban_column === 'em_analise' && isSocialMedia && (
            <div className="space-y-3">
              {task.attachment_url && (
                <a href={task.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary flex items-center gap-1 hover:underline">
                  <ExternalLink size={14} /> Ver arte
                </a>
              )}
              <div className="flex gap-2">
                <Button onClick={handleApprove} className="flex-1"><CheckCircle size={16} className="mr-1" /> Aprovar</Button>
                <Button variant="destructive" onClick={() => setAdjustmentNotes(' ')} className="flex-1"><RotateCcw size={16} className="mr-1" /> Ajustes</Button>
              </div>
              {adjustmentNotes !== '' && (
                <div className="space-y-2">
                  <Textarea value={adjustmentNotes} onChange={e => setAdjustmentNotes(e.target.value)} placeholder="Descreva os ajustes necessários..." rows={3} />
                  <Button variant="destructive" onClick={handleRequestAdjustments} className="w-full">Solicitar Ajustes</Button>
                </div>
              )}
            </div>
          )}

          {task.kanban_column === 'enviar_cliente' && isSocialMedia && (
            <div className="space-y-2">
              <Button onClick={handleSendToClient} className="w-full"><Send size={16} className="mr-2" /> Enviar ao Cliente via WhatsApp</Button>
              <Button variant="outline" onClick={handleClientApproval} className="w-full"><CheckCircle size={16} className="mr-2" /> Marcar como Aprovado</Button>
            </div>
          )}

          <Separator />

          {/* History */}
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><History size={12} /> Histórico</Label>
            <div className="space-y-2 mt-2">
              {history.data?.map((h: any) => (
                <div key={h.id} className="text-xs border-l-2 border-muted pl-2 py-1">
                  <p className="font-medium">{h.action}</p>
                  {h.details && <p className="text-muted-foreground">{h.details}</p>}
                  <p className="text-muted-foreground">{new Date(h.created_at).toLocaleString('pt-BR')}</p>
                </div>
              ))}
              {(!history.data || history.data.length === 0) && (
                <p className="text-xs text-muted-foreground">Nenhum registro ainda.</p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

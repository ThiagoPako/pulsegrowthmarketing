import { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useDesignTasks, DESIGN_COLUMNS, DesignTask, DesignTaskColumn } from '@/hooks/useDesignTasks';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import ClientLogo from '@/components/ClientLogo';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Send, CheckCircle, RotateCcw, Clock, ExternalLink, History,
  Upload, Image, FileText, Palette, Info, User, Calendar, ArrowRight, X,
  ChevronRight, Eye, Link2, MessageSquare, CheckSquare, Paperclip, ZoomIn
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  task: DesignTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

const FORMAT_LABELS: Record<string, string> = { feed: 'Feed', story: 'Story', logomarca: 'Logomarca', midia_fisica: 'Mídia Física' };
const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  media: { label: 'Média', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  alta: { label: 'Alta', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
};

function getTaskCategory(task: DesignTask): 'identidade_visual' | 'reformulacao' | 'normal' {
  const t = task.title.toLowerCase();
  if (t.includes('identidade visual')) return 'identidade_visual';
  if (t.includes('reformulação')) return 'reformulacao';
  return 'normal';
}

export default function DesignTaskDetailSheet({ task, open, onOpenChange }: Props) {
  const { updateTask, addHistory, historyQuery } = useDesignTasks();
  const { currentUser } = useApp();
  const { user } = useAuth();
  const [observations, setObservations] = useState(task.observations || '');
  const [attachmentUrl, setAttachmentUrl] = useState(task.attachment_url || '');
  const [editableFileUrl, setEditableFileUrl] = useState(task.editable_file_url || '');
  const [mockupUrl, setMockupUrl] = useState((task as any).mockup_url || '');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [elapsedDisplay, setElapsedDisplay] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>((task as any).checklist || []);
  const [uploadingMockup, setUploadingMockup] = useState(false);
  const [uploadingArt, setUploadingArt] = useState(false);
  const [artInputMode, setArtInputMode] = useState<'link' | 'upload'>('link');
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [movingAction, setMovingAction] = useState<string | null>(null);
  const [stageAnimKey, setStageAnimKey] = useState(0);
  const [showRocketFlyby, setShowRocketFlyby] = useState(false);
  const prevColumnRef = useRef(task.kanban_column);

  // Animate rocket flyby when column changes
  useEffect(() => {
    if (task.kanban_column !== prevColumnRef.current) {
      prevColumnRef.current = task.kanban_column;
      setStageAnimKey(k => k + 1);
      setShowRocketFlyby(true);
      setTimeout(() => setShowRocketFlyby(false), 1200);
    }
  }, [task.kanban_column]);

  // Sync local state when task prop changes
  useEffect(() => {
    setObservations(task.observations || '');
    setAttachmentUrl(task.attachment_url || '');
    setEditableFileUrl(task.editable_file_url || '');
    setMockupUrl((task as any).mockup_url || '');
    setChecklist((task as any).checklist || []);
  }, [task.id, task.kanban_column, task.observations, task.attachment_url, task.editable_file_url, (task as any).mockup_url]);

  const taskCategory = getTaskCategory(task);
  const hasChecklist = taskCategory !== 'normal';
  const showMockup = taskCategory === 'identidade_visual' || taskCategory === 'reformulacao';
  const history = historyQuery(task.id);
  const currentCol = DESIGN_COLUMNS.find(c => c.key === task.kanban_column);
  const isDesigner = currentUser?.role === 'fotografo' || currentUser?.role === 'admin';
  const isSocialMedia = currentUser?.role === 'social_media' || currentUser?.role === 'admin';

  useEffect(() => {
    if (!task.started_at) { setElapsedDisplay(''); return; }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(task.started_at!).getTime()) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      setElapsedDisplay(h > 0 ? `${h}h ${m}min` : `${m}min`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [task.started_at]);

  const moveToColumn = async (column: DesignTaskColumn, extraFields?: Partial<DesignTask>) => {
    const label = DESIGN_COLUMNS.find(c => c.key === column)?.label || column;
    setMovingAction(label);
    try {
      await updateTask.mutateAsync({ id: task.id, kanban_column: column, ...extraFields } as any);
      await addHistory.mutateAsync({ task_id: task.id, action: `Movido para ${label}`, user_id: user?.id });
    } finally {
      setTimeout(() => setMovingAction(null), 600);
    }
  };

  const handleStartTask = async () => {
    await moveToColumn('executando', { started_at: new Date().toISOString(), assigned_to: user?.id } as any);
    toast.success('Tarefa iniciada!');
  };

  const handleSendForReview = async () => {
    const finalAttachment = attachmentUrl || mockupUrl || (task as any).mockup_url || task.attachment_url;
    if (!finalAttachment) { toast.error('Anexe a arte ou mockup antes de enviar'); return; }
    await updateTask.mutateAsync({ id: task.id, kanban_column: 'em_analise', attachment_url: finalAttachment, editable_file_url: editableFileUrl, observations } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Enviado para análise', attachment_url: finalAttachment, user_id: user?.id });
    toast.success('Enviado para análise!');
  };

  const handleApprove = async () => {
    await moveToColumn('enviar_cliente');
    toast.success('Aprovada internamente!');
  };

  const handleRequestAdjustments = async () => {
    if (!adjustmentNotes.trim()) { toast.error('Descreva os ajustes necessários'); return; }
    await updateTask.mutateAsync({ id: task.id, kanban_column: 'ajustes', observations: adjustmentNotes } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Ajustes solicitados', details: adjustmentNotes, user_id: user?.id });
    toast.success('Ajustes solicitados!');
    setAdjustmentNotes('');
    setShowAdjustmentForm(false);
  };

  const handleSendToClient = async () => {
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
      }
    } catch (err) { console.error('WhatsApp send error:', err); }
    await updateTask.mutateAsync({ id: task.id, sent_to_client_at: new Date().toISOString() } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Enviado para cliente via WhatsApp', user_id: user?.id });
    toast.success('Arte enviada ao cliente!');
  };

  const handleClientApproval = async () => {
    await updateTask.mutateAsync({ id: task.id, kanban_column: 'aprovado', client_approved_at: new Date().toISOString(), completed_at: new Date().toISOString() } as any);
    await addHistory.mutateAsync({ task_id: task.id, action: 'Aprovado pelo cliente', user_id: user?.id });

    // Auto-fill client drive_identidade_visual when logomarca is approved
    if (task.format_type === 'logomarca' && task.client_id) {
      const fileUrl = task.attachment_url || (task as any).mockup_url || attachmentUrl || mockupUrl;
      if (fileUrl) {
        await supabase.from('clients').update({ drive_identidade_visual: fileUrl }).eq('id', task.client_id);
        toast.success('Drive de Identidade Visual do cliente atualizado automaticamente!');
      }
    }

    toast.success('Arte aprovada pelo cliente!');
  };

  // Move-to buttons config based on current column
  const getMoveActions = () => {
    const actions: { key: DesignTaskColumn; label: string; color: string; icon: any; onClick: () => void }[] = [];

    if (task.kanban_column === 'nova_tarefa' && isDesigner) {
      actions.push({ key: 'executando', label: 'INICIAR', color: 'hsl(45 93% 47%)', icon: Play, onClick: handleStartTask });
    }
    if ((task.kanban_column === 'executando' || task.kanban_column === 'ajustes') && isDesigner) {
      actions.push({ key: 'em_analise', label: 'ENVIAR P/ ANÁLISE', color: 'hsl(262 83% 58%)', icon: Send, onClick: handleSendForReview });
    }
    if (task.kanban_column === 'em_analise' && isSocialMedia) {
      actions.push({ key: 'enviar_cliente', label: 'APROVAR', color: 'hsl(142 71% 45%)', icon: CheckCircle, onClick: handleApprove });
      actions.push({ key: 'ajustes', label: 'SOLICITAR AJUSTES', color: 'hsl(0 72% 51%)', icon: RotateCcw, onClick: () => setShowAdjustmentForm(true) });
    }
    if (task.kanban_column === 'enviar_cliente' && isSocialMedia) {
      actions.push({ key: 'enviar_cliente', label: 'ENVIAR VIA WHATSAPP', color: 'hsl(142 71% 45%)', icon: Send, onClick: handleSendToClient });
      actions.push({ key: 'aprovado', label: 'MARCAR APROVADO', color: 'hsl(217 91% 60%)', icon: CheckCircle, onClick: handleClientApproval });
    }

    return actions;
  };

  const moveActions = getMoveActions();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-full !max-w-full h-full p-0 overflow-hidden flex flex-col" aria-describedby={undefined} side="right">
        <SheetTitle className="sr-only">{task.title}</SheetTitle>
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="md" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold truncate">{task.clients?.company_name}</h2>
                <p className="text-xs text-muted-foreground truncate">{task.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {task.profiles && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User size={13} />
                  <span>{task.profiles.display_name || task.profiles.name}</span>
                </div>
              )}
              {task.started_at && elapsedDisplay && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded-full">
                  <Clock size={12} />
                  <span>{elapsedDisplay}</span>
                </div>
              )}
              <Badge
                className="text-[11px] font-semibold border-0"
                style={{ backgroundColor: `hsl(${currentCol?.color})`, color: 'white' }}
              >
                {currentCol?.label}
              </Badge>
            </div>
          </div>
        </div>

        {/* Body: 3-column layout like reference */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT COLUMN (~40%): Briefing / Formulário */}
          <div className="flex-[4] min-w-0 overflow-hidden flex flex-col border-r border-border">
            <Tabs defaultValue="briefing" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="h-10 rounded-none border-b border-border bg-transparent px-4 justify-start gap-0">
                <TabsTrigger value="briefing" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5">
                  <FileText size={13} /> Briefing
                </TabsTrigger>
                {hasChecklist && (
                  <TabsTrigger value="checklist" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5">
                    <CheckSquare size={13} /> Checklist
                  </TabsTrigger>
                )}
                <TabsTrigger value="historico" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs gap-1.5">
                  <History size={13} /> Histórico
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                <TabsContent value="briefing" className="p-4 space-y-4 mt-0">
                  {/* Client info card */}
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
                      <Info size={10} /> Cliente
                    </Label>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ClientLogo client={{ companyName: task.clients?.company_name || '', color: task.clients?.color || '217 91% 60%', logoUrl: task.clients?.logo_url }} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{task.clients?.company_name || '—'}</p>
                          {task.clients?.responsible_person && (
                            <p className="text-xs text-muted-foreground">{task.clients.responsible_person}</p>
                          )}
                        </div>
                      </div>
                      <a href={`/clients`} className="text-primary hover:text-primary/80">
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>

                  {/* Title */}
                  <div className="rounded-lg border border-border p-3">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Título</Label>
                    <p className="text-sm font-medium mt-1">{task.title}</p>
                  </div>

                  {/* Copy */}
                  {task.copy_text && (
                    <div className="rounded-lg border border-accent bg-accent/20 p-3">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Palette size={10} /> Copy
                      </Label>
                      <p className="text-sm mt-1.5 whitespace-pre-line leading-relaxed">{task.copy_text}</p>
                    </div>
                  )}

                  {/* Description */}
                  {task.description && (
                    <div className="rounded-lg border border-border p-3">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <FileText size={10} /> Descrição
                      </Label>
                      <p className="text-sm mt-1.5 whitespace-pre-line leading-relaxed">{task.description}</p>
                    </div>
                  )}

                  {/* References */}
                  {task.references_links?.length > 0 && (
                    <div className="rounded-lg border border-border p-3">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-2">
                        <Link2 size={10} /> Referências
                      </Label>
                      <div className="space-y-1.5">
                        {task.references_links.map((link, i) => (
                          <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1.5 hover:underline break-all">
                            <ExternalLink size={11} className="shrink-0" /> {link}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reference images */}
                  {task.reference_images?.length > 0 && (
                    <div className="rounded-lg border border-border p-3">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Imagens de Referência</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {task.reference_images.map((img, i) => {
                          const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(img);
                          return isImage ? (
                            <button key={i} onClick={() => setPreviewImage(img)} className="relative group rounded-lg overflow-hidden border border-border w-20 h-20 hover:ring-2 hover:ring-primary/50 transition-all">
                              <img src={img} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <ZoomIn size={16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          ) : (
                            <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                              <Image size={11} /> Ref {i + 1}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Adjustment notes */}
                  {task.observations && task.kanban_column === 'ajustes' && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                      <Label className="text-[10px] text-destructive uppercase tracking-wider font-semibold">⚠️ Ajustes Solicitados</Label>
                      <p className="text-sm mt-1.5 text-destructive/90">{task.observations}</p>
                    </div>
                  )}

                  {/* Created info */}
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2">
                    <Calendar size={11} />
                    <span>Criado em {new Date(task.created_at).toLocaleDateString('pt-BR')} às {new Date(task.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </TabsContent>

                {hasChecklist && (
                  <TabsContent value="checklist" className="p-4 space-y-4 mt-0">
                    {checklist.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-xs font-semibold">Itens do Checklist</Label>
                          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {checklist.filter(c => c.done).length}/{checklist.length}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${(checklist.filter(c => c.done).length / checklist.length) * 100}%` }}
                          />
                        </div>
                        {checklist.map(item => (
                          <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                            <Checkbox
                              checked={item.done}
                              onCheckedChange={async (checked) => {
                                const updated = checklist.map(c => c.id === item.id ? { ...c, done: !!checked } : c);
                                setChecklist(updated);
                                await updateTask.mutateAsync({ id: task.id, checklist: updated } as any);
                              }}
                            />
                            <span className={`text-sm flex-1 ${item.done ? 'line-through text-muted-foreground' : ''}`}>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhum item no checklist.</p>
                    )}
                  </TabsContent>
                )}

                <TabsContent value="historico" className="p-4 space-y-0 mt-0">
                  {history.data && history.data.length > 0 ? (
                    <div className="relative">
                      {/* Timeline vertical line */}
                      <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-border" />
                      
                      {history.data.map((h: any, idx: number) => {
                        const profile = h.profiles;
                        const userName = profile?.display_name || profile?.name || 'Sistema';
                        const avatarUrl = profile?.avatar_url;
                        const initials = userName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                        
                        // Calculate duration to next entry (previous chronologically)
                        const nextEntry = history.data![idx + 1];
                        let duration = '';
                        if (nextEntry) {
                          const diff = Math.floor((new Date(h.created_at).getTime() - new Date(nextEntry.created_at).getTime()) / 1000);
                          if (diff < 60) duration = `${diff}s`;
                          else if (diff < 3600) duration = `${Math.floor(diff / 60)}min`;
                          else if (diff < 86400) {
                            const hours = Math.floor(diff / 3600);
                            const mins = Math.floor((diff % 3600) / 60);
                            duration = mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
                          } else {
                            const days = Math.floor(diff / 86400);
                            const hours = Math.floor((diff % 86400) / 3600);
                            duration = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
                          }
                        }

                        return (
                          <div key={h.id} className="relative flex gap-3 pb-6 last:pb-0">
                            {/* Avatar node */}
                            <div className="relative z-10 shrink-0">
                              <Avatar className="w-[30px] h-[30px] text-[10px] ring-2 ring-background">
                                {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
                                <AvatarFallback className="bg-primary text-primary-foreground font-bold text-[10px]">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold">{userName}</span>
                                {duration && (
                                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                    <Clock size={9} /> {duration}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-foreground/80 mt-0.5">{h.action}</p>
                              {h.details && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 break-all line-clamp-2">{h.details}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {new Date(h.created_at).toLocaleString('pt-BR')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro ainda.</p>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>

          {/* CENTER COLUMN (~40%): Etapa atual + Arquivos + Colaboração */}
          <div className="flex-[4] min-w-0 overflow-hidden flex flex-col border-r border-border">
            <ScrollArea className="flex-1">
              <div className="px-6 py-5 space-y-5">
                {/* Etapa Atual header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Etapa atual</h3>
                </div>

                {/* Rocket flyby animation on stage change */}
                <AnimatePresence>
                  {showRocketFlyby && (
                    <motion.div
                      className="absolute inset-0 z-50 pointer-events-none overflow-hidden"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {/* Trail particles */}
                      {[...Array(8)].map((_, i) => (
                        <motion.span
                          key={i}
                          className="absolute text-sm"
                          initial={{ left: '-5%', top: `${35 + Math.random() * 30}%`, opacity: 0 }}
                          animate={{
                            left: `${20 + i * 10}%`,
                            top: `${35 + Math.sin(i) * 8}%`,
                            opacity: [0, 1, 0],
                          }}
                          transition={{ duration: 0.8, delay: 0.05 * i + 0.2, ease: 'easeOut' }}
                        >
                          ✨
                        </motion.span>
                      ))}
                      {/* Rocket */}
                      <motion.span
                        className="absolute text-4xl"
                        style={{ top: '38%' }}
                        initial={{ left: '-10%', rotate: 45 }}
                        animate={{ left: '110%', rotate: 45 }}
                        transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
                      >
                        🚀
                      </motion.span>
                      {/* Flash overlay */}
                      <motion.div
                        className="absolute inset-0 bg-primary/10 rounded-xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.3, 0] }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Current stage card - animated on column change */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={task.kanban_column}
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="rounded-xl border-2 p-4"
                    style={{ borderColor: `hsl(${currentCol?.color})` }}
                  >
                    <div className="flex items-center gap-3">
                      <motion.div
                        initial={{ rotate: -180, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `hsl(${currentCol?.color})` }}
                      >
                        <Play size={14} className="text-white" />
                      </motion.div>
                      <div>
                        <motion.p
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 }}
                          className="text-base font-bold uppercase"
                        >
                          {currentCol?.label}
                        </motion.p>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.25 }}
                          className="text-xs text-muted-foreground"
                        >
                          {task.kanban_column === 'nova_tarefa' && 'Aguardando início'}
                          {task.kanban_column === 'executando' && 'Tarefas que estão atualmente em andamento'}
                          {task.kanban_column === 'em_analise' && 'Aguardando revisão interna'}
                          {task.kanban_column === 'enviar_cliente' && 'Pronto para enviar ao cliente'}
                          {task.kanban_column === 'aprovado' && 'Finalizado e aprovado'}
                          {task.kanban_column === 'ajustes' && 'Correções pendentes'}
                        </motion.p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* CTA for nova_tarefa - rocket launch button */}
                {task.kanban_column === 'nova_tarefa' && isDesigner && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-accent/10 to-primary/5 p-5 text-center space-y-3"
                  >
                    <p className="text-sm text-muted-foreground font-medium">
                      Leu o briefing e entendeu tudo? 🎯
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Então vamos pra cima! Clique abaixo para começar a execução.
                    </p>
                    <motion.button
                      onClick={handleStartTask}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="relative w-full py-3.5 rounded-xl font-bold text-sm text-primary-foreground overflow-hidden bg-primary shadow-lg cursor-pointer group"
                    >
                      {/* Animated gradient overlay */}
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        animate={{ x: ['-200%', '200%'] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
                      />
                      {/* Floating particles */}
                      <motion.span
                        className="absolute left-[15%] top-1/2 text-lg"
                        animate={{ y: [-2, -12, -2], opacity: [0.3, 0.8, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2, delay: 0.2 }}
                      >
                        ✨
                      </motion.span>
                      <motion.span
                        className="absolute right-[15%] top-1/2 text-lg"
                        animate={{ y: [-2, -14, -2], opacity: [0.3, 0.8, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2.2, delay: 0.6 }}
                      >
                        ✨
                      </motion.span>
                      {/* Rocket icon + text */}
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <motion.span
                          animate={{ y: [0, -3, 0], rotate: [0, -5, 0] }}
                          transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                          className="text-xl"
                        >
                          🚀
                        </motion.span>
                        INICIAR EXECUÇÃO
                        <motion.span
                          animate={{ x: [0, 4, 0] }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
                        >
                          <ArrowRight size={16} />
                        </motion.span>
                      </span>
                    </motion.button>
                  </motion.div>
                )}

                {task.kanban_column !== 'nova_tarefa' && (<>
                {/* Arquivo section */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Arquivo</h4>

                  {(task.kanban_column === 'executando' || task.kanban_column === 'ajustes') && isDesigner ? (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase">Link da arte</Label>
                        <Input value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)} placeholder="https://drive.google.com/..." className="text-xs h-9 mt-1" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase">Arquivo editável</Label>
                        <Input value={editableFileUrl} onChange={e => setEditableFileUrl(e.target.value)} placeholder="Link do arquivo editável" className="text-xs h-9 mt-1" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase">Observações</Label>
                        <Textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3} className="text-xs mt-1" />
                      </div>
                    </div>
                  ) : task.attachment_url ? (
                    <div className="space-y-2">
                      {/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(task.attachment_url) ? (
                        <button onClick={() => setPreviewImage(task.attachment_url!)} className="relative group rounded-lg overflow-hidden border border-border w-full hover:ring-2 hover:ring-primary/50 transition-all">
                          <img src={task.attachment_url} alt="Arte" className="w-full max-h-48 object-contain bg-muted/30" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ) : (
                        <a href={task.attachment_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors text-sm text-primary">
                          <Eye size={14} /> Ver arte anexada
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center">
                      <Paperclip size={20} className="mx-auto text-muted-foreground/40 mb-2" />
                      <p className="text-xs text-muted-foreground">Clique aqui ou arraste arquivos para anexar</p>
                    </div>
                  )}
                </div>

                {/* Mockup de Apresentação section */}
                {showMockup && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <FileText size={14} /> Mockup de Apresentação
                    </h4>

                    {/* Aviso obrigatório */}
                    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ O PDF deve conter a apresentação completa:</p>
                      <ul className="text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5 list-disc list-inside">
                        <li>Logo</li>
                        <li>Manual da Marca</li>
                        <li>Usabilidade</li>
                        <li>Cartão de Visita</li>
                      </ul>
                    </div>

                    {(task.kanban_column === 'executando' || task.kanban_column === 'ajustes') && isDesigner ? (
                      <div className="space-y-2">
                        {mockupUrl && (
                          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 overflow-hidden">
                            <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                            <a href={mockupUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all line-clamp-2">{mockupUrl}</a>
                          </div>
                        )}
                        <Input value={mockupUrl} onChange={e => setMockupUrl(e.target.value)} placeholder="Link do PDF de apresentação..." className="text-xs h-9" />
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1 h-9 text-xs" onClick={async () => {
                            if (!mockupUrl) { toast.error('Cole o link do mockup'); return; }
                            await updateTask.mutateAsync({ id: task.id, mockup_url: mockupUrl } as any);
                            await addHistory.mutateAsync({ task_id: task.id, action: 'Mockup de apresentação anexado (PDF)', details: mockupUrl, user_id: user?.id });
                            toast.success('Mockup salvo!');
                          }}>
                            <Link2 size={12} className="mr-1" /> Salvar
                          </Button>
                          <label className="flex-1">
                            <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.type !== 'application/pdf') {
                                toast.error('Apenas arquivos PDF são aceitos para o mockup de apresentação');
                                return;
                              }
                              setUploadingMockup(true);
                              try {
                                const fileName = `mockups/${task.client_id}/${Date.now()}_${file.name}`;
                                const { data, error } = await supabase.storage.from('design-files').upload(fileName, file);
                                if (error) throw error;
                                const { data: { publicUrl } } = supabase.storage.from('design-files').getPublicUrl(data.path);
                                setMockupUrl(publicUrl);
                                await updateTask.mutateAsync({ id: task.id, mockup_url: publicUrl } as any);
                                await addHistory.mutateAsync({ task_id: task.id, action: 'Mockup de apresentação enviado (PDF)', details: publicUrl, user_id: user?.id });
                                toast.success('PDF de apresentação enviado!');
                              } catch (err: any) { toast.error(err.message || 'Erro ao enviar'); }
                              finally { setUploadingMockup(false); }
                            }} />
                            <Button size="sm" variant="secondary" className="w-full h-9 text-xs" asChild disabled={uploadingMockup}>
                              <span><Upload size={12} className="mr-1" /> {uploadingMockup ? '...' : 'Upload'}</span>
                            </Button>
                          </label>
                        </div>
                      </div>
                    ) : (task as any).mockup_url ? (
                      <div className="space-y-2">
                        <a href={(task as any).mockup_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors text-sm text-primary">
                          <FileText size={14} /> Ver PDF de apresentação
                        </a>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-4 text-center">
                        <FileText size={18} className="mx-auto text-muted-foreground/40 mb-1" />
                        <p className="text-xs text-muted-foreground">Sem mockup de apresentação</p>
                      </div>
                    )}
                  </div>
                )}

                </>)}
                {showAdjustmentForm && (
                  <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <Label className="text-xs font-semibold text-destructive">Descreva os ajustes</Label>
                    <Textarea value={adjustmentNotes} onChange={e => setAdjustmentNotes(e.target.value)} rows={3} className="text-xs" placeholder="O que precisa ser corrigido..." />
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" className="flex-1 h-9 text-xs" onClick={handleRequestAdjustments}>Solicitar</Button>
                      <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setShowAdjustmentForm(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}

                {/* Format + Priority cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Formato</Label>
                    <p className="text-sm font-semibold mt-1">{FORMAT_LABELS[task.format_type] || task.format_type}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prioridade</Label>
                    <Badge className={`mt-1.5 ${PRIORITY_CONFIG[task.priority]?.color || ''}`}>
                      {PRIORITY_CONFIG[task.priority]?.label || task.priority}
                    </Badge>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* RIGHT COLUMN (~20%): Mover Para + Informações */}
          <div className="flex-[2] min-w-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-5 overflow-hidden">
                {/* Move actions */}
                {moveActions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Mover Para</Label>
                    <AnimatePresence>
                      {movingAction && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="text-xs text-center py-2 px-3 rounded-lg bg-primary/10 text-primary font-semibold"
                        >
                          ✓ Movido para {movingAction}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {moveActions.map((action, index) => {
                      const Icon = action.icon;
                      return (
                        <motion.div
                          key={action.label}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 24 }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Button
                            onClick={action.onClick}
                            disabled={!!movingAction}
                            className="w-full justify-start gap-2 text-xs font-bold h-10 text-white border-0 hover:opacity-90 transition-opacity"
                            style={{ backgroundColor: action.color }}
                          >
                            <Icon size={14} /> {action.label}
                            <ArrowRight size={12} className="ml-auto" />
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                <Separator />

                {/* Adicionar ao cartão section */}
                <div className="space-y-3">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Adicionar ao Cartão</Label>

                  {/* Responsável */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User size={13} /> <span>Responsável</span>
                    </div>
                    <div className="rounded-md px-3 py-1.5 text-xs font-medium text-center text-white" style={{ backgroundColor: `hsl(${currentCol?.color})` }}>
                      {task.profiles?.display_name || task.profiles?.name || 'Não atribuído'}
                    </div>
                  </div>

                  {/* Data */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar size={13} /> <span>Data</span>
                    </div>
                    <div className="rounded-md px-3 py-1.5 text-xs font-medium text-center text-white" style={{ backgroundColor: `hsl(${currentCol?.color})` }}>
                      {new Date(task.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>

                  {/* Formato */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText size={13} /> <span>Formato</span>
                    </div>
                    <Badge variant="outline" className="w-full justify-center text-xs py-1">
                      {FORMAT_LABELS[task.format_type] || task.format_type}
                    </Badge>
                  </div>

                  {/* Versão */}
                  {task.version > 1 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <RotateCcw size={13} /> <span>Versão</span>
                      </div>
                      <Badge variant="secondary" className="w-full justify-center text-xs py-1">
                        v{task.version}
                      </Badge>
                    </div>
                  )}

                  {/* Timer */}
                  {task.started_at && elapsedDisplay && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock size={13} /> <span>Tempo</span>
                      </div>
                      <Badge variant="secondary" className="w-full justify-center text-xs py-1">
                        {elapsedDisplay}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>

      {/* Image Preview Lightbox */}
      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-2 bg-black/95 border-none">
          {previewImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="flex items-center justify-center w-full h-full"
            >
              <img
                src={previewImage}
                alt="Preview"
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            </motion.div>
          )}
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

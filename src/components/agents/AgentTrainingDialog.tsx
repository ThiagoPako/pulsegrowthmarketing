import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { FileText, GraduationCap, Image as ImageIcon, Loader2, Paperclip, Send, Video, X, File as FileIcon, Music } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApp } from '@/contexts/AppContext';
import { uploadFileToVps } from '@/services/vpsApi';
import {
  MAX_TRAINING_ATTACHMENTS, MAX_TRAINING_FILE_BYTES, MAX_TRAINING_TEXT, attachmentKind, fetchTrainingMessages, formatBytes,
  sendTrainingMessage, trainingUploadFolder, type AttachmentKind, type TrainingAttachment, type TrainingMessage,
} from '@/lib/agentTraining';

const NO_CLIENT = '__sem_cliente__';
const ACCEPT = 'image/*,video/*,application/pdf,audio/*,text/plain,.md,.txt,.csv,.srt,.doc,.docx';

const KIND_ICON: Record<AttachmentKind, typeof FileText> = {
  imagem: ImageIcon, video: Video, pdf: FileText, audio: Music, texto: FileText, arquivo: FileIcon,
};

interface PendingFile {
  id: string;
  file: File;
  progress: number;
}

function AttachmentView({ item }: { item: TrainingAttachment }) {
  const kind = item.kind || attachmentKind(item.name || item.url, item.type);
  if (kind === 'imagem') {
    return (
      <a href={item.url} target="_blank" rel="noreferrer" className="block">
        <img src={item.url} alt={item.name} className="max-h-48 rounded-md border border-border object-contain" loading="lazy" />
      </a>
    );
  }
  if (kind === 'video') {
    return <video src={item.url} controls preload="metadata" className="max-h-64 w-full rounded-md border border-border bg-black" />;
  }
  const Icon = KIND_ICON[kind];
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs hover:border-primary/40">
      <Icon size={14} className="shrink-0 text-primary" />
      <span className="truncate">{item.name}</span>
      {item.size ? <span className="shrink-0 text-muted-foreground">{formatBytes(item.size)}</span> : null}
    </a>
  );
}

function MessageBubble({ message, agentName }: { message: TrainingMessage; agentName: string }) {
  const mine = !message.from_agent;
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-2 rounded-2xl px-3 py-2 text-sm ${mine ? 'rounded-br-sm bg-primary/15' : 'rounded-bl-sm bg-muted'}`}>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{mine ? (message.author_name || 'Equipe').trim() : agentName}</span>
          {message.client_name && <Badge variant="outline" className="h-4 px-1 text-[10px]">{message.client_name.trim()}</Badge>}
          <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: ptBR })}</span>
          {mine && <span>{message.read_at ? '· lido pelo agente' : '· ainda não lido'}</span>}
        </div>
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {message.attachments.length > 0 && (
          <div className="space-y-1.5">
            {message.attachments.map((item) => <AttachmentView key={item.url} item={item} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Conversa de treino com um agente: a pessoa escreve como é feito e anexa texto, imagem, PDF ou vídeo.
 * Cada envio vira um ensinamento do agente (servidor: agentTrainingRoutes.mjs) e o agente recebe um recado na hora.
 */
export function AgentTrainingDialog({ agentId, agentName, open, onOpenChange }: {
  agentId: string | null;
  agentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { clients } = useApp();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [clientId, setClientId] = useState(NO_CLIENT);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const firstName = agentName.trim().split(/\s+/)[0] || 'agente';

  const query = useQuery({
    queryKey: ['agent-training', agentId],
    queryFn: () => fetchTrainingMessages(agentId as string),
    enabled: open && !!agentId,
    refetchInterval: open ? 20_000 : false,
  });
  const messages = query.data?.messages ?? [];

  useEffect(() => {
    if (!open) return;
    setText('');
    setFiles([]);
    setClientId(NO_CLIENT);
  }, [open, agentId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  const send = useMutation({
    mutationFn: async () => {
      if (!agentId) throw new Error('Escolha o agente');
      const uploaded: Omit<TrainingAttachment, 'kind'>[] = [];
      for (const pending of files) {
        const url = await uploadFileToVps(pending.file, {
          folder: trainingUploadFolder(agentId),
          retries: 2,
          onProgress: ({ percent }) => setFiles((list) => list.map((f) => (f.id === pending.id ? { ...f, progress: percent } : f))),
        });
        uploaded.push({ url, name: pending.file.name, type: pending.file.type, size: pending.file.size });
      }
      return sendTrainingMessage(agentId, {
        body: text.trim(),
        client_id: clientId === NO_CLIENT ? null : clientId,
        attachments: uploaded,
      });
    },
    onSuccess: () => {
      setText('');
      setFiles([]);
      toast.success(`${firstName} recebeu o ensinamento`);
      void queryClient.invalidateQueries({ queryKey: ['agent-training', agentId] });
      void queryClient.invalidateQueries({ queryKey: ['agent-training-agents'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_TRAINING_ATTACHMENTS) {
        toast.error(`No máximo ${MAX_TRAINING_ATTACHMENTS} anexos por vez`);
        break;
      }
      if (file.size > MAX_TRAINING_FILE_BYTES) {
        toast.error(`${file.name} passa de 2 GB`);
        continue;
      }
      next.push({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, progress: 0 });
    }
    setFiles(next);
  };

  const canSend = (text.trim().length > 0 || files.length > 0) && !send.isPending;
  const sortedClients = [...clients].filter((c) => c.status !== 'cancelado').sort((a, b) => a.companyName.localeCompare(b.companyName));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!send.isPending) onOpenChange(next); }}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap size={18} className="text-primary" /> Treinar {firstName}
          </DialogTitle>
          <DialogDescription>
            Ensine como é feito: escreva o passo a passo, o que está certo e o que evitar, e anexe exemplos (imagem, PDF, vídeo, texto).
            {' '}{firstName} recebe um recado na hora e guarda o que vale como regra.
          </DialogDescription>
        </DialogHeader>

        <div ref={listRef} className="min-h-[180px] flex-1 space-y-3 overflow-y-auto rounded-lg border border-border bg-background/40 p-3" aria-live="polite">
          {query.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : query.isError ? (
            <p className="py-6 text-center text-sm text-destructive">{(query.error as Error).message}</p>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum ensinamento ainda. Comece contando como você faz, com um exemplo.
            </p>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} agentName={agentName.trim()} />)
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-64" aria-label="Cliente do ensinamento">
                <SelectValue placeholder="Cliente (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>Vale para todos os clientes</SelectItem>
                {sortedClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">Escolha um cliente quando a regra for só dele.</span>
          </div>

          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((pending) => {
                const Icon = KIND_ICON[attachmentKind(pending.file.name, pending.file.type)];
                return (
                  <li key={pending.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                    <Icon size={13} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{pending.file.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {send.isPending ? `${Math.round(pending.progress)}%` : formatBytes(pending.file.size)}
                    </span>
                    {!send.isPending && (
                      <button type="button" aria-label={`Tirar ${pending.file.name}`} onClick={() => setFiles((list) => list.filter((f) => f.id !== pending.id))}>
                        <X size={13} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX_TRAINING_TEXT))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSend) {
                event.preventDefault();
                send.mutate();
              }
            }}
            placeholder={`Ex.: "${firstName}, nos stories da Naraely a legenda vai sempre em caixa alta, 2 a 3 palavras…"`}
            rows={3}
            disabled={send.isPending}
            aria-label="Ensinamento"
          />
          <div className="flex items-center gap-2">
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={send.isPending}>
              <Paperclip size={14} className="mr-1" /> Anexar
            </Button>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">texto, imagem, PDF ou vídeo · Ctrl+Enter envia</span>
            <Button type="button" size="sm" className="ml-auto" onClick={() => send.mutate()} disabled={!canSend}>
              {send.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}
              {send.isPending && files.length ? 'Enviando arquivos…' : 'Ensinar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

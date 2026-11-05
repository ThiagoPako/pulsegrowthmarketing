// Post avulso no Estúdio de Postagem (05/11/2026, Thiago: "um botão para subir post, reels, arte para agendar sem ser
// apenas os que já têm no sistema"). O arquivo sobe para a VPS, vira um material aprovado do cliente
// (POST /api/scheduling/avulso) e o agendamento abre em seguida, como para qualquer material.
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Film, Image as ImageIcon, Images, Loader2, Smartphone, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { uploadFileToVps } from '@/services/vpsApi';
import { createAvulsoPost } from '@/services/schedulingApi';
import type { SchedulingKind } from '@/lib/postingSchedule';

type Tipo = 'reels' | 'story' | 'feed' | 'carrossel';

const TIPOS: { value: Tipo; label: string; hint: string; icon: typeof Film; accept: string; multiple: boolean }[] = [
  { value: 'reels', label: 'Reels', hint: 'um vídeo', icon: Film, accept: 'video/*', multiple: false },
  { value: 'story', label: 'Story', hint: 'vídeo ou imagem', icon: Smartphone, accept: 'video/*,image/*', multiple: false },
  { value: 'feed', label: 'Arte do feed', hint: 'uma imagem', icon: ImageIcon, accept: 'image/*', multiple: false },
  { value: 'carrossel', label: 'Carrossel', hint: '2 a 10 imagens', icon: Images, accept: 'image/*', multiple: true },
];

export default function UploadPostDialog({ clientId, clientName, onClose, onCreated }: {
  clientId: string;
  clientName: string;
  onClose: () => void;
  onCreated: (target: { kind: SchedulingKind; id: string }) => void;
}) {
  const [tipo, setTipo] = useState<Tipo>('reels');
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = TIPOS.find((t) => t.value === tipo)!;
  const previews = useMemo(() => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f), video: f.type.startsWith('video/') })), [files]);

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list || []);
    setFiles(meta.multiple ? [...files, ...chosen].slice(0, 10) : chosen.slice(0, 1));
  };

  const changeTipo = (next: Tipo) => { setTipo(next); setFiles([]); };

  const submit = async () => {
    if (!files.length) { toast.error('Escolha o arquivo do post'); return; }
    if (tipo === 'carrossel' && files.length < 2) { toast.error('Carrossel precisa de 2 imagens ou mais'); return; }
    setBusy(true);
    try {
      const total = files.reduce((s, f) => s + f.size, 0) || 1;
      let done = 0;
      const urls: string[] = [];
      for (const file of files) {
        const url = await uploadFileToVps(file, {
          folder: `posts-avulsos/${clientId}`,
          onProgress: (p) => setPercent(Math.round(((done + p.loaded) / total) * 100)),
        });
        done += file.size;
        urls.push(url);
      }
      const created = await createAvulsoPost({ client_id: clientId, tipo, title: title.trim(), caption: caption.trim(), media_urls: urls });
      toast.success('Post enviado. Agora escolha o dia e a hora.');
      onCreated(created);
    } catch (err) {
      toast.error((err as Error).message || 'Não deu para enviar o post');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir post de {clientName}</DialogTitle>
          <DialogDescription>Para um post que não passou pelo Kanban nem pelo Design. Depois de enviar, você escolhe o dia e a hora.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div role="radiogroup" aria-label="Tipo do post" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIPOS.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={tipo === t.value} disabled={busy}
                onClick={() => changeTipo(t.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-colors',
                  tipo === t.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/40',
                )}>
                <t.icon size={18} />
                <span className="text-xs font-semibold">{t.label}</span>
                <span className="text-[10px]">{t.hint}</span>
              </button>
            ))}
          </div>

          <div>
            <input ref={inputRef} type="file" className="hidden" accept={meta.accept} multiple={meta.multiple}
              onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
            {previews.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {previews.map((p, i) => (
                  <div key={p.url} className="relative h-24 w-[54px] overflow-hidden rounded-lg border border-border bg-muted">
                    {p.video ? <video src={p.url} muted className="h-full w-full object-cover" /> : <img src={p.url} alt={p.name} className="h-full w-full object-cover" />}
                    {!busy && (
                      <button type="button" aria-label={`Tirar ${p.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"><X size={11} /></button>
                    )}
                  </div>
                ))}
                {meta.multiple && files.length < 10 && !busy && (
                  <button type="button" onClick={() => inputRef.current?.click()}
                    className="grid h-24 w-[54px] place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50">
                    <Upload size={16} />
                  </button>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-7 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground">
                <Upload size={20} />
                Escolher {meta.multiple ? 'as imagens' : 'o arquivo'} ({meta.hint})
              </button>
            )}
          </div>

          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do post (opcional)" maxLength={160} disabled={busy} />
          <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda (opcional; dá para escrever ou pedir à IA no agendamento)" rows={4} maxLength={2200} disabled={busy} />

          {busy && (
            <div className="space-y-1">
              <Progress value={percent} />
              <p className="text-[11px] text-muted-foreground">Enviando… {percent}%</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !files.length} className="gap-1.5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Enviar e agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

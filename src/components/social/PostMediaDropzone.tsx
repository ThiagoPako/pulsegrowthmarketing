import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Loader2, UploadCloud, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { uploadFileToVps } from '@/services/vpsApi';

export interface UploadedMedia {
  url: string;
  label: string;
}

export interface PostMediaDropzoneProps {
  /** Quantos arquivos ainda cabem na postagem. */
  remaining: number;
  onUploaded: (media: UploadedMedia[]) => void;
  className?: string;
}

const MAX_IMAGE_MB = 20;
const MAX_VIDEO_MB = 300;
const IMAGE_MIME = /^image\/(jpeg|png|webp)$/i;
const VIDEO_MIME = /^video\/(mp4|quicktime|webm|x-m4v)$/i;

/** Valida formato/tamanho conforme o que a Meta aceita publicar. */
function validate(file: File): string | null {
  const isImage = IMAGE_MIME.test(file.type);
  const isVideo = VIDEO_MIME.test(file.type);
  if (!isImage && !isVideo) return `"${file.name}": use JPG, PNG, WEBP, MP4, MOV ou WEBM.`;
  const mb = file.size / (1024 * 1024);
  const limit = isImage ? MAX_IMAGE_MB : MAX_VIDEO_MB;
  if (mb > limit) return `"${file.name}": ${mb.toFixed(1)}MB passa do limite de ${limit}MB.`;
  if (file.size === 0) return `"${file.name}": arquivo vazio.`;
  return null;
}

/**
 * Área de envio de imagens/vídeos direto do computador ou celular,
 * com arrastar-e-soltar. Os arquivos vão para a VPS e viram links públicos.
 */
export function PostMediaDropzone({ remaining, onUploaded, className }: PostMediaDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const uploading = progress !== null;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    if (remaining <= 0) {
      toast.error('Este formato já está com todas as mídias preenchidas.');
      return;
    }

    const chosen = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) toast.warning(`Só cabem mais ${remaining} arquivo(s) nesta postagem.`);

    const valid: File[] = [];
    for (const file of chosen) {
      const error = validate(file);
      if (error) toast.error(error);
      else valid.push(file);
    }
    if (!valid.length) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    try {
      const uploaded: UploadedMedia[] = [];
      for (const [index, file] of valid.entries()) {
        setProgress({ current: index + 1, total: valid.length });
        const url = await uploadFileToVps(file, { folder: 'post-studio' });
        uploaded.push({ url, label: file.name.replace(/\.[^.]+$/, '') });
      }
      onUploaded(uploaded);
      toast.success(`${uploaded.length} arquivo(s) enviado(s) com sucesso.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar o arquivo.');
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Enviar imagem ou vídeo"
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragging ? 'border-primary bg-primary/10 scale-[1.01]' : 'border-border bg-muted/40 hover:border-primary/60 hover:bg-muted/70',
          uploading && 'pointer-events-none opacity-70',
        )}
      >
        <span className={cn(
          'grid h-12 w-12 place-items-center rounded-full transition-colors',
          dragging ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        )}>
          {uploading ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
        </span>

        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            {uploading && progress
              ? `Enviando ${progress.current} de ${progress.total}…`
              : 'Arraste a imagem ou vídeo aqui'}
          </p>
          <p className="text-xs text-muted-foreground">
            ou clique para escolher do computador/celular
          </p>
        </div>

        <Button type="button" variant="outline" size="sm" disabled={uploading} className="mt-1 pointer-events-none">
          <ImagePlus size={14} className="mr-1.5" /> Escolher arquivo
        </Button>

        <p className="text-[11px] text-muted-foreground">
          JPG, PNG, WEBP até {MAX_IMAGE_MB}MB · MP4, MOV, WEBM até {MAX_VIDEO_MB}MB
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        onChange={e => void handleFiles(e.target.files)}
      />
    </div>
  );
}

export default PostMediaDropzone;

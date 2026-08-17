import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { uploadFileToVps } from '@/services/vpsApi';

export interface MediaUploaderProps {
  label: string;
  accept: string;
  folder: string;
  value: string[];
  onChange: (urls: string[]) => void;
  kind: 'image' | 'video';
}

const MAX_SIZE_MB: Record<'image' | 'video', number> = { image: 15, video: 300 };
const ALLOWED_MIME: Record<'image' | 'video', RegExp> = {
  image: /^image\/(jpeg|png|webp|gif|avif)$/i,
  video: /^video\/(mp4|quicktime|webm|x-m4v)$/i,
};
const MAX_FILES = 40;

/** Valida tipo e tamanho antes de enviar. Retorna a mensagem de erro ou null. */
function validateFile(file: File, kind: 'image' | 'video'): string | null {
  if (!ALLOWED_MIME[kind].test(file.type)) {
    return kind === 'image'
      ? `"${file.name}": formato inválido. Use JPG, PNG, WEBP, GIF ou AVIF.`
      : `"${file.name}": formato inválido. Use MP4, MOV ou WEBM.`;
  }
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_SIZE_MB[kind]) {
    return `"${file.name}": ${sizeMb.toFixed(1)}MB excede o limite de ${MAX_SIZE_MB[kind]}MB.`;
  }
  if (file.size === 0) return `"${file.name}": arquivo vazio.`;
  return null;
}

/**
 * Uploader múltiplo (fotos ou vídeos) que envia direto para a VPS.
 * Mantém apenas URLs públicas no estado — nada é persistido fora da VPS.
 */
export default function MediaUploader({ label, accept, folder, value, onChange, kind }: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const selected = Array.from(files);
    if (value.length + selected.length > MAX_FILES) {
      toast.error(`Limite de ${MAX_FILES} arquivos por registro.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    const valid: File[] = [];
    for (const file of selected) {
      const error = validateFile(file, kind);
      if (error) toast.error(error);
      else valid.push(file);
    }
    if (valid.length === 0) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const [index, file] of valid.entries()) {
        setProgress({ current: index + 1, total: valid.length });
        const url = await uploadFileToVps(file, { folder });
        uploaded.push(url);
      }
      onChange([...value, ...uploaded]);
      toast.success(`${uploaded.length} arquivo(s) enviado(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha no upload');
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };


  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
          {uploading && progress ? `Enviando ${progress.current}/${progress.total}` : 'Enviar'}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {kind === 'image'
          ? `JPG, PNG, WEBP, GIF ou AVIF · até ${MAX_SIZE_MB.image}MB por arquivo`
          : `MP4, MOV ou WEBM · até ${MAX_SIZE_MB.video}MB por arquivo`}
      </p>

      <input ref={inputRef} type="file" accept={accept} multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />



      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum arquivo adicionado.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url, index) => (
            <div key={`${url}-${index}`} className="group relative overflow-hidden rounded-lg border border-border bg-muted">
              {kind === 'image' ? (
                <img src={url} alt={`${label} ${index + 1}`} loading="lazy" className="h-20 w-full object-cover" />
              ) : (
                <video src={url} className="h-20 w-full object-cover" muted />
              )}
              <button
                type="button"
                aria-label="Remover arquivo"
                onClick={() => removeAt(index)}
                className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

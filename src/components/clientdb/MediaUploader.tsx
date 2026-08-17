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

/**
 * Uploader múltiplo (fotos ou vídeos) que envia direto para a VPS.
 * Mantém apenas URLs públicas no estado — nada é persistido fora da VPS.
 */
export default function MediaUploader({ label, accept, folder, value, onChange, kind }: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadFileToVps(file, { folder });
        uploaded.push(url);
      }
      onChange([...value, ...uploaded]);
      toast.success(`${uploaded.length} arquivo(s) enviado(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha no upload');
    } finally {
      setUploading(false);
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
          Enviar
        </Button>
      </div>

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

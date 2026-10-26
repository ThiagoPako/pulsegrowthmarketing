import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadFileToVps } from '@/services/vpsApi';
import { toast } from 'sonner';
import { FileText, Film, Image as ImageIcon, Link2, Loader2, Plus, Upload, X } from 'lucide-react';
import { REFERENCE_FILE_ACCEPT, REFERENCE_MAX_BYTES, canPreviewImage, referenceKind } from '@/lib/designBrief';

interface Props {
  /** arquivos enviados (vão para reference_images) */
  files: string[];
  onFilesChange: (files: string[]) => void;
  /** links (Pinterest, Instagram, Drive...) — vão para references_links */
  links: string[];
  onLinksChange: (links: string[]) => void;
  /** pasta do upload: design-refs/<client_id>/<task_id ou rascunho> */
  folder: string;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

function RefThumb({ url, onRemove, disabled }: { url: string; onRemove: () => void; disabled?: boolean }) {
  const kind = referenceKind(url);
  const name = decodeURIComponent(url.split('?')[0].split('/').pop() || url);
  return (
    <div className="relative group w-20">
      <a href={url} target="_blank" rel="noopener noreferrer" className="relative block w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted/30" title={name}>
        {kind === 'image' && canPreviewImage(url) ? (
          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : kind === 'video' ? (
          <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
            {kind === 'pdf' ? <FileText size={18} /> : kind === 'image' ? <ImageIcon size={18} /> : <Link2 size={18} />}
            <span className="text-[9px] uppercase">{kind === 'pdf' ? 'PDF' : kind === 'image' ? 'HEIC' : 'arquivo'}</span>
          </div>
        )}
        {kind === 'video' && <Film size={12} className="absolute bottom-1 left-1 text-white drop-shadow" />}
      </a>
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          aria-label="Remover referência"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

/**
 * Referências da arte: arquivos (imagens PNG/JPG/WebP/HEIC, PDF e vídeo curto) com prévia e
 * remover, e links. O designer (pessoa ou agente) baixa tudo, entende e arquiva no Drive do cliente.
 */
export default function DesignReferenceUploader({ files, onFilesChange, links, onLinksChange, folder, disabled, onUploadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkInput, setLinkInput] = useState('');

  const addLink = () => {
    const link = linkInput.trim();
    if (!link) return;
    try {
      const u = new URL(link);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      toast.error('Link inválido (comece com https://)');
      return;
    }
    if (links.includes(link)) { toast.error('Link já adicionado'); return; }
    onLinksChange([...links, link]);
    setLinkInput('');
  };

  const upload = async (list: File[]) => {
    if (!list.length) return;
    setUploading(true);
    onUploadingChange?.(true);
    const uploaded: string[] = [];
    try {
      for (const file of list) {
        if (file.size > REFERENCE_MAX_BYTES) {
          toast.error(`${file.name}: máximo de 100 MB (vídeo curto)`);
          continue;
        }
        try {
          uploaded.push(await uploadFileToVps(file, folder));
        } catch (err) {
          toast.error(`${file.name}: ${err instanceof Error ? err.message : 'falha no envio'}`);
        }
      }
      if (uploaded.length) {
        onFilesChange([...files, ...uploaded]);
        toast.success(`${uploaded.length} referência(s) enviada(s)`);
      }
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  return (
    <div className="space-y-2">
      {(files.length > 0 || links.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {files.map((url, i) => (
            <RefThumb key={`${url}-${i}`} url={url} disabled={disabled} onRemove={() => onFilesChange(files.filter((_, idx) => idx !== i))} />
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="space-y-1">
          {links.map((link, i) => (
            <div key={`${link}-${i}`} className="flex items-center gap-1.5 text-[11px] bg-background/60 rounded px-2 py-1 border border-border">
              <Link2 size={10} className="shrink-0 text-muted-foreground" />
              <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-primary hover:underline">{link}</a>
              {!disabled && (
                <button type="button" onClick={() => onLinksChange(links.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Remover link">
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <>
          <div
            className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-lg border border-dashed border-border p-2 ${uploading ? 'opacity-70' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); }}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={REFERENCE_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => { const list = Array.from(e.target.files || []); e.target.value = ''; void upload(list); }}
            />
            <Button type="button" size="sm" variant="secondary" className="h-9 text-xs gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'Enviando…' : 'Enviar arquivos'}
            </Button>
            <div className="flex flex-1 items-center gap-1.5">
              <Input
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                placeholder="ou cole um link (Pinterest, Instagram, Drive…)"
                className="h-9 text-xs"
              />
              <Button type="button" size="sm" variant="outline" className="h-9 text-xs gap-1 shrink-0" onClick={addLink} disabled={!linkInput.trim()}>
                <Plus size={12} /> Link
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Imagens (PNG, JPG, WebP, HEIC), PDF ou vídeo curto, até 100 MB cada. Pode arrastar vários arquivos de uma vez.
          </p>
        </>
      )}
    </div>
  );
}

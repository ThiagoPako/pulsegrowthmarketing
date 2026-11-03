// Trilha do story de arte (usuário, 02/11/2026: "dá pra agendar o story (arte) com trilha?" → "Sim, cria"). Na hora de
// postar, o servidor transforma a arte em vídeo de 15 s com a música (lib/imageFit.mjs storyVideo); se falhar, a arte
// vai sem música. Só vale para story de UMA imagem postado sozinho.
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Music2, Upload, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { uploadFileToVps } from '@/services/vpsApi';

export interface StoryTrack { url: string; name: string | null }

const AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg)$/i;

export default function StoryTrackField({ value, onChange, disabled = false }: {
  value: StoryTrack | null;
  onChange: (v: StoryTrack | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!AUDIO_RE.test(file.name)) { toast.error('Escolha um áudio mp3, m4a ou wav.'); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error('Áudio grande demais (até 25 MB).'); return; }
    setBusy(true);
    try {
      const url = await uploadFileToVps(file, 'trilhas-story');
      onChange({ url, name: file.name.replace(AUDIO_RE, '').slice(0, 120) });
    } catch (e) {
      toast.error(`Não deu para enviar a trilha: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Trilha (opcional)</Label>
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary"><Music2 className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.name || 'Trilha'}</p>
            <audio src={value.url} controls preload="none" className="mt-1 h-7 w-full" />
          </div>
          {!disabled && (
            <button type="button" onClick={() => onChange(null)} aria-label="Tirar a trilha" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? 'Enviando…' : 'Escolher música (mp3, m4a, wav)'}
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">A arte vira um vídeo de 15 s com a música. Use trilha instrumental.</p>
      <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.wav" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

import { useState } from 'react';
import { toast } from 'sonner';
import { BellRing, CheckCircle2, Copy, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { storyGuidance } from '@/lib/storySeries';
import { markStoryPosted } from '@/services/storiesApi';

interface Props {
  postId: string | null;
  mediaUrl: string | null;
  link: string | null;
  buttonText: string | null;
  /** Aviso já enviado (no horário) */
  notified?: boolean;
  /** Já marcado como postado */
  posted?: boolean;
  postedBy?: string | null;
  onPosted?: () => void;
  className?: string;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copiado');
  } catch {
    toast.error('Não foi possível copiar');
  }
}

/** Lembrete com link: vídeo original para baixar, link para copiar, a orientação curta e o "Postado". */
export default function StoryReminderPanel({ postId, mediaUrl, link, buttonText, notified, posted, postedBy, onPosted, className }: Props) {
  const [saving, setSaving] = useState(false);

  const markPosted = async () => {
    if (!postId) return;
    setSaving(true);
    try {
      await markStoryPosted(postId);
      toast.success('Postado');
      onPosted?.();
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível marcar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(
      'space-y-2.5 rounded-xl border p-3',
      posted ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-amber-500/40 bg-amber-500/[0.06]',
      className,
    )}>
      <div className="flex items-start gap-2 text-xs leading-relaxed">
        {posted
          ? <CheckCircle2 size={15} className="mt-px shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          : <BellRing size={15} className={cn('mt-px shrink-0 text-amber-600 dark:text-amber-400', notified && 'animate-pulse')} aria-hidden="true" />}
        <p className="break-words text-foreground">
          {posted ? `Postado${postedBy ? ` por ${postedBy}` : ''}` : storyGuidance(buttonText, link)}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {mediaUrl && (
          <Button asChild type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <a href={mediaUrl} download target="_blank" rel="noreferrer">
              <Download size={13} /> Baixar vídeo
            </a>
          </Button>
        )}
        {link && (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => copy(link)}>
            <Copy size={13} /> Copiar link
          </Button>
        )}
        {!posted && postId && (
          <Button type="button" size="sm" className="ml-auto h-8 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-600/90" onClick={markPosted} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Postado
          </Button>
        )}
      </div>
    </div>
  );
}

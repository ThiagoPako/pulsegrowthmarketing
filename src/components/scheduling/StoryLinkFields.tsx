import { Link2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { SchedulingItem } from '@/lib/postingSchedule';
import { DEFAULT_BUTTON_TEXTS } from '@/lib/storySeries';
import MaterialThumb from './MaterialThumb';

interface Props {
  item: Pick<SchedulingItem, 'thumb_url' | 'media_url' | 'media_kind' | 'type' | 'title'>;
  link: string;
  onLinkChange: (value: string) => void;
  buttonText: string;
  onButtonTextChange: (value: string) => void;
  /** Botões do cliente (os três de sempre e o personalizado) */
  buttonTexts?: string[];
  /** Abre o cadastro do link do cliente */
  onEditClientLink?: () => void;
  disabled?: boolean;
}

/** Prévia do story com o adesivo de link na parte de baixo. */
export function StoryLinkPreview({ item, buttonText, className }: {
  item: Props['item']; buttonText: string; className?: string;
}) {
  return (
    <div className={cn('relative aspect-[9/16] w-28 shrink-0 overflow-hidden rounded-xl border border-border bg-muted shadow-sm', className)}>
      <MaterialThumb item={item} videoFrame className="absolute inset-0 h-full w-full rounded-none" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
      <div className="absolute inset-x-1.5 bottom-[12%] flex justify-center">
        <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-white px-1.5 py-1 text-center text-[8px] font-bold uppercase leading-tight tracking-wide text-sky-600 shadow-md">
          <Link2 size={9} className="shrink-0" aria-hidden="true" />
          <span className="line-clamp-2 break-words">{buttonText || DEFAULT_BUTTON_TEXTS[0]}</span>
        </span>
      </div>
    </div>
  );
}

/** Link do story (WhatsApp do cliente) e o texto do botão de chamada para ação. */
export default function StoryLinkFields({
  item, link, onLinkChange, buttonText, onButtonTextChange, buttonTexts, onEditClientLink, disabled = false,
}: Props) {
  const options = buttonTexts?.length ? buttonTexts : DEFAULT_BUTTON_TEXTS;
  const custom = !options.includes(buttonText);

  return (
    <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3">
      <StoryLinkPreview item={item} buttonText={buttonText} />
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="story-link" className="text-xs">Link</Label>
            {onEditClientLink && (
              <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground" onClick={onEditClientLink}>
                <Settings2 size={12} /> Link do cliente
              </Button>
            )}
          </div>
          <Input
            id="story-link"
            value={link}
            onChange={(e) => onLinkChange(e.target.value)}
            placeholder="https://"
            className="h-8 text-xs"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Botão</Label>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Texto do botão">
            {options.map((text) => (
              <button
                key={text}
                type="button"
                role="radio"
                aria-checked={buttonText === text}
                disabled={disabled}
                onClick={() => onButtonTextChange(text)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:opacity-60',
                  buttonText === text ? 'border-amber-500 bg-amber-500 text-white shadow-sm' : 'border-border bg-card text-muted-foreground hover:border-amber-400/60 hover:text-foreground',
                )}
              >
                {text}
              </button>
            ))}
          </div>
          <Input
            value={custom ? buttonText : ''}
            onChange={(e) => onButtonTextChange(e.target.value.slice(0, 40))}
            placeholder="Outro texto"
            aria-label="Outro texto do botão"
            className={cn('h-8 text-xs', custom && buttonText && 'border-amber-500')}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

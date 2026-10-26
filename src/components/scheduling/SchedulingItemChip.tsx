import { forwardRef, type HTMLAttributes } from 'react';
import { Facebook, Instagram, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SchedulingItem } from '@/lib/postingSchedule';
import MaterialThumb from './MaterialThumb';
import { STATE_STYLES, TYPE_STYLES } from './schedulingStyles';

export function StateBadge({ state, className }: { state: SchedulingItem['state']; className?: string }) {
  const s = STATE_STYLES[state];
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-medium', s.badge, className)}>
      <Icon size={10} className={cn('shrink-0', s.spin && 'animate-spin')} aria-hidden="true" />
      {s.label}
    </span>
  );
}

function PlatformIcons({ item }: { item: SchedulingItem }) {
  const platform = item.post?.platform || (item.platform_label?.toLowerCase().includes('facebook')
    ? (item.platform_label.toLowerCase().includes('instagram') ? 'both' : 'facebook')
    : item.platform_label ? 'instagram' : null);
  if (!platform) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground">
      {(platform === 'instagram' || platform === 'both') && <Instagram size={11} aria-label="Instagram" />}
      {(platform === 'facebook' || platform === 'both') && <Facebook size={11} aria-label="Facebook" />}
    </span>
  );
}

interface Props extends HTMLAttributes<HTMLDivElement> {
  item: SchedulingItem;
  variant?: 'compact' | 'card';
  dragging?: boolean;
}

/** Item do calendário: miniatura, título, hora e estado, com a borda na cor do tipo. */
const SchedulingItemChip = forwardRef<HTMLDivElement, Props>(({ item, variant = 'compact', dragging, className, ...rest }, ref) => {
  const type = TYPE_STYLES[item.type] || TYPE_STYLES.feed;
  const locked = item.locked || item.ghost;
  const time = item.when?.time || '--:--';

  if (variant === 'compact') {
    return (
      <div
        ref={ref}
        {...rest}
        title={`${time} · ${item.title} · ${STATE_STYLES[item.state].label}`}
        className={cn(
          'group flex w-full min-w-0 items-center gap-1.5 rounded-md border border-l-[3px] border-border/70 bg-card px-1 py-0.5 text-left shadow-sm transition-shadow',
          type.border,
          item.ghost && 'opacity-50',
          dragging ? 'shadow-lg ring-2 ring-primary/40' : 'hover:shadow-md',
          className,
        )}
      >
        <MaterialThumb item={item} className="h-6 w-6 rounded" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className={cn('truncate text-[11px] font-medium text-foreground', item.ghost && 'line-through')}>{item.title}</div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="tabular-nums">{time}</span>
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stateDot(item.state))} aria-hidden="true" />
            {item.mode === 'manual' && item.state !== 'publicado' && <span>manual</span>}
            {locked && item.state === 'publicado' && <Lock size={9} aria-hidden="true" />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        'group flex w-full min-w-0 gap-2 rounded-lg border border-l-4 border-border/70 bg-card p-1.5 text-left shadow-sm transition-shadow',
        type.border,
        item.ghost && 'opacity-55',
        dragging ? 'shadow-xl ring-2 ring-primary/40' : 'hover:shadow-md',
        className,
      )}
    >
      <MaterialThumb item={item} videoFrame className="h-12 w-12" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className={cn('line-clamp-2 text-xs font-semibold leading-snug text-foreground', item.ghost && 'line-through')}>{item.title}</div>
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{time}</span>
          <span className={cn('rounded px-1 font-medium', type.soft, type.text)}>{type.label}</span>
          <PlatformIcons item={item} />
        </div>
        <StateBadge state={item.state} />
      </div>
    </div>
  );
});
SchedulingItemChip.displayName = 'SchedulingItemChip';

function stateDot(state: SchedulingItem['state']): string {
  switch (state) {
    case 'agendado': return 'bg-blue-500';
    case 'manual': return 'bg-slate-400';
    case 'publicando': return 'bg-indigo-500 animate-pulse';
    case 'publicado': return 'bg-emerald-500';
    case 'erro': return 'bg-destructive';
    case 'cancelado': return 'bg-muted-foreground/40';
    default: return 'bg-muted-foreground/40';
  }
}

export default SchedulingItemChip;

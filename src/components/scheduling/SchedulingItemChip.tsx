import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Bell, BellRing, CheckCircle2, Facebook, Instagram, Lock, Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { storyBadge, type SchedulingItem, type StoryBadge } from '@/lib/postingSchedule';
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

const STORY_BADGES: Record<StoryBadge, { label: string; icon: typeof Bell; badge: string; dot: string }> = {
  lembrete: { label: 'Lembrete', icon: BellRing, badge: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  avisado: { label: 'Avisado', icon: Bell, badge: 'border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  postado: { label: 'Postado', icon: CheckCircle2, badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
};

/** Selo do story com link (Lembrete, Avisado, Postado); sem lembrete, mostra o fallback. */
export function StoryBadgePill({ item, fallback = null, className }: {
  item: Pick<SchedulingItem, 'post' | 'state'>; fallback?: ReactNode; className?: string;
}) {
  const badge = storyBadge(item);
  if (!badge) return <>{fallback}</>;
  const s = STORY_BADGES[badge];
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold', s.badge, className)}>
      <Icon size={10} className="shrink-0" aria-hidden="true" />
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

function SeriesMark({ item, size = 10 }: { item: SchedulingItem; size?: number }) {
  if (!item.series) return null;
  return <Repeat2 size={size} className="shrink-0 text-pink-600 dark:text-pink-400" aria-label={item.series.label} />;
}

interface Props extends HTMLAttributes<HTMLDivElement> {
  item: SchedulingItem;
  variant?: 'compact' | 'card' | 'tile';
  dragging?: boolean;
}

/** Item do calendário: miniatura, título, hora e estado, com a borda na cor do tipo. */
const SchedulingItemChip = forwardRef<HTMLDivElement, Props>(({ item, variant = 'compact', dragging, className, ...rest }, ref) => {
  const type = TYPE_STYLES[item.type] || TYPE_STYLES.feed;
  const locked = item.locked || item.ghost;
  const time = item.when?.time || '--:--';
  const badge = storyBadge(item);
  const stateLabel = badge ? STORY_BADGES[badge].label : STATE_STYLES[item.state].label;
  const virtual = item.virtual;

  if (variant === 'compact') {
    return (
      <div
        ref={ref}
        {...rest}
        title={`${time} · ${item.title} · ${stateLabel}${item.series ? ` · ${item.series.label}` : ''}`}
        className={cn(
          'group flex w-full min-w-0 items-center gap-1.5 rounded-md border border-l-[3px] border-border/70 bg-card px-1 py-0.5 text-left shadow-sm transition-shadow',
          type.border,
          item.ghost && 'opacity-50',
          virtual && 'border-dashed opacity-70 shadow-none',
          dragging ? 'shadow-lg ring-2 ring-primary/40' : 'hover:shadow-md',
          className,
        )}
      >
        <MaterialThumb item={item} className="h-6 w-6 rounded" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className={cn('truncate text-[11px] font-medium text-foreground', item.ghost && 'line-through')}>{item.title}</div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="tabular-nums">{time}</span>
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', badge ? STORY_BADGES[badge].dot : stateDot(item.state))} aria-hidden="true" />
            {badge && badge !== 'postado' && <BellRing size={9} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />}
            <SeriesMark item={item} size={9} />
            {item.mode === 'manual' && item.state !== 'publicado' && <span>manual</span>}
            {locked && !virtual && item.state === 'publicado' && <Lock size={9} aria-hidden="true" />}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'tile') {
    return (
      <div
        ref={ref}
        {...rest}
        className={cn(
          'group w-full min-w-0 overflow-hidden rounded-lg border border-t-4 border-border/70 bg-card text-left shadow-sm transition-shadow',
          type.top,
          item.ghost && 'opacity-55',
          virtual && 'border-dashed opacity-70 shadow-none',
          dragging ? 'shadow-xl ring-2 ring-primary/40' : 'hover:shadow-md',
          className,
        )}
      >
        <MaterialThumb item={item} videoFrame className="h-20 w-full rounded-none" />
        <div className="space-y-1 p-1.5">
          <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
            <span className="text-xs font-bold tabular-nums text-foreground">{time}</span>
            <span className="flex items-center gap-1"><SeriesMark item={item} /><PlatformIcons item={item} /></span>
          </div>
          <div className={cn('line-clamp-2 text-[11px] font-semibold leading-snug text-foreground', item.ghost && 'line-through')}>{item.title}</div>
          <StoryBadgePill item={item} fallback={<StateBadge state={item.state} />} />
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
        virtual && 'border-dashed opacity-70 shadow-none',
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
          {item.series && <span className="inline-flex items-center gap-0.5 text-pink-700 dark:text-pink-300"><SeriesMark item={item} />{item.series.label}</span>}
        </div>
        <StoryBadgePill item={item} fallback={<StateBadge state={item.state} />} />
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

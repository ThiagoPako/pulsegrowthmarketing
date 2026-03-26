import { Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface DeadlineBadgeProps {
  deadline: string;
  label?: string;
  startedAt?: string | null;
}

export function getDeadlineInfo(deadline: string | null) {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const diffMs = dl.getTime() - now.getTime();
  const isExpired = diffMs <= 0;
  const hours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
  const mins = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));

  const timeStr = isExpired
    ? `Expirado há ${hours}h${mins}m`
    : hours > 0 ? `${hours}h${mins}m restantes` : `${mins}m restantes`;

  const variant: 'expired' | 'warning' | 'normal' = isExpired
    ? 'expired'
    : diffMs < 2 * 60 * 60 * 1000
      ? 'warning'
      : 'normal';

  return { timeStr, variant, isExpired, hours, mins, diffMs };
}

export function getDeadlineProgress(startedAt: string | null | undefined, deadline: string | null): number {
  if (!startedAt || !deadline) return 0;
  const start = new Date(startedAt).getTime();
  const end = new Date(deadline).getTime();
  const now = Date.now();
  const total = end - start;
  if (total <= 0) return 100;
  const elapsed = now - start;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export default function DeadlineBadge({ deadline, label, startedAt }: DeadlineBadgeProps) {
  const info = getDeadlineInfo(deadline);
  if (!info) return null;

  const progress = startedAt ? getDeadlineProgress(startedAt, deadline) : null;

  const barColor = info.variant === 'expired'
    ? '[&>div]:bg-red-500'
    : info.variant === 'warning'
      ? '[&>div]:bg-orange-500'
      : '[&>div]:bg-emerald-500';

  return (
    <div className="w-full space-y-0.5">
      <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
        info.variant === 'expired'
          ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/40 dark:text-red-300 animate-pulse'
          : info.variant === 'warning'
            ? 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
            : 'bg-muted text-muted-foreground border border-border'
      }`}>
        <Clock size={9} />
        {label && <span>{label}:</span>}
        {info.timeStr}
        {progress !== null && <span className="ml-0.5">({progress}%)</span>}
      </span>
      {progress !== null && (
        <Progress value={progress} className={`h-1.5 w-full bg-muted/50 ${barColor}`} />
      )}
    </div>
  );
}

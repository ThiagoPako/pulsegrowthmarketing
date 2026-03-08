import { Clock } from 'lucide-react';

interface DeadlineBadgeProps {
  deadline: string;
  label?: string;
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

export default function DeadlineBadge({ deadline, label }: DeadlineBadgeProps) {
  const info = getDeadlineInfo(deadline);
  if (!info) return null;

  return (
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
    </span>
  );
}

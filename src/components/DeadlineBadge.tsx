import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface DeadlineBadgeProps {
  deadline: string;
  label?: string;
  startedAt?: string | null;
  totalHours?: number;
}

/**
 * Count how many weekend milliseconds exist between two dates.
 * Weekend = Friday 23:59 → Sunday 23:59 (exactly 48 hours per weekend).
 */
function getWeekendMsBetween(from: Date, to: Date): number {
  if (from >= to) return 0;

  const WEEKEND_MS = 48 * 60 * 60 * 1000; // 48h
  const FRIDAY_PAUSE_MINUTE = 23 * 60 + 59; // 23:59 in minutes
  const SUNDAY_RESUME_MINUTE = 23 * 60 + 59; // 23:59 in minutes

  let weekendMs = 0;
  const start = new Date(from);
  const end = new Date(to);

  // Walk through each day between from and to
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);

  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0=Sun, 5=Fri, 6=Sat

    if (dayOfWeek === 5) {
      // Friday — weekend starts at 23:59
      const weekendStart = new Date(current);
      weekendStart.setHours(23, 59, 0, 0);

      const weekendEnd = new Date(current);
      weekendEnd.setDate(weekendEnd.getDate() + 2); // Sunday
      weekendEnd.setHours(23, 59, 0, 0);

      // Clamp to [from, to]
      const effectiveStart = weekendStart < start ? start : weekendStart;
      const effectiveEnd = weekendEnd > end ? end : weekendEnd;

      if (effectiveStart < effectiveEnd) {
        weekendMs += effectiveEnd.getTime() - effectiveStart.getTime();
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return weekendMs;
}

/** Check if we're currently in a weekend pause period (Fri 23:59 → Sun 23:59) */
function isInWeekendPause(date: Date): boolean {
  const day = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();

  // Saturday all day
  if (day === 6) return true;
  // Sunday before 23:59
  if (day === 0 && minutes < 23 * 60 + 59) return true;
  // Friday after 23:59
  if (day === 5 && minutes >= 23 * 60 + 59) return true;

  return false;
}

export function getDeadlineInfo(deadline: string | null) {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);

  // If currently in weekend pause, deadline countdown is frozen
  const paused = isInWeekendPause(now);

  // Calculate raw diff minus weekend time
  const rawDiffMs = dl.getTime() - now.getTime();
  const weekendMs = rawDiffMs > 0
    ? getWeekendMsBetween(now, dl)
    : getWeekendMsBetween(dl, now);

  const businessDiffMs = rawDiffMs > 0
    ? rawDiffMs - weekendMs
    : rawDiffMs + weekendMs; // negative means expired, add back weekend time

  const isExpired = paused ? false : businessDiffMs <= 0;
  const absDiff = Math.abs(businessDiffMs);
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const mins = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));

  let timeStr: string;
  if (paused) {
    // Show remaining time frozen
    const remainMs = Math.max(0, rawDiffMs - weekendMs);
    const rH = Math.floor(remainMs / (1000 * 60 * 60));
    const rM = Math.floor((remainMs % (1000 * 60 * 60)) / (1000 * 60));
    timeStr = `⏸ ${rH}h${rM}m (fim de semana)`;
  } else if (isExpired) {
    timeStr = `Expirado há ${hours}h${mins}m`;
  } else {
    timeStr = hours > 0 ? `${hours}h${mins}m restantes` : `${mins}m restantes`;
  }

  const variant: 'expired' | 'warning' | 'normal' = isExpired
    ? 'expired'
    : (businessDiffMs < 2 * 60 * 60 * 1000 && !paused)
      ? 'warning'
      : 'normal';

  return { timeStr, variant, isExpired, hours, mins, diffMs: businessDiffMs };
}

export function getDeadlineProgress(startedAt: string | null | undefined, deadline: string | null, totalHours?: number): number {
  if (!deadline) return 0;
  const end = new Date(deadline).getTime();
  const now = Date.now();

  if (totalHours && totalHours > 0) {
    // totalHours is in BUSINESS hours, so total ms excludes weekends
    const totalMs = totalHours * 60 * 60 * 1000;
    const start = end - totalMs; // approximate start (raw)

    // Calculate business elapsed (subtract weekend time from elapsed)
    const rawElapsed = now - start;
    const weekendElapsed = getWeekendMsBetween(new Date(start), new Date(now));
    const businessElapsed = rawElapsed - weekendElapsed;

    // Total business duration also needs adjustment
    const weekendInTotal = getWeekendMsBetween(new Date(start), new Date(end));
    const businessTotal = (end - start) - weekendInTotal;

    if (businessTotal <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((businessElapsed / businessTotal) * 100)));
  }

  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const total = end - start;
  if (total <= 0) return 100;

  const rawElapsed = now - start;
  const weekendElapsed = getWeekendMsBetween(new Date(start), new Date(now));
  const businessElapsed = rawElapsed - weekendElapsed;

  const weekendInTotal = getWeekendMsBetween(new Date(start), new Date(end));
  const businessTotal = total - weekendInTotal;

  if (businessTotal <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((businessElapsed / businessTotal) * 100)));
}

export default function DeadlineBadge({ deadline, label, startedAt, totalHours }: DeadlineBadgeProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Force recalculation every tick
  void tick;

  const info = getDeadlineInfo(deadline);
  if (!info) return null;

  const progress = getDeadlineProgress(startedAt, deadline, totalHours);

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
        {progress > 0 && <span className="ml-0.5">({progress}%)</span>}
      </span>
      {progress > 0 && (
        <Progress value={progress} className={`h-1.5 w-full bg-muted/50 ${barColor}`} />
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Clock, Flame, Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

  let weekendMs = 0;
  const start = new Date(from);
  const end = new Date(to);

  const current = new Date(start);
  current.setHours(0, 0, 0, 0);

  while (current <= end) {
    const dayOfWeek = current.getDay();

    if (dayOfWeek === 5) {
      const weekendStart = new Date(current);
      weekendStart.setHours(23, 59, 0, 0);

      const weekendEnd = new Date(current);
      weekendEnd.setDate(weekendEnd.getDate() + 2);
      weekendEnd.setHours(23, 59, 0, 0);

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

function isInWeekendPause(date: Date): boolean {
  const day = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (day === 6) return true;
  if (day === 0 && minutes < 23 * 60 + 59) return true;
  if (day === 5 && minutes >= 23 * 60 + 59) return true;
  return false;
}

export function getDeadlineInfo(deadline: string | null) {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);

  const paused = isInWeekendPause(now);
  const rawDiffMs = dl.getTime() - now.getTime();
  const weekendMs = rawDiffMs > 0
    ? getWeekendMsBetween(now, dl)
    : getWeekendMsBetween(dl, now);

  const businessDiffMs = rawDiffMs > 0
    ? rawDiffMs - weekendMs
    : rawDiffMs + weekendMs;

  const isExpired = paused ? false : businessDiffMs <= 0;
  const absDiff = Math.abs(businessDiffMs);
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const mins = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));

  let timeStr: string;
  if (paused) {
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

  let start: number;
  if (startedAt) {
    start = new Date(startedAt).getTime();
  } else if (totalHours && totalHours > 0) {
    start = end - totalHours * 60 * 60 * 1000;
  } else {
    return 0;
  }

  if (now <= start) return 0;
  if (now >= end) return 100;

  const total = end - start;
  if (total <= 0) return 100;

  const rawElapsed = now - start;
  const weekendElapsed = getWeekendMsBetween(new Date(start), new Date(now));
  const businessElapsed = Math.max(0, rawElapsed - weekendElapsed);

  const weekendInTotal = getWeekendMsBetween(new Date(start), new Date(end));
  const businessTotal = Math.max(1, total - weekendInTotal);

  return Math.min(100, Math.max(0, Math.round((businessElapsed / businessTotal) * 100)));
}

/**
 * Returns a detailed audit object with every input and intermediate value
 * used in the deadline calculation. Used by the audit popover UI.
 */
export function getDeadlineAudit(startedAt: string | null | undefined, deadline: string | null, totalHours?: number) {
  if (!deadline) return null;
  const end = new Date(deadline);
  const now = new Date();

  let start: Date | null = null;
  let startSource: 'startedAt' | 'totalHours-fallback' | 'none' = 'none';
  if (startedAt) {
    start = new Date(startedAt);
    startSource = 'startedAt';
  } else if (totalHours && totalHours > 0) {
    start = new Date(end.getTime() - totalHours * 60 * 60 * 1000);
    startSource = 'totalHours-fallback';
  }

  const fmt = (d: Date | null) => d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const fmtMs = (ms: number) => {
    const abs = Math.abs(ms);
    const h = Math.floor(abs / 3_600_000);
    const m = Math.floor((abs % 3_600_000) / 60_000);
    return `${ms < 0 ? '-' : ''}${h}h${m}m`;
  };

  const rawTotalMs = start ? end.getTime() - start.getTime() : 0;
  const rawElapsedMs = start ? now.getTime() - start.getTime() : 0;
  const weekendInTotalMs = start ? getWeekendMsBetween(start, end) : 0;
  const weekendElapsedMs = start ? getWeekendMsBetween(start, now) : 0;
  const businessTotalMs = Math.max(0, rawTotalMs - weekendInTotalMs);
  const businessElapsedMs = Math.max(0, rawElapsedMs - weekendElapsedMs);
  const businessRemainingMs = Math.max(0, businessTotalMs - businessElapsedMs);
  const progress = getDeadlineProgress(startedAt, deadline, totalHours);
  const paused = isInWeekendPause(now);

  return {
    startedAtRaw: startedAt ?? null,
    deadlineRaw: deadline,
    totalHoursParam: totalHours ?? null,
    startSource,
    startFormatted: fmt(start),
    endFormatted: fmt(end),
    nowFormatted: fmt(now),
    rawTotalStr: fmtMs(rawTotalMs),
    rawElapsedStr: fmtMs(rawElapsedMs),
    weekendInTotalStr: fmtMs(weekendInTotalMs),
    weekendElapsedStr: fmtMs(weekendElapsedMs),
    businessTotalStr: fmtMs(businessTotalMs),
    businessElapsedStr: fmtMs(businessElapsedMs),
    businessRemainingStr: fmtMs(businessRemainingMs),
    progress,
    paused,
  };
}

export default function DeadlineBadge({ deadline, label, startedAt, totalHours }: DeadlineBadgeProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  void tick;

  const info = getDeadlineInfo(deadline);
  if (!info) return null;

  const progress = getDeadlineProgress(startedAt, deadline, totalHours);
  const audit = getDeadlineAudit(startedAt, deadline, totalHours);

  const barColor = info.variant === 'expired'
    ? '[&>div]:bg-red-500'
    : info.variant === 'warning'
      ? '[&>div]:bg-orange-500'
      : '[&>div]:bg-emerald-500';

  return (
    <div className={`w-full space-y-0.5 ${info.isExpired ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-1">
        <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${
          info.variant === 'expired'
            ? 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/40 dark:text-red-300'
            : info.variant === 'warning'
              ? 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
              : 'bg-muted text-muted-foreground border border-border'
        }`}>
          {info.isExpired ? <Flame size={10} className="text-red-600 animate-bounce" /> : <Clock size={9} />}
          {label && <span>{label}:</span>}
          {info.timeStr}
          {progress > 0 && <span className="ml-0.5">({progress}%)</span>}
          {info.isExpired && <Flame size={10} className="text-orange-500 animate-bounce" />}
        </span>
        {audit && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Auditoria do prazo"
                title="Ver detalhes do cálculo de prazo"
              >
                <Info size={10} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="top"
              className="w-80 p-3 text-[11px] space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-semibold text-xs flex items-center gap-1.5 pb-1.5 border-b border-border">
                <Info size={12} /> Auditoria do prazo
              </div>

              <div className="space-y-1">
                <div className="font-medium text-muted-foreground uppercase text-[9px] tracking-wider">Entradas</div>
                <Row k="startedAt" v={audit.startedAtRaw ?? '— (ausente)'} mono />
                <Row k="deadline" v={audit.deadlineRaw} mono />
                <Row k="totalHours" v={audit.totalHoursParam !== null ? `${audit.totalHoursParam}h` : '—'} />
                <Row k="origem do início" v={
                  audit.startSource === 'startedAt' ? '✅ startedAt real'
                  : audit.startSource === 'totalHours-fallback' ? '⚠️ fallback (deadline − totalHours)'
                  : '❌ nenhum'
                } />
              </div>

              <div className="space-y-1">
                <div className="font-medium text-muted-foreground uppercase text-[9px] tracking-wider">Datas calculadas</div>
                <Row k="início" v={audit.startFormatted} />
                <Row k="agora" v={audit.nowFormatted} />
                <Row k="fim (deadline)" v={audit.endFormatted} />
              </div>

              <div className="space-y-1">
                <div className="font-medium text-muted-foreground uppercase text-[9px] tracking-wider">Horas comerciais</div>
                <Row k="total bruto" v={audit.rawTotalStr} />
                <Row k="− fins de semana (total)" v={audit.weekendInTotalStr} />
                <Row k="= total comercial" v={audit.businessTotalStr} highlight />
                <Row k="decorrido bruto" v={audit.rawElapsedStr} />
                <Row k="− fins de semana (decorrido)" v={audit.weekendElapsedStr} />
                <Row k="= decorrido comercial" v={audit.businessElapsedStr} highlight />
                <Row k="restante comercial" v={audit.businessRemainingStr} highlight />
              </div>

              <div className="space-y-1 pt-1.5 border-t border-border">
                <Row k="Progresso" v={`${audit.progress}%`} highlight />
                {audit.paused && <div className="text-[10px] text-orange-500">⏸ Cronômetro pausado (fim de semana)</div>}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {progress > 0 && (
        <Progress value={progress} className={`h-1.5 w-full bg-muted/50 ${barColor}`} />
      )}
    </div>
  );
}

function Row({ k, v, mono, highlight }: { k: string; v: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${highlight ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
      <span className="shrink-0">{k}</span>
      <span className={`text-right truncate ${mono ? 'font-mono text-[10px]' : ''} ${highlight ? 'text-foreground' : 'text-foreground/80'}`} title={v}>{v}</span>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Repeat2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatDayLabel } from '@/lib/postingSchedule';
import { WEEKDAY_SHORT, repeatProblem, repeatSummary, upcomingDates, type RepeatDraft } from '@/lib/storySeries';

interface Props {
  value: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
  /** Primeira data (início da repetição) e hora de Brasília */
  startDate: string;
  time: string;
  /** "Este e os próximos": a repetição já existe, sem o liga/desliga */
  forced?: boolean;
  disabled?: boolean;
}

function Pill({ active, onClick, children, disabled, label }: {
  active: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; label?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all disabled:opacity-60',
        active ? 'border-pink-500 bg-pink-500/10 text-pink-700 shadow-sm dark:text-pink-300' : 'border-border text-muted-foreground hover:border-pink-400/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** Repetição do story: a cada N dias ou em dias da semana, com início e fim (data, vezes ou sem fim). */
export default function StorySeriesRepeat({ value, onChange, startDate, time, forced = false, disabled = false }: Props) {
  const set = (patch: Partial<RepeatDraft>) => onChange({ ...value, ...patch });
  const enabled = forced || value.enabled;
  const problem = enabled ? repeatProblem(value, startDate) : null;
  const next = enabled && !problem ? upcomingDates(value, startDate, time, 4) : [];

  const toggleDay = (d: number) => {
    const has = value.weekdays.includes(d);
    set({ weekdays: has ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d].sort((a, b) => a - b) });
  };

  return (
    <div className={cn('rounded-xl border p-3 transition-colors', enabled ? 'border-pink-500/40 bg-pink-500/[0.04]' : 'border-border')}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="story-repeat" className="flex items-center gap-1.5 text-xs font-semibold">
          <Repeat2 size={14} className={enabled ? 'text-pink-600 dark:text-pink-400' : 'text-muted-foreground'} aria-hidden="true" />
          Repetir
        </Label>
        {!forced && (
          <Switch id="story-repeat" checked={value.enabled} onCheckedChange={(checked) => set({ enabled: checked })} disabled={disabled} />
        )}
      </div>

      {enabled && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Como repetir">
            <Pill active={value.kind === 'weekly'} onClick={() => set({ kind: 'weekly' })} disabled={disabled}>Dias da semana</Pill>
            <Pill active={value.kind === 'interval'} onClick={() => set({ kind: 'interval' })} disabled={disabled}>A cada N dias</Pill>
          </div>

          {value.kind === 'weekly' ? (
            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Dias da semana">
              {WEEKDAY_SHORT.map((label, d) => {
                const active = value.weekdays.includes(d);
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={() => toggleDay(d)}
                    className={cn(
                      'h-9 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-60',
                      active ? 'border-pink-500 bg-pink-500 text-white shadow-sm' : 'border-border text-muted-foreground hover:border-pink-400/60',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">A cada</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                value={Number.isFinite(value.interval_days) ? value.interval_days : ''}
                onChange={(e) => set({ interval_days: Math.round(Number(e.target.value)) })}
                className="h-8 w-16 text-center"
                aria-label="Número de dias"
                disabled={disabled}
              />
              <span className="text-muted-foreground">dias</span>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Fim</div>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Fim da repetição">
              <Pill active={value.end_kind === 'never'} onClick={() => set({ end_kind: 'never' })} disabled={disabled}>Sem fim</Pill>
              <Pill active={value.end_kind === 'date'} onClick={() => set({ end_kind: 'date' })} disabled={disabled}>Até</Pill>
              <Pill active={value.end_kind === 'count'} onClick={() => set({ end_kind: 'count' })} disabled={disabled}>Vezes</Pill>
              {value.end_kind === 'date' && (
                <Input
                  type="date"
                  value={value.end_date}
                  min={startDate}
                  onChange={(e) => set({ end_date: e.target.value })}
                  className="h-8 w-auto min-w-[140px] text-xs"
                  aria-label="Data do fim"
                  disabled={disabled}
                />
              )}
              {value.end_kind === 'count' && (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={Number.isFinite(value.max_count) ? value.max_count : ''}
                  onChange={(e) => set({ max_count: Math.round(Number(e.target.value)) })}
                  className="h-8 w-20 text-center text-xs"
                  aria-label="Número de vezes"
                  disabled={disabled}
                />
              )}
            </div>
          </div>

          <div className="rounded-lg bg-card/80 px-2.5 py-2 text-[11px] leading-relaxed">
            {problem ? (
              <span className="text-destructive">{problem}</span>
            ) : (
              <>
                <div className="font-semibold text-foreground">{repeatSummary(value, time)}</div>
                {next.length > 0 && (
                  <div className="text-muted-foreground">{next.map((d) => formatDayLabel(d)).join(' · ')}{next.length === 4 ? ' …' : ''}</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

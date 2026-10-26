import { useMemo } from 'react';
import { Draggable, Droppable, type DraggableProvided } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import {
  canDrag, formatDayLabel, groupByDate, isWeekendKey, monthGridKeys, sameMonth, weekKeys, type SchedulingItem,
} from '@/lib/postingSchedule';
import SchedulingItemChip from './SchedulingItemChip';
import { TYPE_STYLES } from './schedulingStyles';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTH_VISIBLE = 3;

interface Props {
  view: 'month' | 'week';
  /** Mês (AAAA-MM-01) ou um dia da semana mostrada */
  anchor: string;
  today: string;
  items: SchedulingItem[];
  compact: boolean;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  onItemClick: (item: SchedulingItem) => void;
  onShowWeek: (day: string) => void;
}

function DraggableItem({ item, index, variant, onItemClick }: {
  item: SchedulingItem; index: number; variant: 'compact' | 'card'; onItemClick: (item: SchedulingItem) => void;
}) {
  return (
    <Draggable draggableId={item.key} index={index} isDragDisabled={!canDrag(item)}>
      {(provided, snapshot) => (
        <SchedulingItemChip
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          item={item}
          variant={variant}
          dragging={snapshot.isDragging}
          role="button"
          tabIndex={0}
          aria-label={`${item.title}, ${item.when?.time || 'sem hora'}`}
          onClick={() => onItemClick(item)}
          onKeyDown={(e) => { if (e.key === 'Enter') onItemClick(item); }}
          className={cn(canDrag(item) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer')}
        />
      )}
    </Draggable>
  );
}

function cloneRenderer(byKey: Map<string, SchedulingItem>, variant: 'compact' | 'card') {
  // O item arrastado vai para fora da célula (a célula corta o que passa da borda)
  return (provided: DraggableProvided, _snapshot: unknown, rubric: { draggableId: string }) => {
    const item = byKey.get(rubric.draggableId);
    return (
      <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
        {item && <SchedulingItemChip item={item} variant={variant} dragging />}
      </div>
    );
  };
}

function DayNumber({ day, today }: { day: string; today: string }) {
  const n = Number(day.slice(8, 10));
  return (
    <span
      className={cn(
        'grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold tabular-nums',
        day === today ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground',
      )}
    >
      {n}
    </span>
  );
}

export default function SchedulingCalendar({
  view, anchor, today, items, compact, selectedDay, onSelectDay, onItemClick, onShowWeek,
}: Props) {
  const byDate = useMemo(() => groupByDate(items), [items]);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  if (view === 'week') {
    const days = weekKeys(anchor);
    return (
      <div className={cn(compact ? 'space-y-2' : 'grid grid-cols-7 gap-2')}>
        {days.map((day) => {
          const list = byDate.get(day) || [];
          const weekend = isWeekendKey(day);
          return (
            <section
              key={day}
              aria-label={formatDayLabel(day)}
              className={cn(
                'flex min-w-0 flex-col rounded-xl border border-border bg-card/60',
                weekend && 'bg-muted/40',
                day === today && 'border-primary/60 ring-1 ring-primary/30',
              )}
            >
              <header className={cn('flex items-center justify-between gap-1 border-b border-border/60 px-2 py-1.5', weekend && 'text-muted-foreground')}>
                <span className="text-[11px] font-semibold uppercase tracking-wide">{formatDayLabel(day).split(' ')[0]}</span>
                <div className="flex items-center gap-1">
                  {list.length > 0 && <span className="text-[10px] text-muted-foreground">{list.length}</span>}
                  <DayNumber day={day} today={today} />
                </div>
              </header>
              <Droppable droppableId={`day:${day}`} renderClone={cloneRenderer(byKey, 'card')}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'flex flex-1 flex-col gap-1.5 p-1.5 transition-colors',
                      compact ? 'min-h-[56px]' : 'min-h-[180px]',
                      snapshot.isDraggingOver && 'rounded-b-xl bg-primary/10',
                    )}
                  >
                    {list.map((item, index) => (
                      <DraggableItem key={item.key} item={item} index={index} variant="card" onItemClick={onItemClick} />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </section>
          );
        })}
      </div>
    );
  }

  const days = monthGridKeys(anchor);

  // Celular: grade só com pontos; o dia tocado lista os itens embaixo.
  if (compact) {
    const dayItems = selectedDay ? byDate.get(selectedDay) || [] : [];
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cn('py-1 text-[10px] font-semibold uppercase text-muted-foreground', i >= 5 && 'text-muted-foreground/70')}>{w[0]}</div>
          ))}
          {days.map((day) => {
            const list = byDate.get(day) || [];
            const outside = !sameMonth(day, anchor);
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectDay(day)}
                aria-pressed={selectedDay === day}
                aria-label={`${formatDayLabel(day)}: ${list.length}`}
                className={cn(
                  'flex min-h-[52px] flex-col items-center gap-1 rounded-lg border border-transparent p-1 transition-colors',
                  isWeekendKey(day) && 'bg-muted/40',
                  outside && 'opacity-40',
                  selectedDay === day && 'border-primary bg-primary/10',
                )}
              >
                <DayNumber day={day} today={today} />
                <div className="flex flex-wrap justify-center gap-0.5">
                  {list.slice(0, 4).map((item) => (
                    <span
                      key={item.key}
                      className={cn('h-1.5 w-1.5 rounded-full', (TYPE_STYLES[item.type] || TYPE_STYLES.feed).dot, item.ghost && 'opacity-30')}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        {selectedDay && (
          <div className="space-y-1.5 rounded-xl border border-border bg-card p-2">
            <div className="px-1 text-xs font-semibold capitalize text-muted-foreground">{formatDayLabel(selectedDay)}</div>
            {dayItems.length === 0 ? (
              <div className="px-1 py-3 text-center text-xs text-muted-foreground">—</div>
            ) : (
              dayItems.map((item) => (
                <SchedulingItemChip key={item.key} item={item} variant="card" role="button" tabIndex={0} onClick={() => onItemClick(item)} className="cursor-pointer" />
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-border">
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={cn('bg-muted/60 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', i >= 5 && 'bg-muted')}
          >
            {w}
          </div>
        ))}
        {days.map((day) => {
          const list = byDate.get(day) || [];
          const outside = !sameMonth(day, anchor);
          const hidden = Math.max(0, list.length - MONTH_VISIBLE);
          return (
            <Droppable key={day} droppableId={`day:${day}`} renderClone={cloneRenderer(byKey, 'compact')}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'flex min-h-[124px] min-w-0 flex-col gap-1 bg-card p-1.5 transition-colors',
                    isWeekendKey(day) && 'bg-muted/40',
                    outside && 'bg-muted/60 [&>*]:opacity-60',
                    day === today && 'bg-primary/5 shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.55)]',
                    snapshot.isDraggingOver && 'bg-primary/10 shadow-[inset_0_0_0_2px_hsl(var(--primary)/0.6)]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <DayNumber day={day} today={today} />
                    {list.length > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{list.length}</span>}
                  </div>
                  {list.slice(0, MONTH_VISIBLE).map((item, index) => (
                    <DraggableItem key={item.key} item={item} index={index} variant="compact" onItemClick={onItemClick} />
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => onShowWeek(day)}
                      className="rounded px-1 text-left text-[10px] font-semibold text-primary hover:underline"
                    >
                      +{hidden}
                    </button>
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </div>
  );
}

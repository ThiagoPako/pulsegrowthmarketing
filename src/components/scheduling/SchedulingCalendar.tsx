import { useMemo } from 'react';
import { Draggable, Droppable, type DraggableProvided } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import {
  brtParts, canDrag, formatDayLabel, groupByDate, monthGridKeys, sameMonth, weekKeys, weekdayIndex, type SchedulingItem,
} from '@/lib/postingSchedule';
import type { BestTimeSlot, CalendarEvents } from '@/services/schedulingApi';
import BestTimeBadge, { DayMark, PulseMark, slotTime } from './BestTimeBadge';
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
  /** melhor dia e horário do perfil (só quando a rede tem dado) e o agendar dali */
  bestSlots?: BestTimeSlot[];
  onBestPick?: (day: string, time: string) => void;
  /** feriados e aniversário das cidades das unidades */
  events?: CalendarEvents;
}

type ChipVariant = 'compact' | 'card' | 'tile';

function DraggableItem({ item, index, variant, onItemClick }: {
  item: SchedulingItem; index: number; variant: ChipVariant; onItemClick: (item: SchedulingItem) => void;
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

function cloneRenderer(byKey: Map<string, SchedulingItem>, variant: ChipVariant) {
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
        'grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] font-semibold tabular-nums tracking-tight',
        day === today ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.7)]' : 'text-foreground/80',
      )}
    >
      {n}
    </span>
  );
}

export default function SchedulingCalendar({
  view, anchor, today, items, compact, selectedDay, onSelectDay, onItemClick, onShowWeek, bestSlots = [], onBestPick, events,
}: Props) {
  const byDate = useMemo(() => groupByDate(items), [items]);
  // melhor horário do dia: só de hoje em diante (hoje, só se a hora ainda não passou)
  const nowHour = Number((brtParts(Date.now())?.time || '00:00').slice(0, 2));
  const bestFor = (day: string) => {
    if (!onBestPick || day < today) return null;
    const slot = bestSlots.find((s) => s.weekday === weekdayIndex(day));
    if (!slot || (day === today && slot.hour <= nowHour)) return null;
    return slot;
  };
  const marksFor = (day: string) => {
    const h = (events?.holidays || []).filter((x) => x.date === day);
    const a = (events?.anniversaries || []).filter((x) => x.date === day);
    if (!h.length && !a.length) return null;
    return (
      <div className="flex flex-col gap-0.5">
        {h.map((x) => <DayMark key={x.name} tone={x.kind} title={x.kind === 'facultativo' ? 'Ponto facultativo' : 'Feriado nacional'}>{x.name}</DayMark>)}
        {a.map((x) => (
          <DayMark key={x.city} tone="cidade" title={`Aniversário de ${x.city}${x.years ? ` (${x.years} anos)` : ''} · unidade: ${x.units.join(', ')}${x.art ? ' · arte já pedida ao Design' : ''}`}>
            🎂 {x.city}{x.years ? ` ${x.years} anos` : ''}{x.art ? ' · arte ✓' : ''}
          </DayMark>
        ))}
      </div>
    );
  };
  const hasMark = (day: string) => (events?.holidays || []).some((x) => x.date === day) || (events?.anniversaries || []).some((x) => x.date === day);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  if (view === 'week') {
    const days = weekKeys(anchor);
    return (
      <div className={cn(compact ? 'space-y-2' : 'grid grid-cols-7 gap-2')}>
        {days.map((day) => {
          const list = byDate.get(day) || [];
          return (
            <section
              key={day}
              aria-label={formatDayLabel(day)}
              className={cn(
                'flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card shadow-sm transition-colors hover:border-primary/30',
                day === today && 'border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]',
              )}
            >
              <header className="flex items-center justify-between gap-1 border-b border-border/50 px-2.5 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide">{formatDayLabel(day).split(' ')[0]}</span>
                <div className="flex items-center gap-1">
                  {list.length > 0 && <span className="text-[10px] text-muted-foreground">{list.length}</span>}
                  <DayNumber day={day} today={today} />
                </div>
              </header>
              <Droppable droppableId={`day:${day}`} renderClone={cloneRenderer(byKey, compact ? 'card' : 'tile')}>
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
                    {marksFor(day)}
                    {(() => { const slot = bestFor(day); return slot && <BestTimeBadge slot={slot} onSchedule={() => onBestPick?.(day, slotTime(slot))} />; })()}
                    {list.map((item, index) => (
                      <DraggableItem key={item.key} item={item} index={index} variant={compact ? 'card' : 'tile'} onItemClick={onItemClick} />
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
            // Cada dia recebe o material arrastado da faixa de não agendados (toque longo e arrastar)
            return (
              <Droppable key={day} droppableId={`day:${day}`}>
                {(provided, snapshot) => (
                  <button
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    type="button"
                    onClick={() => onSelectDay(day)}
                    aria-pressed={selectedDay === day}
                    aria-label={`${formatDayLabel(day)}: ${list.length}`}
                    className={cn(
                      'relative flex min-h-[52px] flex-col items-center gap-1 rounded-lg border border-transparent p-1 transition-colors',
                      outside && 'opacity-40',
                      selectedDay === day && 'border-primary bg-primary/10',
                      snapshot.isDraggingOver && 'border-primary bg-primary/15 ring-2 ring-primary/40',
                    )}
                  >
                    <DayNumber day={day} today={today} />
                    {bestFor(day) && <span className="absolute right-0.5 top-0.5"><PulseMark size={14} /></span>}
                    {hasMark(day) && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-[#8134AF]" />}
                    <div className="flex flex-wrap justify-center gap-0.5">
                      {list.slice(0, 4).map((item) => (
                        <span
                          key={item.key}
                          className={cn('h-1.5 w-1.5 rounded-full', (TYPE_STYLES[item.type] || TYPE_STYLES.feed).dot, (item.ghost || item.virtual) && 'opacity-30')}
                        />
                      ))}
                    </div>
                    <span className="pointer-events-none absolute h-0 w-0 overflow-hidden">{provided.placeholder}</span>
                  </button>
                )}
              </Droppable>
            );
          })}
        </div>
        {selectedDay && (
          <div className="space-y-1.5 rounded-xl border border-border bg-card p-2">
            <div className="px-1 text-xs font-semibold capitalize text-muted-foreground">{formatDayLabel(selectedDay)}</div>
            {marksFor(selectedDay)}
            {(() => { const slot = bestFor(selectedDay); return slot && <BestTimeBadge slot={slot} onSchedule={() => onBestPick?.(selectedDay, slotTime(slot))} />; })()}
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
    <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-muted/30 to-transparent p-2">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 pb-1 pt-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
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
                    'group/day flex min-h-[128px] min-w-0 flex-col gap-1 rounded-xl border border-border/60 bg-card p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 hover:border-primary/30 hover:shadow-md',
                    outside && 'border-transparent bg-transparent shadow-none [&>*]:opacity-40 hover:shadow-none',
                    day === today && 'border-primary/50 bg-primary/[0.04] shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]',
                    snapshot.isDraggingOver && 'border-primary bg-primary/10 shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <DayNumber day={day} today={today} />
                    {list.length > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{list.length}</span>}
                  </div>
                  {!outside && marksFor(day)}
                  {!outside && (() => { const slot = bestFor(day); return slot && <BestTimeBadge slot={slot} compact={list.length >= MONTH_VISIBLE} onSchedule={() => onBestPick?.(day, slotTime(slot))} />; })()}
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

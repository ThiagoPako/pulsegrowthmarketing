import { useMemo } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Hand } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SchedulingItem } from '@/lib/postingSchedule';
import MaterialThumb from './MaterialThumb';
import { TYPE_STYLES } from './schedulingStyles';

interface Props {
  items: SchedulingItem[];
  onPick: (item: SchedulingItem) => void;
}

function Tile({ item, dragging }: { item: SchedulingItem; dragging?: boolean }) {
  const type = TYPE_STYLES[item.type] || TYPE_STYLES.feed;
  return (
    <div
      className={cn(
        'w-[76px] overflow-hidden rounded-lg border border-t-[3px] border-border/70 bg-card text-left shadow-sm',
        type.top,
        dragging && 'shadow-xl ring-2 ring-primary/40',
      )}
    >
      <MaterialThumb item={item} videoFrame className="h-14 w-full rounded-none" />
      <div className="line-clamp-2 px-1 py-0.5 text-[9px] font-semibold leading-tight text-foreground">{item.title}</div>
    </div>
  );
}

/**
 * Celular: os não agendados numa faixa acima do calendário. Segure e arraste até o dia (toque longo);
 * um toque abre o agendamento.
 */
export default function UnscheduledStrip({ items, onPick }: Props) {
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-2">
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-semibold text-muted-foreground">
        <Hand size={12} aria-hidden="true" /> Não agendados
        <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-300">{items.length}</span>
      </div>
      <Droppable
        droppableId="unscheduled"
        direction="horizontal"
        isDropDisabled
        renderClone={(provided, snapshot, rubric) => {
          const item = byKey.get(rubric.draggableId);
          return (
            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
              {item && <Tile item={item} dragging />}
            </div>
          );
        }}
      >
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="flex gap-1.5 overflow-x-auto pb-1">
            {items.map((item, index) => (
              <Draggable key={item.key} draggableId={item.key} index={index}>
                {(drag) => (
                  <div
                    ref={drag.innerRef}
                    {...drag.draggableProps}
                    {...drag.dragHandleProps}
                    role="button"
                    tabIndex={0}
                    aria-label={item.title}
                    onClick={() => onPick(item)}
                    className="shrink-0 touch-manipulation"
                  >
                    <Tile item={item} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

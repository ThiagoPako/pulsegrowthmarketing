import { useMemo, useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Inbox, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { SchedulingItem, SchedulingType } from '@/lib/postingSchedule';
import MaterialThumb from './MaterialThumb';
import { TYPE_STYLES } from './schedulingStyles';

interface Props {
  items: SchedulingItem[];
  onPick: (item: SchedulingItem) => void;
  /**
   * Arrastar para o calendário (só no computador: no celular a lista fica numa aba).
   * A lista não tem rolagem própria: o arrastar só aceita um nível de rolagem (a da página).
   */
  draggable: boolean;
  className?: string;
}

function approvedLabel(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d);
}

function Row({ item, onPick, dragging }: { item: SchedulingItem; onPick: (item: SchedulingItem) => void; dragging?: boolean }) {
  const type = TYPE_STYLES[item.type] || TYPE_STYLES.feed;
  const approved = approvedLabel(item.approved_at);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPick(item)}
      onKeyDown={(e) => { if (e.key === 'Enter') onPick(item); }}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-lg border border-l-4 border-border/70 bg-card p-1.5 text-left transition-all',
        type.border,
        dragging ? 'shadow-xl ring-2 ring-primary/40' : 'hover:-translate-y-px hover:shadow-md',
      )}
    >
      <MaterialThumb item={item} videoFrame className="h-14 w-14" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{item.title}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className={cn('rounded px-1.5 py-px font-medium', type.soft, type.text)}>{type.label}</span>
          {approved && <span>Aprovado {approved}</span>}
        </div>
      </div>
    </div>
  );
}

/** Materiais aprovados do cliente que ainda não têm data de postagem. */
export default function UnscheduledPanel({ items, onPick, draggable, className }: Props) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SchedulingType | 'all'>('all');
  const types = useMemo(() => [...new Set(items.map((i) => i.type))], [items]);
  const normalize = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtered = useMemo(() => items.filter((i) =>
    (type === 'all' || i.type === type) && (!query.trim() || normalize(i.title).includes(normalize(query.trim())))),
  [items, type, query]);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  return (
    <div className={cn('flex min-h-0 flex-col rounded-xl border border-border bg-card', className)}>
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Não agendados</h2>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-700 dark:text-amber-300">{items.length}</span>
        </div>
        {draggable && items.length > 0 && (
          <p className="text-[11px] text-muted-foreground">Arraste até um dia do calendário para agendar.</p>
        )}
        {items.length > 4 && (
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" className="h-8 pl-7 text-xs" aria-label="Buscar material" />
          </div>
        )}
        {types.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {(['all', ...types] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
                  type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {t !== 'all' && <span className={cn('h-1.5 w-1.5 rounded-full', TYPE_STYLES[t].dot)} />}
                {t === 'all' ? 'Todos' : TYPE_STYLES[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
          <Inbox size={28} className="opacity-50" />
          <span className="text-xs">Tudo agendado</span>
        </div>
      ) : draggable ? (
        <Droppable
          droppableId="unscheduled"
          isDropDisabled
          renderClone={(provided, snapshot, rubric) => {
            const item = byKey.get(rubric.draggableId);
            return (
              <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                {item && <Row item={item} onPick={() => {}} dragging />}
              </div>
            );
          }}
        >
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="flex-1 space-y-1.5 p-2">
              {filtered.map((item, index) => (
                <Draggable key={item.key} draggableId={item.key} index={index}>
                  {(drag) => (
                    <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                      <Row item={item} onPick={onPick} />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      ) : (
        <div className="flex-1 space-y-1.5 p-2">
          {filtered.map((item) => <Row key={item.key} item={item} onPick={onPick} />)}
        </div>
      )}
    </div>
  );
}

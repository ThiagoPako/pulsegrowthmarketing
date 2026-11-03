// "Agendar post" no melhor horário (03/11/2026): escolhe o material aprovado que ainda não tem data e abre o agendamento
// já com o dia e a hora do melhor horário.
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDayLabel, type SchedulingItem } from '@/lib/postingSchedule';
import MaterialThumb from './MaterialThumb';
import { PulseMark } from './BestTimeBadge';
import { TYPE_STYLES } from './schedulingStyles';
import { cn } from '@/lib/utils';

export default function BestTimePicker({ pick, items, onPick, onClose }: {
  pick: { day: string; time: string } | null;
  items: SchedulingItem[];
  onPick: (item: SchedulingItem) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!pick} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="flex items-center gap-2 text-base"><PulseMark size={26} /> Agendar no melhor horário</DialogTitle>
          {pick && <p className="text-sm capitalize text-muted-foreground">{formatDayLabel(pick.day)} às {pick.time}</p>}
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto p-3">
          {!items.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum material aprovado sem data. Use a Postagem avulsa para postar outra mídia.</p>
          ) : items.map((item) => {
            const type = TYPE_STYLES[item.type] || TYPE_STYLES.feed;
            return (
              <button key={item.key} type="button" onClick={() => onPick(item)}
                className={cn('flex w-full items-center gap-2.5 rounded-lg border border-l-4 border-border bg-card p-1.5 text-left transition hover:shadow-md', type.border)}>
                <MaterialThumb item={item} videoFrame className="h-12 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs font-semibold">{item.title}</span>
                  <span className={cn('mt-0.5 inline-block rounded px-1.5 py-px text-[10px] font-medium', type.soft, type.text)}>{type.label}</span>
                  {item.author && <span className="ml-1.5 text-[10px] text-muted-foreground">{item.author}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

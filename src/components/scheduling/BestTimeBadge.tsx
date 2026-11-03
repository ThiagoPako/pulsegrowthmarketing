// Melhor dia e horário no calendário (usuário, 03/11/2026: "marque com o símbolo da Pulse pulsando de forma bem leve,
// com características do design do Instagram, já com botão para agendar post"). Anel no degradê do Instagram em volta do
// pulso da Pulse, que respira devagar (parado com "reduzir movimento").
import { CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BestTimeSlot } from '@/services/schedulingApi';

export function PulseMark({ size = 22 }: { size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[1.5px]" style={{ width: size, height: size }}>
      <span className="flex h-full w-full items-center justify-center rounded-full bg-card">
        <svg viewBox="0 0 24 24" className="h-[70%] w-[70%] motion-safe:animate-pulse-beat" aria-hidden>
          <path d="M2 13h4.5l2-5 3.5 10 3-8 1.6 3H22" fill="none" stroke="#F15A24" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}

export const slotTime = (s: BestTimeSlot) => `${String(s.hour).padStart(2, '0')}:00`;

export default function BestTimeBadge({ slot, compact = false, onSchedule }: { slot: BestTimeSlot; compact?: boolean; onSchedule: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSchedule(); }}
      title={`Melhor horário: ${slotTime(slot)} (${slot.reason}). Toque para agendar um post.`}
      className={cn(
        'group flex w-full items-center gap-1.5 rounded-lg border border-[#DD2A7B]/25 bg-gradient-to-r from-[#F58529]/10 via-[#DD2A7B]/10 to-[#8134AF]/10 text-left transition hover:border-[#DD2A7B]/60',
        compact ? 'p-1' : 'px-1.5 py-1',
      )}
    >
      <PulseMark size={compact ? 18 : 22} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[10px] font-semibold text-foreground">Melhor às {slot.hour}h</span>
        {!compact && <span className="flex items-center gap-0.5 text-[10px] font-medium text-[#DD2A7B] group-hover:underline"><CalendarPlus size={10} /> Agendar post</span>}
      </span>
    </button>
  );
}

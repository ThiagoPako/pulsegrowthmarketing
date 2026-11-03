// Melhor dia e horário no calendário (usuário, 03/11/2026: "marque com o símbolo da Pulse pulsando de forma bem leve,
// com características do design do Instagram, já com botão para agendar post"; depois: "melhore a fonte, efeito liquid
// glass estilo Apple"). Vidro: fundo translúcido com desfoque e saturação, borda clara, brilho no topo e reflexo que passa
// ao passar o mouse; o pulso da Pulse no anel do Instagram respira devagar (parado com "reduzir movimento").
import { CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BestTimeSlot } from '@/services/schedulingApi';

export function PulseMark({ size = 22 }: { size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 rounded-full bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[1.5px] shadow-[0_2px_8px_-2px_rgba(221,42,123,0.55)]" style={{ width: size, height: size }}>
      <span className="flex h-full w-full items-center justify-center rounded-full bg-white/90 dark:bg-neutral-950/80">
        <svg viewBox="0 0 24 24" className="h-[70%] w-[70%] motion-safe:animate-pulse-beat" aria-hidden>
          <path d="M2 13h4.5l2-5 3.5 10 3-8 1.6 3H22" fill="none" stroke="#F15A24" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}

export const slotTime = (s: BestTimeSlot) => `${String(s.hour).padStart(2, '0')}:00`;

/** Vidro líquido (fundo translúcido, desfoque, borda e brilho), usado pelas marcas do calendário. */
export const glass = 'relative overflow-hidden border border-white/50 bg-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_6px_18px_-8px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/15 dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_22px_-10px_rgba(0,0,0,0.7)]';
export const appleFont = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif' };

export default function BestTimeBadge({ slot, compact = false, onSchedule }: { slot: BestTimeSlot; compact?: boolean; onSchedule: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSchedule(); }}
      title={`Melhor horário: ${slotTime(slot)} (${slot.reason}). Toque para agendar um post.`}
      className={cn(glass, 'group flex w-full items-center gap-2 rounded-2xl text-left transition duration-300 hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_24px_-10px_rgba(221,42,123,0.55)] active:scale-[0.98]', compact ? 'p-1' : 'px-2 py-1.5')}
      style={appleFont}
    >
      {/* brilho do vidro e o reflexo que passa no hover */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/50 to-transparent dark:from-white/10" />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100 dark:via-white/15" />
      <span aria-hidden className="pointer-events-none absolute -bottom-3 -right-3 h-10 w-10 rounded-full bg-[#DD2A7B]/25 blur-xl" />
      <PulseMark size={compact ? 18 : 24} />
      <span className="relative min-w-0 flex-1 leading-none">
        <span className="flex items-baseline gap-1">
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground tabular-nums">{slot.hour}h</span>
          {!compact && <span className="truncate text-[10px] font-medium text-muted-foreground">melhor horário</span>}
        </span>
        {!compact && (
          <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold text-[#C13584] dark:text-[#F77737]">
            <CalendarPlus size={10} /> Agendar post
          </span>
        )}
      </span>
    </button>
  );
}

/** Feriado e aniversário da cidade: etiqueta de vidro com um ponto de cor. */
export function DayMark({ tone, title, children }: { tone: 'feriado' | 'facultativo' | 'cidade'; title?: string; children: React.ReactNode }) {
  const dot = tone === 'cidade' ? 'bg-[#8134AF]' : tone === 'feriado' ? 'bg-[#E53935]' : 'bg-amber-500';
  return (
    <span title={title} style={appleFont} className={cn(glass, 'flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-[10px] font-medium leading-tight text-foreground')}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

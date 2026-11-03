import { CalendarClock, CheckCircle2, Eye, Hourglass, Send } from 'lucide-react';

// Filtro da equipe no portal (pedido do usuário, 03/11/2026): botões por etapa, na biblioteca e no calendário.

export type PortalStage = 'todos' | 'revisao' | 'cliente' | 'aprovado' | 'agendado' | 'publicado';

/** Etapa de um conteúdo do portal pelo status dele. */
export function stageOf(status: string): Exclude<PortalStage, 'todos'> | null {
  if (status === 'revisao_interna' || status === 'ajuste_solicitado') return 'revisao';
  if (status === 'pendente') return 'cliente';
  if (status === 'aprovado') return 'aprovado';
  if (status === 'agendado') return 'agendado';
  if (status === 'publicado') return 'publicado';
  return null;
}

const STAGES: { value: Exclude<PortalStage, 'todos'>; label: string; icon: typeof Eye; tone: string }[] = [
  { value: 'revisao', label: 'Em revisão', icon: Eye, tone: '#a78bfa' },
  { value: 'cliente', label: 'Aguardando cliente', icon: Hourglass, tone: '#fbbf24' },
  { value: 'aprovado', label: 'Aprovados', icon: CheckCircle2, tone: '#34d399' },
  { value: 'agendado', label: 'Agendados', icon: CalendarClock, tone: '#38bdf8' },
  { value: 'publicado', label: 'Postados', icon: Send, tone: '#f472b6' },
];

export default function PortalStageFilter({ value, onChange, counts }: {
  value: PortalStage;
  onChange: (v: PortalStage) => void;
  counts: Partial<Record<PortalStage, number>>;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }} role="group" aria-label="Filtrar por etapa">
      <button
        type="button"
        onClick={() => onChange('todos')}
        aria-pressed={value === 'todos'}
        className={`flex-none rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${value === 'todos' ? 'border-white/30 bg-white/15 text-white' : 'border-white/10 text-white/55 hover:text-white'}`}
      >
        Todos <span className="ml-0.5 tabular-nums opacity-60">{counts.todos ?? 0}</span>
      </button>
      {STAGES.map(({ value: v, label, icon: Icon, tone }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(on ? 'todos' : v)}
            aria-pressed={on}
            className="flex-none inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors"
            style={on
              ? { background: `${tone}26`, borderColor: `${tone}80`, color: '#fff' }
              : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
          >
            <Icon size={13} style={{ color: tone }} />
            {label}
            <span className="tabular-nums opacity-60">{counts[v] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

import { PauseCircle } from 'lucide-react';

/**
 * ⏸ Aguardando material (31/10/2026): o card não dá para fazer até chegar algo (bruto, projeto em outro computador,
 * resposta do cliente). Vai para o fim da fila dos agentes e não trava o editor de pegar outro card.
 * Sai sozinho quando o link dos brutos chega ou o card deixa Edição/Alteração.
 */
interface Props {
  task: { kanban_column?: string | null; waiting_material_at?: string | null; waiting_material_note?: string | null };
}

export default function WaitingBadge({ task }: Props) {
  if (!task.waiting_material_at || !['edicao', 'alteracao'].includes(String(task.kanban_column))) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-600" title={task.waiting_material_note || undefined}>
      <PauseCircle size={11} className="text-white shrink-0" aria-hidden />
      <span className="text-[9px] font-black text-white uppercase tracking-widest shrink-0">Aguardando material</span>
      {task.waiting_material_note && <span className="text-[9px] text-white/85 truncate">{task.waiting_material_note}</span>}
    </div>
  );
}

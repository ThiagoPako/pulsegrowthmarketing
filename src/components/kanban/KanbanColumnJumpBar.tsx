/**
 * Atalho das colunas no celular: uma faixa com o nome e a contagem de cada coluna; o toque rola o
 * quadro até ela (no celular a coluna ocupa quase a tela inteira e arrastar não funciona).
 * Cada coluna precisa de id `kanban-col-<id>`.
 */
interface Props {
  columns: { id: string; label: string; count: number }[];
}

export function kanbanColumnDomId(columnId: string) {
  return `kanban-col-${columnId}`;
}

export default function KanbanColumnJumpBar({ columns }: Props) {
  return (
    <div className="sm:hidden -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {columns.map(col => (
        <button
          key={col.id}
          type="button"
          onClick={() => document.getElementById(kanbanColumnDomId(col.id))?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })}
          className="shrink-0 rounded-full border border-border/60 bg-secondary/60 px-3 py-1.5 text-[11px] font-semibold text-foreground"
        >
          {col.label} <span className="text-muted-foreground">{col.count}</span>
        </button>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Thermometer } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TEMPERATURE_BANDS, temperatureBand, type TemperatureBand } from '@/lib/clientTemperature';

/**
 * Selo da temperatura do cliente (Satisfeito / Atenção / Insatisfeito), com ícone e texto (não só cor).
 * É outro conceito que o status do cliente (ClientStatusBadge): não mexe nele nem no helper de prioridade dele.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const TEMPERATURE_BAND_STYLE: Record<TemperatureBand, string> = {
  satisfeito: 'border-success/30 bg-success/10 text-success',
  atencao: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  insatisfeito: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export interface ClientTemperatureBadgeProps extends Omit<BadgeProps, 'children'> {
  score: number | null | undefined;
  /** Mostra a nota junto do nome da faixa (padrão: sim). */
  showScore?: boolean;
  /** Só o ícone e a nota (para cards apertados). */
  compact?: boolean;
  /** Sem nota: não mostra nada (padrão) ou "Sem análise". */
  showEmpty?: boolean;
  /** Vira link (ex.: para o detalhe na tela de temperatura). */
  to?: string;
}

export default function ClientTemperatureBadge({
  score, showScore = true, compact = false, showEmpty = false, to, className, ...props
}: ClientTemperatureBadgeProps) {
  const band = temperatureBand(score);
  if (!band) {
    if (!showEmpty) return null;
    return (
      <Badge {...props} variant="outline" className={cn('shrink-0 gap-1 whitespace-nowrap text-muted-foreground', className)}>
        <Thermometer size={12} aria-hidden="true" className="shrink-0" />
        Sem análise
      </Badge>
    );
  }
  const { label } = TEMPERATURE_BANDS[band];
  const badge = (
    <Badge
      {...props}
      variant="outline"
      title={`Temperatura: ${score}/100 · ${label}`}
      className={cn('shrink-0 gap-1 whitespace-nowrap tabular-nums', TEMPERATURE_BAND_STYLE[band], to && 'cursor-pointer hover:opacity-80', className)}
    >
      <Thermometer size={12} aria-hidden="true" className="shrink-0" />
      {compact ? (
        <>
          <span className="sr-only">{label}</span>
          {score}
        </>
      ) : (
        <>{label}{showScore ? ` · ${score}` : ''}</>
      )}
    </Badge>
  );
  return to ? (
    // dentro de um card clicável: o clique no selo só navega
    <Link to={to} aria-label={`Temperatura: ${label}, ${score} de 100`} onClick={(event) => event.stopPropagation()}>{badge}</Link>
  ) : badge;
}

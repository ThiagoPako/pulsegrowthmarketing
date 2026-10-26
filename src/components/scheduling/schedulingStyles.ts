import {
  AlertTriangle, Ban, CalendarClock, CheckCircle2, CircleDashed, Film, Hand, Hourglass, Layers, Loader2,
  Palette, Square, type LucideIcon,
} from 'lucide-react';
import type { SchedulingClient, SchedulingState, SchedulingType } from '@/lib/postingSchedule';

/** Cor de cada tipo de material (borda do item, ponto da legenda e fundo da miniatura). */
export const TYPE_STYLES: Record<SchedulingType, { label: string; icon: LucideIcon; border: string; top: string; dot: string; soft: string; text: string }> = {
  reels: {
    label: 'Reels', icon: Film,
    border: 'border-l-blue-500', top: 'border-t-blue-500', dot: 'bg-blue-500',
    soft: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-300',
  },
  story: {
    label: 'Story', icon: CircleDashed,
    border: 'border-l-pink-500', top: 'border-t-pink-500', dot: 'bg-pink-500',
    soft: 'bg-pink-500/10', text: 'text-pink-700 dark:text-pink-300',
  },
  carrossel: {
    label: 'Carrossel', icon: Layers,
    border: 'border-l-violet-500', top: 'border-t-violet-500', dot: 'bg-violet-500',
    soft: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300',
  },
  arte: {
    label: 'Arte', icon: Palette,
    border: 'border-l-amber-500', top: 'border-t-amber-500', dot: 'bg-amber-500',
    soft: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300',
  },
  feed: {
    label: 'Feed', icon: Square,
    border: 'border-l-emerald-500', top: 'border-t-emerald-500', dot: 'bg-emerald-500',
    soft: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300',
  },
};

export const STATE_STYLES: Record<SchedulingState, { label: string; icon: LucideIcon; badge: string; spin?: boolean }> = {
  nao_agendado: { label: 'Não agendado', icon: Hourglass, badge: 'border-border bg-muted text-muted-foreground' },
  agendado: { label: 'Agendado', icon: CalendarClock, badge: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  manual: { label: 'Manual', icon: Hand, badge: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300' },
  publicando: { label: 'Publicando', icon: Loader2, badge: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', spin: true },
  publicado: { label: 'Publicado', icon: CheckCircle2, badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  erro: { label: 'Erro', icon: AlertTriangle, badge: 'border-destructive/30 bg-destructive/10 text-destructive' },
  cancelado: { label: 'Cancelado', icon: Ban, badge: 'border-border bg-muted text-muted-foreground line-through' },
};

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  both: 'Instagram + Facebook',
};

export const FORMAT_LABELS: Record<string, string> = {
  reels: 'Reels',
  feed: 'Feed',
  stories: 'Story',
  carousel: 'Carrossel',
};

/** Props do ClientLogo a partir do cliente da API */
export function clientLogoProps(c: Pick<SchedulingClient, 'company_name' | 'color' | 'logo_url'>) {
  return { companyName: c.company_name, color: c.color || '', logoUrl: c.logo_url || undefined };
}

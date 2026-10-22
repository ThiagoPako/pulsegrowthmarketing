import { AlertCircle, CheckCircle2, Rocket } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ClientStatus = 'atrasado' | 'onboarding' | 'em_dia';

export interface ClientStatusOptions {
  hasOverdue: boolean;
  isOnboarding: boolean;
}

export interface ClientStatusBadgeProps extends Omit<BadgeProps, 'children'> {
  status: ClientStatus;
}

/** Preserve the existing priority: overdue, onboarding, then up to date. */
export function getClientStatus({ hasOverdue, isOnboarding }: ClientStatusOptions): ClientStatus {
  if (hasOverdue) return 'atrasado';
  if (isOnboarding) return 'onboarding';
  return 'em_dia';
}

const STATUS_CONFIG = {
  atrasado: { label: 'Atrasado', icon: AlertCircle, className: 'border-destructive/30 bg-destructive/10 text-destructive' },
  onboarding: { label: 'Onboarding', icon: Rocket, className: 'border-info/30 bg-info/10 text-info' },
  em_dia: { label: 'Em dia', icon: CheckCircle2, className: 'border-success/30 bg-success/10 text-success' },
} satisfies Record<ClientStatus, { label: string; icon: typeof AlertCircle; className: string }>;

export default function ClientStatusBadge({ status, className, ...props }: ClientStatusBadgeProps) {
  const { label, icon: Icon, className: statusClassName } = STATUS_CONFIG[status];

  return (
    <Badge {...props} variant="outline" className={cn('shrink-0 gap-1 whitespace-nowrap', statusClassName, className)}>
      <Icon size={12} aria-hidden="true" className="shrink-0" />
      {label}
    </Badge>
  );
}
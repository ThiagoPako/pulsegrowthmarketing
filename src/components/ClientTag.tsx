// Nome do cliente sempre com a logo (regra do usuário, 02/11/2026: "sempre que aparecer nome dos clientes em qualquer
// local deve aparecer a logo do cliente"). Acha a logo pelo id ou pelo nome nos clientes que o sistema já carregou
// (AppContext); a tela pode mandar a logo pronta. Sem logo, o ClientLogo mostra as iniciais na cor do cliente.
import ClientLogo from '@/components/ClientLogo';
import * as AppCtx from '@/contexts/AppContext';
import { cn } from '@/lib/utils';

const norm = (s: string) => String(s || '').trim().toLowerCase();
// os testes simulam o AppContext sem o useAppOptional: sem ele, a tag segue só com a logo que a tela mandar
let useAppSafe: () => ReturnType<typeof AppCtx.useAppOptional> = () => null;
try {
  const hook = (AppCtx as Record<string, unknown>).useAppOptional;
  if (typeof hook === 'function') useAppSafe = hook as typeof useAppSafe;
} catch { /* AppContext simulado sem o hook */ }

export default function ClientTag({ id, name, logo, className, nameClassName, size = 20 }: {
  id?: string | null; name: string | null | undefined; logo?: string | null; className?: string; nameClassName?: string; size?: number;
}) {
  const app = useAppSafe();
  const label = String(name || '').trim();
  const found = app?.clients?.find((c) => (id ? c.id === id : norm(c.companyName) === norm(label)));
  if (!label) return null;
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1.5 align-middle', className)}>
      <ClientLogo client={{ companyName: label, color: found?.color || '', logoUrl: logo || found?.logoUrl || undefined }} size="sm"
        className="!rounded-md" style={{ width: size, height: size }} />
      <span className={cn('truncate', nameClassName)}>{label}</span>
    </span>
  );
}

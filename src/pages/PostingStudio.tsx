// Estúdio de Postagem (usuário, 02/11/2026: "temos 2 funções no sistema, estúdio de postagem e agendamentos, que são
// a mesma função: junte tudo nos agendamentos e mude o nome para estúdio de postagem").
// Aba Calendário: o antigo Agendamentos (vídeos, artes e portal aprovados, arrastar no calendário, stories).
// Aba Postagem avulsa: o antigo Estúdio (qualquer mídia da biblioteca, carrossel na ordem certa, publicar agora).
// Quem o servidor não deixa ver o calendário (ex.: revisor da Meta) fica só na postagem avulsa.
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Images } from 'lucide-react';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { cn } from '@/lib/utils';

const Scheduling = lazy(() => import('@/pages/Scheduling'));
const PostStudio = lazy(() => import('@/pages/PostStudio'));

type Tab = 'calendario' | 'avulsa';

const spinner = (
  <div className="flex h-64 items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
  </div>
);

export default function PostingStudio() {
  const { has, loading } = useModuleAccess();
  const [params, setParams] = useSearchParams();
  if (loading) return spinner;
  const canCalendar = has('pulse_plus') || has('agendamentos');
  const tab: Tab = canCalendar && params.get('aba') !== 'avulsa' ? 'calendario' : 'avulsa';
  const go = (next: Tab) => {
    const n = new URLSearchParams(params);
    if (next === 'avulsa') n.set('aba', 'avulsa'); else n.delete('aba');
    setParams(n, { replace: true });
  };

  return (
    <div className="space-y-4">
      {canCalendar && (
        <div role="tablist" aria-label="Estúdio de Postagem" className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
          {([['calendario', 'Calendário', CalendarClock], ['avulsa', 'Postagem avulsa', Images]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => go(value)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === value ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground')}>
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      )}
      <Suspense fallback={spinner}>
        {tab === 'calendario' ? <Scheduling /> : <PostStudio />}
      </Suspense>
    </div>
  );
}

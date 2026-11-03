// Estúdio de Postagem (usuário, 02/11/2026: "temos 2 funções no sistema, estúdio de postagem e agendamentos, que são
// a mesma função: junte tudo nos agendamentos e mude o nome para estúdio de postagem").
// Aba Calendário: o antigo Agendamentos (vídeos, artes e portal aprovados, arrastar no calendário, stories).
// Aba Postagem avulsa: o antigo Estúdio (qualquer mídia da biblioteca, carrossel na ordem certa, publicar agora).
// Quem o servidor não deixa ver o calendário (ex.: revisor da Meta) fica só na postagem avulsa.
// Aba Storymaker (03/11/2026): link de evento para postar story em tempo real (/story/<token>).
// Aba Visão geral (03/11/2026): o dia de todos os clientes (próximos posts, números e o que precisa de alguém).
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, Images, LayoutDashboard, Radio } from 'lucide-react';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { cn } from '@/lib/utils';

const Scheduling = lazy(() => import('@/pages/Scheduling'));
const PostStudio = lazy(() => import('@/pages/PostStudio'));
const StorymakerPanel = lazy(() => import('@/components/storymaker/StorymakerPanel'));
const StudioOverview = lazy(() => import('@/components/scheduling/StudioOverview'));

type Tab = 'visao' | 'calendario' | 'avulsa' | 'storymaker';

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
  const aba = params.get('aba');
  // sem aba nem cliente na URL, abre a visão geral; com ?cliente= (link de um cliente), o calendário dele
  const tab: Tab = aba === 'storymaker' ? 'storymaker' : !canCalendar || aba === 'avulsa' ? 'avulsa'
    : aba === 'calendario' || params.get('cliente') ? 'calendario' : 'visao';
  const go = (next: Tab) => {
    const n = new URLSearchParams(params);
    if (next === 'visao') { n.delete('aba'); n.delete('cliente'); } else n.set('aba', next);
    setParams(n, { replace: true });
  };
  const openClient = (clientId: string) => {
    const n = new URLSearchParams(params);
    n.set('aba', 'calendario');
    n.set('cliente', clientId);
    setParams(n);
  };

  return (
    <div className="space-y-4">
      {(
        <div role="tablist" aria-label="Estúdio de Postagem" className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
          {([...(canCalendar ? [['visao', 'Visão geral', LayoutDashboard] as const, ['calendario', 'Calendário', CalendarClock] as const] : []), ['avulsa', 'Postagem avulsa', Images] as const, ['storymaker', 'Storymaker', Radio] as const]).map(([value, label, Icon]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => go(value)}
              className={cn('relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === value ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {/* a pílula desliza para a aba escolhida */}
              {tab === value && <motion.span layoutId="studio-tab-pill" className="absolute inset-0 rounded-lg bg-primary shadow" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span className="relative flex items-center gap-1.5"><Icon size={15} aria-hidden="true" /> {label}</span>
            </button>
          ))}
        </div>
      )}
      <Suspense fallback={spinner}>
        {tab === 'visao' ? <StudioOverview onOpenClient={openClient} /> : tab === 'calendario' ? <Scheduling /> : tab === 'storymaker' ? <StorymakerPanel /> : <PostStudio />}
      </Suspense>
    </div>
  );
}

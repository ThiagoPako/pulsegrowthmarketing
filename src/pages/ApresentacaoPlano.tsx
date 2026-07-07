import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Check, ArrowRight, ArrowLeft, Sparkles, Target, TrendingUp,
  Calendar, BarChart3, Palette, X, Film, Image as ImageIcon, Megaphone, PenTool,
  Crown, PiggyBank, MessageCircle, Link2, ChevronDown, ChevronUp, Rocket, Users, Trophy,
  PlayCircle, Award, Zap, Maximize2, Minimize2, MapPin, GraduationCap, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getPlan, PLANS } from '@/data/plans';
import { useSearchParams } from 'react-router-dom';
import { useCity } from '@/contexts/CityContext';
import { useIsMobile } from '@/hooks/use-mobile';

const WHATSAPP_NUMBER = '5562985382981';
const LOGO_URL = '/pulse-logo.png';

const PRESENTATION_ORDER: Array<'starter' | 'boost' | 'premium' | 'elite'> = [
  'starter', 'boost', 'premium', 'elite',
];

const parsePrice = (s: string): number => {
  const n = Number(String(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

type Category = { title: string; icon: typeof Film; items: string[] };
function categorizeFeatures(features: string[]): Category[] {
  const buckets: Record<string, Category> = {
    video:    { title: 'Vídeo & Reels',           icon: Film,        items: [] },
    arte:     { title: 'Design & Artes',           icon: ImageIcon,   items: [] },
    trafego:  { title: 'Tráfego Pago',             icon: Megaphone,   items: [] },
    estrategia:{title: 'Estratégia & Conteúdo',    icon: PenTool,     items: [] },
    gestao:   { title: 'Gestão & Relatórios',      icon: BarChart3,   items: [] },
    extras:   { title: 'Diferenciais',             icon: Sparkles,    items: [] },
  };
  features.forEach((f) => {
    const t = f.toLowerCase();
    if (/(reel|vídeo|video|edição|edicao|roteiro|gravaç|criativ.*víd|criativ.*vid|story|stories)/.test(t)) buckets.video.items.push(f);
    else if (/(arte|design|post|feed|perfil|destaque|foto)/.test(t)) buckets.arte.items.push(f);
    else if (/(tráfego|trafego|ads|anúnci|anunci|meta ads|google ads|campanh)/.test(t)) buckets.trafego.items.push(f);
    else if (/(linha editorial|estratég|estrateg|público|publico|análise|analise|sazon|comerci|vendas|treinamento)/.test(t)) buckets.estrategia.items.push(f);
    else if (/(dashboard|relatóri|relatori|portal|crm|monitor|google meu negócio|google meu negocio|gestão|gestao|social media)/.test(t)) buckets.gestao.items.push(f);
    else buckets.extras.items.push(f);
  });
  return Object.values(buckets).filter((b) => b.items.length > 0);
}

// stages: 5 sem promo, 7 com promo (preço normal → storytelling promo → preço com promo → comparativo)
const getTotalStages = (hasPromo: boolean) => (hasPromo ? 7 : 5);

export default function ApresentacaoPlano() {
  const { plano } = useParams<{ plano: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/p/');
  const baseRoute = isPublic ? '/p/planos' : '/apresentacao';
  const [stage, setStage] = useState(0);
  const [promo, setPromo] = useState<any | null>(null);
  const [semPromo, setSemPromo] = useState<any | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isMobile = useIsMobile();

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const { activeCity } = useCity();
  const [searchParams] = useSearchParams();
  const queryCity = searchParams.get('city');
  const promoIdParam = searchParams.get('promo');
  const effectiveCity = (queryCity === 'minacu' || queryCity === 'uruacu') ? queryCity : activeCity;

  const plan = plano ? getPlan(plano, effectiveCity) : undefined;

  useEffect(() => { setStage(0); }, [plano]);

  useEffect(() => {
    if (!plan) return;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);

        // Modo link exclusivo: carrega a promo pelo id, ignorando active/city/plan
        if (promoIdParam) {
          const { data: exact } = await supabase
            .from('plan_promotions' as any)
            .select('*')
            .eq('id', promoIdParam)
            .maybeSingle();
          const p: any = exact;
          if (p) {
            // Em link exclusivo NÃO invalidamos pelo max_redemptions
            // (esse número é usado só para exibir "vagas restantes").
            const valid =
              (!p.starts_at || p.starts_at <= today) &&
              (!p.ends_at || p.ends_at >= today) &&
              (!p.plan_key || p.plan_key === plan.key);
            if (valid) {
              const isSem = p.applies_to === 'semestral' || p.applies_to === 'ambos';
              setPromo(p);
              setSemPromo(isSem ? p : null);
              return;
            }
          }
        }

        const { data } = await supabase
          .from('plan_promotions' as any)
          .select('*')
          .eq('active', true)
          .eq('exclusive', false)
          .or(`plan_key.is.null,plan_key.eq.${plan.key}`)
          .or(`city.is.null,city.eq.${activeCity}`)
          .order('discount_percent', { ascending: false });
        const matches = (data || []).filter((p: any) => {
          if (p.starts_at && p.starts_at > today) return false;
          if (p.ends_at && p.ends_at < today) return false;
          if (p.plan_key && p.plan_key !== plan.key) return false;
          if (p.city && p.city !== activeCity) return false;
          if (p.max_redemptions != null && (p.redemptions_count ?? 0) >= p.max_redemptions) return false;
          return true;
        });
        // Promo principal: prioriza anual/ambos (banner/storytelling)
        const main = matches.find((p: any) => p.applies_to === 'anual' || p.applies_to === 'ambos') || matches[0] || null;
        // Promo do semestral: pode coexistir com a principal
        const sem = matches.find((p: any) => p.applies_to === 'semestral' || p.applies_to === 'ambos') || null;
        setPromo(main);
        const mainAny: any = main;
        setSemPromo(sem && sem !== main ? sem : (mainAny && (mainAny.applies_to === 'semestral' || mainAny.applies_to === 'ambos') ? mainAny : null));
      } catch (err) { console.warn('promo error', err); }
    })();
  }, [plan, activeCity, promoIdParam]);


  // Realtime: atualiza vagas automaticamente quando redemptions_count mudar
  useEffect(() => {
    if (!promo?.id) return;
    const channel = supabase
      .channel(`promo-${promo.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plan_promotions', filter: `id=eq.${promo.id}` },
        (payload) => { setPromo((prev: any) => prev ? { ...prev, ...payload.new } : prev); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [promo?.id]);


  const currentIndex = plano ? PRESENTATION_ORDER.indexOf(plano as any) : -1;
  const prevKey = currentIndex > 0 ? PRESENTATION_ORDER[currentIndex - 1] : null;
  const nextKey = currentIndex >= 0 && currentIndex < PRESENTATION_ORDER.length - 1
    ? PRESENTATION_ORDER[currentIndex + 1]
    : null;

  const goPrevPlan = () => { if (prevKey) navigate(`${baseRoute}/${prevKey}`); };
  const goNextPlan = () => { if (nextKey) navigate(`${baseRoute}/${nextKey}`); };
  const totalStages = getTotalStages(!!promo);
  const nextStage = () => setStage((s) => Math.min(s + 1, totalStages - 1));
  const prevStage = () => setStage((s) => Math.max(s - 1, 0));

  const copyPublicLink = async () => {
    const url = `${window.location.origin}/p/planos/${plano}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link público copiado!');
    } catch { toast.error('Link: ' + url); }
  };

  useEffect(() => {
    if (isMobile) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); nextStage(); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); prevStage(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNextPlan(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrevPlan(); }
      else if (e.key === 'Home') { e.preventDefault(); setStage(0); }
      else if (e.key === 'End') { e.preventDefault(); setStage(totalStages - 1); }
      else if (e.key === 'Escape') { window.close(); }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as any);
  }, [prevKey, nextKey, totalStages, isMobile]);

  const pricing = useMemo(() => {
    if (!plan) return null;
    const semestral = plan.pricing[0];
    const anual = plan.pricing[plan.pricing.length - 1];
    const sem = parsePrice(semestral.monthly);
    const an = parsePrice(anual.monthly);
    const diffMes = sem - an;
    const totalEconomia = diffMes * 12;
    const pct = sem > 0 ? Math.round((diffMes / sem) * 100) : 0;
    const promoTargetAnnual = promo && (promo.applies_to === 'anual' || promo.applies_to === 'ambos');
    const semSource: any = semPromo || (promo && (promo.applies_to === 'semestral' || promo.applies_to === 'ambos') ? promo : null);
    const promoAnualMes = promoTargetAnnual ? an * (1 - Number(promo.discount_percent) / 100) : null;
    const promoSemMes = semSource ? sem * (1 - Number(semSource.discount_percent) / 100) : null;
    return { semestral, anual, sem, an, diffMes, totalEconomia, pct, promoAnualMes, promoSemMes, semPromo: semSource };
  }, [plan, promo, semPromo]);

  if (!plan) return <Navigate to={isPublic ? '/p/planos' : '/apresentacao'} replace />;

  const Icon = plan.icon;
  const categories = categorizeFeatures(plan.features);

  const stagesContent = (
    <>
      <StageIntro />
      <StagePlan plan={plan} Icon={Icon} />
      <StageDeliveries plan={plan} categories={categories} />
      {pricing && <StageInvest plan={plan} pricing={pricing} promo={promo} applyPromo={false} />}
      {promo && (
        <>
          <StagePromoStory plan={plan} promo={promo} />
          {pricing && <StageInvest plan={plan} pricing={pricing} promo={promo} applyPromo={true} />}
        </>
      )}
    </>
  );

  // ============== MOBILE ou LINK PÚBLICO: scroll vertical natural, sem etapas ==============
  if (isMobile || isPublic) {
    const mobileStages = [
      <StageIntro key="s0" />,
      <StagePlan key="s1" plan={plan} Icon={Icon} />,
      <StageDeliveries key="s2" plan={plan} categories={categories} />,
      pricing && <StageInvest key="s3" plan={plan} pricing={pricing} promo={promo} applyPromo={false} />,
      promo && <StagePromoStory key="s4" plan={plan} promo={promo} />,
      promo && pricing && <StageInvest key="s5" plan={plan} pricing={pricing} promo={promo} applyPromo={true} />,
      pricing && <StageComparison key="s6" plan={plan} pricing={pricing} promo={promo} />,
    ].filter(Boolean);

    const sectionLabels = ['Início', 'Plano', 'Entregas', 'Investimento', 'Promoção', 'Com desconto', 'Comparativo'];

    const scrollToSection = (idx: number) => {
      const el = document.getElementById(`pulse-section-${idx}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
      <div className="min-h-screen w-full bg-background text-foreground relative scroll-smooth">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-0 -left-32 w-[400px] h-[400px] rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute bottom-0 -right-32 w-[400px] h-[400px] rounded-full bg-primary/20 blur-3xl" />
        </div>

        {/* TOP BAR */}
        <div className="sticky top-0 z-50 flex items-center justify-between gap-2 px-3 py-2 bg-background/90 backdrop-blur border-b border-border">
          <div className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Pulse" className="h-7" />
            <Badge variant="outline" className="text-xs">
              {currentIndex + 1}/{PRESENTATION_ORDER.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {!isPublic && (
              <Button variant="outline" size="sm" onClick={copyPublicLink} className="h-8 px-2" aria-label="Copiar link">
                <Link2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => window.close()} className="h-8 px-2" aria-label="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Dots laterais de seção (desktop apenas, para link público) */}
        <div className="hidden lg:flex fixed right-4 top-1/2 -translate-y-1/2 z-40 flex-col gap-2">
          {mobileStages.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToSection(i)}
              title={sectionLabels[i]}
              className="group flex items-center gap-2"
              aria-label={sectionLabels[i]}
            >
              <span className="hidden group-hover:inline text-xs bg-background/90 backdrop-blur px-2 py-0.5 rounded border border-border">
                {sectionLabels[i]}
              </span>
              <span className="h-2.5 w-2.5 rounded-full bg-border hover:bg-primary transition-all" />
            </button>
          ))}
        </div>

        {/* Todas as etapas empilhadas para scroll natural */}
        <div className="flex flex-col scroll-smooth">
          {mobileStages.map((el, i) => (
            <section
              key={i}
              id={`pulse-section-${i}`}
              className="w-full px-3 py-10 md:py-16 border-b border-border/50 last:border-b-0 scroll-mt-16"
            >
              {el}
            </section>
          ))}
        </div>

        {/* Nav planos fixa no rodapé */}
        <div className="sticky bottom-0 z-50 flex items-center justify-between gap-2 px-3 py-2 bg-background/90 backdrop-blur border-t border-border">
          {prevKey ? (
            <button onClick={goPrevPlan} className="h-10 px-3 rounded-full border border-border bg-background flex items-center gap-1 text-sm">
              <ArrowLeft className="h-4 w-4" /> Anterior
            </button>
          ) : <span />}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="h-10 px-3 rounded-full border border-border bg-background text-sm hidden sm:flex items-center gap-1"
            aria-label="Voltar ao topo"
          >
            <ChevronUp className="h-4 w-4" /> Topo
          </button>
          {nextKey ? (
            <button onClick={goNextPlan} className="h-10 px-3 rounded-full bg-primary text-primary-foreground flex items-center gap-1 text-sm font-semibold">
              Próximo plano <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Olá! Quero fechar o plano ${plan.name}.`)}`}
              target="_blank" rel="noreferrer"
              className="h-10 px-3 rounded-full bg-[#25D366] text-white flex items-center gap-1 text-sm font-semibold">
              <MessageCircle className="h-4 w-4" /> Falar agora
            </a>
          )}
        </div>
      </div>
    );
  }

  // ============== DESKTOP: etapas com navegação por teclado ==============
  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground relative">
      {/* gradientes de fundo */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 -left-32 w-[600px] h-[600px] rounded-full bg-primary/15 blur-3xl animate-pulse" />
        <div className="absolute bottom-0 -right-32 w-[600px] h-[600px] rounded-full bg-primary/20 blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* TOP BAR */}
      <div className="absolute top-3 left-3 right-3 z-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src={LOGO_URL} alt="Pulse" className="h-7 md:h-8" />
          <Badge variant="outline" className="backdrop-blur bg-background/80 text-xs">
            Plano {currentIndex + 1}/{PRESENTATION_ORDER.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={copyPublicLink} className="backdrop-blur bg-background/80 h-8 px-2" aria-label="Copiar link">
            <Link2 className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Link público</span>
          </Button>
          <Button variant="outline" size="sm" onClick={toggleFullscreen} className="backdrop-blur bg-background/80 h-8 px-2" aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
            {isFullscreen ? <Minimize2 className="h-4 w-4 md:mr-1" /> : <Maximize2 className="h-4 w-4 md:mr-1" />}
            <span className="hidden md:inline">{isFullscreen ? 'Sair' : 'Tela cheia'}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.close()} className="backdrop-blur bg-background/80 h-8 px-2" aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PROGRESS DOTS */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
        {Array.from({ length: totalStages }).map((_, i) => (
          <button
            key={i}
            onClick={() => setStage(i)}
            className={`h-1.5 rounded-full transition-all ${i === stage ? 'w-10 bg-primary' : 'w-4 bg-border hover:bg-primary/40'}`}
            aria-label={`Etapa ${i + 1}`}
          />
        ))}
      </div>

      {/* SLIDE - scroll vertical entre etapas */}
      <div className="absolute inset-0 pt-16 pb-16 md:pt-20 md:pb-20 overflow-hidden">
        <motion.div
          animate={{ y: `-${stage * 100}%` }}
          transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
          className="h-full w-full"
        >
          <div className="h-full w-full px-3 md:px-8 flex items-start md:items-center justify-center overflow-y-auto">
            <StageIntro />
          </div>
          <div className="h-full w-full px-3 md:px-8 flex items-start md:items-center justify-center overflow-y-auto">
            <StagePlan plan={plan} Icon={Icon} />
          </div>
          <div className="h-full w-full px-3 md:px-8 flex items-start md:items-center justify-center overflow-y-auto">
            <StageDeliveries plan={plan} categories={categories} />
          </div>
          <div className="h-full w-full px-3 md:px-8 flex items-start md:items-center justify-center overflow-y-auto">
            {pricing && <StageInvest plan={plan} pricing={pricing} promo={promo} applyPromo={false} />}
          </div>
          {promo && (
            <>
              <div className="h-full w-full px-3 md:px-8 flex items-start md:items-center justify-center overflow-y-auto">
                <StagePromoStory plan={plan} promo={promo} />
              </div>
              <div className="h-full w-full px-3 md:px-8 flex items-start md:items-center justify-center overflow-y-auto">
                {pricing && <StageInvest plan={plan} pricing={pricing} promo={promo} applyPromo={true} />}
              </div>
            </>
          )}
          <div className="h-full w-full px-3 md:px-8 flex items-start md:items-center justify-center overflow-y-auto">
            {pricing && <StageComparison plan={plan} pricing={pricing} promo={promo} />}
          </div>
        </motion.div>
      </div>

      {/* CONTROLES INFERIORES */}
      <div className="absolute bottom-3 left-3 right-3 z-50 flex items-center justify-between gap-2">
        <button
          onClick={prevStage}
          disabled={stage === 0}
          className="h-11 px-4 rounded-full bg-background/80 backdrop-blur border border-border shadow flex items-center gap-2 disabled:opacity-30 hover:bg-primary hover:text-primary-foreground transition-all"
          aria-label="Etapa anterior"
        >
          <ChevronUp className="h-4 w-4" />
          <span className="hidden md:inline text-sm">Voltar</span>
        </button>

        <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-full bg-background/80 backdrop-blur border border-border text-xs text-muted-foreground shadow">
          <span>↑ ↓ etapas</span>
          <span className="opacity-40">•</span>
          <span>← → planos</span>
          <span className="opacity-40">•</span>
          <span>Esc fechar</span>
        </div>

        <div className="flex items-center gap-1.5">
          {prevKey && (
            <button onClick={goPrevPlan} aria-label="Plano anterior"
              className="h-11 w-11 rounded-full bg-background/80 backdrop-blur border border-border shadow hover:bg-primary hover:text-primary-foreground transition-all flex items-center justify-center">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          {stage < totalStages - 1 ? (
            <button onClick={nextStage}
              className="h-11 px-5 rounded-full bg-primary text-primary-foreground shadow-xl hover:scale-105 transition-all flex items-center gap-2 font-semibold animate-pulse"
              aria-label="Próxima etapa">
              <span className="text-sm">Próximo</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          ) : nextKey ? (
            <button onClick={goNextPlan}
              className="h-11 px-5 rounded-full bg-primary text-primary-foreground shadow-xl hover:scale-105 transition-all flex items-center gap-2 font-semibold"
              aria-label="Próximo plano">
              <span className="text-sm">Próximo plano</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Olá! Quero fechar o plano ${plan.name}.`)}`}
              target="_blank" rel="noreferrer"
              className="h-11 px-5 rounded-full bg-[#25D366] text-white shadow-xl hover:scale-105 transition-all flex items-center gap-2 font-semibold">
              <MessageCircle className="h-4 w-4" />
              <span className="text-sm">Falar agora</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============== STAGES ============== */

const slideVariants = {
  enter: { opacity: 0, y: 40, scale: 0.97 },
  center: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -30, scale: 0.97 },
};
const slideTransition = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as any };

function Slide({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={slideVariants}
      initial="enter" animate="center" exit="exit"
      transition={slideTransition}
      className="w-full min-h-full max-w-7xl mx-auto flex items-center justify-center py-2"
    >
      {children}
    </motion.div>
  );
}

function StageIntro() {
  const stats = [
    { icon: Calendar, value: '+4', unit: 'anos', label: 'de mercado consolidado' },
    { icon: Users, value: 'Desde', unit: 'o início', label: 'clientes ativos com a gente' },
    { icon: Trophy, value: 'Grandes', unit: 'cases', label: 'de sucesso comprovados' },
    { icon: TrendingUp, value: '100%', unit: '', label: 'foco em gerar vendas' },
  ];

  const pillars = [
    { icon: Target, title: 'Conteúdo que vende', desc: 'Roteiros e criativos pensados pra gerar lead, agendamento e fechamento — não vaidade.' },
    { icon: Megaphone, title: 'Tráfego pago profissional', desc: 'Meta Ads e Google Ads com gestor especialista, otimização diária e dashboards em tempo real.' },
    { icon: Film, title: 'Produção audiovisual própria', desc: 'Videomakers profissionais com método "Frase a Frase" — gravamos com quem nunca gravou.' },
    { icon: BarChart3, title: 'Operação comercial integrada', desc: 'CRM, portal do cliente, relatórios e acompanhamento até o fechamento da venda.' },
  ];
  return (
    <Slide>
      <div className="w-full max-h-[calc(100vh-9rem)] overflow-y-auto pr-1">
        <div className="text-center max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/30 px-3 py-1">
              <Sparkles className="h-3 w-3 mr-1.5" /> Agência de vendas, não de seguidores
            </Badge>
          </motion.div>

          <motion.h1
            className="text-3xl sm:text-5xl md:text-6xl font-bold leading-[1.05] mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          >
            A <span className="bg-gradient-to-r from-primary via-orange-500 to-primary bg-clip-text text-transparent">Pulse Growth Marketing</span><br />
            transforma conteúdo em <span className="text-primary">vendas reais</span>.
          </motion.h1>

          <motion.p
            className="text-base md:text-xl text-muted-foreground max-w-3xl mx-auto mb-6 leading-relaxed"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
          >
            Somos uma <strong className="text-foreground">empresa de vendas</strong> que usa o marketing digital como ferramenta.
            Mais de <strong className="text-foreground">4 anos de mercado consolidado</strong>, com <strong className="text-foreground">grandes cases de sucesso</strong> e
            clientes que estão com a gente <strong className="text-foreground">desde o início da nossa empresa</strong>.
            A relação se mantém pelo que acontece no resultado do cliente, mês após mês.

          </motion.p>

          {/* STATS — prova de mercado */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8"
          >
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.55 + i * 0.08, type: 'spring', stiffness: 140 }}
                className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-card via-card to-primary/10 p-4 shadow-lg"
              >
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-primary/10 blur-2xl" />
                <div className="relative">
                  <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center mb-2 mx-auto shadow-md">
                    <s.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="text-3xl md:text-4xl font-black bg-gradient-to-br from-primary to-orange-600 bg-clip-text text-transparent leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                    {s.value}
                  </div>
                  {s.unit && <div className="text-xs font-bold text-foreground/80 mt-0.5">{s.unit}</div>}
                  <div className="text-[11px] md:text-xs text-muted-foreground mt-1 leading-snug">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* PILARES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 max-w-5xl mx-auto text-left">
            {pillars.map((it, i) => (
              <motion.div
                key={it.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + i * 0.08 }}
                className="group rounded-2xl border border-border bg-card/80 backdrop-blur p-4 md:p-5 hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all flex gap-3"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-orange-600 text-primary-foreground flex items-center justify-center shrink-0 shadow-md">
                  <it.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm md:text-base mb-1">{it.title}</div>
                  <div className="text-xs md:text-sm text-muted-foreground leading-snug">{it.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}
            className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ChevronDown className="h-4 w-4 animate-bounce text-primary" />
            Pressione <kbd className="px-2 py-0.5 rounded bg-secondary border border-border font-mono text-xs">↓</kbd> para conhecer o plano
          </motion.div>
        </div>
      </div>
    </Slide>
  );
}



function StagePlan({ plan, Icon }: { plan: any; Icon: any }) {
  return (
    <Slide>
      <div className="w-full grid lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-14 items-center">
        <div className="text-center lg:text-left">
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
            className="inline-flex w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-gradient-to-br from-primary to-orange-600 items-center justify-center shadow-2xl mb-5"
          >
            <Icon className="h-10 w-10 md:h-12 md:w-12 text-primary-foreground" />
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <Badge className="bg-primary/10 text-primary border-primary/20 mb-3">Apresentando</Badge>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-5xl sm:text-6xl md:text-8xl font-bold leading-none mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <span className="bg-gradient-to-r from-primary via-orange-500 to-primary bg-clip-text text-transparent">
              {plan.name}
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
            className="text-xl md:text-2xl font-semibold text-foreground/90 mb-3"
          >
            {plan.tagline}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}
            className="text-base md:text-lg text-muted-foreground"
          >
            {plan.description}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
          className="relative rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-card via-card to-primary/10 p-6 md:p-8 shadow-[0_25px_80px_-20px_hsl(var(--primary)/0.45)]"
        >
          {/* glow */}
          <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-primary/20 via-transparent to-orange-500/10 -z-10 blur-xl" />

          <div className="absolute -top-4 left-6 flex gap-2">
            <Badge className="bg-primary text-primary-foreground shadow-lg px-3 py-1">
              <Target className="h-3.5 w-3.5 mr-1.5" /> Feito pra você
            </Badge>
            <Badge className="bg-background border border-primary/40 text-primary shadow px-2.5 py-1">
              <Sparkles className="h-3 w-3 mr-1" /> Alta conversão
            </Badge>
          </div>

          <p className="text-base md:text-xl leading-relaxed font-semibold text-foreground mt-3 mb-5">
            {plan.ideal}
          </p>

          {/* Gatilhos: dores que resolve */}
          <div className="space-y-2.5 mb-5">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-2">
              <span className="h-px flex-1 bg-border" />
              Se você se identifica com isso, é o seu plano
              <span className="h-px flex-1 bg-border" />
            </div>
            {getTriggers(plan.key).map((t, i) => (
              <motion.div
                key={t.title}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + i * 0.08 }}
                className="flex items-start gap-3 rounded-xl bg-background/60 border border-border p-3 hover:border-primary/50 hover:bg-primary/5 transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/15 group-hover:bg-primary group-hover:text-primary-foreground flex items-center justify-center shrink-0 transition-all">
                  <t.icon className="h-4.5 w-4.5 text-primary group-hover:text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm leading-tight">{t.title}</div>
                  <div className="text-xs text-muted-foreground leading-snug mt-0.5">{t.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Stats com gatilho */}
          <div className="pt-5 border-t border-border grid grid-cols-3 gap-3 text-center">
            <Stat icon={Award} label="Entregas/mês" value={(() => { const q = getQuantities(plan.key); return q.reels + q.artes + q.stories + q.criativos + q.posts; })()} highlight />
            <Stat icon={Zap} label="Time" value="Dedicado" />
            <Stat icon={TrendingUp} label="Foco" value="Crescer" />
          </div>

          {/* Selo de garantia */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
            className="mt-5 flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2"
          >
            <Crown className="h-4 w-4 text-primary shrink-0" />
            <span><strong className="text-foreground">Sem fidelidade abusiva.</strong> Resultado mensurável desde o 1º mês.</span>
          </motion.div>
        </motion.div>
      </div>
    </Slide>
  );
}

function getTriggers(key: string): Array<{ icon: any; title: string; desc: string }> {
  const common = {
    starter: [
      { icon: Rocket, title: 'Quer começar do jeito certo', desc: 'Sem improviso: linha editorial, identidade e tráfego desde o dia 1.' },
      { icon: PlayCircle, title: 'Cansou de postar sem retorno', desc: 'Conteúdo profissional + anúncio rodando pra gerar clientes de verdade.' },
      { icon: PiggyBank, title: 'Investimento enxuto, entrega séria', desc: 'O menor ticket com produção própria de vídeo e gestão de mídia inclusos.' },
    ],
    boost: [
      { icon: TrendingUp, title: 'Quer escalar sem virar empresa enterprise', desc: 'Volume robusto de conteúdo, stories diários e ads avançado pelo melhor custo-benefício.' },
      { icon: Calendar, title: 'Presença diária, sem você se preocupar', desc: '20 stories, 6 reels e posts no automático, operação 100% nossa.' },
      { icon: Crown, title: 'É o plano que MAIS converte', desc: 'Mais de 70% dos nossos clientes escolhem o Boost, equilíbrio perfeito entre entrega e investimento.' },
    ],
    premium: [
      { icon: Target, title: 'Quer autoridade + vendas previsíveis', desc: 'Conteúdo + tráfego + CRM + treinamento comercial integrados.' },
      { icon: Users, title: 'Tem equipe comercial e quer alimentá-la', desc: 'CRM no WhatsApp/Instagram/Facebook + scripts e treinamento de vendas.' },
      { icon: BarChart3, title: 'Decide com dados, não com achismo', desc: 'Dashboard em tempo real, sazonalidade planejada, campanhas comerciais ativas.' },
    ],
    elite: [
      { icon: Crown, title: 'Quer dominar o mercado da sua região', desc: 'Operação digital completa: máxima frequência, máxima exposição.' },
      { icon: Megaphone, title: 'Influência + relacionamento + escala', desc: 'Gerenciamento de influenciadores e grupo dedicado com seu comercial.' },
      { icon: Award, title: 'Top performance, top acompanhamento', desc: 'Monitoramento avançado de CRM com análise de atendimento e treinamentos recorrentes.' },
    ],
  } as const;
  return (common as any)[key] || common.boost;
}

function Stat({ icon: I, label, value, highlight }: { icon: any; label: string; value: any; highlight?: boolean }) {
  return (
    <div>
      <div className={`inline-flex w-10 h-10 rounded-xl items-center justify-center mb-1 ${highlight ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
        <I className="h-5 w-5" />
      </div>
      <div className="text-lg md:text-xl font-bold leading-tight">{value}</div>
      <div className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function getQuantities(key: string) {
  const map: Record<string, { reels: number; artes: number; stories: number; criativos: number; posts: number }> = {
    starter: { reels: 4,  artes: 2, stories: 0,  criativos: 2, posts: 0 },
    boost:   { reels: 6,  artes: 4, stories: 20, criativos: 4, posts: 2 },
    premium: { reels: 8,  artes: 6, stories: 20, criativos: 4, posts: 0 },
    elite:   { reels: 12, artes: 8, stories: 40, criativos: 4, posts: 0 },
  };
  return map[key] || map.boost;
}

const DIFFERENTIALS = [
  { icon: Palette,    title: 'Designer da nossa equipe',  desc: 'Adriele, designer interna, cria suas artes com identidade própria, nada genérico, nada terceirizado.' },
  { icon: Film,       title: 'Videomakers profissionais', desc: 'Time próprio que direciona a gravação no local, sabemos filmar até quem NUNCA gravou na vida.' },
  { icon: PenTool,    title: 'Roteiros frase a frase',    desc: 'Método Pulse: cada vídeo com roteiro pronto, focado em VENDAS, você só lê e grava.' },
  { icon: Megaphone,  title: 'Gestor de tráfego especialista', desc: 'Profissional dedicado em Meta Ads + Google Ads, otimização diária com foco em ROI.' },
  { icon: BarChart3,  title: 'Portal do Cliente exclusivo', desc: 'Acompanha conteúdo, agenda de gravação, anúncios e relatórios em tempo real, 24/7.' },
  { icon: Crown,      title: 'A gente NÃO terceiriza culpa', desc: 'Da geração de leads ao fechamento da venda, assumimos o resultado e buscamos a solução.' },
];

function StageDeliveries({ plan, categories }: { plan: any; categories: Category[] }) {
  const q = getQuantities(plan.key);
  const totalEntregas = q.reels + q.artes + q.stories + q.criativos + q.posts;
  const featuresText = (plan.features as string[]).join(' | ').toLowerCase();
  const hasSocialMedia = /social media/.test(featuresText);
  const hasCRM = /crm/.test(featuresText);
  const hasGMN = /google meu neg/.test(featuresText);
  const hasTreinamento = /treinamento comercial/.test(featuresText);
  const premiumHighlights = [
    hasCRM && {
      icon: MessageSquare,
      badge: 'CRM Integrado',
      title: 'Todas as conversas em UM só lugar',
      desc: 'Instagram + Facebook + WhatsApp centralizados. Nenhum lead esquecido, nenhuma venda perdida por falta de resposta.',
    },
    hasGMN && {
      icon: MapPin,
      badge: 'Google Meu Negócio',
      title: 'Apareça quando o cliente PROCURA você no Google',
      desc: 'Perfil monitorado e otimizado: fotos, horários, avaliações e posts. É onde 90% das buscas locais convertem em cliente na porta.',
    },
    hasTreinamento && {
      icon: GraduationCap,
      badge: 'Treinamento Comercial',
      title: 'Sua equipe vendendo como profissional',
      desc: 'Treinamos seu time de vendas para receber o lead quente que a gente gera e transformar em contrato fechado. Não adianta gerar lead se ninguém sabe vender.',
    },
  ].filter(Boolean) as Array<{ icon: any; badge: string; title: string; desc: string }>;
  const highlights = [
    { icon: Film,      qty: q.reels,     unit: 'Reels',    sub: 'editados por videomakers profissionais', show: q.reels > 0 },
    { icon: ImageIcon, qty: q.artes,     unit: 'Artes',    sub: 'criadas pela nossa designer interna',    show: q.artes > 0 },
    { icon: PlayCircle,qty: q.stories,   unit: 'Stories',  sub: 'distribuídos com estratégia semanal',    show: q.stories > 0 },
    { icon: Megaphone, qty: q.criativos, unit: 'Criativos',sub: 'em vídeo p/ anúncios Meta + Google',     show: q.criativos > 0 },
  ].filter((h) => h.show);


  return (
    <Slide>
      <div className="w-full max-h-[calc(100vh-10rem)] overflow-y-auto pr-2">
        <div className="text-center mb-5">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
            <Badge className="bg-primary text-primary-foreground mb-3 text-sm px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> O que você recebe TODO MÊS no {plan.name}
            </Badge>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-3xl md:text-5xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Produção <span className="bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">profissional</span> entregue por time próprio
          </motion.h2>
        </div>

        {/* QUANTIDADES, destaque grande */}
        {highlights.length > 0 && (
          <div className={`grid gap-3 md:gap-4 mb-6 ${highlights.length === 4 ? 'grid-cols-2 md:grid-cols-4' : highlights.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {highlights.map((h, i) => (
              <motion.div
                key={h.unit}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 120 }}
                className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-card via-card to-primary/10 p-4 md:p-5 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all"
              >
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-primary/10 blur-2xl" />
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center mb-2 shadow-lg">
                  <h.icon className="h-5 w-5" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl md:text-5xl font-black leading-none bg-gradient-to-br from-primary to-orange-600 bg-clip-text text-transparent" style={{ fontFamily: 'var(--font-display)' }}>
                    {h.qty}
                  </span>
                  <span className="text-sm md:text-base font-bold">{h.unit}</span>
                </div>
                <p className="text-[11px] md:text-xs text-muted-foreground mt-1.5 leading-snug">{h.sub}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* TOTAL DE ENTREGAS */}
        {totalEntregas > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            className="mb-6 rounded-2xl border-2 border-primary/40 bg-gradient-to-r from-primary/15 via-primary/5 to-orange-500/10 px-5 py-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Total de entregas por mês</div>
                <div className="text-sm text-foreground/80 leading-snug">Somando reels, artes, stories e criativos de anúncio.</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl md:text-5xl font-black leading-none bg-gradient-to-br from-primary to-orange-600 bg-clip-text text-transparent" style={{ fontFamily: 'var(--font-display)' }}>
                {totalEntregas}
              </div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-primary">entregáveis/mês</div>
            </div>
          </motion.div>
        )}

        {/* SOCIAL MEDIA DEDICADO, destaque exclusivo */}
        {hasSocialMedia && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.6, type: 'spring', stiffness: 110 }}
            className="relative overflow-hidden rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/15 via-card to-orange-500/10 p-5 md:p-6 mb-6 shadow-xl"
          >
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/20 blur-3xl animate-pulse" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-orange-500/20 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="relative flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary to-orange-600 text-primary-foreground flex items-center justify-center shadow-lg shrink-0">
                <Crown className="h-7 w-7 md:h-8 md:w-8" />
              </div>
              <div className="flex-1 min-w-0">
                <Badge className="bg-primary text-primary-foreground mb-2">
                  <Sparkles className="h-3 w-3 mr-1" /> Inclui Social Media Dedicado
                </Badge>
                <h3 className="text-xl md:text-2xl font-bold leading-tight mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                  Uma profissional <span className="bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">cuidando do seu Instagram todos os dias</span>
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground leading-snug">
                  Planejamento de conteúdo, publicação de posts e stories, monitoramento de métricas e engajamento estratégico — feito por uma social media dedicada da nossa equipe. <strong className="text-foreground">O atendimento aos clientes continua com você;</strong> a social media cuida da presença e da imagem da marca.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* DESTAQUES COMERCIAIS: CRM + GMN + Treinamento */}
        {premiumHighlights.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <Badge className="bg-primary text-primary-foreground">
                <Crown className="h-3 w-3 mr-1" /> O que faz esse plano vender de verdade
              </Badge>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className={`grid gap-3 md:gap-4 ${premiumHighlights.length === 3 ? 'md:grid-cols-3' : premiumHighlights.length === 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
              {premiumHighlights.map((h, i) => (
                <motion.div
                  key={h.badge}
                  initial={{ opacity: 0, y: 24, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.7 + i * 0.1, type: 'spring', stiffness: 110 }}
                  className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-card to-orange-500/10 p-5 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all"
                >
                  <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-primary/20 blur-3xl" />
                  <div className="relative">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-orange-600 text-primary-foreground flex items-center justify-center shadow-lg mb-3">
                      <h.icon className="h-6 w-6" />
                    </div>
                    <Badge className="bg-primary text-primary-foreground mb-2 text-[10px]">
                      <Sparkles className="h-2.5 w-2.5 mr-1" /> {h.badge}
                    </Badge>
                    <h4 className="font-bold text-base md:text-lg leading-tight mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                      {h.title}
                    </h4>
                    <p className="text-xs md:text-sm text-muted-foreground leading-snug">{h.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}





        {/* DIFERENCIAIS, gatilhos do time */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          className="rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-card to-secondary/30 p-5 md:p-6 mb-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-border" />
            <Badge className="bg-background border border-primary/40 text-primary">
              <Crown className="h-3 w-3 mr-1" /> Por que é diferente de qualquer agência
            </Badge>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DIFFERENTIALS.map((d, i) => (
              <motion.div
                key={d.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + i * 0.07 }}
                className="flex gap-3 rounded-xl bg-background/70 border border-border p-3 hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <d.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm leading-tight">{d.title}</div>
                  <div className="text-xs text-muted-foreground leading-snug mt-0.5">{d.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* IMPLEMENTAÇÃO DE CONTAS DE ANÚNCIOS, passo a passo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }}
          className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-orange-500/5 p-5 md:p-6 mb-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-primary text-primary-foreground">
              <Rocket className="h-3 w-3 mr-1" /> Implementação gratuita de contas de anúncios
            </Badge>
          </div>
          <h3 className="text-xl md:text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            Você não precisa entender nada de Meta Ads. Cuidamos de tudo.
          </h3>
          <p className="text-xs md:text-sm text-muted-foreground mb-4">
            Estrutura completa montada do zero pelo nosso time, pronta para rodar anúncios profissionais.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { n: 1, t: 'Página + Instagram', d: 'Se não tiver, criamos a página do Facebook do cliente e integramos com o Instagram.' },
              { n: 2, t: 'Business Suite + Conta empresarial', d: 'Criamos o Meta Business Suite e configuramos a conta empresarial completa.' },
              { n: 3, t: 'Pixel do Meta Ads', d: 'Criação do Pixel e integração com site e WhatsApp para rastrear todas as conversões.' },
              { n: 4, t: 'Conta de Anúncios + Públicos', d: 'Criamos a conta de anúncios, configuramos os públicos e deixamos tudo pronto para os primeiros criativos.' },
            ].map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 + i * 0.08 }}
                className="relative rounded-xl border border-primary/20 bg-background/80 p-3.5 hover:border-primary/60 transition-all"
              >
                <div className="absolute -top-2.5 -left-2.5 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-orange-600 text-primary-foreground flex items-center justify-center text-xs font-bold shadow-lg">
                  {s.n}
                </div>
                <div className="font-bold text-sm leading-tight mb-1 mt-1">{s.t}</div>
                <div className="text-[11px] md:text-xs text-muted-foreground leading-snug">{s.d}</div>
              </motion.div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-primary/10 border border-primary/30 p-3">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs md:text-sm">
              <strong>Resultado:</strong> no fim da implementação, sua empresa tem página, Business Suite, pixel rastreando, conta de anúncios e públicos configurados, pronta para receber os primeiros anúncios profissionais.
            </p>
          </div>
        </motion.div>


        {/* LISTA COMPLETA, colapsada visualmente */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Lista completa dos serviços inclusos</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((cat, idx) => (
              <div
                key={cat.title}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-center gap-2 mb-2.5 pb-2.5 border-b border-border">
                  <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <cat.icon className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-bold text-sm truncate" style={{ fontFamily: 'var(--font-display)' }}>{cat.title}</h3>
                </div>
                <ul className="space-y-1.5">
                  {cat.items.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </Slide>
  );
}


function StageInvest({ plan, pricing, promo, applyPromo = true }: { plan: any; pricing: any; promo: any; applyPromo?: boolean }) {
  const { semestral, anual, sem, an, diffMes, totalEconomia, pct } = pricing;
  const promoAnualMes = applyPromo ? pricing.promoAnualMes : null;
  const promoSemMes = applyPromo ? pricing.promoSemMes : null;
  const semPromo = pricing.semPromo || promo;
  const hasPromo = !!promo && applyPromo;

  return (
    <Slide>
      <div className="w-full">
        {/* PROMO HERO */}
        {hasPromo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-3xl text-white px-5 py-4 md:px-7 md:py-5 mb-5 shadow-2xl"
          >
            <motion.div
              className="absolute inset-0 -z-10"
              style={{ backgroundSize: '300% 300%' }}
              animate={{
                background: [
                  'linear-gradient(135deg, #facc15, #f97316, #ef4444)',
                  'linear-gradient(135deg, #ef4444, #facc15, #f97316)',
                  'linear-gradient(135deg, #f97316, #ef4444, #facc15)',
                  'linear-gradient(135deg, #facc15, #f97316, #ef4444)',
                ],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 pointer-events-none"
              initial={{ x: '-100%' }} animate={{ x: '500%' }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }}
            />
            <div className="relative flex items-center gap-4 flex-wrap">
              <motion.div animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 3, repeat: Infinity }} className="text-3xl md:text-4xl drop-shadow-lg">
                🚀
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] md:text-xs uppercase tracking-wider opacity-90 font-semibold">Promoção ativa</div>
                <div className="text-lg md:text-2xl font-bold leading-tight drop-shadow" style={{ fontFamily: 'var(--font-display)' }}>
                  {promo.title}
                </div>
              </div>
              <Badge className="bg-white text-orange-600 font-bold shadow-lg text-base md:text-xl px-3 py-1.5">
                {promo.discount_percent}% OFF
              </Badge>
            </div>
          </motion.div>
        )}

        {/* PREÇOS */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          {/* SEMESTRAL */}
          <motion.div
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className={`relative rounded-3xl p-5 md:p-7 border-2 bg-card ${promoSemMes !== null ? 'border-orange-500 shadow-xl' : 'border-border'}`}
          >
            {promoSemMes !== null && (
              <Badge className="absolute -top-3 left-5 bg-orange-500 text-white font-bold shadow-lg">
                🔥 {semPromo?.discount_percent}% OFF
              </Badge>
            )}
            <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
              Contrato {semestral.label}
            </div>
            {promoSemMes !== null ? (
              <>
                {(() => {
                  const meses = Math.min(6, semPromo?.duration_months || 6);
                  const economiaMes = sem - promoSemMes;
                  const totalSem = economiaMes * meses;
                  return (
                    <>
                      {/* PREÇO FINAL GIGANTE */}
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base md:text-lg line-through text-muted-foreground">{brl(sem)}/mês</span>
                          <Badge className="bg-orange-500 text-white font-bold">-{semPromo?.discount_percent}%</Badge>
                        </div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Você paga apenas</div>
                        <div className="flex items-baseline gap-2 leading-none">
                          <span className="text-6xl md:text-7xl font-extrabold text-orange-600 drop-shadow-sm" style={{ fontFamily: 'var(--font-display)' }}>{brl(promoSemMes)}</span>
                          <span className="text-base text-muted-foreground font-semibold">/mês</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-orange-500 text-white p-3 text-center shadow-lg">
                          <div className="text-[10px] uppercase tracking-wider opacity-90 font-semibold">Deixa de pagar</div>
                          <div className="text-xl md:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{brl(economiaMes)}<span className="text-xs font-medium opacity-90">/mês</span></div>
                        </div>
                        <div className="rounded-xl bg-gradient-to-br from-orange-600 to-red-600 text-white p-3 text-center shadow-lg">
                          <div className="text-[10px] uppercase tracking-wider opacity-90 font-semibold">Economia total</div>
                          <div className="text-xl md:text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{brl(totalSem)}</div>
                          <div className="text-[10px] opacity-90">em {meses} {meses === 1 ? 'mês' : 'meses'}</div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl md:text-5xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>{semestral.monthly}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
                <div className="text-sm text-muted-foreground">Mais flexibilidade, contrato mais curto.</div>
              </>
            )}
          </motion.div>

          {/* ANUAL */}
          <motion.div
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="relative rounded-3xl p-5 md:p-7 border-2 border-primary bg-gradient-to-br from-primary via-orange-600 to-primary text-primary-foreground shadow-2xl"
          >
            <Badge className="absolute -top-3 left-5 bg-yellow-300 text-yellow-950 font-bold shadow-lg">
              <Crown className="h-3 w-3 mr-1" /> Recomendado
            </Badge>
            <div className="text-xs font-semibold mb-2 opacity-90 uppercase tracking-wider">
              Contrato {anual.label}, melhor custo
            </div>
            {promoAnualMes !== null ? (
              <>
                {(() => {
                  const meses = Math.min(12, promo.duration_months || 12);
                  const economiaMes = an - promoAnualMes;
                  const totalAnual = economiaMes * meses;
                  return (
                    <>
                      {/* PREÇO FINAL GIGANTE */}
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-base md:text-lg line-through opacity-80">{brl(an)}/mês</span>
                          <Badge className="bg-yellow-300 text-yellow-950 font-bold">-{promo.discount_percent}%</Badge>
                        </div>
                        <div className="text-[11px] uppercase tracking-wider opacity-90 font-semibold">Você paga apenas</div>
                        <div className="flex items-baseline gap-2 leading-none">
                          <span className="text-7xl md:text-8xl font-extrabold text-yellow-200 leading-none drop-shadow-lg" style={{ fontFamily: 'var(--font-display)' }}>
                            {brl(promoAnualMes)}
                          </span>
                          <span className="text-base opacity-90 font-semibold">/mês</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-yellow-300 text-yellow-950 p-3 text-center shadow-lg">
                          <div className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Deixa de pagar</div>
                          <div className="text-xl md:text-2xl font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{brl(economiaMes)}<span className="text-xs font-bold opacity-80">/mês</span></div>
                        </div>
                        <div className="rounded-xl bg-white text-orange-600 p-3 text-center shadow-lg">
                          <div className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Economia total</div>
                          <div className="text-xl md:text-2xl font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{brl(totalAnual)}</div>
                          <div className="text-[10px] opacity-80 font-semibold">em {meses} {meses === 1 ? 'mês' : 'meses'}</div>
                        </div>
                      </div>
                    </>
                  );
                })()}
                <div className="text-xs font-semibold text-yellow-100 mt-3">
                  🔥 {promo.discount_percent}% válido nos primeiros {promo.duration_months} {promo.duration_months === 1 ? 'mês' : 'meses'}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-5xl md:text-6xl font-bold leading-none" style={{ fontFamily: 'var(--font-display)' }}>{anual.monthly}</span>
                  <span className="text-sm opacity-80">/mês</span>
                </div>
                <div className="inline-flex items-center gap-1.5 bg-yellow-300 text-yellow-950 rounded-full px-3 py-1 text-xs font-bold mb-2">
                  <PiggyBank className="h-3.5 w-3.5" /> Economiza {brl(diffMes)}/mês ({pct}%)
                </div>
                <div className="text-sm opacity-90 mt-1">Economia total: <strong>{brl(totalEconomia)}</strong> no ano.</div>
              </>
            )}
          </motion.div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
        >
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
              hasPromo ? `Olá! Quero garantir a promoção ${promo.title} no plano ${plan.name}.`
                       : `Olá! Quero fechar o plano ${plan.name}.`
            )}`}
            target="_blank" rel="noreferrer"
            className="h-12 px-7 rounded-full bg-[#25D366] text-white font-bold shadow-2xl hover:scale-105 transition-all flex items-center gap-2"
          >
            <MessageCircle className="h-5 w-5" />
            {hasPromo ? 'Quero garantir essa promoção' : `Quero o ${plan.name}`}
            <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>
      </div>
    </Slide>
  );
}

function StagePromoStory({ plan, promo }: { plan: any; promo: any }) {
  const reasons = [
    { icon: Rocket, title: 'Promoção de Inauguração', desc: 'Estamos chegando agora na sua cidade e queremos os primeiros cases de sucesso. Por isso liberamos uma condição que não vai se repetir.' },
    { icon: Award, title: 'Apenas 10 vagas por cidade', desc: 'A promoção vale somente para as 10 primeiras empresas que fecharem conosco na cidade. Depois disso, encerra — sem exceção.' },
    { icon: Target, title: 'Queremos provar nosso método', desc: 'Estrutura completa, roteiros frase a frase, gravação direcionada e estratégia focada em vendas — sem terceirizar culpa.' },
    { icon: Zap, title: 'Janela curta de entrada', desc: 'A promoção encerra assim que preenchermos as vagas da cidade. Depois disso volta ao valor cheio.' },
  ];
  const scarcity = [
    { label: 'Desconto', value: `${promo.discount_percent}% OFF` },
    { label: 'Válido por', value: `${promo.duration_months} ${promo.duration_months === 1 ? 'mês' : 'meses'}` },
    { label: 'Vagas', value: 'Apenas 10' },
  ];
  return (
    <Slide>
      <div className="w-full max-w-5xl relative">
        {/* glow background */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}
          className="absolute inset-0 -z-10 pointer-events-none"
        >
          <div className="absolute top-0 left-1/4 w-[420px] h-[420px] rounded-full bg-orange-500/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-[420px] h-[420px] rounded-full bg-red-500/20 blur-3xl animate-pulse" style={{ animationDelay: '1.2s' }} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          className="text-center mb-6"
        >
          <motion.div
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 14 }}
            className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-xs md:text-sm uppercase tracking-wider shadow-lg shadow-orange-500/40"
          >
            <motion.span
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1 }}
            >
              <Sparkles className="h-4 w-4" />
            </motion.span>
            Oportunidade única
          </motion.div>
          <h2 className="text-4xl md:text-6xl font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Por que essa <br className="md:hidden" />
            <motion.span
              initial={{ backgroundPosition: '0% 50%' }}
              animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              className="bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 bg-clip-text text-transparent"
              style={{ backgroundSize: '200% 200%' }}
            >
              {promo.title}
            </motion.span>
            <br />existe agora?
          </h2>
          <p className="mt-3 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Não é desconto aleatório. É uma condição estratégica com <strong className="text-foreground">prazo, motivo e quantidade limitada</strong>.
          </p>
        </motion.div>

        {/* Scarcity bar */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25, type: 'spring' }}
          className="grid grid-cols-3 gap-2 md:gap-4 mb-6"
        >
          {scarcity.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.08, type: 'spring', stiffness: 180 }}
              whileHover={{ y: -4, scale: 1.03 }}
              className="relative overflow-hidden rounded-2xl border-2 border-orange-500/50 bg-gradient-to-br from-orange-500/10 to-red-500/5 p-3 md:p-4 text-center shadow-lg shadow-orange-500/10"
            >
              <motion.div
                aria-hidden
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5 + i * 0.5, ease: 'easeInOut' }}
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
              />
              <div className="relative text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</div>
              <div className="relative text-lg md:text-2xl font-extrabold text-orange-600 mt-1" style={{ fontFamily: 'var(--font-display)' }}>{s.value}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Vagas progress bar */}
        {(() => {
          const total = promo.max_redemptions || 10;
          const filled = Math.min(promo.redemptions_count ?? 2, total);
          const remaining = Math.max(total - filled, 0);
          const pct = (filled / total) * 100;
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="mb-6 rounded-2xl border-2 border-orange-500/40 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent p-4 md:p-5 shadow-lg shadow-orange-500/10"
            >
              <div className="flex items-end justify-between mb-2 gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground font-semibold">Vagas preenchidas na cidade</div>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                    <span className="text-orange-600">{filled}</span>
                    <span className="text-muted-foreground"> / {total}</span>
                  </div>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                  className="px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs md:text-sm font-bold shadow-md"
                >
                  {remaining > 0 ? `Restam apenas ${remaining} vagas` : 'Esgotado'}
                </motion.div>
              </div>
              <div className="relative h-4 md:h-5 rounded-full bg-muted overflow-hidden border border-orange-500/30">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.5, duration: 1.2, ease: 'easeOut' }}
                  className="relative h-full bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 rounded-full"
                >
                  <motion.div
                    aria-hidden
                    animate={{ x: ['-100%', '300%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent skew-x-12"
                  />
                </motion.div>
                {Array.from({ length: total - 1 }).map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 w-px bg-background/40" style={{ left: `${((i + 1) / total) * 100}%` }} />
                ))}
              </div>
              <div className="mt-2 text-xs md:text-sm text-muted-foreground">
                A promoção encerra quando completarmos <strong className="text-foreground">{total} clientes fechados</strong> nesta cidade.
              </div>
            </motion.div>
          );
        })()}


        {/* Reasons */}
        <div className="grid sm:grid-cols-2 gap-3 md:gap-4">
          {reasons.map((r, i) => {
            const RIcon = r.icon;
            return (
              <motion.div
                key={r.title}
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.1, type: 'spring', stiffness: 140, damping: 18 }}
                whileHover={{ y: -4, borderColor: 'rgb(249 115 22 / 0.6)' }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 md:p-5 hover:shadow-xl hover:shadow-orange-500/10 transition-all"
              >
                <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-orange-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-start gap-3">
                  <motion.div
                    whileHover={{ rotate: 8, scale: 1.1 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                    className="shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 text-white flex items-center justify-center shadow-md shadow-orange-500/30"
                  >
                    <RIcon className="h-5 w-5" />
                  </motion.div>
                  <div>
                    <div className="font-bold text-base md:text-lg mb-1">{r.title}</div>
                    <div className="text-sm text-muted-foreground leading-relaxed">{r.desc}</div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
          className="mt-6 text-center text-sm md:text-base text-muted-foreground"
        >
          Aperte <kbd className="px-2 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-xs">↓</kbd> para ver o <strong className="text-orange-600">{plan.name}</strong> com o desconto aplicado.
        </motion.div>
      </div>
    </Slide>
  );
}



function Row({ label, value, dark }: { label: string; value: React.ReactNode; dark?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={dark ? 'opacity-90' : 'text-muted-foreground'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ==================== STAGE: COMPARATIVO DE SERVIÇOS AVULSOS ====================
type Svc = { name: string; qty: number; unit: string; unitPrice: number; oneTime?: boolean; note?: string };

function buildServicesForPlan(planKey: string): Svc[] {
  const REELS = 350, ARTE = 70, TRAFEGO = 1500, SOCIAL = 850, IMPL_ADS = 700, REFORM = 700,
        CRM_MES = 367, CRM_IMPL = 900, EVENTO = 1700, TREINO = 2750; // média 2500-3000

  switch (planKey) {
    case 'starter':
      return [
        { name: 'Reels profissionais', qty: 4, unit: 'reels/mês', unitPrice: REELS },
        { name: 'Artes para feed/stories', qty: 2, unit: 'artes/mês', unitPrice: ARTE },
        { name: 'Gestão de tráfego pago', qty: 1, unit: 'mês', unitPrice: TRAFEGO },
        { name: 'Implementação de contas de anúncios', qty: 1, unit: 'única', unitPrice: IMPL_ADS, oneTime: true },
      ];
    case 'boost':
      return [
        { name: 'Reels profissionais', qty: 6, unit: 'reels/mês', unitPrice: REELS },
        { name: 'Artes + posts', qty: 6, unit: 'artes/mês', unitPrice: ARTE },
        { name: 'Reformulação completa de perfil', qty: 1, unit: 'única', unitPrice: REFORM, oneTime: true },
        { name: 'Social media dedicado', qty: 1, unit: 'perfil/mês', unitPrice: SOCIAL },
        { name: 'Gestão de tráfego (Google + Meta)', qty: 1, unit: 'mês', unitPrice: TRAFEGO },
        { name: 'Implementação de contas de anúncios', qty: 1, unit: 'única', unitPrice: IMPL_ADS, oneTime: true },
      ];
    case 'premium':
      return [
        { name: 'Reels profissionais', qty: 8, unit: 'reels/mês', unitPrice: REELS },
        { name: 'Artes mensais', qty: 6, unit: 'artes/mês', unitPrice: ARTE },
        { name: 'Social media dedicado', qty: 1, unit: 'perfil/mês', unitPrice: SOCIAL },
        { name: 'Gestão de tráfego avançada', qty: 1, unit: 'mês', unitPrice: TRAFEGO },
        { name: 'CRM AtendeClique (Face + Insta + WhatsApp)', qty: 1, unit: 'mês', unitPrice: CRM_MES },
        { name: 'Implementação do CRM', qty: 1, unit: 'única', unitPrice: CRM_IMPL, oneTime: true },
        { name: 'Treinamento comercial + acompanhamento', qty: 1, unit: 'mês', unitPrice: TREINO },
      ];
    case 'elite':
      return [
        { name: 'Reels profissionais', qty: 12, unit: 'reels/mês', unitPrice: REELS },
        { name: 'Artes mensais', qty: 8, unit: 'artes/mês', unitPrice: ARTE },
        { name: 'Social media dedicado', qty: 1, unit: 'perfil/mês', unitPrice: SOCIAL },
        { name: 'Gestão de tráfego premium (Google + Meta)', qty: 1, unit: 'mês', unitPrice: TRAFEGO },
        { name: 'CRM AtendeClique (Face + Insta + WhatsApp)', qty: 1, unit: 'mês', unitPrice: CRM_MES },
        { name: 'Implementação do CRM', qty: 1, unit: 'única', unitPrice: CRM_IMPL, oneTime: true },
        { name: 'Treinamento comercial recorrente', qty: 1, unit: 'mês', unitPrice: TREINO },
        { name: 'Cobertura de evento (3h + reels final)', qty: 1, unit: 'evento', unitPrice: EVENTO, oneTime: true, note: 'quando houver ação/lançamento' },
      ];
    default:
      return [];
  }
}

function StageComparison({ plan, pricing, promo }: { plan: any; pricing: any; promo: any }) {
  const services = buildServicesForPlan(plan.key);
  const monthly = services.filter((s) => !s.oneTime).reduce((acc, s) => acc + s.qty * s.unitPrice, 0);
  const oneTime = services.filter((s) => s.oneTime).reduce((acc, s) => acc + s.qty * s.unitPrice, 0);
  const avulsoTotal12 = monthly * 12 + oneTime;

  const planMonthly = promo && pricing.promoAnualMes ? pricing.promoAnualMes : pricing.an;
  const planTotal12 = planMonthly * 12;
  const savingsMonthly = Math.max(monthly - planMonthly, 0);
  const savings12 = Math.max(avulsoTotal12 - planTotal12, 0);
  const savingsPct = monthly > 0 ? Math.round((savingsMonthly / monthly) * 100) : 0;

  const pillars = [
    { icon: Users, title: 'Time de 10 especialistas', desc: 'Designer, videomakers, editores, social media, tráfego e comercial — todos dedicados ao seu resultado.' },
    { icon: Zap, title: 'Gestão profissional de tarefas', desc: 'Sistema próprio com prazos, responsáveis e SLA. Cada entrega acompanhada em tempo real.' },
    { icon: Award, title: 'Compromisso com entrega', desc: 'O contrato existe só para diluir o investimento e torná-lo acessível. Se não entregarmos o combinado, você não paga o que não recebeu.' },
  ];

  return (
    <Slide>
      <div className="w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          className="text-center mb-6"
        >
          <Badge variant="outline" className="mb-3 uppercase tracking-wider text-[10px] md:text-xs">
            <PiggyBank className="h-3.5 w-3.5 mr-1" /> Tabela oficial de serviços avulsos
          </Badge>
          <h2 className="text-3xl md:text-5xl font-extrabold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            E se você contratasse <br className="md:hidden" />
            <span className="bg-gradient-to-r from-primary via-orange-500 to-red-500 bg-clip-text text-transparent">
              cada serviço avulso?
            </span>
          </h2>
          <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-3xl mx-auto">
            Estes são os valores que a <strong className="text-foreground">Pulse</strong> pratica para clientes que optam por contratar serviços avulsos. Somando tudo que está incluso no <strong className="text-foreground">{plan.name}</strong>, veja quanto sairia.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-4 md:gap-6">
          {/* Tabela de serviços */}
          <motion.div
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
            className="lg:col-span-3 rounded-2xl border border-border bg-card overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <div className="font-semibold text-sm md:text-base">Contratação avulsa na Pulse</div>
            </div>
            <div className="divide-y divide-border">
              {services.map((s, i) => (
                <motion.div
                  key={s.name}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.04 }}
                  className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm md:text-base">{s.name}</div>
                    <div className="text-[11px] md:text-xs text-muted-foreground">
                      {s.qty} × {brl(s.unitPrice)} / {s.unit}
                      {s.note && <span className="ml-1 italic">({s.note})</span>}
                      {s.oneTime && <span className="ml-1 text-orange-600 font-semibold">• pagamento único</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-sm md:text-base tabular-nums">{brl(s.qty * s.unitPrice)}</div>
                    <div className="text-[10px] md:text-xs text-muted-foreground">{s.oneTime ? 'setup' : '/ mês'}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border bg-muted/40 space-y-1">
              <Row label="Total mensal avulso" value={<span className="font-bold tabular-nums">{brl(monthly)}/mês</span>} />
              {oneTime > 0 && <Row label="Setup / one-time" value={<span className="font-bold tabular-nums">{brl(oneTime)}</span>} />}
            </div>
          </motion.div>

          {/* Card economia + plano Pulse */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
            className="lg:col-span-2 rounded-2xl border-2 border-primary/60 bg-gradient-to-br from-primary/10 via-orange-500/5 to-transparent p-5 md:p-6 flex flex-col shadow-xl shadow-primary/10"
          >
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Com o {plan.name}</div>
            <div className="mt-1 text-4xl md:text-5xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
              {brl(planMonthly)}
              <span className="text-base md:text-lg font-medium text-muted-foreground">/mês</span>
            </div>
            <div className="mt-1 text-xs md:text-sm text-muted-foreground line-through tabular-nums">
              Avulso: {brl(monthly)}/mês
            </div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: 'spring' }}
              className="mt-4 rounded-xl bg-gradient-to-r from-primary to-orange-500 text-white p-4 shadow-lg"
            >
              <div className="text-[10px] md:text-xs uppercase tracking-wider opacity-90 font-semibold">Você economiza</div>
              <div className="text-2xl md:text-3xl font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                {brl(savingsMonthly)}/mês
              </div>
              <div className="text-xs md:text-sm opacity-95">
                {savingsPct}% mais barato que contratar avulso.
              </div>
              <div className="mt-3 pt-3 border-t border-white/20 space-y-0.5">
                <div className="flex items-center justify-between text-[11px] md:text-xs opacity-95">
                  <span>Avulso em 12 meses{oneTime > 0 ? ' (+ setup)' : ''}</span>
                  <span className="font-semibold tabular-nums line-through">{brl(avulsoTotal12)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] md:text-xs opacity-95">
                  <span>Plano em 12 meses</span>
                  <span className="font-semibold tabular-nums">{brl(planTotal12)}</span>
                </div>
                <div className="flex items-center justify-between text-sm md:text-base font-extrabold mt-1">
                  <span>Economia total no contrato</span>
                  <span className="tabular-nums">{brl(savings12)}</span>
                </div>
              </div>
            </motion.div>


            <div className="mt-4 text-xs md:text-sm text-muted-foreground leading-relaxed">
              Sem contar coordenação, gestão de qualidade, retrabalho, prazos e o risco de cada fornecedor entregar em ritmo diferente.
            </div>
          </motion.div>
        </div>

        {/* Pilares: time + contrato */}
        <div className="grid md:grid-cols-3 gap-3 md:gap-4 mt-5">
          {pillars.map((p, i) => {
            const PIcon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 + i * 0.1, type: 'spring', stiffness: 160, damping: 18 }}
                className="rounded-2xl border border-border bg-card p-4 md:p-5 hover:border-primary/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-orange-500 text-white flex items-center justify-center mb-2 shadow-md">
                  <PIcon className="h-5 w-5" />
                </div>
                <div className="font-bold text-sm md:text-base mb-1">{p.title}</div>
                <div className="text-xs md:text-sm text-muted-foreground leading-relaxed">{p.desc}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Slide>
  );
}

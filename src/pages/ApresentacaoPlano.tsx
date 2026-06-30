import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Check, ArrowRight, ArrowLeft, Sparkles, Target, TrendingUp,
  Calendar, BarChart3, Palette, X, Film, Image as ImageIcon, Megaphone, PenTool,
  Crown, PiggyBank, MessageCircle, Link2, ChevronDown, ChevronUp, Rocket, Users,
  PlayCircle, Award, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getPlan, PLANS } from '@/data/plans';
import { useCity } from '@/contexts/CityContext';

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

// stages: 4 sem promo, 6 com promo (preço normal → storytelling promo → preço com promo)
const getTotalStages = (hasPromo: boolean) => (hasPromo ? 6 : 4);

export default function ApresentacaoPlano() {
  const { plano } = useParams<{ plano: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/p/');
  const baseRoute = isPublic ? '/p/planos' : '/apresentacao';
  const [stage, setStage] = useState(0);
  const [promo, setPromo] = useState<any | null>(null);
  const [semPromo, setSemPromo] = useState<any | null>(null);
  const { activeCity } = useCity();

  const plan = plano ? getPlan(plano) : undefined;

  useEffect(() => { setStage(0); }, [plano]);

  useEffect(() => {
    if (!plan) return;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
          .from('plan_promotions' as any)
          .select('*')
          .eq('active', true)
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
  }, [plan, activeCity]);

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
  }, [prevKey, nextKey]);

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
      <div className="absolute inset-0 pt-20 pb-20 overflow-hidden">
        <motion.div
          animate={{ y: `-${stage * 100}%` }}
          transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
          className="h-full w-full"
        >
          <div className="h-full w-full px-4 md:px-8 flex items-center justify-center">
            <StageIntro />
          </div>
          <div className="h-full w-full px-4 md:px-8 flex items-center justify-center">
            <StagePlan plan={plan} Icon={Icon} />
          </div>
          <div className="h-full w-full px-4 md:px-8 flex items-center justify-center">
            <StageDeliveries plan={plan} categories={categories} />
          </div>
          <div className="h-full w-full px-4 md:px-8 flex items-center justify-center">
            {pricing && <StageInvest plan={plan} pricing={pricing} promo={promo} applyPromo={false} />}
          </div>
          {promo && (
            <>
              <div className="h-full w-full px-4 md:px-8 flex items-center justify-center">
                <StagePromoStory plan={plan} promo={promo} />
              </div>
              <div className="h-full w-full px-4 md:px-8 flex items-center justify-center">
                {pricing && <StageInvest plan={plan} pricing={pricing} promo={promo} applyPromo={true} />}
              </div>
            </>
          )}
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
      className="w-full h-full max-w-7xl mx-auto flex items-center justify-center"
    >
      {children}
    </motion.div>
  );
}

function StageIntro() {
  const items = [
    { icon: Film, title: 'Produção audiovisual', desc: 'Reels, vídeos e criativos com roteiro, gravação e edição própria.' },
    { icon: PenTool, title: 'Conteúdo estratégico', desc: 'Linha editorial, design e copy alinhados ao seu posicionamento.' },
    { icon: Megaphone, title: 'Tráfego pago', desc: 'Meta Ads e Google Ads com gestão diária e dashboards em tempo real.' },
    { icon: BarChart3, title: 'Gestão & relatórios', desc: 'Portal do cliente, CRM e acompanhamento mensal de resultados.' },
  ];
  return (
    <Slide>
      <div className="w-full text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Badge className="mb-5 bg-primary/10 text-primary border-primary/20">
            <Sparkles className="h-3 w-3 mr-1" /> Quem somos
          </Badge>
        </motion.div>
        <motion.h1
          className="text-4xl sm:text-5xl md:text-7xl font-bold leading-[1.05] mb-5"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        >
          A <span className="bg-gradient-to-r from-primary via-orange-500 to-primary bg-clip-text text-transparent">Pulse Growth Marketing</span><br />
          opera o digital da sua empresa <span className="text-primary">de ponta a ponta</span>.
        </motion.h1>
        <motion.p
          className="text-base md:text-xl text-muted-foreground max-w-3xl mx-auto mb-10"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
        >
          Time próprio de estratégia, produção, mídia paga e comercial.
          Você ganha previsibilidade, presença diária e dados pra decidir.
        </motion.p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 max-w-5xl mx-auto">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="rounded-2xl border border-border bg-card/80 backdrop-blur p-4 md:p-5 text-left hover:border-primary/50 hover:shadow-lg transition-all"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <it.icon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <div className="font-bold text-sm md:text-base mb-1">{it.title}</div>
              <div className="text-xs md:text-sm text-muted-foreground">{it.desc}</div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
          className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4 animate-bounce text-primary" />
          Pressione <kbd className="px-2 py-0.5 rounded bg-secondary border border-border font-mono text-xs">↓</kbd> para conhecer o plano
        </motion.div>
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
            <Stat icon={Award} label="Entregas/mês" value={plan.features.length} highlight />
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

        {/* LISTA COMPLETA, colapsada visualmente */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Lista completa das {plan.features.length} entregas mensais</span>
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
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-5xl md:text-6xl font-bold text-yellow-200 leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                    {brl(promoAnualMes)}
                  </span>
                  <span className="text-sm opacity-80">/mês</span>
                </div>
                {(() => {
                  const meses = Math.min(12, promo.duration_months || 12);
                  const economiaMes = an - promoAnualMes;
                  const totalAnual = economiaMes * meses;
                  return (
                    <>
                      <div className="rounded-xl border border-white/30 bg-white/10 backdrop-blur p-3 space-y-1.5 text-sm mb-3">
                        <Row label="De" value={<span className="line-through opacity-80">{brl(an)}/mês</span>} dark />
                        <Row label="Promo" value={<Badge className="bg-yellow-300 text-yellow-950">-{promo.discount_percent}%</Badge>} dark />
                        <Row label="Vs semestral" value={<span className="font-semibold">+{brl(diffMes)}/mês</span>} dark />
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
    { icon: Rocket, title: 'Promoção de Inauguração', desc: 'Estamos chegando na sua cidade e queremos os primeiros cases de sucesso. Por isso liberamos um desconto que não vai se repetir.' },
    { icon: Award, title: 'Vagas limitadas por cidade', desc: 'Trabalhamos com poucos clientes por região para garantir dedicação total da equipe a cada projeto.' },
    { icon: Zap, title: 'Estrutura completa desde o início', desc: 'Roteiros frase a frase, gravação direcionada, edição profissional e estratégia de conteúdo focada em vendas.' },
  ];
  const scarcity = [
    { label: 'Desconto', value: `${promo.discount_percent}% OFF` },
    { label: 'Válido por', value: `${promo.duration_months} ${promo.duration_months === 1 ? 'mês' : 'meses'}` },
    { label: 'Vagas', value: 'Limitadas' },
  ];
  return (
    <Slide>
      <div className="w-full max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <Badge className="mb-3 bg-orange-500/10 text-orange-600 border-orange-500/30 uppercase tracking-wider">
            <Sparkles className="h-3 w-3 mr-1" /> Oportunidade única
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Promoção <span className="bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 bg-clip-text text-transparent">{promo.title}</span>
          </h2>
          <p className="mt-3 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Antes de mostrar o valor com desconto, entenda <strong>por que</strong> essa condição existe e por que ela vai acabar.
          </p>
        </motion.div>

        {/* Scarcity bar */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}
          className="grid grid-cols-3 gap-2 md:gap-4 mb-6"
        >
          {scarcity.map((s) => (
            <div key={s.label} className="rounded-2xl border-2 border-orange-500/40 bg-orange-500/5 p-3 md:p-4 text-center">
              <div className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</div>
              <div className="text-lg md:text-2xl font-bold text-orange-600 mt-1" style={{ fontFamily: 'var(--font-display)' }}>{s.value}</div>
            </div>
          ))}
        </motion.div>

        {/* Reasons */}
        <div className="grid md:grid-cols-3 gap-3 md:gap-4">
          {reasons.map((r, i) => {
            const RIcon = r.icon;
            return (
              <motion.div
                key={r.title}
                initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.1 }}
                className="rounded-2xl border border-border bg-card p-4 md:p-5 hover:border-orange-500/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center mb-3">
                  <RIcon className="h-5 w-5" />
                </div>
                <div className="font-bold text-base md:text-lg mb-1">{r.title}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{r.desc}</div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
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

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const TOTAL_STAGES = 4;

export default function ApresentacaoPlano() {
  const { plano } = useParams<{ plano: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/p/');
  const baseRoute = isPublic ? '/p/planos' : '/apresentacao';
  const [stage, setStage] = useState(0);
  const [promo, setPromo] = useState<any | null>(null);
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
        setPromo(matches[0] || null);
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
  const nextStage = () => setStage((s) => Math.min(s + 1, TOTAL_STAGES - 1));
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
      else if (e.key === 'End') { e.preventDefault(); setStage(TOTAL_STAGES - 1); }
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
    const promoTargetSem = promo && (promo.applies_to === 'semestral' || promo.applies_to === 'ambos');
    const promoAnualMes = promoTargetAnnual ? an * (1 - Number(promo.discount_percent) / 100) : null;
    const promoSemMes = promoTargetSem ? sem * (1 - Number(promo.discount_percent) / 100) : null;
    return { semestral, anual, sem, an, diffMes, totalEconomia, pct, promoAnualMes, promoSemMes };
  }, [plan, promo]);

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
        {Array.from({ length: TOTAL_STAGES }).map((_, i) => (
          <button
            key={i}
            onClick={() => setStage(i)}
            className={`h-1.5 rounded-full transition-all ${i === stage ? 'w-10 bg-primary' : 'w-4 bg-border hover:bg-primary/40'}`}
            aria-label={`Etapa ${i + 1}`}
          />
        ))}
      </div>

      {/* SLIDE */}
      <div className="absolute inset-0 pt-20 pb-20 px-4 md:px-8 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {stage === 0 && <StageIntro key="s0" />}
          {stage === 1 && <StagePlan key="s1" plan={plan} Icon={Icon} />}
          {stage === 2 && <StageDeliveries key="s2" plan={plan} categories={categories} />}
          {stage === 3 && pricing && <StageInvest key="s3" plan={plan} pricing={pricing} promo={promo} />}
        </AnimatePresence>
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
          {stage < TOTAL_STAGES - 1 ? (
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
          className="relative rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-card to-primary/5 p-7 md:p-9 shadow-2xl"
        >
          <div className="absolute -top-4 left-7">
            <Badge className="bg-primary text-primary-foreground shadow-lg px-3 py-1">
              <Target className="h-3.5 w-3.5 mr-1.5" /> Ideal pra você
            </Badge>
          </div>
          <p className="text-lg md:text-2xl leading-relaxed font-medium text-foreground mt-2">
            {plan.ideal}
          </p>
          <div className="mt-6 pt-6 border-t border-border grid grid-cols-3 gap-3 text-center">
            <Stat icon={Award} label="Entregas/mês" value={plan.features.length} />
            <Stat icon={Zap} label="Time" value="Dedicado" />
            <Stat icon={Users} label="Resultado" value="Real" />
          </div>
        </motion.div>
      </div>
    </Slide>
  );
}

function Stat({ icon: I, label, value }: { icon: any; label: string; value: any }) {
  return (
    <div>
      <div className="inline-flex w-10 h-10 rounded-xl bg-primary/10 items-center justify-center mb-1">
        <I className="h-5 w-5 text-primary" />
      </div>
      <div className="text-lg md:text-xl font-bold leading-tight">{value}</div>
      <div className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function StageDeliveries({ plan, categories }: { plan: any; categories: Category[] }) {
  return (
    <Slide>
      <div className="w-full">
        <div className="text-center mb-6">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
            <Badge className="bg-primary text-primary-foreground mb-3 text-sm px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> {plan.features.length} entregas mensais
            </Badge>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-3xl md:text-6xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Tudo que está <span className="bg-gradient-to-r from-primary to-orange-500 bg-clip-text text-transparent">incluso</span> no {plan.name}
          </motion.h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 max-h-[60vh] overflow-y-auto pr-1">
          {categories.map((cat, idx) => (
            <motion.div
              key={cat.title}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.35 + idx * 0.08 }}
              className="rounded-2xl border-2 border-border bg-gradient-to-br from-card to-secondary/30 p-4 md:p-5 hover:border-primary/60 hover:shadow-xl transition-all"
            >
              <div className="flex items-center gap-2.5 mb-3 pb-3 border-b border-border">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <cat.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm md:text-base truncate" style={{ fontFamily: 'var(--font-display)' }}>{cat.title}</h3>
                  <p className="text-[10px] text-muted-foreground">{cat.items.length} {cat.items.length === 1 ? 'entrega' : 'entregas'}</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {cat.items.map((f, i) => (
                  <motion.li
                    key={f}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + idx * 0.08 + i * 0.04 }}
                    className="flex items-start gap-2 text-xs md:text-sm"
                  >
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span className="font-medium leading-snug">{f}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

function StageInvest({ plan, pricing, promo }: { plan: any; pricing: any; promo: any }) {
  const { semestral, anual, sem, an, diffMes, totalEconomia, pct, promoAnualMes, promoSemMes } = pricing;
  const hasPromo = !!promo;

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
                🔥 {promo.discount_percent}% OFF
              </Badge>
            )}
            <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
              Contrato {semestral.label}
            </div>
            {promoSemMes !== null ? (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl md:text-5xl font-bold text-orange-600" style={{ fontFamily: 'var(--font-display)' }}>{brl(promoSemMes)}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 space-y-1.5 text-sm">
                  <Row label="De" value={<span className="line-through">{brl(sem)}/mês</span>} />
                  <Row label="Desconto" value={<Badge className="bg-orange-500 text-white">-{promo.discount_percent}%</Badge>} />
                  <Row label="Você economiza" value={<span className="font-bold text-orange-600">{brl(sem - promoSemMes)}/mês</span>} />
                </div>
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
              Contrato {anual.label} — melhor custo
            </div>
            {promoAnualMes !== null ? (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-5xl md:text-6xl font-bold text-yellow-200 leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                    {brl(promoAnualMes)}
                  </span>
                  <span className="text-sm opacity-80">/mês</span>
                </div>
                <div className="rounded-xl border border-white/30 bg-white/10 backdrop-blur p-3 space-y-1.5 text-sm">
                  <Row label="De" value={<span className="line-through opacity-80">{brl(an)}/mês</span>} dark />
                  <Row label="Promo" value={<Badge className="bg-yellow-300 text-yellow-950">-{promo.discount_percent}%</Badge>} dark />
                  <Row label="Você paga" value={<span className="font-bold text-yellow-200">{brl(promoAnualMes)}/mês</span>} dark />
                  <Row label="Vs semestral" value={<span className="font-semibold">economiza +{brl(diffMes)}/mês</span>} dark />
                </div>
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

function Row({ label, value, dark }: { label: string; value: React.ReactNode; dark?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={dark ? 'opacity-90' : 'text-muted-foreground'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

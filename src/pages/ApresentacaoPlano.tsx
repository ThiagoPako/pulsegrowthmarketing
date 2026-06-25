import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import {
  Check, ArrowRight, ArrowLeft, Sparkles, Target, TrendingUp,
  Users, PlayCircle, Calendar, BarChart3, MessageSquare, Eye, Ticket, Palette, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { getPlan, PLANS } from '@/data/plans';

const PRESENTATION_ORDER: Array<'boost' | 'starter' | 'premium' | 'elite'> = [
  'boost', 'starter', 'premium', 'elite',
];

const LOGO_URL = '/pulse-logo.png';

const PORTAL_FEATURES = [
  { icon: PlayCircle, title: 'Biblioteca de Conteúdos', desc: 'Vídeos, artes e fotos em painel estilo streaming.' },
  { icon: Palette, title: 'Zona Criativa', desc: 'Roteiros, sugestões, aprovações e prioridades.' },
  { icon: Calendar, title: 'Calendário de Produção', desc: 'Gravações, publicações e tudo planejado.' },
  { icon: BarChart3, title: 'Acompanhamento de Entregas', desc: 'Visibilidade total das demandas.' },
  { icon: Ticket, title: 'Emissor de Cupons', desc: 'Cupons promocionais para campanhas.' },
  { icon: MessageSquare, title: 'Central de Comunicação', desc: 'Conversa em um único ambiente.' },
  { icon: Eye, title: 'Transparência Total', desc: 'Saiba exatamente o que está sendo executado.' },
];

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: 'easeOut' as const },
};

export default function ApresentacaoPlano() {
  const { plano } = useParams<{ plano: string }>();
  const navigate = useNavigate();
  const [team, setTeam] = useState<any[]>([]);

  const plan = plano ? getPlan(plano) : undefined;

  useEffect(() => {
    if (!plan) return;
    (async () => {
      const { data } = await supabase
        .from('team_members')
        .select('*')
        .eq('active', true)
        .order('display_order', { ascending: true });
      setTeam(data || []);
    })();
  }, [plan]);

  const currentIndex = plano ? PRESENTATION_ORDER.indexOf(plano as any) : -1;
  const prevKey = currentIndex > 0 ? PRESENTATION_ORDER[currentIndex - 1] : null;
  const nextKey = currentIndex >= 0 && currentIndex < PRESENTATION_ORDER.length - 1
    ? PRESENTATION_ORDER[currentIndex + 1]
    : null;

  const goPrev = () => { if (prevKey) { navigate(`/apresentacao/${prevKey}`); window.scrollTo({ top: 0 }); } };
  const goNext = () => { if (nextKey) { navigate(`/apresentacao/${nextKey}`); window.scrollTo({ top: 0 }); } };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); window.scrollBy({ top: window.innerHeight * 0.9, behavior: 'smooth' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); window.scrollBy({ top: -window.innerHeight * 0.9, behavior: 'smooth' }); }
      else if (e.key === 'Home') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (e.key === 'End') { e.preventDefault(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
      else if (e.key === 'Escape') { window.close(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevKey, nextKey]);

  if (!plan) return <Navigate to="/apresentacao" replace />;

  const Icon = plan.icon;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Top bar: posição + fechar */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <Badge variant="outline" className="backdrop-blur bg-background/80">
          {currentIndex + 1} / {PRESENTATION_ORDER.length}
        </Badge>
        <Button variant="outline" size="sm" onClick={() => window.close()} className="backdrop-blur bg-background/80">
          <X className="h-4 w-4 mr-1" /> Fechar
        </Button>
      </div>

      {/* Setas fixas de navegação entre planos */}
      {prevKey && (
        <button
          onClick={goPrev}
          aria-label="Plano anterior"
          className="fixed left-3 top-1/2 -translate-y-1/2 z-50 h-14 w-14 rounded-full bg-background/80 backdrop-blur border border-border shadow-lg hover:bg-primary hover:text-primary-foreground hover:scale-110 transition-all flex items-center justify-center group"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
      )}
      {nextKey && (
        <button
          onClick={goNext}
          aria-label="Próximo plano"
          className="fixed right-3 top-1/2 -translate-y-1/2 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:scale-110 transition-all flex items-center justify-center animate-pulse"
        >
          <ArrowRight className="h-6 w-6" />
        </button>
      )}

      {/* Dica de teclado */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 hidden md:flex items-center gap-3 px-4 py-2 rounded-full bg-background/80 backdrop-blur border border-border text-xs text-muted-foreground shadow">
        <span>← → trocar plano</span>
        <span className="opacity-40">•</span>
        <span>↑ ↓ rolar página</span>
        <span className="opacity-40">•</span>
        <span>Esc fechar</span>
      </div>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 -left-32 w-[600px] h-[600px] rounded-full bg-primary/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-0 -right-32 w-[600px] h-[600px] rounded-full bg-primary/30 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-orange-500/10 blur-3xl" />
        </div>

        <div className="container mx-auto px-6 text-center relative z-10">
          <motion.img src={LOGO_URL} alt="Pulse" className="h-20 mx-auto mb-6" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} />

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Badge className="mb-6 bg-primary/10 text-primary border-primary/20">
              <Sparkles className="h-3 w-3 mr-1" /> Plano apresentado
            </Badge>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center mx-auto mb-6 shadow-2xl">
            <Icon className="h-12 w-12 text-primary-foreground" />
          </motion.div>

          <motion.h1
            className="text-5xl md:text-7xl font-bold tracking-tight mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.7 }}
          >
            <span className="bg-gradient-to-r from-primary via-orange-500 to-primary bg-clip-text text-transparent">{plan.name}</span>
          </motion.h1>
          <motion.p className="text-2xl text-foreground/90 max-w-2xl mx-auto mb-4 font-semibold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            {plan.tagline}
          </motion.p>
          <motion.p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            {plan.description}
          </motion.p>

          <motion.div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            <ArrowRight className="h-4 w-4 animate-pulse" />
            Role para ver tudo que está incluso
          </motion.div>
        </div>
      </section>

      {/* PARA QUEM É */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-6 max-w-4xl">
          <motion.div {...fadeUp} className="text-center">
            <Badge variant="outline" className="mb-4">Ideal para</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              Esse plano é <span className="text-primary">perfeito</span> para você se...
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed">{plan.ideal}</p>
          </motion.div>
        </div>
      </section>

      {/* ENTREGAS */}
      <section className="py-24">
        <div className="container mx-auto px-6 max-w-5xl">
          <motion.div {...fadeUp} className="text-center mb-16">
            <Badge className="mb-4 bg-primary text-primary-foreground">{plan.features.length} entregas mensais</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Tudo que está <span className="text-primary">incluso</span>
            </h2>
            <p className="text-lg text-muted-foreground">Operação completa, sem letras miúdas, sem surpresas.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-4">
            {plan.features.map((f, i) => (
              <motion.div
                key={f}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm md:text-base font-medium pt-1">{f}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* INVESTIMENTO */}
      <section className="py-24 bg-gradient-to-b from-secondary/30 to-background">
        <div className="container mx-auto px-6 max-w-4xl">
          <motion.div {...fadeUp} className="text-center mb-12">
            <Badge variant="outline" className="mb-4">Investimento</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Escolha o <span className="text-primary">prazo de contrato</span>
            </h2>
            <p className="text-lg text-muted-foreground">Quanto maior o compromisso, melhor o investimento mensal.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {plan.pricing.map((p, i) => {
              const best = i === plan.pricing.length - 1;
              return (
                <motion.div
                  key={p.label}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className={`relative rounded-3xl p-8 border-2 transition-all hover:-translate-y-1 hover:shadow-2xl ${
                    best
                      ? 'bg-gradient-to-br from-primary to-orange-600 text-primary-foreground border-primary shadow-xl'
                      : 'bg-card border-border'
                  }`}
                >
                  {best && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background text-primary">
                      Melhor custo-benefício
                    </Badge>
                  )}
                  <div className={`text-sm font-semibold mb-2 ${best ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    Contrato de {p.label}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-5xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>{p.monthly}</span>
                    <span className={`text-sm ${best ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>/mês</span>
                  </div>
                  {p.save && (
                    <div className={`text-sm font-semibold ${best ? 'text-yellow-200' : 'text-success'}`}>
                      💰 {p.save}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS */}
      <section className="py-24">
        <div className="container mx-auto px-6 max-w-5xl">
          <motion.div {...fadeUp} className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Por que a Pulse?</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Mais que uma agência, um <span className="text-primary">time dedicado</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Target, title: 'Estratégia', desc: 'Cada conteúdo nasce de análise de público, mercado e objetivo de negócio.' },
              { icon: Sparkles, title: 'Produção', desc: 'Equipe própria de social media, designer, videomakers, editores e tráfego pago.' },
              { icon: TrendingUp, title: 'Performance', desc: 'Dashboards em tempo real, relatórios mensais e ajustes contínuos.' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="bg-card border border-border rounded-2xl p-8 hover:border-primary/40 hover:shadow-lg hover:-translate-y-1 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PORTAL */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-6 max-w-6xl">
          <motion.div {...fadeUp} className="text-center mb-16">
            <Badge variant="outline" className="mb-4">Diferencial exclusivo</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Portal do Cliente <span className="text-primary">Pulse</span>
            </h2>
            <p className="text-lg text-muted-foreground">Plataforma própria que centraliza materiais, aprovações e acompanhamentos.</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PORTAL_FEATURES.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-gradient-to-br from-card to-secondary/40 border border-border rounded-2xl p-5 hover:border-primary/50 hover:shadow-lg transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <p.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-bold mb-1">{p.title}</h3>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* EQUIPE */}
      {team.length > 0 && (
        <section className="py-24">
          <div className="container mx-auto px-6 max-w-6xl">
            <motion.div {...fadeUp} className="text-center mb-16">
              <Badge variant="outline" className="mb-4"><Users className="h-3 w-3 mr-1" /> Nosso time</Badge>
              <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Quem cuida do <span className="text-primary">seu projeto</span>
              </h2>
            </motion.div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {team.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/50 hover:shadow-xl hover:-translate-y-1 transition-all group"
                >
                  <div className="aspect-square overflow-hidden bg-secondary">
                    {m.photo_url ? (
                      <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-muted-foreground/40">
                        {m.name?.[0]}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-bold text-lg">{m.name}</h3>
                    <div className="text-sm text-primary font-medium mb-2">{m.role}</div>
                    {m.bio && <p className="text-xs text-muted-foreground line-clamp-3">{m.bio}</p>}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-orange-600 to-primary -z-10" />
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-white/10 blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-white/10 blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        </div>

        <motion.div {...fadeUp} className="container mx-auto px-6 text-center text-primary-foreground">
          <h2 className="text-4xl md:text-6xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)' }}>
            Vamos começar com o <br />
            <span className="underline decoration-yellow-300 decoration-4 underline-offset-8">{plan.name}</span>?
          </h2>
          <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto mb-10">
            Confirme conosco e iniciamos seu projeto em até 7 dias úteis.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-base h-12 px-8 shadow-xl hover:scale-105 transition-transform" asChild>
              <a href="https://wa.me/5562999999999" target="_blank" rel="noreferrer">
                Falar com a equipe <ArrowRight className="h-4 w-4 ml-1" />
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base h-12 px-8 bg-transparent border-white text-white hover:bg-white hover:text-primary"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao início
            </Button>
          </div>
        </motion.div>
      </section>

      <footer className="py-8 text-center text-sm text-muted-foreground border-t border-border">
        <img src={LOGO_URL} alt="Pulse" className="h-8 mx-auto mb-2 opacity-70" />
        © {new Date().getFullYear()} Pulse Growth Marketing. Todos os direitos reservados.
      </footer>
    </div>
  );
}

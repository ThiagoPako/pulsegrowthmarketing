import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Zap, Briefcase, Trophy, Check, ArrowRight, ArrowLeft,
  Sparkles, Target, TrendingUp, Users, PlayCircle, Calendar,
  BarChart3, MessageSquare, Eye, Ticket, Palette, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
const LOGO_URL = '/pulse-logo.png';

type Plan = {
  key: string;
  name: string;
  icon: any;
  tagline: string;
  description: string;
  highlight?: boolean;
  badge?: string;
  features: string[];
  pricing: { label: string; monthly: string; save?: string }[];
};

const PLANS: Plan[] = [
  {
    key: 'starter',
    name: 'Pulse Starter',
    icon: Rocket,
    tagline: 'Comece com base profissional',
    description: 'Ideal para empresas estruturando sua presença digital com segurança e consistência.',
    features: [
      'Linha editorial estratégica',
      'Implementação gratuita de contas de anúncios',
      '2 artes para feed e stories',
      '4 reels mensais para alcance',
      'Gestão de tráfego pago Meta Ads',
      'Dashboard de resultados em tempo real',
      'Edição profissional de vídeo',
      'Direcionamento estratégico de gravação',
      '2 criativos em vídeo para anúncios (15–20s)',
      'Acesso ao Portal do Cliente',
      'Relatórios mensais baseados em dados',
    ],
    pricing: [
      { label: '6 meses', monthly: 'R$ 2.680' },
      { label: '12 meses', monthly: 'R$ 2.400', save: 'Economia de R$ 3.360' },
    ],
  },
  {
    key: 'boost',
    name: 'Pulse Boost',
    icon: Zap,
    tagline: 'Amplie produção e inteligência',
    description: 'Mais entregas, estratégia avançada e suporte contínuo de performance.',
    features: [
      'Linha editorial com análise estratégica',
      'Criação de campanhas sazonais',
      'Reformulação completa de perfil (foto + 6 posts + destaques)',
      'Implementação gratuita de contas de anúncios',
      '2 posts mensais em arte',
      'Análise estratégica de público-alvo',
      'Criação de roteiros profissionais',
      '20 stories/mês com distribuição semanal',
      'Edição profissional de vídeo',
      '6 reels mensais para expansão',
      '4 criativos em vídeo para anúncios',
      '4 artes mensais de apoio',
      'Social media dedicado',
      'Google Ads + Meta Ads',
      'Google Meu Negócio monitorado',
      'Portal do Cliente + Relatórios mensais',
    ],
    pricing: [
      { label: '6 meses', monthly: 'R$ 3.280' },
      { label: '12 meses', monthly: 'R$ 2.900', save: 'Economia de R$ 4.560' },
    ],
  },
  {
    key: 'premium',
    name: 'Pulse Premium',
    icon: Briefcase,
    tagline: 'Autoridade + foco em vendas',
    description: 'Integra conteúdo, mídia paga e inteligência comercial para performance em alto nível.',
    highlight: true,
    badge: 'Mais escolhido',
    features: [
      'Linha editorial com análise estratégica',
      'Implementação gratuita de contas de anúncios',
      'Análise estratégica de público-alvo',
      'Roteiros profissionais',
      '20 stories/mês distribuídos',
      'Edição profissional de vídeo',
      '8 reels mensais (2x/semana)',
      '6 artes mensais',
      'Social media dedicado',
      'Google Ads + Meta Ads avançado',
      'Google Meu Negócio monitorado',
      'Dashboard em tempo real',
      'Campanhas comerciais e estratégias de vendas',
      'Datas sazonais acompanhadas',
      'CRM integrado: Facebook + Instagram + WhatsApp',
      'Treinamento comercial para equipe de vendas',
    ],
    pricing: [
      { label: '6 meses', monthly: 'R$ 4.680' },
      { label: '12 meses', monthly: 'R$ 4.200', save: 'Economia de R$ 5.760' },
    ],
  },
  {
    key: 'elite',
    name: 'Pulse Elite',
    icon: Trophy,
    tagline: 'Domine o mercado',
    description: 'Operação digital completa, orientada a escala, presença e acompanhamento avançado.',
    badge: 'Top performance',
    features: [
      'Tudo do Premium +',
      '12 reels mensais (3x/semana)',
      '8 artes mensais',
      'Google + Meta Ads avançado premium',
      'Monitoramento avançado de CRM com análise de atendimento',
      'Grupo de WhatsApp dedicado com time de vendas',
      'Gerenciamento de relacionamentos com influenciadores',
      'Treinamento comercial recorrente',
    ],
    pricing: [
      { label: '6 meses', monthly: 'R$ 6.500' },
      { label: '12 meses', monthly: 'R$ 5.850', save: 'Economia de R$ 7.800' },
    ],
  },
];

const PORTAL_FEATURES = [
  { icon: PlayCircle, title: 'Biblioteca de Conteúdos', desc: 'Vídeos, artes e fotos em painel estilo streaming.' },
  { icon: Palette, title: 'Zona Criativa', desc: 'Veja roteiros, sugira ideias, aprove conteúdos e defina prioridades.' },
  { icon: Calendar, title: 'Calendário de Produção', desc: 'Gravações, publicações e tudo o que está planejado.' },
  { icon: BarChart3, title: 'Acompanhamento de Entregas', desc: 'Visibilidade total das demandas e aprovações.' },
  { icon: Ticket, title: 'Emissor de Cupons', desc: 'Gere cupons promocionais para campanhas e ativações.' },
  { icon: MessageSquare, title: 'Central de Comunicação', desc: 'Toda a conversa em um único ambiente.' },
  { icon: Eye, title: 'Transparência Total', desc: 'Saiba exatamente o que está sendo executado.' },
];

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: 'easeOut' as const },
};

export default function Apresentacao() {
  const navigate = useNavigate();
  const [team, setTeam] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('team_members')
        .select('*')
        .eq('active', true)
        .order('display_order', { ascending: true });
      setTeam(data || []);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Top bar */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="backdrop-blur bg-background/80">
          <X className="h-4 w-4 mr-1" /> Sair da apresentação
        </Button>
      </div>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Animated gradient blobs */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 -left-32 w-[600px] h-[600px] rounded-full bg-primary/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-0 -right-32 w-[600px] h-[600px] rounded-full bg-primary/30 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-orange-500/10 blur-3xl" />
        </div>

        <div className="container mx-auto px-6 text-center relative z-10">
          <motion.img
            src={LOGO_URL}
            alt="Pulse"
            className="h-24 mx-auto mb-8"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
            <Badge className="mb-6 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
              <Sparkles className="h-3 w-3 mr-1" /> Marketing digital que gera resultado
            </Badge>
          </motion.div>
          <motion.h1
            className="text-5xl md:text-7xl font-bold tracking-tight mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
          >
            Soluções completas para <br />
            <span className="bg-gradient-to-r from-primary via-orange-500 to-primary bg-clip-text text-transparent">
              impulsionar seu negócio
            </span>
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            Estratégia, produção e gestão integradas para construir marcas mais relevantes, com presença consistente e preparadas para crescer.
          </motion.p>
          <motion.div
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <ArrowRight className="h-4 w-4 animate-pulse" />
            Role para conhecer os planos
          </motion.div>
        </div>
      </section>

      {/* QUEM SOMOS */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp} className="max-w-4xl mx-auto text-center">
            <Badge variant="outline" className="mb-4">Quem somos</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              Marketing digital com <span className="text-primary">propósito e método</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              A Pulse desenvolve estratégias focadas em <strong>presença, performance e consistência</strong>. Unimos gestão de redes sociais, tráfego pago e criação de conteúdo estratégico para construir marcas relevantes e preparadas para crescer. Cada entrega combina planejamento, execução e análise para transformar comunicação em <strong>resultado real</strong>.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 mt-16 max-w-5xl mx-auto">
            {[
              { icon: Target, title: 'Estratégia', desc: 'Cada conteúdo nasce de uma análise de público, mercado e objetivo de negócio.' },
              { icon: Sparkles, title: 'Produção', desc: 'Equipe própria de social media, designer, videomakers, editores e tráfego pago.' },
              { icon: TrendingUp, title: 'Performance', desc: 'Dashboards, relatórios mensais e ajustes contínuos guiados por dados.' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.6 }}
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

      {/* COMO FAZEMOS */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp} className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">Como fazemos</Badge>
            <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              Um método que <span className="text-primary">organiza e entrega</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {[
              { n: '01', t: 'Diagnóstico', d: 'Entendemos negócio, público e objetivos.' },
              { n: '02', t: 'Planejamento', d: 'Linha editorial, calendário e roteiros profissionais.' },
              { n: '03', t: 'Execução', d: 'Equipe dedicada produzindo conteúdo e gerenciando tráfego.' },
              { n: '04', t: 'Análise', d: 'Dashboards, relatórios e otimização contínua.' },
            ].map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative bg-card border border-border rounded-2xl p-6 hover:border-primary transition-all group"
              >
                <div className="text-5xl font-bold text-primary/20 group-hover:text-primary/40 transition-colors mb-2" style={{ fontFamily: 'var(--font-display)' }}>{s.n}</div>
                <h3 className="text-lg font-bold mb-2">{s.t}</h3>
                <p className="text-sm text-muted-foreground">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANOS */}
      <section className="py-24 bg-gradient-to-b from-secondary/30 to-background">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp} className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4 bg-primary text-primary-foreground">Nossos Planos</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Escolha o plano ideal para <span className="text-primary">o seu momento</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              4 níveis de atendimento para diferentes estágios de maturidade digital. Todos incluem estratégia, produção e gestão.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {PLANS.map((plan, i) => {
              const Icon = plan.icon;
              return (
                <motion.div
                  key={plan.key}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className={`relative rounded-3xl p-6 flex flex-col border-2 transition-all hover:-translate-y-2 hover:shadow-2xl ${
                    plan.highlight
                      ? 'bg-gradient-to-br from-primary to-orange-600 text-primary-foreground border-primary shadow-xl scale-105'
                      : 'bg-card border-border hover:border-primary/40'
                  }`}
                >
                  {plan.badge && (
                    <Badge className={`absolute -top-3 left-1/2 -translate-x-1/2 ${plan.highlight ? 'bg-background text-primary' : 'bg-primary text-primary-foreground'}`}>
                      {plan.badge}
                    </Badge>
                  )}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${plan.highlight ? 'bg-background/20' : 'bg-primary/10'}`}>
                    <Icon className={`h-7 w-7 ${plan.highlight ? 'text-primary-foreground' : 'text-primary'}`} />
                  </div>
                  <h3 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>{plan.name}</h3>
                  <p className={`text-sm mb-4 ${plan.highlight ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{plan.tagline}</p>
                  <p className={`text-sm mb-6 ${plan.highlight ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>{plan.description}</p>

                  <div className="space-y-2 mb-6 flex-1">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-start gap-2 text-sm">
                        <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-primary-foreground' : 'text-primary'}`} />
                        <span className={plan.highlight ? 'text-primary-foreground/95' : ''}>{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className={`pt-4 border-t space-y-3 ${plan.highlight ? 'border-primary-foreground/20' : 'border-border'}`}>
                    {plan.pricing.map((p) => (
                      <div key={p.label} className="flex items-baseline justify-between">
                        <div>
                          <div className={`text-xs ${plan.highlight ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{p.label}</div>
                          {p.save && <div className={`text-[10px] font-semibold ${plan.highlight ? 'text-yellow-200' : 'text-success'}`}>{p.save}</div>}
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>{p.monthly}</div>
                          <div className={`text-[10px] ${plan.highlight ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>/mês</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Gatilhos de venda */}
          <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto mt-16">
            {[
              { t: 'Equipe dedicada', d: 'Social media, designer, videomaker, editor e tráfego cuidando do seu projeto.' },
              { t: 'Resultados mensuráveis', d: 'Dashboards em tempo real e relatórios mensais com dados claros.' },
              { t: 'Sem surpresas', d: 'Portal do Cliente com transparência total de tudo que está sendo executado.' },
            ].map((g) => (
              <div key={g.t} className="bg-card border border-border rounded-xl p-5 flex gap-3">
                <Check className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                <div>
                  <div className="font-semibold mb-1">{g.t}</div>
                  <div className="text-sm text-muted-foreground">{g.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PORTAL DO CLIENTE */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp} className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">Diferencial exclusivo</Badge>
            <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Portal do Cliente <span className="text-primary">Pulse</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              Uma plataforma moderna que centraliza materiais, aprovações e acompanhamentos em um só lugar.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
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
        <section className="py-24 bg-secondary/30">
          <div className="container mx-auto px-6">
            <motion.div {...fadeUp} className="text-center max-w-3xl mx-auto mb-16">
              <Badge variant="outline" className="mb-4"><Users className="h-3 w-3 mr-1" /> Nosso time</Badge>
              <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Especialistas por trás do <span className="text-primary">seu resultado</span>
              </h2>
              <p className="text-lg text-muted-foreground">
                Conheça quem cuida do seu projeto todos os dias.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
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

      {/* CTA FINAL */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-orange-600 to-primary -z-10" />
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-white/10 blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-white/10 blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        </div>

        <motion.div {...fadeUp} className="container mx-auto px-6 text-center text-primary-foreground">
          <h2 className="text-4xl md:text-6xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)' }}>
            Pronto para impulsionar <br /> seu negócio?
          </h2>
          <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto mb-10">
            Vamos construir uma presença mais forte, mais inteligente e mais preparada para crescer. Fale com a nossa equipe e descubra o plano ideal.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" variant="secondary" className="text-base h-12 px-8 shadow-xl hover:scale-105 transition-transform" asChild>
              <a href="https://wa.me/5562999999999" target="_blank" rel="noreferrer">
                Falar com a equipe <ArrowRight className="h-4 w-4 ml-1" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="text-base h-12 px-8 bg-transparent border-white text-white hover:bg-white hover:text-primary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
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

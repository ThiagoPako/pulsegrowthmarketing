import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Rocket, Video, BarChart3, Palette, Users, Calendar, CheckCircle2,
  ArrowRight, Play, Star, ChevronDown, MessageCircle, Instagram,
  TrendingUp, Zap, Shield, Clock, Award, Phone, Mail, MapPin,
  Menu, X, Sparkles, Target, Megaphone, Camera, Film, PenTool,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const WHATSAPP_LINK = 'https://wa.me/5538999266863?text=Olá!%20Vim%20pelo%20site%20e%20gostaria%20de%20saber%20mais%20sobre%20os%20serviços%20da%20Pulse.';

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] } }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

// ─── Navbar ─────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const links = [
    { label: 'Serviços', href: '#servicos' },
    { label: 'Planos', href: '#planos' },
    { label: 'Cases', href: '#cases' },
    { label: 'Depoimentos', href: '#depoimentos' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Contato', href: '#contato' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <a href="#" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Rocket size={18} className="text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg text-foreground tracking-tight">Pulse</span>
            <span className="text-xs text-muted-foreground font-medium hidden sm:inline">Growth Marketing</span>
          </a>

          <div className="hidden md:flex items-center gap-6">
            {links.map(l => (
              <a key={l.href} href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')} className="hidden sm:inline-flex text-sm">
              Área da Equipe
            </Button>
            <Button size="sm" onClick={() => window.open(WHATSAPP_LINK, '_blank')} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
              <MessageCircle size={14} /> Falar conosco
            </Button>
            <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="md:hidden border-t border-border/50 bg-background">
          <div className="px-4 py-4 space-y-3">
            {links.map(l => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground py-1">
                {l.label}
              </a>
            ))}
            <Button variant="outline" size="sm" onClick={() => navigate('/login')} className="w-full mt-2">
              Área da Equipe
            </Button>
          </div>
        </motion.div>
      )}
    </nav>
  );
}

// ─── Hero ───────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-16">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/30" />
      <div className="absolute top-20 right-[10%] w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-[10%] w-72 h-72 bg-warning/10 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="text-center max-w-4xl mx-auto">
          <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-8">
            <Sparkles size={14} /> Marketing de performance para crescimento real
          </motion.div>

          <motion.h1 variants={fadeUp} custom={1} className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.08] tracking-tight text-foreground">
            Conteúdo que{' '}
            <span className="text-primary relative">
              converte
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                <path d="M2 8C50 2 150 2 198 8" stroke="hsl(16 82% 51%)" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
            ,<br />
            resultados que{' '}
            <span className="text-primary">aparecem</span>
          </motion.h1>

          <motion.p variants={fadeUp} custom={2} className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Produzimos vídeos, artes e estratégias de marketing digital completas para sua empresa crescer no digital com consistência e profissionalismo.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={() => window.open(WHATSAPP_LINK, '_blank')} className="gap-2 text-base px-8 py-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all">
              Quero crescer no digital <ArrowRight size={18} />
            </Button>
            <Button size="lg" variant="outline" onClick={() => document.getElementById('servicos')?.scrollIntoView({ behavior: 'smooth' })} className="gap-2 text-base px-8 py-6">
              <Play size={16} /> Ver serviços
            </Button>
          </motion.div>

          <motion.div variants={fadeUp} custom={4} className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { value: '100+', label: 'Clientes atendidos' },
              { value: '5.000+', label: 'Vídeos produzidos' },
              { value: '98%', label: 'Satisfação' },
              { value: '3x', label: 'Mais engajamento' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="font-display text-2xl sm:text-3xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Sobre ──────────────────────────────────────────────────
function Sobre() {
  return (
    <section className="py-20 bg-card border-y border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={staggerContainer} className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div variants={fadeUp}>
            <span className="text-sm font-semibold text-primary uppercase tracking-wider">Sobre a Pulse</span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3 leading-tight">
              A agência que entende o seu negócio e entrega resultado
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              Somos uma agência de marketing digital focada em produção de conteúdo audiovisual e gestão estratégica de redes sociais. Nossa missão é transformar a presença digital de empresas locais com conteúdo profissional, consistente e orientado a resultados.
            </p>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Com uma equipe especializada em videomakers, editores, designers e social media, oferecemos um fluxo completo de produção — da gravação à publicação — garantindo que sua marca esteja sempre ativa e gerando valor.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              {[
                { icon: Camera, label: 'Gravação profissional' },
                { icon: Film, label: 'Edição de vídeo' },
                { icon: PenTool, label: 'Design gráfico' },
                { icon: Megaphone, label: 'Gestão de redes' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-accent/50">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div variants={fadeUp} custom={2} className="relative">
            <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/30 flex items-center justify-center overflow-hidden">
              <div className="text-center p-8">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
                  <Rocket size={40} className="text-primary" />
                </div>
                <h3 className="font-display text-2xl font-bold text-foreground">Pulse Growth</h3>
                <p className="text-muted-foreground mt-2">Marketing que impulsiona</p>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-warning/20 rounded-2xl blur-2xl" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Serviços ───────────────────────────────────────────────
function Servicos() {
  const services = [
    { icon: Video, title: 'Produção de Vídeos', desc: 'Gravamos e editamos reels, stories e vídeos institucionais profissionais para suas redes sociais.', color: 'text-primary' },
    { icon: Palette, title: 'Design & Artes', desc: 'Criação de artes para feed, stories, banners e materiais gráficos alinhados à identidade visual.', color: 'text-info' },
    { icon: Instagram, title: 'Gestão de Redes Sociais', desc: 'Planejamento estratégico, calendário editorial e publicação recorrente nas plataformas.', color: 'text-success' },
    { icon: BarChart3, title: 'Tráfego Pago', desc: 'Gerenciamento de campanhas no Meta Ads e Google Ads com foco em resultados mensuráveis.', color: 'text-warning' },
    { icon: Calendar, title: 'Calendário de Conteúdo', desc: 'Planejamento mensal completo com datas sazonais, tendências e conteúdo estratégico.', color: 'text-destructive' },
    { icon: Target, title: 'Endomarketing', desc: 'Marketing interno e produção de conteúdo para colaboradores e cultura organizacional.', color: 'text-primary' },
  ];

  return (
    <section id="servicos" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={staggerContainer} className="text-center mb-16">
          <motion.span variants={fadeUp} className="text-sm font-semibold text-primary uppercase tracking-wider">Nossos Serviços</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3">
            Tudo que sua marca precisa para crescer
          </motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-muted-foreground mt-4 max-w-xl mx-auto">
            Oferecemos soluções completas de marketing digital — da produção à publicação — para que sua empresa tenha presença profissional e constante.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={staggerContainer} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s, i) => (
            <motion.div key={s.title} variants={fadeUp} custom={i} className="group p-6 rounded-2xl border border-border/60 bg-card hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <s.icon size={24} className={s.color} />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Planos ─────────────────────────────────────────────────
function Planos() {
  const plans = [
    {
      name: 'Starter',
      subtitle: 'Para quem está começando',
      features: ['4 gravações/mês', '8 reels editados', '4 artes para feed', 'Gestão de 1 rede social', 'Calendário editorial'],
      popular: false,
    },
    {
      name: 'Growth',
      subtitle: 'O mais escolhido',
      features: ['8 gravações/mês', '16 reels editados', '8 artes para feed', 'Gestão de 2 redes sociais', 'Calendário editorial', 'Tráfego pago incluso', 'Relatórios mensais'],
      popular: true,
    },
    {
      name: 'Scale',
      subtitle: 'Para dominar o digital',
      features: ['12 gravações/mês', '24 reels editados', '12 artes para feed', 'Gestão completa de redes', 'Tráfego pago avançado', 'Endomarketing', 'Suporte prioritário', 'Portal do cliente'],
      popular: false,
    },
  ];

  return (
    <section id="planos" className="py-20 bg-card border-y border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={staggerContainer} className="text-center mb-16">
          <motion.span variants={fadeUp} className="text-sm font-semibold text-primary uppercase tracking-wider">Planos</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3">
            Escolha o plano ideal para sua empresa
          </motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-muted-foreground mt-4 max-w-xl mx-auto">
            Planos flexíveis que se adaptam ao tamanho e necessidade do seu negócio. Todos incluem gravação profissional e edição de alta qualidade.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={staggerContainer} className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((p, i) => (
            <motion.div key={p.name} variants={fadeUp} custom={i} className={`relative p-6 rounded-2xl border transition-all duration-300 ${
              p.popular
                ? 'border-primary bg-primary/[0.03] shadow-lg shadow-primary/10 scale-[1.02]'
                : 'border-border/60 bg-background hover:border-primary/30'
            }`}>
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  Mais Popular
                </div>
              )}
              <div className="text-center mb-6 pt-2">
                <h3 className="font-display text-2xl font-bold text-foreground">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.subtitle}</p>
              </div>
              <ul className="space-y-3 mb-8">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-foreground">
                    <CheckCircle2 size={16} className="text-success shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => window.open(WHATSAPP_LINK, '_blank')}
                className={`w-full gap-2 ${p.popular ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : ''}`}
                variant={p.popular ? 'default' : 'outline'}
              >
                Falar com consultor <ArrowRight size={14} />
              </Button>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Cases ──────────────────────────────────────────────────
function Cases() {
  const cases = [
    { name: 'Restaurante Sabor & Arte', niche: 'Gastronomia', result: '+280% engajamento em 3 meses', highlight: '3x mais reservas online' },
    { name: 'Auto Center Premium', niche: 'Automotivo', result: '+150% seguidores em 4 meses', highlight: '2x mais orçamentos via Instagram' },
    { name: 'Studio Beleza & Cia', niche: 'Beleza', result: '+400% alcance nos reels', highlight: 'Agenda lotada em 6 semanas' },
    { name: 'Clínica Saúde+', niche: 'Saúde', result: '+200% agendamentos online', highlight: 'Referência na região' },
  ];

  return (
    <section id="cases" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={staggerContainer} className="text-center mb-16">
          <motion.span variants={fadeUp} className="text-sm font-semibold text-primary uppercase tracking-wider">Cases de Sucesso</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3">
            Resultados reais de clientes reais
          </motion.h2>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={staggerContainer} className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {cases.map((c, i) => (
            <motion.div key={c.name} variants={fadeUp} custom={i} className="p-6 rounded-2xl border border-border/60 bg-card hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp size={20} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground">{c.name}</h3>
                  <span className="text-xs text-muted-foreground">{c.niche}</span>
                </div>
              </div>
              <p className="text-sm font-semibold text-success">{c.result}</p>
              <p className="text-sm text-muted-foreground mt-1">{c.highlight}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Depoimentos ────────────────────────────────────────────
function Depoimentos() {
  const testimonials = [
    { name: 'Maria Clara', role: 'Dona de restaurante', text: 'A Pulse transformou minha presença no Instagram. Em 3 meses, triplicamos as reservas online. O conteúdo é impecável!' },
    { name: 'Carlos Eduardo', role: 'Empresário automotivo', text: 'Profissionalismo e pontualidade. Os vídeos são de altíssima qualidade e o portal do cliente é incrível — acompanho tudo em tempo real.' },
    { name: 'Juliana Mendes', role: 'Dona de clínica estética', text: 'Nunca imaginei que marketing digital pudesse trazer tanto resultado. A equipe é atenciosa e entende do nosso negócio.' },
  ];

  return (
    <section id="depoimentos" className="py-20 bg-card border-y border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={staggerContainer} className="text-center mb-16">
          <motion.span variants={fadeUp} className="text-sm font-semibold text-primary uppercase tracking-wider">Depoimentos</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3">
            O que nossos clientes dizem
          </motion.h2>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={staggerContainer} className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map((t, i) => (
            <motion.div key={t.name} variants={fadeUp} custom={i} className="p-6 rounded-2xl border border-border/60 bg-background">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} size={14} className="text-warning fill-warning" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed italic">"{t.text}"</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{t.name[0]}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── FAQ ────────────────────────────────────────────────────
function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faqs = [
    { q: 'Como funciona o processo de gravação?', a: 'Nossos videomakers vão até sua empresa nos dias agendados, gravam os conteúdos planejados e enviam para nossa equipe de edição. Todo o processo é acompanhado pelo Portal do Cliente.' },
    { q: 'Vocês atendem em qual região?', a: 'Atendemos empresas em todo o Norte de Minas Gerais, com foco nas cidades de Montes Claros e região. Para outras localidades, entre em contato para verificar a disponibilidade.' },
    { q: 'Quanto tempo leva para os resultados aparecerem?', a: 'Os primeiros resultados começam a aparecer entre 30 e 90 dias, dependendo do nicho e do investimento. O marketing digital é um trabalho contínuo que cresce com consistência.' },
    { q: 'Posso aprovar os conteúdos antes de serem publicados?', a: 'Sim! Todos os conteúdos são enviados para sua aprovação através do nosso Portal do Cliente. Você pode assistir, aprovar ou solicitar ajustes diretamente pela plataforma.' },
    { q: 'Qual é o prazo mínimo de contrato?', a: 'Trabalhamos com contratos a partir de 6 meses, pois o marketing digital requer consistência para gerar resultados sólidos. Oferecemos condições especiais para contratos mais longos.' },
    { q: 'Vocês fazem tráfego pago também?', a: 'Sim! Gerenciamos campanhas no Meta Ads (Instagram/Facebook) e Google Ads. O investimento em mídia é definido conforme seu orçamento e objetivos.' },
  ];

  return (
    <section id="faq" className="py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={staggerContainer} className="text-center mb-16">
          <motion.span variants={fadeUp} className="text-sm font-semibold text-primary uppercase tracking-wider">Perguntas Frequentes</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3">
            Tire suas dúvidas
          </motion.h2>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={staggerContainer} className="space-y-3">
          {faqs.map((f, i) => (
            <motion.div key={i} variants={fadeUp} custom={i} className="border border-border/60 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-accent/30 transition-colors"
              >
                <span className="text-sm font-semibold text-foreground pr-4">{f.q}</span>
                <ChevronDown size={16} className={`shrink-0 text-muted-foreground transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
              </button>
              {openIndex === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="px-5 pb-5">
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
                </motion.div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Contato / CTA ──────────────────────────────────────────
function Contato() {
  return (
    <section id="contato" className="py-20 bg-card border-t border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} variants={staggerContainer} className="text-center max-w-2xl mx-auto">
          <motion.span variants={fadeUp} className="text-sm font-semibold text-primary uppercase tracking-wider">Vamos conversar?</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3">
            Pronto para transformar sua presença digital?
          </motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-muted-foreground mt-4">
            Entre em contato conosco e descubra como podemos ajudar sua empresa a crescer nas redes sociais com conteúdo profissional e estratégico.
          </motion.p>
          <motion.div variants={fadeUp} custom={3} className="mt-8">
            <Button size="lg" onClick={() => window.open(WHATSAPP_LINK, '_blank')} className="gap-2 text-base px-10 py-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25">
              <MessageCircle size={18} /> Falar pelo WhatsApp
            </Button>
          </motion.div>

          <motion.div variants={fadeUp} custom={4} className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-primary" />
              (38) 99926-6863
            </div>
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-primary" />
              contato@agenciapulse.tech
            </div>
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-primary" />
              Montes Claros - MG
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Footer ─────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="py-8 border-t border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Rocket size={12} className="text-primary-foreground" />
          </div>
          <span className="font-display font-semibold text-foreground">Pulse Growth Marketing</span>
        </div>
        <p>© {new Date().getFullYear()} Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}

// ─── Main ───────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <Sobre />
      <Servicos />
      <Planos />
      <Cases />
      <Depoimentos />
      <FAQ />
      <Contato />
      <Footer />
    </div>
  );
}

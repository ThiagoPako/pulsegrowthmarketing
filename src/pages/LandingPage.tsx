import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence, useInView } from 'framer-motion';
import {
  Rocket, Video, BarChart3, Palette, Users, Calendar, CheckCircle2,
  ArrowRight, Play, Star, ChevronDown, MessageCircle, Instagram,
  TrendingUp, Zap, Shield, Clock, Award, Phone, Mail, MapPin,
  Menu, X, Sparkles, Target, Megaphone, Camera, Film, PenTool,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const WHATSAPP_LINK = 'https://wa.me/5562985382981?text=Olá!%20Vim%20pelo%20site%20e%20gostaria%20de%20saber%20mais%20sobre%20os%20serviços%20da%20Pulse.';
const INSTAGRAM_LINK = 'https://instagram.com/ag.pulse';

// ─── Animation variants ────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: 'easeOut' as const },
  }),
};

const fadeScale = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i = 0) => ({
    opacity: 1, scale: 1,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' as const },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const slideInLeft = {
  hidden: { opacity: 0, x: -60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: 'easeOut' as const } },
};

const slideInRight = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: 'easeOut' as const } },
};

// ─── Animated Counter ──────────────────────────────────────
function AnimatedCounter({ target, suffix = '' }: { target: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!isInView) return;
    const numericPart = target.replace(/[^0-9.]/g, '');
    const prefix = target.replace(/[0-9.,+]+/g, '').trim();
    const hasPlus = target.includes('+');
    const num = parseFloat(numericPart.replace(',', ''));
    if (isNaN(num)) { setDisplay(target); return; }

    const duration = 2000;
    const steps = 60;
    const increment = num / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(current + increment, num);
      const formatted = num >= 1000
        ? Math.floor(current).toLocaleString('pt-BR')
        : num % 1 !== 0
          ? current.toFixed(0)
          : Math.floor(current).toString();
      setDisplay(`${hasPlus && step === steps ? '+' : ''}${formatted}${suffix}`);
      if (step >= steps) {
        setDisplay(target);
        clearInterval(timer);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [isInView, target, suffix]);

  return <span ref={ref}>{display}</span>;
}

// ─── Floating CTA ──────────────────────────────────────────
function FloatingCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-6 right-6 z-50"
        >
          <Button
            size="lg"
            onClick={() => window.open(WHATSAPP_LINK, '_blank')}
            className="gap-2 rounded-full shadow-2xl shadow-primary/30 bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-6 animate-[pulse_3s_ease-in-out_infinite]"
          >
            <MessageCircle size={20} /> Fale conosco
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Navbar ─────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Track active section
  useEffect(() => {
    const sectionIds = ['quem-somos', 'servicos', 'portal', 'planos', 'cases', 'depoimentos', 'faq', 'contato'];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Close mobile menu on body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const links = [
    { label: 'Quem Somos', href: '#quem-somos', id: 'quem-somos' },
    { label: 'Serviços', href: '#servicos', id: 'servicos' },
    { label: 'Processo', href: '#portal', id: 'portal' },
    { label: 'Planos', href: '#planos', id: 'planos' },
    { label: 'Cases', href: '#cases', id: 'cases' },
    { label: 'Depoimentos', href: '#depoimentos', id: 'depoimentos' },
    { label: 'FAQ', href: '#faq', id: 'faq' },
    { label: 'Contato', href: '#contato', id: 'contato' },
  ];

  const handleNavClick = (href: string) => {
    setOpen(false);
    setTimeout(() => {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-background/90 backdrop-blur-2xl border-b border-border/50 shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center gap-2 group">
              <motion.div
                whileHover={{ rotate: 15, scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 400 }}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary flex items-center justify-center"
              >
                <Rocket size={16} className="text-primary-foreground" />
              </motion.div>
              <span className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">Pulse</span>
              <span className="text-xs text-muted-foreground font-medium hidden lg:inline">Growth Marketing de Vendas</span>
            </a>

            <div className="hidden lg:flex items-center gap-1">
              {links.map(l => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={(e) => { e.preventDefault(); handleNavClick(l.href); }}
                  className={`relative text-sm px-3 py-1.5 rounded-lg transition-all duration-200 font-medium ${
                    activeSection === l.id
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  {l.label}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')} className="hidden sm:inline-flex text-xs sm:text-sm h-8 sm:h-9">
                Área da Equipe
              </Button>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button size="sm" onClick={() => window.open(WHATSAPP_LINK, '_blank')} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20 h-8 sm:h-9 text-xs sm:text-sm px-3 sm:px-4">
                  <MessageCircle size={14} /> <span className="hidden xs:inline">Falar conosco</span><span className="xs:hidden">WhatsApp</span>
                </Button>
              </motion.div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                className="lg:hidden p-2 rounded-lg hover:bg-accent/50 transition-colors"
                onClick={() => setOpen(!open)}
              >
                <AnimatePresence mode="wait">
                  {open ? (
                    <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                      <X size={20} />
                    </motion.div>
                  ) : (
                    <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                      <Menu size={20} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Full-screen mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/98 backdrop-blur-xl"
              onClick={() => setOpen(false)}
            />

            {/* Menu content */}
            <div className="relative z-10 flex flex-col h-full pt-20 pb-8 px-6">
              <div className="flex-1 flex flex-col justify-center gap-1">
                {links.map((l, i) => (
                  <motion.a
                    key={l.href}
                    href={l.href}
                    onClick={(e) => { e.preventDefault(); handleNavClick(l.href); }}
                    initial={{ x: -40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -40, opacity: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className={`text-2xl sm:text-3xl font-display font-bold py-3 transition-colors ${
                      activeSection === l.id ? 'text-primary' : 'text-foreground/70 hover:text-foreground'
                    }`}
                  >
                    {l.label}
                  </motion.a>
                ))}
              </div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <Button
                  size="lg"
                  onClick={() => { setOpen(false); window.open(WHATSAPP_LINK, '_blank'); }}
                  className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-6"
                >
                  <MessageCircle size={18} /> Falar pelo WhatsApp
                </Button>
                <Button variant="outline" size="lg" onClick={() => { setOpen(false); navigate('/login'); }} className="w-full py-6">
                  Área da Equipe
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Hero ───────────────────────────────────────────────────
function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-[100svh] flex items-center justify-center overflow-hidden pt-14 sm:pt-16">
      {/* Animated gradient blobs */}
      <motion.div style={{ y: bgY }} className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/20" />
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-20 right-[10%] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-primary/8 rounded-full blur-[80px] sm:blur-[100px]"
        />
        <motion.div
          animate={{ x: [0, -20, 0], y: [0, 30, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute bottom-20 left-[5%] w-64 h-64 sm:w-96 sm:h-96 bg-warning/8 rounded-full blur-[60px] sm:blur-[80px]"
        />
        <motion.div
          animate={{ x: [0, 15, 0], y: [0, 15, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/4 rounded-full blur-[120px]"
        />
      </motion.div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)`,
        backgroundSize: '40px 40px',
      }} />

      <motion.div style={{ opacity }} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <motion.div variants={fadeScale} custom={0}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-1.5 sm:py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs sm:text-sm font-semibold mb-6 sm:mb-8 backdrop-blur-sm"
            >
              <motion.span
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Sparkles size={14} />
              </motion.span>
              Marketing de performance para crescimento real
            </motion.div>
          </motion.div>

          {/* Headline */}
          <motion.h1 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.1] sm:leading-[1.08] tracking-tight text-foreground">
            Do conteúdo ao{' '}
            <span className="text-primary relative inline-block">
              <motion.span
                initial={{ backgroundSize: '0% 3px' }}
                animate={{ backgroundSize: '100% 3px' }}
                transition={{ delay: 1.2, duration: 0.8, ease: 'easeOut' }}
                className="bg-gradient-to-r from-primary to-primary bg-no-repeat bg-bottom pb-1"
              >
                fechamento
              </motion.span>
            </span>
            ,<br />
            a gente cuida de{' '}
            <motion.span
              className="text-primary"
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              tudo
            </motion.span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p variants={fadeUp} custom={2} className="mt-4 sm:mt-6 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2">
            Gravamos, editamos, criamos a estratégia, gerenciamos suas redes sociais e acompanhamos sua equipe comercial até fechar a venda. Somos sua agência de growth marketing de vendas completa.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div variants={fadeUp} custom={3} className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4 sm:px-0">
            <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Button
                size="lg"
                onClick={() => window.open(WHATSAPP_LINK, '_blank')}
                className="gap-2 text-sm sm:text-base px-6 sm:px-8 py-5 sm:py-6 w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/35 transition-all duration-300 relative overflow-hidden group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                Quero crescer no digital <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button size="lg" variant="outline" onClick={() => document.getElementById('servicos')?.scrollIntoView({ behavior: 'smooth' })} className="gap-2 text-sm sm:text-base px-6 sm:px-8 py-5 sm:py-6 w-full sm:w-auto border-border/80 hover:border-primary/40 transition-colors">
                <Play size={16} /> Ver serviços
              </Button>
            </motion.div>
          </motion.div>

          {/* Animated Counters */}
          <motion.div variants={fadeUp} custom={4} className="mt-14 sm:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 max-w-3xl mx-auto">
            {[
              { value: '100+', label: 'Clientes atendidos' },
              { value: '5.000+', label: 'Vídeos produzidos' },
              { value: '98%', label: 'Satisfação' },
              { value: '3x', label: 'Mais engajamento' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300 }}
                className="text-center group"
              >
                <p className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground group-hover:text-primary transition-colors">
                  <AnimatedCounter target={s.value} />
                </p>
                <p className="text-[10px] sm:text-xs md:text-sm text-muted-foreground mt-1 sm:mt-1.5">{s.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-1.5"
        >
          <motion.div className="w-1.5 h-1.5 rounded-full bg-primary" />
        </motion.div>
      </motion.div>
    </section>
  );
}

// ─── Sobre ──────────────────────────────────────────────────
function Sobre() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const imgY = useTransform(scrollYProgress, [0, 1], ['5%', '-5%']);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadVideo() {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) return;
        const sb = createClient(url, key);
        const { data } = await sb
          .from('landing_page_settings')
          .select('video_url')
          .eq('section', 'quem_somos')
          .maybeSingle();
        if (data?.video_url) setVideoUrl(data.video_url);
      } catch {}
    }
    loadVideo();
  }, []);

  return (
    <section ref={ref} id="quem-somos" className="py-16 sm:py-24 bg-card border-y border-border/50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={slideInLeft}>
            <span className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Quem Somos</span>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mt-2 sm:mt-3 leading-tight">
              Mais do que marketing: somos parceiros do seu crescimento em vendas
            </h2>
            <p className="mt-4 sm:mt-5 text-sm sm:text-base text-muted-foreground leading-relaxed">
              Somos uma agência de growth marketing de vendas de Minaçu - GO que atende todo o Brasil. Nosso diferencial? A gente não faz só o tráfego pago — a gente cuida de todo o processo: gravamos, editamos, criamos a estratégia, gerenciamos suas redes sociais com social media dedicado e designer exclusivo.
            </p>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
              E vai além: temos uma assessoria comercial completa de vendas. Acompanhamos sua equipe de atendimento, criamos métodos e orientamos como fechar mais clientes. Do conteúdo ao fechamento, estamos com você.
            </p>
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={staggerContainer}
              className="mt-6 sm:mt-8 grid grid-cols-2 gap-2 sm:gap-3"
            >
              {[
                { icon: Camera, label: 'Gravação profissional' },
                { icon: Film, label: 'Edição de vídeo' },
                { icon: PenTool, label: 'Design gráfico' },
                { icon: Megaphone, label: 'Gestão de redes' },
                { icon: Users, label: 'Assessoria comercial' },
                { icon: Target, label: 'Fechamento de vendas' },
              ].map(({ icon: Icon, label }, i) => (
                <motion.div
                  key={label}
                  variants={fadeScale}
                  custom={i}
                  whileHover={{ scale: 1.03, x: 4 }}
                  className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-accent/50 hover:bg-accent/80 transition-colors cursor-default"
                >
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-primary" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-foreground">{label}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
            variants={slideInRight}
            className="relative"
          >
            {videoUrl ? (
              <motion.div style={{ y: imgY }} className="aspect-[9/16] sm:aspect-video rounded-3xl overflow-hidden relative shadow-2xl shadow-primary/10">
                {videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ? (
                  <iframe
                    src={videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                    className="w-full h-full"
                    allowFullScreen
                    title="Quem Somos - Pulse Growth Marketing"
                  />
                ) : (
                  <video
                    src={videoUrl}
                    controls
                    className="w-full h-full object-cover"
                    poster=""
                    playsInline
                  />
                )}
              </motion.div>
            ) : (
              <motion.div style={{ y: imgY }} className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/30 flex items-center justify-center overflow-hidden relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  className="absolute w-64 h-64 rounded-full border border-primary/10"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
                  className="absolute w-48 h-48 rounded-full border border-primary/15 border-dashed"
                />
                <div className="text-center p-8 relative z-10">
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-20 h-20 mx-auto rounded-2xl bg-primary/20 backdrop-blur-sm flex items-center justify-center mb-6"
                  >
                    <Rocket size={40} className="text-primary" />
                  </motion.div>
                  <h3 className="font-display text-2xl font-bold text-foreground">Pulse Growth</h3>
                  <p className="text-muted-foreground mt-2">Marketing de vendas completo</p>
                </div>
              </motion.div>
            )}
            <div className="absolute -bottom-6 -right-6 w-40 h-40 bg-warning/15 rounded-3xl blur-3xl" />
            <div className="absolute -top-4 -left-4 w-24 h-24 bg-primary/10 rounded-2xl blur-2xl" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── Serviços ───────────────────────────────────────────────
function Servicos() {
  const services = [
    { icon: Video, title: 'Produção de Vídeos', desc: 'Vamos até sua empresa, gravamos reels, stories e vídeos profissionais. Tudo pensado para engajar e vender.' },
    { icon: Palette, title: 'Design & Artes', desc: 'Designer dedicado para criar artes de feed, stories, banners e materiais gráficos com sua identidade visual.' },
    { icon: Instagram, title: 'Social Media', desc: 'Social media exclusivo para gerenciar seus perfis, planejar conteúdo, responder interações e manter sua marca ativa.' },
    { icon: BarChart3, title: 'Tráfego Pago', desc: 'Campanhas no Meta Ads e Google Ads com estratégia focada em gerar leads qualificados para sua equipe comercial.' },
    { icon: Users, title: 'Assessoria Comercial', desc: 'Acompanhamos sua equipe de atendimento, criamos métodos de abordagem e orientamos como fechar mais vendas.' },
    { icon: Target, title: 'Estratégia Completa', desc: 'Não fazemos só o tráfego — acompanhamos do primeiro contato até o fechamento, garantindo que o lead vire cliente.' },
  ];

  return (
    <section id="servicos" className="py-16 sm:py-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 sm:w-96 h-64 sm:h-96 bg-primary/5 rounded-full blur-[80px] sm:blur-[100px]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={staggerContainer} className="text-center mb-10 sm:mb-16">
          <motion.span variants={fadeUp} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Nossos Serviços</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mt-2 sm:mt-3">
            Tudo que sua marca precisa para crescer
          </motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-sm sm:text-base text-muted-foreground mt-3 sm:mt-4 max-w-xl mx-auto">
            Do conteúdo à venda fechada — cuidamos de tudo para sua empresa crescer no digital com resultados reais.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-30px' }} variants={staggerContainer} className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {services.map((s, i) => (
            <motion.div
              key={s.title}
              variants={fadeUp}
              custom={i}
              whileHover={{ y: -6, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="group p-4 sm:p-7 rounded-xl sm:rounded-2xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-xl hover:shadow-primary/8 transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10">
                <motion.div
                  whileHover={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.5 }}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-primary/10 flex items-center justify-center mb-3 sm:mb-5 group-hover:bg-primary/15 transition-colors"
                >
                  <s.icon size={20} className="text-primary sm:hidden" />
                  <s.icon size={24} className="text-primary hidden sm:block" />
                </motion.div>
                <h3 className="font-display text-sm sm:text-lg font-bold text-foreground">{s.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 leading-relaxed line-clamp-3 sm:line-clamp-none">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Como Funciona + Portal ────────────────────────────────
function ComoFunciona() {
  const steps = [
    { num: '01', title: 'Briefing & Estratégia', desc: 'Entendemos seu negócio, definimos metas e criamos o calendário editorial personalizado para sua marca.', icon: Target },
    { num: '02', title: 'Gravação Profissional', desc: 'Nosso videomaker vai até sua empresa nos dias agendados. Você confirma a agenda pelo Portal do Cliente.', icon: Camera },
    { num: '03', title: 'Edição & Design', desc: 'Editamos os vídeos e criamos as artes com qualidade profissional. Tudo passa pelo controle de qualidade interno.', icon: Film },
    { num: '04', title: 'Aprovação no Portal', desc: 'Você recebe os conteúdos no Portal do Cliente, assiste, aprova ou solicita ajustes — tudo online.', icon: CheckCircle2 },
    { num: '05', title: 'Publicação & Gestão', desc: 'Nosso social media publica nos melhores horários, responde interações e gerencia seus perfis diariamente.', icon: Instagram },
    { num: '06', title: 'Vendas & Resultados', desc: 'Rodamos tráfego pago, geramos leads e nossa assessoria acompanha sua equipe até fechar a venda.', icon: TrendingUp },
  ];

  const portalFeatures = [
    { icon: Calendar, label: 'Agenda de Gravações', desc: 'Veja suas datas de gravação e confirme presença direto pelo portal.' },
    { icon: Play, label: 'Biblioteca de Conteúdos', desc: 'Assista, aprove ou peça ajustes em todos seus vídeos e artes.' },
    { icon: MessageCircle, label: 'Chat em Tempo Real', desc: 'Comunique-se com a equipe por comentários diretos em cada conteúdo.' },
    { icon: Sparkles, label: 'Zona Criativa', desc: 'Envie referências, ideias e inspirações para a equipe.' },
    { icon: BarChart3, label: 'Métricas de Entrega', desc: 'Acompanhe quantos reels, stories e artes já foram entregues.' },
    { icon: Shield, label: 'Acesso Seguro', desc: 'Cada cliente tem login exclusivo com acesso apenas aos seus conteúdos.' },
  ];

  return (
    <>
      {/* Processo */}
      <section className="py-16 sm:py-24 bg-card border-y border-border/50 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-64 sm:w-96 h-64 sm:h-96 bg-primary/5 rounded-full blur-[80px] sm:blur-[100px]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={staggerContainer} className="text-center mb-10 sm:mb-16">
            <motion.span variants={fadeUp} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Como Funciona</motion.span>
            <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mt-2 sm:mt-3">
              Nosso processo de A a Z
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-sm sm:text-base text-muted-foreground mt-3 sm:mt-4 max-w-xl mx-auto">
              Da estratégia ao fechamento da venda — cada etapa é organizada, transparente e acompanhada por você.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-30px' }} variants={staggerContainer} className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -4 }}
                className="relative p-4 sm:p-7 rounded-xl sm:rounded-2xl border border-border/60 bg-background hover:border-primary/30 hover:shadow-lg transition-all duration-300 group"
              >
                {i < steps.length - 1 && i % 3 !== 2 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-gradient-to-r from-primary/30 to-transparent" />
                )}
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                  <span className="text-2xl sm:text-4xl font-display font-black text-primary/10 group-hover:text-primary/25 transition-colors duration-300">{s.num}</span>
                  <motion.div
                    whileHover={{ rotate: 10 }}
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary/10 flex items-center justify-center"
                  >
                    <s.icon size={16} className="text-primary sm:hidden" />
                    <s.icon size={20} className="text-primary hidden sm:block" />
                  </motion.div>
                </div>
                <h3 className="font-display text-xs sm:text-base font-bold text-foreground">{s.title}</h3>
                <p className="text-[10px] sm:text-sm text-muted-foreground mt-1 sm:mt-2 leading-relaxed line-clamp-3 sm:line-clamp-none">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Portal */}
      <section id="portal" className="py-16 sm:py-24 relative overflow-hidden">
        <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-primary/5 rounded-full blur-[80px] sm:blur-[120px]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={staggerContainer} className="text-center mb-10 sm:mb-16">
            <motion.span variants={fadeUp} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Exclusivo para Clientes</motion.span>
            <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mt-2 sm:mt-3">
              Portal do Cliente — Pulse Club
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-sm sm:text-base text-muted-foreground mt-3 sm:mt-4 max-w-2xl mx-auto">
              Todos os nossos clientes têm acesso exclusivo ao <strong className="text-foreground">Portal Pulse Club</strong> — sua área de membros onde você acompanha tudo em tempo real: agenda de gravações, aprovação de conteúdos, comunicação com a equipe e muito mais.
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-30px' }} variants={staggerContainer} className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 max-w-5xl mx-auto">
            {portalFeatures.map((f, i) => (
              <motion.div
                key={f.label}
                variants={fadeScale}
                custom={i}
                whileHover={{ y: -4, scale: 1.02 }}
                className="p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-primary/20 bg-primary/[0.02] hover:bg-primary/[0.06] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: -5 }}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary/10 flex items-center justify-center mb-2.5 sm:mb-4"
                >
                  <f.icon size={16} className="text-primary sm:hidden" />
                  <f.icon size={20} className="text-primary hidden sm:block" />
                </motion.div>
                <h3 className="font-display text-xs sm:text-sm font-bold text-foreground">{f.label}</h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 leading-relaxed line-clamp-2 sm:line-clamp-none">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-14 text-center"
          >
            <motion.div whileHover={{ scale: 1.03 }} className="inline-flex items-center gap-4 px-8 py-5 rounded-2xl border border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06] transition-colors">
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25"
              >
                <Rocket size={20} className="text-primary-foreground" />
              </motion.div>
              <div className="text-left">
                <p className="text-sm font-bold text-foreground">Incluso em todos os planos</p>
                <p className="text-xs text-muted-foreground">Acesso ao portal com login exclusivo para cada cliente</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </>
  );
}

// ─── Planos ─────────────────────────────────────────────────
function Planos() {
  const plans = [
    {
      name: 'Starter',
      subtitle: 'Para quem está começando no digital',
      features: ['2 criativos/mês', '4 artes para feed/mês', 'Tráfego pago', 'Social media dedicado', 'Calendário editorial'],
      popular: false,
    },
    {
      name: 'Boost',
      subtitle: 'Presença semanal estratégica',
      features: ['4 reels/mês', '2 criativos/mês', 'Até 3 gravações/mês', 'Tráfego pago', 'Social media + designer', 'Conteúdo extra incluso'],
      popular: false,
    },
    {
      name: 'Premium',
      subtitle: 'O mais escolhido',
      features: ['8 reels/mês', '3 criativos/mês', '20 stories/mês', '4 artes para feed/mês', '4 gravações/mês', 'Tráfego pago', 'Social media + designer dedicado', 'Assessoria comercial', 'Conteúdo extra incluso'],
      popular: true,
    },
    {
      name: 'Elite',
      subtitle: 'Para dominar e vender',
      features: ['12 reels/mês', '4 criativos/mês', '40 stories/mês', '4 artes para feed/mês', '5 gravações/mês', 'Tráfego pago', 'Social media + designer exclusivo', 'Assessoria comercial completa', 'Treinamento da equipe de vendas', 'Conteúdo extra incluso', 'Portal do cliente'],
      popular: false,
    },
    {
      name: 'Endomarketing',
      subtitle: 'Presença diária com apresentadora',
      features: ['Stories diários com apresentadora', 'Gravação presencial na empresa', 'Edição profissional diária', 'Postagem direta no perfil', 'Conteúdo humanizado e autêntico', 'Aumento de engajamento orgânico'],
      popular: false,
      isNew: true,
    },
  ];

  return (
    <section id="planos" className="py-16 sm:py-24 bg-card border-y border-border/50 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[800px] h-[200px] sm:h-[400px] bg-primary/5 rounded-full blur-[80px] sm:blur-[120px]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={staggerContainer} className="text-center mb-10 sm:mb-16">
          <motion.span variants={fadeUp} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Planos</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mt-2 sm:mt-3">
            Escolha o plano ideal para sua empresa
          </motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-sm sm:text-base text-muted-foreground mt-3 sm:mt-4 max-w-xl mx-auto">
            Planos flexíveis que se adaptam ao tamanho e necessidade do seu negócio. Todos incluem gravação profissional e edição de alta qualidade.
          </motion.p>
        </motion.div>

        {/* Mobile: horizontal scroll / Desktop: grid */}
        <div className="sm:hidden -mx-4 px-4 overflow-x-auto scrollbar-hide">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="flex gap-3 pb-4" style={{ width: 'max-content' }}>
            {plans.map((p, i) => (
              <motion.div
                key={p.name}
                variants={fadeUp}
                custom={i}
                className={`relative p-5 rounded-xl border transition-all duration-300 flex flex-col w-[260px] shrink-0 ${
                  p.popular
                    ? 'border-primary bg-primary/[0.04] shadow-xl shadow-primary/10'
                    : (p as any).isNew
                      ? 'border-emerald-500/50 bg-emerald-500/[0.03] shadow-lg shadow-emerald-500/10'
                      : 'border-border/60 bg-background'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold whitespace-nowrap shadow-lg shadow-primary/30">
                    Mais Popular
                  </div>
                )}
                {(p as any).isNew && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold whitespace-nowrap shadow-lg shadow-emerald-500/30">
                    Novidade
                  </div>
                )}
                <div className="text-center mb-4 pt-2">
                  <h3 className="font-display text-lg font-bold text-foreground">{p.name}</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.subtitle}</p>
                </div>
                <ul className="space-y-2 mb-5 flex-1">
                  {p.features.map(f => {
                    const isTrafego = f.toLowerCase().includes('tráfego pago');
                    return (
                      <li key={f} className="flex items-start gap-1.5 text-xs">
                        {isTrafego ? (
                          <>
                            <Rocket size={13} className="shrink-0 mt-0.5 text-orange-500 animate-pulse" />
                            <span className="font-bold bg-gradient-to-r from-orange-400 via-red-500 to-yellow-400 bg-clip-text text-transparent drop-shadow-[0_0_6px_rgba(251,146,60,0.4)]">
                              {f}
                            </span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={13} className={`${(p as any).isNew ? 'text-emerald-500' : 'text-success'} shrink-0 mt-0.5`} />
                            <span className="text-foreground">{f}</span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <Button
                  size="sm"
                  onClick={() => window.open(WHATSAPP_LINK, '_blank')}
                  className={`w-full gap-1.5 ${p.popular ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20' : (p as any).isNew ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20' : ''}`}
                  variant={p.popular || (p as any).isNew ? 'default' : 'outline'}
                >
                  <MessageCircle size={12} /> Solicitar proposta
                </Button>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Tablet/Desktop grid */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={staggerContainer} className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 max-w-7xl mx-auto">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              variants={fadeUp}
              custom={i}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`relative p-6 rounded-2xl border transition-all duration-300 flex flex-col ${
                p.popular
                  ? 'border-primary bg-primary/[0.04] shadow-xl shadow-primary/10'
                  : (p as any).isNew
                    ? 'border-emerald-500/50 bg-emerald-500/[0.03] shadow-lg shadow-emerald-500/10'
                    : 'border-border/60 bg-background hover:border-primary/30 hover:shadow-lg'
              }`}
            >
              {p.popular && (
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', delay: 0.3 }}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold whitespace-nowrap shadow-lg shadow-primary/30"
                >
                  Mais Popular
                </motion.div>
              )}
              {(p as any).isNew && (
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', delay: 0.4 }}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold whitespace-nowrap shadow-lg shadow-emerald-500/30"
                >
                  Novidade
                </motion.div>
              )}
              <div className="text-center mb-5 pt-2">
                <h3 className="font-display text-xl font-bold text-foreground">{p.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{p.subtitle}</p>
              </div>
              <ul className="space-y-2.5 mb-6 flex-1">
                {p.features.map(f => {
                  const isTrafego = f.toLowerCase().includes('tráfego pago');
                  return (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      {isTrafego ? (
                        <>
                          <Rocket size={15} className="shrink-0 mt-0.5 text-orange-500 animate-pulse" />
                          <span className="font-bold bg-gradient-to-r from-orange-400 via-red-500 to-yellow-400 bg-clip-text text-transparent drop-shadow-[0_0_6px_rgba(251,146,60,0.4)]">
                            {f}
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={15} className={`${(p as any).isNew ? 'text-emerald-500' : 'text-success'} shrink-0 mt-0.5`} />
                          <span className="text-foreground">{f}</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  onClick={() => window.open(WHATSAPP_LINK, '_blank')}
                  className={`w-full gap-2 ${p.popular ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20' : (p as any).isNew ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20' : ''}`}
                  variant={p.popular || (p as any).isNew ? 'default' : 'outline'}
                >
                  <MessageCircle size={14} /> Solicitar proposta
                </Button>
              </motion.div>
            </motion.div>
          ))}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.5 }} className="text-center text-xs sm:text-sm text-muted-foreground mt-6 sm:mt-10">
          Valores personalizados de acordo com a necessidade da sua empresa.{' '}
          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold hover:underline">Fale conosco →</a>
        </motion.p>
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
    <section id="cases" className="py-16 sm:py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={staggerContainer} className="text-center mb-10 sm:mb-16">
          <motion.span variants={fadeUp} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Cases de Sucesso</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mt-2 sm:mt-3">
            Resultados reais de clientes reais
          </motion.h2>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-30px' }} variants={staggerContainer} className="grid grid-cols-2 gap-3 sm:gap-6 max-w-4xl mx-auto">
          {cases.map((c, i) => (
            <motion.div
              key={c.name}
              variants={fadeUp}
              custom={i}
              whileHover={{ y: -6, scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="p-4 sm:p-7 rounded-xl sm:rounded-2xl border border-border/60 bg-card hover:shadow-xl hover:border-primary/20 transition-all duration-300 group"
            >
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                <motion.div
                  whileHover={{ rotate: 15 }}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors shrink-0"
                >
                  <TrendingUp size={16} className="text-primary sm:hidden" />
                  <TrendingUp size={20} className="text-primary hidden sm:block" />
                </motion.div>
                <div className="min-w-0">
                  <h3 className="font-display text-xs sm:text-base font-bold text-foreground truncate">{c.name}</h3>
                  <span className="text-[10px] sm:text-xs text-muted-foreground">{c.niche}</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-success">{c.result}</p>
              <p className="text-[10px] sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">{c.highlight}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Depoimentos ────────────────────────────────────────────
function Depoimentos() {
  const [testimonials, setTestimonials] = useState<Array<{ client_name: string; client_role: string; message: string; rating: number }>>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    import('@/integrations/supabase/client').then(({ supabase }) => {
      supabase
        .from('client_testimonials')
        .select('client_name, client_role, message, rating')
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(6)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setTestimonials(data);
          } else {
            setTestimonials([
              { client_name: 'Maria Clara', client_role: 'Dona de restaurante', message: 'A Pulse transformou minha presença no Instagram. Em 3 meses, triplicamos as reservas online. O conteúdo é impecável!', rating: 5 },
              { client_name: 'Carlos Eduardo', client_role: 'Empresário automotivo', message: 'Profissionalismo e pontualidade. Os vídeos são de altíssima qualidade e o portal do cliente é incrível.', rating: 5 },
              { client_name: 'Juliana Mendes', client_role: 'Dona de clínica estética', message: 'Nunca imaginei que marketing digital pudesse trazer tanto resultado. A equipe é atenciosa e entende do nosso negócio.', rating: 5 },
            ]);
          }
        });
    });
  }, []);

  // Auto-rotate
  useEffect(() => {
    if (testimonials.length <= 1) return;
    const timer = setInterval(() => setCurrent(c => (c + 1) % testimonials.length), 5000);
    return () => clearInterval(timer);
  }, [testimonials.length]);

  return (
    <section id="depoimentos" className="py-16 sm:py-24 bg-card border-y border-border/50 relative overflow-hidden">
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-warning/5 rounded-full blur-[100px]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={staggerContainer} className="text-center mb-10 sm:mb-16">
          <motion.span variants={fadeUp} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Depoimentos</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mt-2 sm:mt-3">
            O que nossos clientes dizem
          </motion.h2>
        </motion.div>

        {/* Desktop: grid / Mobile: slider */}
        <div className="hidden md:block">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={staggerContainer} className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {testimonials.slice(0, 3).map((t, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -4 }}
                className="p-7 rounded-2xl border border-border/60 bg-background hover:shadow-lg transition-all duration-300"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} size={14} className={j < t.rating ? 'text-warning fill-warning' : 'text-muted-foreground/20'} />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed italic">"{t.message}"</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">{t.client_name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.client_name}</p>
                    <p className="text-xs text-muted-foreground">{t.client_role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Mobile slider */}
        <div className="md:hidden max-w-sm mx-auto">
          <AnimatePresence mode="wait">
            {testimonials.length > 0 && (
              <motion.div
                key={current}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.4 }}
                className="p-7 rounded-2xl border border-border/60 bg-background"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} size={14} className={j < testimonials[current].rating ? 'text-warning fill-warning' : 'text-muted-foreground/20'} />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed italic">"{testimonials[current].message}"</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">{testimonials[current].client_name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{testimonials[current].client_name}</p>
                    <p className="text-xs text-muted-foreground">{testimonials[current].client_role}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Dots */}
          <div className="flex justify-center gap-2 mt-6">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${i === current ? 'bg-primary w-6' : 'bg-muted-foreground/20'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ────────────────────────────────────────────────────
function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faqs = [
    { q: 'Como funciona o processo de gravação?', a: 'Nossos videomakers vão até sua empresa nos dias agendados, gravam os conteúdos planejados e enviam para nossa equipe de edição. Todo o processo é acompanhado pelo Portal do Cliente.' },
    { q: 'Vocês atendem em qual região?', a: 'Somos de Minaçu - GO, mas atendemos empresas em todo o Brasil! Para clientes de outras cidades, adaptamos nosso modelo de produção para garantir a mesma qualidade.' },
    { q: 'Quanto tempo leva para os resultados aparecerem?', a: 'Os primeiros resultados começam a aparecer entre 30 e 90 dias, dependendo do nicho e do investimento. O marketing digital é um trabalho contínuo que cresce com consistência.' },
    { q: 'Posso aprovar os conteúdos antes de serem publicados?', a: 'Sim! Todos os conteúdos são enviados para sua aprovação através do nosso Portal do Cliente. Você pode assistir, aprovar ou solicitar ajustes diretamente pela plataforma.' },
    { q: 'O que diferencia a Pulse de outras agências?', a: 'Nós não fazemos só o tráfego pago. Cuidamos de todo o processo: gravamos, editamos, gerenciamos suas redes e ainda acompanhamos sua equipe comercial até fechar a venda, criando métodos e orientando como converter mais clientes.' },
    { q: 'Vocês fazem assessoria comercial?', a: 'Sim! Temos uma equipe de assessoria comercial completa. Acompanhamos seu time de atendimento, criamos scripts de abordagem e orientamos como fechar mais negócios a partir dos leads gerados.' },
  ];

  return (
    <section id="faq" className="py-24 relative">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={staggerContainer} className="text-center mb-16">
          <motion.span variants={fadeUp} className="text-sm font-semibold text-primary uppercase tracking-wider">Perguntas Frequentes</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3">
            Tire suas dúvidas
          </motion.h2>
        </motion.div>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={staggerContainer} className="space-y-3">
          {faqs.map((f, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              custom={i}
              className={`border rounded-xl overflow-hidden transition-all duration-300 ${
                openIndex === i ? 'border-primary/30 shadow-md shadow-primary/5' : 'border-border/60'
              }`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-accent/30 transition-colors"
              >
                <span className="text-sm font-semibold text-foreground pr-4">{f.q}</span>
                <motion.div animate={{ rotate: openIndex === i ? 180 : 0 }} transition={{ duration: 0.3 }}>
                  <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
                </motion.div>
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <p className="text-sm text-muted-foreground leading-relaxed px-5 pb-5">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
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
    <section id="contato" className="py-24 bg-card border-t border-border/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.02] to-primary/[0.05]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={staggerContainer} className="text-center max-w-2xl mx-auto">
          <motion.span variants={fadeUp} className="text-sm font-semibold text-primary uppercase tracking-wider">Vamos conversar?</motion.span>
          <motion.h2 variants={fadeUp} custom={1} className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-3">
            Pronto para transformar sua presença digital?
          </motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-muted-foreground mt-4">
            Entre em contato conosco e descubra como podemos ajudar sua empresa a crescer nas redes sociais com conteúdo profissional e estratégico.
          </motion.p>
          <motion.div variants={fadeUp} custom={3} className="mt-8">
            <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                onClick={() => window.open(WHATSAPP_LINK, '_blank')}
                className="gap-2 text-base px-10 py-7 bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/30 relative overflow-hidden group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <MessageCircle size={18} /> Falar pelo WhatsApp
              </Button>
            </motion.div>
          </motion.div>

          <motion.div variants={fadeUp} custom={4} className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
            <motion.div whileHover={{ y: -2 }} className="flex items-center gap-2">
              <Phone size={14} className="text-primary" />
              (62) 9 8538-2981
            </motion.div>
            <motion.a
              href={INSTAGRAM_LINK}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ y: -2 }}
              className="flex items-center gap-2 hover:text-foreground transition-colors"
            >
              <Instagram size={14} className="text-primary" />
              @ag.pulse
            </motion.a>
            <motion.div whileHover={{ y: -2 }} className="flex items-center gap-2">
              <MapPin size={14} className="text-primary" />
              Minaçu - GO | Atendemos todo o Brasil
            </motion.div>
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
      <ComoFunciona />
      <Planos />
      <Cases />
      <Depoimentos />
      <FAQ />
      <Contato />
      <Footer />
      <FloatingCTA />
    </div>
  );
}

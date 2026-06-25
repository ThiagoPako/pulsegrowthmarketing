import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Link2 } from 'lucide-react';
import {
  Check, ArrowRight, ArrowLeft, Sparkles, Target, TrendingUp,
  Users, PlayCircle, Calendar, BarChart3, MessageSquare, Eye, Ticket, Palette, X,
  Film, Image as ImageIcon, Megaphone, PenTool, FileText, Layers, Crown, PiggyBank, TrendingDown,
  MessageCircle,
} from 'lucide-react';
const WHATSAPP_NUMBER = '5562985382981';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { supabase as vpsDb } from '@/lib/vpsDb';
import { getPlan, PLANS } from '@/data/plans';

const SHOWCASE_CLIENTS = ['shallon', 'super brasil', 'casa & decor'];

const PRESENTATION_ORDER: Array<'starter' | 'boost' | 'premium' | 'elite'> = [
  'starter', 'boost', 'premium', 'elite',
];

const LOGO_URL = '/pulse-logo.png';

const PORTAL_FEATURES = [
  { icon: PlayCircle, title: 'Biblioteca de Conteúdos', desc: 'Todos os reels, vídeos, criativos e stories organizados estilo streaming, com filtros e download.' },
  { icon: Palette, title: 'Zona Criativa', desc: 'Envio de ideias, roteiros, referências e prioridades direto pra equipe de produção.' },
  { icon: Calendar, title: 'Calendário de Gravação', desc: 'Confirmação de presença, troca de horário e visão completa das agendas do mês.' },
  { icon: BarChart3, title: 'Dashboard de Entregas', desc: 'Acompanhamento em tempo real do que foi entregue x contratado.' },
  { icon: Ticket, title: 'Clube de Descontos', desc: 'Emissão de cupons promocionais ilimitados para campanhas e parcerias.' },
  { icon: MessageSquare, title: 'Aprovação & Comentários', desc: 'Aprove ou peça alteração em cada vídeo/arte com um clique, sem WhatsApp solto.' },
  { icon: Eye, title: 'Notificações', desc: 'Avisos de novos conteúdos, gravações e alterações em tempo real.' },
  { icon: Sparkles, title: 'Eventos & Lives', desc: 'Cadastro de eventos, captação de leads e cobertura programada.' },
  { icon: Megaphone, title: 'Panfletagem Digital', desc: 'Encartes interativos, ofertas com QR code e métricas de visualização.' },
  { icon: PenTool, title: 'Briefings de Design', desc: 'Solicitação de artes avulsas com referências, prazos e status do designer.' },
  { icon: PlayCircle, title: 'Treinamentos', desc: 'Trilhas de capacitação em vendas, marketing e atendimento para a equipe do cliente.' },
  { icon: FileText, title: 'Tutoriais & Boas-vindas', desc: 'Onboarding guiado para que o cliente domine o portal em minutos.' },
];

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: 'easeOut' as const },
};

const parsePrice = (s: string): number => {
  const n = Number(String(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

type Category = { title: string; icon: typeof Film; items: string[] };

function categorizeFeatures(features: string[]): Category[] {
  const buckets: Record<string, Category> = {
    video:    { title: 'Vídeo & Reels',         icon: Film,        items: [] },
    arte:     { title: 'Design & Artes',         icon: ImageIcon,   items: [] },
    trafego:  { title: 'Tráfego Pago & Anúncios',icon: Megaphone,   items: [] },
    estrategia:{title: 'Estratégia & Conteúdo',  icon: PenTool,     items: [] },
    gestao:   { title: 'Gestão & Relatórios',    icon: BarChart3,   items: [] },
    extras:   { title: 'Extras & Diferenciais',  icon: Sparkles,    items: [] },
  };
  features.forEach((f) => {
    const t = f.toLowerCase();
    if (/(reel|vídeo|video|edição|edicao|roteiro|gravaç|criativ.*víd|criativ.*vid|story|stories)/.test(t)) buckets.video.items.push(f);
    else if (/(arte|design|post|feed|perfil|destaque|foto)/.test(t)) buckets.arte.items.push(f);
    else if (/(tráfego|trafego|ads|anúnci|anunci|meta ads|google ads|campanh|criativo.*anúnc|criativo.*anunc)/.test(t)) buckets.trafego.items.push(f);
    else if (/(linha editorial|estratég|estrateg|público|publico|análise|analise|sazon|comerci|vendas|treinamento)/.test(t)) buckets.estrategia.items.push(f);
    else if (/(dashboard|relatóri|relatori|portal|crm|monitor|google meu negócio|google meu negocio|gestão|gestao|social media)/.test(t)) buckets.gestao.items.push(f);
    else buckets.extras.items.push(f);
  });
  return Object.values(buckets).filter((b) => b.items.length > 0);
}


export default function ApresentacaoPlano() {
  const { plano } = useParams<{ plano: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/p/');
  const baseRoute = isPublic ? '/p/planos' : '/apresentacao';
  const [team, setTeam] = useState<any[]>([]);
  const [showcaseVideos, setShowcaseVideos] = useState<Array<{ id: string; title: string; file_url: string; thumbnail_url?: string; client_name: string }>>([]);

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

    (async () => {
      try {
        const { data: clientsData } = await (vpsDb as any).from('clients').select('id, company_name');
        const showcase = (clientsData || []).filter((c: any) =>
          SHOWCASE_CLIENTS.some((name) => (c.company_name || '').toLowerCase().includes(name))
        );
        if (showcase.length === 0) return;
        const ids = showcase.map((c: any) => c.id);
        const { data: contents } = await (vpsDb as any)
          .from('client_portal_contents')
          .select('id, title, file_url, thumbnail_url, client_id, content_type, status, created_at')
          .in('client_id', ids)
          .eq('content_type', 'reel')
          .order('created_at', { ascending: false });
        const nameById = new Map(showcase.map((c: any) => [c.id, c.company_name]));
        const videos = (contents || [])
          .filter((v: any) => v.file_url)
          .slice(0, 6)
          .map((v: any) => ({
            id: v.id,
            title: v.title,
            file_url: v.file_url,
            thumbnail_url: v.thumbnail_url,
            client_name: nameById.get(v.client_id) || '',
          }));
        setShowcaseVideos(videos);
      } catch (err) {
        console.warn('showcase videos error', err);
      }
    })();
  }, [plan]);

  const currentIndex = plano ? PRESENTATION_ORDER.indexOf(plano as any) : -1;
  const prevKey = currentIndex > 0 ? PRESENTATION_ORDER[currentIndex - 1] : null;
  const nextKey = currentIndex >= 0 && currentIndex < PRESENTATION_ORDER.length - 1
    ? PRESENTATION_ORDER[currentIndex + 1]
    : null;

  const goPrev = () => { if (prevKey) { navigate(`${baseRoute}/${prevKey}`); window.scrollTo({ top: 0 }); } };
  const goNext = () => { if (nextKey) { navigate(`${baseRoute}/${nextKey}`); window.scrollTo({ top: 0 }); } };

  const copyPublicLink = async () => {
    const url = `${window.location.origin}/p/planos/${plano}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link público copiado!', { description: url });
    } catch {
      toast.error('Não foi possível copiar. Link: ' + url);
    }
  };

  useEffect(() => {
    const scrollByAmount = (delta: number) => {
      const el = document.scrollingElement || document.documentElement;
      el.scrollTo({ top: el.scrollTop + delta, behavior: 'smooth' });
    };
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Remove focus de botões para o navegador não consumir as setas
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const step = window.innerHeight * 0.85;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); scrollByAmount(step); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); scrollByAmount(-step); }
      else if (e.key === 'Home') { e.preventDefault(); (document.scrollingElement || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (e.key === 'End') { e.preventDefault(); (document.scrollingElement || document.documentElement).scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
      else if (e.key === 'Escape') { window.close(); }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as any);
  }, [prevKey, nextKey]);

  if (!plan) return <Navigate to={isPublic ? '/p/planos' : '/apresentacao'} replace />;

  const Icon = plan.icon;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Top bar: posição + ações */}
      <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 md:gap-2">
        <Badge variant="outline" className="backdrop-blur bg-background/80 text-xs px-2">
          {currentIndex + 1}/{PRESENTATION_ORDER.length}
        </Badge>
        <Button variant="outline" size="sm" onClick={copyPublicLink} className="backdrop-blur bg-background/80 h-8 px-2 md:px-3" aria-label="Copiar link">
          <Link2 className="h-4 w-4 md:mr-1" />
          <span className="hidden md:inline">Copiar link</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.close()} className="backdrop-blur bg-background/80 h-8 px-2 md:px-3" aria-label="Fechar">
          <X className="h-4 w-4 md:mr-1" />
          <span className="hidden md:inline">Fechar</span>
        </Button>
      </div>

      {/* Botão flutuante WhatsApp */}
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Olá! Vi a apresentação do plano ${plan.name} da Pulse e gostaria de mais informações.`)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 h-14 w-14 md:h-16 md:w-auto md:px-5 rounded-full bg-[#25D366] text-white shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-2 font-semibold animate-pulse hover:animate-none"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="hidden md:inline">Falar com a Pulse</span>
      </a>

      {/* Setas fixas de navegação entre planos */}
      {prevKey && (
        <button
          onClick={goPrev}
          aria-label="Plano anterior"
          className="fixed left-2 md:left-3 bottom-4 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-50 h-11 w-11 md:h-14 md:w-14 rounded-full bg-background/80 backdrop-blur border border-border shadow-lg hover:bg-primary hover:text-primary-foreground hover:scale-110 transition-all flex items-center justify-center"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
        </button>
      )}
      {nextKey && (
        <button
          onClick={goNext}
          aria-label="Próximo plano"
          className="fixed left-16 md:left-auto md:right-3 bottom-4 md:bottom-auto md:top-1/2 md:-translate-y-1/2 z-50 h-11 w-11 md:h-14 md:w-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:scale-110 transition-all flex items-center justify-center animate-pulse"
        >
          <ArrowRight className="h-5 w-5 md:h-6 md:w-6" />
        </button>
      )}

      {/* Dica de teclado */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 hidden md:flex items-center gap-3 px-4 py-2 rounded-full bg-background/80 backdrop-blur border border-border text-xs text-muted-foreground shadow">
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

        <div className="container mx-auto px-4 md:px-6 text-center relative z-10 pt-16 md:pt-0">
          <motion.img src={LOGO_URL} alt="Pulse" className="h-14 md:h-20 mx-auto mb-4 md:mb-6" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} />

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Badge className="mb-4 md:mb-6 bg-primary/10 text-primary border-primary/20">
              <Sparkles className="h-3 w-3 mr-1" /> Plano apresentado
            </Badge>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center mx-auto mb-4 md:mb-6 shadow-2xl">
            <Icon className="h-10 w-10 md:h-12 md:w-12 text-primary-foreground" />
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-4 leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.7 }}
          >
            <span className="bg-gradient-to-r from-primary via-orange-500 to-primary bg-clip-text text-transparent">{plan.name}</span>
          </motion.h1>
          <motion.p className="text-lg md:text-2xl text-foreground/90 max-w-2xl mx-auto mb-3 md:mb-4 font-semibold px-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
            {plan.tagline}
          </motion.p>
          <motion.p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 md:mb-10 px-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            {plan.description}
          </motion.p>

          <motion.div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            <ArrowRight className="h-4 w-4 animate-pulse" />
            Role para ver tudo que está incluso
          </motion.div>
        </div>
      </section>

      {/* PARA QUEM É */}
      <section className="py-14 md:py-20 bg-secondary/30">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl">
          <motion.div {...fadeUp} className="text-center">
            <Badge variant="outline" className="mb-4">Ideal para</Badge>
            <h2 className="text-2xl md:text-4xl font-bold mb-4 md:mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              Esse plano é <span className="text-primary">perfeito</span> para você se...
            </h2>
            <p className="text-base md:text-xl text-muted-foreground leading-relaxed">{plan.ideal}</p>
          </motion.div>
        </div>
      </section>

      {/* ENTREGAS — categorizadas */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <motion.div {...fadeUp} className="text-center mb-10 md:mb-16">
            <Badge className="mb-4 bg-primary text-primary-foreground">{plan.features.length} entregas mensais</Badge>
            <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Tudo que está <span className="text-primary">incluso</span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground">Organizado por área para você visualizar a operação completa.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {categorizeFeatures(plan.features).map((cat, idx) => (
              <motion.div
                key={cat.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="bg-gradient-to-br from-card to-secondary/30 border-2 border-border rounded-3xl p-6 md:p-8 hover:border-primary/50 hover:shadow-xl transition-all"
              >
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
                  <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
                    <cat.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>{cat.title}</h3>
                    <p className="text-xs text-muted-foreground">{cat.items.length} {cat.items.length === 1 ? 'entrega' : 'entregas'}</p>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {cat.items.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm md:text-base">
                      <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="font-medium">{f}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* INVESTIMENTO — destaque ANUAL */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-secondary/30 to-background">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <motion.div {...fadeUp} className="text-center mb-10 md:mb-14">
            <Badge variant="outline" className="mb-4">Investimento</Badge>
            <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              Economize fechando <span className="text-primary">o plano anual</span>
            </h2>
            <p className="text-base md:text-lg text-muted-foreground">Mesmo plano, mesma entrega — pagando menos por mês.</p>
          </motion.div>

          {(() => {
            const semestral = plan.pricing[0];
            const anual = plan.pricing[plan.pricing.length - 1];
            const sem = parsePrice(semestral.monthly);
            const an = parsePrice(anual.monthly);
            const diffMes = sem - an;
            const totalEconomia = diffMes * 12;
            const pct = sem > 0 ? Math.round((diffMes / sem) * 100) : 0;

            return (
              <>
                {/* Banner de economia */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white p-6 md:p-10 mb-8 md:mb-10 shadow-2xl"
                >
                  <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
                  <div className="relative flex flex-col md:flex-row items-center md:items-center text-center md:text-left justify-between gap-5 md:gap-6">
                    <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4">
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                        <PiggyBank className="h-8 w-8 md:h-10 md:w-10" />
                      </div>
                      <div>
                        <div className="text-xs md:text-sm font-semibold uppercase tracking-wider opacity-90">Economia total no anual</div>
                        <div className="text-4xl md:text-6xl font-bold leading-none mt-1" style={{ fontFamily: 'var(--font-display)' }}>
                          {brl(totalEconomia)}
                        </div>
                        <div className="text-xs md:text-sm opacity-90 mt-1">
                          {brl(diffMes)} a menos por mês • {pct}% de desconto
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm bg-white/15 backdrop-blur rounded-full px-4 py-2 font-semibold">
                      <TrendingDown className="h-4 w-4" />
                      Recomendamos o anual
                    </div>
                  </div>
                </motion.div>

                {/* Cards comparativos */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Semestral */}
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="relative rounded-3xl p-6 md:p-8 border-2 border-border bg-card opacity-90"
                  >
                    <div className="text-xs md:text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                      Contrato {semestral.label}
                    </div>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-4xl md:text-5xl font-bold text-muted-foreground line-through decoration-2" style={{ fontFamily: 'var(--font-display)' }}>
                        {semestral.monthly}
                      </span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                    <div className="text-sm text-muted-foreground">Sem desconto de fidelidade</div>
                  </motion.div>

                  {/* Anual — destaque */}
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 }}
                    className="relative rounded-3xl p-6 md:p-8 border-2 border-primary bg-gradient-to-br from-primary via-orange-600 to-primary text-primary-foreground shadow-2xl md:scale-105"
                  >
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-300 text-yellow-950 font-bold shadow-lg whitespace-nowrap">
                      <Crown className="h-3 w-3 mr-1" /> Mais escolhido
                    </Badge>
                    <div className="text-xs md:text-sm font-semibold mb-2 text-primary-foreground/90 uppercase tracking-wider">
                      Contrato {anual.label}
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-5xl md:text-6xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                        {anual.monthly}
                      </span>
                      <span className="text-sm text-primary-foreground/80">/mês</span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 bg-yellow-300 text-yellow-950 rounded-full px-3 py-1 text-xs md:text-sm font-bold mt-2">
                      <PiggyBank className="h-3.5 w-3.5" /> Economiza {brl(diffMes)}/mês
                    </div>
                    {anual.save && (
                      <div className="text-sm font-semibold text-yellow-100 mt-3 flex items-center gap-1">
                        💰 {anual.save}
                      </div>
                    )}
                  </motion.div>
                </div>
              </>
            );
          })()}
        </div>
      </section>


      {/* DIFERENCIAIS */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <motion.div {...fadeUp} className="text-center mb-10 md:mb-16">
            <Badge variant="outline" className="mb-4">Por que a Pulse?</Badge>
            <h2 className="text-3xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
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
      {(true) && (
        <section className="py-24">
          <div className="container mx-auto px-6 max-w-6xl">
            <motion.div {...fadeUp} className="text-center mb-16">
              <Badge variant="outline" className="mb-4"><Users className="h-3 w-3 mr-1" /> Nosso time</Badge>
              <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Quem cuida do <span className="text-primary">seu projeto</span>
              </h2>
            </motion.div>

            {team.length === 0 ? (
              <div className="text-center py-12 bg-card border border-dashed border-border rounded-3xl">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                <p className="text-muted-foreground">Cadastre sua equipe em <code className="px-2 py-1 rounded bg-secondary text-foreground">/admin/equipe</code> para aparecer aqui automaticamente.</p>
              </div>
            ) : (
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
            )}
          </div>
        </section>
      )}

      {/* PORTAL EM AÇÃO — vídeos reais de clientes */}
      {showcaseVideos.length > 0 && (
        <section className="py-24 bg-secondary/30">
          <div className="container mx-auto px-6 max-w-6xl">
            <motion.div {...fadeUp} className="text-center mb-12">
              <Badge variant="outline" className="mb-4"><PlayCircle className="h-3 w-3 mr-1" /> Veja na prática</Badge>
              <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Conteúdos reais entregues <span className="text-primary">pelo portal</span>
              </h2>
              <p className="text-lg text-muted-foreground">Veja como o cliente recebe e aprova materiais direto na plataforma Pulse.</p>
            </motion.div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {showcaseVideos.map((v, i) => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/50 hover:shadow-xl transition-all group"
                >
                  <div className="aspect-[9/16] bg-black relative overflow-hidden">
                    <video
                      src={v.file_url}
                      poster={v.thumbnail_url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <div className="text-xs text-primary font-semibold uppercase tracking-wider mb-1">{v.client_name}</div>
                    <h3 className="font-bold text-sm line-clamp-2">{v.title}</h3>
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

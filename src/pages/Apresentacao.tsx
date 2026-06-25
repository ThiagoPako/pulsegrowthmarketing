import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Check, ExternalLink, X, Link2, MessageCircle } from 'lucide-react';
const WHATSAPP_NUMBER = '5562985382981';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PLANS } from '@/data/plans';

const LOGO_URL = '/pulse-logo.png';

export default function Apresentacao() {
  const navigate = useNavigate();
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/p/');
  const baseRoute = isPublic ? '/p/planos' : '/apresentacao';

  const openPlan = (key: string) => {
    window.open(`${baseRoute}/${key}`, '_blank', 'noopener,noreferrer');
  };

  const copyPublicLink = async (planKey?: string) => {
    const url = planKey
      ? `${window.location.origin}/p/planos/${planKey}`
      : `${window.location.origin}/p/planos`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link público copiado!', { description: url });
    } catch {
      toast.error('Copie manualmente: ' + url);
    }
  };

  // Ordem: Boost primeiro (foco), depois os outros
  const ordered = [
    PLANS.find((p) => p.key === 'starter')!,
    PLANS.find((p) => p.key === 'boost')!,
    PLANS.find((p) => p.key === 'premium')!,
    PLANS.find((p) => p.key === 'elite')!,
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        {!isPublic && (
          <Button variant="default" size="sm" onClick={() => copyPublicLink()} className="backdrop-blur shadow-lg">
            <Link2 className="h-4 w-4 mr-1" /> Copiar link público
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => isPublic ? window.close() : navigate(-1)} className="backdrop-blur bg-background/80">
          <X className="h-4 w-4 mr-1" /> {isPublic ? 'Fechar' : 'Sair'}
        </Button>
      </div>

      {/* HERO */}
      <section className="relative pt-20 pb-12 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 -left-32 w-[600px] h-[600px] rounded-full bg-primary/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-0 -right-32 w-[600px] h-[600px] rounded-full bg-primary/30 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="container mx-auto px-6 text-center">
          <motion.img
            src={LOGO_URL}
            alt="Pulse"
            className="h-20 mx-auto mb-6"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
          />
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            <Sparkles className="h-3 w-3 mr-1" /> Apresentação Comercial
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4" style={{ fontFamily: 'var(--font-display)' }}>
            Escolha o plano para <br />
            <span className="bg-gradient-to-r from-primary via-orange-500 to-primary bg-clip-text text-transparent">
              apresentar ao cliente
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-2">
            Clique em um plano abaixo. Ele abrirá em uma <strong>nova aba</strong> com a apresentação completa e isolada — só aquele plano.
          </p>
          <p className="text-sm text-muted-foreground">
            <ArrowRight className="inline h-4 w-4 mr-1 text-primary animate-pulse" />
            Recomendamos começar pelo <strong className="text-primary">Pulse Boost</strong> — é o plano que mais converte.
          </p>
        </div>
      </section>

      {/* PLAN CARDS */}
      <section className="pb-24">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {ordered.map((plan, i) => {
              const Icon = plan.icon;
              const isBoost = plan.key === 'boost';
              return (
                <motion.button
                  key={plan.key}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  onClick={() => openPlan(plan.key)}
                  className={`group relative text-left rounded-3xl p-8 border-2 transition-all hover:-translate-y-2 hover:shadow-2xl ${
                    isBoost
                      ? 'bg-gradient-to-br from-primary to-orange-600 text-primary-foreground border-primary shadow-2xl md:scale-105'
                      : 'bg-card border-border hover:border-primary/40'
                  }`}
                >
                  {plan.badge && (
                    <Badge className={`absolute -top-3 left-8 ${isBoost ? 'bg-background text-primary' : 'bg-primary text-primary-foreground'}`}>
                      {plan.badge}
                    </Badge>
                  )}

                  <div className="flex items-start justify-between mb-6">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isBoost ? 'bg-background/20' : 'bg-primary/10'}`}>
                      <Icon className={`h-8 w-8 ${isBoost ? 'text-primary-foreground' : 'text-primary'}`} />
                    </div>
                    <ExternalLink className={`h-5 w-5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all ${isBoost ? 'text-primary-foreground' : 'text-primary'}`} />
                  </div>

                  <h3 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>{plan.name}</h3>
                  <p className={`text-sm mb-4 font-medium ${isBoost ? 'text-primary-foreground/90' : 'text-primary'}`}>{plan.tagline}</p>
                  <p className={`text-sm mb-6 ${isBoost ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>{plan.ideal}</p>

                  <div className={`flex items-baseline gap-2 mb-4 pt-4 border-t ${isBoost ? 'border-primary-foreground/20' : 'border-border'}`}>
                    <span className={`text-xs ${isBoost ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>A partir de</span>
                    <span className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                      {plan.pricing[plan.pricing.length - 1].monthly}
                    </span>
                    <span className={`text-xs ${isBoost ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>/mês</span>
                  </div>

                  <div className={`flex items-center gap-2 text-sm font-semibold ${isBoost ? 'text-primary-foreground' : 'text-primary'}`}>
                    <Check className="h-4 w-4" />
                    {plan.features.length} entregas mensais
                    <ArrowRight className="h-4 w-4 ml-auto group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.button>
              );
            })}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-12 max-w-xl mx-auto">
            Dica: abra os planos em abas separadas e alterne entre elas durante a reunião. Cada página é independente — o cliente vê apenas o plano que você escolher apresentar.
          </p>
        </div>
      </section>

      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Olá! Vi a apresentação de planos da Pulse e gostaria de mais informações.')}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        className="fixed bottom-6 right-6 z-50 h-16 px-5 rounded-full bg-[#25D366] text-white shadow-2xl hover:scale-105 transition-all flex items-center gap-2 font-semibold animate-pulse hover:animate-none"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="hidden sm:inline">Falar com a Pulse</span>
      </a>
    </div>
  );
}

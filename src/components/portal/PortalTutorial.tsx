import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, Film, MessageSquare, CheckCircle, Sparkles, AlertTriangle, 
  Flame, ChevronRight, ChevronLeft, X, Play, Eye, Star, HelpCircle
} from 'lucide-react';

interface Props {
  clientColor: string;
}

interface TutorialStep {
  icon: any;
  title: string;
  description: string;
  tips: string[];
  color: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: Film,
    title: 'Biblioteca de Conteúdos',
    description: 'Aqui você encontra todos os vídeos e conteúdos produzidos pela nossa equipe, organizados por temporada (mês).',
    tips: [
      'Navegue entre os meses usando as setas no topo',
      'Clique em qualquer vídeo para visualizar em tela cheia',
      'Passe o mouse sobre o vídeo para ver um preview automático',
      'Os conteúdos são organizados por tipo: Reels, Criativos, Institucionais',
    ],
    color: 'from-blue-500/20 to-indigo-500/20',
  },
  {
    icon: CheckCircle,
    title: 'Aprovação de Conteúdo',
    description: 'Ao receber um novo vídeo, você será notificado para aprovar ou solicitar ajustes antes da publicação.',
    tips: [
      'Clique em "Aprovar" se o conteúdo está pronto para publicação',
      'Use "Solicitar Ajuste" para pedir modificações — descreva o que precisa mudar',
      'Você também pode enviar comentários para discutir detalhes com a equipe',
      'Conteúdos pendentes aparecem com badge amarelo',
    ],
    color: 'from-emerald-500/20 to-green-500/20',
  },
  {
    icon: MessageSquare,
    title: 'Chat de Comentários',
    description: 'Cada conteúdo tem um chat onde você pode conversar diretamente com a equipe criativa.',
    tips: [
      'Os comentários da equipe aparecem identificados com nome e cargo',
      'Use o chat para dar feedback específico sobre edição, roteiro ou estilo',
      'As respostas da equipe chegam em tempo real',
    ],
    color: 'from-violet-500/20 to-purple-500/20',
  },
  {
    icon: Sparkles,
    title: 'Zona Criativa',
    description: 'Explore os roteiros criados pela equipe para seus conteúdos. Cada roteiro tem tipo, categoria e informações do autor.',
    tips: [
      'Filtre roteiros por categoria usando as tags coloridas',
      'Clique em um roteiro para ler o conteúdo completo',
      'Veja quem da equipe criou cada roteiro',
      'Os roteiros são organizados por tipo de conteúdo',
    ],
    color: 'from-amber-500/20 to-orange-500/20',
  },
  {
    icon: AlertTriangle,
    title: 'Prioridade de Gravação',
    description: 'Marque os roteiros que você mais quer gravar primeiro! A equipe organiza a agenda com base nas suas prioridades.',
    tips: [
      'Use "Prioridade" para roteiros que você prefere gravar antes',
      'Use "Urgente" para roteiros que precisam ser gravados o mais rápido possível',
      'Roteiros marcados aparecem no topo da lista com destaque especial',
      'Clique novamente para remover a marcação',
    ],
    color: 'from-red-500/20 to-rose-500/20',
  },
  {
    icon: Eye,
    title: 'Métricas & Entregas',
    description: 'Acompanhe o progresso das entregas mensais e veja exatamente o que está contratado vs. o que já foi entregue.',
    tips: [
      'O indicador "Overdelivery" mostra quando entregamos mais do que o contratado',
      'Veja a distribuição por tipo de conteúdo',
      'Acompanhe status: pendentes, aprovados e em ajuste',
    ],
    color: 'from-cyan-500/20 to-teal-500/20',
  },
];

export default function PortalTutorial({ clientColor }: Props) {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const step = TUTORIAL_STEPS[currentStep];
  const Icon = step.icon;

  return (
    <>
      <button
        onClick={() => { setOpen(true); setCurrentStep(0); }}
        className="p-2 rounded-full hover:bg-white/10 transition-colors"
        title="Como usar o portal"
      >
        <HelpCircle size={16} className="text-white/50" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-lg"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-[#14141f] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl">
                {/* Header with gradient */}
                <div className={`relative h-32 bg-gradient-to-br ${step.color} overflow-hidden`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-white/[0.06] flex items-center justify-center">
                      <Icon size={36} className="text-white/40" />
                    </div>
                  </div>
                  {/* Step indicator */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    {TUTORIAL_STEPS.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentStep(i)}
                        className={`h-1.5 rounded-full transition-all ${
                          i === currentStep ? 'w-6 bg-white/80' : 'w-1.5 bg-white/20 hover:bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    <span className="text-[10px] text-white/50 font-medium">{currentStep + 1}/{TUTORIAL_STEPS.length}</span>
                    <button onClick={() => setOpen(false)} className="p-1.5 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors">
                      <X size={12} className="text-white/70" />
                    </button>
                  </div>
                  <div className="absolute bottom-3 left-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm text-[10px] font-semibold text-white/90">
                      <BookOpen size={10} /> Tutorial
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{step.title}</h3>
                    <p className="text-sm text-white/50 mt-1 leading-relaxed">{step.description}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Dicas</p>
                    {step.tips.map((tip, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]"
                      >
                        <Star size={10} className="mt-0.5 shrink-0" style={{ color: `hsl(${clientColor})` }} />
                        <p className="text-xs text-white/60 leading-relaxed">{tip}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between px-6 pb-6">
                  <button
                    onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                    disabled={currentStep === 0}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-white/40 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} /> Anterior
                  </button>
                  {currentStep === TUTORIAL_STEPS.length - 1 ? (
                    <button
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: `hsl(${clientColor})` }}
                    >
                      <Play size={12} /> Começar a usar
                    </button>
                  ) : (
                    <button
                      onClick={() => setCurrentStep(prev => Math.min(TUTORIAL_STEPS.length - 1, prev + 1))}
                      className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
                      style={{ background: `hsl(${clientColor})` }}
                    >
                      Próximo <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

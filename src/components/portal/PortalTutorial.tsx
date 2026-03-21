import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Film, MessageSquare, CheckCircle, Sparkles,
  ChevronRight, ChevronLeft, X, Play, Eye, HelpCircle
} from 'lucide-react';

interface Props {
  clientColor: string;
}

interface TutorialStep {
  icon: any;
  title: string;
  description: string;
  tips: string[];
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: Film,
    title: 'Biblioteca de Conteúdos',
    description: 'Todos os vídeos e conteúdos produzidos, organizados por mês.',
    tips: [
      'Navegue entre os meses usando as setas no topo',
      'Clique em qualquer vídeo para visualizar',
      'Conteúdos são organizados por tipo: Reels, Criativos, etc.',
    ],
  },
  {
    icon: CheckCircle,
    title: 'Aprovação de Conteúdo',
    description: 'Aprove ou solicite ajustes antes da publicação.',
    tips: [
      'Clique em "Aprovar" se está pronto para publicar',
      'Use "Solicitar Ajuste" para pedir modificações',
      'Conteúdos pendentes aparecem com badge amarelo',
    ],
  },
  {
    icon: MessageSquare,
    title: 'Chat de Comentários',
    description: 'Converse diretamente com a equipe em cada conteúdo.',
    tips: [
      'Os comentários da equipe aparecem identificados com nome e cargo',
      'Use o chat para dar feedback específico sobre edição, roteiro ou estilo',
      'As respostas da equipe chegam em tempo real',
    ],
  },
  {
    icon: Sparkles,
    title: 'Zona Criativa',
    description: 'Explore os roteiros criados pela equipe para seus conteúdos.',
    tips: [
      'Filtre roteiros por categoria usando as tags',
      'Clique em um roteiro para ler o conteúdo completo',
      'Marque prioridades para organizar a agenda de gravação',
    ],
  },
  {
    icon: Eye,
    title: 'Métricas & Entregas',
    description: 'Acompanhe o progresso das entregas mensais.',
    tips: [
      'Veja o que está contratado vs. o que já foi entregue',
      'Acompanhe status: pendentes, aprovados e em ajuste',
    ],
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

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-sm overflow-y-auto p-4 sm:p-6"
              onClick={() => setOpen(false)}
            >
              <div className="flex min-h-full items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 40, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.96 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="w-full max-w-md md:max-w-lg"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="bg-[#14141f] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[min(720px,calc(100dvh-4rem))]">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `hsl(${clientColor} / 0.15)` }}>
                          <Icon size={18} style={{ color: `hsl(${clientColor})` }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-white/40 font-medium flex items-center gap-1">
                            <BookOpen size={10} /> Tutorial — {currentStep + 1}/{TUTORIAL_STEPS.length}
                          </p>
                          <h3 className="text-sm font-bold text-white truncate">{step.title}</h3>
                        </div>
                      </div>
                      <button onClick={() => setOpen(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0">
                        <X size={14} className="text-white/50" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 px-5 pt-3 shrink-0">
                      {TUTORIAL_STEPS.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentStep(i)}
                          className={`h-1 rounded-full transition-all ${
                            i === currentStep ? 'w-6' : 'w-2 hover:opacity-70'
                          }`}
                          style={{ background: i === currentStep ? `hsl(${clientColor})` : 'rgba(255,255,255,0.15)' }}
                        />
                      ))}
                    </div>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                      <p className="text-sm text-white/50 leading-relaxed">{step.description}</p>

                      <div className="space-y-2">
                        {step.tips.map((tip, i) => (
                          <motion.div
                            key={`${currentStep}-${i}`}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className="flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]"
                          >
                            <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: `hsl(${clientColor})` }} />
                            <p className="text-xs text-white/60 leading-relaxed">{tip}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.06] shrink-0">
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

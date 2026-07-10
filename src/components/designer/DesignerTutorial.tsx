import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Sparkles, ChevronRight, ChevronLeft, X, Play, HelpCircle,
  Inbox, Palette, Pause, Upload, Send, RefreshCcw, CheckCircle2, Archive,
  Clock, Star, Zap, Heart, Target, MessageSquare, Eye,
} from 'lucide-react';

interface Step {
  icon: any;
  title: string;
  intro: string;
  tips: string[];
  highlight?: string;
}

const STEPS: Step[] = [
  {
    icon: Heart,
    title: 'Bem-vinda, Adriely! 💜',
    intro: 'Esse tutorial mostra o passo a passo do teu fluxo de trabalho no sistema. Menos de 3 minutos pra dominar tudo.',
    tips: [
      'Você pode reabrir esse tutorial a qualquer momento pelo botão de ajuda no topo do painel.',
      'A cada etapa você entende o que fazer e onde clicar.',
      'O sistema foi feito pra ficar bonito, leve e rápido pra você. 🎨',
    ],
  },
  {
    icon: Inbox,
    title: '1. Onde ficam as novas demandas',
    intro: 'Toda demanda nova cai no Kanban do Designer, na coluna "Nova Tarefa". Também aparece no seu Painel na fila "Aguardando".',
    tips: [
      'Abra o menu Designer → Kanban pra ver todas as colunas.',
      'Colunas: Nova Tarefa → Executando → Revisão → Ajustes → Aprovadas → Postadas.',
      'Existe também a coluna "Fila Baixa Prioridade" pra tarefas sem pressa.',
      'Se aparecer badge vermelho de SLA, é porque está passando do prazo.',
    ],
    highlight: 'Regra: só 1 tarefa ativa por vez. Isso ajuda a focar e entregar melhor.',
  },
  {
    icon: Play,
    title: '2. Começar uma tarefa',
    intro: 'No seu Painel do Designer, escolha a próxima tarefa da fila e clique em "Iniciar". Ela vai pro Spotlight (destaque no topo).',
    tips: [
      'A tarefa em destaque mostra: cliente, título, copy, referências e prazo.',
      'O cronômetro começa automaticamente — aparece no painel da TV ao vivo. 📺',
      'Se precisar parar, clique em Pausar. Nunca deixe rodando à toa (afeta seu tempo médio).',
      'Precisa de foco total? Use o Modo Foco (F) — tela cheia só da tarefa.',
    ],
  },
  {
    icon: Palette,
    title: '3. Produzir a arte',
    intro: 'Abra a tarefa e leia com atenção: copy, formato(s), referências e observações do cliente.',
    tips: [
      'Verifique as datas sazonais do nicho do cliente (aparecem no card).',
      'Use as imagens/links de referência como inspiração — nunca copie idêntico.',
      'Se o cliente tem playbook, abra o portfólio pra manter a identidade visual dele.',
      'Formato importa: Feed é quadrado/retangular, Story é 9:16, etc.',
    ],
  },
  {
    icon: Upload,
    title: '4. Enviar a arte pra revisão',
    intro: 'Terminou? Abra a tarefa e clique em "Anexar arte" para subir o arquivo final (JPG, PNG ou PDF).',
    tips: [
      'Pode anexar mais de uma arte se forem vários formatos.',
      'Depois clique em "Enviar para Revisão" — a tarefa muda de coluna automaticamente.',
      'O cronômetro é parado e o tempo total fica registrado no seu score.',
      'Notificação é enviada pro gestor e pro cliente.',
    ],
  },
  {
    icon: RefreshCcw,
    title: '5. Se pedirem ajustes',
    intro: 'Cliente ou gestor pode solicitar ajustes. A tarefa volta pra coluna "Ajustes Solicitados".',
    tips: [
      'Leia com calma o comentário do ajuste — está no detalhe da tarefa.',
      'Ao terminar o ajuste, use o botão "Substituir" para trocar a arte anterior pela nova.',
      'Depois envie pra revisão de novo. Sem drama, faz parte do processo. 💪',
    ],
  },
  {
    icon: CheckCircle2,
    title: '6. Arte aprovada e postada',
    intro: 'Quando o cliente aprova, a tarefa vai pra coluna "Aprovadas". Depois de publicar, mova pra "Artes Postadas".',
    tips: [
      'Use o botão de mover em lote pra jogar várias artes aprovadas pra postadas de uma vez.',
      'Só aparecem 10 cards por vez em Aprovadas — clique "Carregar mais" pra ver o resto.',
      'Artes postadas ficam salvas no Playbook do cliente como portfólio.',
    ],
  },
  {
    icon: Star,
    title: '7. Seu desempenho e metas',
    intro: 'No painel você acompanha: meta do dia, score, tempo médio, tarefas concluídas e ranking.',
    tips: [
      'A meta diária tem um foguetinho que sobe conforme você entrega. 🚀',
      'Prioridades: 🌿 Baixa | 💜 Média | ⚡ Alta | 🔥 Urgente — urgente tem SLA de 24h.',
      'Quanto menor o tempo médio e mais entregas no prazo, maior seu score.',
      'Bônus são liberados automaticamente quando você bate metas. 🎁',
    ],
  },
  {
    icon: Sparkles,
    title: 'Dicas de ouro 💎',
    intro: 'Pequenos hábitos que fazem diferença no dia a dia:',
    tips: [
      'Sempre use o botão "Começar trabalho" ao iniciar o expediente — aparece na sala virtual.',
      'Use o Playbook do Cliente pra manter consistência visual.',
      'Comente na tarefa se algo estiver confuso — não fique adivinhando.',
      'Se a fila estiver limpa, puxe da "Fila Baixa Prioridade" pra adiantar. 💜',
      'Salve referências que gostou — vão te ajudar em futuras artes.',
    ],
  },
];

const STORAGE_KEY = 'designer_tutorial_seen_v1';

export default function DesignerTutorial() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setTimeout(() => setOpen(true), 800);
    }
  }, []);

  const close = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setOpen(false);
  };

  const openTutorial = () => {
    setStep(0);
    setOpen(true);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      <button
        onClick={openTutorial}
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-semibold border border-violet-300/60 dark:border-violet-700/50 text-violet-700 dark:text-violet-300 bg-violet-50/60 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-all"
        title="Tutorial de processos"
      >
        <HelpCircle size={14} /> Tutorial
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm overflow-y-auto p-4 sm:p-6"
              onClick={close}
            >
              <div className="flex min-h-full items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.96 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                  className="w-full max-w-lg"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="bg-background border border-violet-300/40 dark:border-violet-700/40 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[min(760px,calc(100dvh-4rem))]">
                    {/* Header */}
                    <div className="relative flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/8 to-pink-500/10">
                      <div className="flex items-center gap-3 min-w-0">
                        <motion.div
                          key={step}
                          initial={{ scale: 0.6, rotate: -20 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-400/30"
                        >
                          <Icon size={18} />
                        </motion.div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-violet-600 dark:text-violet-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            <BookOpen size={10} /> Tutorial · {step + 1}/{STEPS.length}
                          </p>
                          <h3 className="text-base font-display font-bold truncate">{current.title}</h3>
                        </div>
                      </div>
                      <button onClick={close} className="p-2 rounded-full hover:bg-muted transition-colors shrink-0">
                        <X size={14} />
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-1.5 px-5 pt-3 shrink-0">
                      {STEPS.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setStep(i)}
                          className={`h-1.5 rounded-full transition-all ${
                            i === step
                              ? 'w-8 bg-gradient-to-r from-violet-500 to-fuchsia-500'
                              : i < step
                                ? 'w-2 bg-violet-400/60'
                                : 'w-2 bg-muted hover:bg-muted-foreground/30'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                      <motion.p
                        key={`intro-${step}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-muted-foreground leading-relaxed"
                      >
                        {current.intro}
                      </motion.p>

                      <div className="space-y-2">
                        {current.tips.map((tip, i) => (
                          <motion.div
                            key={`${step}-${i}`}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-start gap-2.5 p-3 rounded-2xl bg-muted/50 border border-border"
                          >
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </div>
                            <p className="text-xs text-foreground/80 leading-relaxed">{tip}</p>
                          </motion.div>
                        ))}
                      </div>

                      {current.highlight && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.2 }}
                          className="flex items-start gap-2.5 p-3 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-400/30"
                        >
                          <Zap size={16} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 leading-relaxed">
                            {current.highlight}
                          </p>
                        </motion.div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border shrink-0 bg-muted/20">
                      <button
                        onClick={() => setStep(p => Math.max(0, p - 1))}
                        disabled={step === 0}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft size={14} /> Anterior
                      </button>
                      {isLast ? (
                        <button
                          onClick={close}
                          className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 transition-all shadow-lg shadow-violet-400/30"
                        >
                          <Play size={12} /> Bora criar! 💜
                        </button>
                      ) : (
                        <button
                          onClick={() => setStep(p => Math.min(STEPS.length - 1, p + 1))}
                          className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 transition-all shadow-lg shadow-violet-400/30"
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

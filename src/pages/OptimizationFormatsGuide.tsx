import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Rocket, Music, Wand2, Layers, Scissors, Zap, MessageSquare, Camera,
  Sparkles, ArrowLeft, Clock, Target, Film, Image as ImageIcon, Megaphone,
  Play, CheckCircle2, Lightbulb, TrendingUp, Volume2, Eye
} from 'lucide-react';

// ─── FORMATOS DETALHADOS ──────────────────────────────────────
const FORMATS = [
  {
    n: 1,
    icon: Scissors,
    title: 'Corte Vertical de 15s',
    color: 'from-emerald-500 to-teal-500',
    bg: 'from-emerald-500/10 to-teal-500/10 border-emerald-400/30',
    goal: 'Retenção alta em Stories e Ads curtos',
    time: '~10 min',
    difficulty: 'Fácil',
    when: 'Quando o Reel original tem 1 momento absurdo que já funciona sozinho.',
    diagram: ['📼 Reel de 60s', '✂️ Recorte 0:20-0:33', '📱 Exporta 9:16', '💥 Story pronto'],
    steps: [
      'Assista o Reel completo. Marque o timestamp do pico emocional (a "melhor parte").',
      'Recorte 7-15 segundos ao redor desse pico. Corta antes e depois — vai direto ao ponto.',
      'Exporte em 9:16 (1080x1920). Se o Reel já é vertical, mantém. Se é horizontal, dá zoom no rosto/produto.',
      'Adicione legenda grande (Montserrat Bold 60pt) com a frase mais impactante.',
    ],
    formula: 'HOOK VISUAL (0-2s) + PICO (3-10s) + PUNCHLINE (11-15s)',
  },
  {
    n: 2,
    icon: Layers,
    title: 'Mashup Multi-Vídeos',
    color: 'from-blue-500 to-cyan-500',
    bg: 'from-blue-500/10 to-cyan-500/10 border-blue-400/30',
    goal: 'Compilados semanais e institucional curto',
    time: '~25 min',
    difficulty: 'Médio',
    when: 'Quando o cliente tem 5+ Reels do mesmo tema esperando pra virar 1 vídeo novo.',
    diagram: ['🎞️ Reel A', '🎞️ Reel B', '🎞️ Reel C', '🔀 Mashup 30s', '🚀 Publica'],
    steps: [
      'Escolha um TEMA único (ex.: "bastidores", "produtos", "equipe"). Nunca misture temas.',
      'Selecione 4-8 takes de 2-4s cada, de Reels diferentes. Sempre pegue o "melhor 1 segundo" de cada.',
      'Corte no ritmo da música: batida = corte. Use música de tendência ou trilha épica.',
      'Fecha com CTA visual: logo + "@usuario" ou "swipe up".',
    ],
    formula: 'TEMA único + 4-8 takes curtos + música rítmica + logo final',
  },
  {
    n: 3,
    icon: Music,
    title: 'Gancho em Áudio + Takes (B-Roll)',
    color: 'from-pink-500 to-fuchsia-500',
    bg: 'from-pink-500/10 to-fuchsia-500/10 border-pink-400/30',
    goal: 'Reels virais e Stories rápidos',
    time: '~15 min',
    difficulty: 'Fácil',
    when: 'Quando um áudio em alta combina com o produto/serviço do cliente.',
    diagram: ['🎵 Áudio viral', '➕', '🎬 B-rolls do cliente', '=', '📈 Reel novo'],
    steps: [
      'Ache o áudio no explore ou nos "Reels em alta". Salva antes que suma.',
      'Marque os timestamps de PICOS do áudio (drops, mudanças, punchlines).',
      'Cubra cada pico com um take diferente. Corte no beat, sempre.',
      'Legenda opcional só no topo (2-3 palavras). Deixa o áudio protagonizar.',
    ],
    formula: 'ÁUDIO em alta + 4-6 takes sincronizados + legenda mínima',
  },
  {
    n: 4,
    icon: Wand2,
    title: 'Takes + Música + Gancho + CTA',
    color: 'from-purple-500 to-violet-500',
    bg: 'from-purple-500/10 to-violet-500/10 border-purple-400/30',
    goal: 'Criativos de anúncio (Meta Ads)',
    time: '~30 min',
    difficulty: 'Médio',
    when: 'Sempre que precisar de um criativo que VENDE. Estrutura clássica.',
    diagram: ['🎣 Gancho 3s', '🎬 Entrega 15s', '🎯 CTA 5s', '💰 Venda'],
    steps: [
      'GANCHO (0-3s): pergunta forte, dado chocante, ou promessa. "Você sabia que...", "3 erros que...".',
      'ENTREGA (3-18s): takes mostrando o problema/solução. Música construindo tensão.',
      'CTA (18-23s): fala direto: "Chama no WhatsApp", "Comente EU QUERO", endereço na tela.',
      'Exporte 3 variações: só muda o gancho. Testa qual converte mais.',
    ],
    formula: 'HOOK (3s) → DEMO (15s) → CTA (5s) = CRIATIVO QUE VENDE',
  },
  {
    n: 5,
    icon: Zap,
    title: 'Antes x Depois',
    color: 'from-amber-500 to-orange-500',
    bg: 'from-amber-500/10 to-orange-500/10 border-amber-400/30',
    goal: 'Prova social e Reels de resultado',
    time: '~15 min',
    difficulty: 'Fácil',
    when: 'Sempre que houver transformação visível (obra, cabelo, corpo, ambiente, etc).',
    diagram: ['❌ ANTES', '⚡ Transição', '✅ DEPOIS', '🤯 WOW'],
    steps: [
      'Take do ANTES: 2-3s, legenda grande "ANTES" no canto.',
      'Transição rápida: cortina, glitch, ou zoom-in com whoosh sonoro.',
      'Take do DEPOIS: 4-5s, legenda "DEPOIS" com destaque colorido.',
      'Repete 2x a sequência (loop) pra fixar. Fecha com CTA.',
    ],
    formula: 'ANTES (3s) + TRANSIÇÃO (0.5s) + DEPOIS (5s) → LOOP 2x',
  },
  {
    n: 6,
    icon: MessageSquare,
    title: 'Depoimento Turbinado',
    color: 'from-rose-500 to-red-500',
    bg: 'from-rose-500/10 to-red-500/10 border-rose-400/30',
    goal: 'Prova social em Reels ou Stories',
    time: '~20 min',
    difficulty: 'Médio',
    when: 'Sempre que o cliente gravou depoimento cru e precisa ficar mais atrativo.',
    diagram: ['🎤 Fala do cliente', '➕', '🎬 B-roll cobrindo', '=', '💎 Depoimento pro'],
    steps: [
      'Isole a frase MAIS forte do depoimento (ex.: "mudou minha vida"). Corte o resto.',
      'Cubra 60% do vídeo com b-roll relacionado (produto sendo usado, ambiente, resultado).',
      'Deixe o áudio original tocando por baixo. Adicione legenda palavra-a-palavra (word-by-word).',
      'Feche com o nome do cliente + CTA sutil ("saiba mais no perfil").',
    ],
    formula: 'FRASE forte + 60% b-roll + legenda word-by-word + assinatura',
  },
  {
    n: 7,
    icon: Camera,
    title: 'POV / Bastidores',
    color: 'from-indigo-500 to-blue-500',
    bg: 'from-indigo-500/10 to-blue-500/10 border-indigo-400/30',
    goal: 'Humanização e conexão emocional',
    time: '~20 min',
    difficulty: 'Fácil',
    when: 'Takes soltos que não viraram Reel principal — bastidores, POV do dono, montagem.',
    diagram: ['👀 POV do dono', '📆 Dia de trabalho', '🎬 Sequência', '❤️ Conexão'],
    steps: [
      'Escolha um ângulo narrativo: "Um dia na vida de...", "Por trás de...", "Como fazemos...".',
      'Sequencie 6-10 takes em ORDEM CRONOLÓGICA (manhã → noite, começo → fim).',
      'Trilha calma / lo-fi. Legendas curtas contando o processo.',
      'Fecha mostrando o resultado final ou o cliente satisfeito.',
    ],
    formula: 'ÂNGULO + 6-10 takes cronológicos + trilha calma + resultado final',
  },
  {
    n: 8,
    icon: Sparkles,
    title: 'Recap / Melhores Momentos',
    color: 'from-yellow-500 to-amber-500',
    bg: 'from-yellow-500/10 to-amber-500/10 border-yellow-400/30',
    goal: 'Recap mensal / semanal de conteúdo',
    time: '~25 min',
    difficulty: 'Médio',
    when: 'Final de mês/semana — reaproveita 100% do material já aprovado.',
    diagram: ['📊 Highlights', '📈 Ordenação', '🎵 Música crescente', '🏆 Recap'],
    steps: [
      'Selecione 5-10 highlights do período. Só o TOP.',
      'Ordene por impacto CRESCENTE (do bom pro melhor). Guarda o melhor pro final.',
      'Música que cresce em intensidade acompanhando a ordem.',
      'CTA final: "Quer resultados assim? Fala com a gente."',
    ],
    formula: 'TOP 5-10 + ordem crescente + música crescente + CTA de conversão',
  },
];

const GOLDEN_RULES = [
  { icon: Clock, title: 'Gancho em 3s', desc: 'Se não prendeu nos primeiros 3 segundos, perdeu. Comece pelo pico.' },
  { icon: Volume2, title: 'Áudio importa', desc: '85% assiste sem som — mas os 15% que ouvem convertem mais. Trate os dois.' },
  { icon: Eye, title: 'Legendas grandes', desc: 'Montserrat/Poppins Bold 60pt+. Nunca esconda no rodapé.' },
  { icon: Target, title: 'Um CTA só', desc: 'Nunca peça 2 coisas. "WhatsApp" OU "comentário" OU "salvar". Escolhe 1.' },
  { icon: TrendingUp, title: '9:16 sempre', desc: '1080x1920. Se o original é horizontal, faça zoom no assunto principal.' },
  { icon: CheckCircle2, title: '1 vídeo = várias peças', desc: 'Todo Reel aprovado vira: 1 Story + 1 Criativo + 1 corte. Nunca deixe morrer.' },
];

const SLOT_TYPES = [
  { icon: ImageIcon, name: 'Story', desc: 'Vertical 9:16 curto (7-15s). Sticker, enquete, CTA direto.', color: 'from-pink-500 to-fuchsia-500' },
  { icon: Megaphone, name: 'Criativo', desc: 'Para anúncio pago. Hook forte, CTA claro, 15-30s.', color: 'from-purple-500 to-violet-500' },
  { icon: Film, name: 'Extra', desc: 'Corte adicional, bastidor, mashup ou recap.', color: 'from-blue-500 to-cyan-500' },
];

export default function OptimizationFormatsGuide() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link to="/treinamento" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
            <ArrowLeft size={16} /> Voltar ao treinamento
          </Link>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-500 shadow-lg shadow-fuchsia-500/40">
              <Rocket size={14} className="text-white" />
            </div>
            <span className="text-xs font-black uppercase tracking-widest bg-gradient-to-r from-fuchsia-500 to-violet-500 bg-clip-text text-transparent">
              Otimização de Conteúdo
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 py-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/30">
            <Rocket size={14} className="text-fuchsia-500 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-fuchsia-600 dark:text-fuchsia-400">Guia oficial do editor</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">
            Como transformar <span className="bg-gradient-to-r from-fuchsia-500 via-pink-500 to-violet-500 bg-clip-text text-transparent">1 Reel em 8 conteúdos</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Quando um card vem marcado como <b className="text-fuchsia-600 dark:text-fuchsia-400">Otimização</b>, sua missão é reaproveitar o material aprovado e gerar peças novas: Stories, Criativos e cortes extras. Este guia mostra os 8 formatos comprovados, passo a passo, com infográficos.
          </p>
        </motion.section>

        {/* INFOGRAFICO PRINCIPAL: FLUXO */}
        <motion.section
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          className="rounded-2xl border border-border/50 bg-gradient-to-br from-fuchsia-500/5 via-purple-500/5 to-violet-500/5 p-6 md:p-8"
        >
          <h2 className="text-xl font-black mb-6 flex items-center gap-2">
            <Play size={18} className="text-fuchsia-500" /> O fluxo em 4 passos
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { n: '01', t: 'Receba o card', d: 'Card fúcsia com badge OTIMIZAR chega na sua fila de edição.' },
              { n: '02', t: 'Assista o Reel', d: 'Abra o vídeo original nos materiais. Marque os melhores momentos.' },
              { n: '03', t: 'Escolha 1+ formatos', d: 'Dos 8 formatos abaixo, escolhe o que combina com o material.' },
              { n: '04', t: 'Anexe nos slots', d: 'Cada peça vai em um slot (Story, Criativo ou Extra). Envia pra revisão.' },
            ].map((step, i) => (
              <div key={i} className="relative p-4 rounded-xl bg-card border border-border/50">
                <div className="text-3xl font-black bg-gradient-to-br from-fuchsia-500 to-violet-500 bg-clip-text text-transparent mb-2">{step.n}</div>
                <p className="text-sm font-bold mb-1">{step.t}</p>
                <p className="text-xs text-muted-foreground leading-snug">{step.d}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* SLOTS */}
        <motion.section
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          className="space-y-4"
        >
          <h2 className="text-xl font-black flex items-center gap-2">
            <Layers size={18} className="text-fuchsia-500" /> Os 3 tipos de slot
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SLOT_TYPES.map((slot, i) => {
              const Icon = slot.icon;
              return (
                <div key={i} className="p-5 rounded-xl border border-border/50 bg-card space-y-3">
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${slot.color} shadow-lg`}>
                    <Icon size={22} className="text-white" />
                  </div>
                  <div>
                    <p className="text-base font-black">{slot.name}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">{slot.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-xs">
              <b className="text-amber-700 dark:text-amber-400">📌 Regra dos slots:</b> Basta <b>1 slot preenchido</b> pra enviar. Precisa de mais espaço? Clica em <b>+ Story / + Criativo / + Extra</b> pra adicionar quantos quiser.
            </p>
          </div>
        </motion.section>

        {/* FORMATOS */}
        <section className="space-y-6">
          <h2 className="text-2xl font-black flex items-center gap-2">
            <Sparkles size={20} className="text-fuchsia-500" /> Os 8 formatos comprovados
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FORMATS.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.article
                  key={f.n}
                  initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                  className={`rounded-2xl border bg-gradient-to-br ${f.bg} p-5 space-y-4`}
                >
                  {/* HEADER */}
                  <header className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${f.color} shadow-lg shrink-0`}>
                        <Icon size={18} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Formato #{String(f.n).padStart(2, '0')}</p>
                        <h3 className="text-lg font-black leading-tight">{f.title}</h3>
                      </div>
                    </div>
                  </header>

                  {/* META */}
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                    <span className="px-2 py-0.5 rounded-full bg-background/50 border border-border/50 flex items-center gap-1">
                      <Target size={10} /> {f.goal}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-background/50 border border-border/50 flex items-center gap-1">
                      <Clock size={10} /> {f.time}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-background/50 border border-border/50">
                      {f.difficulty}
                    </span>
                  </div>

                  {/* WHEN */}
                  <div className="p-3 rounded-lg bg-background/40 border border-border/30">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Quando usar</p>
                    <p className="text-xs leading-relaxed">{f.when}</p>
                  </div>

                  {/* DIAGRAMA VISUAL */}
                  <div className="p-3 rounded-lg bg-background/60 border border-border/30">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Fluxo visual</p>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs font-bold">
                      {f.diagram.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <span className="px-2 py-1 rounded-md bg-card border border-border/50 whitespace-nowrap">{step}</span>
                          {idx < f.diagram.length - 1 && <span className="text-muted-foreground">→</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* STEPS */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Passo a passo</p>
                    <ol className="space-y-1.5">
                      {f.steps.map((s, idx) => (
                        <li key={idx} className="flex gap-2 text-xs leading-relaxed">
                          <span className={`shrink-0 w-5 h-5 rounded-full bg-gradient-to-br ${f.color} text-white flex items-center justify-center text-[10px] font-black`}>
                            {idx + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* FORMULA */}
                  <div className={`p-3 rounded-lg bg-gradient-to-r ${f.color} text-white text-center`}>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-80 mb-1">Fórmula</p>
                    <p className="text-xs font-black">{f.formula}</p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>

        {/* GOLDEN RULES */}
        <motion.section
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10 p-6 md:p-8 space-y-6"
        >
          <div className="text-center">
            <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg mb-3">
              <Lightbulb size={24} className="text-white" />
            </div>
            <h2 className="text-2xl font-black">🏆 As 6 regras de ouro</h2>
            <p className="text-sm text-muted-foreground mt-1">Não importa qual formato — essas regras SEMPRE valem.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {GOLDEN_RULES.map((r, i) => {
              const Icon = r.icon;
              return (
                <div key={i} className="p-4 rounded-xl bg-card border border-border/50 space-y-2">
                  <div className="inline-flex p-2 rounded-lg bg-amber-500/20">
                    <Icon size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-sm font-black">{r.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* FOOTER CTA */}
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Dúvida? Chama a coordenação no chat. Bora otimizar! 🚀
          </p>
        </div>
      </main>
    </div>
  );
}

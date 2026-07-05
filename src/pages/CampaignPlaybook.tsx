import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Target, TrendingUp, Megaphone, Sparkles, Users, ShoppingBag,
  Calendar, Zap, Trophy, Flame, Rocket, Eye, Heart, MousePointerClick, DollarSign,
  Film, Image as ImageIcon, PenTool, Clock, ChevronRight, Wand2, PartyPopper, UserPlus,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
//  PLAYBOOK DE CAMPANHAS — INFOGRÁFICO ESTRATÉGICO
//  Foco: VENDAS acima de qualquer objetivo secundário
// ─────────────────────────────────────────────────────────────

const PLANS = [
  { name: 'Starter',  reels: 0,  creatives: 2, stories: 0,  arts: 4, color: 'from-slate-500 to-slate-700',   accent: '#94a3b8' },
  { name: 'Boost',    reels: 4,  creatives: 2, stories: 0,  arts: 0, color: 'from-sky-500 to-blue-700',       accent: '#38bdf8' },
  { name: 'Premium',  reels: 8,  creatives: 3, stories: 20, arts: 4, color: 'from-orange-500 to-red-600',     accent: '#fb923c' },
  { name: 'Elite',    reels: 12, creatives: 4, stories: 40, arts: 4, color: 'from-fuchsia-500 to-purple-700', accent: '#e879f9' },
];

const FUNNEL = [
  { icon: Eye,               label: 'Atenção',    desc: 'Hook forte, dor real, curiosidade',    pct: '40%', color: '#fb923c' },
  { icon: Heart,              label: 'Interesse',  desc: 'Valor, prova social, autoridade',     pct: '30%', color: '#f97316' },
  { icon: MousePointerClick,  label: 'Desejo',     desc: 'Transformação, benefícios claros',    pct: '20%', color: '#ea580c' },
  { icon: DollarSign,         label: 'Ação',       desc: 'CTA direto, oferta, urgência',        pct: '10%', color: '#c2410c' },
];

const CONTENT_TYPES = [
  { icon: Film,       label: 'Reels',      color: '#e879f9', role: 'Alcance + Atenção' },
  { icon: ImageIcon,  label: 'Criativos',  color: '#fb923c', role: 'Conversão paga' },
  { icon: PenTool,    label: 'Artes',      color: '#38bdf8', role: 'Prova social / oferta' },
  { icon: Sparkles,   label: 'Stories',    color: '#a78bfa', role: 'Aquecimento / bastidor' },
];

// Estrutura de campanha por duração
const STRUCTURES = [
  {
    duration: '1 MÊS',
    subtitle: 'Sprint de Vendas',
    icon: Zap,
    color: 'from-orange-500 to-red-600',
    goal: 'Empurrar oferta específica com urgência',
    phases: [
      { week: 'Sem 1', focus: 'Aquecimento',  desc: 'Dor + identificação do público' },
      { week: 'Sem 2', focus: 'Autoridade',   desc: 'Prova social, cases, bastidor' },
      { week: 'Sem 3', focus: 'Oferta',       desc: 'Revelação, benefícios, quebra de objeção' },
      { week: 'Sem 4', focus: 'Fechamento',   desc: 'Urgência, escassez, CTA agressivo' },
    ],
    example: {
      plan: 'Boost',
      breakdown: '4 Reels + 2 Criativos → 1 por semana em cada fase',
    },
  },
  {
    duration: '2 MESES',
    subtitle: 'Construção + Conversão',
    icon: TrendingUp,
    color: 'from-fuchsia-500 to-purple-700',
    goal: 'Educar mercado antes de vender',
    phases: [
      { week: 'Sem 1-2', focus: 'Descoberta',  desc: 'Problema, contexto, cenário do cliente' },
      { week: 'Sem 3-4', focus: 'Educação',    desc: 'Como resolver, método próprio, diferencial' },
      { week: 'Sem 5-6', focus: 'Prova',       desc: 'Resultados, depoimentos, antes/depois' },
      { week: 'Sem 7-8', focus: 'Conversão',   desc: 'Oferta, bônus, urgência, fechamento' },
    ],
    example: {
      plan: 'Premium',
      breakdown: '16 Reels + 6 Criativos + 40 Stories + 8 Artes distribuídos em 4 fases',
    },
  },
  {
    duration: '3 MESES',
    subtitle: 'Lançamento Estratégico',
    icon: Rocket,
    color: 'from-emerald-500 to-teal-700',
    goal: 'Posicionar marca + gerar demanda + vender',
    phases: [
      { week: 'Mês 1', focus: 'Posicionamento', desc: 'Narrativa, identidade, promessa central' },
      { week: 'Mês 2', focus: 'Ativação',       desc: 'Engajamento, comunidade, autoridade' },
      { week: 'Mês 3', focus: 'Explosão',       desc: 'Lançamento, oferta principal, escassez' },
    ],
    example: {
      plan: 'Elite',
      breakdown: '36 Reels + 12 Criativos + 120 Stories + 12 Artes = presença total 3x/semana',
    },
  },
];

const CAMPAIGN_TYPES = [
  { icon: Trophy,     label: 'Institucional',       desc: 'Marca, propósito, valores',              color: '#fb923c' },
  { icon: Flame,      label: 'Promocional',         desc: 'Oferta, desconto, condição especial',    color: '#ef4444' },
  { icon: Calendar,   label: 'Sazonal',             desc: 'Datas comemorativas, gatilho de época',  color: '#a78bfa' },
  { icon: Rocket,     label: 'Lançamento',          desc: 'Produto/serviço novo',                    color: '#38bdf8' },
  { icon: Heart,      label: 'Resp. Social',        desc: 'Causas, comunidade, ESG',                color: '#10b981' },
];

export default function CampaignPlaybook() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white -m-6">
      {/* HERO */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/20 via-red-900/10 to-transparent" />
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-red-500/10 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-12 py-10">
          <button
            onClick={() => navigate('/treinamento')}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm mb-8 transition-colors"
          >
            <ArrowLeft size={16} /> Voltar ao Treinamento
          </button>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 mb-6">
              <Megaphone size={12} className="text-orange-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">Playbook Interno</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-[0.95] mb-4">
              Como a <span className="text-orange-500">Pulse</span><br />constrói campanhas
            </h1>
            <p className="text-base md:text-lg text-white/60 leading-relaxed">
              Toda campanha, independente do tipo, tem um único objetivo real:
              <span className="text-white font-semibold"> gerar vendas</span>.
              Marca, engajamento e alcance são consequência — não o fim.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-24">

        {/* ─── FILOSOFIA: FUNIL DE VENDAS ─── */}
        <section>
          <SectionTitle number="01" title="A regra que rege tudo" subtitle="Funil de conversão aplicado a cada campanha" />

          <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-4">
            {FUNNEL.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative group"
              >
                <div className="relative p-6 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-orange-500/30 transition-all h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${step.color}20` }}>
                      <step.icon size={20} style={{ color: step.color }} />
                    </div>
                    <span className="text-2xl font-black italic" style={{ color: step.color }}>{step.pct}</span>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Etapa {i + 1}</div>
                  <h3 className="text-lg font-bold mb-2">{step.label}</h3>
                  <p className="text-xs text-white/50 leading-relaxed">{step.desc}</p>
                </div>
                {i < FUNNEL.length - 1 && (
                  <ChevronRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-white/20" size={20} />
                )}
              </motion.div>
            ))}
          </div>
        </section>

        {/* ─── TIPOS DE CAMPANHA ─── */}
        <section>
          <SectionTitle number="02" title="Cinco tipos de campanha" subtitle="Cada uma com uma alavanca comercial diferente" />

          <div className="mt-10 grid grid-cols-2 md:grid-cols-5 gap-3">
            {CAMPAIGN_TYPES.map((t, i) => (
              <motion.div
                key={t.label}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${t.color}20` }}>
                  <t.icon size={18} style={{ color: t.color }} />
                </div>
                <h3 className="text-sm font-bold mb-1">{t.label}</h3>
                <p className="text-[11px] text-white/40 leading-snug">{t.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ─── PACOTES COMO MATÉRIA-PRIMA ─── */}
        <section>
          <SectionTitle number="03" title="Seu arsenal por pacote" subtitle="A quantidade de conteúdo contratada define o formato da campanha" />

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative rounded-2xl overflow-hidden border border-white/5 group hover:border-white/20 transition-all"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${plan.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
                <div className="relative p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-black italic uppercase tracking-tight">{plan.name}</h3>
                    <div className="w-2 h-2 rounded-full" style={{ background: plan.accent, boxShadow: `0 0 12px ${plan.accent}` }} />
                  </div>

                  <div className="space-y-2.5">
                    <ArsenalRow icon={Film}      label="Reels"      value={plan.reels}      color={plan.accent} />
                    <ArsenalRow icon={ImageIcon} label="Criativos"  value={plan.creatives}  color={plan.accent} />
                    <ArsenalRow icon={PenTool}   label="Artes"      value={plan.arts}       color={plan.accent} />
                    <ArsenalRow icon={Sparkles}  label="Stories"    value={plan.stories}    color={plan.accent} />
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/5">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Total mensal</div>
                    <div className="text-2xl font-black" style={{ color: plan.accent }}>
                      {plan.reels + plan.creatives + plan.arts + plan.stories}
                      <span className="text-xs text-white/40 font-normal ml-1">peças</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Papel de cada formato */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
            {CONTENT_TYPES.map((c) => (
              <div key={c.label} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${c.color}20` }}>
                  <c.icon size={14} style={{ color: c.color }} />
                </div>
                <div>
                  <div className="text-xs font-bold">{c.label}</div>
                  <div className="text-[10px] text-white/40">{c.role}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── ESTRUTURAS POR DURAÇÃO ─── */}
        <section>
          <SectionTitle number="04" title="Três estruturas de campanha" subtitle="Escolha pela duração e objetivo comercial" />

          <div className="mt-10 space-y-6">
            {STRUCTURES.map((s, i) => (
              <motion.div
                key={s.duration}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative rounded-3xl overflow-hidden border border-white/5"
              >
                <div className={`absolute inset-0 bg-gradient-to-r ${s.color} opacity-[0.07]`} />
                <div className="relative p-6 md:p-8">
                  <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 md:gap-10">
                    {/* Cabeçalho */}
                    <div>
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-4`}>
                        <s.icon size={26} className="text-white" />
                      </div>
                      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">Duração</div>
                      <h3 className="text-3xl font-black italic uppercase tracking-tighter mb-1">{s.duration}</h3>
                      <p className="text-sm text-white/60 mb-4">{s.subtitle}</p>
                      <div className="flex items-start gap-2 text-xs text-white/50">
                        <Target size={12} className="mt-0.5 flex-shrink-0 text-orange-400" />
                        <span>{s.goal}</span>
                      </div>
                    </div>

                    {/* Fases */}
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-4">Fases da campanha</div>
                      <div className="relative">
                        {/* linha horizontal conectora */}
                        <div className="hidden md:block absolute top-4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        <div className={`grid grid-cols-1 sm:grid-cols-2 ${s.phases.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-3`}>
                          {s.phases.map((p, idx) => (
                            <div key={p.week} className="relative">
                              <div className="hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-[#0a0a0a] border border-white/20 text-[10px] font-black text-white/60 mx-auto mb-3 relative z-10">
                                {idx + 1}
                              </div>
                              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: s.phases.length === 3 ? '#10b981' : '#fb923c' }}>
                                  {p.week}
                                </div>
                                <div className="text-sm font-bold mt-0.5 mb-1.5">{p.focus}</div>
                                <div className="text-[11px] text-white/50 leading-snug">{p.desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Exemplo prático */}
                      <div className="mt-6 p-4 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Sparkles size={12} className="text-orange-400" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">Exemplo real</span>
                          <span className="text-[10px] text-white/40">→ pacote {s.example.plan}</span>
                        </div>
                        <p className="text-xs text-white/70">{s.example.breakdown}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ─── GERADOR AUTOMÁTICO ─── */}
        <section>
          <SectionTitle number="05" title="Gerador de campanha" subtitle="Escolha pacote e duração e receba a estrutura pronta" />
          <CampaignGenerator />
        </section>

        {/* ─── REGRAS DE OURO ─── */}
        <section>
          <SectionTitle number="06" title="Regras de ouro" subtitle="Inegociáveis em toda campanha Pulse" />

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Target,   title: 'Venda antes de tudo', desc: 'Cada peça, mesmo institucional, empurra o público 1 passo mais perto da compra.' },
              { icon: Clock,    title: 'Gravar 7 dias antes', desc: 'Toda peça é gravada, no máximo, 1 semana antes da postagem. Sem exceção.' },
              { icon: Users,    title: 'Persona no comando',  desc: 'Roteiro, tom, oferta e gatilho ajustados à dor real do público do cliente.' },
              { icon: Trophy,   title: 'Prova social sempre', desc: 'No mínimo 1 peça por campanha com case, depoimento ou resultado real.' },
              { icon: ShoppingBag, title: 'CTA claro',         desc: 'Toda campanha termina com ação: WhatsApp, link, cupom, agendamento.' },
              { icon: TrendingUp, title: 'Medir e ajustar',   desc: 'Análise semanal de performance para corrigir rota antes do fim da campanha.' },
            ].map((r, i) => (
              <motion.div
                key={r.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="p-5 rounded-2xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/5 hover:border-orange-500/20 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center mb-3">
                  <r.icon size={18} className="text-orange-400" />
                </div>
                <h3 className="text-sm font-bold mb-1.5">{r.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed">{r.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section>
          <div className="relative overflow-hidden rounded-3xl p-8 md:p-12 border border-orange-500/20 bg-gradient-to-br from-orange-600/10 via-red-600/5 to-transparent text-center">
            <Megaphone size={40} className="mx-auto text-orange-400 mb-4" />
            <h2 className="text-2xl md:text-4xl font-black italic uppercase tracking-tighter mb-3">
              Pronto pra montar?
            </h2>
            <p className="text-white/60 mb-6 max-w-xl mx-auto text-sm md:text-base">
              Vá até o módulo de Campanhas e crie a próxima campanha do seu cliente já usando essa estrutura.
            </p>
            <button
              onClick={() => navigate('/campanhas')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all hover:scale-[1.02]"
            >
              Ir para Campanhas <ChevronRight size={16} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Helpers ──
function SectionTitle({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-end justify-between gap-6 border-b border-white/5 pb-4">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500 mb-2">{number}</div>
        <h2 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">{title}</h2>
      </div>
      <p className="hidden md:block text-xs text-white/40 max-w-xs text-right">{subtitle}</p>
    </div>
  );
}

function ArsenalRow({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-white/60">
        <Icon size={13} style={{ color }} />
        <span className="text-xs">{label}</span>
      </div>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}

// ── Gerador de Campanha ──
type PhaseAllocation = {
  name: string;
  weight: number;      // peso relativo (soma = 1)
  focus: string;
  goal: string;
  color: string;
};

const PHASE_TEMPLATES: Record<1 | 2 | 3, PhaseAllocation[]> = {
  1: [
    { name: 'Semana 1 · Aquecimento', weight: 0.20, focus: 'Dor + identificação', goal: 'Fazer o público se reconhecer no problema', color: '#fb923c' },
    { name: 'Semana 2 · Autoridade',  weight: 0.25, focus: 'Prova social + método', goal: 'Mostrar que sabemos entregar o resultado', color: '#f97316' },
    { name: 'Semana 3 · Oferta',      weight: 0.30, focus: 'Revelação + benefícios', goal: 'Apresentar a solução comercial', color: '#ea580c' },
    { name: 'Semana 4 · Fechamento',  weight: 0.25, focus: 'Urgência + escassez', goal: 'Converter com CTA agressivo', color: '#c2410c' },
  ],
  2: [
    { name: 'Fase 1 · Descoberta (Sem 1-2)', weight: 0.20, focus: 'Cenário e problema', goal: 'Educar o público sobre o contexto', color: '#a78bfa' },
    { name: 'Fase 2 · Educação (Sem 3-4)',   weight: 0.25, focus: 'Método + diferencial', goal: 'Posicionar como autoridade', color: '#8b5cf6' },
    { name: 'Fase 3 · Prova (Sem 5-6)',      weight: 0.25, focus: 'Cases + depoimentos', goal: 'Quebrar objeções com resultados reais', color: '#7c3aed' },
    { name: 'Fase 4 · Conversão (Sem 7-8)',  weight: 0.30, focus: 'Oferta + bônus + urgência', goal: 'Fechar vendas', color: '#6d28d9' },
  ],
  3: [
    { name: 'Mês 1 · Posicionamento', weight: 0.28, focus: 'Narrativa + promessa central', goal: 'Construir percepção de marca', color: '#10b981' },
    { name: 'Mês 2 · Ativação',       weight: 0.32, focus: 'Engajamento + comunidade', goal: 'Gerar demanda e autoridade', color: '#059669' },
    { name: 'Mês 3 · Explosão',       weight: 0.40, focus: 'Lançamento + oferta principal', goal: 'Colher vendas com máxima intensidade', color: '#047857' },
  ],
};

function distributeAmount(total: number, weights: number[]): number[] {
  if (total <= 0) return weights.map(() => 0);
  const raw = weights.map(w => total * w);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  // distribui sobra para as fases com maior parte fracionária
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[order[k % order.length].i]++;
  return result;
}

function CampaignGenerator() {
  const [planName, setPlanName] = useState<string>('Premium');
  const [months, setMonths] = useState<1 | 2 | 3>(2);

  const plan = PLANS.find(p => p.name === planName)!;

  const result = useMemo(() => {
    const phases = PHASE_TEMPLATES[months];
    const weights = phases.map(p => p.weight);

    // Multiplica pelo número de meses (Boost/Premium/Elite recebem conteúdos mensais)
    const totalReels     = plan.reels * months;
    const totalCreatives = plan.creatives * months;
    const totalArts      = plan.arts * months;
    const totalStories   = plan.stories * months;

    return {
      totals: { reels: totalReels, creatives: totalCreatives, arts: totalArts, stories: totalStories },
      perPhase: phases.map((ph, idx) => ({
        ...ph,
        reels: distributeAmount(totalReels, weights)[idx],
        creatives: distributeAmount(totalCreatives, weights)[idx],
        arts: distributeAmount(totalArts, weights)[idx],
        stories: distributeAmount(totalStories, weights)[idx],
      })),
    };
  }, [plan, months]);

  const totalPieces = result.totals.reels + result.totals.creatives + result.totals.arts + result.totals.stories;

  return (
    <div className="mt-10 space-y-6">
      {/* Form */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <div className="flex items-center gap-2 mb-6">
          <Wand2 size={16} className="text-orange-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">Configuração</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pacote */}
          <div>
            <label className="text-xs font-bold text-white/70 uppercase tracking-wider mb-3 block">Pacote do cliente</label>
            <div className="grid grid-cols-2 gap-2">
              {PLANS.map(p => (
                <button
                  key={p.name}
                  onClick={() => setPlanName(p.name)}
                  className={`relative p-3 rounded-xl border transition-all text-left ${
                    planName === p.name
                      ? 'border-orange-500/60 bg-orange-500/10'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-black italic uppercase">{p.name}</span>
                    <div className="w-2 h-2 rounded-full" style={{ background: p.accent }} />
                  </div>
                  <div className="text-[10px] text-white/40">
                    {p.reels}R · {p.creatives}C · {p.arts}A · {p.stories}S <span className="opacity-60">/mês</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Duração */}
          <div>
            <label className="text-xs font-bold text-white/70 uppercase tracking-wider mb-3 block">Duração da campanha</label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(m => (
                <button
                  key={m}
                  onClick={() => setMonths(m as 1 | 2 | 3)}
                  className={`p-4 rounded-xl border transition-all ${
                    months === m
                      ? 'border-orange-500/60 bg-orange-500/10 text-white'
                      : 'border-white/5 bg-white/[0.02] text-white/60 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <div className="text-2xl font-black italic">{m}</div>
                  <div className="text-[10px] uppercase tracking-widest">{m === 1 ? 'mês' : 'meses'}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Resultado */}
      <motion.div
        key={`${planName}-${months}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.06] via-transparent to-transparent p-6 md:p-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6 pb-6 border-b border-white/5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400 mb-1">Estrutura gerada</div>
            <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">
              {plan.name} <span className="text-white/40">·</span> {months} {months === 1 ? 'mês' : 'meses'}
            </h3>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Total de peças</div>
            <div className="text-3xl font-black text-orange-400">{totalPieces}</div>
          </div>
        </div>

        {/* Totais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <TotalCard icon={Film}      label="Reels"     value={result.totals.reels}     color="#e879f9" />
          <TotalCard icon={ImageIcon} label="Criativos" value={result.totals.creatives} color="#fb923c" />
          <TotalCard icon={PenTool}   label="Artes"     value={result.totals.arts}      color="#38bdf8" />
          <TotalCard icon={Sparkles}  label="Stories"   value={result.totals.stories}   color="#a78bfa" />
        </div>

        {/* Fases */}
        <div className="space-y-3">
          {result.perPhase.map((ph, i) => {
            const phaseTotal = ph.reels + ph.creatives + ph.arts + ph.stories;
            return (
              <motion.div
                key={ph.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="p-4 rounded-xl bg-black/30 border border-white/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: ph.color }} />
                      <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: ph.color }}>{ph.name}</div>
                    </div>
                    <div className="text-sm font-bold text-white">{ph.focus}</div>
                    <div className="text-[11px] text-white/50 mt-0.5">{ph.goal}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-white/40">Peças</div>
                    <div className="text-xl font-black text-white">{phaseTotal}</div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/5">
                  <PhaseCell icon={Film}      label="Reels"     value={ph.reels}     color="#e879f9" />
                  <PhaseCell icon={ImageIcon} label="Criativos" value={ph.creatives} color="#fb923c" />
                  <PhaseCell icon={PenTool}   label="Artes"     value={ph.arts}      color="#38bdf8" />
                  <PhaseCell icon={Sparkles}  label="Stories"   value={ph.stories}   color="#a78bfa" />
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-xs text-white/70 leading-relaxed">
          <strong className="text-orange-300">Dica de execução:</strong> respeite a distribuição por fase — a última
          concentra mais peças de conversão porque é onde o público está pronto pra comprar. Grave sempre 7 dias antes da postagem.
        </div>
      </motion.div>
    </div>
  );
}

function TotalCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color }} />
        <span className="text-[10px] uppercase tracking-widest text-white/40">{label}</span>
      </div>
      <div className="text-2xl font-black" style={{ color }}>{value}</div>
    </div>
  );
}

function PhaseCell({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const dim = value === 0;
  return (
    <div className={`flex items-center gap-2 ${dim ? 'opacity-30' : ''}`}>
      <Icon size={11} style={{ color }} />
      <span className="text-[10px] text-white/50">{label}</span>
      <span className="ml-auto text-sm font-bold text-white">{value}</span>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Crown, Briefcase, ClipboardList, PenTool, Palette, Video, Scissors,
  Camera, Share2, Heart, DollarSign, Megaphone, HelpCircle, ArrowRight, Users,
  Target, Code, TrendingUp, Handshake, BarChart3, Sparkles, Phone, Calendar,
  MapPin, Rocket,

} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';


// ─────────────────────────────────────────────────────────────
//  ORGANOGRAMA / INFOGRÁFICO DE RESPONSABILIDADES
//  Quem faz o quê e a quem procurar em cada situação
// ─────────────────────────────────────────────────────────────

const FOUNDERS = [
  {
    name: 'Thiago',
    role: 'Sócio-Fundador · Gestor Pulse Uruaçu',
    color: 'from-orange-500 to-red-600',
    accent: '#fb923c',
    hats: [
      { icon: MapPin, label: 'Gestor Responsável — Pulse Uruaçu' },
      { icon: Target, label: 'Gestor de Tráfego' },
      { icon: TrendingUp, label: 'Estrategista de Marketing' },
      { icon: Handshake, label: 'Estrategista Comercial' },
      { icon: Rocket, label: 'Closer (fechamento de vendas)' },
      { icon: Palette, label: 'Web Designer' },
      { icon: Code, label: 'Programador' },
    ],
  },
  {
    name: 'Victor Gabriel',
    role: 'Sócio-Fundador · Gestor Pulse Minaçu',
    color: 'from-emerald-500 to-teal-700',
    accent: '#34d399',
    hats: [
      { icon: MapPin, label: 'Gestor Responsável — Pulse Minaçu' },
      { icon: DollarSign, label: 'Gestor Financeiro' },
      { icon: Rocket, label: 'Closer (fechamento de vendas)' },
      { icon: Handshake, label: 'Comercial' },
      { icon: BarChart3, label: 'Analista de Marketing' },
      { icon: Users, label: 'Gestão de Pessoas e Operação Minaçu' },
    ],
  },
];


const PROJECT_MANAGER = {
  title: 'Gestor de Projetos',
  color: 'from-blue-500 to-indigo-700',
  accent: '#60a5fa',
  desc:
    'O escudo dos sócios que trabalha na ANTECIPAÇÃO: identifica riscos e resolve problemas ANTES que virem crise, deixando Thiago e Victor 100% focados em girar o ponteiro da empresa (estratégia, tráfego, comercial e crescimento).',
  duties: [
    'ANTECIPA problemas — mapeia riscos e resolve antes que virem crise',
    'Distribui roteiros, briefings e tarefas para toda a equipe',
    'Cobra prazos e destrava qualquer tarefa parada',
    'Agenda gravações, ligações e reuniões com clientes',
    'Participa (junto com o Social Media) de reuniões pontuais com clientes quando necessário',
    'Filtra o que precisa (ou não) chegar aos sócios',
    'Mantém a máquina rodando sem depender dos fundadores',

  ],
};


const TEAM_ROLES = [
  {
    icon: PenTool, name: 'Copywriter', color: '#a78bfa', roleKeys: ['copywriter'],
    responsibilities: [
      'Escrever roteiros de reels, vídeos institucionais e campanhas',
      'Criar copies persuasivas para artes, criativos e stories',
      'Definir tom de voz e narrativa de cada cliente',
      'Entregar roteiros dentro do prazo cadastrado pelo Gestor de Projetos',
      'Alimentar o módulo Roteiros com todo material aprovado',
    ],
    reportsTo: 'Gestor de Projetos',
  },
  {
    icon: Video, name: 'Videomaker', color: '#fb923c', roleKeys: ['videomaker'],
    responsibilities: [
      'Gravar TODOS os vídeos agendados seguindo o roteiro do Copy',
      'Chegar 10 min antes no local da gravação, com equipamento carregado',
      'Enviar brutos organizados por cliente para o Editor no mesmo dia',
      'Registrar tempo de espera e imprevistos no Controle de Gravações',
      'Capturar stories, bastidores e conteúdo extra sempre que possível',
    ],
    reportsTo: 'Gestor de Projetos',
  },
  {
    icon: Scissors, name: 'Editor', color: '#f472b6', roleKeys: ['editor'],
    responsibilities: [
      'Editar reels, VSLs e vídeos institucionais respeitando o SLA',
      'Aplicar identidade visual e template de cada cliente',
      'Rever com o Copy antes de enviar para aprovação do cliente',
      'Manter o Kanban de edição atualizado (edição → revisão → envio)',
      'Alterar rapidamente quando o cliente pedir ajuste',
    ],
    reportsTo: 'Gestor de Projetos',
  },
  {
    icon: Palette, name: 'Designer', color: '#38bdf8', roleKeys: ['designer'],
    responsibilities: [
      'Produzir artes de feed, stories, criativos de tráfego e mídia física',
      'Seguir briefing e identidade visual enviados pelo Gestor de Projetos',
      'Entregar cada card do Kanban dentro do prazo definido',
      'Registrar tempo trabalhado e versões no card',
      'Alimentar o banco de artes do cliente após aprovação',
    ],
    reportsTo: 'Gestor de Projetos',
  },
  {
    icon: Camera, name: 'Fotógrafo', color: '#facc15', roleKeys: ['fotografo'],
    responsibilities: [
      'Realizar sessões fotográficas dos clientes agendadas na agenda',
      'Tratar e entregar banco de imagens em até 48h após a sessão',
      'Organizar acervo por cliente na pasta oficial',
      'Apoiar campanhas com fotos autorais quando solicitado',
    ],
    reportsTo: 'Gestor de Projetos',
  },
  {
    icon: Heart, name: 'Endomarketing', color: '#f43f5e', roleKeys: ['endomarketing', 'parceiro'],
    responsibilities: [
      'Planejar e executar ações internas (aniversários, celebrações, cultura)',
      'Ativar parceiros e cuidar dos agendamentos endo',
      'Apresentar QUALQUER evento interno previamente para aprovação financeira (Victor Gabriel) antes de contratar',
      'Divulgar comunicados internos e mural de recados',
      'Fortalecer o clima e o senso de equipe da Pulse',
    ],
    reportsTo: 'Gestor de Projetos',
  },
];

const SOCIAL_MEDIA_HUB = {
  title: 'Social Media',
  color: 'from-cyan-500 to-sky-700',
  accent: '#22d3ee',
  roleKeys: ['social_media'],
  desc:
    'A ponte de transparência entre a agência e o cliente. Cuida do relacionamento nos grupos de WhatsApp, envia vídeos para aprovação, revisa qualidade e garante que nada saia fora do padrão Pulse.',
  duties: [
    'Ponte de transparência entre agência e cliente nos grupos de WhatsApp',
    'Envia vídeos e artes para aprovação e conduz o relacionamento diário',
    'REVISA cada vídeo antes de enviar: legendas, cortes, áudio e identidade visual',
    'Solicita alterações ao Editor/Designer sempre que algo fugir do padrão de qualidade',
    'Publica TODO conteúdo aprovado no horário certo e mantém o calendário editorial',
    'Monitora comentários/DMs e repassa ao cliente (NÃO responde em nome do cliente)',
    'Participa (com o Gestor de Projetos) de reuniões pontuais com clientes',
    'Auxilia o Copywriter com ideias de pauta, ganchos e insights vindos do dia a dia com o cliente',
    'Monitora métricas semanais e registra cada entrega no módulo Entregas Social',

  ],
};




// Cenários "Quem eu procuro quando…"
const SCENARIOS = [
  {
    icon: Video, color: '#fb923c',
    situation: 'Videomaker sem roteiro para gravar',
    who: 'Gestor de Projetos',
    action: 'É ele quem distribui os roteiros. Chame no chat ou WhatsApp imediatamente.',
  },
  {
    icon: Scissors, color: '#f472b6',
    situation: 'Editor sem material bruto para editar',
    who: 'Gestor de Projetos',
    action: 'Ele localiza o videomaker e destrava a entrega do bruto.',
  },
  {
    icon: Palette, color: '#38bdf8',
    situation: 'Designer sem briefing / pauta',
    who: 'Gestor de Projetos → Copywriter',
    action: 'Gestor solicita o briefing ao copy e repassa ao designer.',
  },
  {
    icon: PenTool, color: '#a78bfa',
    situation: 'Copywriter sem direção estratégica',
    who: 'Thiago',
    action: 'Estrategista de Marketing e Comercial define o rumo.',
  },
  {
    icon: Calendar, color: '#60a5fa',
    situation: 'Cliente pedindo remarcar gravação',
    who: 'Gestor de Projetos',
    action: 'Ele reorganiza agenda e comunica todos os envolvidos.',
  },
  {
    icon: Target, color: '#fb7185',
    situation: 'Dúvida sobre campanha de tráfego pago',
    who: 'Thiago',
    action: 'Gestor de Tráfego e responsável por criativos e verba.',
  },
  {
    icon: DollarSign, color: '#34d399',
    situation: 'Dúvidas financeiras, pagamentos, notas',
    who: 'Victor Gabriel',
    action: 'Gestor Financeiro da empresa.',
  },
  {
    icon: Handshake, color: '#facc15',
    situation: 'Novo lead / proposta comercial',
    who: 'Thiago ou Victor Gabriel',
    action: 'Ambos atuam no comercial; Thiago fecha a estratégia, Victor operacionaliza.',
  },
  {
    icon: Code, color: '#22d3ee',
    situation: 'Problema no site ou sistema Pulse',
    who: 'Thiago',
    action: 'Programador e web designer da empresa.',
  },
  {
    icon: Heart, color: '#f43f5e',
    situation: 'Ação de endomarketing / evento interno',
    who: 'Naraely → aprovação de Victor Gabriel',
    action: 'Naraely planeja e apresenta previamente para aprovação financeira ANTES de contratar ou executar.',
  },
];

const GOLDEN_RULES = [
  { icon: Sparkles, text: 'Antecipação > correção: Gestor de Projetos age ANTES do problema virar crise.' },
  { icon: Users, text: 'Reuniões pontuais com clientes: Gestor de Projetos + Social Media presentes quando necessário.' },

  { icon: Phone, text: 'Problema operacional? Vai para o Gestor de Projetos — não escale direto aos sócios.' },
  { icon: Crown, text: 'Sócios focam em girar o ponteiro: estratégia, tráfego, comercial e crescimento.' },
  { icon: Calendar, text: 'Toda gravação, entrega e reunião passa pela agenda do Gestor de Projetos.' },
  { icon: DollarSign, text: 'Eventos internos e ações de endomarketing só acontecem APÓS aprovação financeira do Victor Gabriel.' },
  { icon: Users, text: 'Fluxo padrão: Copy escreve → Gestor distribui → Equipe executa → Social publica.' },
  { icon: Sparkles, text: 'Dúvida de "com quem falar?" — sempre comece pelo Gestor de Projetos.' },
];



type ProfileLite = { id: string; name: string | null; role: string | null; avatar_url?: string | null };

export default function TeamOrgChart() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, role, avatar_url')
        .order('name');
      setProfiles((data as ProfileLite[]) || []);
    })();
  }, []);

  const peopleByRole = (keys: string[]) =>
    profiles.filter(p => p.role && keys.includes(p.role));


  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#0f0f14] to-[#0a0a0a] text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-black/60 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/treinamento')}
            className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} /> Voltar ao Treinamento
          </button>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400">Pulse Academy</p>
            <h1 className="text-sm sm:text-base font-black italic uppercase tracking-tight">Organograma da Equipe</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-16 space-y-16">
        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30">
            <Users size={14} className="text-orange-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-300">Infográfico Oficial</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black italic uppercase tracking-tighter leading-[0.95]">
            Quem faz <span className="text-orange-500">o quê</span><br />na Pulse?
          </h2>
          <p className="text-sm sm:text-base text-white/60 max-w-2xl mx-auto">
            Descubra rapidamente <b className="text-white">com quem falar</b> em cada situação para nenhum
            profissional ficar parado e nenhuma entrega atrasar.
          </p>
        </motion.div>

        {/* FUNDADORES */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Crown className="text-yellow-400" size={22} />
            <h3 className="text-xl sm:text-2xl font-black italic uppercase tracking-tight">Fundadores & Direção</h3>
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-300/80 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-3 py-1">
              Giram o ponteiro da empresa
            </span>
          </div>
          <p className="text-sm text-white/60 -mt-2 max-w-3xl">
            Sócios não apagam incêndio operacional — isso é papel do Gestor de Projetos. Eles focam em
            <b className="text-white"> estratégia, tráfego, comercial e crescimento</b>, funções que multiplicam receita e escalam a Pulse.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {FOUNDERS.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-6"
              >
                <div className={`absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br ${f.color} opacity-20 blur-2xl`} />
                <div className="relative">
                  <div className="flex items-center gap-4 mb-5">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center shadow-lg`}>
                      <Crown className="text-white" size={28} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: f.accent }}>{f.role}</p>
                      <h4 className="text-2xl font-black italic uppercase tracking-tight">{f.name}</h4>
                    </div>
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">Chapéus que usa</p>
                  <div className="grid grid-cols-1 gap-2">
                    {f.hats.map((h) => (
                      <div key={h.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/5">
                        <h.icon size={16} style={{ color: f.accent }} />
                        <span className="text-sm font-medium text-white/90">{h.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* GESTOR DE PROJETOS - HUB CENTRAL */}
        <section>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl border-2 border-blue-500/40 bg-gradient-to-br from-blue-950/40 via-indigo-950/30 to-transparent p-8 sm:p-10"
          >
            <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl animate-pulse" />
            <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl animate-pulse" />
            <div className="relative grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 items-start">
              <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br ${PROJECT_MANAGER.color} flex items-center justify-center shadow-2xl shadow-blue-500/30 shrink-0`}>
                <ClipboardList className="text-white" size={44} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-300 mb-1">Hub Central da Operação</p>
                <h3 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter mb-3">{PROJECT_MANAGER.title}</h3>
                <p className="text-sm sm:text-base text-white/70 mb-5">{PROJECT_MANAGER.desc}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {PROJECT_MANAGER.duties.map((d) => (
                    <div key={d} className="flex items-start gap-2 text-sm text-white/80">
                      <ArrowRight size={14} className="text-blue-400 mt-1 shrink-0" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* SOCIAL MEDIA - HUB DE RELACIONAMENTO */}
        <section>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl border-2 border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-sky-950/30 to-transparent p-8 sm:p-10"
          >
            <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-cyan-500/20 blur-3xl animate-pulse" />
            <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-sky-500/20 blur-3xl animate-pulse" />
            <div className="relative grid md:grid-cols-[auto_1fr] gap-6 sm:gap-8 items-start">
              <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br ${SOCIAL_MEDIA_HUB.color} flex items-center justify-center shadow-2xl shadow-cyan-500/30 shrink-0`}>
                <Share2 className="text-white" size={44} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300 mb-1">Hub de Relacionamento com o Cliente</p>
                <h3 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tighter mb-3">{SOCIAL_MEDIA_HUB.title}</h3>
                <p className="text-sm sm:text-base text-white/70 mb-4">{SOCIAL_MEDIA_HUB.desc}</p>

                {(() => {
                  const members = peopleByRole(SOCIAL_MEDIA_HUB.roleKeys);
                  if (members.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {members.map(m => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold bg-cyan-500/15 text-cyan-200 border border-cyan-500/40"
                        >
                          👤 {m.name || 'Sem nome'}
                        </span>
                      ))}
                    </div>
                  );
                })()}

                <div className="grid sm:grid-cols-2 gap-2">
                  {SOCIAL_MEDIA_HUB.duties.map((d) => (
                    <div key={d} className="flex items-start gap-2 text-sm text-white/80">
                      <ArrowRight size={14} className="text-cyan-400 mt-1 shrink-0" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-white/40">
                  Reporta a: <span className="text-cyan-300">Gestor de Projetos</span>
                </p>
              </div>
            </div>
          </motion.div>
        </section>


        {/* CONECTOR VISUAL */}
        <div className="flex flex-col items-center -my-2">
          <div className="w-0.5 h-8 bg-gradient-to-b from-blue-500/60 to-orange-500/40" />
          <div className="rounded-full border border-blue-500/40 bg-blue-950/40 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-blue-300 backdrop-blur">
            ↓ Todos reportam ao Gestor de Projetos ↓
          </div>
          <div className="w-0.5 h-8 bg-gradient-to-b from-blue-500/40 to-transparent" />
        </div>

        {/* EQUIPE */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <Briefcase className="text-orange-400" size={22} />
            <h3 className="text-xl sm:text-2xl font-black italic uppercase tracking-tight">Time de Execução</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              → reporta ao Gestor de Projetos
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEAM_ROLES.map((r, i) => (
              <motion.div
                key={r.name}
                initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: `${r.color}22`, border: `1px solid ${r.color}44` }}
                  >
                    <r.icon size={20} style={{ color: r.color }} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-black italic uppercase tracking-tight">{r.name}</h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                      Reporta a: <span style={{ color: r.color }}>{r.reportsTo}</span>
                    </p>
                  </div>
                </div>

                {/* Colaboradores atribuídos a esta função (dinâmico) */}
                {(() => {
                  const members = peopleByRole(r.roleKeys);
                  if (members.length === 0) {
                    return (
                      <p className="text-[11px] italic text-white/40 mb-3">
                        Nenhum colaborador cadastrado nesta função ainda.
                      </p>
                    );
                  }
                  return (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {members.map(m => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ background: `${r.color}1f`, color: r.color, border: `1px solid ${r.color}55` }}
                        >
                          👤 {m.name || 'Sem nome'}
                        </span>
                      ))}
                    </div>
                  );
                })()}

                <ul className="space-y-1.5">
                  {r.responsibilities.map((rs) => (
                    <li key={rs} className="text-xs text-white/70 flex gap-2">
                      <span style={{ color: r.color }}>•</span>{rs}
                    </li>
                  ))}
                </ul>

              </motion.div>
            ))}
          </div>
        </section>

        {/* CENÁRIOS - COM QUEM FALAR */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <HelpCircle className="text-fuchsia-400" size={22} />
            <h3 className="text-xl sm:text-2xl font-black italic uppercase tracking-tight">
              Com quem falar quando…
            </h3>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {SCENARIOS.map((s, i) => (
              <motion.div
                key={s.situation}
                initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-white/20 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${s.color}22`, border: `1px solid ${s.color}44` }}
                  >
                    <s.icon size={18} style={{ color: s.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-0.5">Situação</p>
                    <p className="text-sm font-bold text-white mb-2">{s.situation}</p>
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowRight size={12} style={{ color: s.color }} />
                      <p className="text-xs font-black uppercase tracking-wider" style={{ color: s.color }}>
                        Fale com: {s.who}
                      </p>
                    </div>
                    <p className="text-xs text-white/60 pl-4">{s.action}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* REGRAS DE OURO */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <Sparkles className="text-yellow-400" size={22} />
            <h3 className="text-xl sm:text-2xl font-black italic uppercase tracking-tight">Regras de Ouro</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {GOLDEN_RULES.map((g, i) => (
              <motion.div
                key={g.text}
                initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/[0.06] to-transparent p-4"
              >
                <div className="w-9 h-9 rounded-lg bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center shrink-0">
                  <g.icon size={16} className="text-yellow-400" />
                </div>
                <p className="text-sm text-white/90 leading-relaxed">{g.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <motion.div
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          className="text-center py-8 border-t border-white/5"
        >
          <Megaphone className="mx-auto text-orange-500 mb-3" size={32} />
          <p className="text-lg font-black italic uppercase tracking-tight mb-1">
            Comunicação clara = Entrega no prazo
          </p>
          <p className="text-sm text-white/50">
            Salve este infográfico e consulte sempre que tiver dúvida sobre com quem falar.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

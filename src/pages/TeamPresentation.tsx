import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/vpsDb';
import { ROLE_LABELS, type UserRole } from '@/types';
import { Sparkles, Heart, Rocket, Users } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  displayName?: string;
  role: UserRole;
  jobTitle?: string;
  bio?: string;
  avatarUrl?: string;
}

/** O que cada função da Pulse faz no projeto do cliente — linguagem de cliente, não interna. */
const ROLE_CLIENT_DESCRIPTION: Record<UserRole, { headline: string; whatIDo: string; color: string; emoji: string }> = {
  admin: {
    headline: 'Estratégia e relacionamento com você',
    whatIDo: 'Sou o ponto de contato direto com você. Cuido da estratégia geral, alinhamentos, metas comerciais e garanto que sua marca receba a atenção que merece dentro da Pulse.',
    color: 'from-primary/20 to-primary/5',
    emoji: '🎯',
  },
  gestor_projetos: {
    headline: 'Gestão do seu projeto na Pulse',
    whatIDo: 'Sou responsável por conduzir o seu projeto dentro da equipe: acompanho prazos, organizo entregas, aciono cada especialista no momento certo e garanto que tudo saia como combinado.',
    color: 'from-purple-500/20 to-purple-500/5',
    emoji: '💼',
  },
  copywriter: {
    headline: 'A voz e as ideias da sua marca',
    whatIDo: 'Sou quem escreve o que sua marca vai dizer nas redes: legendas, roteiros, campanhas e comunicação. Traduzo a essência do seu negócio em palavras que vendem e conectam.',
    color: 'from-amber-500/20 to-amber-500/5',
    emoji: '✍️',
  },
  social_media: {
    headline: 'Sua marca viva no Instagram todos os dias',
    whatIDo: 'Cuido do planejamento e execução das postagens, calendário editorial, stories e engajamento. Meu foco é fazer sua marca crescer com consistência e presença estratégica.',
    color: 'from-emerald-500/20 to-emerald-500/5',
    emoji: '📱',
  },
  videomaker: {
    headline: 'Gravações profissionais da sua marca',
    whatIDo: 'Sou responsável pelas gravações: Reels, VSLs, institucional, bastidores. Vou até você (ou você vem ao estúdio) capturar o que sua marca tem de melhor com qualidade de cinema.',
    color: 'from-red-500/20 to-red-500/5',
    emoji: '🎬',
  },
  editor: {
    headline: 'Vídeos editados com identidade Pulse',
    whatIDo: 'Transformo o material gravado em vídeos prontos para as redes: cortes, ritmo, música, legendas e efeitos. Cada vídeo sai com energia, clareza e a linguagem certa para engajar.',
    color: 'from-blue-500/20 to-blue-500/5',
    emoji: '🎞️',
  },
  designer: {
    headline: 'Identidade visual e artes que vendem',
    whatIDo: 'Sou responsável pelas artes, feed, artes de campanha, catálogos e todo material visual da sua marca. Cuido para que cada peça respeite a identidade visual e passe profissionalismo.',
    color: 'from-pink-500/20 to-pink-500/5',
    emoji: '🎨',
  },
  fotografo: {
    headline: 'Fotos profissionais da sua marca',
    whatIDo: 'Cuido dos ensaios fotográficos: produto, ambiente, equipe e institucional. Fotos com iluminação e enquadramento profissionais para você usar em artes, site e redes.',
    color: 'from-yellow-500/20 to-yellow-500/5',
    emoji: '📷',
  },
  endomarketing: {
    headline: 'Comunicação interna da sua empresa',
    whatIDo: 'Cuido do marketing dentro da sua empresa: comunicação com sua equipe, campanhas internas, engajamento de colaboradores e materiais internos que fortalecem sua cultura.',
    color: 'from-cyan-500/20 to-cyan-500/5',
    emoji: '📣',
  },
  parceiro: {
    headline: 'Especialista parceiro Pulse',
    whatIDo: 'Sou um parceiro especializado que atua junto à Pulse para reforçar áreas específicas do seu projeto quando necessário, sempre com o mesmo padrão de qualidade da agência.',
    color: 'from-slate-500/20 to-slate-500/5',
    emoji: '🤝',
  },
};

export default function TeamPresentation() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('*');
      if (data) {
        const mapped: Member[] = (data as any[])
          .filter(p => p.role && p.role !== 'parceiro' || p.role === 'parceiro')
          .map(p => ({
            id: p.id,
            name: p.name,
            displayName: p.display_name,
            role: p.role as UserRole,
            jobTitle: p.job_title,
            bio: p.bio,
            avatarUrl: p.avatar_url,
          }))
          // ordena: admin/gestor primeiro, depois criativos
          .sort((a, b) => {
            const order: UserRole[] = ['admin', 'gestor_projetos', 'copywriter', 'social_media', 'videomaker', 'editor', 'designer', 'fotografo', 'endomarketing', 'parceiro'];
            return order.indexOf(a.role) - order.indexOf(b.role);
          });
        setMembers(mapped);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Hero */}
      <section className="relative overflow-hidden pt-16 pb-14 sm:pt-24 sm:pb-20 px-4">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="max-w-4xl mx-auto relative text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles size={14} className="text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Equipe Pulse Growth</span>
          </div>
          <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-bold leading-tight text-foreground">
            Conheça quem vai cuidar <br className="hidden sm:block" />
            <span className="text-primary">do seu projeto</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Cada profissional da Pulse tem uma função clara no crescimento da sua marca.
            Aqui você conhece a equipe que vai trabalhar por trás dos seus resultados.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
            <Heart size={14} className="text-primary fill-primary" />
            <span>Aqui temos amor pelo seu projeto</span>
          </div>
        </div>
      </section>

      {/* Members */}
      <section className="pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="text-center text-muted-foreground py-20">Carregando equipe...</div>
          ) : members.length === 0 ? (
            <div className="text-center text-muted-foreground py-20">
              <Users size={40} className="mx-auto opacity-40 mb-3" />
              Nenhum membro cadastrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {members.map((m, idx) => {
                const info = ROLE_CLIENT_DESCRIPTION[m.role] || ROLE_CLIENT_DESCRIPTION.parceiro;
                const displayName = m.displayName || m.name;
                const initials = displayName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ delay: idx * 0.04, duration: 0.5 }}
                    className={`relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-sm hover:shadow-xl transition-all`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${info.color} opacity-60 pointer-events-none`} />
                    <div className="relative">
                      <div className="flex items-start gap-4">
                        <div className="shrink-0">
                          {m.avatarUrl ? (
                            <img
                              src={m.avatarUrl}
                              alt={displayName}
                              className="w-16 h-16 rounded-2xl object-cover border-2 border-background shadow-md"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-warning text-white flex items-center justify-center font-bold text-lg shadow-md">
                              {initials || '👤'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{info.emoji}</span>
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                              {m.jobTitle || ROLE_LABELS[m.role]}
                            </p>
                          </div>
                          <h3 className="font-display text-xl font-bold text-foreground leading-tight">
                            {displayName}
                          </h3>
                          <p className="text-sm font-medium text-foreground/80 mt-1">
                            {info.headline}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
                        {info.whatIDo}
                      </p>

                      {m.bio && (
                        <p className="text-xs text-muted-foreground/80 italic mt-3 pt-3 border-t border-border/50">
                          "{m.bio}"
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Closing */}
      <section className="pb-20 px-4">
        <div className="max-w-3xl mx-auto text-center p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-primary/10 via-card to-warning/10 border border-primary/20">
          <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Rocket size={26} />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
            Um time inteiro trabalhando pela sua marca
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Cada especialista tem uma função clara. Enquanto você foca em vender e atender seus clientes,
            a Pulse cuida da sua presença digital do início ao fim.
          </p>
          <p className="text-xs text-muted-foreground mt-6">Pulse Growth Marketing · Aqui temos amor pelo seu projeto 🧡</p>
        </div>
      </section>
    </div>
  );
}

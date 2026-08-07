import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Award } from 'lucide-react';
import { supabase } from '@/lib/vpsDb';
import placeholder1 from '@/assets/team-placeholder-1.jpg';
import placeholder2 from '@/assets/team-placeholder-2.jpg';
import placeholder3 from '@/assets/team-placeholder-3.jpg';
import placeholder4 from '@/assets/team-placeholder-4.jpg';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  specialty: string | null;
  bio: string;
  photo_url: string | null;
}

const FALLBACK_PHOTOS = [placeholder1, placeholder2, placeholder3, placeholder4];

const FALLBACK_MEMBERS: TeamMember[] = [
  {
    id: 'p1',
    name: 'Diretor Criativo',
    role: 'Estrategista de Marca',
    specialty: 'Especialista em posicionamento e narrativa visual',
    bio: 'Mais de 10 anos transformando marcas locais em referências regionais por meio de identidade visual forte e estratégia digital orientada por dados.',
    photo_url: null,
  },
  {
    id: 'p2',
    name: 'Social Media',
    role: 'Especialista em Conteúdo',
    specialty: 'Estratégia de Instagram e engajamento',
    bio: 'Cria conteúdos que convertem seguidores em clientes. Estuda algoritmo, comportamento e tendências todos os dias para colocar sua marca à frente.',
    photo_url: null,
  },
  {
    id: 'p3',
    name: 'Videomaker',
    role: 'Diretor de Captação',
    specialty: 'Cinematografia para redes sociais',
    bio: 'Especialista em transformar o cotidiano da sua empresa em vídeos profissionais com linguagem nativa de Reels, Stories e TikTok.',
    photo_url: null,
  },
  {
    id: 'p4',
    name: 'Designer',
    role: 'Designer Gráfico Sênior',
    specialty: 'Identidade visual e artes para campanhas',
    bio: 'Apaixonada por tipografia, cor e composição. Constrói artes que respiram a essência da sua marca em cada post, story e campanha.',
    photo_url: null,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.6, ease: 'easeOut' as const },
  }),
};

export default function Equipe() {
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('team_members')
        .select('id, name, role, specialty, bio, photo_url')
        .eq('active', true)
        .order('display_order', { ascending: true });
      if (data && data.length > 0) setMembers(data as TeamMember[]);
      else setMembers(FALLBACK_MEMBERS);
    })();
  }, []);

  if (members.length === 0) return null;

  return (
    <section id="equipe" className="py-16 sm:py-24 bg-background relative overflow-hidden">
      <div className="absolute top-1/4 left-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-warning/5 rounded-full blur-[120px]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          className="text-center mb-12 sm:mb-20"
        >
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <Sparkles size={14} className="text-primary" />
            <span className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Nossa Equipe</span>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="font-display text-2xl sm:text-3xl md:text-5xl font-bold text-foreground mt-2 sm:mt-3 max-w-3xl mx-auto leading-tight"
          >
            Especialistas que fazem sua marca <span className="text-primary">acontecer</span>
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="text-sm sm:text-base md:text-lg text-muted-foreground mt-4 max-w-2xl mx-auto"
          >
            Cada profissional da Pulse é referência em sua área. Conheça quem está por trás dos resultados que entregamos todos os dias.
          </motion.p>
        </motion.div>

        <div className="space-y-16 sm:space-y-24">
          {members.map((member, idx) => {
            const isReversed = idx % 2 === 1;
            const photo = member.photo_url || FALLBACK_PHOTOS[idx % FALLBACK_PHOTOS.length];

            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className={`grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-center ${
                  isReversed ? 'lg:[&>*:first-child]:order-2' : ''
                }`}
              >
                {/* Photo */}
                <div className="relative">
                  <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 via-transparent to-warning/20 rounded-3xl blur-2xl opacity-60" />
                  <div className="relative aspect-[3/4] sm:aspect-[4/5] max-w-md mx-auto rounded-3xl overflow-hidden bg-muted border border-border/50 shadow-2xl">
                    <img
                      src={photo}
                      alt={`Foto de ${member.name}`}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/90 backdrop-blur-sm border border-border/50">
                        <Award size={12} className="text-primary" />
                        <span className="text-[10px] sm:text-xs font-semibold text-foreground">Especialista Pulse</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-4 sm:space-y-5">
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">
                      {member.role}
                    </p>
                    <h3 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mt-1.5 leading-tight">
                      {member.name}
                    </h3>
                  </div>

                  {member.specialty && (
                    <div className="flex items-start gap-2.5 p-3 sm:p-4 rounded-xl bg-card border border-border/50">
                      <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
                      <p className="text-sm sm:text-base text-foreground font-medium">
                        {member.specialty}
                      </p>
                    </div>
                  )}

                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                    {member.bio}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

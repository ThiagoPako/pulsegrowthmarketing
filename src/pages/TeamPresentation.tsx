import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/vpsDb';
import { ROLE_LABELS, type UserRole } from '@/types';

/* ---------- Paleta Pulse Signature (locked) ---------- */
const C = {
  bg: '#0A0A0B',
  surface: '#141416',
  ink: '#F5F1EC',
  orange: '#F26522',
  orangeSoft: '#FFB380',
} as const;

const SERIF = "'Fraunces', 'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

interface Member {
  id: string;
  name: string;
  displayName?: string;
  role: UserRole;
  jobTitle?: string;
  bio?: string;
  avatarUrl?: string;
}

/** O que cada função da Pulse faz no projeto do cliente. */
const ROLE_INFO: Record<UserRole, { headline: string; whatIDo: string; label: string }> = {
  admin: {
    label: 'Estrategista',
    headline: 'Estratégia e relacionamento com você.',
    whatIDo: 'Sou o ponto de contato direto com você. Cuido da estratégia geral, alinhamentos, metas comerciais e garanto que sua marca receba a atenção que merece dentro da Pulse.',
  },
  gestor_projetos: {
    label: 'Gestão de Projetos',
    headline: 'A guardiã da sua visão, transformando estratégia em execução impecável.',
    whatIDo: 'Conduzo o seu projeto dentro da equipe: acompanho prazos, organizo entregas, aciono cada especialista no momento certo e garanto que tudo saia como combinado.',
  },
  copywriter: {
    label: 'Copywriter',
    headline: 'Narrativas que convertem atenção em desejo absoluto.',
    whatIDo: 'Escrevo o que sua marca vai dizer nas redes: legendas, roteiros, campanhas e comunicação. Traduzo a essência do seu negócio em palavras que vendem e conectam.',
  },
  social_media: {
    label: 'Social Media',
    headline: 'Sua marca viva no Instagram, todos os dias.',
    whatIDo: 'Cuido do planejamento e execução das postagens, calendário editorial, stories e engajamento. Meu foco é fazer sua marca crescer com consistência e presença estratégica.',
  },
  videomaker: {
    label: 'Videomaker',
    headline: 'Captando a essência do seu negócio com olhar cinematográfico.',
    whatIDo: 'Sou responsável pelas gravações: Reels, VSLs, institucional, bastidores. Capturo o que sua marca tem de melhor com qualidade de cinema.',
  },
  editor: {
    label: 'Editor',
    headline: 'Vídeos com ritmo, energia e a linguagem certa para engajar.',
    whatIDo: 'Transformo o material gravado em vídeos prontos para as redes: cortes, ritmo, música, legendas e efeitos que respiram a identidade Pulse.',
  },
  designer: {
    label: 'Direção de Arte',
    headline: 'Estética sofisticada que posiciona sua marca no topo do mercado visual.',
    whatIDo: 'Cuido das artes, feed, campanhas, catálogos e todo material visual. Cada peça respeita sua identidade e transmite profissionalismo.',
  },
  fotografo: {
    label: 'Fotografia',
    headline: 'Fotos que dão status e presença à sua marca.',
    whatIDo: 'Conduzo os ensaios fotográficos: produto, ambiente, equipe e institucional. Iluminação e enquadramento profissionais para artes, site e redes.',
  },
  endomarketing: {
    label: 'Endomarketing',
    headline: 'Comunicação que fortalece sua cultura por dentro.',
    whatIDo: 'Cuido do marketing dentro da sua empresa: comunicação com equipe, campanhas internas, engajamento de colaboradores e materiais que unem seu time.',
  },
  parceiro: {
    label: 'Parceiro Pulse',
    headline: 'Especialista parceiro reforçando áreas específicas do seu projeto.',
    whatIDo: 'Atuo junto à Pulse para fortalecer o seu projeto em áreas específicas, sempre com o mesmo padrão de qualidade da agência.',
  },
};

/* ---------- Sub-componentes ---------- */

function FeaturedMember({ m }: { m: Member }) {
  const info = ROLE_INFO[m.role] || ROLE_INFO.parceiro;
  const displayName = m.displayName || m.name;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="md:col-span-7 flex flex-col gap-10"
    >
      <div className="relative group">
        <div
          className="w-full aspect-[4/5] overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-700"
          style={{ backgroundColor: C.surface }}
        >
          {m.avatarUrl ? (
            <img src={m.avatarUrl} alt={displayName} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <InitialsBlock name={displayName} large />
          )}
        </div>
        <div
          className="absolute -bottom-6 -right-6 md:-right-12 p-6 md:p-8 hidden md:block shadow-2xl"
          style={{ backgroundColor: C.orange }}
        >
          <p style={{ fontFamily: SERIF, color: C.bg }} className="text-xl md:text-2xl italic leading-none">
            {info.label}
          </p>
        </div>
      </div>
      <div className="max-w-xl">
        <h2 style={{ fontFamily: SERIF }} className="text-4xl md:text-5xl mb-6 italic font-medium">
          {displayName}
        </h2>
        <p style={{ color: C.orangeSoft, fontFamily: SANS }} className="text-xl md:text-2xl font-light leading-tight mb-6">
          {info.headline}
        </p>
        <p
          style={{ borderColor: `${C.orange}55`, fontFamily: SANS }}
          className="opacity-60 text-sm leading-relaxed border-l pl-6"
        >
          {info.whatIDo}
        </p>
      </div>
    </motion.div>
  );
}

function SecondaryMember({ m }: { m: Member }) {
  const info = ROLE_INFO[m.role] || ROLE_INFO.parceiro;
  const displayName = m.displayName || m.name;
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
      className="md:col-span-5 md:pt-48"
    >
      <div className="flex flex-col">
        <div
          className="w-full aspect-[3/4] mb-10 overflow-hidden grayscale hover:grayscale-0 transition-all duration-700"
          style={{ backgroundColor: C.surface }}
        >
          {m.avatarUrl ? (
            <img src={m.avatarUrl} alt={displayName} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <InitialsBlock name={displayName} large />
          )}
        </div>
        <div className="pr-4">
          <span
            style={{ color: C.orange, fontFamily: SANS }}
            className="text-[10px] uppercase tracking-widest font-bold mb-3 block"
          >
            {info.label}
          </span>
          <h3 style={{ fontFamily: SERIF }} className="text-3xl md:text-4xl mb-4 italic">
            {displayName}
          </h3>
          <p
            style={{ color: C.orangeSoft, fontFamily: SANS }}
            className="text-base md:text-lg font-light mb-4 italic leading-snug"
          >
            "{info.headline}"
          </p>
          <p style={{ fontFamily: SANS }} className="text-xs opacity-50 leading-relaxed max-w-xs">
            {info.whatIDo}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function RoundMember({ m, mirror }: { m: Member; mirror?: boolean }) {
  const info = ROLE_INFO[m.role] || ROLE_INFO.parceiro;
  const displayName = m.displayName || m.name;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className={`flex flex-col ${mirror ? 'md:flex-row-reverse md:text-right' : 'md:flex-row md:text-left'} items-center gap-8 text-center`}
    >
      <div
        className="w-40 h-40 md:w-56 md:h-56 shrink-0 rounded-full overflow-hidden grayscale hover:grayscale-0 transition-all duration-700"
        style={{ backgroundColor: C.surface }}
      >
        {m.avatarUrl ? (
          <img src={m.avatarUrl} alt={displayName} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <InitialsBlock name={displayName} />
        )}
      </div>
      <div className={mirror ? 'md:ml-auto' : 'md:mr-auto'}>
        <span
          style={{ color: C.orange, fontFamily: SANS }}
          className="text-[10px] uppercase tracking-widest font-bold block mb-2"
        >
          {info.label}
        </span>
        <h3 style={{ fontFamily: SERIF }} className="text-2xl md:text-3xl mb-3">
          {displayName}
        </h3>
        <p style={{ fontFamily: SANS }} className={`text-sm opacity-60 max-w-xs ${mirror ? 'ml-auto' : 'mr-auto'}`}>
          {info.headline}
        </p>
      </div>
    </motion.div>
  );
}

function InitialsBlock({ name, large }: { name: string; large?: boolean }) {
  const initials = (name || '')
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '·';
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ fontFamily: SERIF, color: C.orangeSoft, fontSize: large ? '5rem' : '2.25rem', fontWeight: 300 }}
    >
      {initials}
    </div>
  );
}

/* ---------- Página ---------- */

export default function TeamPresentation() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Inject Google Fonts once (Fraunces + Inter)
  useEffect(() => {
    const id = 'pulse-team-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('profiles').select('*');
        if (data) {
          const order: UserRole[] = [
            'gestor_projetos',
            'admin',
            'copywriter',
            'social_media',
            'designer',
            'videomaker',
            'editor',
            'fotografo',
            'endomarketing',
            'parceiro',
          ];
          const mapped: Member[] = (data as any[])
            .filter(p => p.role && ROLE_INFO[p.role as UserRole])
            .map(p => ({
              id: p.id,
              name: p.name,
              displayName: p.display_name,
              role: p.role as UserRole,
              jobTitle: p.job_title,
              bio: p.bio,
              avatarUrl: p.avatar_url,
            }))
            .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
          setMembers(mapped);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [featured, secondary, ...rest] = members;
  // Emparelha o restante 2 a 2
  const pairs: Member[][] = [];
  for (let i = 0; i < rest.length; i += 2) pairs.push(rest.slice(i, i + 2));

  return (
    <div
      className="min-h-screen w-full"
      style={{ backgroundColor: C.bg, color: C.ink, fontFamily: SANS }}
    >
      <div className="max-w-7xl mx-auto py-16 md:py-24 px-6 md:px-12">
        {/* ---------- Agency Hero ---------- */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="mb-24 md:mb-40 flex flex-col items-center text-center"
        >
          <div className="inline-block mb-8">
            <span
              style={{ color: C.orange, borderColor: `${C.orange}4d` }}
              className="uppercase tracking-[0.3em] text-[10px] font-bold px-4 py-1 border"
            >
              Pulse Growth Marketing
            </span>
          </div>
          <h1
            style={{ fontFamily: SERIF }}
            className="text-6xl md:text-9xl font-light leading-[0.85] tracking-tight"
          >
            Amor pelo seu <br />
            <span style={{ color: C.orangeSoft }} className="italic font-medium drop-shadow-sm">
              projeto
            </span>
          </h1>
          <div
            className="mt-16 w-px h-24"
            style={{ background: `linear-gradient(to bottom, ${C.orange}, transparent)` }}
          />
        </motion.header>

        {/* ---------- Estados ---------- */}
        {loading ? (
          <div className="text-center py-20" style={{ color: `${C.ink}66` }}>
            Carregando equipe...
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-20" style={{ color: `${C.ink}66` }}>
            Nenhum membro cadastrado.
          </div>
        ) : (
          <>
            {/* ---------- Grid Editorial ---------- */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-y-24 md:gap-y-32 md:gap-x-12">
              {featured && <FeaturedMember m={featured} />}
              {secondary && <SecondaryMember m={secondary} />}

              {pairs.map((pair, i) => (
                <div key={i} className="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-20">
                  {pair[0] && <RoundMember m={pair[0]} mirror />}
                  {pair[1] && <RoundMember m={pair[1]} />}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ---------- Welcome Footer ---------- */}
        <motion.footer
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mt-40 md:mt-60 pt-16 md:pt-24 border-t flex flex-col items-center"
          style={{ borderColor: `${C.orange}1a` }}
        >
          <h4
            style={{ fontFamily: SERIF }}
            className="text-4xl md:text-7xl text-center mb-10 leading-tight font-light"
          >
            Seja muito <br />
            <span style={{ color: C.orange }} className="italic font-medium">
              bem-vindo
            </span>{' '}
            à casa.
          </h4>
          <p className="max-w-xl text-center text-base md:text-lg opacity-70 mb-16 leading-relaxed font-light px-4">
            Esta é a equipe que cuidará de cada detalhe. Estamos prontos para pulsar junto com o seu crescimento.
          </p>
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-40">
            Pulse Growth Marketing · Aqui temos amor pelo seu projeto
          </p>
        </motion.footer>
      </div>
    </div>
  );
}

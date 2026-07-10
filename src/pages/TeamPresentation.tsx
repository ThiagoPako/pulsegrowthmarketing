import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { type UserRole } from '@/types';


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
const ROLE_INFO: Record<UserRole, { label: string; whatIDo: string }> = {
  admin: {
    label: 'Estrategista',
    whatIDo:
      'Sou o ponto de contato direto com você. Cuido da estratégia geral, alinhamentos, metas comerciais e garanto que sua marca receba a atenção que merece dentro da Pulse.',
  },
  gestor_projetos: {
    label: 'Gestão de Projetos',
    whatIDo:
      'Conduzo o seu projeto dentro da equipe: acompanho prazos, organizo entregas, aciono cada especialista no momento certo e garanto que tudo saia como combinado.',
  },
  copywriter: {
    label: 'Copywriter',
    whatIDo:
      'Escrevo o que sua marca vai dizer nas redes: legendas, roteiros, campanhas e comunicação. Traduzo a essência do seu negócio em palavras que vendem e conectam.',
  },
  social_media: {
    label: 'Social Media',
    whatIDo:
      'Cuido do planejamento e execução das postagens, calendário editorial, stories e engajamento. Faço sua marca crescer com consistência e presença estratégica.',
  },
  videomaker: {
    label: 'Videomaker',
    whatIDo:
      'Sou responsável pelas gravações: Reels, VSLs, institucional, bastidores. Capturo o que sua marca tem de melhor com qualidade de cinema.',
  },
  editor: {
    label: 'Editor de Vídeo',
    whatIDo:
      'Transformo o material gravado em vídeos prontos para as redes: cortes, ritmo, música, legendas e efeitos que respiram a identidade da sua marca.',
  },
  designer: {
    label: 'Direção de Arte',
    whatIDo:
      'Cuido das artes, feed, campanhas, catálogos e todo material visual. Cada peça respeita sua identidade e transmite profissionalismo.',
  },
  fotografo: {
    label: 'Fotografia',
    whatIDo:
      'Conduzo os ensaios fotográficos: produto, ambiente, equipe e institucional. Iluminação e enquadramento profissionais para artes, site e redes.',
  },
  endomarketing: {
    label: 'Endomarketing',
    whatIDo:
      'Cuido do marketing dentro da sua empresa: comunicação com equipe, campanhas internas, engajamento de colaboradores e materiais que unem seu time.',
  },
  parceiro: {
    label: 'Parceiro Pulse',
    whatIDo:
      'Atuo junto à Pulse para fortalecer o seu projeto em áreas específicas, sempre com o mesmo padrão de qualidade da agência.',
  },
};

/* ---------- Card único e igualitário ---------- */

/** Overrides individuais — quando alguém acumula funções específicas. */
const NAME_OVERRIDES: Array<{ match: RegExp; label: string; whatIDo: string }> = [
  {
    match: /thiago/i,
    label: 'Estrategista · Gestor de Tráfego',
    whatIDo:
      'Sou o ponto de contato direto com você e também o especialista em tráfego pago da Pulse — Meta Ads e Google Ads. Cuido da estratégia geral do seu projeto, das campanhas que trazem clientes e garanto que cada real investido em anúncio volte em resultado.',
  },
];

function MemberCard({ m, index }: { m: Member; index: number }) {
  const displayName = m.displayName || m.name;
  const override = NAME_OVERRIDES.find(o => o.match.test(displayName));
  const base = ROLE_INFO[m.role] || ROLE_INFO.parceiro;
  const info = override ? { label: override.label, whatIDo: override.whatIDo } : base;
  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: (index % 3) * 0.08 }}
      className="flex flex-col group"
    >
      <div
        className="w-full aspect-[4/5] mb-6 overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-700"
        style={{ backgroundColor: C.surface }}
      >
        {m.avatarUrl ? (
          <img
            src={m.avatarUrl}
            alt={displayName}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
          />
        ) : (
          <InitialsBlock name={displayName} />
        )}
      </div>

      <span
        style={{ color: C.orange, fontFamily: SANS }}
        className="text-[10px] uppercase tracking-[0.25em] font-bold mb-3"
      >
        {info.label}
      </span>

      <h3 style={{ fontFamily: SERIF }} className="text-2xl md:text-3xl mb-4 italic font-medium leading-tight">
        {displayName}
      </h3>

      <p
        style={{ borderColor: `${C.orange}44`, fontFamily: SANS }}
        className="text-sm leading-relaxed opacity-75 border-l pl-4"
      >
        {info.whatIDo}
      </p>
    </motion.article>
  );
}

function InitialsBlock({ name }: { name: string }) {
  const initials =
    (name || '')
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·';
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ fontFamily: SERIF, color: C.orangeSoft, fontSize: '3.5rem', fontWeight: 300 }}
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
          // Ordem pela dinâmica do projeto — não é hierarquia, é fluxo de trabalho.
          const order: UserRole[] = [
            'admin',
            'gestor_projetos',
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

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: C.bg, color: C.ink, fontFamily: SANS }}>
      <div className="max-w-7xl mx-auto py-16 md:py-24 px-6 md:px-12">
        {/* ---------- Hero ---------- */}
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="mb-20 md:mb-28 flex flex-col items-center text-center"
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
            className="text-5xl md:text-8xl font-light leading-[0.9] tracking-tight max-w-4xl"
          >
            O time que vai <br />
            <span style={{ color: C.orangeSoft }} className="italic font-medium">
              cuidar do seu projeto
            </span>
          </h1>
          <p
            className="mt-10 max-w-2xl text-base md:text-lg opacity-70 leading-relaxed font-light"
            style={{ fontFamily: SANS }}
          >
            Não trabalhamos em silos — trabalhamos como uma dinâmica. Cada pessoa abaixo tem um papel específico no
            crescimento da sua empresa. Conheça quem faz o quê.
          </p>
          <div
            className="mt-12 w-px h-16"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-16 md:gap-x-14 md:gap-y-24">
            {members.map((m, i) => (
              <MemberCard key={m.id} m={m} index={i} />
            ))}
          </div>
        )}

        {/* ---------- Como funciona a dinâmica ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-32 md:mt-44 grid md:grid-cols-3 gap-10 md:gap-14"
        >
          {[
            {
              n: '01',
              t: 'Estratégia',
              d: 'Entendemos o momento da sua empresa, seus objetivos e desenhamos o caminho.',
            },
            {
              n: '02',
              t: 'Execução',
              d: 'Cada especialista atua na sua área — gravação, arte, copy, social — sempre alinhados.',
            },
            {
              n: '03',
              t: 'Crescimento',
              d: 'Acompanhamos resultados, ajustamos e escalamos o que funciona para a sua marca.',
            },
          ].map(step => (
            <div key={step.n} className="flex flex-col">
              <span
                style={{ fontFamily: SERIF, color: C.orange }}
                className="text-5xl md:text-6xl italic font-light mb-4"
              >
                {step.n}
              </span>
              <h4 style={{ fontFamily: SERIF }} className="text-2xl mb-3 italic">
                {step.t}
              </h4>
              <p className="text-sm opacity-70 leading-relaxed">{step.d}</p>
            </div>
          ))}
        </motion.section>

        {/* ---------- Welcome Footer ---------- */}
        <motion.footer
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mt-32 md:mt-44 pt-16 md:pt-20 border-t flex flex-col items-center"
          style={{ borderColor: `${C.orange}1a` }}
        >
          <h4
            style={{ fontFamily: SERIF }}
            className="text-4xl md:text-6xl text-center mb-8 leading-tight font-light"
          >
            Seja muito <br />
            <span style={{ color: C.orange }} className="italic font-medium">
              bem-vindo
            </span>{' '}
            à casa.
          </h4>
          <p className="max-w-xl text-center text-base md:text-lg opacity-70 mb-14 leading-relaxed font-light px-4">
            Esta é a equipe que cuidará de cada detalhe. Estamos prontos para pulsar junto com o seu crescimento.
          </p>
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-40 text-center">
            Pulse Growth Marketing · Aqui temos amor pelo seu projeto
          </p>
        </motion.footer>
      </div>
    </div>
  );
}

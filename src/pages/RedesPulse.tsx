// Landing page "Como a Pulse cuida das suas redes" (usuário, 02/11/2026). Aberta pelo "Saiba mais" da página de conexão
// (/conectar/<token>), onde as redes fora do plano aparecem apagadas. Pouco texto e muita ilustração: cada rede com a sua
// linguagem e o que ela faz pela empresa, destaque para o monitoramento de avaliações do Google feito pela Ísis, e o
// botão "Falar com a equipe" (WhatsApp do Thiago, com a mensagem de onde veio). ?cliente=<nome> personaliza a mensagem;
// #<rede> rola até a rede tocada. Respeita "reduzir movimento".
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AtSign, Bell, BriefcaseBusiness, Check, Facebook, Flag, Instagram, Linkedin, MapPin, MessageCircle, Music2, PenLine, Pin,
  Search, ShieldCheck, Sparkles, Star, Twitter, Users, Youtube,
} from 'lucide-react';
import logo from '@/assets/pulse-logo-branco.png';
import { pulseWhatsapp } from '@/lib/pulseContato';

const ORANGE = '#F15A24';
const PEACH = '#FFB08C';

type Rede = {
  id: string; label: string; bg: string; glow: string; Icon: typeof Instagram;
  serve: string; publico: string; formatos: string[]; selo?: string;
};

const REDES: Rede[] = [
  { id: 'instagram', label: 'Instagram', bg: 'linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)', glow: '#DD2A7B', Icon: Instagram,
    serve: 'A vitrine da marca e o relacionamento do dia a dia.', publico: 'Quase todo mundo, de 18 a 45 anos', formatos: ['Reels', 'Stories', 'Carrossel'] },
  { id: 'facebook', label: 'Facebook', bg: '#1877F2', glow: '#1877F2', Icon: Facebook,
    serve: 'Fala com o público mais velho e com a comunidade da cidade.', publico: 'Adultos de 35+, grupos e bairros', formatos: ['Posts', 'Eventos', 'Grupos'] },
  { id: 'tiktok', label: 'TikTok', bg: 'linear-gradient(135deg,#25F4EE,#000 45%,#FE2C55)', glow: '#FE2C55', Icon: Music2,
    serve: 'Descoberta: leva a marca a quem ainda não te conhece.', publico: 'Público jovem que descobre pelo vídeo', formatos: ['Vídeo curto', 'Bastidor', 'Tendência'] },
  { id: 'linkedin', label: 'LinkedIn', bg: '#0A66C2', glow: '#0A66C2', Icon: Linkedin, selo: 'Recrutamento',
    serve: 'Posicionamento da empresa e atração de bons profissionais.', publico: 'Profissionais, parceiros e empresas', formatos: ['Vagas', 'Conquistas', 'Artigo'] },
  { id: 'threads', label: 'Threads', bg: '#101010', glow: '#8C8C8C', Icon: AtSign, selo: 'Recrutamento',
    serve: 'Conversa direta: opinião, bastidores e posicionamento em texto.', publico: 'Quem já te segue no Instagram', formatos: ['Texto curto', 'Opinião', 'Enquete'] },
  { id: 'youtube', label: 'YouTube', bg: '#FF0000', glow: '#FF0000', Icon: Youtube,
    serve: 'Quem pesquisa encontra: vídeos que trazem clientes por anos.', publico: 'Quem busca como fazer e o que comprar', formatos: ['Shorts', 'Tutorial', 'Depoimento'] },
  { id: 'google_business', label: 'Google', bg: 'conic-gradient(from 200deg,#4285F4,#34A853,#FBBC05,#EA4335,#4285F4)', glow: '#34A853', Icon: MapPin,
    serve: 'Quem procura perto de você decide pelas avaliações.', publico: 'Quem está pronto para comprar', formatos: ['Avaliações', 'Novidades', 'Fotos'] },
  { id: 'pinterest', label: 'Pinterest', bg: '#E60023', glow: '#E60023', Icon: Pin,
    serve: 'Inspiração que vira compra: decoração, moda, beleza, festa.', publico: 'Quem planeja uma compra', formatos: ['Pins', 'Catálogo', 'Ideias'] },
  { id: 'x', label: 'X', bg: '#000', glow: '#7A7A7A', Icon: Twitter,
    serve: 'Notícia rápida e conversa em tempo real.', publico: 'Quem acompanha assuntos do momento', formatos: ['Post curto', 'Notícia', 'Resposta'] },
];

// uma ideia virando a linguagem de cada rede (a ilustração do topo)
const IDEIA = [
  { id: 'instagram', fala: 'Reels de 30 s com o dia da inauguração' },
  { id: 'tiktok', fala: 'Bastidor da montagem em 15 s' },
  { id: 'facebook', fala: 'Convite para a comunidade do bairro' },
  { id: 'linkedin', fala: 'Vagas abertas e a história do crescimento' },
  { id: 'threads', fala: '“O que vocês querem ver na loja nova?”' },
  { id: 'google_business', fala: 'Fotos novas e o horário atualizado' },
];
const rede = (id: string) => REDES.find((r) => r.id === id)!;

function Bolha({ r, size = 'h-11 w-11', icon = 'h-5 w-5' }: { r: Rede; size?: string; icon?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-2xl text-white`} style={{ background: r.bg, boxShadow: `0 10px 26px -10px ${r.glow}` }}>
      <r.Icon className={icon} />
    </span>
  );
}

/** Topo: a mesma ideia ("inauguração da loja") troca de rede e de linguagem. */
function IdeiaQueViraRedes({ still }: { still: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (still) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % IDEIA.length), 2400);
    return () => window.clearInterval(t);
  }, [still]);
  const atual = IDEIA[i];
  const r = rede(atual.id);
  return (
    <div className="relative mx-auto mt-10 w-full max-w-sm">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
        <p className="text-xs text-white/50">Uma ideia</p>
        <p className="mt-0.5 text-lg font-bold">A inauguração da loja</p>
        <div className="my-4 flex items-center gap-2">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />
          <Sparkles className="h-4 w-4" style={{ color: PEACH }} />
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
        </div>
        <div className="relative h-[4.5rem]">
          <AnimatePresence initial={false}>
            <motion.div key={atual.id} className="absolute inset-0 flex items-center gap-3"
              initial={{ opacity: 0, y: still ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: still ? 0 : -16 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
              <Bolha r={r} size="h-14 w-14" icon="h-7 w-7" />
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: PEACH }}>No {r.label}</p>
                <p className="text-[0.95rem] leading-snug">{atual.fala}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
        {IDEIA.map((x, k) => (
          <span key={x.id} className="h-1.5 rounded-full transition-all duration-500" style={{ width: k === i ? 22 : 6, background: k === i ? ORANGE : 'rgba(255,255,255,.2)' }} />
        ))}
      </div>
    </div>
  );
}

/** Ilustração do monitoramento: chega a avaliação, a Ísis escreve, o dono aprova no WhatsApp, a resposta é publicada. */
function FluxoIsis({ still }: { still: boolean }) {
  const passo = (k: number) => ({
    initial: { opacity: 0, x: still ? 0 : k % 2 ? 24 : -24 },
    whileInView: { opacity: 1, x: 0 },
    viewport: { once: true, amount: 0.6 },
    transition: { duration: still ? 0 : 0.55, delay: still ? 0 : 0.15 + k * 0.45, ease: [0.22, 1, 0.36, 1] as const },
  });
  return (
    <div className="relative mx-auto w-full max-w-sm space-y-3">
      <span aria-hidden className="absolute bottom-6 left-[1.35rem] top-6 w-px bg-gradient-to-b from-[#EA4335] via-[#F15A24] to-[#34A853] opacity-50" />
      <motion.div {...passo(0)} className="relative flex gap-3">
        <span className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EA4335] text-white"><Bell className="h-5 w-5" /></span>
        <div className="flex-1 rounded-2xl bg-white p-3 text-[#1b1b1b]">
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((s) => <Star key={s} className={`h-3.5 w-3.5 ${s < 2 ? 'fill-[#FBBC04] text-[#FBBC04]' : 'text-neutral-300'}`} />)}
            <span className="ml-1 text-[11px] text-neutral-500">agora</span>
          </div>
          <p className="mt-1 text-sm">“Demorou muito para me atenderem.”</p>
        </div>
      </motion.div>
      <motion.div {...passo(1)} className="relative flex gap-3">
        <span className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white" style={{ background: ORANGE }}><PenLine className="h-5 w-5" /></span>
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] font-semibold" style={{ color: PEACH }}>Ísis escreveu a resposta</p>
          <p className="mt-1 text-sm text-white/85">“Sentimos muito pela espera. Já ajustamos a equipe e queremos te receber de novo…”</p>
        </div>
      </motion.div>
      <motion.div {...passo(2)} className="relative flex gap-3">
        <span className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white"><MessageCircle className="h-5 w-5" /></span>
        <div className="flex-1 rounded-2xl rounded-tl-sm bg-[#1F2C34] p-3">
          <p className="text-sm text-white/85">Chegou uma avaliação de 2 estrelas. Aprova a resposta?</p>
          <div className="mt-2 flex gap-2">
            <span className="rounded-lg bg-[#1F9D55] px-3 py-1 text-xs font-bold">Aprovar</span>
            <span className="rounded-lg border border-white/20 px-3 py-1 text-xs">Ajustar</span>
          </div>
        </div>
      </motion.div>
      <motion.div {...passo(3)} className="relative flex gap-3">
        <span className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#34A853] text-white"><Check className="h-5 w-5" /></span>
        <div className="flex flex-1 items-center rounded-2xl border border-[#34A853]/30 bg-[#34A853]/10 p-3">
          <p className="text-sm font-semibold text-[#9BE8B4]">Resposta publicada no Google</p>
        </div>
      </motion.div>
    </div>
  );
}

const ISIS_FAZ = [
  { Icon: Bell, t: 'Vigia as avaliações', d: 'Avaliação negativa chegou, você fica sabendo.' },
  { Icon: PenLine, t: 'Escreve a resposta', d: 'Educada, no tom da sua empresa.' },
  { Icon: MessageCircle, t: 'Pede o seu ok', d: 'No WhatsApp de quem você escolher, um ou vários.' },
  { Icon: Users, t: 'Registra quem aprovou', d: 'Você sabe quem viu e quem decidiu.' },
  { Icon: Flag, t: 'Aponta o que pode sair', d: 'Avaliação que fere as regras do Google: sugere pedir a remoção.' },
  { Icon: Sparkles, t: 'Mantém a ficha viva', d: 'Novidades e fotos novas no seu perfil do Google.' },
];

const POSICIONA = [
  { Icon: Users, t: 'Cada público na sua língua', d: 'O que funciona no TikTok não é o que convence no LinkedIn.' },
  { Icon: Search, t: 'Mais gente te encontra', d: 'Cada rede leva a marca a um público diferente.' },
  { Icon: BriefcaseBusiness, t: 'Bons profissionais chegam', d: 'LinkedIn e Threads mostram a empresa para quem quer trabalhar nela.' },
];

const COMO = [
  { t: 'Conectamos as redes', d: 'Por um link seguro da Pulse, sem passar senha.' },
  { t: 'Planejamos por rede', d: 'Conteúdo próprio para cada uma, ou o mesmo adaptado.' },
  { t: 'Você aprova', d: 'Tudo passa por você antes de ir ao ar.' },
  { t: 'Publicamos e respondemos', d: 'Postagens, comentários e avaliações em dia.' },
];

export default function RedesPulse() {
  const still = !!useReducedMotion();
  const [params] = useSearchParams();
  const cliente = (params.get('cliente') || '').trim().slice(0, 80);
  const contato = (assunto: string) => pulseWhatsapp(
    `Olá! Vim da página "Como a Pulse cuida das suas redes"${cliente ? ` (cliente ${cliente})` : ''} e quero saber mais sobre ${assunto}.`,
  );

  useEffect(() => {
    document.title = 'Como a Pulse cuida das suas redes · Agência Pulse';
    const alvo = window.location.hash.slice(1);
    if (alvo) window.setTimeout(() => document.getElementById(alvo)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' }), 350);
  }, [still]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0B0B0E] text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${ORANGE}50, transparent 65%)` }} />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 pt-5">
        <img src={logo} alt="Agência Pulse" className="h-5" />
        <a href={contato('o gerenciamento de redes')} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold hover:border-white/40">Falar com a equipe</a>
      </header>

      {/* topo */}
      <section className="relative mx-auto max-w-5xl px-5 pb-16 pt-12 text-center">
        <h1 className="mx-auto max-w-xl text-[2.4rem] font-bold leading-[1.05] tracking-tight sm:text-6xl">Cada rede fala uma língua</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/65">A Pulse cria para cada rede do jeito que o público dela gosta. A sua marca fica a mesma; a conversa muda.</p>
        <IdeiaQueViraRedes still={still} />
      </section>

      {/* Google + Ísis */}
      <section id="google" className="relative border-y border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#34A853]/15 px-3 py-1 text-xs font-semibold text-[#9BE8B4]"><ShieldCheck className="h-3.5 w-3.5" /> Monitoramento de avaliações</span>
            <h2 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">Avaliação ruim no Google não fica sem resposta</h2>
            <p className="mt-3 max-w-md text-white/65">A Ísis, a assistente da Pulse, acompanha a sua ficha no Google. Chegou uma avaliação negativa, ela prepara a resposta e você aprova com um toque.</p>
            <ul className="mt-7 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              {ISIS_FAZ.map(({ Icon, t, d }) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]"><Icon className="h-4 w-4" style={{ color: PEACH }} /></span>
                  <div>
                    <p className="text-sm font-semibold">{t}</p>
                    <p className="text-xs leading-relaxed text-white/55">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <a href={contato('o monitoramento de avaliações do Google')} target="_blank" rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold" style={{ background: ORANGE, boxShadow: `0 14px 34px -14px ${ORANGE}` }}>
              <MessageCircle className="h-4 w-4" /> Quero o monitoramento
            </a>
          </div>
          <FluxoIsis still={still} />
        </div>
      </section>

      {/* redes */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-3xl font-bold leading-tight sm:text-4xl">Para que serve cada rede</h2>
        <p className="mt-2 max-w-lg text-white/60">Você escolhe: conteúdo próprio para cada uma ou o mesmo conteúdo adaptado à linguagem dela.</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REDES.map((r) => (
            <li key={r.id} id={r.id} className="group relative scroll-mt-24 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition target:border-[#F15A24]/60 target:bg-[#F15A24]/[0.06] hover:border-white/25">
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-35" style={{ background: r.glow }} />
              <div className="relative flex items-center gap-3">
                <Bolha r={r} />
                <p className="text-lg font-bold">{r.label}</p>
                {r.selo && <span className="ml-auto rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/80">{r.selo}</span>}
              </div>
              <p className="relative mt-4 text-[0.95rem] leading-snug">{r.serve}</p>
              <p className="relative mt-2 flex items-center gap-1.5 text-xs text-white/50"><Users className="h-3.5 w-3.5" /> {r.publico}</p>
              <div className="relative mt-4 flex flex-wrap gap-1.5">
                {r.formatos.map((f) => <span key={f} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/75">{f}</span>)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* posicionamento */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#F15A24]/[0.12] via-transparent to-transparent p-6 sm:p-10">
          <h2 className="max-w-md text-2xl font-bold leading-tight sm:text-3xl">Presente em mais redes, a empresa se posiciona melhor</h2>
          <div className="mt-7 grid gap-5 sm:grid-cols-3">
            {POSICIONA.map(({ Icon, t, d }) => (
              <div key={t}>
                <Icon className="h-6 w-6" style={{ color: PEACH }} />
                <p className="mt-2 font-semibold">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/60">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* como funciona */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <h2 className="text-2xl font-bold sm:text-3xl">Como a Pulse cuida</h2>
        <ol className="mt-7 grid gap-3 sm:grid-cols-4">
          {COMO.map((c, k) => (
            <li key={c.t} className="rounded-3xl border border-white/10 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold" style={{ background: ORANGE }}>{k + 1}</span>
              <p className="mt-3 font-semibold">{c.t}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/55">{c.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* contato */}
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="relative overflow-hidden rounded-[2rem] p-7 text-center sm:p-12" style={{ background: `linear-gradient(135deg, ${ORANGE}, #C2410C)` }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-wrap items-center justify-center gap-6 opacity-[0.12]">
            {REDES.map((r) => <r.Icon key={r.id} className="h-12 w-12" />)}
          </div>
          <h2 className="relative text-2xl font-bold leading-tight sm:text-4xl">Quer a Pulse em mais redes?</h2>
          <p className="relative mx-auto mt-2 max-w-sm text-white/85">Fale com a nossa equipe: a gente monta o plano com as redes certas para a sua empresa.</p>
          <a href={contato('ampliar o plano para mais redes sociais')} target="_blank" rel="noreferrer"
            className="relative mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 font-bold text-[#C2410C] shadow-xl">
            <MessageCircle className="h-5 w-5" /> Falar com a equipe
          </a>
        </div>
        <p className="mt-8 text-center text-xs text-white/35">Agência Pulse · @agenciapulse</p>
      </section>
    </div>
  );
}

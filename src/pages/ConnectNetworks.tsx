// Conectar as redes do cliente com a cara da Pulse (usuário, 02/11/2026: "conexão transparente… não mostrar plataforma de
// terceiros" e "precisa ter uma experiência envolvida, com motion e visualmente atrativa, gerando a sensação de estar
// entrando em uma agência de alto nível"). Abertura: a logo do cliente e a da Pulse se encontram e uma linha de luz liga
// as duas; as redes entram em sequência; cada conexão vira "Conectado" com um brilho; tudo pronto, uma comemoração.
// Respeita "reduzir movimento" do aparelho. Servidor: lib/uploadPost.mjs (/api/public/conectar).
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion';
import { ArrowUpRight, AtSign, Check, EyeOff, KeyRound, Unplug, Facebook, Instagram, Linkedin, Loader2, Lock, MapPin, MessageCircle, Music2, Pin, ShieldCheck, Twitter, Youtube } from 'lucide-react';
import { pulseWhatsapp } from '@/lib/pulseContato';
import logo from '@/assets/pulse-logo-branco.png';

const API = 'https://agenciapulse.tech/api';
const ORANGE = '#F15A24';

const NETWORKS: Record<string, { label: string; bg: string; glow: string; Icon: typeof Instagram; help: string }> = {
  instagram: { label: 'Instagram', bg: 'linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)', glow: '#DD2A7B', Icon: Instagram, help: 'Conta profissional da empresa' },
  facebook: { label: 'Facebook', bg: '#1877F2', glow: '#1877F2', Icon: Facebook, help: 'A página da empresa' },
  tiktok: { label: 'TikTok', bg: 'linear-gradient(135deg,#25F4EE,#000 45%,#FE2C55)', glow: '#FE2C55', Icon: Music2, help: 'A conta da empresa' },
  linkedin: { label: 'LinkedIn', bg: '#0A66C2', glow: '#0A66C2', Icon: Linkedin, help: 'O perfil ou a página da empresa' },
  youtube: { label: 'YouTube', bg: '#FF0000', glow: '#FF0000', Icon: Youtube, help: 'O canal da empresa' },
  google_business: { label: 'Google', bg: 'conic-gradient(from 200deg,#4285F4,#34A853,#FBBC05,#EA4335,#4285F4)', glow: '#34A853', Icon: MapPin, help: 'A ficha da empresa, com as avaliações' },
  threads: { label: 'Threads', bg: '#101010', glow: '#9A9A9A', Icon: AtSign, help: 'A conta da empresa (a mesma do Instagram)' },
  x: { label: 'X', bg: '#000', glow: '#7A7A7A', Icon: Twitter, help: 'A conta da empresa' },
  pinterest: { label: 'Pinterest', bg: '#E60023', glow: '#E60023', Icon: Pin, help: 'A conta da empresa' },
};

interface Data { client: { name: string; logo: string | null }; kind?: 'evento' | 'cliente'; networks: { id: string; in_plan?: boolean; connected: boolean; reconnect: boolean; account: string | null }[] }

function Mark({ data }: { data: Data }) {
  return data.client.logo
    ? <img src={data.client.logo} alt={`Logo ${data.client.name}`} className="h-full w-full rounded-[1.4rem] bg-white object-contain p-2" />
    : <span className="flex h-full w-full items-center justify-center rounded-[1.4rem] text-3xl font-bold" style={{ background: ORANGE }}>{data.client.name.slice(0, 1)}</span>;
}

/** A logo do cliente e a da Pulse se aproximam e a linha de luz acende entre elas. */
function Handshake({ data, still }: { data: Data; still: boolean }) {
  const t = (d: number): Transition => (still ? { duration: 0 } : { duration: 0.8, delay: d, ease: [0.22, 1, 0.36, 1] as const });
  return (
    <div className="relative mx-auto flex h-28 w-full max-w-xs items-center justify-between">
      <motion.div className="relative z-10 h-24 w-24 shadow-2xl shadow-black/60" initial={{ x: still ? 0 : -40, opacity: still ? 1 : 0 }} animate={{ x: 0, opacity: 1 }} transition={t(0.1)}>
        <Mark data={data} />
      </motion.div>
      <div className="absolute inset-x-24 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${ORANGE}, #FFB08C, ${ORANGE}, transparent)` }}
          initial={{ x: still ? '0%' : '-100%' }} animate={{ x: '0%' }} transition={t(0.7)} />
        {!still && (
          <motion.div className="absolute top-0 h-full w-10 rounded-full bg-white/80 blur-[2px]" initial={{ left: '-20%' }} animate={{ left: '120%' }}
            transition={{ duration: 1.6, delay: 1.4, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }} />
        )}
      </div>
      <motion.div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-[1.4rem] border border-white/10 bg-[#17171B] p-4 shadow-2xl shadow-black/60"
        initial={{ x: still ? 0 : 40, opacity: still ? 1 : 0 }} animate={{ x: 0, opacity: 1 }} transition={t(0.25)}>
        <img src={logo} alt="Agência Pulse" className="w-full" />
      </motion.div>
    </div>
  );
}

export default function ConnectNetworks() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const still = !!useReducedMotion();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const back = params.get('rede');
  const status = params.get('connect_status');

  const load = () => fetch(`${API}/public/conectar/${encodeURIComponent(token || '')}`)
    .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'Link não encontrado'); setData(b); })
    .catch((e: Error) => setError(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = 'Conectar redes · Agência Pulse'; load(); }, [token]);

  const connect = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetch(`${API}/public/conectar/${encodeURIComponent(token || '')}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rede: id }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok || !b.url) throw new Error(b.error || 'Não deu para abrir o login. Tente de novo.');
      window.location.href = b.url;
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };

  // as do plano para conectar; as outras aparecem apagadas, com convite para ampliar o plano (usuário, 02/11/2026)
  const plan = data ? data.networks.filter((n) => n.in_plan !== false && NETWORKS[n.id]) : [];
  // cliente só de evento não vê o convite para ampliar o plano
  const others = data && data.kind !== 'evento' ? data.networks.filter((n) => n.in_plan === false && NETWORKS[n.id]) : [];
  const total = plan.length;
  const done = plan.filter((n) => n.connected).length;
  const more = data ? `/redes?cliente=${encodeURIComponent(data.client.name)}` : '/redes';
  const all = total > 0 && done === total;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B0B0E] text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      {/* luz de fundo que respira devagar */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${ORANGE}55, transparent 65%)` }}
        animate={still ? undefined : { opacity: [0.55, 0.85, 0.55], scale: [1, 1.08, 1] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />

      <header className="relative mx-auto flex max-w-md items-center justify-between px-5 pt-5">
        <img src={logo} alt="Agência Pulse" className="h-5 opacity-90" />
        <span className="flex items-center gap-1 text-xs text-white/60"><Lock className="h-3.5 w-3.5" /> Conexão segura</span>
      </header>

      <main className="relative mx-auto max-w-md px-5 pb-14 pt-8">
        {!data && !error && <div className="flex justify-center py-32"><Loader2 className="h-6 w-6 animate-spin" style={{ color: ORANGE }} /></div>}
        {error && !data && (
          <div className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
            <p className="font-semibold">{error}</p>
            <p className="mt-1 text-sm text-white/60">Fale com a equipe da Pulse que mandamos um link novo.</p>
          </div>
        )}
        {data && (
          <>
            <Handshake data={data} still={still} />

            <motion.div className="mt-8 text-center" initial={{ opacity: 0, y: still ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: still ? 0 : 0.7, delay: still ? 0 : 1.1 }}>
              <p className="text-sm font-medium" style={{ color: '#FFB08C' }}>Bem-vindo à Pulse</p>
              <h1 className="mt-1 text-[1.7rem] font-bold leading-tight">Vamos conectar as redes de {data.client.name}</h1>
              <p className="mx-auto mt-3 max-w-[22rem] text-sm leading-relaxed text-white/65">
                {data.kind === 'evento'
                  ? 'É assim que a nossa equipe posta os stories do seu evento em tempo real, direto no seu perfil. Toque na rede e entre com o seu login.'
                  : 'Toque em cada rede e entre com o seu login. A gente só publica o que você aprovar, e você desconecta quando quiser.'}
              </p>
            </motion.div>

            <AnimatePresence>
              {back && status && (
                <motion.p key="volta" role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`mt-6 rounded-2xl px-4 py-3 text-center text-sm font-medium ${status === 'success' ? 'bg-[#1F9D55]/20 text-[#7BE0A6]' : 'bg-[#F15A24]/15 text-[#FFB08C]'}`}>
                  {status === 'success' ? `${NETWORKS[back]?.label || 'Rede'} conectado com sucesso` : `O login do ${NETWORKS[back]?.label || 'aplicativo'} não terminou. Toque de novo para tentar.`}
                </motion.p>
              )}
            </AnimatePresence>

            {/* progresso */}
            <div className="mt-7 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${ORANGE}, #FFB08C)` }}
                  initial={{ width: 0 }} animate={{ width: `${(done / Math.max(1, total)) * 100}%` }} transition={{ duration: still ? 0 : 0.9, delay: still ? 0 : 1.4 }} />
              </div>
              <span className="text-xs tabular-nums text-white/60">{done}/{total}</span>
            </div>

            <ul className="mt-5 space-y-3">
              {plan.map((n, i) => {
                const meta = NETWORKS[n.id];
                if (!meta) return null;
                return (
                  <motion.li key={n.id} initial={{ opacity: 0, y: still ? 0 : 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: still ? 0 : 0.5, delay: still ? 0 : 1.3 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    className="relative flex items-center gap-3 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-3.5">
                    {n.connected && <span aria-hidden className="pointer-events-none absolute inset-0 opacity-25" style={{ background: `radial-gradient(circle at 15% 50%, ${meta.glow}, transparent 60%)` }} />}
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg" style={{ background: meta.bg, boxShadow: `0 8px 24px -8px ${meta.glow}` }}>
                      <meta.Icon className="h-6 w-6" />
                    </span>
                    <div className="relative min-w-0 flex-1">
                      <p className="font-semibold">{meta.label}</p>
                      <p className="truncate text-xs text-white/55">{n.connected ? (n.account ? `@${String(n.account).replace(/^@/, '')}` : 'Conectado') : n.reconnect ? 'Precisa entrar de novo' : meta.help}</p>
                    </div>
                    <AnimatePresence mode="wait">
                      {n.connected ? (
                        <motion.span key="ok" initial={{ scale: still ? 1 : 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                          className="relative flex items-center gap-1 rounded-full bg-[#1F9D55]/25 px-3 py-1.5 text-xs font-semibold text-[#7BE0A6]">
                          <Check className="h-3.5 w-3.5" /> Conectado
                        </motion.span>
                      ) : (
                        <motion.button key="btn" type="button" disabled={!!busy} onClick={() => connect(n.id)} whileTap={still ? undefined : { scale: 0.96 }}
                          className="relative rounded-2xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: ORANGE, boxShadow: `0 10px 30px -10px ${ORANGE}` }}>
                          {busy === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : n.reconnect ? 'Entrar de novo' : 'Conectar'}
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </ul>

            {others.length > 0 && (
              <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: still ? 0 : 0.6, delay: still ? 0 : 1.5 + plan.length * 0.12 }} className="mt-9">
                <p className="text-sm font-semibold text-white/80">Outras redes que a Pulse gerencia</p>
                <p className="mt-0.5 text-xs text-white/50">Não estão no seu plano atual. Toque para saber como cuidamos de cada uma.</p>
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {others.map((n) => {
                    const meta = NETWORKS[n.id];
                    return (
                      <li key={n.id}>
                        <Link to={`${more}#${n.id}`} className="group flex flex-col items-center gap-1.5 rounded-2xl border border-white/5 bg-white/[0.02] px-2 py-3 text-center transition hover:border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F15A24]">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white opacity-40 grayscale transition group-hover:opacity-80 group-hover:grayscale-0" style={{ background: meta.bg }}>
                            <meta.Icon className="h-5 w-5" />
                          </span>
                          <span className="text-xs font-medium text-white/45 group-hover:text-white/80">{meta.label}</span>
                          <span className="flex items-center gap-0.5 text-[10px] text-white/30"><Lock className="h-2.5 w-2.5" /> fora do plano</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 rounded-3xl border border-[#F15A24]/30 bg-gradient-to-br from-[#F15A24]/15 to-transparent p-4">
                  <p className="text-sm font-semibold">Quer a Pulse cuidando de mais redes?</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/65">Cada rede tem uma linguagem e um público. Fale com a nossa equipe para ampliar o seu plano.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link to={more} className="flex items-center justify-center gap-1 rounded-2xl border border-white/20 px-3 py-2.5 text-sm font-semibold">Saiba mais <ArrowUpRight className="h-4 w-4" /></Link>
                    <a href={pulseWhatsapp(`Olá! Vim da página de conexão das redes de ${data.client.name} e quero saber como ampliar o plano para gerenciar mais redes sociais.`)} target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl px-2 py-2.5 text-[13px] font-bold" style={{ background: ORANGE }}><MessageCircle className="h-4 w-4 shrink-0" /> Falar com a equipe</a>
                  </div>
                </div>
              </motion.section>
            )}

            <AnimatePresence>
              {all && (
                <motion.div key="pronto" initial={{ opacity: 0, scale: still ? 1 : 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: still ? 0 : 0.5, delay: still ? 0 : 1.6 }}
                  className="relative mt-7 overflow-hidden rounded-3xl border border-[#1F9D55]/30 bg-[#1F9D55]/10 p-6 text-center">
                  {!still && Array.from({ length: 14 }).map((_, k) => (
                    <motion.span key={k} aria-hidden className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                      style={{ background: k % 2 ? ORANGE : '#7BE0A6' }}
                      initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos((k / 14) * Math.PI * 2) * 140, y: Math.sin((k / 14) * Math.PI * 2) * 70, opacity: 0 }}
                      transition={{ duration: 1.3, delay: 1.8, ease: 'easeOut' }} />
                  ))}
                  <ShieldCheck className="mx-auto h-8 w-8 text-[#7BE0A6]" />
                  <p className="mt-2 text-lg font-bold">Tudo conectado</p>
                  <p className="mt-1 text-sm text-white/70">A partir de agora a Pulse cuida das redes de {data.client.name}. Pode fechar esta página.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* por que é seguro (usuário, 03/11/2026: "que mostre segurança para ele e diga o porquê") */}
            <section className="mt-9 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-[#7BE0A6]" /> Por que é seguro</p>
              <ul className="mt-4 space-y-3.5">
                {[
                  { Icon: KeyRound, t: 'Sua senha fica com você', d: 'O login é feito na página oficial do Instagram, do Facebook ou da rede escolhida. A Pulse nunca vê nem guarda a sua senha.' },
                  { Icon: EyeOff, t: 'Só o necessário', d: data.kind === 'evento' ? 'A permissão serve para publicar os stories do evento. Não lemos as suas mensagens nem mexemos no seu perfil.' : 'A permissão serve para publicar e responder pela sua marca. Não mexemos nas configurações do seu perfil.' },
                  { Icon: Unplug, t: 'Você desconecta quando quiser', d: data.kind === 'evento' ? 'Terminou o evento? A gente desconecta, ou você mesmo tira o acesso nas configurações da rede.' : 'É só pedir para a nossa equipe ou tirar o acesso nas configurações da rede.' },
                  { Icon: Lock, t: 'Conexão protegida', d: 'Tudo passa por conexão criptografada (o cadeado do navegador), igual à do seu banco.' },
                ].map(({ Icon, t, d }) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]"><Icon className="h-4 w-4" style={{ color: '#FFB08C' }} /></span>
                    <div><p className="text-sm font-semibold">{t}</p><p className="text-xs leading-relaxed text-white/55">{d}</p></div>
                  </li>
                ))}
              </ul>
            </section>

            <p className="mt-10 text-center text-xs text-white/35">Agência Pulse · seus dados ficam protegidos e você pode desconectar quando quiser</p>
          </>
        )}
      </main>
    </div>
  );
}

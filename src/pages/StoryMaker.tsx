// Storymaker de evento, página pública (usuário, 03/11/2026: "uma página externa do sistema que eu possa compartilhar com
// outras pessoas, onde seja possível postar story em tempo real, rápido; otimizada, bonita, intuitiva e própria para
// mobile"). Quem tem o link tira a foto ou grava o vídeo (ou escolhe da galeria), vê como fica no story e posta com um
// toque. O servidor (lib/storymaker.mjs) põe o story na fila na hora; o robô ajusta a 9:16 sem cortar e publica nas
// contas do cliente. Embaixo, os stories do evento com a situação de cada um (enviando, no ar, erro).
// Acesso (usuário, 03/11/2026): equipe Pulse com o login do sistema, ou convidado cadastrado pelo link pessoal (?c=).
// Sem um dos dois, a página só mostra o evento e pede o acesso. A logo é a do evento ou a do cliente.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Camera, Check, Facebook, ImagePlus, Instagram, Loader2, Lock, RotateCcw, Send, UserRound, Video, X } from 'lucide-react';
import logo from '@/assets/pulse-logo-branco.png';

const API = 'https://agenciapulse.tech/api';
const ORANGE = '#F15A24';
const MAX_VIDEO_SEC = 60;
const MAX_MB = 500;

interface Story { id: string; author: string | null; media_url: string; created_at: string; status: 'enviando' | 'publicado' | 'erro' | 'cancelado'; error: string | null }
interface Data {
  title: string;
  client: { name: string; logo: string | null };
  networks: string[];
  expires_at: string;
  open: boolean;
  closed_reason: 'encerrado' | 'vencido' | null;
  /** quem está postando (null = sem acesso: nem login da Pulse nem convite) */
  who: { kind: 'equipe' | 'convidado'; name: string } | null;
  stories: Story[];
}
interface Picked { file: File; url: string; video: boolean; sec?: number }

const isVideoUrl = (u: string) => /\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(u);
/** login da Pulse neste aparelho (a página é do mesmo endereço do sistema) */
const teamToken = () => { try { return localStorage.getItem('pulse_jwt') || ''; } catch { return ''; } };
const authHeaders = (): Record<string, string> => { const t = teamToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

/** Envia com barra de progresso (fetch não informa o progresso do envio). */
function upload(token: string, code: string, file: File, onProgress: (p: number) => void): Promise<Story> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/public/storymaker/${encodeURIComponent(token)}/upload${code ? `?c=${encodeURIComponent(code)}` : ''}`);
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let body: { story?: Story; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* resposta vazia */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.story) resolve(body.story);
      else reject(new Error(body.error || (xhr.status === 413 ? 'Arquivo grande demais.' : 'Não deu para enviar. Tente de novo.')));
    };
    xhr.onerror = () => reject(new Error('Sem conexão. Confira a internet e tente de novo.'));
    xhr.send(form);
  });
}

function Status({ s }: { s: Story['status'] }) {
  if (s === 'publicado') return <span className="flex items-center gap-1 rounded-full bg-[#1F9D55] px-2 py-0.5 text-[10px] font-bold"><Check className="h-3 w-3" /> No ar</span>;
  if (s === 'erro') return <span className="flex items-center gap-1 rounded-full bg-[#C62828] px-2 py-0.5 text-[10px] font-bold"><AlertTriangle className="h-3 w-3" /> Erro</span>;
  if (s === 'cancelado') return <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">Cancelado</span>;
  return <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold backdrop-blur"><Loader2 className="h-3 w-3 animate-spin" /> Enviando</span>;
}

export default function StoryMaker() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const code = params.get('c') || '';
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [problem, setProblem] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const load = useCallback(() => fetch(`${API}/public/storymaker/${encodeURIComponent(token)}${code ? `?c=${encodeURIComponent(code)}` : ''}`, { headers: authHeaders() })
    .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || 'Link não encontrado'); setData(b); })
    .catch((e: Error) => setError(e.message)), [token, code]);
  useEffect(() => { document.title = 'Storymaker · Agência Pulse'; load(); }, [load]);

  // enquanto algum story está saindo, confere a cada 4 s
  const sending = !!data?.stories.some((s) => s.status === 'enviando');
  useEffect(() => {
    if (!sending) return undefined;
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [sending, load]);

  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url); }, [picked]);

  const choose = (file: File | undefined) => {
    setProblem(''); setDone(false);
    if (!file) return;
    if (!/^(image|video)\//.test(file.type)) { setProblem('Escolha uma foto ou um vídeo.'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setProblem(`Arquivo acima de ${MAX_MB} MB.`); return; }
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    if (!isVideo) { setPicked({ file, url, video: false }); return; }
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      if (v.duration > MAX_VIDEO_SEC + 0.5) { URL.revokeObjectURL(url); setProblem(`O vídeo tem ${Math.round(v.duration)} s. Story vai até ${MAX_VIDEO_SEC} s: grave um mais curto.`); return; }
      setPicked({ file, url, video: true, sec: v.duration });
    };
    v.onerror = () => setPicked({ file, url, video: true });
    v.src = url;
  };

  const post = async () => {
    if (!picked || progress !== null) return;
    setProgress(0); setProblem('');
    try {
      const story = await upload(token, code, picked.file, setProgress);
      setData((d) => (d ? { ...d, stories: [story, ...d.stories] } : d));
      setPicked(null); setDone(true);
      navigator.vibrate?.(30);
    } catch (e) { setProblem((e as Error).message); } finally { setProgress(null); }
  };

  const reset = () => { setPicked(null); setProblem(''); };

  const inputs = (
    <>
      <input ref={photo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={video} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={gallery} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );

  return (
    <div className="min-h-[100dvh] bg-[#0A0A0C] text-white" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.9rem,env(safe-area-inset-top))]">
        {/* topo: cliente + evento + ao vivo */}
        <header className="flex items-center gap-3">
          {data?.client.logo
            ? <img src={data.client.logo} alt={`Logo ${data.client.name}`} className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1" />
            : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold" style={{ background: ORANGE }}>{(data?.client.name || 'P').slice(0, 1)}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight">{data?.title || 'Storymaker'}</p>
            <p className="truncate text-xs text-white/55">{data?.client.name || 'Agência Pulse'}</p>
          </div>
          {data?.open && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#E53935]/15 px-2.5 py-1 text-[11px] font-bold text-[#FF8A80]">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF5252] opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF5252]" /></span>
              AO VIVO
            </span>
          )}
        </header>

        {!data && !error && <div className="flex flex-1 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" style={{ color: ORANGE }} /></div>}

        {error && !data && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-lg font-bold">{error}</p>
            <p className="mt-1 text-sm text-white/55">Peça o link certo para a equipe da Pulse.</p>
          </div>
        )}

        {data && !data.open && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-xl font-bold">{data.closed_reason === 'encerrado' ? 'Storymaker encerrado' : 'O horário deste storymaker acabou'}</p>
            <p className="mt-1 max-w-xs text-sm text-white/55">Obrigado por participar! Se ainda precisar postar, peça um link novo para a equipe da Pulse.</p>
          </div>
        )}

        {data?.open && !data.who && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5"><Lock className="h-6 w-6" style={{ color: ORANGE }} /></span>
            <p className="mt-4 text-xl font-bold">Acesso restrito</p>
            <p className="mt-1 max-w-xs text-sm text-white/60">Só a equipe da Pulse e os convidados cadastrados no evento postam por aqui.</p>
            <Link to={`/login?volta=${encodeURIComponent(`/story/${token}`)}`} className="mt-6 w-full max-w-xs rounded-2xl py-3.5 text-base font-bold" style={{ background: ORANGE }}>
              Entrar com o login da Pulse
            </Link>
            <p className="mt-4 max-w-xs text-xs text-white/45">É convidado? Abra o link pessoal que a equipe te mandou no WhatsApp.</p>
          </div>
        )}

        {data?.open && data.who && (
          <>
            {/* quem está postando (vai para o histórico do evento) */}
            <p className="mt-4 flex items-center gap-1.5 text-xs text-white/55">
              <UserRound className="h-3.5 w-3.5" /> Postando como <b className="text-white/85">{data.who?.name}</b>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold">{data.who?.kind === 'equipe' ? 'Equipe Pulse' : 'Convidado'}</span>
            </p>

            {/* palco 9:16 */}
            <div className="relative mx-auto mt-3 aspect-[9/16] w-full max-w-[min(100%,calc((100dvh-15rem)*0.5625))] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#141418]">
                {picked ? (
                  <div key="preview" className="absolute inset-0 duration-200 animate-in fade-in zoom-in-95 motion-reduce:animate-none">
                    {/* como o story fica: inteiro, sem cortar, com a própria imagem desfocada atrás */}
                    {picked.video ? (
                      <>
                        <video src={picked.url} muted playsInline autoPlay loop aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
                        <video src={picked.url} playsInline autoPlay loop controls={false} muted className="absolute inset-0 h-full w-full object-contain" />
                      </>
                    ) : (
                      <>
                        <img src={picked.url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
                        <img src={picked.url} alt="Prévia do story" className="absolute inset-0 h-full w-full object-contain" />
                      </>
                    )}
                    <button type="button" onClick={reset} disabled={progress !== null} aria-label="Descartar"
                      className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 backdrop-blur disabled:opacity-40"><X className="h-5 w-5" /></button>
                    {progress !== null && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%`, background: ORANGE }} />
                        </div>
                        <p className="mt-1.5 text-center text-xs font-semibold">{progress < 1 ? `Enviando… ${Math.round(progress * 100)}%` : 'Colocando no ar…'}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div key="pick" className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6 duration-200 animate-in fade-in motion-reduce:animate-none">
                    {done ? (
                      <div className="text-center duration-300 animate-in fade-in zoom-in-50 motion-reduce:animate-none">
                        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1F9D55]"><Check className="h-8 w-8" /></span>
                        <p className="mt-3 text-lg font-bold">Story enviado!</p>
                        <p className="text-sm text-white/55">Sai em instantes. Bora o próximo?</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-lg font-bold">Poste um story do evento</p>
                        <p className="mt-1 text-sm text-white/55">Tire a foto ou grave o vídeo. Ele vai direto para o story de {data.client.name}.</p>
                      </div>
                    )}
                    <div className="grid w-full max-w-[16rem] grid-cols-2 gap-3">
                      <button type="button" onClick={() => photo.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl text-sm font-bold shadow-xl active:scale-95" style={{ background: ORANGE, boxShadow: `0 16px 40px -16px ${ORANGE}` }}>
                        <Camera className="h-8 w-8" /> Foto
                      </button>
                      <button type="button" onClick={() => video.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl bg-white text-sm font-bold text-[#141418] shadow-xl active:scale-95">
                        <Video className="h-8 w-8" /> Vídeo
                      </button>
                    </div>
                    <button type="button" onClick={() => gallery.current?.click()} className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/80">
                      <ImagePlus className="h-4 w-4" /> Escolher da galeria
                    </button>
                  </div>
                )}
            </div>

            {problem && <p role="alert" className="mt-3 rounded-xl bg-[#C62828]/20 px-3 py-2 text-center text-sm text-[#FF8A80]">{problem}</p>}

            {picked && (
              <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                <button type="button" onClick={reset} disabled={progress !== null} className="flex items-center gap-1.5 rounded-2xl border border-white/15 px-4 py-3.5 text-sm font-semibold disabled:opacity-40">
                  <RotateCcw className="h-4 w-4" /> Trocar
                </button>
                <button type="button" onClick={post} disabled={progress !== null}
                  className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold disabled:opacity-70" style={{ background: ORANGE, boxShadow: `0 16px 40px -16px ${ORANGE}` }}>
                  {progress !== null ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  Postar story
                  <span className="flex items-center gap-0.5 opacity-80">
                    {data.networks.includes('instagram') && <Instagram className="h-4 w-4" />}
                    {data.networks.includes('facebook') && <Facebook className="h-4 w-4" />}
                  </span>
                </button>
              </div>
            )}
          </>
        )}

        {/* stories do evento */}
        {data?.who && data.stories.length > 0 && (
          <section className="mt-6">
            <p className="mb-2 text-sm font-semibold text-white/70">Stories do evento <span className="text-white/40">· {data.stories.length}</span></p>
            <ul className="grid grid-cols-3 gap-2">
              {data.stories.map((s) => (
                <li key={s.id} className="relative aspect-[9/16] overflow-hidden rounded-xl bg-white/5" title={s.error || undefined}>
                  {isVideoUrl(s.media_url)
                    ? <video src={`${s.media_url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    : <img src={s.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  <div className="absolute left-1.5 top-1.5"><Status s={s.status} /></div>
                  <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white/85">
                    {s.author ? `${s.author} · ` : ''}{ago(s.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-auto flex items-center justify-center gap-1.5 pt-6 text-[11px] text-white/35">
          <img src={logo} alt="" className="h-3 opacity-60" /> storymaker da Agência Pulse
        </footer>
      </div>
      {inputs}
    </div>
  );
}

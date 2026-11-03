// Prévia da postagem em cada rede (usuário, 03/11/2026: "quando clico para postar preciso que seja mais completo, que
// simule o Instagram e o Facebook e qualquer rede social que vá publicar na visualização da postagem, assim é possível
// entender como vai ficar antes de agendar"). Uma aba por rede marcada, num celular: Instagram (feed, carrossel, reels,
// story), Facebook (post, reels, story), TikTok, LinkedIn, YouTube Shorts e Google. A mídia aparece como vai ao ar: no
// feed, a proporção da imagem entre 4:5 e 1,91:1 (o resto com o fundo desfocado, como o lib/imageFit.mjs faz); story e
// reels em 9:16. A legenda corta onde a rede corta ("mais", "Ver mais").
import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark, ChevronLeft, ChevronRight, Clapperboard, Facebook, Globe2, Heart, Home, Instagram, Linkedin, Link2, MapPin, MessageCircle, MoreHorizontal,
  Music2, PlusSquare, Repeat2, Search, Send, Share2, ThumbsUp, Youtube,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PreviewFormat = 'feed' | 'carousel' | 'reels' | 'stories';
export interface PreviewAccount { platform: string; name: string; username?: string | null; picture?: string | null }

const IS_VIDEO = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;
const NET_META: Record<string, { label: string; Icon: typeof Instagram; color: string }> = {
  instagram: { label: 'Instagram', Icon: Instagram, color: '#DD2A7B' },
  facebook: { label: 'Facebook', Icon: Facebook, color: '#1877F2' },
  tiktok: { label: 'TikTok', Icon: Music2, color: '#FE2C55' },
  linkedin: { label: 'LinkedIn', Icon: Linkedin, color: '#0A66C2' },
  youtube: { label: 'YouTube', Icon: Youtube, color: '#FF0000' },
  google_business: { label: 'Google', Icon: MapPin, color: '#34A853' },
};
const clampRatio = (r: number) => Math.min(1.91, Math.max(0.8, r));

function Avatar({ src, name, size = 32, ring }: { src?: string | null; name: string; size?: number; ring?: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  // logo de cliente: inteira, com respiro (contain), e a inicial se o link não abrir
  const inner = src && !broken
    ? <img src={src} alt="" onError={() => setBroken(true)} className="h-full w-full rounded-full bg-white object-contain p-[2px]" />
    : <span className="flex h-full w-full items-center justify-center rounded-full bg-neutral-300 text-[11px] font-bold text-neutral-700">{name.slice(0, 1).toUpperCase()}</span>;
  return (
    <span className={cn('shrink-0 rounded-full', ring && 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] p-[2px]')} style={{ width: size, height: size }}>
      <span className={cn('block h-full w-full rounded-full', ring && 'bg-white p-[1.5px]')}>{inner}</span>
    </span>
  );
}

/** Uma mídia: vídeo ou imagem inteira (contain) sobre ela mesma desfocada, no quadro da proporção pedida. */
function Media({ url, cover = false }: { url?: string; cover?: boolean }) {
  if (!url) return <div className="absolute inset-0 grid place-items-center bg-neutral-200 px-4 text-center text-xs text-neutral-500">Escolha a mídia para ver a prévia</div>;
  if (IS_VIDEO.test(url)) return <video src={url} muted loop playsInline autoPlay className={cn('absolute inset-0 h-full w-full bg-black', cover ? 'object-cover' : 'object-contain')} />;
  return (
    <>
      <img src={url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl" />
      <img src={url} alt="Prévia" className={cn('absolute inset-0 h-full w-full', cover ? 'object-cover' : 'object-contain')} />
    </>
  );
}

/** Proporção do feed como a imagem vai ao ar (entre 4:5 e 1,91:1); vídeo de feed fica 4:5. */
function useFeedRatio(url?: string) {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    if (!url) { setRatio(1); return; }
    if (IS_VIDEO.test(url)) { setRatio(0.8); return; }
    const img = new Image();
    img.onload = () => setRatio(clampRatio(img.naturalWidth / Math.max(1, img.naturalHeight)));
    img.src = url;
  }, [url]);
  return ratio;
}

/** Texto cortado como a rede corta, com o "mais" no fim. */
function Clamp({ text, max, more, bold, className }: { text: string; max: number; more: string; bold?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const t = text.trim();
  if (!t && !bold) return null;
  const cut = !open && t.length > max;
  return (
    <p className={cn('whitespace-pre-line break-words', className)}>
      {bold && <b className="mr-1">{bold}</b>}
      {cut ? `${t.slice(0, max).trimEnd()}… ` : t}
      {cut && <button type="button" onClick={() => setOpen(true)} className="text-neutral-500">{more}</button>}
    </p>
  );
}

function Dots({ n, i, light }: { n: number; i: number; light?: boolean }) {
  if (n < 2) return null;
  return (
    <div className="flex justify-center gap-1">
      {Array.from({ length: n }).map((_, k) => <span key={k} className={cn('h-1.5 w-1.5 rounded-full', k === i ? (light ? 'bg-white' : 'bg-[#0095F6]') : light ? 'bg-white/50' : 'bg-neutral-300')} />)}
    </div>
  );
}

/** Carrossel com setas (mesma posição para todas as redes). */
function useSlides(media: string[]) {
  const [i, setI] = useState(0);
  useEffect(() => { if (i > media.length - 1) setI(0); }, [media.length, i]);
  const arrows = media.length > 1 && (
    <>
      {i > 0 && <button type="button" aria-label="Anterior" onClick={() => setI(i - 1)} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/85 p-1 text-neutral-800 shadow"><ChevronLeft size={14} /></button>}
      {i < media.length - 1 && <button type="button" aria-label="Próxima" onClick={() => setI(i + 1)} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/85 p-1 text-neutral-800 shadow"><ChevronRight size={14} /></button>}
      <span className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">{i + 1}/{media.length}</span>
    </>
  );
  return { i, url: media[i], arrows };
}

interface ViewProps {
  format: PreviewFormat;
  media: string[];
  caption: string;
  account: PreviewAccount;
  firstComment?: string;
  collaborators?: string;
  storyLink?: { url: string; text: string } | null;
}

/** Tela cheia 9:16 (story, reels, TikTok, Shorts): a mídia ocupa tudo e os botões ficam por cima. */
function FullScreen({ url, children, nav }: { url?: string; children: React.ReactNode; nav?: React.ReactNode }) {
  return (
    <div className="bg-black text-white">
      <div className="relative aspect-[9/16] w-full overflow-hidden">
        <Media url={url} cover />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
        <div className="absolute inset-0">{children}</div>
      </div>
      {nav}
    </div>
  );
}

/** Barra de baixo do app (o vídeo fica em cima dela, como no celular). */
const IgNav = () => (
  <div className="flex items-center justify-around border-t border-white/10 bg-black py-2 text-white">
    <Home size={18} /><Search size={18} /><PlusSquare size={18} /><Clapperboard size={18} /><span className="h-[18px] w-[18px] rounded-full bg-white/80" />
  </div>
);

/** Ações da lateral (curtir, comentar…), acima da legenda, como nos apps. */
function SideActions({ items }: { items: { Icon: typeof Heart; label?: string }[] }) {
  return (
    <div className="absolute bottom-[104px] right-2.5 flex flex-col items-center gap-3.5 text-[10px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
      {items.map(({ Icon, label }, i) => (
        <span key={i} className="flex flex-col items-center gap-0.5"><Icon size={23} strokeWidth={1.9} />{label}</span>
      ))}
    </div>
  );
}

/** Legenda de tela cheia: só a primeira linha, cortada, com o "mais" (como o Reels mostra). */
const firstLine = (t: string) => t.trim().split('\n').find((l) => l.trim()) || '';

function StoryView({ media, account, storyLink, accent }: ViewProps & { accent: 'instagram' | 'facebook' }) {
  return (
    <FullScreen url={media[0]}>
      <div className="flex gap-1 px-2 pt-2"><span className="h-0.5 flex-1 rounded bg-white" /></div>
      <div className="flex items-center gap-2 px-3 pt-2 text-xs">
        <Avatar src={account.picture} name={account.name} size={26} />
        <b>{accent === 'instagram' ? (account.username || account.name) : account.name}</b><span className="text-white/70">agora</span>
        <MoreHorizontal size={16} className="ml-auto" />
      </div>
      {storyLink?.url && (
        <div className="absolute inset-x-0 bottom-20 flex justify-center">
          <span className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0095F6] shadow"><Link2 size={13} /> {storyLink.text || 'Saiba mais'}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
        <span className="flex-1 rounded-full border border-white/60 px-3 py-1.5 text-[11px] text-white/80">{accent === 'instagram' ? 'Enviar mensagem' : 'Responder…'}</span>
        <Heart size={20} /><Send size={20} />
      </div>
    </FullScreen>
  );
}

function ReelsView({ media, caption, account, label, follow }: ViewProps & { label: string; follow: string }) {
  return (
    <FullScreen url={media[0]} nav={<IgNav />}>
      <p className="px-3 pt-3 text-[15px] font-bold tracking-tight">{label}</p>
      <SideActions items={[{ Icon: Heart }, { Icon: MessageCircle }, { Icon: Send }, { Icon: MoreHorizontal }]} />
      <div className="absolute inset-x-0 bottom-0 space-y-1.5 px-3 pb-3 pr-14 text-xs">
        <div className="flex items-center gap-2">
          <Avatar src={account.picture} name={account.name} size={26} />
          <b className="truncate">{account.username || account.name}</b>
          <span className="shrink-0 rounded-lg border border-white/70 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm">{follow}</span>
        </div>
        <p className="line-clamp-1 text-[12px] leading-snug text-white/95">
          {firstLine(caption)}{caption.trim().includes('\n') || firstLine(caption).length > 48 ? <span className="text-white/60"> … mais</span> : null}
        </p>
        <p className="flex w-fit items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] backdrop-blur-sm"><Music2 size={10} /> Áudio original</p>
      </div>
    </FullScreen>
  );
}

function InstagramView(p: ViewProps) {
  const { format, media, caption, account, firstComment, collaborators } = p;
  const s = useSlides(media);
  const ratio = useFeedRatio(media[0]);
  if (format === 'stories') return <StoryView {...p} accent="instagram" />;
  if (format === 'reels') return <ReelsView {...p} label="Reels" follow="Seguir" />;
  const handle = account.username || account.name;
  const collabs = (collaborators || '').split(/[,\s]+/).map((u) => u.replace(/^@/, '')).filter(Boolean);
  return (
    <div className="bg-white text-[13px] text-neutral-900">
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar src={account.picture} name={account.name} size={30} ring />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">{handle}{collabs.length ? <span className="font-normal"> e <b>{collabs.length === 1 ? collabs[0] : `${collabs.length} outros`}</b></span> : null}</p>
        </div>
        <MoreHorizontal size={18} className="ml-auto" />
      </div>
      <div className="relative w-full bg-neutral-100" style={{ aspectRatio: String(ratio) }}>
        <Media url={s.url} />
        {s.arrows}
      </div>
      <div className="flex items-center gap-3.5 px-3 pb-1 pt-2.5">
        <Heart size={22} /><MessageCircle size={22} /><Send size={22} />
        <div className="flex-1"><Dots n={media.length} i={s.i} /></div>
        <Bookmark size={22} />
      </div>
      <div className="space-y-1 px-3 pb-3">
        <Clamp text={caption} max={125} more="mais" bold={handle} />
        {firstComment?.trim() && <p className="text-neutral-500">Ver 1 comentário</p>}
        {firstComment?.trim() && <Clamp text={firstComment} max={80} more="mais" bold={handle} className="text-[12px]" />}
        <p className="text-[10px] uppercase text-neutral-400">Agora</p>
      </div>
    </div>
  );
}

function FacebookView(p: ViewProps) {
  const { format, media, caption, account } = p;
  const s = useSlides(media);
  const ratio = useFeedRatio(media[0]);
  if (format === 'stories') return <StoryView {...p} accent="facebook" />;
  if (format === 'reels') return <ReelsView {...p} label="Reels" follow="Seguir" />;
  const grid = format === 'carousel' && media.length > 1 && !media.some((u) => IS_VIDEO.test(u));
  return (
    <div className="bg-white text-[13px] text-neutral-900">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Avatar src={account.picture} name={account.name} size={36} />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">{account.name}</p>
          <p className="flex items-center gap-1 text-[11px] text-neutral-500">Agora · <Globe2 size={11} /></p>
        </div>
        <MoreHorizontal size={18} className="ml-auto text-neutral-500" />
      </div>
      <Clamp text={caption} max={250} more="Ver mais" className="px-3 pb-2" />
      {grid ? (
        <div className="grid grid-cols-2 gap-0.5">
          {media.slice(0, 4).map((u, k) => (
            <div key={u + k} className={cn('relative aspect-square bg-neutral-100', media.length === 3 && k === 0 && 'col-span-2 aspect-[2/1]')}>
              <img src={u} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {k === 3 && media.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-bold text-white">+{media.length - 4}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative w-full bg-neutral-100" style={{ aspectRatio: String(ratio) }}><Media url={s.url} />{s.arrows}</div>
      )}
      <div className="flex justify-around border-t border-neutral-200 py-2 text-[12px] font-semibold text-neutral-600">
        <span className="flex items-center gap-1"><ThumbsUp size={15} /> Curtir</span>
        <span className="flex items-center gap-1"><MessageCircle size={15} /> Comentar</span>
        <span className="flex items-center gap-1"><Share2 size={15} /> Compartilhar</span>
      </div>
    </div>
  );
}

function TikTokView({ media, caption, account }: ViewProps) {
  const s = useSlides(media);
  const photos = media.length > 1;
  return (
    <FullScreen url={s.url}>
      {s.arrows}
      <p className="pt-3 text-center text-[12px] font-semibold"><span className="text-white/60">Seguindo</span>  <span className="border-b-2 border-white pb-0.5">Para você</span></p>
      <div className="absolute bottom-[104px] right-2.5 flex flex-col items-center gap-3.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        <Avatar src={account.picture} name={account.name} size={34} />
        <Heart size={24} fill="white" /><MessageCircle size={24} /><Bookmark size={22} /><Share2 size={22} />
      </div>
      <div className="absolute inset-x-0 bottom-0 space-y-1 px-3 pb-3 pr-14 text-xs">
        <b>@{account.username || account.name}</b>
        <p className="line-clamp-2 text-[12px] leading-snug">{caption.trim()}</p>
        <p className="flex items-center gap-1 text-[11px]"><Music2 size={11} /> som original - {account.username || account.name}</p>
        {photos && <Dots n={media.length} i={s.i} light />}
      </div>
    </FullScreen>
  );
}

function LinkedInView({ media, caption, account, format }: ViewProps) {
  const s = useSlides(media);
  const ratio = useFeedRatio(media[0]);
  return (
    <div className="bg-white text-[13px] text-neutral-900">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-200">{account.picture ? <img src={account.picture} alt="" className="h-full w-full object-cover" /> : null}</span>
        <div className="min-w-0 leading-tight">
          <p className="truncate font-semibold">{account.name}</p>
          <p className="text-[11px] text-neutral-500">Seguidores</p>
          <p className="flex items-center gap-1 text-[11px] text-neutral-500">Agora · <Globe2 size={11} /></p>
        </div>
      </div>
      <Clamp text={caption} max={210} more="…mais" className="px-3 pb-2" />
      <div className="relative w-full bg-neutral-100" style={{ aspectRatio: String(format === 'reels' ? 0.8 : ratio) }}>
        <Media url={s.url} />{s.arrows}
      </div>
      <div className="flex justify-around border-t border-neutral-200 py-2 text-[11px] font-semibold text-neutral-600">
        <span className="flex items-center gap-1"><ThumbsUp size={14} /> Gostei</span>
        <span className="flex items-center gap-1"><MessageCircle size={14} /> Comentar</span>
        <span className="flex items-center gap-1"><Repeat2 size={14} /> Compartilhar</span>
        <span className="flex items-center gap-1"><Send size={14} /> Enviar</span>
      </div>
    </div>
  );
}

function YouTubeView({ media, caption, account }: ViewProps) {
  const video = media.find((u) => IS_VIDEO.test(u));
  if (!video) return <div className="grid aspect-[9/16] place-items-center bg-neutral-900 p-6 text-center text-xs text-white/70">O YouTube só publica vídeo. Esta publicação não vai para o YouTube.</div>;
  const title = caption.split('\n')[0].slice(0, 100);
  return (
    <FullScreen url={video}>
      <p className="px-3 pt-3 text-sm font-bold">Shorts</p>
      <SideActions items={[{ Icon: ThumbsUp, label: 'Gostei' }, { Icon: MessageCircle }, { Icon: Share2, label: 'Compartilhar' }]} />
      <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-3 pr-14 text-xs">
        <div className="flex items-center gap-2">
          <Avatar src={account.picture} name={account.name} size={24} />
          <b>@{account.username || account.name}</b>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-black">Inscrever-se</span>
        </div>
        <p className="line-clamp-2">{title || 'Título do Short'}</p>
      </div>
    </FullScreen>
  );
}

function GoogleView({ media, caption, account }: ViewProps) {
  const img = media.find((u) => !IS_VIDEO.test(u));
  return (
    <div className="bg-white p-3 text-[13px] text-neutral-900">
      <div className="flex items-center gap-2">
        <Avatar src={account.picture} name={account.name} size={32} />
        <div className="leading-tight"><p className="font-semibold">{account.name}</p><p className="text-[11px] text-neutral-500">Novidade · agora</p></div>
      </div>
      {img && <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100"><Media url={img} cover /></div>}
      <Clamp text={caption} max={300} more="Mais" className="mt-2" />
      <span className="mt-2 inline-block rounded-full border border-neutral-300 px-3 py-1 text-[12px] font-semibold text-[#1A73E8]">Saiba mais</span>
    </div>
  );
}

const VIEWS: Record<string, (p: ViewProps) => JSX.Element> = {
  instagram: InstagramView, facebook: FacebookView, tiktok: TikTokView, linkedin: LinkedInView, youtube: YouTubeView, google_business: GoogleView,
};

export interface NetworkPreviewProps {
  networks: string[];
  format: PreviewFormat;
  media: string[];
  captions: Partial<Record<string, string>>;
  accounts: PreviewAccount[];
  fallbackName: string;
  fallbackPicture?: string | null;
  firstComment?: string;
  collaborators?: string;
  storyLink?: { url: string; text: string } | null;
  active?: string;
  onActiveChange?: (network: string) => void;
  className?: string;
}

export default function NetworkPreview({
  networks, format, media, captions, accounts, fallbackName, fallbackPicture, firstComment, collaborators, storyLink, active, onActiveChange, className,
}: NetworkPreviewProps) {
  const list = networks.filter((n) => VIEWS[n]);
  const [own, setOwn] = useState(list[0] || 'instagram');
  const current = active && list.includes(active) ? active : list.includes(own) ? own : list[0];
  const pick = (n: string) => { setOwn(n); onActiveChange?.(n); };
  const account = useMemo<PreviewAccount>(() => {
    const a = accounts.find((x) => x.platform === current);
    return { platform: current, name: a?.name || fallbackName, username: a?.username || null, picture: a?.picture || fallbackPicture || null };
  }, [accounts, current, fallbackName, fallbackPicture]);
  if (!current) return null;
  const View = VIEWS[current];
  const caption = captions[current] ?? '';
  const story = format === 'stories' && !['instagram', 'facebook'].includes(current);

  return (
    <div className={cn('space-y-3', className)}>
      {list.length > 1 && (
        <div role="tablist" aria-label="Prévia por rede" className="flex flex-wrap justify-center gap-1">
          {list.map((n) => {
            const m = NET_META[n];
            return (
              <button key={n} type="button" role="tab" aria-selected={n === current} onClick={() => pick(n)}
                className={cn('flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition', n === current ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:text-foreground')}
                style={n === current ? { background: m.color } : undefined}>
                <m.Icon size={12} /> {m.label}
              </button>
            );
          })}
        </div>
      )}
      {/* celular */}
      <div className="mx-auto w-full max-w-[300px] rounded-[2.4rem] border-[7px] border-neutral-900 bg-neutral-900 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)]">
        <div className="relative overflow-hidden rounded-[1.7rem] bg-white">
          <div className="flex items-center justify-between bg-white px-5 pb-1 pt-2 text-[10px] font-semibold text-neutral-900">
            <span>9:41</span><span className="h-4 w-16 rounded-full bg-neutral-900" /><span>100%</span>
          </div>
          <div key={`${current}-${format}`} className="max-h-[600px] overflow-y-auto duration-300 animate-in fade-in zoom-in-[0.985] motion-reduce:animate-none">
            {story ? <div className="grid aspect-[9/16] place-items-center bg-neutral-900 p-6 text-center text-xs text-white/70">Story só sai no Instagram e no Facebook.</div>
              : <View format={format} media={media} caption={caption} account={account} firstComment={firstComment} collaborators={collaborators} storyLink={storyLink} />}
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Prévia de como fica no {NET_META[current].label}. Contagens e comentários são ilustrativos.</p>
    </div>
  );
}

// Avisos de formato antes de agendar (usuário, 02/11/2026: "não quero erro de publicação como imagem cortando, reels
// e story; precisa prevenir"). Mede as mídias no navegador e diz o que o servidor vai ajustar (lib/imageFit.mjs: a
// imagem inteira sobre fundo desfocado, sem cortar) e o que não tem conserto (vídeo de story acima de 60 s).
import { useEffect, useState } from 'react';
import { AlertTriangle, Wand2 } from 'lucide-react';

const FEED_MIN = 0.8;
const FEED_MAX = 1.91;
const STORY = 9 / 16;
const VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;
const JPEG_RE = /\.jpe?g(\?|#|$)/i;

type Dim = { w: number; h: number; video: boolean; sec?: number } | null;

function measure(url: string): Promise<Dim> {
  return new Promise((resolve) => {
    const done = (d: Dim) => resolve(d);
    const timer = window.setTimeout(() => done(null), 12_000);
    if (VIDEO_RE.test(url)) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { window.clearTimeout(timer); done({ w: v.videoWidth, h: v.videoHeight, video: true, sec: v.duration }); };
      v.onerror = () => { window.clearTimeout(timer); done(null); };
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => { window.clearTimeout(timer); done({ w: img.naturalWidth, h: img.naturalHeight, video: false }); };
      img.onerror = () => { window.clearTimeout(timer); done(null); };
      img.src = url;
    }
  });
}

const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.01;
const ratioName = (r: number) => (near(r, 1) ? 'quadrada' : near(r, 0.8) ? '4:5' : near(r, STORY) ? '9:16' : r > 1 ? 'deitada' : 'em pé');

/** Mensagens para as mídias do post (função pura, testável). */
export function mediaFitNotes(dims: Dim[], publishType: string): { fix: string[]; block: string[] } {
  const fix: string[] = [];
  const block: string[] = [];
  const story = publishType === 'stories';
  const firstImg = dims.find((d) => d && !d.video);
  const shared = publishType === 'carousel' && firstImg ? Math.min(FEED_MAX, Math.max(FEED_MIN, firstImg.w / firstImg.h)) : null;
  dims.forEach((d, i) => {
    if (!d || !d.w || !d.h) return;
    const n = dims.length > 1 ? `${i + 1}ª mídia` : 'A mídia';
    const r = d.w / d.h;
    if (d.video) {
      if ((story || publishType === 'reels') && !near(r, STORY)) fix.push(`${n} é ${ratioName(r)}: no ${story ? 'story' : 'reels'} vai aparecer com faixas. O ideal é vídeo 9:16.`);
      if (story && (d.sec ?? 0) > 60.5) block.push(`${n} tem ${Math.round(d.sec || 0)} s: story em vídeo vai até 60 s. Corte o vídeo ou poste como reels.`);
      if (publishType === 'reels' && (d.sec ?? 99) < 3) block.push(`${n} tem menos de 3 s: o Instagram não aceita reels tão curto.`);
      return;
    }
    const target = story ? STORY : shared ?? Math.min(FEED_MAX, Math.max(FEED_MIN, r));
    if (!near(r, target)) {
      fix.push(story
        ? `${n} é ${ratioName(r)}: vai para 9:16 inteira, com fundo desfocado (sem cortar).`
        : shared != null
          ? `${n} é ${ratioName(r)} e a 1ª é ${ratioName(shared)}: o Instagram cortaria; vai inteira na proporção da 1ª, com fundo desfocado.`
          : `${n} é ${ratioName(r)}: o Instagram não aceita essa proporção no feed; vai inteira em ${ratioName(target)}, com fundo desfocado.`);
    }
  });
  return { fix, block };
}

export default function MediaFitNotes({ urls, publishType, onBlock }: { urls: string[]; publishType: string; onBlock?: (blocked: boolean) => void }) {
  const [notes, setNotes] = useState<{ fix: string[]; block: string[] }>({ fix: [], block: [] });
  const key = `${publishType}|${urls.join('|')}`;
  useEffect(() => {
    let alive = true;
    const list = urls.filter((u) => /^https?:\/\//i.test(u));
    if (!list.length) { setNotes({ fix: [], block: [] }); onBlock?.(false); return undefined; }
    Promise.all(list.map(measure)).then((dims) => {
      if (!alive) return;
      const n = mediaFitNotes(dims, publishType);
      const pngs = list.filter((u) => !VIDEO_RE.test(u) && !JPEG_RE.test(u)).length;
      if (pngs) n.fix.push(`${pngs === 1 ? 'Uma imagem não é JPEG' : `${pngs} imagens não são JPEG`}: o sistema converte antes de postar.`);
      setNotes(n);
      onBlock?.(n.block.length > 0);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!notes.fix.length && !notes.block.length) return null;
  return (
    <div className="space-y-1.5 text-xs">
      {notes.block.map((m) => (
        <p key={m} className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {m}</p>
      ))}
      {notes.fix.map((m) => (
        <p key={m} className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-400"><Wand2 size={13} className="mt-0.5 shrink-0" /> {m}</p>
      ))}
    </div>
  );
}

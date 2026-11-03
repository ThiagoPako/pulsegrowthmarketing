// ─── Imagem no formato do Instagram antes de postar (usuário, 02/11/2026) ─────────────────────────────────────────
// "Não quero que tenha erro de publicação como imagem cortando, reels também e story; precisa prevenir isso."
// O vídeo já tem a versão Instagram (lib/instagramVideo.mjs: codec, tamanho, duração). Aqui, a imagem:
//   • feed: a Meta só aceita proporção entre 4:5 (0,8) e 1,91:1; fora disso a postagem falha ou sai cortada;
//   • carrossel: o Instagram corta todas as imagens pela proporção da 1ª; aqui todas ganham a mesma proporção;
//   • story: 9:16 (1080×1920); outra proporção sai com corte ou faixa;
//   • só JPEG: PNG, WebP, HEIC e GIF viram JPEG (transparência sobre branco).
// Nada é cortado: a imagem inteira fica no centro, sobre uma cópia dela mesma desfocada (como o "fundo desfocado"
// dos apps). O arquivo ajustado vai para <uploads>/postagem-ajustada/<hash>.jpg e só a URL enviada à rede muda (o
// banco continua com o original). Sem ffmpeg ou com erro, segue com o original (não trava a postagem).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveUploadFile, runProcess } from './webVideo.mjs';

export const FEED_MIN = 0.8; // 4:5
export const FEED_MAX = 1.91; // 1,91:1
export const STORY_RATIO = 9 / 16;
const TOLERANCE = 0.01; // 1 %: arredondamento de quem exportou a arte
const WIDTH = 1080;
const IMAGE_RE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)(\?|#|$)/i;
const JPEG_RE = /\.jpe?g(\?|#|$)/i;
const OUT_DIR = 'postagem-ajustada';

const clamp = (r, min, max) => Math.min(max, Math.max(min, r));
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
export const isImageUrl = (url) => IMAGE_RE.test(String(url || ''));

/** Tamanho final para uma proporção (largura 1080; paisagem também 1080 de largura). */
export function canvasFor(ratio) {
  return { w: WIDTH, h: even(WIDTH / ratio) };
}

/**
 * Plano de cada imagem do post (função pura). dims: [{ w, h, jpeg }] na ordem do post (null = não é imagem
 * ou não deu para medir: fica como está). Devolve [{ action: 'keep' | 'jpeg' | 'fit', w, h, ratio }].
 */
export function planImageFit(dims, publishType) {
  const story = publishType === 'stories';
  const first = dims.find(Boolean);
  // carrossel: todas na proporção da 1ª (dentro do que a Meta aceita); feed: cada uma na sua, dentro do limite
  const shared = publishType === 'carousel' && first ? clamp(first.w / first.h, FEED_MIN, FEED_MAX) : null;
  return dims.map((d) => {
    if (!d || !d.w || !d.h) return { action: 'keep' };
    const ratio = d.w / d.h;
    const target = story ? STORY_RATIO : shared ?? clamp(ratio, FEED_MIN, FEED_MAX);
    if (Math.abs(ratio - target) / target > TOLERANCE) return { action: 'fit', ratio: target, ...canvasFor(target) };
    if (!d.jpeg) return { action: 'jpeg', ratio, w: even(Math.min(d.w, 1440)), h: even(Math.min(d.w, 1440) / ratio) };
    return { action: 'keep' };
  });
}

/** Argumentos do ffmpeg: transparência sobre branco; "fit" põe a imagem inteira sobre ela mesma desfocada. */
export function buildFitArgs({ src, dest, plan, srcW, srcH }) {
  const { w, h } = plan;
  const flat = `color=c=white:s=${srcW}x${srcH}[w];[w][0:v]overlay=shortest=1,format=rgb24`;
  const graph = plan.action === 'fit'
    ? `${flat},split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=40:3,eq=brightness=-0.06[bg];`
      + `[b]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuvj420p`
    : `${flat},scale=${w}:${h},format=yuvj420p`;
  return ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', graph, '-frames:v', '1', '-q:v', '2', dest];
}

export const STORY_AUDIO_SEC = 15;

/**
 * Story de arte com trilha (usuário, 02/11/2026: "dá pra agendar o story, exemplo arte, com trilha?"): a imagem 9:16
 * vira um vídeo de 15 s com zoom bem leve, a música com entrada e saída suaves (fade) e o formato que a Meta pede
 * (H.264 high 4:2:0 30 qps, AAC 128k 48 kHz estéreo, moov no começo). Música mais curta: o resto fica em silêncio.
 */
export function buildStoryVideoArgs({ image, audio, dest, sec = STORY_AUDIO_SEC }) {
  const frames = sec * 30;
  const video = `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,`
    + `zoompan=z='min(1+0.05*on/${frames},1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,format=yuv420p[v]`;
  const sound = `[1:a]atrim=0:${sec},asetpts=PTS-STARTPTS,afade=t=in:d=0.3,afade=t=out:st=${sec - 1.5}:d=1.5,aresample=48000,apad[a]`;
  return ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', image, '-i', audio,
    '-filter_complex', `${video};${sound}`, '-map', '[v]', '-map', '[a]', '-t', String(sec),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', dest];
}

export function createImageFit({ uploadRoots, publicUploadsUrl = 'https://agenciapulse.tech/uploads', allowedOrigins, ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobe = process.env.FFPROBE_BIN || 'ffprobe', fetchImpl = fetch, logger = console } = {}) {
  const roots = () => (typeof uploadRoots === 'function' ? uploadRoots() : uploadRoots || []);
  const base = String(publicUploadsUrl).replace(/\/+$/, '');

  async function localCopy(url) {
    const found = resolveUploadFile(url, roots(), allowedOrigins ? { allowedOrigins } : {});
    if (found) return { file: found.localPath, temp: false };
    // fora das nossas pastas (Drive, CDN): baixa até 40 MB
    const r = await fetchImpl(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`download ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 40 * 1024 * 1024) throw new Error('imagem acima de 40 MB');
    const file = path.join(os.tmpdir(), `pulse-img-${crypto.randomBytes(6).toString('hex')}`);
    fs.writeFileSync(file, buf);
    return { file, temp: true };
  }

  async function probe(file) {
    const { out } = await runProcess(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name', '-of', 'json', file], { timeoutMs: 30_000 });
    const s = JSON.parse(out || '{}').streams?.[0];
    if (!s?.width || !s?.height) return null;
    return { w: Number(s.width), h: Number(s.height), jpeg: s.codec_name === 'mjpeg' };
  }

  /** Mídia do post → a mesma lista com as imagens ajustadas (o resto igual). Nunca lança: erro = original. */
  async function fitMedia(media, publishType) {
    const images = media.map((m) => (isImageUrl(m.url) ? m : null));
    if (!images.some(Boolean)) return { media, changed: [] };
    const copies = [];
    try {
      const dims = [];
      for (const m of images) {
        if (!m) { dims.push(null); copies.push(null); continue; }
        const c = await localCopy(m.url).catch((e) => { logger.warn?.('[imagem-instagram] sem cópia:', m.url, e.message); return null; });
        copies.push(c);
        const d = c ? await probe(c.file).catch(() => null) : null;
        dims.push(d ? { ...d, jpeg: d.jpeg && JPEG_RE.test(m.url) } : null);
      }
      const plans = planImageFit(dims, publishType);
      const root = roots()[0];
      const out = [...media];
      const changed = [];
      for (let i = 0; i < media.length; i += 1) {
        const plan = plans[i];
        if (!plan || plan.action === 'keep' || !copies[i] || !root) continue;
        const name = `${crypto.createHash('sha1').update(`${media[i].url}|${plan.action}|${plan.w}x${plan.h}`).digest('hex').slice(0, 20)}.jpg`;
        const dest = path.join(root, OUT_DIR, name);
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const tmp = `${dest}.tmp.jpg`;
          await runProcess(ffmpeg, buildFitArgs({ src: copies[i].file, dest: tmp, plan, srcW: dims[i].w, srcH: dims[i].h }), { timeoutMs: 60_000 });
          fs.renameSync(tmp, dest);
        }
        out[i] = { ...media[i], url: `${base}/${OUT_DIR}/${name}` };
        changed.push({ index: i, action: plan.action, from: `${dims[i].w}x${dims[i].h}`, to: `${plan.w}x${plan.h}` });
      }
      return { media: out, changed };
    } catch (error) {
      logger.warn?.('[imagem-instagram] ajuste falhou, segue o original:', error.message);
      return { media, changed: [] };
    } finally {
      for (const c of copies) if (c?.temp) fs.rm(c.file, { force: true }, () => {});
    }
  }

  /** Arte (já em 9:16) + trilha → URL do vídeo do story. Lança em erro (quem chama decide se posta sem música). */
  async function storyVideo(imageUrl, audioUrl) {
    const root = roots()[0];
    if (!root) throw new Error('sem pasta de uploads');
    const name = `${crypto.createHash('sha1').update(`story|${imageUrl}|${audioUrl}|${STORY_AUDIO_SEC}`).digest('hex').slice(0, 20)}.mp4`;
    const dest = path.join(root, OUT_DIR, name);
    if (!fs.existsSync(dest)) {
      const img = await localCopy(imageUrl);
      const snd = await localCopy(audioUrl).catch((e) => { if (img.temp) fs.rm(img.file, { force: true }, () => {}); throw e; });
      try {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = `${dest}.tmp.mp4`;
        await runProcess(ffmpeg, buildStoryVideoArgs({ image: img.file, audio: snd.file, dest: tmp }), { timeoutMs: 5 * 60_000 });
        fs.renameSync(tmp, dest);
      } finally {
        for (const c of [img, snd]) if (c.temp) fs.rm(c.file, { force: true }, () => {});
      }
    }
    return `${base}/${OUT_DIR}/${name}`;
  }

  return { fitMedia, storyVideo };
}

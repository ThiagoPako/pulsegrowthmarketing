// ═══════════════════════════════════════════════════════════════
// Versão Instagram dos vídeos (<nome>.ig.mp4 ao lado do original)
// ═══════════════════════════════════════════════════════════════
// A Meta pede (IG User Media, vídeo): MP4 ou MOV sem edit list e com o moov no começo; H.264 ou HEVC
// progressivo, GOP fechado, 4:2:0, de 23 a 60 fps, até 1920 px de largura e até 25 Mbps; áudio AAC de
// até 48 kHz, mono ou estéreo, 128 kbps. Reels: de 3 s a 15 min e até 300 MB. Story em vídeo: de 3 a
// 60 s e até 100 MB. Os originais chegam fora disso (H.264 de 33 a 44 Mbps; .mov HEVC sem faststart).
//
// - checkMetaSpec: função pura (saída do ffprobe + posição do moov e edit list) → cumpre ou não, e por quê;
// - original que cumpre é postado como está; o que não cumpre ganha a .ig.mp4 (H.264 high, CRF 18, até
//   20 Mbps e dentro do tamanho máximo, GOP fechado de ~2 s, AAC 128k 48 kHz estéreo, faststart, sem edit list);
// - só vídeos que vão ser postados: a tarefa periódica olha os posts agendados das próximas 48 h;
// - a conversão entra na mesma fila da versão leve (lib/webVideo.mjs): uma por vez, dentro da fila global
//   de ffmpeg, nice/ionice, espaço livre mínimo, temporário renomeado no fim;
// - na hora de publicar, chooseMedia troca só a URL enviada à Meta (o banco continua com o original).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  HDR_TO_SDR,
  QUEUE_PRIORITY,
  WEB_TMP_DIR,
  containingRoot,
  igVariantPath,
  igVariantUrl,
  isConvertibleVideoName,
  isHdr,
  resolveUploadFile,
  runProcess,
  toolUnavailable,
} from './webVideo.mjs';

const DEFAULT_ORIGINS = ['https://agenciapulse.tech'];

// ── Especificação da Meta ─────────────────────────────────────

export const META_VIDEO_SPEC = Object.freeze({
  extensions: ['.mp4', '.mov'],
  codecs: ['h264', 'hevc'],
  pixFmts: ['yuv420p', 'yuvj420p'],
  minFps: 23,
  maxFps: 60,
  maxWidth: 1920,
  maxVideoBps: 25_000_000,
  audioCodec: 'aac',
  audioMaxSampleRate: 48_000,
  audioMaxChannels: 2,
  audioBps: 128_000,
});

/** Duração e tamanho por tipo de post (carrossel: a Meta não fixa, vale só o formato). */
export const META_LIMITS = Object.freeze({
  reels: Object.freeze({ label: 'Reels', minSec: 3, maxSec: 15 * 60, maxText: '15 min', maxBytes: 300_000_000 }),
  stories: Object.freeze({ label: 'Story em vídeo', minSec: 3, maxSec: 60, maxText: '60 s', maxBytes: 100_000_000 }),
});

// folgas: arredondamento do contêiner (um vídeo de 60 s sai com 60,02 s) e do AAC (128k vira 129-130 kbps)
const MAX_DURATION_SLACK_SEC = 0.5;
const MIN_DURATION_SLACK_SEC = 0.1;
const FPS_SLACK = 0.01;
const AUDIO_BPS_SLACK = 1.05;

// Na conversão: até 20 Mbps (sempre abaixo dos 25) e, no máximo, 90% do tamanho permitido.
const IG_MAX_KBPS = 20_000;
const IG_MIN_KBPS = 1_000;
const AUDIO_KBPS = 128;

/** Tipo de post da Meta: vídeo no feed sai como reels; carrossel só confere o formato. */
export function metaKindFor(publishType) {
  const type = String(publishType || '').toLowerCase();
  if (type === 'stories' || type === 'story') return 'stories';
  if (type === 'carousel') return 'carousel';
  return 'reels';
}

const KIND_RANK = { carousel: 0, reels: 1, stories: 2 };

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function frameRate(value) {
  const [a, b] = String(value || '').split('/').map(Number);
  if (b === undefined) return num(a);
  return a > 0 && b > 0 ? a / b : 0;
}

function rotationOf(stream) {
  const side = Array.isArray(stream?.side_data_list) ? stream.side_data_list.find((d) => d && d.rotation !== undefined) : null;
  const value = Number(side?.rotation ?? stream?.tags?.rotate ?? 0);
  return Number.isFinite(value) ? ((Math.round(value) % 360) + 360) % 360 : 0;
}

const fmtMbps = (bps) => `${(bps / 1e6).toFixed(1)} Mbps`;
const fmtMb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

/** 70 → "1 min 10 s"; 2.4 → "2,4 s"; 900 → "15 min". */
export function fmtDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s < 59.5) {
    const r = Math.round(s * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1).replace('.', ',')} s`;
  }
  const total = Math.round(s);
  const min = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${min} min ${rest} s` : `${min} min`;
}

/** Saída do ffprobe (-show_format -show_streams, JSON) → o que a checagem precisa. */
export function parseMetaProbe(json, fileSize = 0) {
  const streams = Array.isArray(json?.streams) ? json.streams : [];
  const format = json?.format || {};
  const video = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const audio = streams.find((s) => s.codec_type === 'audio');
  const durationSec = num(format.duration) || num(video?.duration);
  const size = num(format.size) || num(fileSize);
  const totalBitRate = num(format.bit_rate) || (durationSec && size ? Math.round((size * 8) / durationSec) : 0);
  const audioBitRate = num(audio?.bit_rate);
  // sem a taxa da trilha de vídeo, a do arquivo menos o áudio (estimativa para cima)
  const videoBitRate = num(video?.bit_rate) || (totalBitRate ? Math.max(0, totalBitRate - audioBitRate) : 0);
  let videoInfo = null;
  if (video) {
    const width = num(video.width);
    const height = num(video.height);
    const rotation = rotationOf(video);
    const quarter = rotation % 180 === 90;
    videoInfo = {
      codec: String(video.codec_name || '').toLowerCase(),
      profile: String(video.profile || ''),
      pixFmt: String(video.pix_fmt || '').toLowerCase(),
      width,
      height,
      displayWidth: quarter ? height : width,
      displayHeight: quarter ? width : height,
      rotation,
      fps: frameRate(video.avg_frame_rate) || frameRate(video.r_frame_rate),
      fieldOrder: String(video.field_order || '').toLowerCase(),
      colorTransfer: String(video.color_transfer || '').toLowerCase(),
    };
  }
  return {
    durationSec,
    size,
    formatName: String(format.format_name || '').toLowerCase(),
    totalBitRate,
    videoBitRate,
    video: videoInfo,
    audio: audio ? {
      codec: String(audio.codec_name || '').toLowerCase(),
      sampleRate: num(audio.sample_rate),
      channels: num(audio.channels),
      bitRate: audioBitRate,
    } : null,
  };
}

/** Duração fora do que a Meta aceita para o tipo de post: a mensagem para a tela, ou null. */
export function metaDurationProblem(durationSec, publishType) {
  const limits = META_LIMITS[metaKindFor(publishType)];
  const seconds = Number(durationSec) || 0;
  if (!limits || seconds <= 0) return null;
  const label = String(publishType || '').toLowerCase() === 'feed' ? 'Vídeo no feed' : limits.label;
  if (seconds > limits.maxSec + MAX_DURATION_SLACK_SEC) {
    return `${label} aceita no máximo ${limits.maxText} (este vídeo tem ${fmtDuration(seconds)}).`;
  }
  if (seconds < limits.minSec - MIN_DURATION_SLACK_SEC) {
    return `${label} precisa ter pelo menos ${limits.minSec} s (este vídeo tem ${fmtDuration(seconds)}).`;
  }
  return null;
}

/**
 * Cumpre a especificação da Meta? Função pura.
 * - probe: saída do ffprobe em JSON (ou o resultado de parseMetaProbe);
 * - kind: 'reels' | 'stories' | 'carousel' (vídeo no feed é 'reels', ver metaKindFor);
 * - faststart: moov antes do mdat (true/false/null, de inspectMp4Container);
 * - editList: 'none' | 'trivial' | 'present' | null (de inspectMp4Container).
 * Devolve { ok, reason, problems: [{ code, message, fixable }], info }. fixable = a conversão resolve
 * (duração não tem conserto: o vídeo precisa ser cortado ou ir como outro tipo de post).
 */
export function checkMetaSpec(probe, { kind = 'reels', ext = '', faststart = null, editList = null, fileSize = 0 } = {}) {
  const info = probe && Array.isArray(probe.streams) ? parseMetaProbe(probe, fileSize) : (probe || parseMetaProbe({}, fileSize));
  const problems = [];
  const add = (code, message, fixable = true) => problems.push({ code, message, fixable });
  const spec = META_VIDEO_SPEC;
  const v = info.video;
  if (!v) {
    add('no_video', 'sem trilha de vídeo', false);
    return { ok: false, reason: problems[0].message, problems, info };
  }

  // contêiner
  const extension = String(ext || '').toLowerCase();
  if (!spec.extensions.includes(extension) || (info.formatName && !/(^|,)(mov|mp4)(,|$)/.test(info.formatName))) {
    add('container', `contêiner ${extension || info.formatName || 'desconhecido'} (a Meta aceita MP4 ou MOV)`);
  }
  if (faststart !== true) add('moov', faststart === false ? 'moov no fim do arquivo (sem faststart)' : 'moov não encontrado no começo do arquivo');
  if (editList === 'present') add('edit_list', 'tem edit list');

  // vídeo
  if (!spec.codecs.includes(v.codec)) add('codec', `vídeo ${v.codec || 'desconhecido'} (a Meta aceita H.264 ou HEVC)`);
  if (!spec.pixFmts.includes(v.pixFmt)) add('pix_fmt', `cor ${v.pixFmt || 'desconhecida'} (a Meta pede 4:2:0 de 8 bits)`);
  if (['tt', 'bb', 'tb', 'bt'].includes(v.fieldOrder)) add('interlaced', 'vídeo entrelaçado (a Meta pede progressivo)');
  if (!v.fps) add('fps', 'fps desconhecido');
  else if (v.fps < spec.minFps - FPS_SLACK || v.fps > spec.maxFps + FPS_SLACK) {
    add('fps', `${Math.round(v.fps * 100) / 100} fps (a Meta aceita de ${spec.minFps} a ${spec.maxFps})`);
  }
  const width = Math.max(v.width || 0, v.displayWidth || 0);
  if (width > spec.maxWidth) add('width', `${width} px de largura (máximo ${spec.maxWidth})`);
  if (!info.videoBitRate) add('bitrate', 'taxa de vídeo desconhecida');
  else if (info.videoBitRate > spec.maxVideoBps) add('bitrate', `vídeo de ${fmtMbps(info.videoBitRate)} (máximo 25 Mbps)`);

  // áudio (vídeo sem som também vale)
  const a = info.audio;
  if (a) {
    if (a.codec !== spec.audioCodec) add('audio_codec', `áudio ${a.codec || 'desconhecido'} (a Meta pede AAC)`);
    if (a.sampleRate > spec.audioMaxSampleRate) add('audio_rate', `áudio de ${a.sampleRate / 1000} kHz (máximo 48 kHz)`);
    if (a.channels > spec.audioMaxChannels) add('audio_channels', `áudio com ${a.channels} canais (a Meta pede mono ou estéreo)`);
    if (a.bitRate > spec.audioBps * AUDIO_BPS_SLACK) add('audio_bitrate', `áudio de ${Math.round(a.bitRate / 1000)} kbps (a Meta pede 128 kbps)`);
  }

  // duração e tamanho do tipo de post
  const limits = META_LIMITS[kind];
  if (limits) {
    const duration = metaDurationProblem(info.durationSec, kind);
    if (duration) add('duration', duration, false);
    if (info.size > limits.maxBytes) add('size', `${fmtMb(info.size)} (máximo ${limits.maxBytes / 1e6} MB para ${limits.label.toLowerCase()})`);
  }

  const ok = problems.length === 0;
  return { ok, reason: ok ? 'cumpre a especificação da Meta' : problems.map((p) => p.message).join('; '), problems, info };
}

// O que só troca o contêiner/áudio (copia o vídeo, sem gastar CPU)
const REMUX_CODES = new Set(['container', 'moov', 'edit_list', 'audio_codec', 'audio_rate', 'audio_channels', 'audio_bitrate']);

/**
 * Converter ou não:
 * - none: o original cumpre (é ele que vai para a Meta);
 * - skip: sem trilha de vídeo, ou duração fora do limite (a conversão não resolve);
 * - remux: só contêiner, moov, edit list ou áudio (copia o vídeo);
 * - transcode: taxa, codec, cor, fps, largura, tamanho...
 */
export function decideIgVariant(check) {
  if (!check?.info?.video) return { action: 'skip', reason: 'sem trilha de vídeo' };
  if (check.ok) return { action: 'none', reason: check.reason };
  const unfixable = check.problems.filter((p) => !p.fixable);
  if (unfixable.length) return { action: 'skip', reason: unfixable.map((p) => p.message).join('; ') };
  const audioOk = !check.problems.some((p) => p.code.startsWith('audio_'));
  const remux = check.problems.every((p) => REMUX_CODES.has(p.code));
  return { action: remux ? 'remux' : 'transcode', reason: check.reason, audioOk };
}

/**
 * Teto de taxa da conversão: 20 Mbps, ou menos quando o tamanho máximo exige (até 60 s cabe num story
 * de 100 MB; acima disso, num reels de 300 MB). maxrate/bufsize no formato do ffmpeg.
 */
export function igBitrateCap(durationSec) {
  const seconds = Number(durationSec) || 0;
  const storySized = seconds > 0 && seconds <= META_LIMITS.stories.maxSec + MAX_DURATION_SLACK_SEC;
  const budgetBytes = storySized ? META_LIMITS.stories.maxBytes : META_LIMITS.reels.maxBytes;
  let kbps = IG_MAX_KBPS;
  if (seconds > 0) {
    const fit = Math.floor((budgetBytes * 8 * 0.9) / seconds / 1000) - AUDIO_KBPS - 8;
    kbps = Math.max(IG_MIN_KBPS, Math.min(IG_MAX_KBPS, fit));
  }
  const fmt = (k) => (k % 1000 === 0 ? `${k / 1000}M` : `${k}k`);
  return { kbps, maxrate: fmt(kbps), bufsize: fmt(kbps * 2), budgetBytes };
}

// Lado maior até 1920, mantendo a proporção e com medidas pares (yuv420p exige):
// 1080x1920 fica igual, 2160x3840 vira 1080x1920, 3840x2160 vira 1920x1080.
export const IG_SCALE_FILTER = "scale=w='if(gte(iw,ih),min(1920,trunc(iw/2)*2),-2)':h='if(gte(iw,ih),-2,min(1920,trunc(ih/2)*2))'";
const AUDIO_ARGS = ['-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'];
export const IG_PRESETS = new Set(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow']);

/** Argumentos do ffmpeg da .ig.mp4 (sem o nice/ionice). info: parseMetaProbe do original. */
export function buildIgFfmpegArgs({ src, dest, action, threads = 1, info = null, hasZscale = false, preset = 'veryfast', audioOk = false }) {
  const t = String(Math.max(1, Number(threads) || 1));
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-filter_threads', t, '-threads', t, '-i', src,
    '-map', '0:v:0', '-map', '0:a:0?', '-map_chapters', '-1'];
  if (action === 'remux') {
    args.push('-c:v', 'copy');
    if (info?.video?.codec === 'hevc') args.push('-tag:v', 'hvc1');
    else if (info?.video?.codec === 'h264') args.push('-tag:v', 'avc1');
    if (info?.audio && audioOk) args.push('-c:a', 'copy');
    else args.push(...AUDIO_ARGS);
  } else {
    const fps = Number(info?.video?.fps) || 0;
    const fpsOk = fps >= META_VIDEO_SPEC.minFps - FPS_SLACK && fps <= META_VIDEO_SPEC.maxFps + FPS_SLACK;
    const outFps = fpsOk ? fps : 30;
    const filters = [];
    if (!fpsOk) filters.push('fps=30');
    if (hasZscale && isHdr(info?.video)) filters.push(HDR_TO_SDR);
    filters.push(IG_SCALE_FILTER, 'setsar=1', 'format=yuv420p');
    const cap = igBitrateCap(info?.durationSec);
    args.push('-vf', filters.join(','),
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', IG_PRESETS.has(preset) ? preset : 'veryfast', '-crf', '18',
      '-maxrate', cap.maxrate, '-bufsize', cap.bufsize, '-pix_fmt', 'yuv420p',
      // GOP fechado de ~2 s
      '-g', String(Math.max(2, Math.round(outFps * 2))), '-flags', '+cgop',
      '-threads', t, ...AUDIO_ARGS);
  }
  args.push('-movflags', '+faststart', '-use_editlist', '0', '-f', 'mp4', '-y', dest);
  return args;
}

// ── Contêiner: posição do moov e edit lists ───────────────────

function* childBoxes(buf, start, end) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      size = Number(buf.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return;
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

function trivialEditList(buf, start, end) {
  if (end - start < 8) return false;
  const version = buf[start];
  const count = buf.readUInt32BE(start + 4);
  if (count !== 1) return false;
  const entry = start + 8;
  if (version === 1) {
    if (entry + 20 > end) return false;
    return buf.readBigInt64BE(entry + 8) === 0n && buf.readInt16BE(entry + 16) === 1;
  }
  if (entry + 12 > end) return false;
  return buf.readInt32BE(entry + 4) === 0 && buf.readInt16BE(entry + 8) === 1;
}

/** 'none' (sem edts/elst), 'trivial' (uma entrada que começa em 0 com velocidade 1) ou 'present'. */
export function editListKind(moovPayload) {
  let found = false;
  let trivial = true;
  for (const trak of childBoxes(moovPayload, 0, moovPayload.length)) {
    if (trak.type !== 'trak') continue;
    for (const edts of childBoxes(moovPayload, trak.start, trak.end)) {
      if (edts.type !== 'edts') continue;
      for (const elst of childBoxes(moovPayload, edts.start, edts.end)) {
        if (elst.type !== 'elst') continue;
        found = true;
        if (!trivialEditList(moovPayload, elst.start, elst.end)) trivial = false;
      }
    }
  }
  if (!found) return 'none';
  return trivial ? 'trivial' : 'present';
}

/**
 * MP4/MOV: { faststart: moov antes do mdat (true/false/null), editList: 'none'|'trivial'|'present'|null }.
 * Lê só os cabeçalhos das caixas do topo e o moov (até 64 MB).
 */
export function inspectMp4Container(filePath) {
  const result = { faststart: null, editList: null };
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = fs.fstatSync(fd).size;
    const header = Buffer.alloc(16);
    let offset = 0;
    let sawMdat = false;
    for (let i = 0; i < 512 && offset + 8 <= size; i++) {
      const read = fs.readSync(fd, header, 0, 16, offset);
      if (read < 8) break;
      let boxSize = header.readUInt32BE(0);
      let headerSize = 8;
      const type = header.toString('latin1', 4, 8);
      if (boxSize === 1) {
        if (read < 16) break;
        boxSize = Number(header.readBigUInt64BE(8));
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = size - offset;
      }
      if (boxSize < headerSize) break;
      if (type === 'mdat') sawMdat = true;
      if (type === 'moov') {
        result.faststart = !sawMdat;
        const payload = boxSize - headerSize;
        if (payload > 0 && payload <= 64 * 1024 * 1024 && offset + boxSize <= size) {
          const buf = Buffer.alloc(payload);
          fs.readSync(fd, buf, 0, payload, offset + headerSize);
          result.editList = editListKind(buf);
        }
        return result;
      }
      offset += boxSize;
    }
    if (sawMdat) result.faststart = false;
    return result;
  } catch {
    return result;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

// ── Escolha da URL na hora de publicar (pura) ─────────────────

/**
 * entries: [{ url, status, igUrl?, check? }] com status:
 * 'ready' (.ig.mp4 pronta), 'original' (cumpre), 'pending' (na fila ou convertendo), 'failed' (conversão
 * falhou), 'disabled', 'unfixable' (duração), 'unknown' (sem ffprobe) ou 'external' (fora de /uploads).
 * Com vídeo pendente e menos de maxWaitMs de atraso: espera. Depois disso vai o original, com o motivo.
 */
export function planPostMedia(entries, { delayMs = 0, maxWaitMs = 30 * 60_000 } = {}) {
  const pending = entries.filter((e) => e.status === 'pending');
  if (pending.length && delayMs < maxWaitMs) {
    return { wait: true, urls: entries.map((e) => e.url), changed: false, fallback: null, pending: pending.map((e) => e.relative || e.url) };
  }
  const urls = entries.map((e) => (e.status === 'ready' && e.igUrl ? e.igUrl : e.url));
  const notReady = entries.filter((e) => ['pending', 'failed', 'disabled'].includes(e.status));
  let fallback = null;
  if (notReady.length) {
    const first = notReady[0];
    const why = first.check?.reason ? `: ${first.check.reason}` : '';
    fallback = first.status === 'pending'
      ? `O vídeo não ficou pronto no formato do Instagram a tempo e foi enviado o original${why}.`
      : `Não deu para ajustar o vídeo ao formato do Instagram e foi enviado o original${why}.`;
  }
  return { wait: false, urls, changed: urls.some((u, i) => u !== entries[i].url), fallback, pending: [] };
}

/** As mesmas mídias que o robô de postagem usa: media_items (carrossel) ou media_url. */
export function postMediaUrls(post) {
  let items = post?.media_items;
  if (typeof items === 'string' && items) {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  const list = (Array.isArray(items) ? items : [])
    .map((i) => (typeof i === 'string' ? i : i?.url))
    .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
  if (list.length) return list;
  return post?.media_url ? [post.media_url] : [];
}

/** A .ig.mp4 pronta (não mais velha que o original), ou null. */
function readyVariantPath(localPath) {
  const dest = igVariantPath(localPath);
  if (!dest) return null;
  try {
    const out = fs.statSync(dest);
    const src = fs.statSync(localPath);
    if (out.isFile() && out.size > 0 && out.mtimeMs >= src.mtimeMs - 1000) return dest;
  } catch {}
  return null;
}

/**
 * URL para postar (lembrete de story, "baixar para postar"...): a da .ig.mp4 quando ela existe;
 * senão o original. Só olha o disco; não põe nada na fila.
 */
export function instagramUrlFor(url, { roots = [], allowedOrigins = DEFAULT_ORIGINS } = {}) {
  const original = String(url || '').trim();
  const resolved = resolveUploadFile(original, typeof roots === 'function' ? roots() : roots, { allowedOrigins });
  if (!resolved || !isConvertibleVideoName(resolved.localPath)) return original;
  if (!readyVariantPath(resolved.localPath)) return original;
  return igVariantUrl(original) || original;
}

// ── Instância (fila, tarefa periódica, robô) ──────────────────

function readSettings(env, base) {
  const n = (value, fallback) => {
    const parsed = Number(value);
    return value !== undefined && value !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    disabled: env.IG_VIDEO_DISABLED === '1' || env.IG_VIDEO_DISABLED === 'true',
    preset: IG_PRESETS.has(env.IG_VIDEO_PRESET) ? env.IG_VIDEO_PRESET : 'veryfast',
    horizonHours: n(env.IG_VIDEO_HORIZON_HOURS, 48),
    soonHours: n(env.IG_VIDEO_SOON_HOURS, 3),
    scanDelayMs: n(env.IG_VIDEO_SCAN_DELAY_MS, 2 * 60_000),
    scanIntervalMs: n(env.IG_VIDEO_SCAN_INTERVAL_MS, 10 * 60_000),
    scanSoonMs: n(env.IG_VIDEO_SCAN_SOON_MS, 5_000),
    maxWaitMs: n(env.IG_VIDEO_MAX_WAIT_MS, 30 * 60_000),
    recheckMs: n(env.IG_VIDEO_RECHECK_MS, 30_000),
    scheduleProbeTimeoutMs: n(env.IG_VIDEO_SCHEDULE_PROBE_MS, 15_000),
    ffmpeg: base.ffmpeg || 'ffmpeg',
    ffprobe: base.ffprobe || 'ffprobe',
    threads: base.threads || 1,
    timeoutMs: base.timeoutMs || 0,
    stateDir: base.stateDir,
    skipFolders: base.skipFolders || ['training-videos'],
  };
}

/**
 * deps:
 * - pool: Postgres (posts agendados);
 * - webVideo: instância de createWebVideo (fila, fila global de ffmpeg, nice/ionice, disco);
 * - allowedOrigins: origens aceitas em URLs completas.
 */
export function createInstagramVideo({ pool, webVideo, logger = console, env = process.env, allowedOrigins = DEFAULT_ORIGINS } = {}) {
  const infra = webVideo.infra;
  const settings = readSettings(env, infra.settings || {});
  const roots = () => infra.roots().filter(Boolean);
  const analyses = new Map(); // caminho|tamanho|data → ffprobe + contêiner
  const wantKind = new Map(); // caminho → tipo de post mais exigente que pediu a conversão
  const loggedCompliant = new Set();
  const deferred = new Map(); // post adiado → quando olhar de novo
  const failuresFile = settings.stateDir ? path.join(settings.stateDir, 'falhas-instagram.json') : null;
  const failed = loadFailures();
  let scanning = false;
  let rescan = false;
  let scanSoonTimer = null;

  const log = (msg) => logger.log(`[video-instagram] ${msg}`);
  const warn = (msg) => logger.warn(`[video-instagram] ${msg}`);

  function loadFailures() {
    if (!failuresFile) return new Map();
    try {
      const data = JSON.parse(fs.readFileSync(failuresFile, 'utf8'));
      return new Map(Object.entries(data || {}).filter(([, v]) => !/spawn \S+ (ENOENT|EACCES)/.test(String(v?.error || ''))));
    } catch {
      return new Map();
    }
  }

  function markFailed(key, relative, error) {
    const message = String(error?.message || error).slice(0, 300);
    failed.set(key, { at: new Date().toISOString(), file: relative, error: message });
    if (failuresFile) {
      try {
        fs.mkdirSync(settings.stateDir, { recursive: true });
        fs.writeFileSync(failuresFile, JSON.stringify(Object.fromEntries([...failed.entries()].slice(-2000))));
      } catch (err) {
        warn(`não gravou a lista de falhas: ${err.message}`);
      }
    }
    warn(`falhou, não tenta de novo: ${relative}: ${message}`);
  }

  /** Vídeo original dentro de uma raiz de uploads (nunca .web.mp4/.ig.mp4, pasta oculta ou treinamento). */
  function locate(filePath) {
    const found = containingRoot(filePath, roots());
    if (!found || !isConvertibleVideoName(found.localPath)) return null;
    const segments = found.relative.split('/');
    if (segments.some((seg) => seg.startsWith('.'))) return null;
    if (settings.skipFolders.includes(segments[0].toLowerCase())) return null;
    return found;
  }

  function localVideoFor(url) {
    const resolved = resolveUploadFile(url, roots(), { allowedOrigins });
    return resolved ? locate(resolved.localPath) : null;
  }

  async function probeRaw(file, timeoutMs) {
    const { out } = await runProcess(settings.ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs });
    return JSON.parse(out || '{}');
  }

  /** ffprobe + moov/edit list do arquivo, com cache por caminho|tamanho|data. */
  async function analyze(localPath, { timeoutMs = 60_000 } = {}) {
    const st = fs.statSync(localPath);
    const key = `${localPath}|${st.size}|${Math.round(st.mtimeMs)}`;
    const cached = analyses.get(key);
    if (cached) return cached;
    const raw = await probeRaw(localPath, timeoutMs);
    const ext = path.extname(localPath).toLowerCase();
    const container = ['.mp4', '.mov', '.m4v'].includes(ext) ? inspectMp4Container(localPath) : { faststart: null, editList: null };
    const analysis = { key, raw, ext, size: st.size, faststart: container.faststart, editList: container.editList, info: parseMetaProbe(raw, st.size) };
    analyses.set(key, analysis);
    if (analyses.size > 500) analyses.delete(analyses.keys().next().value);
    return analysis;
  }

  const checkOf = (a, kind) => checkMetaSpec(a.raw, { kind, ext: a.ext, faststart: a.faststart, editList: a.editList, fileSize: a.size });

  /**
   * Situação de uma mídia para um tipo de post; põe a conversão na fila quando precisa.
   * status: 'external' | 'ready' | 'original' | 'unfixable' | 'unknown' | 'failed' | 'disabled' | 'pending'.
   */
  async function prepare(url, kind, { priority = QUEUE_PRIORITY.instagram, reason = 'instagram' } = {}) {
    const found = localVideoFor(url);
    if (!found) return { url, status: 'external' };
    const { localPath, relative } = found;
    if (readyVariantPath(localPath)) return { url, status: 'ready', relative };
    let analysis;
    try {
      analysis = await analyze(localPath);
    } catch (error) {
      warn(`ffprobe não leu ${relative}: ${error?.message || error}`);
      return { url, status: 'unknown', relative };
    }
    const check = checkOf(analysis, kind);
    const decision = decideIgVariant(check);
    if (decision.action === 'none') {
      if (!loggedCompliant.has(analysis.key)) {
        loggedCompliant.add(analysis.key);
        log(`original cumpre a especificação (${kind}): ${relative}`);
      }
      return { url, status: 'original', relative, check };
    }
    if (decision.action === 'skip') return { url, status: 'unfixable', relative, check };
    if (failed.has(analysis.key)) return { url, status: 'failed', relative, check };
    if (settings.disabled) return { url, status: 'disabled', relative, check };
    const wanted = wantKind.get(localPath);
    if (!wanted || KIND_RANK[kind] > KIND_RANK[wanted]) wantKind.set(localPath, kind);
    const state = webVideo.enqueueTask({ ...found, key: `ig:${localPath}`, priority, reason, run: runConversion });
    if (state === 'queued') log(`na fila: ${relative} (${reason === 'urgent' ? 'post na hora de sair' : 'post agendado'}; ${check.reason})`);
    return { url, status: 'pending', relative, check, queue: state };
  }

  function tmpPathFor(root, localPath) {
    const hash = crypto.createHash('sha1').update(`ig|${localPath}`).digest('hex').slice(0, 16);
    return path.join(root, WEB_TMP_DIR, `${hash}.ig.mp4`);
  }

  /** Confere a saída com a mesma checagem (e a mesma duração do original). */
  async function verifyOutput(tmp, source, kind) {
    const st = fs.statSync(tmp);
    const raw = await probeRaw(tmp, 60_000);
    const container = inspectMp4Container(tmp);
    const check = checkMetaSpec(raw, { kind, ext: '.mp4', faststart: container.faststart, editList: container.editList, fileSize: st.size });
    if (!check.ok) throw new Error(`saída fora da especificação: ${check.reason}`);
    const expected = source.info.durationSec || 0;
    const tolerance = Math.max(0.5, expected * 0.02);
    if (expected && Math.abs((check.info.durationSec || 0) - expected) > tolerance) {
      throw new Error(`duração diferente (${(check.info.durationSec || 0).toFixed(1)} s, original ${expected.toFixed(1)} s)`);
    }
    return { info: check.info, size: st.size };
  }

  async function convert(action, decision, { localPath, relative, tmp, analysis, kind }) {
    const args = buildIgFfmpegArgs({
      src: localPath, dest: tmp, action, threads: settings.threads, info: analysis.info, preset: settings.preset,
      audioOk: decision.audioOk, hasZscale: action === 'transcode' && isHdr(analysis.info.video) ? await infra.hasZscale() : false,
    });
    const timeoutMs = settings.timeoutMs
      || Math.min(60 * 60_000, Math.max(10 * 60_000, Math.round((analysis.info.durationSec || 60) * 20_000)));
    const [cmd, cmdArgs] = infra.lowPriority(settings.ffmpeg, args);
    log(`convertendo: ${relative} (${action === 'remux' ? 'sem recodificar; ' : ''}${decision.reason})`);
    await infra.runSlot(() => runProcess(cmd, cmdArgs, { timeoutMs }));
    return verifyOutput(tmp, analysis, kind);
  }

  /** Item da fila (lib/webVideo.mjs). Devolve true quando o ffmpeg rodou (para a pausa entre conversões). */
  async function runConversion(item) {
    const { localPath, relative, root } = item;
    let stat;
    try {
      stat = fs.statSync(localPath);
    } catch {
      return false; // apagado enquanto esperava
    }
    if (readyVariantPath(localPath)) return false;
    const dest = igVariantPath(localPath);
    const kind = wantKind.get(localPath) || 'reels';
    let analysis;
    try {
      analysis = await analyze(localPath);
    } catch (error) {
      if (toolUnavailable(error)) warn(`ffprobe indisponível (${error.message}): ${relative} fica para depois`);
      else markFailed(`${localPath}|${stat.size}|${Math.round(stat.mtimeMs)}`, relative, new Error(`ffprobe: ${error.message}`));
      return false;
    }
    if (failed.has(analysis.key)) return false;
    const decision = decideIgVariant(checkOf(analysis, kind));
    if (decision.action === 'none' || decision.action === 'skip') {
      wantKind.delete(localPath);
      log(`sem conversão: ${relative} (${decision.reason})`);
      return false;
    }
    const room = infra.diskHasRoom(root, stat.size);
    if (!room.ok) {
      warn(`pouco espaço livre (${fmtMb(room.free)}): ${relative} fica para depois`);
      return false;
    }

    const tmp = tmpPathFor(root, localPath);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    const started = Date.now();
    const job = { localPath, relative, tmp, analysis, kind };
    try {
      let out;
      try {
        out = await convert(decision.action, decision, job);
      } catch (error) {
        if (decision.action !== 'remux' || toolUnavailable(error)) throw error;
        // a cópia sem recodificar não ficou dentro da especificação: recodifica
        warn(`sem recodificar não serviu para ${relative} (${String(error.message).slice(0, 200)}); recodificando`);
        out = await convert('transcode', decision, job);
      }
      if (!fs.existsSync(localPath)) throw Object.assign(new Error('original apagado durante a conversão'), { quiet: true });
      fs.renameSync(tmp, dest);
      wantKind.delete(localPath);
      const seconds = Math.round((Date.now() - started) / 1000);
      const before = analysis.info.videoBitRate ? fmtMbps(analysis.info.videoBitRate) : '?';
      const after = out.info.videoBitRate ? fmtMbps(out.info.videoBitRate) : '?';
      log(`pronto: ${relative} ${before} → ${after} (${fmtMb(stat.size)} → ${fmtMb(out.size)}) em ${seconds} s`);
    } catch (error) {
      try { fs.rmSync(tmp, { force: true }); } catch {}
      if (error?.quiet) log(`descartado: ${relative} (${error.message})`);
      else if (toolUnavailable(error)) {
        infra.resetTools?.();
        warn(`ffmpeg indisponível (${error.message}): ${relative} fica para depois`);
      } else markFailed(analysis.key, relative, error);
    }
    return true;
  }

  // ── Posts agendados (tarefa periódica) ──

  /** Uma passada: posts 'agendado' até daqui a 48 h (inclusive os atrasados); vídeo fora da especificação vai para a fila. */
  async function scan() {
    if (settings.disabled || !pool) return { queued: 0 };
    if (scanning) {
      rescan = true;
      return { queued: 0 };
    }
    scanning = true;
    const counts = { videos: 0, pending: 0, ready: 0, original: 0, other: 0 };
    try {
      const { rows } = await pool.query(
        `SELECT id, publish_type, media_url, media_items, scheduled_at FROM scheduled_posts
          WHERE status = 'agendado' AND scheduled_at <= now() + make_interval(hours => $1::int)
          ORDER BY scheduled_at ASC LIMIT 300`,
        [Math.ceil(settings.horizonHours)]
      );
      const soonMs = settings.soonHours * 3_600_000;
      for (const post of rows) {
        const kind = metaKindFor(post.publish_type);
        const soon = new Date(post.scheduled_at).getTime() - Date.now() <= soonMs;
        for (const url of postMediaUrls(post)) {
          const result = await prepare(url, kind, soon
            ? { priority: QUEUE_PRIORITY.instagramSoon, reason: 'instagramSoon' }
            : { priority: QUEUE_PRIORITY.instagram, reason: 'instagram' });
          if (result.status === 'external') continue;
          counts.videos += 1;
          if (result.status === 'pending' || result.status === 'ready' || result.status === 'original') counts[result.status] += 1;
          else counts.other += 1;
        }
      }
      if (counts.videos) {
        log(`posts das próximas ${settings.horizonHours} h: ${counts.videos} vídeo(s); ${counts.pending} na fila, ${counts.ready} prontos, ${counts.original} já cumprem`);
      }
      return { queued: counts.pending, ...counts };
    } catch (error) {
      warn(`tarefa dos posts agendados falhou: ${error?.message || error}`);
      return { queued: 0, error: error?.message };
    } finally {
      scanning = false;
      if (rescan) {
        rescan = false;
        scanSoon();
      }
    }
  }

  /** Logo depois de um agendamento novo (barato: um SELECT e ffprobe com cache). */
  function scanSoon() {
    if (settings.disabled || scanSoonTimer) return;
    scanSoonTimer = setTimeout(() => {
      scanSoonTimer = null;
      scan();
    }, settings.scanSoonMs);
    scanSoonTimer.unref?.();
  }

  /** Na subida nada está convertendo: apaga as .ig.mp4 temporárias de conversões interrompidas. */
  function cleanStaleTmp() {
    for (const root of roots()) {
      const dir = path.join(root, WEB_TMP_DIR);
      let entries = [];
      try { entries = fs.readdirSync(dir); } catch { continue; }
      for (const name of entries) {
        if (name.endsWith('.ig.mp4')) try { fs.rmSync(path.join(dir, name), { force: true }); } catch {}
      }
    }
  }

  function start() {
    if (settings.disabled) {
      log('desligado (IG_VIDEO_DISABLED)');
      return;
    }
    cleanStaleTmp();
    log(`pronto: posts das próximas ${settings.horizonHours} h, na fila da versão leve (preset ${settings.preset})`);
    const first = setTimeout(scan, settings.scanDelayMs);
    first.unref?.();
    if (settings.scanIntervalMs > 0) {
      const timer = setInterval(scan, settings.scanIntervalMs);
      timer.unref?.();
    }
  }

  // ── Hora de publicar ──

  /**
   * URLs para mandar à Meta, na ordem recebida: a .ig.mp4 quando pronta, o original quando ele cumpre.
   * Vídeo ainda convertendo: { wait: true } (a conversão passa para a frente da fila) até maxWaitMs de
   * atraso; depois disso vai o original, com o motivo em fallback.
   */
  async function chooseMedia(urls, { publishType, scheduledAt, now = Date.now() } = {}) {
    const kind = metaKindFor(publishType);
    const entries = [];
    for (const url of urls) {
      let entry;
      try {
        entry = await prepare(url, kind, { priority: QUEUE_PRIORITY.urgent, reason: 'urgent' });
      } catch (error) {
        warn(`não conferiu ${url}: ${error?.message || error}`);
        entry = { url, status: 'unknown' };
      }
      if (entry.status === 'ready') entry.igUrl = igVariantUrl(url);
      entries.push(entry);
    }
    const scheduled = new Date(scheduledAt || now).getTime();
    const delayMs = Number.isFinite(scheduled) ? now - scheduled : 0;
    return planPostMedia(entries, { delayMs, maxWaitMs: settings.maxWaitMs });
  }

  function deferPost(id) {
    deferred.set(String(id), Date.now() + settings.recheckMs);
  }

  /** Posts adiados que ainda não é hora de olhar de novo (o robô não pega nesse intervalo). */
  function deferredPostIds() {
    const now = Date.now();
    for (const [id, until] of deferred) if (until <= now) deferred.delete(id);
    return [...deferred.keys()];
  }

  /** Validação ao agendar: a mensagem quando a duração de um vídeo não serve para o tipo de post. */
  async function durationProblem(urls, publishType) {
    if (!META_LIMITS[metaKindFor(publishType)]) return null;
    for (const url of urls || []) {
      const found = localVideoFor(url);
      if (!found) continue;
      try {
        const analysis = await analyze(found.localPath, { timeoutMs: settings.scheduleProbeTimeoutMs });
        const problem = metaDurationProblem(analysis.info.durationSec, publishType);
        if (problem) return problem;
      } catch (error) {
        warn(`não mediu a duração de ${found.relative}: ${error?.message || error}`);
      }
    }
    return null;
  }

  return {
    settings,
    start,
    scan,
    scanSoon,
    prepare,
    chooseMedia,
    deferPost,
    deferredPostIds,
    durationProblem,
    instagramUrlFor: (url) => instagramUrlFor(url, { roots, allowedOrigins }),
    status: () => ({ failed: failed.size, deferred: deferred.size, analyses: analyses.size }),
  };
}

// ═══════════════════════════════════════════════════════════════
// Versão leve dos vídeos para assistir (<nome>.web.mp4 ao lado do original)
// ═══════════════════════════════════════════════════════════════
// Os vídeos chegam pesados (H.264 1080x1920 de 33 a 44 Mbps; .mov HEVC de ~15 Mbps sem faststart)
// e a VPS entrega 25 a 40 Mbps: o player parava no meio para carregar. Depois de cada upload ou
// entrega, este módulo grava ao lado do original uma cópia H.264 de no máximo ~6 Mbps com faststart,
// que os players tocam (rota /api/media/playback). O original fica intacto para baixar, postar
// (scheduled_posts.media_url), enviar ao cliente e todo o resto: nenhuma URL do banco muda.
//
// Limites: uma conversão por vez (fila própria) e dentro da fila global de ffmpeg do server (a mesma
// do 480p do portal), nice 19 + ionice idle, 1 ou 2 threads, tempo máximo, sem repetir o que falhou.
// O arquivo é gravado num temporário (<raiz>/.web-tmp) e renomeado só no fim: quem abre a .web.mp4
// sempre pega o arquivo completo.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp']);
export const WEB_SUFFIX = '.web.mp4';
export const WEB_TMP_DIR = '.web-tmp';
/** Acima disso (ou HEVC, ou sem faststart, ou fora de .mp4) o original ganha versão leve. */
export const LIGHT_MAX_BPS = 8_000_000;
const DEFAULT_ORIGINS = ['https://agenciapulse.tech'];
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Nomes ─────────────────────────────────────────────────────

export function isWebVariantName(name) {
  return String(name || '').toLowerCase().endsWith(WEB_SUFFIX);
}

/** Vídeo original que pode ganhar versão leve (nunca a própria .web.mp4). */
export function isConvertibleVideoName(name) {
  const base = path.basename(String(name || ''));
  if (!base || isWebVariantName(base)) return false;
  return VIDEO_EXTENSIONS.has(path.extname(base).toLowerCase());
}

/** 1729_ab12.mov → 1729_ab12.web.mp4 (null quando não é vídeo). */
export function webVariantName(name) {
  const base = path.basename(String(name || ''));
  if (!isConvertibleVideoName(base)) return null;
  return `${base.slice(0, base.length - path.extname(base).length)}${WEB_SUFFIX}`;
}

export function webVariantPath(filePath) {
  const name = webVariantName(filePath);
  return name ? path.join(path.dirname(String(filePath)), name) : null;
}

/** Nomes possíveis do original de uma .web.mp4 (o mesmo nome com cada extensão de vídeo). */
export function originalNamesForWebVariant(name) {
  const base = path.basename(String(name || ''));
  if (!isWebVariantName(base)) return [];
  const stem = base.slice(0, base.length - WEB_SUFFIX.length);
  if (!stem) return [];
  return [...VIDEO_EXTENSIONS].map((ext) => `${stem}${ext}`);
}

/**
 * URL pública da versão leve, no mesmo formato da URL recebida (completa ou /uploads/...).
 * Só troca o último trecho do caminho; query e âncora não seguem.
 */
export function webVariantUrl(url) {
  const raw = String(url || '').trim();
  const match = /^([^?#]*\/)([^/?#]+)(?:[?#].*)?$/.exec(raw);
  if (!match) return null;
  let decoded;
  try { decoded = decodeURIComponent(match[2]); } catch { return null; }
  const name = webVariantName(decoded);
  return name ? `${match[1]}${encodeURIComponent(name)}` : null;
}

// ── Validação do caminho (mesma regra do /api/portal-media-proxy) ──

/**
 * Caminho relativo dentro de /uploads/ ou null. Aceita '/uploads/...' ou URL completa de uma origem
 * permitida. Recusa '..' (também codificado), barra invertida, byte nulo, trechos ocultos e os vídeos
 * do treinamento (esses só saem por /api/training/stream com token assinado).
 */
export function uploadRelativeFromUrl(url, { allowedOrigins = DEFAULT_ORIGINS } = {}) {
  const raw = String(url || '').trim();
  if (!raw || raw.length > 2048) return null;
  let parsed;
  try {
    parsed = new URL(raw, 'https://relativo.invalid');
  } catch {
    return null;
  }
  const isRelative = parsed.origin === 'https://relativo.invalid';
  if (isRelative ? !raw.startsWith('/uploads/') : !allowedOrigins.includes(parsed.origin)) return null;
  if (!parsed.pathname.startsWith('/uploads/')) return null;
  let relative;
  try {
    relative = decodeURIComponent(parsed.pathname.slice('/uploads/'.length));
  } catch {
    return null;
  }
  if (!relative || relative.includes('..') || relative.includes('\\') || relative.includes('\0')) return null;
  const segments = relative.split('/').filter(Boolean);
  if (!segments.length || segments.some((seg) => seg.startsWith('.'))) return null;
  if (segments[0].toLowerCase() === 'training-videos') return null;
  return segments.join('/');
}

/** Raiz (já com realpath) que contém o arquivo, seguindo symlinks; null fora das raízes. */
export function containingRoot(filePath, roots) {
  let real;
  try {
    real = fs.realpathSync(filePath);
  } catch {
    return null;
  }
  for (const root of roots) {
    let realRoot;
    try { realRoot = fs.realpathSync(root); } catch { continue; }
    if (real.startsWith(`${realRoot}${path.sep}`)) {
      return { root: realRoot, localPath: real, relative: path.relative(realRoot, real).split(path.sep).join('/') };
    }
  }
  return null;
}

/** URL de /uploads/ → arquivo existente dentro de uma raiz de uploads (realpath), ou null. */
export function resolveUploadFile(url, roots, options = {}) {
  const relative = uploadRelativeFromUrl(url, options);
  if (!relative) return null;
  for (const root of roots) {
    const candidate = path.resolve(root, relative);
    if (!candidate.startsWith(`${path.resolve(root)}${path.sep}`)) continue;
    const found = containingRoot(candidate, [root]);
    if (!found) continue;
    try {
      if (!fs.statSync(found.localPath).isFile()) continue;
    } catch {
      continue;
    }
    return { ...found, relative };
  }
  return null;
}

// ── Análise do original ───────────────────────────────────────

/**
 * Faststart = o átomo moov (índice) vem antes do mdat (dados). Sem isso o navegador precisa buscar
 * o fim do arquivo antes de tocar. true/false, ou null quando não é um MP4/MOV legível.
 */
export function mp4HasFaststart(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = fs.fstatSync(fd).size;
    const header = Buffer.alloc(16);
    let offset = 0;
    for (let i = 0; i < 512 && offset + 8 <= size; i++) {
      const read = fs.readSync(fd, header, 0, 16, offset);
      if (read < 8) return null;
      let boxSize = header.readUInt32BE(0);
      const type = header.toString('latin1', 4, 8);
      if (boxSize === 1) {
        if (read < 16) return null;
        boxSize = Number(header.readBigUInt64BE(8));
      } else if (boxSize === 0) {
        boxSize = size - offset;
      }
      if (type === 'moov') return true;
      if (type === 'mdat') return false;
      if (boxSize < 8) return null;
      offset += boxSize;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

/** Saída do ffprobe (-show_format -show_streams, JSON) → o que a decisão precisa. */
export function parseProbe(json, fileSize = 0) {
  const streams = Array.isArray(json?.streams) ? json.streams : [];
  const format = json?.format || {};
  const video = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const audio = streams.find((s) => s.codec_type === 'audio');
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const durationSec = num(format.duration) || num(video?.duration);
  const size = num(format.size) || fileSize;
  const bitRate = num(format.bit_rate) || (durationSec && size ? Math.round((size * 8) / durationSec) : 0);
  return {
    durationSec,
    bitRate,
    videoBitRate: num(video?.bit_rate),
    video: video ? {
      codec: String(video.codec_name || '').toLowerCase(),
      pixFmt: String(video.pix_fmt || '').toLowerCase(),
      width: num(video.width),
      height: num(video.height),
      colorTransfer: String(video.color_transfer || '').toLowerCase(),
    } : null,
    audio: audio ? { codec: String(audio.codec_name || '').toLowerCase() } : null,
  };
}

/**
 * Converter ou não:
 * - none: já é leve (H.264 8 bits, até 8 Mbps, faststart e .mp4): o original é a versão de assistir;
 * - remux: o vídeo já é leve, só falta o contêiner/faststart (copia o vídeo, sem gastar CPU);
 * - transcode: H.264 pesado, HEVC, 10 bits, VP9...;
 * - skip: não tem trilha de vídeo.
 */
export function decideWebVariant(probe, { ext = '', faststart = null } = {}) {
  const v = probe?.video;
  if (!v) return { action: 'skip', reason: 'sem trilha de vídeo' };
  const bps = probe.videoBitRate || probe.bitRate || 0;
  const mbps = bps ? `${(bps / 1e6).toFixed(1)} Mbps` : 'taxa desconhecida';
  const h264 = v.codec === 'h264';
  const eightBit = v.pixFmt === 'yuv420p' || v.pixFmt === 'yuvj420p';
  const lightStream = h264 && eightBit && bps > 0 && bps <= LIGHT_MAX_BPS;
  if (lightStream && faststart === true && String(ext).toLowerCase() === '.mp4') {
    return { action: 'none', reason: `já é leve (H.264, ${mbps}, faststart)` };
  }
  const smallSide = Math.min(v.width || 0, v.height || 0);
  if (lightStream && smallSide > 0 && smallSide <= 1080 && !isHdr(v)) {
    return { action: 'remux', reason: `H.264 ${mbps}: só faststart/contêiner` };
  }
  return { action: 'transcode', reason: `${v.codec || 'codec?'} ${v.pixFmt || ''} ${mbps}`.replace(/\s+/g, ' ').trim() };
}

function isHdr(video) {
  return video?.colorTransfer === 'smpte2084' || video?.colorTransfer === 'arib-std-b67';
}

// Lado menor no máximo 1080, mantendo a proporção e com medidas pares (yuv420p exige):
// vertical 1080x1920 fica igual, 2160x3840 vira 1080x1920, 3840x2160 vira 1920x1080.
export const SCALE_FILTER = "scale=w='if(lte(iw,ih),min(1080,trunc(iw/2)*2),-2)':h='if(lte(iw,ih),-2,min(1080,trunc(ih/2)*2))'";
// HDR (iPhone HLG/Dolby Vision, PQ) em 8 bits sem conversão fica lavado: tonemap quando o ffmpeg tem zscale.
const HDR_TO_SDR = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';

/** Argumentos do ffmpeg (sem o nice/ionice). */
export function buildFfmpegArgs({ src, dest, action, threads = 1, probe = null, hasZscale = false }) {
  const t = String(Math.max(1, Number(threads) || 1));
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-filter_threads', t, '-threads', t, '-i', src,
    '-map', '0:v:0', '-map', '0:a:0?'];
  const audioCodec = probe?.audio?.codec || '';
  const copyAudio = audioCodec === 'aac' || audioCodec === 'mp3';
  if (action === 'remux') {
    args.push('-c:v', 'copy');
    if (copyAudio) args.push('-c:a', 'copy');
    else args.push('-c:a', 'aac', '-b:a', '128k');
  } else {
    const filters = [];
    if (hasZscale && isHdr(probe?.video)) filters.push(HDR_TO_SDR);
    filters.push(SCALE_FILTER);
    args.push('-vf', filters.join(','),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-maxrate', '6M', '-bufsize', '12M',
      '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-threads', t,
      '-c:a', 'aac', '-b:a', '128k');
  }
  args.push('-movflags', '+faststart', '-f', 'mp4', '-y', dest);
  return args;
}

// ── Execução ──────────────────────────────────────────────────

function findExecutable(name) {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function runProcess(cmd, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      reject(error);
      return;
    }
    let out = '';
    let err = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { if (out.length < 4_000_000) out += d; });
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch {}
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`tempo esgotado (${Math.round(timeoutMs / 1000)} s)`));
      if (code !== 0) return reject(new Error(err.trim().split('\n').slice(-3).join(' | ') || `saiu com código ${code}`));
      resolve({ out, err });
    });
  });
}

const fmtMb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const fmtMbps = (bps) => `${(bps / 1e6).toFixed(1)} Mbps`;

function readSettings(env) {
  const num = (value, fallback) => {
    const n = Number(value);
    return value !== undefined && value !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const cpus = os.cpus()?.length || 1;
  return {
    disabled: env.WEB_VIDEO_DISABLED === '1' || env.WEB_VIDEO_DISABLED === 'true',
    threads: Math.max(1, Math.min(2, num(env.WEB_VIDEO_THREADS, cpus <= 2 ? 1 : 2))),
    pauseMs: num(env.WEB_VIDEO_PAUSE_MS, 15_000),
    timeoutMs: num(env.WEB_VIDEO_TIMEOUT_MS, 0), // 0 = pela duração (entre 10 e 60 min)
    backfillDays: num(env.WEB_VIDEO_BACKFILL_DAYS, 14),
    backfillDelayMs: num(env.WEB_VIDEO_BACKFILL_DELAY_MS, 90_000),
    backfillIntervalMs: num(env.WEB_VIDEO_BACKFILL_INTERVAL_MS, 6 * 60 * 60 * 1000),
    onDemandMaxAgeDays: num(env.WEB_VIDEO_ONDEMAND_DAYS, 30),
    // disco a 79%: não converte com menos de 2 GB ou 8% livres
    minFreeBytes: num(env.WEB_VIDEO_MIN_FREE_BYTES, 2 * 1024 * 1024 * 1024),
    minFreeRatio: num(env.WEB_VIDEO_MIN_FREE_RATIO, 0.08),
    maxQueue: num(env.WEB_VIDEO_MAX_QUEUE, 1000),
    stateDir: env.WEB_VIDEO_STATE_DIR || path.join(os.tmpdir(), 'pulse-video-leve'),
    skipFolders: String(env.WEB_VIDEO_SKIP_FOLDERS ?? 'training-videos')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    ffmpeg: env.FFMPEG_PATH || 'ffmpeg',
    ffprobe: env.FFPROBE_PATH || 'ffprobe',
  };
}

// Prioridade na fila: quem está assistindo agora > upload novo > vídeos antigos (tarefa de fundo).
const PRIORITY = { watching: 0, upload: 1, backfill: 2 };

// Colunas com vídeo para assistir (a tarefa de fundo lê só as linhas dos últimos dias).
const BACKFILL_SOURCES = [
  { table: 'client_portal_contents', column: 'file_url', ts: 'created_at' },
  { table: 'content_tasks', column: 'edited_video_link', ts: 'updated_at' },
  { table: 'edit_versions', column: 'video_url', ts: 'created_at' },
  { table: 'portal_videos', column: 'video_url', ts: 'created_at' },
  { table: 'flyer_items', column: 'generated_video_url', ts: 'created_at' },
];

/**
 * deps:
 * - pool: Postgres (tarefa de fundo e escopo do link avulso);
 * - uploadRoots(): raízes onde /uploads/ pode estar;
 * - runSlot(task): fila global de ffmpeg do server (a mesma do 480p), para não somar conversões;
 * - allowedOrigins: origens aceitas em URLs completas.
 */
export function createWebVideo({ pool, uploadRoots, runSlot = (task) => task(), logger = console, env = process.env, allowedOrigins = DEFAULT_ORIGINS } = {}) {
  const settings = readSettings(env);
  const roots = () => (typeof uploadRoots === 'function' ? uploadRoots() : uploadRoots || []).filter(Boolean);
  const queue = [];
  const queued = new Set();
  let seq = 0;
  let running = null;
  let pumpTimer = null;
  let backfillTimer = null;
  let backfillRunning = false;
  // Original já leve (ou sem vídeo): não reanalisa a cada passada. Chave: caminho|tamanho|data.
  const settled = new Map();
  const failuresFile = path.join(settings.stateDir, 'falhas.json');
  const failed = loadFailures();
  let tools = null;

  const log = (msg) => logger.log(`[video-leve] ${msg}`);
  const warn = (msg) => logger.warn(`[video-leve] ${msg}`);

  function loadFailures() {
    try {
      const data = JSON.parse(fs.readFileSync(failuresFile, 'utf8'));
      return new Map(Object.entries(data || {}));
    } catch {
      return new Map();
    }
  }

  function saveFailures() {
    try {
      fs.mkdirSync(settings.stateDir, { recursive: true });
      const entries = [...failed.entries()].slice(-2000);
      fs.writeFileSync(failuresFile, JSON.stringify(Object.fromEntries(entries)));
    } catch (error) {
      warn(`não gravou a lista de falhas: ${error.message}`);
    }
  }

  function detectTools() {
    if (tools) return tools;
    tools = { nice: findExecutable('nice'), ionice: findExecutable('ionice'), hasZscale: null };
    return tools;
  }

  async function hasZscale() {
    const t = detectTools();
    if (t.hasZscale !== null) return t.hasZscale;
    try {
      const { out } = await runProcess(settings.ffmpeg, ['-hide_banner', '-filters'], { timeoutMs: 15_000 });
      t.hasZscale = /\bzscale\b/.test(out) && /\btonemap\b/.test(out);
    } catch {
      t.hasZscale = false;
    }
    return t.hasZscale;
  }

  /** nice 19 + ionice idle (quando existe) na frente do comando. */
  function lowPriority(bin, args) {
    const t = detectTools();
    const prefix = [];
    if (t.nice) prefix.push(t.nice, '-n', '19');
    if (t.ionice) prefix.push(t.ionice, '-c3');
    if (!prefix.length) return [bin, args];
    return [prefix[0], [...prefix.slice(1), bin, ...args]];
  }

  function fileKey(localPath) {
    try {
      const st = fs.statSync(localPath);
      return `${localPath}|${st.size}|${Math.round(st.mtimeMs)}`;
    } catch {
      return null;
    }
  }

  function inSkippedFolder(relative) {
    const first = String(relative || '').split('/')[0].toLowerCase();
    return settings.skipFolders.includes(first);
  }

  /** Arquivo local (caminho absoluto) dentro de uma raiz de uploads, ou null. */
  function locate(filePath) {
    const found = containingRoot(filePath, roots());
    if (!found) return null;
    if (!isConvertibleVideoName(found.localPath)) return null;
    if (found.relative.split('/').some((seg) => seg.startsWith('.'))) return null;
    if (inSkippedFolder(found.relative)) return null;
    return found;
  }

  function webExists(localPath) {
    const web = webVariantPath(localPath);
    return !!web && fs.existsSync(web);
  }

  /** Põe um vídeo na fila. reason: 'watching' | 'upload' | 'backfill'. Devolve true se entrou. */
  function enqueue(filePath, { reason = 'upload' } = {}) {
    if (settings.disabled) return false;
    const found = locate(filePath);
    if (!found) return false;
    const { localPath, relative } = found;
    if (webExists(localPath)) return false;
    const key = fileKey(localPath);
    if (!key || failed.has(key) || settled.has(key)) return false;
    const priority = PRIORITY[reason] ?? PRIORITY.upload;
    if (running?.localPath === localPath) return false;
    if (queued.has(localPath)) {
      // quem está assistindo passa na frente do que já estava na fila
      const item = queue.find((q) => q.localPath === localPath);
      if (item && priority < item.priority) item.priority = priority;
      return false;
    }
    if (queue.length >= settings.maxQueue) {
      warn(`fila cheia (${queue.length}): ${relative} fica para a próxima passada`);
      return false;
    }
    queue.push({ ...found, priority, reason, seq: ++seq });
    queued.add(localPath);
    if (reason !== 'backfill') log(`na fila: ${relative} (${reason === 'watching' ? 'assistindo' : 'upload'})`);
    schedulePump(0);
    return true;
  }

  function takeNext() {
    if (!queue.length) return null;
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i];
      const b = queue[best];
      if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
    }
    return queue.splice(best, 1)[0];
  }

  function remainingBackfill() {
    return queue.filter((q) => q.reason === 'backfill').length;
  }

  function schedulePump(delayMs) {
    if (pumpTimer || running) return;
    pumpTimer = setTimeout(() => {
      pumpTimer = null;
      pump();
    }, delayMs);
    pumpTimer.unref?.();
  }

  async function pump() {
    if (running) return;
    const item = takeNext();
    if (!item) return;
    running = item;
    let ranFfmpeg = false;
    try {
      ranFfmpeg = await processItem(item);
    } catch (error) {
      warn(`erro inesperado em ${item.relative}: ${error?.message || error}`);
    } finally {
      queued.delete(item.localPath);
      running = null;
      if (item.reason === 'backfill' && ranFfmpeg) log(`faltam ${remainingBackfill()} vídeo(s) antigo(s)`);
      if (queue.length) schedulePump(ranFfmpeg ? settings.pauseMs : 0);
    }
  }

  function diskHasRoom(root, sourceSize) {
    try {
      const st = fs.statfsSync(root);
      const free = st.bavail * st.bsize;
      const total = st.blocks * st.bsize;
      const ok = free >= Math.max(settings.minFreeBytes, sourceSize) && (!total || free / total >= settings.minFreeRatio);
      return { ok, free, total };
    } catch {
      return { ok: true, free: 0, total: 0 };
    }
  }

  async function probe(localPath, size) {
    const { out } = await runProcess(settings.ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', localPath], { timeoutMs: 60_000 });
    return parseProbe(JSON.parse(out || '{}'), size);
  }

  function tmpPathFor(root, localPath) {
    const hash = crypto.createHash('sha1').update(localPath).digest('hex').slice(0, 16);
    return path.join(root, WEB_TMP_DIR, `${hash}.mp4`);
  }

  function markFailed(key, relative, error) {
    failed.set(key, { at: new Date().toISOString(), file: relative, error: String(error?.message || error).slice(0, 300) });
    saveFailures();
    warn(`falhou, não tenta de novo: ${relative}: ${String(error?.message || error).slice(0, 300)}`);
  }

  /** Converte um vídeo. Devolve true quando o ffmpeg rodou (para a pausa entre conversões). */
  async function processItem(item) {
    const { localPath, relative, root } = item;
    let stat;
    try {
      stat = fs.statSync(localPath);
    } catch {
      return false; // apagado enquanto esperava
    }
    const dest = webVariantPath(localPath);
    if (!dest || fs.existsSync(dest)) return false;
    const key = `${localPath}|${stat.size}|${Math.round(stat.mtimeMs)}`;
    if (failed.has(key) || settled.has(key)) return false;

    let info;
    try {
      info = await probe(localPath, stat.size);
    } catch (error) {
      markFailed(key, relative, new Error(`ffprobe: ${error.message}`));
      return false;
    }
    const ext = path.extname(localPath).toLowerCase();
    const faststart = ['.mp4', '.m4v', '.mov'].includes(ext) ? mp4HasFaststart(localPath) : null;
    const decision = decideWebVariant(info, { ext, faststart });
    if (decision.action === 'none' || decision.action === 'skip') {
      settled.set(key, decision.action);
      log(`sem conversão: ${relative} (${decision.reason})`);
      return false;
    }

    const room = diskHasRoom(root, stat.size);
    if (!room.ok) {
      warn(`pouco espaço livre (${fmtMb(room.free)}): ${relative} fica para depois`);
      return false;
    }

    const tmp = tmpPathFor(root, localPath);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    const args = buildFfmpegArgs({
      src: localPath, dest: tmp, action: decision.action, threads: settings.threads, probe: info,
      hasZscale: decision.action === 'transcode' ? await hasZscale() : false,
    });
    const timeoutMs = settings.timeoutMs
      || Math.min(60 * 60_000, Math.max(10 * 60_000, Math.round((info.durationSec || 60) * 20_000)));
    const [cmd, cmdArgs] = lowPriority(settings.ffmpeg, args);
    const started = Date.now();
    log(`convertendo: ${relative} (${decision.reason}${decision.action === 'remux' ? ', sem recodificar' : ''})`);
    try {
      await runSlot(() => runProcess(cmd, cmdArgs, { timeoutMs }));
      const out = await probe(tmp, 0);
      if (out.video?.codec !== 'h264') throw new Error(`saída sem H.264 (${out.video?.codec || 'sem vídeo'})`);
      const tolerance = Math.max(1, (info.durationSec || 0) * 0.02);
      if (info.durationSec && Math.abs((out.durationSec || 0) - info.durationSec) > tolerance) {
        throw new Error(`duração diferente (${out.durationSec?.toFixed(1)} s, original ${info.durationSec.toFixed(1)} s)`);
      }
      if (!fs.existsSync(localPath)) throw Object.assign(new Error('original apagado durante a conversão'), { quiet: true });
      fs.renameSync(tmp, dest);
      const size = fs.statSync(dest).size;
      const seconds = Math.round((Date.now() - started) / 1000);
      const before = info.bitRate ? fmtMbps(info.bitRate) : '?';
      const after = out.bitRate ? fmtMbps(out.bitRate) : '?';
      log(`pronto: ${relative} ${before} → ${after} (${fmtMb(stat.size)} → ${fmtMb(size)}) em ${seconds} s`);
    } catch (error) {
      try { fs.rmSync(tmp, { force: true }); } catch {}
      if (error?.quiet) log(`descartado: ${relative} (${error.message})`);
      else markFailed(key, relative, error);
    }
    return true;
  }

  // ── Vídeos já enviados (tarefa de fundo) ──

  async function collectRecentUrls(days) {
    if (!pool) return [];
    const urls = [];
    for (const { table, column, ts } of BACKFILL_SOURCES) {
      try {
        const { rows } = await pool.query(
          `SELECT DISTINCT "${column}" AS url FROM public."${table}"
            WHERE "${column}" ~* '\\.(mp4|mov|m4v|webm|mkv|avi|3gp)([?#].*)?$'
              AND "${ts}" > now() - make_interval(days => $1::int)`,
          [Math.ceil(days)]
        );
        for (const r of rows) if (r.url) urls.push(r.url);
      } catch {
        // tabela/coluna inexistente neste banco: segue
      }
    }
    return urls;
  }

  /** Uma passada: vídeos dos últimos N dias sem versão leve, do mais novo para o mais antigo. */
  async function runBackfill() {
    if (settings.disabled || backfillRunning) return { queued: 0 };
    backfillRunning = true;
    try {
      const since = Date.now() - settings.backfillDays * DAY_MS;
      const seen = new Set();
      const items = [];
      for (const url of await collectRecentUrls(settings.backfillDays)) {
        const resolved = resolveUploadFile(url, roots(), { allowedOrigins });
        if (!resolved || seen.has(resolved.localPath)) continue;
        seen.add(resolved.localPath);
        const found = locate(resolved.localPath);
        if (!found || webExists(found.localPath)) continue;
        let st;
        try { st = fs.statSync(found.localPath); } catch { continue; }
        if (st.mtimeMs < since) continue;
        const key = `${found.localPath}|${st.size}|${Math.round(st.mtimeMs)}`;
        if (failed.has(key) || settled.has(key)) continue;
        items.push({ localPath: found.localPath, mtimeMs: st.mtimeMs });
      }
      items.sort((a, b) => b.mtimeMs - a.mtimeMs);
      let count = 0;
      for (const item of items) if (enqueue(item.localPath, { reason: 'backfill' })) count++;
      log(`vídeos dos últimos ${settings.backfillDays} dias sem versão leve: ${items.length} (faltam ${remainingBackfill()} na fila)`);
      return { queued: count, found: items.length };
    } catch (error) {
      warn(`tarefa de vídeos antigos falhou: ${error?.message || error}`);
      return { queued: 0, error: error?.message };
    } finally {
      backfillRunning = false;
    }
  }

  /** Na subida nada está convertendo: apaga os temporários de conversões interrompidas. */
  function cleanStaleTmp() {
    for (const root of roots()) {
      const dir = path.join(root, WEB_TMP_DIR);
      let entries = [];
      try { entries = fs.readdirSync(dir); } catch { continue; }
      for (const name of entries) {
        try { fs.rmSync(path.join(dir, name), { force: true }); } catch {}
      }
    }
  }

  function start() {
    if (settings.disabled) {
      log('desligado (WEB_VIDEO_DISABLED)');
      return;
    }
    cleanStaleTmp();
    log(`fila pronta: 1 conversão por vez, ${settings.threads} thread(s), vídeos antigos dos últimos ${settings.backfillDays} dias`);
    const first = setTimeout(runBackfill, settings.backfillDelayMs);
    first.unref?.();
    if (settings.backfillIntervalMs > 0) {
      backfillTimer = setInterval(runBackfill, settings.backfillIntervalMs);
      backfillTimer.unref?.();
    }
  }

  // ── O que o player toca ──

  /**
   * URL para assistir: a .web.mp4 quando existe; senão o original. Vídeo recente sem versão leve
   * entra na fila com prioridade (alguém está assistindo).
   */
  function playbackFor(url) {
    const resolved = resolveUploadFile(url, roots(), { allowedOrigins });
    if (!resolved) return null;
    const original = String(url).trim();
    if (!isConvertibleVideoName(resolved.localPath)) return { url: original, variant: 'original' };
    const web = webVariantPath(resolved.localPath);
    if (web && fs.existsSync(web)) {
      const webUrl = webVariantUrl(original);
      if (webUrl) return { url: webUrl, variant: 'web' };
    }
    try {
      const age = Date.now() - fs.statSync(resolved.localPath).mtimeMs;
      if (age <= settings.onDemandMaxAgeDays * DAY_MS) enqueue(resolved.localPath, { reason: 'watching' });
    } catch {}
    return { url: original, variant: 'original' };
  }

  /** Apaga a .web.mp4 de um original (limpezas). Devolve os bytes liberados. */
  function removeWebVariantOf(localPath) {
    const web = webVariantPath(localPath);
    if (!web) return 0;
    try {
      if (!fs.existsSync(web)) return 0;
      const size = fs.statSync(web).size;
      fs.unlinkSync(web);
      return size;
    } catch (error) {
      warn(`não apagou ${web}: ${error?.message || error}`);
      return 0;
    }
  }

  /**
   * GET  /api/media/playback?url=...            → { url, variant }
   * POST /api/media/playback { urls: [...] }    → { items: [{ url, playback, variant }] }
   * Exige login da equipe (Bearer), o token do portal (x-portal-token) ou, no link do vídeo
   * avulso, o id do card (só vale para o vídeo daquele card).
   */
  function registerRoutes(app, { verifyUser, readPortalToken }) {
    async function caller(req) {
      const auth = String(req.headers.authorization || '');
      if (auth.startsWith('Bearer ') && typeof verifyUser === 'function') {
        try {
          const { user } = await verifyUser(req);
          if (user) return { kind: 'team' };
        } catch {}
      }
      const portal = typeof readPortalToken === 'function' ? readPortalToken(req.headers['x-portal-token']) : null;
      if (portal) return { kind: 'client' };
      const avulso = String(req.query?.avulso || req.body?.avulso || '');
      if (pool && UUID_RE.test(avulso)) {
        const { rows } = await pool.query(
          'SELECT edited_video_link FROM content_tasks WHERE id = $1 AND client_id IS NULL LIMIT 1', [avulso]
        ).catch(() => ({ rows: [] }));
        const relative = uploadRelativeFromUrl(rows[0]?.edited_video_link, { allowedOrigins });
        if (relative) return { kind: 'avulso', relative };
      }
      return null;
    }

    function answer(who, url) {
      const relative = uploadRelativeFromUrl(url, { allowedOrigins });
      if (!relative) return { error: 'URL não permitida' };
      if (who.kind === 'avulso' && relative !== who.relative) return { error: 'URL não permitida' };
      // fora das raízes de uploads (inclusive atalho para fora) ou inexistente: nada é aberto
      return playbackFor(url) || { error: 'Arquivo não encontrado', status: 404 };
    }

    async function handler(req, res) {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const who = await caller(req);
        if (!who) return res.status(401).json({ error: 'Faça login para assistir' });
        if (req.method === 'POST') {
          const urls = Array.isArray(req.body?.urls) ? req.body.urls.slice(0, 60).map(String) : [];
          if (!urls.length) return res.status(400).json({ error: 'urls é obrigatório' });
          const items = urls.map((url) => {
            const result = answer(who, url);
            return result.error ? { url, error: result.error } : { url, playback: result.url, variant: result.variant };
          });
          return res.json({ items });
        }
        const url = typeof req.query.url === 'string' ? req.query.url : '';
        if (!url) return res.status(400).json({ error: 'url é obrigatório' });
        const result = answer(who, url);
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        return res.json(result);
      } catch (error) {
        logger.error('[video-leve] playback:', error?.message || error);
        return res.status(500).json({ error: 'Falha ao escolher o vídeo' });
      }
    }

    app.get('/api/media/playback', handler);
    app.post('/api/media/playback', handler);
  }

  return {
    settings,
    enqueue,
    runBackfill,
    start,
    playbackFor,
    removeWebVariantOf,
    registerRoutes,
    status: () => ({ running: running?.relative || null, queued: queue.length, backfill: remainingBackfill(), failed: failed.size }),
  };
}

/**
 * Middleware: todo upload gravado pelo multer (req.file / req.files) que termina com sucesso e é vídeo
 * vai para a fila. Pega todas as rotas de uma vez (/api/upload, entregas dos agentes, envio público...).
 */
export function captureVideoUploads(onVideo) {
  return function captureVideoUploadsMiddleware(req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PUT') return next();
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const files = [];
      if (req.file) files.push(req.file);
      if (Array.isArray(req.files)) files.push(...req.files);
      else if (req.files && typeof req.files === 'object') {
        for (const list of Object.values(req.files)) if (Array.isArray(list)) files.push(...list);
      }
      for (const file of files) {
        if (!file?.path || !isConvertibleVideoName(file.path)) continue;
        try { onVideo(file.path); } catch {}
      }
    });
    next();
  };
}

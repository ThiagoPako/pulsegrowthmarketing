// ─── Quadro do próprio vídeo para a capa dos destaques do relatório (usuário, 01/11/2026) ─────────────────────
// "Nem todos têm capa; a não ser que a gente pegue um trecho do vídeo, transforme em capa": sem cover_url, o
// relatório tira um quadro do vídeo editado por volta de 30% da duração. O filtro thumbnail do ffmpeg escolhe o
// quadro mais representativo de ~3 s (evita quadro preto e de transição). Sem quadro bom, o vídeo não entra.

import { execFile } from 'node:child_process';

function run(cmd, args, { timeout, encoding = 'buffer' }) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, encoding, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : stdout);
    });
  });
}

/** Duração em segundos (ffprobe); null se não deu para ler. */
export async function videoDuration(input) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', input], { timeout: 10000, encoding: 'utf8' });
  const d = Number(String(out || '').trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

/**
 * JPEG de um quadro bom do vídeo (por volta de `at` da duração) ou null.
 * input = caminho local ou URL http(s) que o ffmpeg consiga abrir.
 */
export async function videoFrame(input, { at = 0.3, width = 720 } = {}) {
  if (!input) return null;
  const duration = await videoDuration(input);
  if (!duration) return null;
  const start = Math.max(0, Math.min(duration * at, duration - 3.5));
  const jpg = await run('ffmpeg', [
    '-v', 'error', '-ss', start.toFixed(2), '-i', input, '-t', '3',
    '-vf', `thumbnail=60,scale=${width}:-2`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '3', 'pipe:1',
  ], { timeout: 30000 });
  // quadro muito pequeno em bytes = quase tudo de uma cor só (preto, branco): não serve de capa
  if (!jpg || jpg.length < 8000 || jpg[0] !== 0xff || jpg[1] !== 0xd8) return null;
  return jpg;
}

// ─── Fotos de perfil gravadas dentro do banco (data:image/...;base64) → arquivo em /uploads/avatars ──────
// O "Meu Perfil" gravava a foto inteira no profiles.avatar_url (até 2,4 MB por pessoa, 7,4 MB na equipe).
// Toda consulta que junta o responsável do card (Kanban de Design, listas de equipe…) arrastava essas fotos:
// abrir o Kanban de Design baixava ~18 MB. Aqui cada foto vira um JPEG 256×256 em /uploads/avatars e o banco
// passa a guardar só a URL. Roda na subida e de hora em hora (pega quem ainda salvar foto pelo caminho antigo).
// O arquivo original decodificado fica ao lado (.orig) para não perder a foto se a conversão falhar.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { runProcess } from './webVideo.mjs';

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,([A-Za-z0-9+/=\s]+)$/i;

export async function migrateInlineAvatars({ pool, uploadRoot, publicUploadsUrl, logger = console, ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg' }) {
  const base = String(publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');
  const { rows } = await pool.query(`SELECT id, avatar_url FROM profiles WHERE avatar_url LIKE 'data:image/%'`);
  if (!rows.length) return 0;
  const dir = path.join(uploadRoot, 'avatars');
  await fs.mkdir(dir, { recursive: true });
  let done = 0;
  for (const row of rows) {
    const match = DATA_URL_RE.exec(String(row.avatar_url || '').trim());
    if (!match) continue;
    const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (!bytes.length) continue;
    const hash = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 12);
    const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
    const original = path.join(dir, `${row.id}-${hash}.orig.${ext}`);
    const name = `${row.id}-${hash}.jpg`;
    const dest = path.join(dir, name);
    try {
      await fs.writeFile(original, bytes);
      await runProcess(ffmpeg, [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', original,
        '-vf', 'scale=256:256:force_original_aspect_ratio=increase,crop=256:256', '-frames:v', '1', '-q:v', '4', dest,
      ], { timeoutMs: 30_000 });
      // só troca se ninguém mudou a foto no meio tempo
      const { rowCount } = await pool.query(
        `UPDATE profiles SET avatar_url = $2 WHERE id = $1 AND avatar_url = $3`,
        [row.id, `${base}/avatars/${name}`, row.avatar_url]
      );
      if (rowCount) done++;
    } catch (error) {
      logger.warn?.('[avatares] não converteu a foto de', row.id, '-', error.message);
    }
  }
  if (done) logger.log?.(`[avatares] ${done} foto(s) de perfil saíram do banco para /uploads/avatars`);
  return done;
}

// Assistente PULSE — material encaminhado (pedido do usuário, 31/10/2026: "se eu encaminhar pro assistente PULSE dá certo?").
//
// Vídeo, foto, documento ou texto ENCAMINHADO no privado do PULSE não é comando: é material de um cliente (brutos e
// roteiros que chegaram pelo grupo). O pulse-wa baixa o arquivo para a pasta privada (wa-server.mjs, saveMaterial) e
// grava o wa_inbound com media_type video | imagem | documento | encaminhado. Aqui:
//   1. cada um vira uma linha em assistant_materials com um código curto (M1, M2…) e, nos documentos, o texto lido;
//   2. quando a pessoa para de encaminhar (FLUSH_SECONDS sem nada novo), o lote vai ao Claude numa mensagem só, com a
//      lista e o texto dos roteiros; ele junta cada vídeo ao roteiro certo e propõe guardar_material (pede "sim");
//   3. no "sim", saveMaterialsToDrive copia os arquivos para a pasta do cliente no Drive (rclone, remote "gdrive" da
//      VPS, autorizado pelo usuário em 31/10/2026), uma subpasta por vídeo com o nome do roteiro, e cria o card em
//      Edição com o link da pasta e o roteiro. Os arquivos locais saem da VPS.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { clip } from './common.mjs';

const run = promisify(execFile);
export const MATERIAL_TYPES = new Set(['video', 'imagem', 'documento', 'encaminhado']);
export const FLUSH_SECONDS = Number(process.env.ASSISTANT_MATERIAL_FLUSH_SECONDS || 45);
const RCLONE_REMOTE = process.env.ASSISTANT_DRIVE_REMOTE || 'gdrive';
const TIPO_LABEL = { video: 'vídeo', imagem: 'foto', documento: 'documento', encaminhado: 'texto encaminhado' };

export async function ensureMaterialsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assistant_materials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      number_id UUID NOT NULL,
      inbound_id UUID,
      codigo TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nome TEXT,
      legenda TEXT,
      texto TEXT,
      media_path TEXT,
      tamanho BIGINT,
      duracao NUMERIC,
      status TEXT NOT NULL DEFAULT 'novo',
      client_id UUID,
      content_task_id UUID,
      drive_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assistant_materials_number ON assistant_materials (number_id, status, created_at)`);
}

// ── texto dos documentos (roteiros): .txt/.md direto, .docx pelo XML (python3), .pdf pelo pdftotext (se houver; sem ele,
// o PULSE vê só o nome e pede o texto) ──
async function readDocumentText(file, nome) {
  const ext = path.extname(nome || file).toLowerCase();
  try {
    if (['.txt', '.md', '.csv'].includes(ext)) return (await fs.readFile(file, 'utf8')).slice(0, 20000);
    if (ext === '.docx') {
      // python3 (a VPS não tem unzip): o texto do Word fica em word/document.xml
      const { stdout } = await run('python3', ['-c', "import sys,zipfile;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode('utf-8'))", file], { maxBuffer: 20 * 1024 * 1024 });
      return stdout.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
    }
    if (ext === '.pdf') {
      const { stdout } = await run('pdftotext', ['-layout', file, '-'], { maxBuffer: 20 * 1024 * 1024 });
      return stdout.trim().slice(0, 20000);
    }
  } catch (error) {
    console.error('[assistente] material: texto do documento', nome, error.message);
  }
  return '';
}

async function videoSeconds(file) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const s = Number(stdout.trim());
    return Number.isFinite(s) ? Math.round(s * 10) / 10 : null;
  } catch {
    return null;
  }
}

/** Grava o material recebido e devolve { codigo, primeiro } (primeiro = abriu um lote novo). */
export async function addMaterial(pool, number, row) {
  await ensureMaterialsSchema(pool);
  let meta = {};
  try { meta = JSON.parse(row.result || '{}'); } catch {}
  const nome = row.media_path ? path.basename(row.media_path).replace(/^[^_]+_/, '') : null;
  const tipo = row.media_type;
  const texto = tipo === 'encaminhado' ? String(row.text || '').slice(0, 20000)
    : tipo === 'documento' && row.media_path ? await readDocumentText(row.media_path, nome) : '';
  const duracao = tipo === 'video' && row.media_path ? await videoSeconds(row.media_path) : null;
  const stat = row.media_path ? await fs.stat(row.media_path).catch(() => null) : null;
  const { rows: [{ abertos }] } = await pool.query(
    `SELECT count(*)::int AS abertos FROM assistant_materials WHERE number_id = $1 AND status IN ('novo', 'apresentado')`, [number.id]
  );
  const codigo = `M${abertos + 1}`;
  await pool.query(
    `INSERT INTO assistant_materials (number_id, inbound_id, codigo, tipo, nome, legenda, texto, media_path, tamanho, duracao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [number.id, row.id, codigo, tipo, nome || meta.nome || null, tipo === 'encaminhado' ? null : (row.text || null), texto || null,
      row.media_path || null, stat?.size || null, duracao]
  );
  return { codigo, primeiro: abertos === 0 };
}

/** Números com lote parado há FLUSH_SECONDS: devolve [{ number_id, materiais }] e marca como apresentados. */
export async function takeReadyBatches(pool) {
  await ensureMaterialsSchema(pool);
  const { rows } = await pool.query(
    `SELECT number_id FROM assistant_materials WHERE status = 'novo'
      GROUP BY number_id HAVING max(created_at) < now() - ($1 || ' seconds')::interval`, [String(FLUSH_SECONDS)]
  );
  const batches = [];
  for (const { number_id } of rows) {
    const { rows: materiais } = await pool.query(
      `UPDATE assistant_materials SET status = 'apresentado', updated_at = now()
        WHERE number_id = $1 AND status = 'novo' RETURNING *`, [number_id]
    );
    const { rows: anteriores } = await pool.query(
      `SELECT * FROM assistant_materials WHERE number_id = $1 AND status = 'apresentado' AND NOT (id = ANY($2::uuid[])) ORDER BY created_at`,
      [number_id, materiais.map((m) => m.id)]
    );
    batches.push({ number_id, materiais: [...anteriores, ...materiais].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) });
  }
  return batches;
}

/** A mensagem que vai ao Claude com o lote (o modelo decide cliente, roteiro de cada vídeo e propõe guardar_material). */
export function batchPrompt(materiais) {
  const linhas = materiais.map((m) => {
    const partes = [`#${m.codigo} ${TIPO_LABEL[m.tipo] || m.tipo}`];
    if (m.nome) partes.push(m.nome);
    if (m.duracao) partes.push(`${m.duracao} s`);
    if (m.legenda) partes.push(`legenda: «${clip(m.legenda, 300)}»`);
    let linha = partes.join(' · ');
    if (m.texto) linha += `\n   texto: «${clip(m.texto, 2500)}»`;
    return linha;
  });
  return [
    `[Material encaminhado ao PULSE: ${materiais.length} item(ns). Não é um pedido; são brutos e roteiros de um cliente.]`,
    ...linhas,
    '',
    'Organize: descubra o cliente (pelo texto, pelos nomes ou pergunte), junte cada vídeo ao roteiro dele (pela fala/legenda,'
    + ' pelo título do roteiro ou pela ordem em que chegaram) e use guardar_material com um item por vídeo final. Se não der'
    + ' para saber qual vídeo é de qual roteiro, pergunte com uma enquete. Não invente roteiro: use o texto que veio.',
  ].join('\n');
}

export async function materialsByCode(pool, numberId, codes) {
  const { rows } = await pool.query(
    `SELECT * FROM assistant_materials WHERE number_id = $1 AND status IN ('novo', 'apresentado') AND codigo = ANY($2::text[])`,
    [numberId, codes]
  );
  return rows;
}

const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Vídeo';

/** No "sim": copia os arquivos para <pasta do cliente>/<título>/ no Drive e devolve o id da pasta criada. */
export async function saveMaterialsToDrive(clientFolderId, titulo, materiais) {
  const base = `${RCLONE_REMOTE},root_folder_id=${clientFolderId}:`;
  const pasta = safeName(titulo);
  for (const m of materiais) {
    if (!m.media_path) continue;
    const nome = safeName(m.nome || path.basename(m.media_path));
    const sub = m.tipo === 'imagem' ? `${pasta}/B-roll` : pasta;
    await run('rclone', ['copyto', m.media_path, `${base}${sub}/${nome}`, '--retries', '3'], { timeout: 30 * 60_000, maxBuffer: 10 * 1024 * 1024 });
  }
  const { stdout } = await run('rclone', ['lsjson', base, '--dirs-only'], { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 });
  const dir = JSON.parse(stdout || '[]').find((d) => d.Name === pasta);
  if (!dir?.ID) throw new Error(`A pasta "${pasta}" não apareceu no Drive depois da cópia.`);
  return { folderId: dir.ID, pasta };
}

export async function removeMaterialFiles(materiais) {
  for (const m of materiais) if (m.media_path) await fs.unlink(m.media_path).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// Limpeza das versões antigas de vídeo (edit_versions)
// ═══════════════════════════════════════════════════════════════
// Cada entrega/alteração dos editores (sobretudo dos agentes) guarda o vídeo inteiro, e o disco
// da VPS enchia (24 GB numa semana). Regra decidida pelo dono em 26/10/2026:
// - cada card fica com a versão atual e a anterior (para comparar);
// - card aprovado pelo cliente (agendamentos, acompanhamento, arquivado) fica só com a final;
// - nunca apaga arquivo em uso em outra tabela (portal, entregas, card, fila do WhatsApp...)
//   nem arquivo com menos de 24 h. Menção em histórico, log ou recado não conta como uso.
// O histórico continua: a linha da versão fica, só ganha video_deleted_at.

const FINAL_ONLY_COLUMNS = new Set(['agendamentos', 'acompanhamento', 'arquivado']);
// Histórico, logs, avisos e recados só registram que o vídeo existiu ("versão 3 entregue: <link>"):
// citar o arquivo ali não é uso. Sem esta exceção quase nenhuma versão antiga saía.
const LOG_TABLE_RE = /(_history|_log|_logs|_messages|_activity|notifications|^wa_inbound)$/;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Caminhos relativos (dentro de /uploads/) citados em qualquer coluna de texto/json/array. */
async function collectReferencedUploads(pool, uploadRelativePath) {
  const { rows: columns } = await pool.query(`
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.table_name <> 'edit_versions'
       AND (c.data_type IN ('text', 'character varying', 'jsonb', 'json') OR c.data_type = 'ARRAY')`);
  const referenced = new Set();
  for (const { table_name: table, column_name: column } of columns) {
    if (LOG_TABLE_RE.test(table)) continue;
    const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;
    let rows = [];
    try {
      ({ rows } = await pool.query(
        `SELECT ${ident(column)}::text AS v FROM public.${ident(table)} WHERE ${ident(column)}::text LIKE '%/uploads/%'`
      ));
    } catch { continue; }
    for (const { v } of rows) {
      for (const match of String(v).matchAll(/\/uploads\/[^"'\s,)\]}]+/g)) {
        const relative = uploadRelativePath(match[0]);
        if (relative) referenced.add(relative);
      }
    }
  }
  return referenced;
}

/**
 * Apaga os vídeos das versões antigas sem uso. Devolve o resumo (arquivos, bytes, ignorados).
 * deps: removeUploadFile(url) → bytes liberados (o do server apaga junto a versão leve <nome>.web.mp4,
 * e os bytes dela entram na conta); uploadRelativePath(url) → caminho relativo.
 */
export async function cleanupOldEditVersions(pool, { removeUploadFile, uploadRelativePath, dryRun = false, now = Date.now() } = {}) {
  await pool.query(`ALTER TABLE edit_versions ADD COLUMN IF NOT EXISTS video_deleted_at TIMESTAMPTZ`);
  await pool.query(`CREATE TABLE IF NOT EXISTS upload_cleanup_log (
    id BIGSERIAL PRIMARY KEY, path TEXT NOT NULL, bytes BIGINT NOT NULL DEFAULT 0, reason TEXT,
    task_id UUID, version INTEGER, deleted_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const { rows: versions } = await pool.query(`
    SELECT v.id, v.task_id, v.version, v.video_url, v.created_at, v.video_deleted_at, t.kanban_column,
           row_number() OVER (PARTITION BY v.task_id ORDER BY v.version DESC) AS rank
      FROM edit_versions v
      LEFT JOIN content_tasks t ON t.id = v.task_id
     WHERE v.video_url IS NOT NULL AND v.video_url <> ''`);

  const keep = [];
  const candidates = [];
  for (const v of versions) {
    const keepCount = FINAL_ONLY_COLUMNS.has(v.kanban_column) ? 1 : 2;
    if (Number(v.rank) <= keepCount) keep.push(v);
    else if (!v.video_deleted_at) candidates.push(v);
  }
  if (!candidates.length) return { deleted: 0, bytes: 0, skipped: 0 };

  const referenced = await collectReferencedUploads(pool, uploadRelativePath);
  // O mesmo arquivo pode estar numa versão que fica (ex.: cópia do pacote de stories)
  for (const v of keep) {
    const relative = uploadRelativePath(v.video_url);
    if (relative) referenced.add(relative);
  }

  const summary = { deleted: 0, bytes: 0, skipped: 0 };
  for (const v of candidates) {
    const relative = uploadRelativePath(v.video_url);
    const tooNew = now - new Date(v.created_at).getTime() < MIN_AGE_MS;
    if (!relative || tooNew || referenced.has(relative)) { summary.skipped++; continue; }
    const reason = FINAL_ONLY_COLUMNS.has(v.kanban_column) ? 'card aprovado: fica só a versão final' : 'versão antiga (ficam as 2 últimas)';
    const freed = dryRun ? 0 : removeUploadFile(v.video_url);
    if (!dryRun) {
      await pool.query(`UPDATE edit_versions SET video_deleted_at = now() WHERE id = $1`, [v.id]);
      await pool.query(
        `INSERT INTO upload_cleanup_log (path, bytes, reason, task_id, version) VALUES ($1, $2, $3, $4, $5)`,
        [relative, freed, reason, v.task_id, v.version]
      );
    }
    summary.deleted++;
    summary.bytes += freed;
  }
  return summary;
}

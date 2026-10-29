// Leitura das pastas do Google Drive dos clientes (entrada de vídeos pelo Drive, agentDriveRoutes.mjs).
//
// As pastas dos clientes são compartilhadas como "qualquer pessoa com o link", então o servidor lê sem
// credencial: a página pública embeddedfolderview lista uma pasta (nome, id, se é pasta, data) e o
// drive.usercontent baixa um arquivo. Com GOOGLE_DRIVE_API_KEY no .env a listagem passa a usar a
// Drive API v3 (mesmo resultado, com datas exatas); pasta que não é pública falha nos dois caminhos.
//
// "Pasta de vídeo" (unidade): a pasta que tem vídeos dentro. Subpastas de partes do mesmo vídeo
// (Falas, Takes, B-roll…) sobem para a pasta de cima: "Você sabe…/Falas" vira "Você sabe…".

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const VIDEO_EXT = /\.(mov|mp4|m4v|avi|mkv|3gp|webm|mts|m2ts|hevc|wmv|mpg|mpeg)$/i;
// subpasta que é parte do vídeo de cima (não é um vídeo próprio)
const PART_FOLDER = /^(falas?|takes?|tomadas?|b-?rolls?|broll|apoio|imagens?|cenas?|brutos?|extras?|[aá]udios?|grava[cç](ões|oes|ão|ao)|v[ií]deos?|clipes?|capta[cç](ão|ao|ões|oes)|material|arquivos?|celular|c[aâ]mera|drone)(?![a-zà-ú])/i;
// pasta de vídeo já pronto/descartado: não entra na varredura (nem as de dentro)
const SKIP_FOLDER = /(pront[oa]s?|editad[oa]s?|exportad|finaliz|entregues?|postad[oa]s?|lixo|arquivad[oa]s?|descart|aprovad[oa]s?)\b/i;
// pasta de organização (mês, ano, tipo de conteúdo): um card ligado a ela não cobre o que está dentro
const ORGANIZER_FOLDER = /^(((janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(\s*(de\s*)?\d{2,4})?)|\d{1,2}[-/.]\d{2,4}|20\d{2}|reels?|stor(y|ies|ys)|criativos?|an[uú]ncios?|tr[aá]fego|v[ií]deos?|conte[uú]dos?|grava[cç](ões|oes)|semana(\s*\d+)?)$/i;

const MONTHS_EN = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

export const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim();

/** Id de um link do Drive (pasta ou arquivo) ou null. */
export function driveIdFromLink(link) {
  const text = String(link || '');
  const m = text.match(/\/folders\/([A-Za-z0-9_-]{10,})/)
    || text.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/)
    || text.match(/[?&]id=([A-Za-z0-9_-]{10,})/)
    || text.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

/** Todos os ids de Drive citados num texto (o card de story guarda as pastas na descrição). */
export function driveIdsInText(text) {
  const ids = new Set();
  const re = /(?:\/folders\/|\/file\/d\/|[?&]id=)([A-Za-z0-9_-]{10,})/g;
  let m;
  while ((m = re.exec(String(text || '')))) ids.add(m[1]);
  return ids;
}

export const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
export const fileDownloadUrl = (id) => (process.env.GOOGLE_DRIVE_API_KEY
  ? `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(process.env.GOOGLE_DRIVE_API_KEY)}`
  : `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);

export const isVideoName = (name) => VIDEO_EXT.test(String(name || '').trim());
export const isPartFolder = (name) => PART_FOLDER.test(cleanName(name));
export const isSkipFolder = (name) => SKIP_FOLDER.test(cleanName(name));
export const isOrganizerFolder = (name) => ORGANIZER_FOLDER.test(cleanName(name));

/** Data da coluna "Last modified" da página pública: "4:35 PM" (hoje), "Oct 16" (este ano), "8/3/25". */
export function parseEmbeddedDate(text, now = new Date()) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(t)) return now.toISOString();
  let m = t.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (m && MONTHS_EN[m[1].toLowerCase()] !== undefined) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), MONTHS_EN[m[1].toLowerCase()], Number(m[2]), 12));
    if (d.getTime() > now.getTime() + 86400000) d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString();
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2]), 12)).toISOString();
  }
  return null;
}

const decodeHtml = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** Itens da página embeddedfolderview: [{ id, name, folder, modified }]. */
export function parseEmbeddedFolder(html, now = new Date()) {
  const items = [];
  const parts = String(html || '').split('<div class="flip-entry" id="entry-').slice(1);
  for (const part of parts) {
    const id = part.slice(0, part.indexOf('"'));
    const href = (part.match(/href="([^"]+)"/) || [])[1] || '';
    const name = decodeHtml((part.match(/class="flip-entry-title">([^<]*)</) || [])[1] || '');
    const modifiedText = (part.match(/class="flip-entry-last-modified"><div>([^<]*)</) || [])[1] || '';
    if (!id) continue;
    items.push({ id, name: cleanName(name), folder: href.includes('/drive/folders/'), modified: parseEmbeddedDate(modifiedText, now) });
  }
  return items;
}

export class DriveFolderError extends Error {}

async function listViaApi(folderId, key, fetchImpl) {
  const items = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, createdTime)',
      pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', key,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const r = await fetchImpl(`https://www.googleapis.com/drive/v3/files?${params}`);
    if (!r.ok) throw new DriveFolderError(`Drive API ${r.status} na pasta ${folderId}`);
    const body = await r.json();
    for (const f of body.files || []) {
      items.push({ id: f.id, name: cleanName(f.name), folder: f.mimeType === FOLDER_MIME, modified: f.createdTime || f.modifiedTime || null });
    }
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return items;
}

/** Conteúdo de uma pasta do Drive (só o primeiro nível). */
export async function listDriveFolder(folderId, { fetchImpl = fetch, now = new Date() } = {}) {
  const key = process.env.GOOGLE_DRIVE_API_KEY;
  if (key) return listViaApi(folderId, key, fetchImpl);
  const r = await fetchImpl(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0 (PulseAgencyFlow)' },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await r.text();
  if (!r.ok || !html.includes('flip-entries')) {
    throw new DriveFolderError('a pasta não abriu sem login (compartilhe como "qualquer pessoa com o link")');
  }
  return parseEmbeddedFolder(html, now);
}

/**
 * Percorre a pasta do cliente. Devolve { folders: Map<id, nó>, truncated }.
 * nó = { id, name, parent, depth, path: [nomes da raiz até ele], videos: [{id, name, modified}], children: [ids], modified }
 */
export async function crawlDrive(rootId, { maxFolders = 600, maxDepth = 7, concurrency = 6, list = listDriveFolder } = {}) {
  const folders = new Map();
  folders.set(rootId, { id: rootId, name: '', parent: null, depth: 0, path: [], videos: [], children: [], modified: null });
  const queue = [rootId];
  let truncated = false;
  let firstError = null;
  async function visit(id) {
    const node = folders.get(id);
    let items;
    try {
      items = await list(id);
    } catch (error) {
      if (id === rootId) throw error;
      node.error = error.message;
      firstError = firstError || error.message;
      return;
    }
    for (const item of items) {
      if (item.folder) {
        if (folders.has(item.id) || isSkipFolder(item.name)) continue;
        if (node.depth + 1 > maxDepth) continue;
        if (folders.size >= maxFolders) { truncated = true; continue; }
        folders.set(item.id, {
          id: item.id, name: item.name, parent: id, depth: node.depth + 1, path: [...node.path, item.name],
          videos: [], children: [], modified: item.modified,
        });
        node.children.push(item.id);
        queue.push(item.id);
      } else if (isVideoName(item.name)) {
        node.videos.push({ id: item.id, name: item.name, modified: item.modified });
      }
    }
  }
  const running = new Set();
  while (queue.length || running.size) {
    while (queue.length && running.size < concurrency) {
      const p = visit(queue.shift()).finally(() => running.delete(p));
      running.add(p);
    }
    if (running.size) await Promise.race(running);
  }
  return { folders, truncated, error: firstError };
}

/**
 * Sobe de uma pasta com vídeos até a pasta do vídeo: a mais alta do caminho (abaixo da raiz, fora as de
 * organização) que tenha uma subpasta de parte (Falas, Takes, B-roll…). "Sorteio/Takes/Dança" vira
 * "Sorteio"; "Story 15/Troca de óleo" continua sendo um story (Story 15 não tem subpasta de parte).
 */
function unitOf(folders, id) {
  let unit = folders.get(id);
  for (let a = unit; a && a.depth > 0; a = folders.get(a.parent)) {
    if (a !== unit || isPartFolder(a.name)) {
      const anchor = a.children.some((c) => isPartFolder(folders.get(c)?.name)) && !isOrganizerFolder(a.name);
      if (anchor) unit = a;
    }
  }
  return unit;
}

/** Ids da subárvore de uma pasta (pastas e vídeos). */
function subtreeIds(folders, id, out = new Set()) {
  const node = folders.get(id);
  if (!node) return out;
  out.add(node.id);
  node.videos.forEach((v) => out.add(v.id));
  node.children.forEach((c) => subtreeIds(folders, c, out));
  return out;
}

/** Vídeos da subárvore, sem entrar em outra pasta de vídeo de dentro. */
function unitVideos(folders, unitId, unitIds) {
  const out = [];
  const walk = (id, sub) => {
    const node = folders.get(id);
    if (!node) return;
    node.videos.forEach((v) => out.push({ ...v, folder: sub }));
    node.children.forEach((c) => { if (!unitIds.has(c)) walk(c, [...sub, folders.get(c)?.name].filter(Boolean)); });
  };
  walk(unitId, []);
  return out;
}

/** Tipo de conteúdo pelo caminho (STORY/…, REELS/…, Criativos/…); null quando não dá para saber. */
export function guessContentType(pathNames) {
  const joined = pathNames.map(cleanName).join(' / ');
  if (/\bstor(y|ies|ys)\b/i.test(joined)) return 'story';
  if (/criativ|an[uú]ncio|tr[aá]fego|\bads?\b|campanha/i.test(joined)) return 'criativo';
  if (/\breels?\b/i.test(joined)) return 'reels';
  return null;
}

/**
 * Pastas de vídeo da varredura, marcando as que já têm card.
 * linkedIds: ids de Drive (pastas ou arquivos) já ligados a um card ou já enviados por esta tela.
 */
export function videoUnits(crawl, linkedIds) {
  const { folders } = crawl;
  const unitMap = new Map();
  for (const node of folders.values()) {
    if (!node.videos.length || node.depth === 0) continue;
    const unit = unitOf(folders, node.id);
    if (unit && unit.depth > 0) unitMap.set(unit.id, unit);
  }
  const unitIds = new Set(unitMap.keys());
  const units = [];
  for (const unit of unitMap.values()) {
    const videos = unitVideos(folders, unit.id, unitIds);
    // card ligado à pasta, a algo de dentro dela ou a uma pasta de cima que não seja de organização
    // (o "Story 15" que tem uma pasta por story) já cobre esta pasta
    let coveredBy = null;
    for (const id of subtreeIds(folders, unit.id)) if (linkedIds.has(id)) { coveredBy = id; break; }
    if (!coveredBy) {
      let up = folders.get(unit.parent);
      while (up && up.depth > 0) {
        if (linkedIds.has(up.id) && !isOrganizerFolder(up.name)) { coveredBy = up.id; break; }
        up = folders.get(up.parent);
      }
    }
    const dates = [unit.modified, ...videos.map((v) => v.modified)].filter(Boolean).sort();
    const parent = folders.get(unit.parent);
    units.push({
      id: unit.id,
      name: unit.name,
      path: unit.path.slice(0, -1),
      parent_id: parent && parent.depth > 0 ? parent.id : null,
      parent_name: parent && parent.depth > 0 ? parent.name : null,
      parent_is_organizer: parent ? (parent.depth === 0 || isOrganizerFolder(parent.name)) : true,
      url: folderUrl(unit.id),
      video_count: videos.length,
      videos: videos.slice(0, 40).map((v) => ({ id: v.id, name: v.name, sub: v.folder.join(' / ') })),
      modified: dates.at(-1) || null,
      suggested_type: guessContentType(unit.path),
      covered: !!coveredBy,
      covered_by: coveredBy,
    });
  }
  units.sort((a, b) => String(b.modified || '').localeCompare(String(a.modified || '')) || a.name.localeCompare(b.name));
  return units;
}

/** Texto comparável (sem acento, caixa, pontuação) para achar o roteiro pelo nome da pasta. */
export function normalizeTitle(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Roteiro do cliente com o mesmo título da pasta (ou um contido no outro, com 12+ letras). */
export function matchScript(folderName, scripts) {
  const name = normalizeTitle(folderName);
  if (!name) return null;
  const exact = scripts.find((s) => normalizeTitle(s.title) === name);
  if (exact) return exact;
  if (name.length < 12) return null;
  return scripts.find((s) => {
    const t = normalizeTitle(s.title);
    return t.length >= 12 && (t.includes(name) || name.includes(t));
  }) || null;
}

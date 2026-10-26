// ─── Agentes de design (artes) ──────────────────────────────
// Mesma ideia dos agentes de edição (agentRoutes.mjs), para o Kanban de Design:
// designers-agentes pegam artes da fila, entregam na coluna "Análise IA"; o revisor de artes
// dá o parecer (aprovado → revisão humana "em_analise"; ajustes → "ajustes" para o mesmo designer)
// e cada erro apontado fica guardado para a equipe aprender. A chefe (Marcely) vê as paradas,
// atribui e move. Autenticação: a mesma chave "Authorization: Agent <chave>" (verifyAgent).
//
// Funções novas das chaves: 'designer' (cria artes) e 'revisor_arte' (revisa artes).
// A chefe continua 'chefe' e usa as rotas de chefe daqui também.
//
// Rotas do agente:
//   GET  /api/agent/design/queue                  (designer) fila de artes da cidade do agente
//   GET  /api/agent/design/tasks/:id              tudo da arte: brief, copy, formato, Drive, referências, ajustes, pareceres
//   POST /api/agent/design/tasks/:id/claim        (designer) pega a arte (atômico; uma por vez)
//   POST /api/agent/design/heartbeat              { step, task_id? } sinal de vida da arte que está com o agente
//   POST /api/agent/design/tasks/:id/deliver      (designer) multipart: files[] (PNG/JPG/PDF, na ordem), editable, note, force
//   POST /api/agent/design/tasks/:id/release      { reason } devolve a arte
//   GET  /api/agent/design/review-queue           (revisor_arte, chefe) artes em Análise IA
//   POST /api/agent/design/tasks/:id/review       (revisor_arte, chefe) { verdict: aprovado|ajustes, notes, errors: [{category, description}] }
//   POST /api/agent/design/tasks/:id/references-archived  (designer, chefe) { link } referências guardadas no Drive do cliente
//   GET  /api/agent/design/learning?designer=&days=   erros por categoria (designer vê só os próprios)
//   GET  /api/agent/design/stale?minutes=&hours=  (chefe) artes paradas
//   POST /api/agent/design/tasks/:id/assign       (chefe) { to, reason } passa para um designer-agente
//   POST /api/agent/design/tasks/:id/move         (chefe) { column, reason, notes }
//
// Rotas do sistema (login normal):
//   GET  /api/design-agents                       agentes de design (selo e filtro "IA" no Kanban)
//   GET  /api/design-tasks/:id/agent-reviews      pareceres da Análise IA de uma arte
//   GET  /api/agents/design-overview              (admin) painel de Agentes: artes, entregas e aprendizado

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { normalizeCityValue } from './lib/cityResolution.mjs';

export const DESIGN_AGENT_ROLES = new Set(['designer', 'revisor_arte']);

// ── Formatos e dimensões (espelho de src/lib/designBrief.ts) ──
export const DESIGN_FORMAT_PRESETS = {
  feed: { label: 'Feed', width: 1080, height: 1350, unit: 'px', format_type: 'feed' },
  quadrado: { label: 'Quadrado', width: 1080, height: 1080, unit: 'px', format_type: 'feed' },
  story: { label: 'Story', width: 1080, height: 1920, unit: 'px', format_type: 'story' },
  carrossel: { label: 'Carrossel', width: 1080, height: 1350, unit: 'px', slides: 5, format_type: 'carrossel' },
  capa_destaque: { label: 'Capa de destaque', width: 1080, height: 1920, unit: 'px', format_type: 'capa' },
  thumbnail: { label: 'Thumbnail', width: 1280, height: 720, unit: 'px', format_type: 'thumbnail' },
  panfleto_a5: { label: 'Panfleto A5', width: 148, height: 210, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, format_type: 'midia_fisica' },
  panfleto_a4: { label: 'Panfleto A4', width: 210, height: 297, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, format_type: 'midia_fisica' },
  banner: { label: 'Banner', width: 90, height: 120, unit: 'cm', dpi: 150, bleed_mm: 5, print: true, format_type: 'midia_fisica' },
  outdoor: { label: 'Outdoor 9×3 m', width: 900, height: 300, unit: 'cm', dpi: 30, bleed_mm: 0, print: true, format_type: 'midia_fisica' },
  cartao_visita: { label: 'Cartão de visita', width: 90, height: 50, unit: 'mm', dpi: 300, bleed_mm: 3, print: true, format_type: 'midia_fisica' },
  logomarca: { label: 'Logomarca (vetor)', unit: null, format_type: 'logomarca' },
  personalizado: { label: 'Personalizado', unit: 'px', format_type: 'midia_fisica' },
};

// tarefas antigas (sem `dimensions`): o formato vem do format_type
const LEGACY_FORMAT_PRESET = {
  feed: 'feed', story: 'story', carrossel: 'carrossel', capa: 'capa_destaque', thumbnail: 'thumbnail', logomarca: 'logomarca',
};

export const DESIGN_ERROR_CATEGORIES = {
  texto: 'Texto / ortografia',
  marca: 'Marca / cores / logo',
  formato: 'Formato / dimensão',
  hierarquia: 'Hierarquia / legibilidade',
  informacao: 'Informação obrigatória faltando',
  imagem: 'Imagem / qualidade',
};
const CATEGORY_ALIASES = {
  texto: 'texto', ortografia: 'texto', gramatica: 'texto', copy: 'texto',
  marca: 'marca', cor: 'marca', cores: 'marca', logo: 'marca', identidade: 'marca',
  formato: 'formato', dimensao: 'formato', tamanho: 'formato', medida: 'formato', sangria: 'formato',
  hierarquia: 'hierarquia', legibilidade: 'hierarquia', leitura: 'hierarquia',
  informacao: 'informacao', info: 'informacao', obrigatoria: 'informacao', faltando: 'informacao',
  imagem: 'imagem', qualidade: 'imagem', foto: 'imagem', resolucao: 'imagem',
};

const semAcento = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function normalizeErrorCategory(raw) {
  return CATEGORY_ALIASES[semAcento(raw).replace(/[^a-z]/g, '')] || null;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const fmtNum = (v) => String(Math.round(Number(v) * 100) / 100).replace('.', ',');

/** Formato da arte (com a medida em pixels que o agente precisa exportar). null = não informado. */
export function describeDesignFormat(dimensions, formatType) {
  let dims = parseJson(dimensions);
  if (!dims || !dims.preset) {
    const legacy = LEGACY_FORMAT_PRESET[formatType];
    if (!legacy) return null; // ex.: "midia_fisica" sem medida
    dims = { preset: legacy, legacy: true };
  }
  const base = DESIGN_FORMAT_PRESETS[dims.preset] || DESIGN_FORMAT_PRESETS.personalizado;
  const f = { ...base, ...dims };
  const unit = f.unit === null ? null : (['px', 'cm', 'mm'].includes(f.unit) ? f.unit : 'px');
  const width = num(f.width);
  const height = num(f.height);
  if (dims.preset !== 'logomarca' && (!width || !height)) return null;
  const dpi = unit && unit !== 'px' ? (num(f.dpi) || 300) : null;
  const bleed = unit && unit !== 'px' ? (Number(f.bleed_mm) >= 0 ? Number(f.bleed_mm) : 3) : 0;
  const print = unit === 'cm' || unit === 'mm' || !!f.print;
  const slides = dims.preset === 'carrossel' ? Math.max(2, Math.min(20, Number(f.slides) || 5)) : null;
  const toMm = (v) => (unit === 'cm' ? v * 10 : v);
  let pixels = null;
  let pixelsWithBleed = null;
  if (unit === 'px') pixels = { width: Math.round(width), height: Math.round(height) };
  else if (unit) {
    const px = (mm) => Math.round((mm / 25.4) * dpi);
    pixels = { width: px(toMm(width)), height: px(toMm(height)) };
    pixelsWithBleed = { width: px(toMm(width) + 2 * bleed), height: px(toMm(height) + 2 * bleed) };
  }
  const size = unit ? `${fmtNum(width)}×${fmtNum(height)} ${unit}` : 'vetor';
  const label = (unit ? `${base.label} · ${size}` : base.label)
    + (slides ? ` · ${slides} slides` : '')
    + (print ? ` · ${dpi} dpi${bleed ? ` + sangria ${fmtNum(bleed)} mm` : ''}` : '');
  return {
    preset: dims.preset,
    name: base.label,
    label,
    width, height, unit,
    slides,
    dpi,
    bleed_mm: unit ? bleed : null,
    print,
    pixels,
    pixels_with_bleed: pixelsWithBleed,
    width_mm: unit && unit !== 'px' ? toMm(width) : null,
    height_mm: unit && unit !== 'px' ? toMm(height) : null,
    legacy: !!dims.legacy,
    notes: f.notes ? String(f.notes).slice(0, 500) : null,
    expected_files: print ? 'PDF de impressão (com sangria e marcas de corte se a gráfica pedir)' : (unit ? 'PNG ou JPG' : 'PNG + PDF/AI vetorial'),
  };
}

const COPY_FIELDS = [
  ['headline', 'Título / chamada principal'],
  ['support', 'Texto de apoio'],
  ['cta', 'Chamada para ação (CTA)'],
];
const REQUIRED_INFO_FIELDS = [
  ['phone', 'Telefone'], ['address', 'Endereço'], ['price', 'Preço'], ['date', 'Data'], ['handle', '@'], ['other', 'Outras'],
];

/** Copy estruturada da arte (copy_brief). */
export function describeDesignCopy(copyBrief, copyText) {
  const b = parseJson(copyBrief) || {};
  const pick = (k) => (typeof b[k] === 'string' && b[k].trim() ? b[k].trim() : null);
  const required = {};
  for (const [k] of REQUIRED_INFO_FIELDS) {
    const v = pick(k) || (b.required && typeof b.required[k] === 'string' && b.required[k].trim() ? b.required[k].trim() : null);
    if (v) required[k] = v;
  }
  return {
    headline: pick('headline'),
    support: pick('support'),
    cta: pick('cta'),
    required,
    text: copyText || null,
    structured: COPY_FIELDS.some(([k]) => pick(k)) || Object.keys(required).length > 0,
  };
}

/** O mínimo para a arte poder ser feita (mesma regra do formulário de criação). */
export function designBriefMissing(task) {
  const missing = [];
  if (!task.client_id && !String(task.prospect_name || '').trim()) missing.push('cliente');
  if (!describeDesignFormat(task.dimensions, task.format_type)) missing.push('formato/dimensão');
  const copy = describeDesignCopy(task.copy_brief, task.copy_text);
  const hasCopy = copy.headline || copy.support || copy.cta || String(task.copy_text || '').trim() || String(task.description || '').trim();
  if (!hasCopy) missing.push('copy ou descrição');
  return missing;
}

// ── Verificação dos arquivos entregues ──
function readHead(file, bytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

export function sniffArtKind(head) {
  if (head.length >= 8 && head.readUInt32BE(0) === 0x89504e47 && head.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
}

/** Largura × altura de PNG/JPG (pixels) ou da 1ª página do PDF (mm), quando der para ler. */
export function readArtSize(file, kind) {
  try {
    if (kind === 'png') {
      const h = readHead(file, 32);
      return { width: h.readUInt32BE(16), height: h.readUInt32BE(20), unit: 'px' };
    }
    if (kind === 'jpg') {
      const h = readHead(file, 4 * 1024 * 1024);
      let i = 2;
      while (i + 9 < h.length) {
        if (h[i] !== 0xff) { i += 1; continue; }
        const marker = h[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = h.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: h.readUInt16BE(i + 7), height: h.readUInt16BE(i + 5), unit: 'px' };
        }
        i += 2 + len;
      }
      return null;
    }
    if (kind === 'pdf') {
      const text = readHead(file, 4 * 1024 * 1024).toString('latin1');
      const m = text.match(/\/(?:Trim|Media)Box\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
      if (!m) return null;
      const [x0, y0, x1, y1] = m.slice(1).map(Number);
      const pt = (v) => (Math.abs(v) * 25.4) / 72;
      return { width: Math.round(pt(x1 - x0) * 10) / 10, height: Math.round(pt(y1 - y0) * 10) / 10, unit: 'mm' };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Confere as artes entregues contra o formato pedido.
 * errors = recusa a entrega (arte digital fora da medida, sem --forcar); warnings = só avisa.
 */
export function checkDeliveredArts(format, arts) {
  const errors = [];
  const warnings = [];
  if (!format) {
    warnings.push('A arte não tem formato/dimensão no card: não deu para conferir a medida.');
    return { errors, warnings };
  }
  if (format.slides && arts.length !== format.slides) {
    warnings.push(`O card pede ${format.slides} slides e foram entregues ${arts.length}.`);
  }
  arts.forEach((art, i) => {
    const n = `Arte ${i + 1}`;
    const size = art.size;
    if (format.unit === 'px') {
      if (art.kind === 'pdf') { warnings.push(`${n}: formato digital pede PNG/JPG (veio PDF).`); return; }
      if (size && format.pixels && (Math.abs(size.width - format.pixels.width) > 1 || Math.abs(size.height - format.pixels.height) > 1)) {
        errors.push(`${n} tem ${size.width}×${size.height} px; o card pede ${format.pixels.width}×${format.pixels.height} px.`);
      }
      return;
    }
    if (!format.unit) return; // logomarca: sem medida fixa
    if (format.print && art.kind !== 'pdf') warnings.push(`${n}: formato de impressão; a gráfica costuma pedir PDF (veio ${art.kind.toUpperCase()}).`);
    if (!size) return;
    const tol = (v) => Math.max(2, v * 0.01);
    if (size.unit === 'mm') {
      const fits = (w, h) => Math.abs(size.width - w) <= tol(w) && Math.abs(size.height - h) <= tol(h);
      const b = format.bleed_mm || 0;
      if (!fits(format.width_mm, format.height_mm) && !fits(format.width_mm + 2 * b, format.height_mm + 2 * b)) {
        // PDF em escala (ex.: outdoor 1:10) só avisa
        const ratio = size.width / size.height;
        const expected = format.width_mm / format.height_mm;
        warnings.push(`${n}: a página do PDF tem ${fmtNum(size.width)}×${fmtNum(size.height)} mm; o card pede ${fmtNum(format.width_mm)}×${fmtNum(format.height_mm)} mm${b ? ` (+${fmtNum(b)} mm de sangria)` : ''}${Math.abs(ratio - expected) < 0.01 ? ' — proporção certa, confira se está em escala' : ''}.`);
      }
    } else if (size.unit === 'px' && format.pixels) {
      const minW = format.pixels.width * 0.98;
      const minH = format.pixels.height * 0.98;
      if (size.width < minW || size.height < minH) {
        warnings.push(`${n}: ${size.width}×${size.height} px é pouco para ${format.label} (precisa de ~${(format.pixels_with_bleed || format.pixels).width}×${(format.pixels_with_bleed || format.pixels).height} px).`);
      }
    }
  });
  return { errors, warnings };
}

export function registerAgentDesignRoutes(app, { pool, uploadRoot, verifyUser, isStrictAdmin, publicUploadsUrl, agentApi, onSchemaChange }) {
  const uploadsBase = (publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');
  const { verifyAgent, pauseStateFor, ensureAgentSchema } = agentApi;

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) console.error('[agent-design] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }
  const httpError = (status, message) => Object.assign(new Error(message), { status });

  // ── Esquema (só aditivo e idempotente) ──
  let historyHasCity = false;
  // attachment_urls é JSONB na produção; em bancos antigos pode ser text[]
  let attachmentUrlsIsJson = true;
  let schemaPromise = null;
  function ensureDesignAgentSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await ensureAgentSchema();
        const { rows } = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'design_tasks'`
        );
        const have = new Set(rows.map((r) => r.column_name));
        const wanted = {
          copy_brief: 'JSONB', // copy estruturada: headline, support, cta, phone, address, price, date, handle, other
          dimensions: 'JSONB', // formato/dimensão: preset, width, height, unit, slides, dpi, bleed_mm
          materials_link: 'TEXT', // pasta do Drive com os materiais daquela arte
          designed_by: 'UUID', // quem fez a arte entregue (ajuste volta para ele)
          agent_step: 'TEXT',
          agent_heartbeat_at: 'TIMESTAMPTZ',
          references_drive_link: 'TEXT', // pasta "Referências/<data> <título>" no Drive do cliente, onde o designer arquivou
          references_archived_at: 'TIMESTAMPTZ',
        };
        const missing = Object.entries(wanted).filter(([c]) => !have.has(c));
        if (missing.length) {
          await pool.query(`ALTER TABLE design_tasks ${missing.map(([c, t]) => `ADD COLUMN IF NOT EXISTS ${c} ${t}`).join(', ')}`);
        }
        await pool.query(`
          CREATE TABLE IF NOT EXISTS design_deliveries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id UUID NOT NULL,
            version INTEGER NOT NULL,
            files JSONB NOT NULL DEFAULT '[]'::jsonb,
            editable_url TEXT,
            note TEXT,
            warnings JSONB,
            created_by UUID,
            city TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (task_id, version)
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS design_reviews (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id UUID NOT NULL,
            client_id UUID,
            version INTEGER,
            reviewer_id UUID,
            designer_id UUID,
            verdict TEXT NOT NULL,
            notes TEXT,
            error_count INTEGER NOT NULL DEFAULT 0,
            city TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS design_review_errors (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            review_id UUID NOT NULL,
            task_id UUID NOT NULL,
            client_id UUID,
            designer_id UUID,
            reviewer_id UUID,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            city TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        for (const sql of [
          'CREATE INDEX IF NOT EXISTS idx_design_deliveries_task ON design_deliveries(task_id, version DESC)',
          'CREATE INDEX IF NOT EXISTS idx_design_reviews_task ON design_reviews(task_id, created_at DESC)',
          'CREATE INDEX IF NOT EXISTS idx_design_review_errors_designer ON design_review_errors(designer_id, created_at DESC)',
          'CREATE INDEX IF NOT EXISTS idx_design_review_errors_category ON design_review_errors(category, created_at DESC)',
          `CREATE INDEX IF NOT EXISTS idx_design_tasks_agent ON design_tasks(assigned_to) WHERE agent_step IS NOT NULL`,
        ]) {
          await pool.query(sql).catch((error) => console.warn('[agent-design] índice:', error.message));
        }
        const { rowCount } = await pool.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'design_task_history' AND column_name = 'city'`
        );
        historyHasCity = rowCount > 0;
        const { rows: urlType } = await pool.query(
          `SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'design_tasks' AND column_name = 'attachment_urls'`
        );
        attachmentUrlsIsJson = !urlType.length || urlType[0].udt_name !== '_text';
        // colunas novas: o cache de colunas do /api/db/query precisa enxergar (senão o front grava e some)
        try { onSchemaChange?.(['design_tasks']); } catch { /* sem cache para limpar */ }
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }
  ensureDesignAgentSchema().catch((error) => console.error('Failed to ensure design agent schema:', error.message || error));

  async function designAgent(req, roles) {
    const agent = await verifyAgent(req);
    await ensureDesignAgentSchema();
    if (roles && !roles.includes(agent.role)) {
      const names = { designer: 'designer', revisor_arte: 'revisor de artes', chefe: 'chefe' };
      throw httpError(403, `Só ${roles.map((r) => names[r] || r).join(' ou ')} usa esta rota (sua função: ${agent.role})`);
    }
    return agent;
  }

  async function addHistory(db, taskId, userId, action, details = null, attachmentUrl = null) {
    await db.query(
      historyHasCity
        ? `INSERT INTO design_task_history (task_id, user_id, action, details, attachment_url, city)
           SELECT $1, $2, $3, $4, $5, dt.city FROM design_tasks dt WHERE dt.id = $1`
        : 'INSERT INTO design_task_history (task_id, user_id, action, details, attachment_url) VALUES ($1, $2, $3, $4, $5)',
      [taskId, userId, action, details, attachmentUrl]
    );
  }

  async function setActivity(userId, status) {
    await pool.query(
      `INSERT INTO agent_activity (user_id, status, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [userId, String(status || '').slice(0, 160) || null]
    ).catch(() => {});
  }

  async function messageAgents(fromUser, userIds, body) {
    for (const to of [...new Set(userIds.filter(Boolean).map(String))]) {
      if (to === String(fromUser)) continue;
      await pool.query('INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)', [fromUser, to, body]).catch(() => {});
    }
  }

  async function activeAgentsByRole(role) {
    const { rows } = await pool.query(
      `SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id
        WHERE k.revoked_at IS NULL AND k.role = $1`,
      [role]
    );
    return rows;
  }

  // Cidades do agente (user_cities); sem registro = Minaçu, como no resto do sistema
  async function agentCities(userId) {
    try {
      const { rows } = await pool.query('SELECT city FROM user_cities WHERE user_id::text = $1', [String(userId)]);
      const list = [...new Set(rows.map((r) => normalizeCityValue(r.city)).filter(Boolean))];
      return list.length ? list : ['minacu'];
    } catch (error) {
      if (error?.code === '42P01') return ['minacu'];
      throw error;
    }
  }
  // card sem cidade (cliente global) aparece em todas
  const CITY_MATCH = (col, param) => `(${col} IS NULL OR btrim(${col}::text) = '' OR replace(lower(btrim(${col}::text)), 'ç', 'c') = ANY(${param}::text[]))`;

  async function resolveTaskId(raw, db = pool) {
    const id = String(raw || '').trim().toLowerCase();
    if (!/^[0-9a-f-]{6,36}$/.test(id)) throw httpError(400, 'Id da arte inválido');
    const { rows } = await db.query(
      `SELECT id FROM design_tasks WHERE id::text = $1 OR id::text LIKE $1 || '%' LIMIT 2`,
      [id]
    );
    if (!rows.length) throw httpError(404, 'Arte não encontrada');
    if (rows.length > 1) throw httpError(400, 'Mais de uma arte com esse começo de id; use o id completo');
    return rows[0].id;
  }

  const PRIORITY_ORDER = `CASE dt.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END`;
  const QUEUE_FIELDS = `
    dt.id, dt.title, dt.kanban_column, dt.priority, dt.due_date, dt.format_type, dt.dimensions, dt.copy_brief,
    dt.copy_text, dt.description, dt.client_id, dt.prospect_name, dt.assigned_to, dt.designed_by, dt.materials_link,
    dt.version, dt.agent_step, dt.agent_heartbeat_at, dt.created_at, dt.updated_at, dt.city,
    c.company_name AS client_name, c.drive_link AS client_drive_link`;

  function queueItem(row, agentId) {
    const format = describeDesignFormat(row.dimensions, row.format_type);
    const missing = designBriefMissing(row);
    const avisos = [];
    if (row.client_id && !String(row.client_drive_link || '').trim()) avisos.push('cliente sem pasta do Drive');
    if (!row.client_id) avisos.push('cliente não cadastrado (sem identidade no sistema)');
    return {
      id: row.id,
      title: row.title,
      column: row.kanban_column,
      priority: row.priority,
      due_date: row.due_date,
      client: (row.client_name || row.prospect_name || 'avulso').trim(),
      format: format ? format.label : null,
      version: Number(row.version) || 1,
      mine: !!agentId && row.assigned_to === agentId && !!row.agent_step,
      adjustment: row.kanban_column === 'ajustes',
      brief_missing: missing,
      warnings: avisos,
      agent_step: row.agent_step,
      updated_at: row.updated_at,
    };
  }

  // ── Detalhe completo da arte (o que o designer precisa) ──
  async function loadTaskDetail(taskId, db = pool) {
    const { rows } = await db.query(
      `SELECT dt.*, c.company_name AS client_name, c.niche AS client_niche, c.city AS client_city, c.color AS client_color,
              c.logo_url AS client_logo_url, c.editorial AS client_editorial, c.drive_link AS client_drive_link,
              c.drive_fotos AS client_drive_fotos, c.drive_identidade_visual AS client_drive_identidade,
              pa.name AS assigned_name, pd.name AS designed_name
         FROM design_tasks dt
         LEFT JOIN clients c ON c.id = dt.client_id
         LEFT JOIN profiles pa ON pa.id = dt.assigned_to
         LEFT JOIN profiles pd ON pd.id = dt.designed_by
        WHERE dt.id = $1`,
      [taskId]
    );
    const t = rows[0];
    if (!t) throw httpError(404, 'Arte não encontrada');
    const [{ rows: history }, { rows: reviews }, { rows: errors }, { rows: deliveries }] = await Promise.all([
      db.query(
        `SELECT h.action, h.details, h.attachment_url, h.created_at, p.name AS user_name
           FROM design_task_history h LEFT JOIN profiles p ON p.id = h.user_id
          WHERE h.task_id = $1 ORDER BY h.created_at ASC`,
        [taskId]
      ),
      db.query(
        `SELECT r.id, r.version, r.verdict, r.notes, r.created_at, p.name AS reviewer_name
           FROM design_reviews r LEFT JOIN profiles p ON p.id = r.reviewer_id
          WHERE r.task_id = $1 ORDER BY r.created_at ASC`,
        [taskId]
      ),
      db.query(`SELECT review_id, category, description FROM design_review_errors WHERE task_id = $1 ORDER BY created_at ASC`, [taskId]),
      db.query(
        `SELECT d.version, d.files, d.editable_url, d.note, d.warnings, d.created_at, p.name AS by_name
           FROM design_deliveries d LEFT JOIN profiles p ON p.id = d.created_by
          WHERE d.task_id = $1 ORDER BY d.version ASC`,
        [taskId]
      ),
    ]);
    const format = describeDesignFormat(t.dimensions, t.format_type);
    const copy = describeDesignCopy(t.copy_brief, t.copy_text);
    const arts = (() => {
      const list = parseJson(t.attachment_urls);
      const all = [...(Array.isArray(list) ? list : []), t.attachment_url].filter((u) => typeof u === 'string' && u);
      return [...new Set(all)];
    })();
    const missing = designBriefMissing(t);
    const avisos = [];
    if (t.client_id && !String(t.client_drive_link || '').trim()) {
      avisos.push('O cliente não tem pasta do Drive cadastrada: peça para a equipe preencher em Clientes antes de criar (identidade, logos e fotos ficam lá).');
    }
    if (!String(t.materials_link || '').trim()) avisos.push('A arte não tem link de materiais próprio: use a pasta do cliente.');
    return {
      id: t.id,
      title: t.title,
      column: t.kanban_column,
      priority: t.priority,
      due_date: t.due_date,
      created_at: t.created_at,
      version: Number(t.version) || 1,
      client: t.client_id ? {
        id: t.client_id,
        name: (t.client_name || '').trim(),
        niche: t.client_niche,
        city: t.client_city,
        color: t.client_color,
        logo_url: t.client_logo_url,
        editorial: t.client_editorial,
        drive: { geral: t.client_drive_link || null, fotos: t.client_drive_fotos || null, identidade_visual: t.client_drive_identidade || null },
      } : { id: null, name: (t.prospect_name || 'avulso').trim(), unregistered: true },
      format,
      format_type: t.format_type,
      copy,
      description: t.description,
      observations: t.observations,
      materials_link: t.materials_link || null,
      references: {
        links: (Array.isArray(t.references_links) ? t.references_links : []).filter(Boolean),
        // arquivos enviados pela equipe (imagens, PDF, vídeo curto) ficam em reference_images
        files: (Array.isArray(t.reference_images) ? t.reference_images : []).filter(Boolean),
        images: (Array.isArray(t.reference_images) ? t.reference_images : []).filter(Boolean),
        archived_drive_link: t.references_drive_link || null,
        archived_at: t.references_archived_at || null,
        archive_folder_name: `Referências/${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())} ${String(t.title || '').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)}`,
      },
      adjustments: history
        .filter((h) => /ajuste/i.test(h.action || '') && h.details)
        .map((h) => ({ at: h.created_at, by: (h.user_name || 'cliente/sistema').trim(), action: h.action, details: h.details, attachment_url: h.attachment_url })),
      reviews: reviews.map((r) => ({
        version: r.version, verdict: r.verdict, notes: r.notes, at: r.created_at, reviewer: (r.reviewer_name || '').trim(),
        errors: errors.filter((e) => e.review_id === r.id).map((e) => ({ category: e.category, description: e.description })),
      })),
      deliveries: deliveries.map((d) => ({
        version: d.version, files: parseJson(d.files) || [], editable_url: d.editable_url, note: d.note,
        warnings: parseJson(d.warnings) || [], at: d.created_at, by: (d.by_name || '').trim(),
      })),
      current_art: arts,
      editable_file_url: t.editable_file_url || null,
      assigned_to: t.assigned_to ? { id: t.assigned_to, name: (t.assigned_name || '').trim() } : null,
      designed_by: t.designed_by ? { id: t.designed_by, name: (t.designed_name || '').trim() } : null,
      agent_step: t.agent_step,
      agent_heartbeat_at: t.agent_heartbeat_at,
      brief_missing: missing,
      brief_complete: missing.length === 0,
      warnings: avisos,
    };
  }

  async function learningSummary({ designerId = null, days = 60 } = {}) {
    const params = [String(Math.max(1, Math.min(365, Number(days) || 60)))];
    const where = [`e.created_at > now() - ($1 || ' days')::interval`];
    if (designerId) { params.push(designerId); where.push(`e.designer_id = $${params.length}`); }
    const [{ rows: byCategory }, { rows: recent }, { rows: totals }] = await Promise.all([
      pool.query(`SELECT e.category, COUNT(*)::int AS count FROM design_review_errors e WHERE ${where.join(' AND ')} GROUP BY 1 ORDER BY 2 DESC`, params),
      pool.query(
        `SELECT e.category, e.description, e.created_at, t.title, c.company_name AS client_name, p.name AS designer_name
           FROM design_review_errors e
           LEFT JOIN design_tasks t ON t.id = e.task_id
           LEFT JOIN clients c ON c.id = e.client_id
           LEFT JOIN profiles p ON p.id = e.designer_id
          WHERE ${where.join(' AND ')} ORDER BY e.created_at DESC LIMIT 15`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS reviews, COUNT(*) FILTER (WHERE verdict = 'aprovado')::int AS approved
           FROM design_reviews r WHERE r.created_at > now() - ($1 || ' days')::interval ${designerId ? 'AND r.designer_id = $2' : ''}`,
        params
      ),
    ]);
    return {
      days: Number(params[0]),
      reviews: totals[0]?.reviews || 0,
      approved: totals[0]?.approved || 0,
      by_category: byCategory.map((r) => ({ category: r.category, label: DESIGN_ERROR_CATEGORIES[r.category] || r.category, count: r.count })),
      recent: recent.map((r) => ({
        category: r.category, label: DESIGN_ERROR_CATEGORIES[r.category] || r.category, description: r.description,
        at: r.created_at, task: r.title, client: (r.client_name || '').trim() || null, designer: (r.designer_name || '').trim() || null,
      })),
    };
  }

  // fecha a sessão do cronômetro somando o tempo corrido (mesma regra do front: stopTimerFields)
  const STOP_TIMER_SQL = `
    time_spent_seconds = COALESCE(time_spent_seconds, 0) + CASE WHEN timer_running AND timer_started_at IS NOT NULL
      THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - timer_started_at)))::int ELSE 0 END,
    timer_running = false, timer_started_at = NULL`;

  // ── Fila do designer ──────────────────────────────────────
  app.get('/api/agent/design/queue', async (req, res) => {
    try {
      const agent = await designAgent(req, ['designer', 'chefe']);
      const cities = await agentCities(agent.userId);
      // a chefe vê a fila inteira de design (todas as cidades), sem pegar
      const where = agent.role === 'chefe'
        ? `dt.kanban_column IN ('nova_tarefa', 'fila_baixa_prioridade', 'executando', 'ajustes', 'analise_ia') AND ($2::text[] IS NOT NULL)`
        : null;
      const { rows } = await pool.query(
        `SELECT ${QUEUE_FIELDS}
           FROM design_tasks dt LEFT JOIN clients c ON c.id = dt.client_id
          WHERE ${where || `(
              (dt.kanban_column = 'nova_tarefa' AND (dt.assigned_to IS NULL OR dt.assigned_to = $1))
              -- ajuste volta para quem fez a arte
              OR (dt.kanban_column = 'ajustes' AND dt.designed_by = $1 AND (dt.assigned_to IS NULL OR dt.assigned_to = $1))
              -- a que já está com o agente
              OR (dt.kanban_column IN ('executando', 'ajustes') AND dt.assigned_to = $1 AND dt.agent_step IS NOT NULL)
            )
            AND ${CITY_MATCH('dt.city', '$2')}`}
          ORDER BY (dt.assigned_to = $1 AND dt.agent_step IS NOT NULL) DESC,
                   (dt.kanban_column = 'ajustes') DESC,
                   ${PRIORITY_ORDER},
                   dt.due_date ASC NULLS LAST,
                   dt.position ASC NULLS LAST,
                   dt.created_at ASC
          LIMIT 100`,
        [agent.userId, cities]
      );
      res.json({
        agent: { id: agent.userId, name: agent.name, role: agent.role, cities },
        pause: await pauseStateFor(agent.userId),
        tasks: rows.map((r) => queueItem(r, agent.userId)),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agent/design/tasks/:id', async (req, res) => {
    try {
      const agent = await designAgent(req);
      const taskId = await resolveTaskId(req.params.id);
      const task = await loadTaskDetail(taskId);
      const learning = agent.role === 'designer' ? await learningSummary({ designerId: agent.userId, days: 60 }) : null;
      res.json({ task, learning });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Pegar (atômico; uma arte por vez) ─────────────────────
  app.post('/api/agent/design/tasks/:id/claim', async (req, res) => {
    try {
      const agent = await designAgent(req, ['designer']);
      const pause = await pauseStateFor(agent.userId);
      if (pause.paused) {
        return res.status(423).json({ error: `Agentes pausados pelo sistema${pause.all ? '' : ` (${agent.name})`}. Não pegue arte nova.`, pause });
      }
      const taskId = await resolveTaskId(req.params.id);
      const { rows: busy } = await pool.query(
        `SELECT id, title FROM design_tasks
          WHERE assigned_to = $1 AND agent_step IS NOT NULL AND kanban_column IN ('executando', 'ajustes') AND id <> $2 LIMIT 1`,
        [agent.userId, taskId]
      );
      if (busy.length) {
        return res.status(409).json({ error: `Você já está com a arte "${busy[0].title}" (${busy[0].id.slice(0, 8)}). Entregue ou libere antes de pegar outra.` });
      }
      const cities = await agentCities(agent.userId);
      const { rows } = await pool.query(
        `UPDATE design_tasks SET
            kanban_column = CASE WHEN kanban_column = 'nova_tarefa' THEN 'executando' ELSE kanban_column END,
            assigned_to = $2,
            started_at = COALESCE(started_at, now()),
            timer_running = true,
            timer_started_at = CASE WHEN timer_running AND timer_started_at IS NOT NULL THEN timer_started_at ELSE now() END,
            agent_step = CASE WHEN agent_step IS NOT NULL AND assigned_to = $2 THEN agent_step ELSE 'iniciado' END,
            agent_heartbeat_at = now(),
            updated_at = now()
          WHERE id = $1
            AND (assigned_to IS NULL OR assigned_to = $2)
            AND (
              kanban_column = 'nova_tarefa'
              OR (kanban_column = 'ajustes' AND designed_by = $2)
              OR (kanban_column IN ('executando', 'ajustes') AND assigned_to = $2 AND agent_step IS NOT NULL)
            )
            AND ${CITY_MATCH('city', '$3')}
          RETURNING id, kanban_column, title`,
        [taskId, agent.userId, cities]
      );
      if (!rows.length) return res.status(409).json({ error: 'Arte indisponível (já pega por outro, fora da fila, de outra cidade ou ajuste de outro designer)' });
      const isAdjustment = rows[0].kanban_column === 'ajustes';
      await addHistory(pool, taskId, agent.userId, isAdjustment ? 'Ajuste iniciado (agente)' : 'Arte iniciada (agente)');
      await setActivity(agent.userId, `🎨 ${rows[0].title}: ${isAdjustment ? 'ajuste' : 'criando'}`);
      res.json({ task: await loadTaskDetail(taskId), learning: await learningSummary({ designerId: agent.userId, days: 60 }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  async function heartbeat(req, res, taskIdParam) {
    try {
      const agent = await designAgent(req, ['designer']);
      const step = String(req.body?.step || '').trim().slice(0, 120);
      if (!step) return res.status(400).json({ error: 'Diga a etapa (ex.: "lendo o brief", "montando o layout", "exportando")' });
      const rawId = taskIdParam || req.body?.task_id || null;
      const taskId = rawId ? await resolveTaskId(rawId) : null;
      const { rows } = await pool.query(
        `UPDATE design_tasks SET agent_step = $3, agent_heartbeat_at = now()
          WHERE assigned_to = $1 AND agent_step IS NOT NULL AND kanban_column IN ('executando', 'ajustes')
            AND ($2::uuid IS NULL OR id = $2::uuid)
          RETURNING id, title`,
        [agent.userId, taskId, step]
      );
      if (!rows.length) return res.status(409).json({ error: 'Nenhuma arte com você agora (pegue com "pulse arte pegar <id>")' });
      await setActivity(agent.userId, `🎨 ${rows[0].title}: ${step}`);
      res.json({ ok: true, tasks: rows.map((r) => ({ id: r.id, title: r.title })) });
    } catch (error) {
      sendError(res, error);
    }
  }
  app.post('/api/agent/design/heartbeat', (req, res) => heartbeat(req, res, null));
  app.post('/api/agent/design/tasks/:id/heartbeat', (req, res) => heartbeat(req, res, req.params.id));

  app.post('/api/agent/design/tasks/:id/release', async (req, res) => {
    try {
      const agent = await designAgent(req, ['designer', 'chefe']);
      const reason = String(req.body?.reason || '').trim().slice(0, 500);
      if (!reason) return res.status(400).json({ error: 'Diga o motivo (vai para o histórico da arte)' });
      const taskId = await resolveTaskId(req.params.id);
      const isChefe = agent.role === 'chefe';
      const { rows } = await pool.query(
        `UPDATE design_tasks SET
            kanban_column = CASE WHEN kanban_column = 'executando' THEN 'nova_tarefa' ELSE kanban_column END,
            assigned_to = CASE WHEN kanban_column = 'executando' THEN NULL ELSE assigned_to END,
            ${STOP_TIMER_SQL},
            agent_step = NULL,
            agent_heartbeat_at = NULL,
            updated_at = now()
          WHERE id = $1 AND kanban_column IN ('executando', 'ajustes') AND agent_step IS NOT NULL
            AND (assigned_to = $2 OR ($3 AND assigned_to IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL)))
          RETURNING id, kanban_column, title`,
        [taskId, agent.userId, isChefe]
      );
      if (!rows.length) return res.status(409).json({ error: 'Nada a liberar (a arte não está com você)' });
      await addHistory(pool, taskId, agent.userId, 'Arte devolvida pelo agente', reason);
      res.json({ ok: true, column: rows[0].kanban_column });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Referências baixadas e entendidas → o designer sobe para o Drive do cliente
  // (Referências/<AAAA-MM-DD> <título>) pelo conector do Google Drive e registra aqui o link.
  app.post('/api/agent/design/tasks/:id/references-archived', async (req, res) => {
    try {
      const agent = await designAgent(req, ['designer', 'chefe']);
      const link = String(req.body?.link || '').trim().slice(0, 1000);
      if (!/^https:\/\/(drive|docs)\.google\.com\//i.test(link)) {
        return res.status(400).json({ error: 'Mande o link da pasta no Google Drive (https://drive.google.com/...)' });
      }
      const taskId = await resolveTaskId(req.params.id);
      const { rows } = await pool.query(
        `UPDATE design_tasks SET references_drive_link = $2, references_archived_at = now()
          WHERE id = $1 AND ($3 OR assigned_to = $4 OR designed_by = $4)
          RETURNING id, references_archived_at`,
        [taskId, link, agent.role === 'chefe', agent.userId]
      );
      if (!rows.length) return res.status(409).json({ error: 'Só quem está com a arte (ou a chefe) registra as referências' });
      await addHistory(pool, taskId, agent.userId, 'Referências guardadas no Drive do cliente', link);
      res.json({ ok: true, link, archived_at: rows[0].references_archived_at });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Entrega ───────────────────────────────────────────────
  const ART_EXT = { png: '.png', jpg: '.jpg', jpeg: '.jpg', pdf: '.pdf' };
  const EDITABLE_EXT = new Set(['psd', 'psb', 'ai', 'eps', 'pdf', 'zip', 'tif', 'tiff', 'indd', 'idml', 'cdr', 'afdesign', 'afphoto', 'fig', 'sketch', 'xd', 'png', 'jpg', 'jpeg']);
  const extOf = (file) => path.extname(String(file.originalname || '')).slice(1).toLowerCase();

  const deliverUpload = multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        try {
          fs.mkdirSync(req.designUploadDir, { recursive: true });
          cb(null, req.designUploadDir);
        } catch (error) {
          cb(error);
        }
      },
      filename(req, file, cb) {
        // nome e extensão decididos aqui (nunca o nome original: um "x.html" não vira página no domínio)
        const rand = crypto.randomBytes(5).toString('hex');
        if (file.fieldname === 'editable') {
          const ext = extOf(file) === 'jpeg' ? 'jpg' : extOf(file);
          return cb(null, `editavel_${Date.now()}_${rand}.${ext}`);
        }
        req.designArtIndex = (req.designArtIndex || 0) + 1;
        cb(null, `${String(req.designArtIndex).padStart(2, '0')}_${Date.now()}_${rand}${ART_EXT[extOf(file)]}`);
      },
    }),
    limits: { fileSize: 300 * 1024 * 1024, files: 21, fieldSize: 64 * 1024 },
    fileFilter(_req, file, cb) {
      if (file.fieldname === 'files' && !ART_EXT[extOf(file)]) {
        return cb(Object.assign(new Error(`"${file.originalname}": a arte precisa ser PNG, JPG ou PDF`), { status: 400 }));
      }
      if (file.fieldname === 'editable' && !EDITABLE_EXT.has(extOf(file))) {
        return cb(Object.assign(new Error(`"${file.originalname}": arquivo editável aceito: PSD, AI, EPS, PDF, ZIP, TIFF, INDD, CDR, Figma, Affinity, Sketch, XD`), { status: 400 }));
      }
      cb(null, true);
    },
  }).fields([{ name: 'files', maxCount: 20 }, { name: 'editable', maxCount: 1 }]);

  function removeUploaded(req) {
    for (const list of Object.values(req.files || {})) {
      for (const f of list) fs.promises.unlink(f.path).catch(() => {});
    }
  }

  app.post('/api/agent/design/tasks/:id/deliver', async (req, res) => {
    let agent;
    let task;
    try {
      agent = await designAgent(req, ['designer']);
      const taskId = await resolveTaskId(req.params.id);
      const { rows } = await pool.query('SELECT * FROM design_tasks WHERE id = $1', [taskId]);
      task = rows[0];
      if (task.assigned_to !== agent.userId || !task.agent_step || !['executando', 'ajustes'].includes(task.kanban_column)) {
        return res.status(409).json({ error: 'Pegue a arte (pulse arte pegar) antes de entregar' });
      }
      req.designUploadDir = path.resolve(uploadRoot, 'design', 'artes', task.client_id || 'avulso', task.id);
      if (!req.designUploadDir.startsWith(path.resolve(uploadRoot) + path.sep)) return res.status(400).json({ error: 'Pasta inválida' });
    } catch (error) {
      return sendError(res, error);
    }

    deliverUpload(req, res, async (uploadError) => {
      if (uploadError) {
        removeUploaded(req);
        const status = uploadError.status || (uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : uploadError.code === 'ENOSPC' ? 507 : 400);
        return res.status(status).json({ error: uploadError.code === 'LIMIT_FILE_SIZE' ? 'Arquivo acima de 300 MB' : uploadError.message || 'Falha no upload' });
      }
      const files = req.files?.files || [];
      const editable = req.files?.editable?.[0] || null;
      if (!files.length) {
        removeUploaded(req);
        return res.status(400).json({ error: 'Envie pelo menos uma arte no campo "files" (PNG, JPG ou PDF)' });
      }
      // confere o conteúdo de verdade (não só a extensão)
      const arts = [];
      for (const f of files) {
        const kind = sniffArtKind(readHead(f.path, 16));
        const declared = ART_EXT[extOf(f)] === '.jpg' ? 'jpg' : extOf(f);
        if (!kind || kind !== declared) {
          removeUploaded(req);
          return res.status(400).json({ error: `"${f.originalname}" não é um ${declared.toUpperCase()} válido` });
        }
        arts.push({ file: f, kind, size: readArtSize(f.path, kind) });
      }
      const format = describeDesignFormat(task.dimensions, task.format_type);
      const check = checkDeliveredArts(format, arts);
      const force = ['1', 'true', 'sim'].includes(String(req.body?.force || '').toLowerCase());
      if (check.errors.length && !force) {
        removeUploaded(req);
        return res.status(422).json({ error: `Medida errada: ${check.errors.join(' ')} Corrija e entregue de novo (ou use --forcar se o card estiver errado e avise).`, errors: check.errors, warnings: check.warnings });
      }
      const urlOf = (f) => `${uploadsBase}/${path.relative(path.resolve(uploadRoot), f.path).split(path.sep).join('/')}`;
      const urls = arts.map((a) => urlOf(a.file));
      const editableUrl = editable ? urlOf(editable) : null;
      const note = String(req.body?.note || req.body?.notes || '').trim().slice(0, 4000) || null;
      const warnings = [...check.warnings, ...(force ? check.errors.map((e) => `(forçado) ${e}`) : [])];

      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const { rows: locked } = await db.query(
          `SELECT id, city FROM design_tasks WHERE id = $1 AND assigned_to = $2 AND agent_step IS NOT NULL
             AND kanban_column IN ('executando', 'ajustes') FOR UPDATE`,
          [task.id, agent.userId]
        );
        if (!locked.length) throw httpError(409, 'A arte mudou durante o envio; entrega cancelada');
        const { rows: vrows } = await db.query(
          `INSERT INTO design_deliveries (task_id, version, files, editable_url, note, warnings, created_by, city)
           VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM design_deliveries WHERE task_id = $1), $2::jsonb, $3, $4, $5::jsonb, $6, $7)
           RETURNING version`,
          [task.id, JSON.stringify(urls), editableUrl, note, JSON.stringify(warnings), agent.userId, locked[0].city || null]
        );
        const version = vrows[0].version;
        await db.query(
          `UPDATE design_tasks SET
              kanban_column = 'analise_ia',
              attachment_urls = ${attachmentUrlsIsJson ? '$2::jsonb' : '$2::text[]'},
              attachment_url = $3,
              editable_file_url = COALESCE($4, editable_file_url),
              designed_by = $5,
              version = $6,
              completed_at = now(),
              ${STOP_TIMER_SQL},
              agent_step = NULL,
              agent_heartbeat_at = NULL,
              updated_at = now()
            WHERE id = $1`,
          [task.id, attachmentUrlsIsJson ? JSON.stringify(urls) : urls, urls[0], editableUrl, agent.userId, version]
        );
        await addHistory(db, task.id, agent.userId, `Arte entregue pelo agente (v${version}) → Análise IA`,
          [`${urls.length} arquivo(s)${editableUrl ? ' + editável' : ''}`, note, warnings.length ? `Avisos: ${warnings.join(' ')}` : null].filter(Boolean).join(' · '),
          urls[0]);
        await db.query('COMMIT');
        await setActivity(agent.userId, `🎨 entregou "${task.title}" (v${version})`);
        const reviewers = await activeAgentsByRole('revisor_arte');
        await messageAgents(agent.userId, reviewers.map((r) => r.user_id),
          `Arte ${task.id.slice(0, 8)} "${task.title}" (v${version}) entregue por ${String(agent.name || '').trim()} e aguardando a Análise IA. Rode \`pulse arte analise\`.`);
        res.json({ ok: true, version, column: 'analise_ia', files: urls, editable_url: editableUrl, warnings });
      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        removeUploaded(req);
        sendError(res, error);
      } finally {
        db.release();
      }
    });
  });

  // ── Revisor de artes ──────────────────────────────────────
  app.get('/api/agent/design/review-queue', async (req, res) => {
    try {
      await designAgent(req, ['revisor_arte', 'chefe']);
      const { rows } = await pool.query(
        `SELECT ${QUEUE_FIELDS}, pd.name AS designed_name
           FROM design_tasks dt LEFT JOIN clients c ON c.id = dt.client_id
           LEFT JOIN profiles pd ON pd.id = dt.designed_by
          WHERE dt.kanban_column = 'analise_ia'
          ORDER BY ${PRIORITY_ORDER}, dt.updated_at ASC
          LIMIT 100`
      );
      res.json({ tasks: rows.map((r) => ({ ...queueItem(r, null), designer: (r.designed_name || '').trim() || null })) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/design/tasks/:id/review', async (req, res) => {
    let agent;
    let taskId;
    let verdict;
    let notes;
    let errors;
    try {
      agent = await designAgent(req, ['revisor_arte', 'chefe']);
      taskId = await resolveTaskId(req.params.id);
      verdict = semAcento(req.body?.verdict);
      if (!['aprovado', 'ajustes'].includes(verdict)) return res.status(400).json({ error: 'verdict: aprovado ou ajustes' });
      notes = String(req.body?.notes || '').trim().slice(0, 4000) || null;
      const rawErrors = Array.isArray(req.body?.errors) ? req.body.errors.slice(0, 40) : [];
      errors = [];
      for (const e of rawErrors) {
        const category = normalizeErrorCategory(e?.category);
        const description = String(e?.description || '').trim().slice(0, 1000);
        if (!category) {
          return res.status(400).json({ error: `Categoria de erro desconhecida: "${e?.category}". Use: ${Object.keys(DESIGN_ERROR_CATEGORIES).join(', ')}` });
        }
        if (!description) return res.status(400).json({ error: `Descreva o erro de ${category}` });
        errors.push({ category, description });
      }
      if (verdict === 'ajustes' && !notes && !errors.length) {
        return res.status(400).json({ error: 'Com ajustes, diga o que mudar (notas) e/ou liste os erros' });
      }
    } catch (error) {
      return sendError(res, error);
    }

    const db = await pool.connect();
    let task;
    try {
      await db.query('BEGIN');
      const { rows } = await db.query('SELECT * FROM design_tasks WHERE id = $1 FOR UPDATE', [taskId]);
      task = rows[0];
      if (task.kanban_column !== 'analise_ia') throw httpError(409, `A arte está em "${task.kanban_column}", não em Análise IA`);
      const designerId = task.designed_by || task.assigned_to || null;
      const { rows: rv } = await db.query(
        `INSERT INTO design_reviews (task_id, client_id, version, reviewer_id, designer_id, verdict, notes, error_count, city)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [task.id, task.client_id || null, Number(task.version) || 1, agent.userId, designerId, verdict, notes, errors.length, task.city || null]
      );
      for (const e of errors) {
        await db.query(
          `INSERT INTO design_review_errors (review_id, task_id, client_id, designer_id, reviewer_id, category, description, city)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [rv[0].id, task.id, task.client_id || null, designerId, agent.userId, e.category, e.description, task.city || null]
        );
      }
      const errorLines = errors.map((e) => `• [${DESIGN_ERROR_CATEGORIES[e.category]}] ${e.description}`).join('\n');
      if (verdict === 'aprovado') {
        // mesmo efeito do "Enviar p/ análise" do front: prazo sai para não ficar "atrasada" na revisão
        await db.query(
          `UPDATE design_tasks SET kanban_column = 'em_analise', due_date = NULL, agent_step = NULL, agent_heartbeat_at = NULL, updated_at = now()
            WHERE id = $1`,
          [task.id]
        );
        await addHistory(db, task.id, agent.userId, 'Aprovada na Análise IA → revisão da equipe',
          [notes, errorLines ? `Observações:\n${errorLines}` : null].filter(Boolean).join('\n') || null);
      } else {
        const text = [notes, errorLines].filter(Boolean).join('\n\n');
        await db.query(
          `UPDATE design_tasks SET kanban_column = 'ajustes', observations = $2,
                  assigned_to = COALESCE(designed_by, assigned_to), agent_step = NULL, agent_heartbeat_at = NULL, updated_at = now()
            WHERE id = $1`,
          [task.id, `🤖 Análise IA (v${Number(task.version) || 1}):\n${text}`]
        );
        // "Ajustes solicitados" = mesma ação do front: aparece no "Histórico de Ajustes" do card
        await addHistory(db, task.id, agent.userId, 'Ajustes solicitados', `🤖 Análise IA (v${Number(task.version) || 1}):\n${text}`);
      }
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      db.release();
      return sendError(res, error);
    }
    db.release();

    // avisos fora da transação (falha aqui não desfaz o parecer)
    const designerId = task.designed_by || task.assigned_to || null;
    if (verdict === 'aprovado') {
      await pool.query(`SELECT notify_role('social_media'::app_role, $1, $2, 'design', '/designer')`,
        ['Arte para revisão', `"${task.title}" passou na Análise IA e está em Em Análise`]).catch(() => {});
      if (designerId) {
        await messageAgents(agent.userId, [designerId], `✅ Arte ${task.id.slice(0, 8)} "${task.title}" aprovada na Análise IA; foi para a revisão da equipe.${notes ? ` Nota: ${notes}` : ''}`);
      }
    } else if (designerId) {
      await messageAgents(agent.userId, [designerId],
        `🔧 Ajustes na arte ${task.id.slice(0, 8)} "${task.title}": ${[notes, errors.map((e) => `[${e.category}] ${e.description}`).join('; ')].filter(Boolean).join(' — ')}. Ela está na sua fila (pulse arte fila).`);
    }
    res.json({ ok: true, verdict, column: verdict === 'aprovado' ? 'em_analise' : 'ajustes', errors_recorded: errors.length });
  });

  app.get('/api/agent/design/learning', async (req, res) => {
    try {
      const agent = await designAgent(req);
      let designerId = null;
      if (agent.role === 'designer') designerId = agent.userId;
      else if (req.query.designer) {
        const name = semAcento(req.query.designer);
        const { rows } = await pool.query(
          `SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id WHERE k.role = 'designer'`
        );
        const hit = rows.find((r) => String(r.user_id) === String(req.query.designer) || semAcento(r.name) === name || semAcento(r.name).split(/\s+/)[0] === name);
        if (!hit) return res.status(404).json({ error: `Nenhum designer-agente chamado "${req.query.designer}"` });
        designerId = hit.user_id;
      }
      res.json(await learningSummary({ designerId, days: req.query.days }));
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Chefe ─────────────────────────────────────────────────
  app.get('/api/agent/design/stale', async (req, res) => {
    try {
      await designAgent(req, ['chefe']);
      const minutes = Math.max(5, Math.min(24 * 60, Number(req.query.minutes) || 30));
      const hours = Math.max(1, Math.min(24 * 30, Number(req.query.hours) || 24));
      const { rows: agentStale } = await pool.query(
        `SELECT dt.id, dt.title, dt.kanban_column, dt.agent_step, dt.agent_heartbeat_at, p.name AS agent_name, c.company_name AS client_name
           FROM design_tasks dt LEFT JOIN profiles p ON p.id = dt.assigned_to LEFT JOIN clients c ON c.id = dt.client_id
          WHERE dt.kanban_column IN ('executando', 'ajustes') AND dt.agent_step IS NOT NULL
            AND EXISTS (SELECT 1 FROM agent_keys k WHERE k.user_id = dt.assigned_to AND k.revoked_at IS NULL)
            AND (dt.agent_heartbeat_at IS NULL OR dt.agent_heartbeat_at < now() - ($1 || ' minutes')::interval)
          ORDER BY dt.agent_heartbeat_at ASC NULLS FIRST`,
        [String(minutes)]
      );
      const { rows: idle } = await pool.query(
        `SELECT dt.id, dt.title, dt.kanban_column, dt.priority, dt.due_date, dt.updated_at, dt.assigned_to,
                p.name AS assigned_name, c.company_name AS client_name,
                EXISTS (SELECT 1 FROM agent_keys k WHERE k.user_id = dt.assigned_to AND k.revoked_at IS NULL) AS assigned_is_agent
           FROM design_tasks dt LEFT JOIN profiles p ON p.id = dt.assigned_to LEFT JOIN clients c ON c.id = dt.client_id
          WHERE dt.kanban_column IN ('nova_tarefa', 'fila_baixa_prioridade', 'executando', 'ajustes', 'analise_ia')
            AND dt.agent_step IS NULL
            AND NOT COALESCE(dt.timer_running, false)
            AND dt.updated_at < now() - ($1 || ' hours')::interval
          ORDER BY ${PRIORITY_ORDER}, dt.updated_at ASC
          LIMIT 100`,
        [String(hours)]
      );
      res.json({ minutes, hours, agent_stale: agentStale, idle });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Regra do vídeo: só tira de quem NÃO está ativo — humano sem mexer na arte nas últimas 24 h
  // (histórico ou cronômetro rodando) ou agente sem sinal de vida há 30 min.
  const ACTIVE_HUMAN_HOURS = 24;
  app.post('/api/agent/design/tasks/:id/assign', async (req, res) => {
    try {
      const agent = await designAgent(req, ['chefe']);
      const reason = String(req.body?.reason || '').trim().slice(0, 300) || 'atribuída pela chefe';
      const toName = semAcento(req.body?.to);
      if (!toName) return res.status(400).json({ error: 'Informe o designer-agente (to)' });
      const designers = await activeAgentsByRole('designer');
      const target = designers.find((d) => semAcento(d.name) === toName || semAcento(d.name).split(/\s+/)[0] === toName);
      if (!target) return res.status(404).json({ error: `Nenhum designer-agente ativo chamado "${req.body?.to}"` });
      const taskId = await resolveTaskId(req.params.id);
      const { rows } = await pool.query(
        `SELECT dt.id, dt.title, dt.kanban_column, dt.assigned_to, dt.designed_by, dt.agent_step, dt.agent_heartbeat_at,
                dt.timer_running, dt.timer_started_at, pa.name AS assigned_name, pd.name AS designed_name
           FROM design_tasks dt LEFT JOIN profiles pa ON pa.id = dt.assigned_to LEFT JOIN profiles pd ON pd.id = dt.designed_by
          WHERE dt.id = $1`,
        [taskId]
      );
      const task = rows[0];
      if (!['nova_tarefa', 'fila_baixa_prioridade', 'executando', 'ajustes'].includes(task.kanban_column)) {
        return res.status(400).json({ error: 'Só dá para passar arte em Nova Tarefa, Fila Baixa Prioridade, Executando ou Ajustes' });
      }
      const owner = task.assigned_to || (task.kanban_column === 'ajustes' ? task.designed_by : null);
      if (owner === target.user_id && (task.kanban_column !== 'ajustes' || task.designed_by === target.user_id)) {
        return res.json({ ok: true, unchanged: true, task: { id: task.id, title: task.title } });
      }
      if (owner) {
        const { rows: ownerKeys } = await pool.query('SELECT 1 FROM agent_keys WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1', [owner]);
        const ownerName = ((task.assigned_to === owner ? task.assigned_name : task.designed_name) || 'quem está com ela').trim();
        if (ownerKeys.length) {
          const alive = task.agent_step && task.agent_heartbeat_at && Date.now() - new Date(task.agent_heartbeat_at).getTime() < 30 * 60_000;
          if (alive) return res.status(409).json({ error: `A arte está com ${ownerName} agora (sinal de vida há menos de 30 min)` });
        } else {
          const { rows: recent } = await pool.query(
            `SELECT 1 FROM design_task_history WHERE task_id = $1 AND user_id = $2 AND created_at > now() - ($3 || ' hours')::interval LIMIT 1`,
            [task.id, owner, String(ACTIVE_HUMAN_HOURS)]
          );
          const timerRecent = task.timer_running || (task.timer_started_at && Date.now() - new Date(task.timer_started_at).getTime() < ACTIVE_HUMAN_HOURS * 3600_000);
          if (recent.length || timerRecent) {
            return res.status(409).json({ error: `${ownerName} mexeu nesta arte nas últimas ${ACTIVE_HUMAN_HOURS} h: continua com ela` });
          }
        }
      }
      // ajuste: o designer novo passa a ser "quem fez" (a fila dele mostra); o resto volta para Nova Tarefa, já dele
      await pool.query(
        `UPDATE design_tasks SET
            kanban_column = CASE WHEN kanban_column = 'ajustes' THEN 'ajustes' ELSE 'nova_tarefa' END,
            designed_by = CASE WHEN kanban_column = 'ajustes' THEN $2 ELSE designed_by END,
            assigned_to = $2,
            ${STOP_TIMER_SQL},
            agent_step = NULL, agent_heartbeat_at = NULL, updated_at = now()
          WHERE id = $1`,
        [task.id, target.user_id]
      );
      const fromName = ((task.assigned_name || task.designed_name || 'ninguém')).trim();
      await addHistory(pool, task.id, agent.userId, `Arte passada para ${target.name.trim()}`, `de ${fromName} para ${target.name.trim()}: ${reason}`);
      if (owner && owner !== target.user_id) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, 'design', '/designer')`,
          [owner, 'Arte passada para outro designer', `"${task.title}" foi passada para ${target.name.trim()}: ${reason}`]
        ).catch(() => {});
      }
      await messageAgents(agent.userId, [target.user_id],
        `Arte ${task.id.slice(0, 8)} "${task.title}" (${task.kanban_column === 'ajustes' ? 'ajuste' : 'nova'}) agora é sua: ${reason}. Rode \`pulse arte pegar ${task.id.slice(0, 8)}\`.`);
      res.json({ ok: true, task: { id: task.id, title: task.title, column: task.kanban_column === 'ajustes' ? 'ajustes' : 'nova_tarefa' }, from: fromName, to: target.name.trim() });
    } catch (error) {
      sendError(res, error);
    }
  });

  const CHEFE_MOVABLE = {
    nova_tarefa: 'Nova Tarefa', fila_baixa_prioridade: 'Fila Baixa Prioridade', ajustes: 'Ajustes Solicitados',
    analise_ia: 'Análise IA', em_analise: 'Em Análise (equipe)',
  };
  app.post('/api/agent/design/tasks/:id/move', async (req, res) => {
    try {
      const agent = await designAgent(req, ['chefe']);
      const column = String(req.body?.column || '').trim();
      if (!CHEFE_MOVABLE[column]) {
        return res.status(400).json({ error: `Coluna permitida: ${Object.keys(CHEFE_MOVABLE).join(', ')} (enviar ao cliente e aprovar são decisões humanas)` });
      }
      const reason = String(req.body?.reason || '').trim().slice(0, 500) || null;
      const notes = req.body?.notes != null ? String(req.body.notes).trim().slice(0, 4000) : '';
      const taskId = await resolveTaskId(req.params.id);
      const { rows } = await pool.query('SELECT * FROM design_tasks WHERE id = $1', [taskId]);
      const task = rows[0];
      if (['enviar_cliente', 'aprovado', 'postado'].includes(task.kanban_column)) {
        return res.status(409).json({ error: `A arte já está em "${task.kanban_column}" (com o cliente ou finalizada): mova pelo Kanban` });
      }
      if (task.kanban_column === column && !notes) return res.status(409).json({ error: 'A arte já está nessa coluna' });
      const hasArt = !!(task.attachment_url || task.mockup_url || (Array.isArray(task.attachment_urls) && task.attachment_urls.length));
      if (['analise_ia', 'em_analise'].includes(column) && !hasArt) return res.status(409).json({ error: 'A arte não tem arquivo anexado' });
      if (column === 'ajustes' && !notes && !task.observations) return res.status(400).json({ error: 'Diga os ajustes (--ajustes "o que mudar")' });
      const sets = [`kanban_column = $2`, STOP_TIMER_SQL, 'agent_step = NULL', 'agent_heartbeat_at = NULL', 'updated_at = now()'];
      const params = [task.id, column];
      if (column === 'nova_tarefa') sets.push('assigned_to = NULL');
      if (column === 'em_analise') sets.push('due_date = NULL');
      if (column === 'ajustes') {
        sets.push('assigned_to = COALESCE(designed_by, assigned_to)');
        if (notes) { params.push(notes); sets.push(`observations = $${params.length}`); }
      }
      await pool.query(`UPDATE design_tasks SET ${sets.join(', ')} WHERE id = $1`, params);
      await addHistory(pool, task.id, agent.userId, column === 'ajustes' ? 'Ajustes solicitados' : `Movido para ${CHEFE_MOVABLE[column]}`,
        [reason, notes || null].filter(Boolean).join(' · ') || null);
      if (column === 'ajustes' && (task.designed_by || task.assigned_to)) {
        await messageAgents(agent.userId, [task.designed_by || task.assigned_to], `🔧 Ajustes na arte ${task.id.slice(0, 8)} "${task.title}": ${notes || task.observations}`);
      }
      res.json({ ok: true, from: task.kanban_column, to: column });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Sistema (login normal) ────────────────────────────────
  app.get('/api/design-agents', async (req, res) => {
    try {
      await verifyUser(req);
      await ensureDesignAgentSchema();
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (k.user_id) k.user_id, k.role, p.name, p.avatar_url
           FROM agent_keys k JOIN profiles p ON p.id = k.user_id
          WHERE k.revoked_at IS NULL
          ORDER BY k.user_id, k.created_at DESC`
      );
      res.json({ agents: rows.map((r) => ({ user_id: r.user_id, role: r.role, name: (r.name || '').trim(), avatar_url: r.avatar_url })) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/design-tasks/:id/agent-reviews', async (req, res) => {
    try {
      await verifyUser(req);
      await ensureDesignAgentSchema();
      if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return res.status(400).json({ error: 'Id inválido' });
      const [{ rows: reviews }, { rows: errors }, { rows: deliveries }] = await Promise.all([
        pool.query(
          `SELECT r.id, r.version, r.verdict, r.notes, r.created_at, pr.name AS reviewer_name, pd.name AS designer_name
             FROM design_reviews r LEFT JOIN profiles pr ON pr.id = r.reviewer_id LEFT JOIN profiles pd ON pd.id = r.designer_id
            WHERE r.task_id = $1 ORDER BY r.created_at DESC`,
          [req.params.id]
        ),
        pool.query('SELECT review_id, category, description FROM design_review_errors WHERE task_id = $1 ORDER BY created_at', [req.params.id]),
        pool.query(
          `SELECT d.version, d.files, d.editable_url, d.note, d.warnings, d.created_at, p.name AS by_name
             FROM design_deliveries d LEFT JOIN profiles p ON p.id = d.created_by WHERE d.task_id = $1 ORDER BY d.version DESC`,
          [req.params.id]
        ),
      ]);
      res.json({
        reviews: reviews.map((r) => ({
          id: r.id, version: r.version, verdict: r.verdict, notes: r.notes, created_at: r.created_at,
          reviewer: (r.reviewer_name || '').trim(), designer: (r.designer_name || '').trim(),
          errors: errors.filter((e) => e.review_id === r.id).map((e) => ({ category: e.category, label: DESIGN_ERROR_CATEGORIES[e.category] || e.category, description: e.description })),
        })),
        deliveries: deliveries.map((d) => ({
          version: d.version, files: parseJson(d.files) || [], editable_url: d.editable_url, note: d.note,
          warnings: parseJson(d.warnings) || [], created_at: d.created_at, by: (d.by_name || '').trim(),
        })),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agents/design-overview', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureDesignAgentSchema();
      const [{ rows: designers }, { rows: current }, { rows: delivered }, { rows: reviewStats }, { rows: queue }, { rows: byDesignerCategory }] = await Promise.all([
        pool.query(
          `SELECT DISTINCT ON (k.user_id) k.user_id, k.role, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id
            WHERE k.revoked_at IS NULL AND k.role IN ('designer', 'revisor_arte') ORDER BY k.user_id, k.created_at DESC`
        ),
        pool.query(
          `SELECT dt.id, dt.title, dt.kanban_column, dt.assigned_to, dt.agent_step, dt.agent_heartbeat_at, c.company_name AS client_name
             FROM design_tasks dt LEFT JOIN clients c ON c.id = dt.client_id
            WHERE dt.agent_step IS NOT NULL AND dt.kanban_column IN ('executando', 'ajustes')`
        ),
        pool.query(
          `SELECT created_by,
                  COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')::int AS today,
                  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS week
             FROM design_deliveries GROUP BY created_by`
        ),
        pool.query(
          `SELECT designer_id, COUNT(*)::int AS reviews, COUNT(*) FILTER (WHERE verdict = 'aprovado')::int AS approved,
                  COALESCE(SUM(error_count), 0)::int AS errors
             FROM design_reviews WHERE created_at > now() - interval '30 days' GROUP BY designer_id`
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE kanban_column = 'nova_tarefa' AND assigned_to IS NULL)::int AS waiting,
                  COUNT(*) FILTER (WHERE kanban_column = 'analise_ia')::int AS analise_ia,
                  COUNT(*) FILTER (WHERE kanban_column = 'ajustes' AND designed_by IN (SELECT user_id FROM agent_keys))::int AS agent_adjustments
             FROM design_tasks`
        ),
        pool.query(
          `SELECT e.designer_id, p.name, e.category, COUNT(*)::int AS count
             FROM design_review_errors e LEFT JOIN profiles p ON p.id = e.designer_id
            WHERE e.created_at > now() - interval '30 days'
            GROUP BY 1, 2, 3 ORDER BY 4 DESC`
        ),
      ]);
      const learning = await learningSummary({ days: 30 });
      res.json({
        queue: queue[0],
        designers: designers.map((d) => {
          const del = delivered.find((x) => x.created_by === d.user_id) || {};
          const rs = reviewStats.find((x) => x.designer_id === d.user_id) || {};
          return {
            user_id: d.user_id,
            name: (d.name || '').trim(),
            role: d.role,
            current: current.filter((t) => t.assigned_to === d.user_id),
            delivered_today: del.today || 0,
            delivered_week: del.week || 0,
            reviews_30d: rs.reviews || 0,
            approved_30d: rs.approved || 0,
            errors_30d: rs.errors || 0,
          };
        }),
        current,
        learning: {
          ...learning,
          by_designer: byDesignerCategory.map((r) => ({
            designer_id: r.designer_id, name: (r.name || '').trim(), category: r.category,
            label: DESIGN_ERROR_CATEGORIES[r.category] || r.category, count: r.count,
          })),
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  return { ensureDesignAgentSchema };
}

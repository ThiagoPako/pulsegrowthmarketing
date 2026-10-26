// ─── Pulse Plus: acesso às configurações e informações internas dos agentes ──────
// Quem está em module_access com module = 'pulse_plus' vê o Painel de Agentes, as chaves e os computadores
// dos agentes, o PULSE (assistente e o número dele), os pedidos aos agentes (agent_jobs), os selos e filtros
// que marcam alguém ou um card como agente e as colunas internas do fluxo deles (etapa, sinal de vida, parecer).
// O resto da equipe vê o agente como qualquer membro: nome no card, histórico, comentários, Escritório, TV e
// rankings, sem nada que o marque como agente. O acesso nunca vem do papel: admin sem Pulse Plus não vê nada disso.
// Os agentes seguem trabalhando pelas rotas deles (/api/agent/*, chave "Authorization: Agent <chave>").
//
// Rotas (login normal):
//   GET    /api/team/pulse-plus            (admin com Pulse Plus) ids de quem tem o acesso
//   POST   /api/team/:userId/pulse-plus    (admin com Pulse Plus) inclui; fica registrado quem marcou
//   DELETE /api/team/:userId/pulse-plus    (admin com Pulse Plus) tira; nunca o último com acesso
//
// Semente (na subida, só com a lista vazia): copia quem está em module_access com 'agendamentos'; sem ninguém,
// os admins cujo nome começa com "Thiago" (mesma regra dos Agendamentos). O log diz quem entrou.
// Incluir alguém direto no banco:  INSERT INTO module_access (module, user_id, created_by)
//                                  VALUES ('pulse_plus', '<id do perfil>', 'manual');

import path from 'node:path';

export const PULSE_PLUS_MODULE = 'pulse_plus';
const COPY_FROM_MODULE = 'agendamentos';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rotas da equipe que mostram ou mudam configuração e informação dos agentes e do PULSE.
// As rotas dos próprios agentes (/api/agent/*, /api/agent-pair) não passam por aqui.
// Sem diferenciar maiúsculas (o Express encaminha /api/Agents/office para /api/agents/office) e conferidas
// sobre o caminho normalizado (decodificado, sem barras repetidas): ver guardedPath.
const GUARDED_PATHS = [
  /^\/api\/agent-keys(\/|$)/i,
  /^\/api\/agent-machines(\/|$)/i,
  /^\/api\/agents(\/|$)/i,
  /^\/api\/design-agents(\/|$)/i,
  /^\/api\/design-tasks\/[^/]+\/agent-reviews(\/|$)/i,
  /^\/api\/assistant(\/|$)/i,
];

/** O caminho como o roteador pode entendê-lo: decodificado, sem barras repetidas e em minúsculas. */
export function guardedPath(rawPath) {
  let value = String(rawPath || '');
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      break;
    }
  }
  return value.replace(/\/{2,}/g, '/').toLowerCase();
}

export function isGuardedPath(rawPath) {
  const normalized = guardedPath(rawPath);
  return GUARDED_PATHS.some((re) => re.test(normalized));
}

// Colunas internas do fluxo dos agentes: saem nulas para quem não tem Pulse Plus.
export const AGENT_COLUMNS = {
  content_tasks: ['agent_step', 'agent_heartbeat_at', 'agent_review_verdict', 'agent_review_notes', 'agent_review_by', 'agent_review_at'],
  design_tasks: ['agent_step', 'agent_heartbeat_at'],
};

// Textos gravados pelos agentes que marcam quem fez como agente. O registro continua visível para todos;
// para quem não tem Pulse Plus sai só a marca ("Arte iniciada (agente)" → "Arte iniciada").
// Também os textos que o PULSE gravou antes (cards pedidos pelo WhatsApp e lançamentos do financeiro).
const AGENT_TEXT_COLUMNS = {
  task_history: ['action', 'details'],
  design_task_history: ['action', 'details'],
  notifications: ['title', 'message'],
  content_tasks: ['description'],
  design_tasks: ['observations', 'description'],
  financial_activity_log: ['description'],
};
const AGENT_TEXT_RULES = [
  [/🤖\s*Pedido pelo PULSE \(WhatsApp\)/g, 'Pedido pelo WhatsApp'],
  [/🤖\s*Card criado pelo PULSE \(WhatsApp\)/g, 'Card criado pelo WhatsApp'],
  [/[ \t]*\(PULSE, [^)]*\)/g, ''],
  [/[ \t]*\((?:agente|agente de IA)\)/gi, ''],
  [/[ \t]+pel[oa] agente\b/gi, ''],
  [/🤖\s*Análise IA/g, 'Pré-análise'],
  [/\bAnálise IA\b/g, 'Pré-análise'],
  [/Observação do agente:/g, 'Observação:'],
];
// details (JSON) do financeiro: a origem do lançamento feito pelo PULSE não sai para quem não tem Pulse Plus
const PULSE_ORIGIN = 'assistente_pulse';

// Envio pedido pelo PULSE: no histórico do WhatsApp aparece como envio avulso.
const WHATSAPP_TRIGGER_TABLES = new Set(['whatsapp_messages']);

const CONTENT_LOCK_MINUTES = 30; // mesmo limite do `pulse travados` e do selo "parada"
// Colunas em que o agente trabalha no card (vídeo: edita/corrige; arte: cria/corrige)
const WORKING_COLUMNS = { content_tasks: ['edicao', 'alteracao'], design_tasks: ['executando', 'ajustes'] };

/** Colunas que quem não tem Pulse Plus não filtra, ordena, liga nem renomeia, por tabela da consulta. */
function protectedColumnsFor(tables) {
  const out = {};
  for (const table of tables) {
    const set = new Set([...(AGENT_COLUMNS[table] || []), ...(AGENT_TEXT_COLUMNS[table] || [])]);
    if (WHATSAPP_TRIGGER_TABLES.has(table)) set.add('trigger_type');
    if (set.size) out[table] = set;
  }
  return out;
}

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { statusCode: status, status, ...extra });

/** Colunas internas (com e sem o prefixo do join, `tabela_coluna`) das tabelas da consulta. */
function agentColumnNames(tables) {
  const names = new Set();
  for (const table of tables) {
    for (const column of AGENT_COLUMNS[table] || []) {
      names.add(column);
      names.add(`${table}_${column}`);
    }
  }
  return names;
}

/** Zera as colunas internas dos agentes nas linhas (inclusive nas aninhadas por tabela, como `content_tasks: {...}`). */
export function blankAgentColumns(rows, tables) {
  const names = agentColumnNames(tables);
  if (!names.size) return rows;
  const visit = (row) => {
    if (!row || typeof row !== 'object') return;
    for (const key of Object.keys(row)) {
      if (names.has(key)) row[key] = null;
      else if (AGENT_COLUMNS[key] && row[key] && typeof row[key] === 'object') {
        for (const nested of Array.isArray(row[key]) ? row[key] : [row[key]]) {
          if (!nested || typeof nested !== 'object') continue;
          for (const column of AGENT_COLUMNS[key]) if (column in nested) nested[column] = null;
        }
      }
    }
  };
  for (const row of Array.isArray(rows) ? rows : [rows]) visit(row);
  return rows;
}

export function neutralAgentText(value) {
  if (typeof value !== 'string' || !value) return value;
  let out = value;
  for (const [pattern, replacement] of AGENT_TEXT_RULES) out = out.replace(pattern, replacement);
  return out;
}

/** Tira a marca de agente dos textos (histórico, avisos, observações) e o gatilho "assistente" do histórico do WhatsApp. */
export function neutralizeAgentTexts(rows, tables) {
  const columns = new Set();
  for (const table of tables) {
    for (const column of AGENT_TEXT_COLUMNS[table] || []) {
      columns.add(column);
      columns.add(`${table}_${column}`);
    }
  }
  const whatsapp = tables.some((table) => WHATSAPP_TRIGGER_TABLES.has(table));
  const financial = tables.includes('financial_activity_log');
  if (!columns.size && !whatsapp) return rows;
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    if (!row || typeof row !== 'object') continue;
    for (const column of columns) {
      if (typeof row[column] === 'string') row[column] = neutralAgentText(row[column]);
    }
    if (whatsapp && row.trigger_type === 'assistente') row.trigger_type = 'manual';
    if (financial) row.details = withoutPulseOrigin(row.details);
  }
  return rows;
}

// Fotos trocadas pelo Painel de Agentes antes de 26/10/2026 ficaram em /uploads/avatars/agentes/<id>/: o endereço
// marcava o membro como agente. Sem mexer no banco nem nos arquivos, o endereço sai trocado por um caminho neutro
// servido pela API (GET /api/avatar-files/<id>/<arquivo>, ver registerRoutes), para todo mundo.
const AGENT_AVATAR_RE = /\/uploads\/avatars\/agentes\/([^/?#"\s]+)\/([^/?#"\s]+)/gi; // pasta do membro (o id) e arquivo
const AVATAR_FOLDER_RE = /^[\w-]{1,80}$/;
const AVATAR_FILE_RE = /^[\w-][\w.-]*\.(png|jpe?g|webp)$/i;

export function neutralAvatarUrl(value) {
  if (typeof value !== 'string' || !value.includes('/avatars/agentes/')) return value;
  return value.replace(AGENT_AVATAR_RE, '/api/avatar-files/$1/$2');
}

/** Troca, em qualquer campo cujo nome cite "avatar" (avatar_url, profiles_avatar_url, editor_avatar…), o endereço da foto. */
export function neutralizeAvatars(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return value;
  if (Array.isArray(value)) {
    for (const item of value) neutralizeAvatars(item, depth + 1);
    return value;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') {
      if (/avatar/i.test(key)) value[key] = neutralAvatarUrl(item);
    } else if (item && typeof item === 'object') {
      neutralizeAvatars(item, depth + 1);
    }
  }
  return value;
}

/** details do financeiro sem a origem "assistente_pulse" e o número que pediu (objeto ou texto JSON). */
function withoutPulseOrigin(details) {
  let obj = details;
  if (typeof details === 'string') {
    try { obj = JSON.parse(details); } catch { return details; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.origem !== PULSE_ORIGIN) return details;
  const { origem, numero, ...rest } = obj;
  return typeof details === 'string' ? JSON.stringify(rest) : rest;
}

/**
 * Todas as formas de nome de coluna que o servidor pode montar a partir de um texto: o nome inteiro sem os
 * caracteres não permitidos (o que o buildDbQueryWhere usa: "agent_step." vira agent_step) e cada pedaço
 * separado por ponto (o que o sanitizeOrderColumn usa: "t.agent_step.x" vira t.agent_step), em minúsculas
 * (no Postgres, AGENT_STEP sem aspas é agent_step).
 */
export function columnVariants(value) {
  const raw = String(value ?? '');
  const clean = (s) => s.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  return [clean(raw), ...raw.split('.').map(clean)].filter(Boolean);
}

/** Partes do select do /api/db/query que citam coluna protegida com outro nome (o zerar e a limpeza são pelo nome). */
function renamedProtectedColumn(select, baseTable, protectedByTable) {
  if (typeof select !== 'string') return null;
  for (const part of select.split(',').map((p) => p.trim()).filter(Boolean)) {
    const match = part.match(/^(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)\s+as\s+([a-z_][a-z0-9_]*)$/i);
    if (!match) continue;
    const table = (match[1] || baseTable).toLowerCase();
    const column = match[2].toLowerCase();
    const alias = match[3].toLowerCase();
    if (!(protectedByTable[table] || new Set()).has(column)) continue;
    if (alias !== column && alias !== `${table}_${column}`) return column;
  }
  return null;
}

/** Colunas citadas nos filtros e na ordenação do /api/db/query (inclusive dentro do "or"), em todas as formas. */
function referencedColumns(filters, order) {
  const out = [];
  for (const filter of Array.isArray(filters) ? filters : []) {
    if (!filter || typeof filter !== 'object') continue;
    if (filter.op === 'or') {
      // mais fino que o splitOrFilterParts do servidor: cada parte dele começa no início de uma destas
      for (const part of String(filter.value ?? '').split(',')) out.push(...columnVariants(part.split('.')[0]));
    }
    out.push(...columnVariants(filter.column));
  }
  for (const item of Array.isArray(order) ? order : order ? [order] : []) out.push(...columnVariants(item?.column));
  return out;
}

/** Colunas citadas no ON dos joins (estruturado ou "a.b = c.d"). */
function joinColumns(joins) {
  return (Array.isArray(joins) ? joins : []).flatMap((join) => [
    join?.leftColumn, join?.rightColumn, ...String(join?.on || '').split('='),
  ]).flatMap(columnVariants);
}

export function createPulsePlus({ pool, verifyUser, getLinkedUserIds, isStrictAdmin, uploadRoot = null, logger = console, cacheMs = 5000 }) {
  const accessCache = new Map(); // user id → { at, promise }
  let agentIdsCache = null;

  // ── Esquema (aditivo) e semente ──
  async function ensureSchema() {
    const create = async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS module_access (
          module TEXT NOT NULL,
          user_id UUID NOT NULL,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (module, user_id)
        )
      `);
      // quem marcou e quem tirou (o module_access só guarda quem está)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS module_access_log (
          id BIGSERIAL PRIMARY KEY,
          module TEXT NOT NULL,
          user_id UUID NOT NULL,
          action TEXT NOT NULL,
          actor_id UUID,
          actor_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    };
    try {
      await create();
    } catch (error) {
      // outra parte do servidor (Agendamentos) criou a mesma tabela no mesmo instante
      if (error?.code !== '23505' && error?.code !== '42P07') throw error;
      await create();
    }
    await seed();
  }

  async function seed() {
    const { rows: [{ total }] } = await pool.query(
      `SELECT count(*)::int AS total FROM module_access WHERE module = $1`, [PULSE_PLUS_MODULE]
    );
    if (total > 0) return;
    let source = `quem estava nos Agendamentos`;
    let { rows } = await pool.query(
      `INSERT INTO module_access (module, user_id, created_by)
       SELECT $1, ma.user_id, 'semente'
         FROM module_access ma
         JOIN profiles p ON p.id::text = ma.user_id::text
        WHERE ma.module = $2
       ON CONFLICT DO NOTHING
       RETURNING user_id`,
      [PULSE_PLUS_MODULE, COPY_FROM_MODULE]
    );
    if (!rows.length) {
      source = 'admin "Thiago"';
      ({ rows } = await pool.query(
        `INSERT INTO module_access (module, user_id, created_by)
         SELECT $1, p.id, 'semente'
           FROM profiles p
          WHERE btrim(coalesce(p.name, '')) ILIKE 'thiago%'
            AND (p.role::text = 'admin'
                 OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id::text = p.id::text AND ur.role::text = 'admin'))
         ON CONFLICT DO NOTHING
         RETURNING user_id`,
        [PULSE_PLUS_MODULE]
      ));
    }
    if (!rows.length) {
      logger.warn('[pulse-plus] lista de acesso vazia e nenhum admin "Thiago" encontrado: ninguém tem Pulse Plus até alguém ser incluído em module_access.');
      return;
    }
    const ids = rows.map((r) => r.user_id);
    await pool.query(
      `INSERT INTO module_access_log (module, user_id, action, actor_name) SELECT $1, unnest($2::uuid[]), 'incluido', 'semente'`,
      [PULSE_PLUS_MODULE, ids]
    ).catch(() => {});
    const { rows: people } = await pool.query(
      `SELECT id, name, email FROM profiles WHERE id = ANY($1::uuid[]) ORDER BY name`, [ids]
    );
    invalidate();
    logger.log(`[pulse-plus] acesso semeado (${source}) com: ${people.map((p) => `${p.name} <${p.email || 'sem e-mail'}> (${p.id})`).join('; ')}`);
  }

  let readyPromise = null;
  let waitFor = null;
  /** Começa o esquema e a semente depois de `after` (o esquema dos Agendamentos, que cria a mesma tabela). */
  function start({ after } = {}) {
    if (after) waitFor = after;
    return ready().catch((error) => logger.error('[pulse-plus] esquema não criado:', error?.message || error));
  }
  function ready() {
    if (!readyPromise) {
      readyPromise = (async () => {
        if (waitFor) await Promise.resolve(typeof waitFor === 'function' ? waitFor() : waitFor).catch(() => {});
        await ensureSchema();
      })().catch((error) => {
        readyPromise = null;
        throw error;
      });
    }
    return readyPromise;
  }

  // ── Acesso ──
  function invalidate() {
    accessCache.clear();
  }

  /** true quando a pessoa (objeto do verifyUser ou id) está na lista pulse_plus. Cache curto, limpo a cada mudança. */
  async function hasPulsePlus(user) {
    if (!user) return false;
    const key = typeof user === 'object' ? String(user.id || '') : String(user);
    if (!key) return false;
    const hit = accessCache.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return hit.promise;
    const promise = (async () => {
      await ready();
      const linked = typeof user === 'object' && getLinkedUserIds ? await getLinkedUserIds(user).catch(() => []) : [];
      const ids = [...new Set([key, ...linked.map(String)])];
      const { rows } = await pool.query(
        `SELECT 1 FROM module_access WHERE module = $1 AND user_id::text = ANY($2::text[]) LIMIT 1`,
        [PULSE_PLUS_MODULE, ids]
      );
      return rows.length > 0;
    })().catch((error) => {
      accessCache.delete(key);
      logger.error('[pulse-plus] leitura do acesso:', error?.message || error);
      return false;
    });
    accessCache.set(key, { at: Date.now(), promise });
    return promise;
  }

  /** Membros com chave de agente ativa (cache curto). Sem a tabela, ninguém. */
  function activeAgentIds() {
    if (agentIdsCache && Date.now() - agentIdsCache.at < cacheMs) return agentIdsCache.promise;
    const promise = pool.query(`SELECT DISTINCT user_id::text AS id FROM agent_keys WHERE revoked_at IS NULL`)
      .then(({ rows }) => new Set(rows.map((r) => r.id)))
      .catch(() => new Set());
    agentIdsCache = { at: Date.now(), promise };
    return promise;
  }

  // ── Trava das rotas da equipe ──
  async function guard(req, res, next) {
    if (req.method === 'OPTIONS' || !(isGuardedPath(req.path) || isGuardedPath(req.originalUrl?.split('?')[0]))) return next();
    let user;
    try {
      ({ user } = await verifyUser(req));
    } catch (error) {
      const status = error?.statusCode === 503 ? 503 : 401;
      return res.status(status).json({ error: status === 503 ? error.message : 'Unauthorized' });
    }
    if (await hasPulsePlus(user)) return next();
    return res.status(403).json({ error: 'Sem acesso' });
  }

  // ── /api/db/query ──
  /**
   * Antes da consulta, para quem não tem Pulse Plus:
   * - não filtra, ordena, liga (ON do join) nem renomeia coluna interna dos agentes nem as colunas de texto que
   *   saem limpas (histórico, avisos, observações, descrição, gatilho do WhatsApp): a lista de linhas escolhidas
   *   mostraria quais são de agente, mesmo com o texto limpo;
   * - card com um agente trabalhando (sinal nos últimos 30 min: vídeo em edição/alteração, arte em
   *   executando/ajustes) não muda de COLUNA: a entrega dele seria recusada (no vídeo é a mesma trava que a tela de
   *   quem vê os agentes aplica). Trocar o responsável continua livre, como no "Tirar mesmo assim" do Controle
   *   de Edição e na ficha do card;
   * - quando o card sai da mão do agente (outra coluna ou outro responsável), a etapa dele é limpa, como a tela
   *   de quem tem Pulse Plus já faz.
   */
  async function beforeDbQuery({ safeTable, operation, data, filters, select, order, joins, user, buildWhere }) {
    const joinTables = (Array.isArray(joins) ? joins : []).map((j) => String(j?.table || '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase());
    const tables = [safeTable, ...joinTables];
    const protectedByTable = protectedColumnsFor(tables);
    const protectedAll = new Set(Object.values(protectedByTable).flatMap((set) => [...set]));
    if (!protectedAll.size) return { data, filters };
    if (await hasPulsePlus(user)) return { data, filters };

    const refused = operation === 'select' ? 'Sem permissão para esta consulta.' : 'Sem permissão para esta operação.';
    if (referencedColumns(filters, operation === 'select' ? order : null).some((column) => protectedAll.has(column))) throw httpError(403, refused);
    if (joinColumns(joins).some((column) => protectedAll.has(column))) throw httpError(403, refused);
    if (operation === 'select') {
      if (renamedProtectedColumn(select, safeTable, protectedByTable)) throw httpError(403, refused);
      return { data, filters };
    }
    if (!AGENT_COLUMNS[safeTable] || operation !== 'update' || Array.isArray(data) || typeof buildWhere !== 'function') {
      return { data, filters };
    }

    const value = (key) => {
      const entry = Object.entries(data || {}).find(([k]) => k.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() === key);
      return entry ? entry[1] : undefined;
    };
    const nextColumn = value('kanban_column');
    const nextOwner = value('assigned_to');
    if (nextColumn === undefined && nextOwner === undefined) return { data, filters };

    // cards que o update vai mexer e que estão (ou estiveram) com um agente
    const params = [];
    const where = buildWhere(filters, safeTable, params);
    if (!where.length) return { data, filters };
    const { rows } = await pool.query(
      `SELECT ${safeTable}.kanban_column, ${safeTable}.assigned_to::text AS assigned_to,
              ${safeTable}.agent_heartbeat_at > now() - interval '${CONTENT_LOCK_MINUTES} minutes' AS recent, p.name
         FROM ${safeTable} LEFT JOIN profiles p ON p.id = ${safeTable}.assigned_to
        WHERE ${where.join(' AND ')} AND ${safeTable}.agent_step IS NOT NULL`,
      params
    ).catch((error) => {
      logger.error('[pulse-plus] cards com agente:', error?.message || error);
      return { rows: [] };
    });
    const changed = rows.filter((row) =>
      (nextColumn !== undefined && String(nextColumn ?? '') !== String(row.kanban_column ?? ''))
      || (nextOwner !== undefined && String(nextOwner ?? '') !== String(row.assigned_to ?? '')));
    if (!changed.length) return { data, filters };

    // Agente trabalhando (sinal recente) e o card mudando de COLUNA: mover agora faria a entrega dele ser recusada.
    // A mensagem fala da pessoa, como em qualquer card. Trocar só o responsável não trava (limpa a etapa abaixo).
    const workingColumns = WORKING_COLUMNS[safeTable] || [];
    const movesColumn = (row) => nextColumn !== undefined && String(nextColumn ?? '') !== String(row.kanban_column ?? '');
    const candidates = changed.filter((row) => movesColumn(row) && row.recent && workingColumns.includes(row.kanban_column));
    if (candidates.length) {
      const agents = await activeAgentIds();
      const busy = candidates.find((row) => agents.has(row.assigned_to));
      if (busy) {
        const first = String(busy.name || '').trim().split(/\s+/)[0] || 'Alguém';
        throw httpError(409, `${first} está trabalhando neste card agora. Espere a entrega para mover.`, { code: 'card_em_trabalho' });
      }
    }

    // saiu da mão do agente (outra coluna ou outro responsável): a etapa dele não fica sobrando no card,
    // como a tela de quem tem Pulse Plus já faz ao mover
    return { data: { ...data, agent_step: null, agent_heartbeat_at: null }, filters };
  }

  /** Depois da consulta: colunas internas nulas e textos sem a marca de agente para quem não tem Pulse Plus. */
  async function afterDbQuery(rows, tables, user) {
    if (!rows) return rows;
    // endereço neutro da foto, para todo mundo (com ou sem Pulse Plus)
    if (tables.includes('profiles')) neutralizeAvatars(rows);
    const needsColumns = tables.some((table) => AGENT_COLUMNS[table]);
    const needsTexts = tables.some((table) => AGENT_TEXT_COLUMNS[table] || WHATSAPP_TRIGGER_TABLES.has(table));
    if (!needsColumns && !needsTexts) return rows;
    if (await hasPulsePlus(user)) return rows;
    if (needsColumns) blankAgentColumns(rows, tables);
    if (needsTexts) neutralizeAgentTexts(rows, tables);
    return rows;
  }

  /** Para rotas próprias que devolvem cards (feed rápido do Kanban de Design etc.), com a foto do responsável. */
  async function forUser(user, rows, tables) {
    neutralizeAvatars(rows);
    return afterDbQuery(rows, tables, user);
  }

  // ── Rotas da tela Equipe ──
  async function requireManager(req) {
    const { user } = await verifyUser(req);
    if (!(await isStrictAdmin(user)) || !(await hasPulsePlus(user))) throw httpError(403, 'Sem acesso');
    return user;
  }

  function sendError(res, error) {
    const status = error?.statusCode || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) logger.error('[pulse-plus]', error?.message || error);
    res.status(status).json({ error: status >= 500 ? 'Erro interno' : error.message });
  }

  async function actorName(user) {
    const { rows } = await pool.query('SELECT name FROM profiles WHERE id::text = $1', [String(user.id)]).catch(() => ({ rows: [] }));
    return (rows[0]?.name || user.email || '').trim() || null;
  }

  function registerRoutes(app) {
    // Foto antiga de agente pelo caminho neutro (público, como /uploads): só arquivos de imagem daquela pasta.
    app.get('/api/avatar-files/:userId/:file', (req, res) => {
      const userId = String(req.params.userId || '');
      const file = String(req.params.file || '');
      if (!uploadRoot || !AVATAR_FOLDER_RE.test(userId) || !AVATAR_FILE_RE.test(file) || file.includes('..')) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }
      const root = path.join(uploadRoot, 'avatars', 'agentes', userId);
      res.sendFile(file, { root, maxAge: '1d', dotfiles: 'deny' }, (error) => {
        if (error && !res.headersSent) res.status(404).json({ error: 'Arquivo não encontrado' });
      });
    });

    app.get('/api/team/pulse-plus', async (req, res) => {
      try {
        await requireManager(req);
        const { rows } = await pool.query(
          `SELECT ma.user_id::text AS user_id, ma.created_by, ma.created_at
             FROM module_access ma WHERE ma.module = $1 ORDER BY ma.created_at`,
          [PULSE_PLUS_MODULE]
        );
        res.set('Cache-Control', 'no-store');
        res.json({ members: rows });
      } catch (error) {
        sendError(res, error);
      }
    });

    app.post('/api/team/:userId/pulse-plus', async (req, res) => {
      try {
        const user = await requireManager(req);
        const target = String(req.params.userId || '');
        if (!UUID_RE.test(target)) throw httpError(400, 'Membro inválido');
        const { rows: profile } = await pool.query('SELECT id FROM profiles WHERE id = $1', [target]);
        if (!profile.length) throw httpError(404, 'Membro não encontrado');
        const name = await actorName(user);
        const { rowCount } = await pool.query(
          `INSERT INTO module_access (module, user_id, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [PULSE_PLUS_MODULE, target, `${name || 'admin'} (${user.id})`]
        );
        if (rowCount) {
          await pool.query(
            `INSERT INTO module_access_log (module, user_id, action, actor_id, actor_name) VALUES ($1, $2, 'incluido', $3, $4)`,
            [PULSE_PLUS_MODULE, target, user.id, name]
          );
          logger.log(`[pulse-plus] ${name || user.id} deu acesso a ${target}`);
        }
        invalidate();
        res.json({ ok: true, user_id: target, has_access: true });
      } catch (error) {
        sendError(res, error);
      }
    });

    app.delete('/api/team/:userId/pulse-plus', async (req, res) => {
      const target = String(req.params.userId || '');
      let client = null;
      try {
        const user = await requireManager(req);
        if (!UUID_RE.test(target)) throw httpError(400, 'Membro inválido');
        const name = await actorName(user);
        client = await pool.connect();
        await client.query('BEGIN');
        // trava a lista: dois "tirar" ao mesmo tempo não deixam a lista vazia
        const { rows } = await client.query(
          `SELECT user_id::text AS user_id FROM module_access WHERE module = $1 FOR UPDATE`, [PULSE_PLUS_MODULE]
        );
        if (!rows.some((r) => r.user_id === target)) {
          await client.query('ROLLBACK');
          invalidate();
          return res.json({ ok: true, user_id: target, has_access: false });
        }
        if (rows.length <= 1) throw httpError(409, 'É a última pessoa com acesso. Marque outra pessoa antes de tirar.');
        await client.query(`DELETE FROM module_access WHERE module = $1 AND user_id = $2`, [PULSE_PLUS_MODULE, target]);
        await client.query(
          `INSERT INTO module_access_log (module, user_id, action, actor_id, actor_name) VALUES ($1, $2, 'removido', $3, $4)`,
          [PULSE_PLUS_MODULE, target, user.id, name]
        );
        await client.query('COMMIT');
        logger.log(`[pulse-plus] ${name || user.id} tirou o acesso de ${target}`);
        invalidate();
        res.json({ ok: true, user_id: target, has_access: false });
      } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        sendError(res, error);
      } finally {
        client?.release();
      }
    });
  }

  return {
    start, ready, hasPulsePlus, invalidate, activeAgentIds, guard, registerRoutes,
    beforeDbQuery, afterDbQuery, forUser,
  };
}

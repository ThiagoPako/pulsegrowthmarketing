/**
 * VPS API Server — Replaces all Supabase Edge Functions
 * Version: 1.2.4 - Emergency 502/Startup Fix
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http, { createServer } from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
process.on('uncaughtException', (err) => {
  console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL UNHANDLED REJECTION:', reason);
});
import fs from 'node:fs';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createPgClient } from './pgClient.mjs';
import { registerAgentRoutes } from './agentRoutes.mjs';
import { registerWhatsAppRoutes } from './whatsapp/routes.mjs';
import { registerAssistant } from './assistant/index.mjs';
import { enqueueWhatsApp, clientTarget, clientsForGroup } from './whatsapp/shared.mjs';
import { createPortalSession, effectiveClientId, itemScopeClientId, pickBackupOption } from './lib/portalSession.mjs';
import { cleanupOldEditVersions } from './lib/versionCleanup.mjs';
import { buildProposalRevenueSchedule, stripRevenueMark } from './lib/proposalRevenues.mjs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';

/** Endereço de retorno OAuth cadastrado na Meta — idêntico em todas as etapas. */
const META_OAUTH_REDIRECT_URI = process.env.META_OAUTH_REDIRECT_URI || 'https://agenciapulse.tech/';
const INSTAGRAM_APP_ID_DEFAULT = process.env.INSTAGRAM_APP_ID || '4269428196659273';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PM2 can start this file from either the repository root or vps-api-server/.
// Load both locations explicitly so auth always reads the intended VPS DB vars.
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

// Keep DATE columns as YYYY-MM-DD strings. Converting them to JS Date objects
// shifts calendar-only values one day back in Brazilian timezones when JSON-serialized.
pg.types.setTypeParser(1082, (value) => value);

const { Pool } = pg;
const app = express();
const PORT = process.env.API_PORT || 3002;

// Criar servidor HTTP para permitir o uso de server.listen() globalmente
const server = createServer(app);


// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
// Gzip: o payload do kanban da designer (centenas de cards com textos) cai ~80%.
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '10mb' }));

// Health Check: endpoint leve para monitoramento do Nginx/Uptime e Banco de Dados
// Diagnóstico do Pente Fino: mostra o que faltava e repara o schema.
// Só admin: a rota expõe nomes de tabelas/colunas e pode rodar DDL.
app.get('/api/diagnostics/pente-fino', async (req, res) => {
  // Roda CREATE/ALTER: só admin
  if (!(await requireAdminRoute(req, res))) return;
  try {
    await verifyAdmin(req);
  } catch (error) {
    return res.status(error?.message === 'Admin access required' ? 403 : 401).json({ error: error?.message || 'Unauthorized' });
  }
  try {
    const before = {};
    for (const [table, columns] of Object.entries(PENTE_FINO_SCHEMA)) {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [table]
      );
      if (rows.length === 0) {
        before[table] = { exists: false, missingColumns: Object.keys(columns) };
        continue;
      }
      const existing = await getExistingColumns(table);
      before[table] = {
        exists: true,
        missingColumns: Object.keys(columns).filter((c) => !existing.has(c)),
      };
    }

    // Só força nova verificação (e DDL) quando de fato falta tabela ou coluna.
    const needsRepair = Object.values(before).some((t) => !t.exists || t.missingColumns.length > 0);
    if (needsRepair) {
      penteFinoEnsuredPromise = null;
      await ensurePenteFinoTables();
    }

    res.json({ repaired: needsRepair, before });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'diagnostics failed' });
  }
});

/** SELECT 1 com tempo limite curto, para o health check nunca ficar travado. */
async function checkDatabaseHealth(timeoutMs = 3000) {
  let timer;
  try {
    const result = await Promise.race([
      pool.query('SELECT 1 as health'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout de ${timeoutMs} ms no SELECT 1`)), timeoutMs);
      }),
    ]);
    return result?.rows?.length ? { status: 'ok', error: null } : { status: 'error', error: 'SELECT 1 sem linhas' };
  } catch (err) {
    return { status: 'error', error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// Público (Nginx, update_vps.sh, monitor): só o estado. 503 quando o banco
// não responde, para o monitor e o deploy perceberem. Detalhes em /api/admin/health.
app.get('/api/health', async (req, res) => {
  const db = await checkDatabaseHealth();
  const ok = db.status === 'ok';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/admin/health', async (req, res) => {
  if (!(await requireAdminRoute(req, res))) return;
  const db = await checkDatabaseHealth();
  res.status(db.status === 'ok' ? 200 : 503).json({
    status: db.status === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: db,
    env: {
      has_jwt_secret: !!process.env.JWT_SECRET,
      has_db_url: !!process.env.DATABASE_URL,
      node_env: process.env.NODE_ENV
    }
  });
});

// ─── PostgreSQL local ───────────────────────────────────────
// Accept both the project's PG_* names and the standard libpq names used by
// many VPS/PostgreSQL installers. This prevents the API from silently falling
// back to the wrong database/user when the .env uses PGDATABASE/PGUSER/etc.
const pgConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const pgPassword = process.env.PG_PASSWORD ?? process.env.PGPASSWORD ?? process.env.DB_PASSWORD;

// connectionTimeoutMillis: com o pool esgotado, o pedido falha em 30 s em vez de esperar para
// sempre (antes um travamento do pool parava a API inteira sem o PM2 perceber).
const PG_POOL_TIMEOUTS = { connectionTimeoutMillis: 30_000 };
const pool = pgConnectionString
  ? new Pool({ connectionString: pgConnectionString, ...PG_POOL_TIMEOUTS })
  : new Pool({
      ...PG_POOL_TIMEOUTS,
      host: process.env.PG_HOST || process.env.PGHOST || 'localhost',
      port: Number(process.env.PG_PORT || process.env.PGPORT) || 5432,
      database: process.env.PG_DATABASE || process.env.PGDATABASE || process.env.DB_NAME || 'pulse_db',
      user: process.env.PG_USER || process.env.PGUSER || process.env.DB_USER || 'pulse_user',
      ...(typeof pgPassword === 'string' && pgPassword.length > 0 ? { password: pgPassword } : {}),
    });

// Cache das colunas de cada tabela. Fica aqui no topo porque os ensure* que rodam na
// subida (planos, CRM...) usam getExistingColumns antes do resto do arquivo carregar.
const tableColumnsPromiseCache = new Map();

const ONLINE_PRESENCE_MS = 120_000;
const presenceState = new Map();

function getPresenceHeartbeatTime(info) {
  if (!info?.heartbeatAt) return 0;
  const heartbeatAt = new Date(info.heartbeatAt).getTime();
  return Number.isFinite(heartbeatAt) ? heartbeatAt : 0;
}

function collectOnlinePresenceUsers() {
  const now = Date.now();
  const online = [];

  for (const [uid, info] of presenceState) {
    const heartbeatAt = getPresenceHeartbeatTime(info);
    if (uid && heartbeatAt > 0 && now - heartbeatAt < ONLINE_PRESENCE_MS) {
      online.push({ ...info, id: uid });
    } else {
      presenceState.delete(uid);
    }
  }

  return online;
}

function collectOnlinePresenceIds() {
  return new Set(
    collectOnlinePresenceUsers()
      .map((info) => info?.userId)
      .filter(Boolean)
  );
}

let storyEditingSessionsEnsuredPromise = null;
let crmLeadsColumnsEnsuredPromise = null;
let expenseStructureColumnEnsuredPromise = null;

async function ensureExpenseStructureColumn() {
  if (!expenseStructureColumnEnsuredPromise) {
    expenseStructureColumnEnsuredPromise = (async () => {
      try {
        const columns = await getExistingColumns('expenses');
        if (!columns.has('structure_investment')) {
          await pool.query('ALTER TABLE expenses ADD COLUMN structure_investment BOOLEAN DEFAULT FALSE').catch(err => {
            if (!/already exists|must be owner/i.test(err.message)) throw err;
          });
          console.log('Column structure_investment added to expenses');
          const cache = getTableColumnsPromiseCache();
          if (cache) cache.delete('expenses');
        }
      } catch (err) {
        console.error('ensureExpenseStructureColumn error:', err);
        expenseStructureColumnEnsuredPromise = null;
      }
    })();
  }
  return expenseStructureColumnEnsuredPromise;
}


async function ensureCrmLeadsColumns() {
  if (!crmLeadsColumnsEnsuredPromise) {
    crmLeadsColumnsEnsuredPromise = (async () => {
      try {
        const columns = await getExistingColumns('crm_leads');
        const alter = [];
        
        // Colunas para Geladeira e CRM avançado
        if (!columns.has('return_date')) alter.push('ADD COLUMN return_date DATE');
        if (!columns.has('description')) alter.push('ADD COLUMN description TEXT');
        if (!columns.has('city')) alter.push('ADD COLUMN city TEXT');
        if (!columns.has('source_tag')) alter.push('ADD COLUMN source_tag TEXT');
        if (!columns.has('referral_info')) alter.push('ADD COLUMN referral_info JSONB');
        if (!columns.has('meeting_date')) alter.push('ADD COLUMN meeting_date DATE');
        if (!columns.has('meeting_time')) alter.push('ADD COLUMN meeting_time TIME');
        if (!columns.has('closer_id')) alter.push('ADD COLUMN closer_id UUID');
        if (!columns.has('sdr_id')) alter.push('ADD COLUMN sdr_id UUID');
        if (!columns.has('sdr_briefing')) alter.push('ADD COLUMN sdr_briefing TEXT');
        if (!columns.has('meeting_notes')) alter.push('ADD COLUMN meeting_notes TEXT');
        if (!columns.has('reminder_sent_24h')) alter.push('ADD COLUMN reminder_sent_24h BOOLEAN DEFAULT FALSE');

        if (alter.length > 0) {
          await pool.query(`ALTER TABLE crm_leads ${alter.join(', ')}`).catch(err => {
            if (!/already exists|must be owner/i.test(err.message)) throw err;
          });
          console.log('CRM columns updated/verified');
          if (typeof getTableColumnsPromiseCache === 'function') {
            getTableColumnsPromiseCache().delete('crm_leads');
          }
        }

        // Atualizar constraint para manter todos os estágios disponíveis no Kanban.
        const { rows: constraints } = await pool.query(`
          SELECT conname 
          FROM pg_constraint c 
          JOIN pg_class t ON t.oid = c.conrelid 
          WHERE t.relname = 'crm_leads' 
            AND c.contype = 'c' 
            AND pg_get_constraintdef(c.oid) LIKE '%status%'
        `);
        
        for (const row of constraints) {
          await pool.query(`ALTER TABLE crm_leads DROP CONSTRAINT ${row.conname}`).catch(() => {});
        }
        
        await pool.query(`
          ALTER TABLE crm_leads 
          ADD CONSTRAINT crm_leads_status_check 
          CHECK (status IN ('lead', 'contacted', 'meeting', 'contracted', 'disqualified', 'lost', 'recovery_followup_1', 'recovery_followup_2', 'fridge'))
        `).catch(() => {});
      } catch (err) {
        console.error('ensureCrmLeadsColumns error:', err);
        crmLeadsColumnsEnsuredPromise = null;
      }
    })();
  }
  return crmLeadsColumnsEnsuredPromise;
}


const CLIENT_PORTAL_BASE_FIELDS = [
  'id',
  'company_name',
  'logo_url',
  'color',
  'weekly_reels',
  'weekly_creatives',
  'weekly_stories',
  'monthly_recordings',
  'plan_id',
  'show_metrics',
  'COALESCE(portal_insights_enabled, false) AS portal_insights_enabled',
  'has_vehicle_flyer',
  'niche',
  'whatsapp',
  'city',
  // aba 'Entregas' (sem_contrato) e boas-vindas de cliente novo (< 30 dias)
  'client_type',
  'created_at',
].join(', ');

let clientsArtRequestsLimitColumnPromise;
let proposalTablesEnsuredPromise;
let scriptRequestsEnsuredPromise;
let copyActiveSessionsEnsuredPromise;
const tableJsonColumnsPromiseCache = new Map();
let fridgeCleanupEnsuredPromise;
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

function getSchemaCacheValue(cache, key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > SCHEMA_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

async function hasClientsArtRequestsLimitColumn() {
  if (!clientsArtRequestsLimitColumnPromise) {
    clientsArtRequestsLimitColumnPromise = pool
      .query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'clients'
            AND column_name = 'art_requests_limit'
        ) AS exists
      `)
      .then(({ rows }) => Boolean(rows[0]?.exists))
      .catch((error) => {
        clientsArtRequestsLimitColumnPromise = null;
        throw error;
      });
  }

  return clientsArtRequestsLimitColumnPromise;
}

async function getPortalClientSelectClause() {
  const hasArtLimitColumn = await hasClientsArtRequestsLimitColumn();
  return hasArtLimitColumn
    ? `${CLIENT_PORTAL_BASE_FIELDS}, art_requests_limit`
    : `${CLIENT_PORTAL_BASE_FIELDS}, NULL::integer AS art_requests_limit`;
}

async function getClientArtLimitInfo(clientId, includeCompanyName = false) {
  const hasArtLimitColumn = await hasClientsArtRequestsLimitColumn();
  const selectClause = [
    includeCompanyName ? 'company_name' : null,
    hasArtLimitColumn ? 'art_requests_limit' : 'NULL::integer AS art_requests_limit',
  ]
    .filter(Boolean)
    .join(', ');

  const { rows: [clientInfo] } = await pool.query(
    `SELECT ${selectClause} FROM clients WHERE id = $1`,
    [clientId]
  );

  return clientInfo || null;
}

async function hasNullableClientIdOnContentTasks() {
  const { rows } = await pool.query(`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'content_tasks'
      AND column_name = 'client_id'
    LIMIT 1
  `);
  return rows[0]?.is_nullable === 'YES';
}

/**
 * Tarefa avulsa (sem cliente) precisa de content_tasks.client_id aceitando NULL.
 * Antes o ALTER rodava a cada chamada das rotas de avulso (lock exclusivo na
 * tabela mais usada); agora confere uma vez e só altera se ainda for NOT NULL,
 * com lock_timeout curto para nunca enfileirar o tráfego.
 */
let contentTasksClientIdNullablePromise = null;
function ensureContentTasksClientIdNullable() {
  if (!contentTasksClientIdNullablePromise) {
    contentTasksClientIdNullablePromise = (async () => {
      if (await hasNullableClientIdOnContentTasks()) return true;
      const client = await pool.connect();
      try {
        await client.query(`SET lock_timeout = '2s'`);
        await client.query(`ALTER TABLE content_tasks ALTER COLUMN client_id DROP NOT NULL`);
        return true;
      } finally {
        await client.query('RESET lock_timeout').catch(() => {});
        client.release();
      }
    })().catch((error) => {
      // Tenta de novo na próxima chamada
      contentTasksClientIdNullablePromise = null;
      console.warn('[avulso] client_id de content_tasks ainda NOT NULL:', error?.message || error);
      return false;
    });
  }
  return contentTasksClientIdNullablePromise;
}
// Na subida: confere (e ajusta, se preciso) uma única vez
ensureContentTasksClientIdNullable();

async function getTableJsonColumns(tableName) {
  const cached = getSchemaCacheValue(tableJsonColumnsPromiseCache, tableName);
  if (cached) return cached;

  if (!tableJsonColumnsPromiseCache.has(tableName)) {
    tableJsonColumnsPromiseCache.set(
      tableName,
      { cachedAt: Date.now(), value: pool.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND udt_name IN ('json', 'jsonb')
        `,
        [tableName],
      )
        .then(({ rows }) => new Set(rows.map((row) => row.column_name)))
        .catch((error) => {
          tableJsonColumnsPromiseCache.delete(tableName);
          throw error;
        }) }
    );
  }

  return tableJsonColumnsPromiseCache.get(tableName).value;
}

function serializeValueForColumn(columnName, value, jsonColumns) {
  if (jsonColumns && jsonColumns.has(columnName) && value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
}

function parseFilterArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [value];

  return value
    .replace(/^\(/, '')
    .replace(/\)$/, '')
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function splitOrFilterParts(value) {
  const input = String(value || '');
  const parts = [];
  let current = '';
  let depth = 0;

  for (const char of input) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

async function validateMeetingConflict(meetingDate, meetingTime, excludeLeadId = null) {
  if (!meetingDate || !meetingTime) return;

  // Sanitiza o formato do tempo para garantir HH:mm:ss ou HH:mm para comparação
  const formattedTime = meetingTime.includes(':') ? meetingTime : null;
  if (!formattedTime) return;

  const { rows: existingMeetings } = await pool.query(
    `SELECT id, meeting_time::text as meeting_time FROM crm_leads 
     WHERE meeting_date = $1 
       AND meeting_time IS NOT NULL 
       AND ($2::uuid IS NULL OR id != $2)
       AND status = 'meeting'`,
    [meetingDate, excludeLeadId]
  );

  const [h, m] = formattedTime.split(':').map(Number);
  const newTimeMinutes = h * 60 + m;

  for (const row of existingMeetings) {
    const [lh, lm] = row.meeting_time.split(':').map(Number);
    const leadTimeMinutes = lh * 60 + lm;
    const diff = Math.abs(newTimeMinutes - leadTimeMinutes);
    
    if (diff < 90) {
      const existingTimeFormatted = row.meeting_time.substring(0, 5);
      throw new Error(`CONFLITO_AGENDA: Já existe uma reunião às ${existingTimeFormatted}. O intervalo mínimo entre reuniões deve ser de 1h30.`);
    }
  }
}


async function ensureProposalTables() {
  if (!proposalTablesEnsuredPromise) {
    proposalTablesEnsuredPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS commercial_proposals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_name TEXT NOT NULL DEFAULT ''::text,
        client_company TEXT NOT NULL DEFAULT ''::text,
        plan_id UUID,
        plan_snapshot JSONB DEFAULT '{}'::jsonb,
        bonus_services JSONB DEFAULT '[]'::jsonb,
        team_members JSONB DEFAULT '[]'::jsonb,
        has_contract BOOLEAN NOT NULL DEFAULT true,
        custom_discount NUMERIC NOT NULL DEFAULT 0,
        observations TEXT DEFAULT ''::text,
        validity_date DATE NOT NULL DEFAULT (CURRENT_DATE + '7 days'::interval),
        whatsapp_number TEXT DEFAULT ''::text,
        created_by UUID,
        token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
        proposal_type TEXT NOT NULL DEFAULT 'marketing'::text,
        status TEXT NOT NULL DEFAULT 'pendente'::text,
        city TEXT,
        endomarketing_data JSONB DEFAULT '{}'::jsonb,
        system_data JSONB DEFAULT '{}'::jsonb,

        client_response_at TIMESTAMPTZ,
        client_response_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_commercial_proposals_token
        ON commercial_proposals (token);

      CREATE INDEX IF NOT EXISTS idx_commercial_proposals_created_at
        ON commercial_proposals (created_at DESC);

      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commercial_proposals' AND column_name='city') THEN
          ALTER TABLE commercial_proposals ADD COLUMN city TEXT;
        END IF;
      END $$;


      CREATE TABLE IF NOT EXISTS proposal_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        proposal_id UUID NOT NULL REFERENCES commercial_proposals(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL DEFAULT ''::text,
        message TEXT NOT NULL DEFAULT ''::text,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_proposal_comments_proposal_id
        ON proposal_comments (proposal_id, created_at);
    `).catch((error) => {
      proposalTablesEnsuredPromise = null;
      throw error;
    });
  }

  return proposalTablesEnsuredPromise;
}

ensureProposalTables().catch((error) => {
  console.error('Failed to ensure proposal tables:', error);
});

// Receitas previstas geradas uma vez só por proposta aceita (ver generateProposalRevenues).
// Separado do ensure acima: se falhar, a proposta pública continua funcionando.
let proposalRevenueColumnPromise = null;
function ensureProposalRevenueColumn() {
  if (!proposalRevenueColumnPromise) {
    proposalRevenueColumnPromise = (async () => {
      await ensureProposalTables();
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commercial_proposals' AND column_name='revenues_generated_at') THEN
            ALTER TABLE commercial_proposals ADD COLUMN revenues_generated_at TIMESTAMPTZ;
          END IF;
        END $$;
      `);
      // Propostas que já geraram receitas pelo navegador (marca antiga em observations): não gerar de novo.
      await pool.query(`
        UPDATE commercial_proposals
           SET revenues_generated_at = COALESCE(client_response_at, now())
         WHERE revenues_generated_at IS NULL AND observations LIKE '%[RECEITAS GERADAS%'
      `);
    })().catch((error) => {
      proposalRevenueColumnPromise = null;
      throw error;
    });
  }
  return proposalRevenueColumnPromise;
}

ensureProposalRevenueColumn().catch((error) => {
  console.error('Failed to ensure commercial_proposals.revenues_generated_at:', error?.message || error);
});

// ═══════════════════════════════════════════════════════════════
// PLAN PROMOTIONS TABLE
// ═══════════════════════════════════════════════════════════════
let planPromotionsEnsuredPromise = null;
async function ensurePlanPromotionsTable() {
  if (planPromotionsEnsuredPromise) return planPromotionsEnsuredPromise;
  planPromotionsEnsuredPromise = (async () => {
    try {
      const columns = await getExistingColumns('plan_promotions');
      if (columns.size === 0) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS plan_promotions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title TEXT NOT NULL,
            discount_percent NUMERIC NOT NULL,
            duration_months INTEGER DEFAULT 12,
            plan_key TEXT,
            city TEXT,
            active BOOLEAN DEFAULT true,
            exclusive BOOLEAN DEFAULT false,
            starts_at DATE,
            ends_at DATE,
            max_redemptions INTEGER,
            redemptions_count INTEGER DEFAULT 0,
            applies_to TEXT DEFAULT 'anual',
            created_at TIMESTAMPTZ DEFAULT now()
          )
        `);
      } else {
        const alter = [];
        if (!columns.has('duration_months')) alter.push('ADD COLUMN duration_months INTEGER DEFAULT 12');
        if (!columns.has('applies_to')) alter.push('ADD COLUMN applies_to TEXT DEFAULT \'anual\'');
        if (!columns.has('max_redemptions')) alter.push('ADD COLUMN max_redemptions INTEGER');
        if (!columns.has('redemptions_count')) alter.push('ADD COLUMN redemptions_count INTEGER DEFAULT 0');
        if (alter.length > 0) {
          await pool.query(`ALTER TABLE plan_promotions ${alter.join(', ')}`).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('ensurePlanPromotionsTable error:', e?.message || e);
      planPromotionsEnsuredPromise = null;
    }
  })();
  return planPromotionsEnsuredPromise;
}

ensurePlanPromotionsTable();

// Lead que vira Contratado ocupa uma vaga de cada promoção ativa da cidade dele (ou sem cidade).
// Antes o navegador chamava increment_promotion_redemption por rpc, que a VPS recusa (e a
// função nem existe aqui), então as vagas usadas nunca subiam.
async function incrementPromotionsForClosedLead(lead) {
  try {
    await ensurePlanPromotionsTable();
    const city = normalizeCityValue(lead?.city) || 'minacu';
    await pool.query(
      `UPDATE plan_promotions SET redemptions_count = COALESCE(redemptions_count, 0) + 1
        WHERE active = true
          AND (starts_at IS NULL OR starts_at <= $1::date)
          AND (ends_at IS NULL OR ends_at >= $1::date)
          AND (max_redemptions IS NULL OR COALESCE(redemptions_count, 0) < max_redemptions)
          AND (city IS NULL OR btrim(city::text) = '' OR ${cityScopeExpression('city')} = $2)`,
      [brtDateString(), city]
    );
  } catch (error) {
    console.warn('[crm] vagas das promoções não atualizadas:', error?.message || error);
  }
}

// ─── Promoções e oferta 6+6 na apresentação pública de planos (/p/planos) ───
// A página é pública e lia plan_promotions/crm_leads pelo /api/db/query, que exige login:
// o cliente nunca via a promoção, o link exclusivo nem o valor combinado no CRM.
const PUBLIC_PROMO_COLUMNS = `id, title, discount_percent, duration_months, applies_to, plan_key, city,
  active, exclusive, starts_at, ends_at, max_redemptions, redemptions_count`;
const PUBLIC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicPlanKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(key) ? key : null;
}

// Promoções gerais (não exclusivas) ativas, no período e com vaga, da cidade e do plano.
app.get('/api/public/plan-promotions', async (req, res) => {
  try {
    await ensurePlanPromotionsTable();
    const city = assertValidCity(req.query.city || 'minacu');
    const planKey = publicPlanKey(req.query.plan);
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_PROMO_COLUMNS} FROM plan_promotions
        WHERE active = true AND COALESCE(exclusive, false) = false
          AND (starts_at IS NULL OR starts_at <= $1::date)
          AND (ends_at IS NULL OR ends_at >= $1::date)
          AND (max_redemptions IS NULL OR COALESCE(redemptions_count, 0) < max_redemptions)
          AND (city IS NULL OR btrim(city::text) = '' OR ${cityScopeExpression('city')} = $2)
          AND ($3::text IS NULL OR plan_key IS NULL OR plan_key = $3)
        ORDER BY discount_percent DESC`,
      [brtDateString(), city, planKey]
    );
    res.json({ promotions: rows });
  } catch (e) {
    console.error('[public plan-promotions] error:', e?.message || e);
    res.status(500).json({ error: 'Erro ao carregar promoções' });
  }
});

// Link exclusivo (?promo=<id>): vale pelo id mesmo sendo exclusiva, mas confere período, vagas e plano.
app.get('/api/public/plan-promotions/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!PUBLIC_UUID_RE.test(id)) return res.json({ promotion: null });
    await ensurePlanPromotionsTable();
    const planKey = publicPlanKey(req.query.plan);
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_PROMO_COLUMNS} FROM plan_promotions
        WHERE id = $1
          AND (starts_at IS NULL OR starts_at <= $2::date)
          AND (ends_at IS NULL OR ends_at >= $2::date)
          AND (max_redemptions IS NULL OR COALESCE(redemptions_count, 0) < max_redemptions)
          AND ($3::text IS NULL OR plan_key IS NULL OR plan_key = $3)
        LIMIT 1`,
      [id, brtDateString(), planKey]
    );
    res.json({ promotion: rows[0] || null });
  } catch (e) {
    console.error('[public plan-promotion] error:', e?.message || e);
    res.status(500).json({ error: 'Erro ao carregar a promoção' });
  }
});

// Oferta 6+6 combinada no CRM (link com ?lead=<id>): devolve só o valor promocional,
// nunca os dados do lead.
app.get('/api/public/plan-offer/:leadId', async (req, res) => {
  try {
    const id = String(req.params.leadId || '');
    if (!PUBLIC_UUID_RE.test(id)) return res.json({ offer: null });
    await ensureCrmLeadsColumns();
    const { rows } = await pool.query(
      'SELECT source_tag, referral_info FROM crm_leads WHERE id = $1 LIMIT 1',
      [id]
    );
    const lead = rows[0];
    let info = lead?.referral_info || {};
    if (typeof info === 'string') {
      try { info = JSON.parse(info); } catch { info = {}; }
    }
    // promo_66 é o campo novo; leads antigos marcavam a oferta em source_tag.
    const active = info?.promo_66 === true || (info?.promo_66 === undefined && lead?.source_tag === 'promo_6_6');
    if (!lead || !active) return res.json({ offer: null });
    const promoValue = Number(info?.promo_value);
    res.json({ offer: { promo_value: Number.isFinite(promoValue) && promoValue > 0 ? promoValue : null } });
  } catch (e) {
    console.error('[public plan-offer] error:', e?.message || e);
    res.status(500).json({ error: 'Erro ao carregar a oferta' });
  }
});

// CRM: transferir um lead (e as notas dele) para a outra cidade. O botão 'Transferir' usava a
// rota de clientes com o id do lead ('Cliente não encontrado') e o update genérico força a
// cidade ativa, então não havia como mudar a cidade de um lead. Só admin/social_media.
app.patch('/api/crm/leads/:id/city', async (req, res) => {
  try {
    await verifyAdmin(req);
  } catch (e) {
    const forbidden = e.message === 'Admin access required';
    return res.status(forbidden ? 403 : 401).json({ error: forbidden ? 'Apenas admin ou social_media podem transferir leads.' : e.message });
  }
  const id = String(req.params.id || '');
  if (!PUBLIC_UUID_RE.test(id)) return res.status(400).json({ error: 'Lead inválido' });
  const target = normalizeCityValue(req.body?.city);
  if (!target || !ALLOWED_CITIES.has(target)) return res.status(400).json({ error: 'Cidade de destino inválida' });
  let db;
  try {
    await ensureCrmLeadsColumns();
    const notesHaveCity = await tableHasCityColumn('crm_notes');
    db = await pool.connect();
    await db.query('BEGIN');
    const { rows } = await db.query('SELECT id, city FROM crm_leads WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead não encontrado' });
    }
    const from = normalizeCityValue(rows[0].city) || 'minacu';
    if (from === target) {
      await db.query('ROLLBACK');
      return res.json({ ok: true, same_city: true, from, to: target, notes_moved: 0 });
    }
    await db.query('UPDATE crm_leads SET city = $2 WHERE id = $1', [id, target]);
    const notes = notesHaveCity
      ? await db.query('UPDATE crm_notes SET city = $2 WHERE lead_id = $1', [id, target])
      : { rowCount: 0 };
    await db.query('COMMIT');
    res.json({ ok: true, from, to: target, notes_moved: notes.rowCount || 0 });
  } catch (e) {
    if (db) await db.query('ROLLBACK').catch(() => {});
    console.error('[crm] transfer lead error:', e?.message || e);
    res.status(500).json({ error: e.message || 'Erro ao transferir o lead' });
  } finally {
    db?.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// LINK SHORTENER TABLES
// ═══════════════════════════════════════════════════════════════
let shortLinksTablesPromise = null;
async function ensureShortLinksTables() {
  if (shortLinksTablesPromise) return shortLinksTablesPromise;
  shortLinksTablesPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS short_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      original_url TEXT NOT NULL,
      campaign_name TEXT,
      active BOOLEAN DEFAULT true,
      city TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug);
    CREATE INDEX IF NOT EXISTS idx_short_links_city ON short_links(city);

    CREATE TABLE IF NOT EXISTS short_link_clicks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      short_link_id UUID REFERENCES short_links(id) ON DELETE CASCADE,
      clicked_at TIMESTAMPTZ DEFAULT now(),
      user_agent TEXT,
      referrer TEXT,
      city TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_short_link_clicks_link ON short_link_clicks(short_link_id);
  `).catch(err => {
    console.error('ensureShortLinksTables error:', err);
    shortLinksTablesPromise = null;
  });
  return shortLinksTablesPromise;
}
ensureShortLinksTables();


// BANCO DE DADOS DE CLIENTES (Profissionais + Unidades/Rede)
// ═══════════════════════════════════════════════════════════════
let clientDatabaseTablesPromise = null;

async function ensureClientDatabaseTables() {
  if (!clientDatabaseTablesPromise) {
    clientDatabaseTablesPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS client_professionals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT ''::text,
        specialty TEXT DEFAULT ''::text,
        council_type TEXT DEFAULT 'CRM'::text,
        council_number TEXT DEFAULT ''::text,
        rqe TEXT DEFAULT ''::text,
        phone TEXT DEFAULT ''::text,
        email TEXT DEFAULT ''::text,
        bio TEXT DEFAULT ''::text,
        schedule_notes TEXT DEFAULT ''::text,
        schedule JSONB DEFAULT '[]'::jsonb,
        photos JSONB DEFAULT '[]'::jsonb,
        videos JSONB DEFAULT '[]'::jsonb,
        active BOOLEAN NOT NULL DEFAULT true,
        city TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_client_professionals_client
        ON client_professionals (client_id);

      CREATE TABLE IF NOT EXISTS client_units (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        unit_name TEXT NOT NULL DEFAULT ''::text,
        unit_type TEXT DEFAULT 'geral'::text,
        city_name TEXT DEFAULT ''::text,
        state TEXT DEFAULT ''::text,
        city_anniversary DATE,
        population INTEGER,
        competitors TEXT DEFAULT ''::text,
        has_convenience BOOLEAN NOT NULL DEFAULT false,
        has_lodging BOOLEAN NOT NULL DEFAULT false,
        has_restaurant BOOLEAN NOT NULL DEFAULT false,
        address TEXT DEFAULT ''::text,
        phone TEXT DEFAULT ''::text,
        manager_name TEXT DEFAULT ''::text,
        notes TEXT DEFAULT ''::text,
        photos JSONB DEFAULT '[]'::jsonb,
        videos JSONB DEFAULT '[]'::jsonb,
        city TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_client_units_client
        ON client_units (client_id);

      CREATE TABLE IF NOT EXISTS client_collaborators (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        unit_id UUID,
        name TEXT NOT NULL DEFAULT ''::text,
        job_role TEXT DEFAULT ''::text,
        department TEXT DEFAULT ''::text,
        birthday DATE,
        phone TEXT DEFAULT ''::text,
        email TEXT DEFAULT ''::text,
        notes TEXT DEFAULT ''::text,
        photos JSONB DEFAULT '[]'::jsonb,
        videos JSONB DEFAULT '[]'::jsonb,
        active BOOLEAN NOT NULL DEFAULT true,
        city TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_client_collaborators_client
        ON client_collaborators (client_id);

      ALTER TABLE clients ADD COLUMN IF NOT EXISTS birthday_arts_enabled BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS collaborator_id UUID;
      ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS auto_ref TEXT;
      -- checklist das tarefas de Reformulação do onboarding (já está no schema base; garante para o feed)
      ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]'::jsonb;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_design_tasks_auto_ref
        ON design_tasks (auto_ref) WHERE auto_ref IS NOT NULL;
    `).catch((error) => {
      clientDatabaseTablesPromise = null;
      throw error;
    });
  }

  return clientDatabaseTablesPromise;
}

ensureClientDatabaseTables().catch((error) => {
  console.error('Failed to ensure client database tables:', error);
});

// ─── Geração automática de artes de aniversário de colaboradores ───
// Roda no boot e a cada 6h: para clientes com `birthday_arts_enabled`,
// cria uma tarefa de design 15 dias antes do aniversário de cada colaborador.
const BIRTHDAY_ART_LEAD_DAYS = 15;

async function generateCollaboratorBirthdayTasks() {
  try {
    await ensureClientDatabaseTables();

    // Colaboradores ativos com o próximo aniversário entre hoje e daqui a 15 dias. A janela
    // (em vez do dia exato) não perde aniversário se a API ficar fora no dia; o auto_ref
    // (com o ano do aniversário) evita tarefa repetida. 29/02 vira 28/02 em ano não bissexto.
    const { rows } = await pool.query(
      `WITH base AS (
         SELECT col.id, col.name, col.job_role, col.birthday, col.client_id,
                c.company_name, c.city,
                EXTRACT(MONTH FROM col.birthday)::int AS bm,
                EXTRACT(DAY FROM col.birthday)::int AS bd
           FROM client_collaborators col
           JOIN clients c ON c.id = col.client_id
          WHERE col.active = true
            AND col.birthday IS NOT NULL
            AND c.birthday_arts_enabled = true
       ), occ AS (
         SELECT base.*,
                make_date(y.yr, base.bm,
                  CASE WHEN base.bm = 2 AND base.bd = 29
                        AND NOT (y.yr % 4 = 0 AND (y.yr % 100 <> 0 OR y.yr % 400 = 0))
                       THEN 28 ELSE base.bd END) AS next_bday
           FROM base
          CROSS JOIN LATERAL (VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::int),
                                     (EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)) AS y(yr)
       )
       SELECT id, name, job_role, birthday, client_id, company_name, city, next_bday::text AS next_bday
         FROM occ
        WHERE next_bday BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int`,
      [BIRTHDAY_ART_LEAD_DAYS],
    );

    let created = 0;
    for (const row of rows) {
      const nextBirthday = String(row.next_bday).slice(0, 10);
      const autoRef = `birthday:${row.id}:${nextBirthday.slice(0, 4)}`;
      const dayLabel = String(row.birthday).slice(0, 10).split('-').reverse().slice(0, 2).join('/');

      // O índice único de auto_ref é parcial: o ON CONFLICT precisa do mesmo WHERE, senão o
      // Postgres não acha o índice e o INSERT falha sempre (nenhuma tarefa era criada).
      const result = await pool.query(
        `INSERT INTO design_tasks
           (client_id, title, description, format_type, kanban_column, priority,
            due_date, city, collaborator_id, auto_ref)
         VALUES ($1, $2, $3, 'feed', 'nova_tarefa', 'media', $4, $5, $6, $7)
         ON CONFLICT (auto_ref) WHERE auto_ref IS NOT NULL DO NOTHING`,
        [
          row.client_id,
          `Aniversário — ${row.name}`,
          `Arte de aniversário do colaborador ${row.name}${row.job_role ? ` (${row.job_role})` : ''} — ${row.company_name}. Data do aniversário: ${dayLabel}. Dados e fotos disponíveis no Banco de Dados do cliente.`,
          nextBirthday,
          row.city || null,
          row.id,
          autoRef,
        ],
      ).catch((error) => {
        console.warn('birthday art task insert failed:', error?.message || error);
        return null;
      });
      created += result?.rowCount || 0;
    }

    if (created) {
      console.log(`[birthday-arts] ${created} tarefa(s) de aniversário criada(s) (${rows.length} aniversário(s) na janela).`);
    }
  } catch (error) {
    console.error('generateCollaboratorBirthdayTasks error:', error?.message || error);
  }
}

setTimeout(generateCollaboratorBirthdayTasks, 20_000);
setInterval(generateCollaboratorBirthdayTasks, 6 * 60 * 60 * 1000);

// ─── Compartilhamento público do banco de dados de um cliente ───
let clientDatabaseSharePromise = null;

async function ensureClientDatabaseShareTable() {
  if (!clientDatabaseSharePromise) {
    clientDatabaseSharePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS client_database_shares (
        token TEXT PRIMARY KEY,
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        created_by UUID,
        active BOOLEAN NOT NULL DEFAULT true,
        views INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_client_database_shares_client
        ON client_database_shares (client_id);
    `).catch((error) => {
      clientDatabaseSharePromise = null;
      throw error;
    });
  }
  return clientDatabaseSharePromise;
}

// BIO LINK TABLES
let bioLinksTablesPromise = null;
async function ensureBioLinksTables() {
  if (bioLinksTablesPromise) return bioLinksTablesPromise;
  bioLinksTablesPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS client_bio_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      slug TEXT UNIQUE NOT NULL,
      title TEXT,
      description TEXT,
      logo_url TEXT,
      theme_config JSONB DEFAULT '{}'::jsonb,
      city TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE client_bio_links ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '{}'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_bio_links_slug ON client_bio_links(slug);
    CREATE INDEX IF NOT EXISTS idx_bio_links_client ON client_bio_links(client_id);


    CREATE TABLE IF NOT EXISTS client_bio_buttons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bio_link_id UUID NOT NULL REFERENCES client_bio_links(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('whatsapp', 'location', 'social', 'custom')),
      value TEXT NOT NULL,
      icon TEXT,
      position INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_bio_buttons_link ON client_bio_buttons(bio_link_id);
  `).catch(err => {
    console.error('ensureBioLinksTables error:', err);
    bioLinksTablesPromise = null;
  });
  return bioLinksTablesPromise;
}
ensureBioLinksTables();

ensureClientDatabaseShareTable().catch((error) => {
  console.error('Failed to ensure client database share table:', error);
});

// ═══════════════════════════════════════════════════════════════
// ALMOXERIFADO & ESTRUTURA
// ═══════════════════════════════════════════════════════════════
let warehouseTablesPromise = null;

async function ensureWarehouseTables() {
  if (!warehouseTablesPromise) {
    warehouseTablesPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS warehouse_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        tag_id TEXT,
        responsible_id UUID,
        status TEXT DEFAULT 'em_uso' CHECK (status IN ('em_uso', 'manutencao', 'disponivel', 'descartado')),
        purchase_date DATE,
        purchase_price NUMERIC,
        expense_id UUID,
        observations TEXT,
        city TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS warehouse_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id UUID REFERENCES warehouse_items(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('entrada', 'saida', 'transferencia', 'manutencao')),
        from_responsible_id UUID,
        to_responsible_id UUID,
        observations TEXT,
        movement_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_warehouse_items_tag ON warehouse_items(tag_id);
      CREATE INDEX IF NOT EXISTS idx_warehouse_items_responsible ON warehouse_items(responsible_id);
      CREATE INDEX IF NOT EXISTS idx_warehouse_movements_item ON warehouse_movements(item_id);

      -- Investimentos em estrutura: controle próprio, NÃO gera despesa
      CREATE TABLE IF NOT EXISTS structure_investments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        category TEXT NOT NULL DEFAULT 'outros',
        description TEXT,
        responsible TEXT,
        city TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_structure_investments_date ON structure_investments(date);

      
      -- Add structure_investment column to expenses if not exists
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'expenses' AND column_name = 'structure_investment'
          ) THEN
              ALTER TABLE expenses ADD COLUMN structure_investment BOOLEAN DEFAULT FALSE;
          END IF;
      END $$;
    `).catch((error) => {
      warehouseTablesPromise = null;
      throw error;
    });
  }
  return warehouseTablesPromise;
}

ensureWarehouseTables().catch((error) => {
  console.error('Failed to ensure warehouse tables:', error);
});

// ─── Receitas recorrentes avulsas (além do contrato fixo do cliente) ───
// Permite mais de uma cobrança recorrente por cliente (ex.: contrato + edição de vídeos).
let recurringRevenuesPromise = null;
async function ensureRecurringRevenuesTables() {
  if (!recurringRevenuesPromise) {
    recurringRevenuesPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS recurring_revenues (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'outros',
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        due_day INTEGER NOT NULL DEFAULT 10,
        start_month DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
        active BOOLEAN NOT NULL DEFAULT true,
        city TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_recurring_revenues_client
        ON recurring_revenues (client_id);

      -- Receitas passam a aceitar lançamentos avulsos/recorrentes sem contrato fixo
      ALTER TABLE revenues ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE revenues ADD COLUMN IF NOT EXISTS category TEXT;
      ALTER TABLE revenues ADD COLUMN IF NOT EXISTS recurrence_id UUID;
      ALTER TABLE revenues ALTER COLUMN contract_id DROP NOT NULL;
      ALTER TABLE revenues ALTER COLUMN client_id DROP NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_revenues_recurrence_month
        ON revenues (recurrence_id, reference_month) WHERE recurrence_id IS NOT NULL;
    `).catch((error) => {
      recurringRevenuesPromise = null;
      throw error;
    });
  }
  return recurringRevenuesPromise;
}

ensureRecurringRevenuesTables().catch((error) => {
  console.error('Failed to ensure recurring revenues tables:', error);
});

// ─── Bônus de salário (registro do "Pagar + Bônus" e banner de parabéns) ───
// A tabela só existia no Supabase antigo: na VPS o insert falhava em silêncio.
let salaryBonusesPromise = null;
async function ensureSalaryBonusesTable() {
  if (!salaryBonusesPromise) {
    salaryBonusesPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS salary_bonuses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_id UUID NOT NULL,
        user_name TEXT NOT NULL DEFAULT '',
        user_role TEXT NOT NULL DEFAULT '',
        bonus_amount NUMERIC NOT NULL DEFAULT 0,
        reference_month TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE salary_bonuses ADD COLUMN IF NOT EXISTS user_id UUID;
      ALTER TABLE salary_bonuses ADD COLUMN IF NOT EXISTS city TEXT;
      CREATE INDEX IF NOT EXISTS idx_salary_bonuses_month ON salary_bonuses (reference_month);
    `).catch((error) => {
      salaryBonusesPromise = null;
      throw error;
    });
  }
  return salaryBonusesPromise;
}

ensureSalaryBonusesTable().catch((error) => {
  console.error('Failed to ensure salary bonuses table:', error);
});

// ─── Campanhas: garante tabelas e o vínculo de roteiro/tarefas com o slot ───
// Sem a coluna campaign_slot_id o roteiro criado pela campanha falha ao salvar
// e não aparece no módulo Roteiros.
let campaignTablesPromise = null;
async function ensureCampaignTables() {
  if (!campaignTablesPromise) {
    campaignTablesPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'institucional',
        objective TEXT,
        start_date DATE,
        end_date DATE,
        videos_qty INTEGER NOT NULL DEFAULT 0,
        creatives_qty INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ativa',
        owner_id UUID,
        editorial JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS campaign_slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID,
        position INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'video',
        title TEXT,
        post_date DATE,
        status TEXT NOT NULL DEFAULT 'pendente',
        script_id UUID,
        content_task_id UUID,
        design_task_id UUID,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_campaign_slots_campaign_pos ON campaign_slots (campaign_id, position);

      ALTER TABLE scripts       ADD COLUMN IF NOT EXISTS campaign_slot_id UUID;
      ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS campaign_slot_id UUID;
      ALTER TABLE design_tasks  ADD COLUMN IF NOT EXISTS campaign_slot_id UUID;

      CREATE INDEX IF NOT EXISTS idx_scripts_campaign_slot ON scripts (campaign_slot_id);
    `).catch((error) => {
      campaignTablesPromise = null;
      throw error;
    });
  }
  return campaignTablesPromise;
}

ensureCampaignTables().catch((error) => {
  console.error('Failed to ensure campaign tables:', error);
});




const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeShareToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 22);
}

/** Cria (ou reaproveita) um link público para o banco de dados de um cliente. */
app.post('/api/client-database/share', async (req, res) => {
  try {
    const user = await verifyUser(req);
    const clientId = String(req.body?.client_id || '');
    if (!UUID_RE.test(clientId)) return res.status(400).json({ error: 'client_id inválido' });

    await ensureClientDatabaseShareTable();

    const existing = await pool.query(
      'SELECT token FROM client_database_shares WHERE client_id = $1 AND active = true LIMIT 1',
      [clientId],
    );
    if (existing.rows.length > 0) return res.json({ token: existing.rows[0].token, reused: true });

    const token = makeShareToken();
    await pool.query(
      'INSERT INTO client_database_shares (token, client_id, created_by) VALUES ($1, $2, $3)',
      [token, clientId, user?.id || user?.userId || null],
    );
    return res.json({ token, reused: false });
  } catch (error) {
    if (String(error?.message).includes('Unauthorized')) return res.status(401).json({ error: 'Unauthorized' });
    console.error('client-database share error:', error);
    return res.status(500).json({ error: 'Falha ao gerar link público' });
  }
});

/** Revoga o link público ativo de um cliente. */
app.delete('/api/client-database/share/:clientId', async (req, res) => {
  try {
    await verifyUser(req);
    const clientId = String(req.params.clientId || '');
    if (!UUID_RE.test(clientId)) return res.status(400).json({ error: 'client_id inválido' });
    await ensureClientDatabaseShareTable();
    await pool.query('UPDATE client_database_shares SET active = false WHERE client_id = $1', [clientId]);
    return res.json({ success: true });
  } catch (error) {
    if (String(error?.message).includes('Unauthorized')) return res.status(401).json({ error: 'Unauthorized' });
    return res.status(500).json({ error: 'Falha ao revogar link' });
  }
});

/** Leitura pública (sem login) do banco de dados de um cliente via token. */
app.get('/api/public/client-database/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!token) return res.status(400).json({ error: 'Token inválido' });

    await ensureClientDatabaseShareTable();
    const share = await pool.query(
      'SELECT client_id FROM client_database_shares WHERE token = $1 AND active = true LIMIT 1',
      [token],
    );
    if (share.rows.length === 0) return res.status(404).json({ error: 'Link inválido ou revogado' });

    const clientId = share.rows[0].client_id;
    pool.query('UPDATE client_database_shares SET views = views + 1 WHERE token = $1', [token]).catch(() => {});

    // Link sem login: só o que a página pública mostra (nome, cargo e mídia). Aniversários,
    // observações, conselho, agenda e endereços ficam só para a equipe.
    const [client, professionals, units, collaborators] = await Promise.all([
      pool.query('SELECT id, company_name, logo_url FROM clients WHERE id = $1 LIMIT 1', [clientId]),
      pool.query(
        `SELECT id, name, specialty, photos, videos
         FROM client_professionals WHERE client_id = $1 ORDER BY name ASC`,
        [clientId],
      ),
      pool.query(
        `SELECT id, unit_name, city_name, state, photos, videos
         FROM client_units WHERE client_id = $1 ORDER BY city_name ASC`,
        [clientId],
      ),
      pool.query(
        `SELECT id, name, job_role, department, photos, videos
         FROM client_collaborators WHERE client_id = $1 ORDER BY name ASC`,
        [clientId],
      ).catch(() => ({ rows: [] })),
    ]);

    if (client.rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });

    return res.json({
      client: client.rows[0],
      professionals: professionals.rows,
      units: units.rows,
      collaborators: collaborators.rows,
    });
  } catch (error) {
    console.error('public client-database error:', error);
    return res.status(500).json({ error: 'Falha ao carregar banco de dados público' });
  }
});




// ensureCrmLeadsColumns was moved to line 121 to avoid duplication
ensureCrmLeadsColumns().catch(err => console.error('CRM leads column sync failed:', err));


/**
 * Todas as raízes possíveis onde os arquivos de /uploads/ podem estar
 * gravados nesta VPS. UPLOAD_ROOT é resolvido mais abaixo no arquivo, por isso
 * é lido de forma preguiçosa (a função só roda em tempo de request).
 */
function uploadRoots() {
  const roots = [
    process.env.UPLOAD_ROOT?.trim(),
    (() => { try { return UPLOAD_ROOT; } catch { return null; } })(),
    '/var/www/uploads',
    '/var/www/html/uploads',
    path.join(__dirname, '..', 'uploads'),
    path.join(__dirname, 'uploads'),
  ].filter(Boolean).map((r) => path.resolve(r));
  return [...new Set(roots)];
}

/**
 * Converte uma URL pública (/uploads/...) em caminho relativo seguro.
 * Retorna null quando a URL é externa (Drive, YouTube, etc.).
 */
function uploadRelativePath(fileUrl) {
  const raw = String(fileUrl || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, 'https://agenciapulse.tech');
    if (!parsed.pathname.startsWith('/uploads/')) return null;
    const relative = decodeURIComponent(parsed.pathname.replace(/^\/uploads\//, ''));
    if (!relative || relative.includes('..')) return null;
    return relative;
  } catch {
    return null;
  }
}

/** Remove o arquivo físico em todas as raízes conhecidas. Retorna bytes liberados. */
function removeUploadFile(fileUrl) {
  const relative = uploadRelativePath(fileUrl);
  if (!relative) return 0;

  let freed = 0;
  for (const root of uploadRoots()) {
    const candidate = path.resolve(root, relative);
    if (!candidate.startsWith(`${root}${path.sep}`)) continue;
    try {
      if (!fs.existsSync(candidate)) continue;
      freed += fs.statSync(candidate).size;
      fs.unlinkSync(candidate);
    } catch (error) {
      console.warn('[cleanup] falha ao remover arquivo:', candidate, error?.message || error);
    }
  }
  return freed;
}

// Limpeza diária das versões antigas de vídeo (regra em lib/versionCleanup.mjs). Uma vez por
// dia (fuso de Brasília): a primeira checagem sai 2 min depois da subida, depois a cada 3 h.
async function runDailyVersionCleanup() {
  // _v2: regra que ignora histórico/logs ao decidir o que está em uso (roda de novo no dia da troca)
  const job = 'limpeza_versoes_video_v2';
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS pulse_job_runs (
      job TEXT NOT NULL, day DATE NOT NULL, ran_at TIMESTAMPTZ NOT NULL DEFAULT now(), result JSONB,
      PRIMARY KEY (job, day))`);
    const { rowCount } = await pool.query(
      `INSERT INTO pulse_job_runs (job, day) VALUES ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date) ON CONFLICT DO NOTHING`, [job]
    );
    if (!rowCount) return;
    const result = await cleanupOldEditVersions(pool, { removeUploadFile, uploadRelativePath });
    await pool.query(
      `UPDATE pulse_job_runs SET result = $2 WHERE job = $1 AND day = (now() AT TIME ZONE 'America/Sao_Paulo')::date`,
      [job, JSON.stringify(result)]
    );
    console.log(`[limpeza-versoes] ${result.deleted} vídeo(s) antigo(s) apagado(s), ${(result.bytes / 1e9).toFixed(2)} GB liberados, ${result.skipped} mantido(s) por uso ou idade`);
  } catch (error) {
    console.error('[limpeza-versoes] falha:', error?.message || error);
  }
}
setTimeout(runDailyVersionCleanup, 2 * 60 * 1000).unref?.();
setInterval(runDailyVersionCleanup, 3 * 60 * 60 * 1000).unref?.();

async function cleanupOldPortalVideos(options = {}) {
  const { 
    months = [], 
    clientId = null, 
    allClients = true, 
    olderThanDays = 60,
    contentTypes = [],
    // Por padrão não apaga o que ainda está em andamento (pendente, ajuste, revisão
    // interna) nem a temporada do mês atual; includeOpen = true libera tudo.
    includeOpen = false,
    // dryRun: só conta (por status e quantos clientes), sem apagar nada.
    dryRun = false,
  } = options;

  let query = `FROM client_portal_contents
    WHERE file_url IS NOT NULL
      AND content_type <> 'arte'`;
  const params = [];

  if (!includeOpen) {
    query += ` AND status NOT IN ('pendente', 'ajuste_solicitado', 'revisao_interna')`;
    query += ` AND NOT (season_year = EXTRACT(YEAR FROM NOW())::int AND season_month = EXTRACT(MONTH FROM NOW())::int)`;
  }

  const types = Array.isArray(contentTypes)
    ? contentTypes.map((t) => String(t || '').trim()).filter((t) => t && t !== 'arte')
    : [];
  if (types.length > 0) {
    params.push(types);
    query += ` AND content_type = ANY($${params.length}::text[])`;
  }

  if (clientId && !allClients) {
    params.push(clientId);
    query += ` AND client_id = $${params.length}`;
  }

  if (months.length > 0) {
    // months is an array of strings like ['2026-08', '2026-07']
    const monthConditions = months.map(m => {
      const [year, month] = m.split('-');
      return `(season_year = ${parseInt(year)} AND season_month = ${parseInt(month)})`;
    });
    query += ` AND (${monthConditions.join(' OR ')})`;
  } else if (olderThanDays) {
    query += ` AND created_at < NOW() - INTERVAL '${olderThanDays} days'`;
  }

  if (dryRun) {
    const { rows: byStatus } = await pool.query(
      `SELECT status, count(*)::int AS total, count(DISTINCT client_id)::int AS clients ${query} GROUP BY status`, params
    );
    const { rows: [totals] } = await pool.query(
      `SELECT count(*)::int AS total, count(DISTINCT client_id)::int AS clients ${query}`, params
    );
    return { total: totals?.total || 0, clients: totals?.clients || 0, byStatus };
  }

  const { rows, rowCount } = await pool.query(`DELETE ${query} RETURNING file_url, thumbnail_url`, params);

  let freedBytes = 0;
  // Proteção global: só remove do disco o arquivo que não é citado por
  // NENHUM módulo (artes da designer, banco de dados de clientes, campanhas...).
  let referenced = new Set();
  let referencedNames = new Set();
  if (rows.length > 0) {
    try {
      ({ referenced, referencedNames } = await collectReferencedUploads());
    } catch (error) {
      console.warn('[cleanup] varredura de referências falhou — nenhum arquivo será apagado do disco:', error?.message || error);
      lastCleanupStats = { deletedCount: rowCount, freedBytes: 0, at: new Date().toISOString() };
      return rowCount;
    }
  }

  for (const row of rows) {
    for (const url of [row.file_url, row.thumbnail_url]) {
      if (!url) continue;
      const rel = uploadRelativePath(url);
      if (!rel) continue;
      const name = rel.slice(rel.lastIndexOf('/') + 1);
      if (referenced.has(rel) || referencedNames.has(name)) continue;
      if (rel.toLowerCase().split('/').slice(0, -1).some((seg) => ORPHAN_SKIP_DIRS.has(seg))) continue;
      freedBytes += removeUploadFile(url);
    }
  }

  lastCleanupStats = { deletedCount: rowCount, freedBytes, at: new Date().toISOString() };
  console.log(`[cleanup] ${rowCount} registros removidos, ${(freedBytes / 1048576).toFixed(1)} MB liberados`);
  return rowCount;
}

let lastCleanupStats = { deletedCount: 0, freedBytes: 0, at: null };

// ═══════════════════════════════════════════════════════════════
// PENTE FINO — garantia de schema
// ═══════════════════════════════════════════════════════════════
// O painel "Pente Fino" (CostByContentType) consulta 8 tabelas com
// colunas explícitas. Se qualquer uma delas não existir na VPS, a
// consulta falha e o painel aparece vazio. Aqui criamos o que faltar
// (tabela inteira ou colunas isoladas) de forma idempotente.
const PENTE_FINO_SCHEMA = {
  delivery_records: {
    client_id: 'UUID',
    videomaker_id: 'UUID',
    date: 'DATE',
    reels_produced: 'NUMERIC(10,2) DEFAULT 0',
    creatives_produced: 'NUMERIC(10,2) DEFAULT 0',
    stories_produced: 'NUMERIC(10,2) DEFAULT 0',
    arts_produced: 'NUMERIC(10,2) DEFAULT 0',
    delivery_status: 'TEXT',
    city: 'TEXT',
  },
  social_media_deliveries: {
    client_id: 'UUID',
    content_type: 'TEXT',
    delivered_at: 'TIMESTAMPTZ',
    posted_at: 'TIMESTAMPTZ',
    status: 'TEXT',
    created_by: 'UUID',
    city: 'TEXT',
  },
  content_tasks: {
    client_id: 'UUID',
    content_type: 'TEXT',
    kanban_column: 'TEXT',
    approved_at: 'TIMESTAMPTZ',
    assigned_to: 'UUID',
    edited_by: 'UUID',
    city: 'TEXT',
  },
  design_tasks: {
    client_id: 'UUID',
    kanban_column: 'TEXT',
    completed_at: 'TIMESTAMPTZ',
    attachment_url: 'TEXT',
    attachment_urls: 'JSONB DEFAULT \'[]\'::jsonb',
    editable_file_url: 'TEXT',
    mockup_url: 'TEXT',
    assigned_to: 'UUID',
    city: 'TEXT',
  },
  scripts: {
    client_id: 'UUID',
    content_format: 'TEXT',
    created_by: 'UUID',
    city: 'TEXT',
  },
  expense_categories: {
    name: 'TEXT',
  },
  expenses: {
    date: 'DATE',
    amount: 'NUMERIC(12,2) DEFAULT 0',
    description: 'TEXT',
    responsible: 'TEXT',
    category_id: 'UUID',
    expense_type: 'TEXT',
    city: 'TEXT',
  },
  plans: {
    name: 'TEXT',
    price: 'NUMERIC(12,2) DEFAULT 0',
    reels_qty: 'NUMERIC(10,2) DEFAULT 0',
    creatives_qty: 'NUMERIC(10,2) DEFAULT 0',
    stories_qty: 'NUMERIC(10,2) DEFAULT 0',
    arts_qty: 'NUMERIC(10,2) DEFAULT 0',
    recording_sessions: 'NUMERIC(10,2) DEFAULT 0',
    status: 'TEXT',
    city: 'TEXT',
  },
};

let penteFinoEnsuredPromise = null;

/**
 * Cria/repara as tabelas do Pente Fino. Erros de ownership (42501) são
 * apenas logados: as colunas já existentes bastam para o painel carregar.
 */
async function ensurePenteFinoTables() {
  if (!penteFinoEnsuredPromise) {
    penteFinoEnsuredPromise = (async () => {
      const missing = [];

      for (const [table, columns] of Object.entries(PENTE_FINO_SCHEMA)) {
        const { rows } = await pool.query(
          `SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
          [table]
        );

        if (rows.length === 0) {
          missing.push(table);
          const columnSql = Object.entries(columns)
            .map(([name, type]) => `${name} ${type}`)
            .join(',\n            ');
          await pool.query(`
            CREATE TABLE public.${table} (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              ${columnSql},
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
          `);
          tableColumnsPromiseCache.delete(table);
          continue;
        }

        const existing = await getExistingColumns(table);
        const alterClauses = Object.entries(columns)
          .filter(([name]) => !existing.has(name))
          .map(([name, type]) => `ADD COLUMN IF NOT EXISTS ${name} ${type}`);

        if (!existing.has('created_at')) alterClauses.push('ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()');
        if (!existing.has('updated_at')) alterClauses.push('ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()');

        if (alterClauses.length > 0) {
          await pool.query(`ALTER TABLE public.${table} ${alterClauses.join(', ')}`)
            .then(() => { tableColumnsPromiseCache.delete(table); })
            .catch((error) => {
              if (error?.code === '42501' || /must be owner|permission denied/i.test(error?.message || '')) {
                console.warn(`[pente-fino] ${table}: colunas opcionais ignoradas (ownership):`, error.message);
                return;
              }
              throw error;
            });
        }
      }

      if (missing.length > 0) {
        console.log('[pente-fino] Tabelas criadas na VPS:', missing.join(', '));
      }
    })().catch((error) => {
      penteFinoEnsuredPromise = null;
      throw error;
    });
  }

  return penteFinoEnsuredPromise;
}


async function ensureStoryEditingSessionsTable() {
  if (!storyEditingSessionsEnsuredPromise) {
    storyEditingSessionsEnsuredPromise = (async () => {
      const { rows: tableRows } = await pool.query(
        `SELECT 1
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'story_editing_sessions'
          LIMIT 1`
      );

      if (tableRows.length === 0) {
        await pool.query(`
          CREATE TABLE story_editing_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            videomaker_id UUID NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            ended_at TIMESTAMPTZ,
            stories_count INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            city TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
      }

      const columns = await getExistingColumns('story_editing_sessions');
      const alterClauses = [];
      if (!columns.has('city')) alterClauses.push('ADD COLUMN city TEXT');
      if (!columns.has('notes')) alterClauses.push('ADD COLUMN notes TEXT');
      if (!columns.has('updated_at')) alterClauses.push('ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now()');

      if (alterClauses.length > 0) {
        await pool.query(`ALTER TABLE story_editing_sessions ${alterClauses.join(', ')}`).then(() => {
          tableColumnsPromiseCache.delete('story_editing_sessions');
        }).catch((error) => {
          // If the table was created manually as postgres, the API role may not
          // own it. Existing required columns are enough to keep the timer alive;
          // the VPS command below fixes ownership definitively.
          if (error?.code === '42501' || /must be owner|permission denied/i.test(error?.message || '')) {
            console.warn('[story_editing_sessions] Skipping optional column sync due to table ownership:', error.message);
            return;
          }
          throw error;
        });
      }

      const indexStatements = [
        `CREATE INDEX IF NOT EXISTS idx_story_sessions_videomaker ON story_editing_sessions(videomaker_id)`,
        `CREATE INDEX IF NOT EXISTS idx_story_sessions_active ON story_editing_sessions(videomaker_id) WHERE ended_at IS NULL`,
        `CREATE INDEX IF NOT EXISTS idx_story_sessions_started ON story_editing_sessions(started_at DESC)`,
      ];

      for (const statement of indexStatements) {
        await pool.query(statement).catch((error) => {
          // Indexes are performance-only. Do not block the story timer if the VPS
          // table was manually created by postgres and the API user is not owner.
          if (error?.code === '42501' || /must be owner|permission denied/i.test(error?.message || '')) {
            console.warn('[story_editing_sessions] Skipping index creation due to table ownership:', error.message);
            return;
          }
          throw error;
        });
      }
    })().catch((error) => {
      storyEditingSessionsEnsuredPromise = null;
      throw error;
    });
  }

  return storyEditingSessionsEnsuredPromise;
}

ensureStoryEditingSessionsTable().catch((error) => {
  console.error('Failed to ensure story editing sessions table:', error);
});

async function ensureCopyActiveSessionsTable() {
  if (!copyActiveSessionsEnsuredPromise) {
    copyActiveSessionsEnsuredPromise = (async () => {
      const { rows: tableRows } = await pool.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='copy_active_sessions' LIMIT 1`
      );
      if (tableRows.length === 0) {
        await pool.query(`
          CREATE TABLE copy_active_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            copywriter_id UUID NOT NULL,
            copywriter_name TEXT,
            task_id UUID,
            request_id UUID,
            client_id UUID,
            topic TEXT,
            content_format TEXT,
            batch_size INTEGER NOT NULL DEFAULT 0,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            city TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
      }
      const columns = await getExistingColumns('copy_active_sessions');
      const alter = [];
      if (!columns.has('copywriter_name')) alter.push('ADD COLUMN copywriter_name TEXT');
      if (!columns.has('task_id')) alter.push('ADD COLUMN task_id UUID');
      if (!columns.has('request_id')) alter.push('ADD COLUMN request_id UUID');
      if (!columns.has('client_id')) alter.push('ADD COLUMN client_id UUID');
      if (!columns.has('topic')) alter.push('ADD COLUMN topic TEXT');
      if (!columns.has('content_format')) alter.push('ADD COLUMN content_format TEXT');
      if (!columns.has('batch_size')) alter.push('ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 0');
      if (!columns.has('city')) alter.push('ADD COLUMN city TEXT');
      if (!columns.has('updated_at')) alter.push('ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now()');
      if (alter.length > 0) {
        await pool.query(`ALTER TABLE copy_active_sessions ${alter.join(', ')}`).then(() => {
          tableColumnsPromiseCache.delete('copy_active_sessions');
        }).catch((error) => {
          if (error?.code === '42501' || /must be owner|permission denied/i.test(error?.message || '')) {
            console.warn('[copy_active_sessions] Skipping column sync due to ownership:', error.message);
            return;
          }
          throw error;
        });
      }
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_copy_sessions_copywriter ON copy_active_sessions(copywriter_id)`
      ).catch(() => {});
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uniq_copy_sessions_active ON copy_active_sessions(copywriter_id)`
      ).catch(() => {});
    })().catch((error) => {
      copyActiveSessionsEnsuredPromise = null;
      throw error;
    });
  }
  return copyActiveSessionsEnsuredPromise;
}

ensureCopyActiveSessionsTable().catch((error) => {
  console.error('Failed to ensure copy active sessions table:', error);
});

async function ensureScriptRequestsTable() {
  if (!scriptRequestsEnsuredPromise) {
    scriptRequestsEnsuredPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS script_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
          topic TEXT NOT NULL,
          notes TEXT,
          content_format TEXT NOT NULL DEFAULT 'reels',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
          priority TEXT NOT NULL DEFAULT 'alta' CHECK (priority IN ('alta','normal')),
          requested_by UUID,
          requested_by_name TEXT,
          fulfilled_script_id UUID REFERENCES scripts(id) ON DELETE SET NULL,
          fulfilled_at TIMESTAMPTZ,
          city TEXT,
          approved_at TIMESTAMPTZ,
          approved_by_name TEXT,
          reference_link TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      const columns = await getExistingColumns('script_requests');
      const alterClauses = [];
      if (!columns.has('notes')) alterClauses.push('ADD COLUMN notes TEXT');
      if (!columns.has('content_format')) alterClauses.push(`ADD COLUMN content_format TEXT NOT NULL DEFAULT 'reels'`);
      if (!columns.has('status')) alterClauses.push(`ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`);
      if (!columns.has('priority')) alterClauses.push(`ADD COLUMN priority TEXT NOT NULL DEFAULT 'alta'`);
      if (!columns.has('requested_by')) alterClauses.push('ADD COLUMN requested_by UUID');
      if (!columns.has('requested_by_name')) alterClauses.push('ADD COLUMN requested_by_name TEXT');
      if (!columns.has('fulfilled_script_id')) alterClauses.push('ADD COLUMN fulfilled_script_id UUID REFERENCES scripts(id) ON DELETE SET NULL');
      if (!columns.has('fulfilled_at')) alterClauses.push('ADD COLUMN fulfilled_at TIMESTAMPTZ');
      if (!columns.has('city')) alterClauses.push('ADD COLUMN city TEXT');
      if (!columns.has('updated_at')) alterClauses.push('ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now()');
      if (!columns.has('approved_at')) alterClauses.push('ADD COLUMN approved_at TIMESTAMPTZ');
      if (!columns.has('approved_by_name')) alterClauses.push('ADD COLUMN approved_by_name TEXT');
      if (!columns.has('reference_link')) alterClauses.push('ADD COLUMN reference_link TEXT');

      if (alterClauses.length > 0) {
        await pool.query(`ALTER TABLE script_requests ${alterClauses.join(', ')}`).then(() => {
          tableColumnsPromiseCache.delete('script_requests');
        }).catch((error) => {
          if (error?.code === '42501' || /must be owner|permission denied/i.test(error?.message || '')) {
            console.warn('[script_requests] Skipping optional column sync due to table ownership:', error.message);
            return;
          }
          throw error;
        });
      }

      const indexStatements = [
        `CREATE INDEX IF NOT EXISTS idx_script_requests_status ON script_requests(status)`,
        `CREATE INDEX IF NOT EXISTS idx_script_requests_client_id ON script_requests(client_id)`,
        `CREATE INDEX IF NOT EXISTS idx_script_requests_created_at ON script_requests(created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_script_requests_city ON script_requests(city)`,
      ];

      for (const statement of indexStatements) {
        await pool.query(statement).catch((error) => {
          if (error?.code === '42501' || /must be owner|permission denied/i.test(error?.message || '')) {
            console.warn('[script_requests] Skipping index creation due to table ownership:', error.message);
            return;
          }
          throw error;
        });
      }
    })().catch((error) => {
      scriptRequestsEnsuredPromise = null;
      throw error;
    });
  }

  return scriptRequestsEnsuredPromise;
}

ensureScriptRequestsTable().catch((error) => {
  console.error('Failed to ensure script requests table:', error);
});

let manualVideoTasksEnsuredPromise = null;
async function ensureManualVideoTasksTable() {
  if (!manualVideoTasksEnsuredPromise) {
    manualVideoTasksEnsuredPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS manual_video_tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          videomaker_id UUID,
          client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
          prospect_name TEXT,
          title TEXT NOT NULL,
          script TEXT,
          material_link TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'concluido',
          city TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_manual_video_tasks_vm ON manual_video_tasks(videomaker_id)`).catch(() => {});
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_manual_video_tasks_created ON manual_video_tasks(created_at DESC)`).catch(() => {});
    })().catch((error) => {
      manualVideoTasksEnsuredPromise = null;
      throw error;
    });
  }
  return manualVideoTasksEnsuredPromise;
}

ensureManualVideoTasksTable().catch((error) => {
  console.error('Failed to ensure manual_video_tasks table:', error);
});

let scheduledRecordingsEnsuredPromise = null;
async function ensureScheduledRecordingsTable() {
  if (!scheduledRecordingsEnsuredPromise) {
    scheduledRecordingsEnsuredPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS scheduled_recordings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          start_time TIME NOT NULL,
          videomaker_id UUID,
          status TEXT DEFAULT 'agendada',
          city TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_scheduled_recordings_client ON scheduled_recordings(client_id)`).catch(() => {});
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_scheduled_recordings_date ON scheduled_recordings(date)`).catch(() => {});
    })().catch((error) => {
      scheduledRecordingsEnsuredPromise = null;
      throw error;
    });
  }
  return scheduledRecordingsEnsuredPromise;
}

ensureScheduledRecordingsTable().catch((error) => {
  console.error('Failed to ensure scheduled_recordings table:', error);
});

/**
 * Planos personalizados ("Plano Especial") permitem metas fracionadas por semana
 * (ex.: 6 reels/mês = 1.5 por semana). As colunas nasceram como INTEGER, o que
 * provoca: invalid input syntax for type integer: "1.5".
 * Convertemos para NUMERIC(6,2) de forma idempotente.
 */
let clientFractionalGoalsPromise;
async function ensureClientFractionalGoalColumns() {
  if (!clientFractionalGoalsPromise) {
    clientFractionalGoalsPromise = (async () => {
      const columns = ['weekly_reels', 'weekly_creatives', 'weekly_stories', 'weekly_goal'];
      for (const column of columns) {
        await pool.query(
          `ALTER TABLE clients ALTER COLUMN ${column} TYPE NUMERIC(6,2) USING ${column}::numeric`
        ).catch((error) => {
          // 42804/42P16 etc.: coluna já é numérica ou não existe — não deve derrubar a API
          if (!/does not exist|cannot be cast|already/i.test(error.message)) {
            console.warn(`[clients] falha ao converter ${column}:`, error.message);
          }
        });
      }
    })().catch((error) => {
      clientFractionalGoalsPromise = null;
      throw error;
    });
  }
  return clientFractionalGoalsPromise;
}

ensureClientFractionalGoalColumns().catch((error) => {
  console.error('Failed to ensure fractional client goals:', error);
});

/**
 * Cliente ADMIN GLOBAL (interno da agência).
 *
 * Regras:
 *  - `clients.is_admin_client = true` marca o registro como interno (não conta
 *    como cliente em relatórios/contagens).
 *  - Registros globais têm `city = NULL`. Como `cityVisibilityExpression()` já
 *    considera `city IS NULL` visível em qualquer cidade, o cliente e todas as
 *    suas demandas aparecem em Minaçu e Uruaçu sem trocar de praça.
 *  - Um trigger BEFORE INSERT/UPDATE em cada tabela com `city` + `client_id`
 *    força `city = NULL` quando o cliente é admin global. Assim, nenhuma rota
 *    de escrita precisa conhecer a regra (evita divergências).
 */
let globalClientSupportPromise;
/**
 * Correção única (out/2026): registros de cliente gravados na cidade errada (portal, banco de
 * profissionais, entregas, gravações... quase todos de Uruaçu caídos em Minaçu) vão para a
 * cidade do cliente. Cada linha mudada fica em city_backfill_log (cidade antiga e nova), para
 * dar para desfazer; roda uma vez só (pulse_data_fixes).
 */
async function backfillClientCities() {
  const fixName = 'cidade_do_cliente_2026_10';
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE TABLE IF NOT EXISTS pulse_data_fixes (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ NOT NULL DEFAULT now(), result JSONB)`);
    const { rowCount: firstRun } = await db.query(`INSERT INTO pulse_data_fixes (name) VALUES ($1) ON CONFLICT DO NOTHING`, [fixName]);
    if (!firstRun) { await db.query('ROLLBACK'); return; }
    await db.query(`CREATE TABLE IF NOT EXISTS city_backfill_log (
      table_name TEXT NOT NULL, row_id TEXT NOT NULL, old_city TEXT, new_city TEXT,
      fixed_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows: tables } = await db.query(`
      SELECT c1.table_name AS name
        FROM information_schema.columns c1
        JOIN information_schema.columns c2 ON c2.table_schema = c1.table_schema AND c2.table_name = c1.table_name AND c2.column_name = 'client_id'
        JOIN information_schema.columns c3 ON c3.table_schema = c1.table_schema AND c3.table_name = c1.table_name AND c3.column_name = 'id'
        JOIN information_schema.tables tb ON tb.table_schema = c1.table_schema AND tb.table_name = c1.table_name AND tb.table_type = 'BASE TABLE'
       WHERE c1.table_schema = 'public' AND c1.column_name = 'city' AND c1.table_name <> 'clients'
       ORDER BY 1`);
    const result = {};
    for (const { name } of tables) {
      const join = `FROM public.clients c
        WHERE c.id::text = x.client_id::text AND c.city IS NOT NULL AND c.city::text <> ''
          AND NOT COALESCE(c.is_admin_client, false) AND x.city::text IS DISTINCT FROM c.city::text`;
      await db.query(`INSERT INTO city_backfill_log (table_name, row_id, old_city, new_city)
        SELECT $1, x.id::text, x.city::text, c.city::text FROM public.${pgIdent(name)} x, public.clients c
         WHERE c.id::text = x.client_id::text AND c.city IS NOT NULL AND c.city::text <> ''
           AND NOT COALESCE(c.is_admin_client, false) AND x.city::text IS DISTINCT FROM c.city::text`, [name]);
      const { rowCount } = await db.query(`UPDATE public.${pgIdent(name)} x SET city = c.city::text ${join}`);
      if (rowCount) result[name] = rowCount;
    }
    await db.query(`UPDATE pulse_data_fixes SET result = $2 WHERE name = $1`, [fixName, JSON.stringify(result)]);
    await db.query('COMMIT');
    console.log('[cidade] registros levados para a cidade do cliente:', JSON.stringify(result));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('[cidade] correção da cidade dos registros não aplicada:', error.message);
  } finally {
    db.release();
  }
}

/** Nome de tabela/coluna vindo do information_schema, entre aspas. */
function pgIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function ensureGlobalClientSupport() {
  if (!globalClientSupportPromise) {
    globalClientSupportPromise = (async () => {
      await pool.query(
        `ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_admin_client BOOLEAN NOT NULL DEFAULT false`
      );
      await pool.query(`ALTER TABLE clients ALTER COLUMN city DROP NOT NULL`).catch(() => {});

      // Trigger de clientes: admin global nunca fica preso a uma cidade.
      await pool.query(`
        CREATE OR REPLACE FUNCTION public.apply_admin_client_city() RETURNS trigger
        LANGUAGE plpgsql AS $fn$
        BEGIN
          IF NEW.is_admin_client THEN NEW.city := NULL; END IF;
          RETURN NEW;
        END $fn$;
      `);
      await pool.query(`DROP TRIGGER IF EXISTS trg_admin_client_city ON public.clients`);
      await pool.query(`
        CREATE TRIGGER trg_admin_client_city BEFORE INSERT OR UPDATE ON public.clients
        FOR EACH ROW EXECUTE FUNCTION public.apply_admin_client_city();
      `);

      // Trigger genérico para as tabelas operacionais vinculadas a um cliente.
      await pool.query(`
        CREATE OR REPLACE FUNCTION public.apply_global_client_city() RETURNS trigger
        LANGUAGE plpgsql AS $fn$
        DECLARE v_global boolean; v_city text;
        BEGIN
          IF NEW.client_id IS NULL THEN RETURN NEW; END IF;
          SELECT c.is_admin_client, c.city::text INTO v_global, v_city
          FROM public.clients c WHERE c.id::text = NEW.client_id::text;
          IF COALESCE(v_global, false) THEN
            NEW.city := NULL;
          ELSIF v_city IS NOT NULL AND v_city <> '' THEN
            -- Cada cidade com o que é dela: registro de cliente fica na cidade do cliente,
            -- venha de onde vier (portal, link público, agentes, WhatsApp, outra aba).
            NEW.city := v_city;
          END IF;
          RETURN NEW;
        END $fn$;
      `);
      await pool.query(`
        DO $do$
        DECLARE t record;
        BEGIN
          FOR t IN
            SELECT c1.table_name AS name
            FROM information_schema.columns c1
            JOIN information_schema.columns c2
              ON c2.table_schema = c1.table_schema
             AND c2.table_name = c1.table_name
             AND c2.column_name = 'client_id'
            JOIN information_schema.tables tb
              ON tb.table_schema = c1.table_schema
             AND tb.table_name = c1.table_name
             AND tb.table_type = 'BASE TABLE'
            WHERE c1.table_schema = 'public' AND c1.column_name = 'city'
          LOOP
            BEGIN
              EXECUTE format('ALTER TABLE public.%I ALTER COLUMN city DROP NOT NULL', t.name);
            EXCEPTION WHEN others THEN NULL;
            END;
            EXECUTE format('DROP TRIGGER IF EXISTS trg_global_client_city ON public.%I', t.name);
            EXECUTE format(
              'CREATE TRIGGER trg_global_client_city BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.apply_global_client_city()',
              t.name
            );
          END LOOP;
        END $do$;
      `);
    })().catch((error) => {
      globalClientSupportPromise = null;
      throw error;
    });
  }
  return globalClientSupportPromise;
}

ensureGlobalClientSupport()
  // Gatilho de cidade pronto: corrige uma vez os registros antigos na cidade errada
  .then(() => backfillClientCities())
  .catch((error) => {
    console.error('Failed to ensure global admin client support:', error);
  });

// Tabelas com cidade que não têm client_id: seguem a cidade do registro pai (comentários e
// históricos das tarefas, comentários de proposta e botões da bio). Sem isso, numa
// transferência elas ficavam na cidade antiga e sumiam da tela.
const CLIENT_CITY_CHILD_TABLES = [
  { table: 'task_comments', fk: 'task_id', parents: ['content_tasks', 'design_tasks'] },
  { table: 'task_history', fk: 'task_id', parents: ['content_tasks', 'design_tasks'] },
  { table: 'design_task_history', fk: 'task_id', parents: ['design_tasks'] },
  { table: 'proposal_comments', fk: 'proposal_id', parents: ['commercial_proposals'] },
  { table: 'client_bio_buttons', fk: 'bio_link_id', parents: ['client_bio_links'] },
];

/** WHERE (com o id do cliente em `placeholder`) das linhas filhas de um cliente, ou null se a tabela não se aplica. */
async function clientChildCityWhere({ table, fk, parents }, placeholder) {
  if (!(await tableHasCityColumn(table))) return null;
  const columns = await getExistingColumns(table);
  if (!columns.has(fk)) return null;
  const selects = [];
  for (const parent of parents) {
    const parentColumns = await getExistingColumns(parent).catch(() => new Set());
    if (parentColumns.has('id') && parentColumns.has('client_id')) {
      selects.push(`SELECT id FROM ${parent} WHERE client_id = ${placeholder}`);
    }
  }
  if (selects.length === 0) return null;
  return `${fk} IN (${selects.join(' UNION ALL ')})`;
}

/** Leva as linhas filhas (sem client_id) do cliente para a cidade informada (null = global). */
async function cascadeClientCityToChildren(clientId, city) {
  for (const child of CLIENT_CITY_CHILD_TABLES) {
    try {
      const where = await clientChildCityWhere(child, '$2');
      if (!where) continue;
      await pool.query(`UPDATE ${child.table} SET city = $1 WHERE ${where} AND city IS DISTINCT FROM $1`, [city, clientId]);
    } catch (err) {
      console.warn(`[Client-City] Falha ao mover ${child.table}:`, err?.message || err);
    }
  }
}

/**
 * Quem pode transferir um cliente de praça: admin/social_media (todas as cidades) ou
 * gestor_projetos que atende a cidade de origem (sem cidade cadastrada = Minaçu).
 */
async function canTransferClientCity(user, originCity) {
  if (await isAdminUser(user)) return true;
  if (!(await userHasAssignedRole(user, 'gestor_projetos'))) return false;
  const origin = normalizeCityValue(originCity);
  if (!origin) return true;
  try {
    await ensureUserCitiesTable();
    const linkedIds = await getLinkedUserIds(user);
    const { rows } = await pool.query(
      'SELECT city FROM user_cities WHERE user_id::text = ANY($1::text[])',
      [linkedIds.length ? linkedIds : [String(user.id)]]
    );
    const allowed = rows.length ? rows.map((r) => normalizeCityValue(r.city)).filter(Boolean) : ['minacu'];
    return allowed.includes(origin);
  } catch (err) {
    console.warn('[Client-City] Falha ao conferir cidades do usuário:', err?.message || err);
    return false;
  }
}

/** Propaga a marcação de cliente global para todas as tabelas com `city`. */
async function syncGlobalClientCity(clientId, isGlobal, fallbackCity = 'minacu') {
  const targetCity = isGlobal ? null : assertValidCity(fallbackCity);
  for (const tableName of TABLES_WITH_CITY) {
    if (tableName === 'clients') continue;
    try {
      if (!(await tableHasCityColumn(tableName))) continue;
      const existingColumns = await getExistingColumns(tableName);
      if (!existingColumns.has('client_id')) continue;
      // Só reescreve as linhas que estão em outra cidade: num salvamento comum quase nada muda
      // (antes cada edição reescrevia todas as linhas do cliente em ~55 tabelas).
      await pool.query(
        `UPDATE ${tableName} SET city = $1 WHERE client_id = $2 AND city IS DISTINCT FROM $1`,
        [targetCity, clientId]
      );
    } catch (err) {
      console.warn(`[Global-Client] Falha ao sincronizar ${tableName}:`, err?.message || err);
    }
  }
}

/**
 * Área "Experiência do Cliente": aniversário da empresa e lista de proprietários
 * (nome, cargo, aniversário e WhatsApp). Criação idempotente das colunas.
 */
let clientExperienceColumnsPromise;
async function ensureClientExperienceColumns() {
  if (!clientExperienceColumnsPromise) {
    clientExperienceColumnsPromise = (async () => {
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_birthday DATE`);
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_owners JSONB DEFAULT '[]'::jsonb`);
    })().catch((error) => {
      clientExperienceColumnsPromise = null;
      throw error;
    });
  }
  return clientExperienceColumnsPromise;
}

ensureClientExperienceColumns().catch((error) => {
  console.error('Failed to ensure client experience columns:', error);
});

/** Normaliza datas vindas do formulário: '' => null, ISO => YYYY-MM-DD. */
function parseDateOrNull(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

/** Garante um array JSON válido de proprietários. */
function normalizeClientOwners(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((owner) => owner && String(owner.name || '').trim())
    .map((owner) => ({
      name: String(owner.name).trim(),
      role: owner.role ? String(owner.role).trim() : '',
      birthday: parseDateOrNull(owner.birthday),
      phone: owner.phone ? String(owner.phone).replace(/\D/g, '') : '',
    }));
}

/** Converte metas semanais para número, aceitando "1,5" e "1.5". */
function parseWeeklyGoal(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed * 100) / 100;
}


// ─── JWT Config ─────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'CHANGE_ME_IN_PRODUCTION') {
  // Não derruba a API (trocaria todos os tokens de uma vez), mas deixa claro no log do PM2.
  console.error('[Auth-Config] JWT_SECRET ausente ou com o valor padrão: qualquer pessoa consegue forjar tokens. Defina JWT_SECRET no .env da VPS.');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const JWT_REFRESH_GRACE_SECONDS = Number(process.env.JWT_REFRESH_GRACE_SECONDS || 60 * 60 * 24 * 14);

// ─── Cliente de dados 100% VPS (PostgreSQL local) ────────────
// REGRA DO PROJETO: nada de Supabase/serviços externos. Todo acesso a dados
// passa pelo PostgreSQL da própria VPS.
const dbClient = createPgClient(pool);

function getAdminClient() {
  return dbClient;
}

function getUserClient() {
  return dbClient;
}

// ─── Auth helpers (JWT-based) ───────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function decodeTokenForRefresh(token) {
  try {
    return { decoded: jwt.verify(token, JWT_SECRET), expired: false };
  } catch (error) {
    if (error?.name !== 'TokenExpiredError') throw error;

    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    const expiredAt = Number(decoded?.exp || 0);
    const secondsSinceExpiry = Math.floor(Date.now() / 1000) - expiredAt;

    if (!expiredAt || secondsSinceExpiry > JWT_REFRESH_GRACE_SECONDS) {
      throw error;
    }

    return { decoded, expired: true };
  }
}

async function verifyUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.replace('Bearer ', '');

  try {
    // Try JWT first (new system)
    const decoded = verifyToken(token);
    
    if (!decoded || !decoded.sub) {
      console.error("[Auth-JWT-Error] Token valid but 'sub' (userId) is missing:", { decoded, path: req.path });
      throw new Error('Unauthorized');
    }

    // Token de escopo (ex.: vídeo do treinamento) usa o mesmo segredo, mas não é sessão.
    if (decoded.scope) throw new Error('Unauthorized');

    let profileLookupFailed = false;
    const profile = await getAuthProfileById(decoded.sub).catch(err => {
      console.error("[Auth-DB-Error] Failed to fetch profile from DB:", { sub: decoded.sub, error: err.message });
      profileLookupFailed = true;
      return null;
    });

    // Erro de banco: não autentica pelo que vem no token, mas também não derruba
    // a sessão (503, o front não desloga).
    if (profileLookupFailed) {
      throw Object.assign(new Error('Autenticação indisponível no momento'), { statusCode: 503 });
    }

    // Perfil apagado (excluído pela Equipe): o token deixa de valer na hora,
    // em vez de seguir com o papel gravado nele por até 30 dias.
    if (!profile) {
      console.warn("[Auth-ProfileNotFound] User ID not found in profiles/auth_users, token refused:", { sub: decoded.sub });
      throw new Error('Unauthorized');
    }

    const role = await getUserPrimaryRole(profile.id, profile.role || 'editor');

    return {
      user: {
        id: profile.id || decoded.sub,
        email: profile.email || decoded.email,
        role,
      },
      userClient: getUserClient(authHeader),
    };
  } catch (error) {
    if (error?.statusCode === 503) throw error;
    const errorDetail = {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      path: req.path,
      method: req.method,
      hasAuthHeader: !!req.headers.authorization,
      authHeaderLength: req.headers.authorization?.length || 0,
      timestamp: new Date().toISOString(),
      token_preview: req.headers.authorization?.slice(0, 20) + '...'
    };
    
    if (error.name === 'JsonWebTokenError') {
      console.error(`[Auth-JWT-Invalid] Invalid token signature for ${req.path}. Check JWT_SECRET syncing.`);
    } else if (error.name === 'TokenExpiredError') {
      console.error(`[Auth-JWT-Expired] Token expired for ${req.path} at ${error.expiredAt}`);
    }

    console.error(`[Auth-Critical] ${req.method} ${req.path} failed:`, JSON.stringify(errorDetail, null, 2));
    throw new Error('Unauthorized');
  }
}

// Memo por objeto de usuário: o verifyUser cria um por requisição, e isAdminUser,
// resolveActiveCity e as regras do /api/db/query pediam os mesmos ids ligados e o
// mesmo papel várias vezes (cerca de 9 consultas só para autenticar). Validade
// curta para não atrasar revogação caso algum objeto viva mais que a requisição.
const AUTH_MEMO_TTL_MS = 5_000;
const linkedUserIdsMemo = new WeakMap();
const adminUserMemo = new WeakMap();

function readAuthMemo(memo, user) {
  if (!user || typeof user !== 'object') return null;
  const hit = memo.get(user);
  return hit && Date.now() - hit.at < AUTH_MEMO_TTL_MS ? hit.promise : null;
}

function writeAuthMemo(memo, user, promise) {
  if (user && typeof user === 'object') memo.set(user, { at: Date.now(), promise });
  return promise;
}

async function getLinkedUserIds(user) {
  const cached = readAuthMemo(linkedUserIdsMemo, user);
  if (cached) return [...(await cached)];
  return [...(await writeAuthMemo(linkedUserIdsMemo, user, loadLinkedUserIds(user)))];
}

async function loadLinkedUserIds(user) {
  const directId = user?.id ? String(user.id) : '';
  const email = user?.email ? String(user.email).trim().toLowerCase() : '';
  const ids = new Set(directId ? [directId] : []);

  try {
    const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
    const authColumns = await getExistingColumns('auth_users').catch(() => new Set());
    const queries = [];

    if (profileColumns.has('id') && (directId || (email && profileColumns.has('email')))) {
      queries.push(
        pool.query(
          `SELECT id::text AS id
             FROM profiles
            WHERE ($1 <> '' AND id::text = $1)
               OR ($2 <> '' ${profileColumns.has('email') ? 'AND lower(email) = $2' : 'AND false'})`,
          [directId, email]
        )
      );
    }

    if (authColumns.has('id') && (directId || (email && authColumns.has('email')))) {
      queries.push(
        pool.query(
          `SELECT id::text AS id
             FROM auth_users
            WHERE ($1 <> '' AND id::text = $1)
               OR ($2 <> '' ${authColumns.has('email') ? 'AND lower(email) = $2' : 'AND false'})`,
          [directId, email]
        )
      );
    }

    const results = await Promise.all(queries);
    for (const result of results) {
      for (const row of result.rows || []) {
        if (row?.id) ids.add(String(row.id));
      }
    }
  } catch (error) {
    console.error('Linked user id lookup failed:', error?.message || error);
  }

  return Array.from(ids).filter(Boolean);
}

async function isAdminUser(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'social_media') return true;
  const cached = readAuthMemo(adminUserMemo, user);
  if (cached) return cached;
  return writeAuthMemo(adminUserMemo, user, loadIsAdminUser(user));
}

async function loadIsAdminUser(user) {
  try {
    await ensureAuthSupportTables();
    const linkedIds = await getLinkedUserIds(user);
    const { rows } = await pool.query(
      'SELECT 1 FROM user_roles WHERE user_id::text = ANY($1::text[]) AND role IN ($2, $3) LIMIT 1',
      [linkedIds, 'admin', 'social_media']
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function userHasAssignedRole(user, role) {
  if (!user || !role) return false;
  if (user.role === role) return true;
  try {
    await ensureAuthSupportTables();
    const linkedIds = await getLinkedUserIds(user);
    if (linkedIds.length === 0) return false;
    const { rows } = await pool.query(
      'SELECT 1 FROM user_roles WHERE user_id::text = ANY($1::text[]) AND role = $2 LIMIT 1',
      [linkedIds, role]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('Role lookup failed:', error?.message || error);
    return false;
  }
}

/** Admin "de verdade" (sem social_media), o mesmo critério do isStrictAdmin dos agentes. */
async function isStrictAdminUser(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return userHasAssignedRole(user, 'admin');
}

// Papéis que só um admin pode conceder ou tirar (e cujas contas só um admin mexe).
const PRIVILEGED_USER_ROLES = new Set(['admin', 'social_media', 'socio_gestor']);

/** Papéis da conta alvo: o do perfil e os de user_roles (pelos ids ligados por e-mail). */
async function getTargetUserRoles(userId) {
  const id = String(userId || '').trim();
  if (!id) return [];
  await ensureAuthSupportTables();
  const { rows: profileRows } = await pool.query(
    'SELECT email, role::text AS role FROM profiles WHERE id::text = $1 LIMIT 1',
    [id]
  );
  const linkedIds = await getLinkedUserIds({ id, email: profileRows[0]?.email || '' });
  const { rows } = await pool.query(
    'SELECT role::text AS role FROM user_roles WHERE user_id::text = ANY($1::text[])',
    [linkedIds.length ? linkedIds : [id]]
  );
  return [...new Set([profileRows[0]?.role, ...rows.map((row) => row.role)].filter(Boolean))];
}

/**
 * Senha, exclusão e criação de conta com papel admin, social_media ou socio_gestor
 * ficam só com admin (social_media passa no verifyAdmin, mas não pode tomar a
 * conta do dono nem criar outro admin).
 */
async function assertCanManageUserAccount(actor, { targetUserId = null, requestedRole = null } = {}) {
  if (await isStrictAdminUser(actor)) return;
  const forbidden = () => Object.assign(
    new Error('Só um administrador pode criar ou alterar contas admin, social_media ou socio_gestor.'),
    { statusCode: 403 }
  );
  if (requestedRole && PRIVILEGED_USER_ROLES.has(String(requestedRole))) throw forbidden();
  if (targetUserId && String(targetUserId) !== String(actor?.id || '')) {
    const roles = await getTargetUserRoles(targetUserId);
    if (roles.some((role) => PRIVILEGED_USER_ROLES.has(role))) throw forbidden();
  }
}

// Valores aceitos pelo enum app_role (o schema base tem 8; o resto entrou por migração).
// null quando não dá para ler (banco antigo com role TEXT): aí não valida.
async function getValidAppRoles() {
  try {
    const { rows } = await pool.query('SELECT unnest(enum_range(NULL::app_role))::text AS role');
    return new Set(rows.map((row) => row.role));
  } catch (error) {
    console.warn('Could not read app_role values:', error?.message || error);
    return null;
  }
}

async function verifyAdmin(req) {
  const { user, userClient } = await verifyUser(req);
  if (await isAdminUser(user)) {
    return { user, userClient, admin: getAdminClient() };
  }
  throw new Error('Admin access required');
}

/** true quando o pedido traz um JWT válido da equipe (sem lançar erro). */
async function hasTeamSession(req) {
  if (!req.headers.authorization?.startsWith('Bearer ')) return false;
  return verifyUser(req).then(() => true).catch(() => false);
}

/** Compara um segredo do .env com o enviado, em tempo constante. */
function secretMatches(expected, provided) {
  const a = String(expected || '').trim();
  const b = String(provided || '').trim();
  if (!a || !b) return false;
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(a).digest(),
    crypto.createHash('sha256').update(b).digest(),
  );
}

/** Rotas só de admin: 401 sem login, 403 sem papel. Devolve false se respondeu. */
async function requireAdminRoute(req, res) {
  try {
    await verifyAdmin(req);
    return true;
  } catch (error) {
    res.status(error?.message === 'Admin access required' ? 403 : 401).json({ error: error?.message || 'Unauthorized' });
    return false;
  }
}

/**
 * TV do escritório (/tv, sem login). Com TV_ACCESS_TOKEN no .env, a TV precisa
 * abrir /tv?tv_token=... (ou estar logada); sem a variável segue pública.
 */
async function tvAccessAllowed(req) {
  const expected = String(process.env.TV_ACCESS_TOKEN || '').trim();
  if (!expected) return true;
  if (await hasTeamSession(req)) return true;
  return secretMatches(expected, req.query?.tv_token || req.headers['x-tv-token']);
}

/**
 * Gestão de equipe: admin/social_media OU gestor_projetos.
 * O frontend (Team.tsx) libera essas ações para gestor_projetos,
 * então o backend precisa aceitar o mesmo conjunto de papéis.
 */
async function verifyTeamManager(req) {
  const { user, userClient } = await verifyUser(req);
  if (await isAdminUser(user)) {
    return { user, userClient, admin: getAdminClient() };
  }
  if (await userHasAssignedRole(user, 'gestor_projetos')) {
    return { user, userClient, admin: getAdminClient() };
  }
  throw new Error('Admin access required');
}

// Papéis da equipe interna. Parceiro, endomarketing e revisor_meta também fazem login, mas não falam com o
// cliente pelo número da agência (nenhuma tela deles envia WhatsApp).
const INTERNAL_TEAM_ROLES = ['admin', 'social_media', 'gestor_projetos', 'socio_gestor', 'designer', 'videomaker', 'editor', 'copywriter', 'fotografo'];

async function userHasAnyRole(user, roles) {
  if (!user || !roles?.length) return false;
  if (roles.includes(user.role)) return true;
  try {
    await ensureAuthSupportTables();
    const linkedIds = await getLinkedUserIds(user);
    if (linkedIds.length === 0) return false;
    const { rows } = await pool.query(
      'SELECT 1 FROM user_roles WHERE user_id::text = ANY($1::text[]) AND role::text = ANY($2::text[]) LIMIT 1',
      [linkedIds, roles]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('Role lookup failed:', error?.message || error);
    return false;
  }
}



let profilesPasswordHashColumnPromise;
let authSupportTablesPromise;
const wssClients = new Set();

function getTableColumnsPromiseCache() {
  return tableColumnsPromiseCache;
}

function broadcastToAll(message) {
  const payload = JSON.stringify(message);
  for (const client of wssClients) {
    if (client.readyState === 1) { // 1 = OPEN
      try { client.send(payload); } catch (e) { wssClients.delete(client); }
    } else {
      wssClients.delete(client);
    }
  }
}


async function getExistingColumns(tableName) {
  const normalizedTable = String(tableName || '').trim();
  if (!normalizedTable) return new Set();

  const cache = getTableColumnsPromiseCache();
  const cached = cache.get(normalizedTable);
  if (cached && (Date.now() - (cached.cachedAt || 0)) < 3600000) return cached.value;

  if (!cache.has(normalizedTable)) {
    cache.set(
      normalizedTable,
      { cachedAt: Date.now(), value: pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1`,
        [normalizedTable]
      )
        .then(({ rows }) => new Set(rows.map((row) => row.column_name)))
        .catch((error) => {
          cache.delete(normalizedTable);
          throw error;
        }) }
    );
  }

  return cache.get(normalizedTable).value;
}

function selectColumn(columns, columnName, fallbackSql = `NULL::text`) {
  return columns.has(columnName) ? columnName : `${fallbackSql} AS ${columnName}`;
}

async function ensureProfilesMonthlySalaryColumn() {
  const columns = await getExistingColumns('profiles').catch(() => new Set());
  return columns.has('monthly_salary');
}

 async function ensureAuthSupportTables() {
   if (!authSupportTablesPromise) {
     authSupportTablesPromise = (async () => {
       try {
         // Repairing permissions silently if possible
         await pool.query('GRANT ALL PRIVILEGES ON TABLE auth_users TO pulse_user').catch(() => {});
         await pool.query('GRANT ALL PRIVILEGES ON TABLE user_roles TO pulse_user').catch(() => {});
         
         const { rows } = await pool.query(`
           SELECT
             to_regclass('public.auth_users') IS NOT NULL AS has_auth_users,
             to_regclass('public.user_roles') IS NOT NULL AS has_user_roles
         `);
         
         if (!rows[0]?.has_auth_users) {
           console.log('Criando tabela auth_users ausente...');
           await pool.query(`
             CREATE TABLE IF NOT EXISTS auth_users (
               id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
               email TEXT UNIQUE NOT NULL,
               password_hash TEXT NOT NULL,
               created_at TIMESTAMPTZ DEFAULT NOW(),
               last_sign_in TIMESTAMPTZ
             )
           `).catch(() => {});
         }
         return rows[0];
       } catch (error) {
         console.error('ensureAuthSupportTables error:', error);
         throw error;
       }
     })();
   }
   return authSupportTablesPromise;
 }


// Sem perfil nem user_roles o papel fica NULL (vira 'editor' no getUserPrimaryRole):
// antes caía como 'admin', e um login antigo que sobrou no auth_users entrava como admin.
async function getLocalAuthUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();

  try {
    await ensureAuthSupportTables();
    const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
    const hasProfilesTable = profileColumns.size > 0;
    const profileId = hasProfilesTable && profileColumns.has('id') ? 'p.id' : 'NULL::uuid';
    const profileName = hasProfilesTable && profileColumns.has('name') ? 'p.name' : 'NULL::text';
    const profileEmail = hasProfilesTable && profileColumns.has('email') ? 'p.email' : 'NULL::text';
    const profileRole = hasProfilesTable && profileColumns.has('role') ? 'p.role::text' : 'NULL::text';
    const profileAvatar = hasProfilesTable && profileColumns.has('avatar_url') ? 'p.avatar_url' : 'NULL::text';
    const profileDisplayName = hasProfilesTable && profileColumns.has('display_name') ? 'p.display_name' : 'NULL::text';
    const profileJobTitle = hasProfilesTable && profileColumns.has('job_title') ? 'p.job_title' : 'NULL::text';
    const profileMonthlySalary = hasProfilesTable && profileColumns.has('monthly_salary') ? 'p.monthly_salary' : '0::numeric';
    const profileJoin = hasProfilesTable && profileColumns.has('id') && profileColumns.has('email')
      ? 'LEFT JOIN profiles p ON p.id = au.id OR lower(p.email) = lower(au.email)'
      : hasProfilesTable && profileColumns.has('id')
        ? 'LEFT JOIN profiles p ON p.id = au.id'
        : '';
    const userRolesColumns = await getExistingColumns('user_roles').catch(() => new Set());
    const userRolesJoin = userRolesColumns.has('user_id') && userRolesColumns.has('role')
      ? 'LEFT JOIN user_roles ur ON ur.user_id = au.id'
      : '';
    const userRole = userRolesJoin ? 'ur.role::text' : 'NULL::text';

    const { rows } = await pool.query(
      `SELECT
         COALESCE(${profileId}, au.id) AS id,
         COALESCE(${profileName}, split_part(au.email, '@', 1)) AS name,
         au.email,
         COALESCE(${profileRole}, ${userRole}) AS role,
         ${profileAvatar} AS avatar_url,
         ${profileDisplayName} AS display_name,
         ${profileJobTitle} AS job_title,
         ${profileMonthlySalary} AS monthly_salary,
         au.password_hash
       FROM auth_users au
        ${profileJoin}
        ${userRolesJoin}
       WHERE lower(au.email) = lower($1)
       LIMIT 1`,
      [normalizedEmail]
    );
    return rows[0] || null;
  } catch (error) {
    console.error('Local auth lookup with profile join failed:', error?.message || error);

    try {
      const { rows } = await pool.query(
        `SELECT
           id,
           split_part(email, '@', 1) AS name,
           email,
           NULL::text AS role,
           NULL::text AS avatar_url,
           split_part(email, '@', 1) AS display_name,
           NULL::text AS job_title,
            0::numeric AS monthly_salary,
           password_hash
         FROM auth_users
         WHERE lower(email) = lower($1)
         LIMIT 1`,
        [normalizedEmail]
      );
      return rows[0] || null;
    } catch (fallbackError) {
      console.error('Local auth fallback lookup failed:', fallbackError?.message || fallbackError);
      return null;
    }
  }
}

async function getLocalAuthUserById(userId) {
  if (!userId) return null;

  try {
    await ensureAuthSupportTables();
    const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
    const hasProfilesTable = profileColumns.size > 0;
    const profileId = hasProfilesTable && profileColumns.has('id') ? 'p.id' : 'NULL::uuid';
    const profileName = hasProfilesTable && profileColumns.has('name') ? 'p.name' : 'NULL::text';
    const profileEmail = hasProfilesTable && profileColumns.has('email') ? 'p.email' : 'NULL::text';
    const profileRole = hasProfilesTable && profileColumns.has('role') ? 'p.role::text' : 'NULL::text';
    const profileAvatar = hasProfilesTable && profileColumns.has('avatar_url') ? 'p.avatar_url' : 'NULL::text';
    const profileDisplayName = hasProfilesTable && profileColumns.has('display_name') ? 'p.display_name' : 'NULL::text';
    const profileJobTitle = hasProfilesTable && profileColumns.has('job_title') ? 'p.job_title' : 'NULL::text';
    const profileMonthlySalary = hasProfilesTable && profileColumns.has('monthly_salary') ? 'p.monthly_salary' : '0::numeric';
    const profileJoin = hasProfilesTable && profileColumns.has('id') && profileColumns.has('email')
      ? 'LEFT JOIN profiles p ON p.id = au.id OR lower(p.email) = lower(au.email)'
      : hasProfilesTable && profileColumns.has('id')
        ? 'LEFT JOIN profiles p ON p.id = au.id'
        : '';
    const userRolesColumns = await getExistingColumns('user_roles').catch(() => new Set());
    const userRolesJoin = userRolesColumns.has('user_id') && userRolesColumns.has('role')
      ? 'LEFT JOIN user_roles ur ON ur.user_id = au.id'
      : '';
    const userRole = userRolesJoin ? 'ur.role::text' : 'NULL::text';
    const canMatchProfileId = Boolean(profileJoin && profileColumns.has('id'));

    const { rows } = await pool.query(
      `SELECT
         COALESCE(${profileId}, au.id) AS id,
         COALESCE(${profileName}, split_part(au.email, '@', 1)) AS name,
         COALESCE(${profileEmail}, au.email) AS email,
         COALESCE(${profileRole}, ${userRole}) AS role,
         ${profileAvatar} AS avatar_url,
         ${profileDisplayName} AS display_name,
         ${profileJobTitle} AS job_title,
         ${profileMonthlySalary} AS monthly_salary,
         au.password_hash
       FROM auth_users au
        ${profileJoin}
        ${userRolesJoin}
       WHERE au.id = $1${canMatchProfileId ? ' OR p.id = $1' : ''}
       LIMIT 1`,
      [userId]
    );

    return rows[0] || null;
  } catch (error) {
    console.error('Local auth lookup by id failed:', error?.message || error);

    try {
      const { rows } = await pool.query(
        `SELECT
           id,
           split_part(email, '@', 1) AS name,
           email,
           NULL::text AS role,
           NULL::text AS avatar_url,
           split_part(email, '@', 1) AS display_name,
           NULL::text AS job_title,
            0::numeric AS monthly_salary,
           password_hash
         FROM auth_users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      return rows[0] || null;
    } catch (fallbackError) {
      console.error('Local auth fallback lookup by id failed:', fallbackError?.message || fallbackError);
      return null;
    }
  }
}

async function mergeWithLocalAuth(profile, localAuthLookup) {
  const localAuth = await localAuthLookup().catch((error) => {
    console.error('Local auth merge lookup failed:', error?.message || error);
    return null;
  });

  if (!profile) return localAuth;
  if (!localAuth) return profile;

  return {
    ...localAuth,
    ...profile,
    id: profile.id || localAuth.id,
    name: profile.name || localAuth.name,
    email: profile.email || localAuth.email,
    role: profile.role || localAuth.role,
    avatar_url: profile.avatar_url || localAuth.avatar_url,
    display_name: profile.display_name || localAuth.display_name,
    job_title: profile.job_title || localAuth.job_title,
    monthly_salary: profile.monthly_salary ?? localAuth.monthly_salary,
    password_hash: profile.password_hash || localAuth.password_hash,
    profile_password_hash: profile.profile_password_hash || profile.password_hash || localAuth.profile_password_hash,
    auth_password_hash: profile.auth_password_hash || localAuth.auth_password_hash || localAuth.password_hash,
  };
}

async function hasProfilesPasswordHashColumn() {
  if (!profilesPasswordHashColumnPromise) {
    profilesPasswordHashColumnPromise = pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'password_hash'
      ) AS exists
    `)
      .then(({ rows }) => Boolean(rows[0]?.exists))
      .catch((error) => {
        profilesPasswordHashColumnPromise = null;
        throw error;
      });
  }

  return profilesPasswordHashColumnPromise;
}

async function getAuthProfileByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
  const hasProfilesTable = profileColumns.size > 0;
  const profileSelect = [
    profileColumns.has('id') ? 'id' : 'NULL::uuid AS id',
    selectColumn(profileColumns, 'name', `split_part(email, '@', 1)`),
    selectColumn(profileColumns, 'email'),
    profileColumns.has('role') ? 'role::text AS role' : `'editor'::text AS role`,
    selectColumn(profileColumns, 'avatar_url'),
    selectColumn(profileColumns, 'display_name'),
    selectColumn(profileColumns, 'job_title'),
    selectColumn(profileColumns, 'monthly_salary', '0::numeric'),
    profileColumns.has('password_hash') ? 'password_hash' : 'NULL::text AS password_hash',
  ].join(', ');

  if (hasProfilesTable && profileColumns.has('email') && profileColumns.has('password_hash')) {
    try {
      await ensureAuthSupportTables();
      const authJoinCondition = profileColumns.has('id')
        ? 'au.id = p.id OR lower(au.email) = lower(p.email)'
        : 'lower(au.email) = lower(p.email)';
      const { rows } = await pool.query(
        `SELECT ${profileColumns.has('id') ? 'p.id' : 'NULL::uuid AS id'},
                ${profileColumns.has('name') ? 'p.name' : `split_part(p.email, '@', 1) AS name`},
                p.email,
                ${profileColumns.has('role') ? 'p.role::text AS role' : `'editor'::text AS role`},
                ${profileColumns.has('avatar_url') ? 'p.avatar_url' : 'NULL::text AS avatar_url'},
                ${profileColumns.has('display_name') ? 'p.display_name' : 'NULL::text AS display_name'},
                ${profileColumns.has('job_title') ? 'p.job_title' : 'NULL::text AS job_title'},
                ${profileColumns.has('monthly_salary') ? 'p.monthly_salary' : '0::numeric AS monthly_salary'},
                COALESCE(au.password_hash, p.password_hash) AS password_hash,
                p.password_hash AS profile_password_hash,
                au.password_hash AS auth_password_hash
         FROM profiles p
         LEFT JOIN auth_users au
           ON ${authJoinCondition}
         WHERE lower(p.email) = lower($1)
         LIMIT 1`,
        [normalizedEmail]
      );
      return mergeWithLocalAuth(rows[0] || null, () => getLocalAuthUserByEmail(normalizedEmail));
    } catch (error) {
      console.error('Profile auth lookup failed, using local auth table:', error?.message || error);
      return getLocalAuthUserByEmail(normalizedEmail);
    }
  }

  try {
    if (!hasProfilesTable || !profileColumns.has('email') || !profileColumns.has('id')) {
      return getLocalAuthUserByEmail(normalizedEmail);
    }

    await ensureAuthSupportTables();
    const { rows } = await pool.query(
      `SELECT p.id,
              ${profileColumns.has('name') ? 'p.name' : `split_part(p.email, '@', 1) AS name`},
              p.email,
              ${profileColumns.has('role') ? 'p.role::text AS role' : `'editor'::text AS role`},
              ${profileColumns.has('avatar_url') ? 'p.avatar_url' : 'NULL::text AS avatar_url'},
              ${profileColumns.has('display_name') ? 'p.display_name' : 'NULL::text AS display_name'},
              ${profileColumns.has('job_title') ? 'p.job_title' : 'NULL::text AS job_title'},
              ${profileColumns.has('monthly_salary') ? 'p.monthly_salary' : '0::numeric AS monthly_salary'},
              au.password_hash
       FROM profiles p
       LEFT JOIN auth_users au
         ON au.id = p.id OR lower(au.email) = lower(p.email)
       WHERE lower(p.email) = lower($1)
       LIMIT 1`,
      [normalizedEmail]
    );

    return mergeWithLocalAuth(rows[0] || null, () => getLocalAuthUserByEmail(normalizedEmail));
  } catch (error) {
    console.error('Auth support lookup failed, falling back to profiles only:', error?.message || error);
    try {
      const { rows } = await pool.query(
        `SELECT ${profileSelect}
         FROM profiles
         WHERE lower(email) = lower($1)
         LIMIT 1`,
        [normalizedEmail]
      );
      return mergeWithLocalAuth(rows[0] || null, () => getLocalAuthUserByEmail(normalizedEmail));
    } catch (profileFallbackError) {
      console.error('Profiles fallback lookup failed, using local auth table:', profileFallbackError?.message || profileFallbackError);
      return getLocalAuthUserByEmail(normalizedEmail);
    }
  }
}

async function getAuthProfileById(userId) {
  const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
  const hasProfilesTable = profileColumns.size > 0;

  if (hasProfilesTable && profileColumns.has('id') && profileColumns.has('password_hash')) {
    try {
      await ensureAuthSupportTables();
      const authJoinCondition = profileColumns.has('email')
        ? 'au.id = p.id OR lower(au.email) = lower(p.email)'
        : 'au.id = p.id';
      const { rows } = await pool.query(
        `SELECT p.id,
                ${profileColumns.has('name') ? 'p.name' : profileColumns.has('email') ? `split_part(p.email, '@', 1) AS name` : 'NULL::text AS name'},
                ${profileColumns.has('email') ? 'p.email' : 'au.email'},
                ${profileColumns.has('role') ? 'p.role::text AS role' : `'editor'::text AS role`},
                ${profileColumns.has('avatar_url') ? 'p.avatar_url' : 'NULL::text AS avatar_url'},
                ${profileColumns.has('display_name') ? 'p.display_name' : 'NULL::text AS display_name'},
                ${profileColumns.has('job_title') ? 'p.job_title' : 'NULL::text AS job_title'},
                ${profileColumns.has('monthly_salary') ? 'p.monthly_salary' : '0::numeric AS monthly_salary'},
                COALESCE(au.password_hash, p.password_hash) AS password_hash,
                p.password_hash AS profile_password_hash,
                au.password_hash AS auth_password_hash
           FROM profiles p
           LEFT JOIN auth_users au
             ON ${authJoinCondition}
          WHERE p.id = $1
          LIMIT 1`,
        [userId]
      );
      return mergeWithLocalAuth(rows[0] || null, () => getLocalAuthUserById(userId));
    } catch (error) {
      console.error('Profile auth lookup by id failed, using auth_users fallback:', error?.message || error);
    }
  }

  try {
    if (!hasProfilesTable || !profileColumns.has('id')) {
      const { rows } = await pool.query(
        `SELECT id,
                split_part(email, '@', 1) AS name,
                email,
                NULL::text AS role,
                NULL::text AS avatar_url,
                split_part(email, '@', 1) AS display_name,
                NULL::text AS job_title,
                0::numeric AS monthly_salary,
                password_hash
           FROM auth_users
          WHERE id = $1
          LIMIT 1`,
        [userId]
      );
      return mergeWithLocalAuth(rows[0] || null, () => getLocalAuthUserById(userId));
    }

    await ensureAuthSupportTables();
    const authJoinCondition = profileColumns.has('email')
      ? 'au.id = p.id OR lower(au.email) = lower(p.email)'
      : 'au.id = p.id';
    const { rows } = await pool.query(
      `SELECT p.id,
              ${profileColumns.has('name') ? 'p.name' : profileColumns.has('email') ? `split_part(p.email, '@', 1) AS name` : 'NULL::text AS name'},
              ${profileColumns.has('email') ? 'p.email' : 'au.email'},
              ${profileColumns.has('role') ? 'p.role::text AS role' : `'editor'::text AS role`},
              ${profileColumns.has('avatar_url') ? 'p.avatar_url' : 'NULL::text AS avatar_url'},
              ${profileColumns.has('display_name') ? 'p.display_name' : 'NULL::text AS display_name'},
              ${profileColumns.has('job_title') ? 'p.job_title' : 'NULL::text AS job_title'},
              ${profileColumns.has('monthly_salary') ? 'p.monthly_salary' : '0::numeric AS monthly_salary'},
              au.password_hash
       FROM profiles p
       LEFT JOIN auth_users au
         ON ${authJoinCondition}
       WHERE p.id = $1
       LIMIT 1`,
      [userId]
    );

    return mergeWithLocalAuth(rows[0] || null, () => getLocalAuthUserById(userId));
  } catch (error) {
    console.error('Auth support lookup by id failed, falling back to profiles only:', error?.message || error);
    if (!hasProfilesTable || !profileColumns.has('id')) return null;
    const { rows } = await pool.query(
      `SELECT id,
              ${profileColumns.has('name') ? 'name' : profileColumns.has('email') ? `split_part(email, '@', 1) AS name` : 'NULL::text AS name'},
              ${profileColumns.has('email') ? 'email' : 'NULL::text AS email'},
              ${profileColumns.has('role') ? 'role::text AS role' : `'editor'::text AS role`},
              ${profileColumns.has('avatar_url') ? 'avatar_url' : 'NULL::text AS avatar_url'},
              ${profileColumns.has('display_name') ? 'display_name' : 'NULL::text AS display_name'},
              ${profileColumns.has('job_title') ? 'job_title' : 'NULL::text AS job_title'},
              ${profileColumns.has('monthly_salary') ? 'monthly_salary' : '0::numeric AS monthly_salary'},
              NULL::text AS password_hash
       FROM profiles
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );
    return mergeWithLocalAuth(rows[0] || null, () => getLocalAuthUserById(userId));
  }
}

async function getUserPrimaryRole(userId, fallbackRole = 'editor') {
  try {
    await ensureAuthSupportTables();
    const { rows: roles } = await pool.query(
      `SELECT ur.role
         FROM user_roles ur
         LEFT JOIN profiles role_profile ON role_profile.id = ur.user_id
         LEFT JOIN auth_users role_auth ON role_auth.id = ur.user_id
         LEFT JOIN profiles current_profile ON current_profile.id = $1
         LEFT JOIN auth_users current_auth ON current_auth.id = $1
        WHERE ur.user_id = $1
           OR lower(COALESCE(role_profile.email, role_auth.email, '')) = lower(COALESCE(current_profile.email, current_auth.email, ''))
         ORDER BY CASE WHEN ur.role::text = $2 THEN 0 ELSE 1 END, ur.role::text
         LIMIT 1`,
      [userId, fallbackRole]
    );
    return roles[0]?.role || fallbackRole || 'editor';
  } catch (error) {
    console.error('Role lookup failed, using profile fallback role:', error?.message || error);
    return fallbackRole || 'editor';
  }
}

async function storeUserPassword(userId, rawPassword) {
  const hash = await bcrypt.hash(rawPassword, 12);
  await ensureAuthSupportTables();

  const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
  const hasProfilesTable = profileColumns.has('id');
  const hasProfileEmail = profileColumns.has('email');
  let profile = null;

  if (hasProfilesTable && hasProfileEmail) {
    const { rows } = await pool.query(
      'SELECT id, email FROM profiles WHERE id = $1 LIMIT 1',
      [userId]
    );
    profile = rows[0] || null;
  }

  if (hasProfilesTable && profileColumns.has('password_hash')) {
    const updatedAtSet = profileColumns.has('updated_at') ? ', updated_at = NOW()' : '';
    await pool.query(
      `UPDATE profiles SET password_hash = $1${updatedAtSet} WHERE id = $2`,
      [hash, userId]
    );
  }

  if (!profile) {
    const { rows } = await pool.query(
      'SELECT id, email FROM auth_users WHERE id = $1 LIMIT 1',
      [userId]
    );
    profile = rows[0] || null;
  }

  if (!profile?.email) throw new Error('Perfil não encontrado');

  const normalizedEmail = profile.email.toLowerCase().trim();
  const { rowCount } = await pool.query(
    'UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2 OR lower(email) = lower($3)',
    [hash, userId, normalizedEmail]
  );

  if (rowCount === 0) {
    await pool.query(
      `INSERT INTO auth_users (id, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           updated_at = NOW()`,
      [profile.id || userId, normalizedEmail, hash]
    );
  }
}

async function verifyStoredPassword(rawPassword, ...passwordHashes) {
  const uniqueHashes = [...new Set(
    passwordHashes
      .filter((hash) => typeof hash === 'string')
      .map((hash) => hash.trim())
      .filter(Boolean)
  )];

  for (const passwordHash of uniqueHashes) {
    try {
      // Current format used by the VPS auth system.
      if (await bcrypt.compare(rawPassword, passwordHash)) return true;

      // Defensive compatibility with restored/migrated VPS data. Some old
      // installs stored a direct SHA-256 hash, the portal salted SHA-256 hash,
      // or (in a few manual imports) the temporary/plain value in password_hash.
      // On successful login the caller upgrades the value to bcrypt via
      // storeUserPassword(), so these paths are only migration bridges.
      const sha256 = crypto.createHash('sha256').update(rawPassword).digest('hex');
      if (/^[a-f0-9]{64}$/i.test(passwordHash) && passwordHash.toLowerCase() === sha256) return true;

      const saltedSha256 = crypto.createHash('sha256').update(rawPassword + 'pulse_portal_salt_2026').digest('hex');
      if (/^[a-f0-9]{64}$/i.test(passwordHash) && passwordHash.toLowerCase() === saltedSha256) return true;

      // Texto puro só quando o valor guardado não tem cara de hash: mandar o
      // próprio SHA-256 em hex como senha não pode passar.
      if (!passwordHash.startsWith('$2') && !/^[a-f0-9]{64}$/i.test(passwordHash) && passwordHash === rawPassword) return true;
    } catch (error) {
      console.error('Password hash verification failed:', error?.message || error);
    }
  }

  return false;
}

async function upgradePasswordHashIfNeeded(profile, rawPassword) {
  if (!profile?.id || !rawPassword) return;

  try {
    const hashes = [profile.password_hash, profile.auth_password_hash, profile.profile_password_hash]
      .filter((hash) => typeof hash === 'string')
      .map((hash) => hash.trim())
      .filter(Boolean);
    const hasBcryptHash = hashes.some((hash) => /^\$2[aby]\$/.test(hash));
    const hasLegacyHash = hashes.some((hash) => !/^\$2[aby]\$/.test(hash));

    if (!hasBcryptHash || hasLegacyHash) {
      await storeUserPassword(profile.id, rawPassword);
    }
  } catch (error) {
    console.error('Password hash upgrade failed:', error?.message || error);
  }
}

// Autenticação externa legada removida: o login é exclusivamente VPS/JWT.
async function authenticateWithLegacyAuth() {
  return null;
}

// ─── Limite de tentativas (login e auto-cadastro) ───────────
// A API fica atrás do nginx: o IP de quem conectou vem no X-Real-IP ou no último
// item do X-Forwarded-For (o nginx acrescenta no fim; o começo pode vir do cliente).
function getClientIp(req) {
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded[forwarded.length - 1] || req.socket?.remoteAddress || 'unknown';
}

function isLoopbackIp(ip) {
  return !ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

const authAttemptBuckets = new Map();
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60_000;

function authAttemptCount(key) {
  const bucket = authAttemptBuckets.get(key);
  if (!bucket || Date.now() > bucket.reset) return 0;
  return bucket.count;
}

function registerAuthAttempt(key, windowMs = AUTH_ATTEMPT_WINDOW_MS) {
  const now = Date.now();
  const bucket = authAttemptBuckets.get(key);
  if (!bucket || now > bucket.reset) {
    authAttemptBuckets.set(key, { count: 1, reset: now + windowMs });
    return 1;
  }
  bucket.count += 1;
  return bucket.count;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of authAttemptBuckets) {
    if (now > bucket.reset) authAttemptBuckets.delete(key);
  }
}, 5 * 60_000).unref?.();

// Só as falhas contam. E-mail + IP trava rápido; o e-mail sozinho tem teto maior
// (o IP pode faltar ou ser o mesmo para o estúdio inteiro); o IP sozinho só conta
// quando é o IP real do cliente.
const LOGIN_FAILURE_LIMITS = { emailIp: 10, email: 50, ip: 100 };

function loginAttemptKeys(req, normalizedEmail) {
  const ip = getClientIp(req);
  const keys = {
    emailIp: `login:${normalizedEmail}:${ip}`,
    email: `login-email:${normalizedEmail}`,
  };
  if (!isLoopbackIp(ip)) keys.ip = `login-ip:${ip}`;
  return keys;
}

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── Login ──────────────────────────────────────────────────
// ─── Limite de tentativas de login (memória do processo) ───
// Conta só as FALHAS por login (e-mail da equipe ou usuário do portal), sem
// depender de IP: atrás do Nginx o IP chega como 127.0.0.1 e o
// X-Forwarded-For pode ser forjado. Depois de LOGIN_MAX_FAILURES erros em
// 15 min aquele login fica bloqueado até a janela acabar; acertar a senha zera
// o contador. O restart do PM2 no deploy zera tudo (a sonda do update_vps.sh
// continua recebendo 401).
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_FAILURES_MAX_KEYS = 50000;
const loginFailures = new Map();

function loginAttemptKey(scope, login) {
  return `${scope}:${String(login || '').trim().toLowerCase()}`;
}

/** Segundos até liberar o login (0 = pode tentar). */
function loginRetryAfterSeconds(key) {
  const entry = loginFailures.get(key);
  if (!entry) return 0;
  const elapsed = Date.now() - entry.firstAt;
  if (elapsed > LOGIN_FAILURE_WINDOW_MS) {
    loginFailures.delete(key);
    return 0;
  }
  if (entry.count < LOGIN_MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((LOGIN_FAILURE_WINDOW_MS - elapsed) / 1000));
}

function registerLoginFailure(key) {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry || now - entry.firstAt > LOGIN_FAILURE_WINDOW_MS) {
    loginFailures.delete(key);
    loginFailures.set(key, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
  if (loginFailures.size > LOGIN_FAILURES_MAX_KEYS) {
    for (const [k, v] of loginFailures) {
      if (now - v.firstAt > LOGIN_FAILURE_WINDOW_MS) loginFailures.delete(k);
    }
    // Ainda cheio (muitos logins diferentes): descarta os mais antigos
    for (const k of loginFailures.keys()) {
      if (loginFailures.size <= LOGIN_FAILURES_MAX_KEYS) break;
      loginFailures.delete(k);
    }
  }
}

function clearLoginFailures(key) {
  loginFailures.delete(key);
}

function sendTooManyLoginAttempts(res, retryAfter) {
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.' });
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

    const normalizedEmail = String(email).toLowerCase().trim();

    const attemptKeys = loginAttemptKeys(req, normalizedEmail);
    const blockedBy = Object.entries(attemptKeys).find(([kind, key]) => authAttemptCount(key) >= LOGIN_FAILURE_LIMITS[kind]);
    if (blockedBy) {
      const minutes = Math.max(1, Math.ceil(((authAttemptBuckets.get(blockedBy[1])?.reset || Date.now()) - Date.now()) / 60_000));
      return res.status(429).json({ error: `Muitas tentativas de login. Tente de novo em ${minutes} min.` });
    }

    let profile = await getAuthProfileByEmail(normalizedEmail);

    // Fallback: Se não encontrou no join profiles+auth_users, tenta direto na auth_users por email
    if (!profile) {
      profile = await getLocalAuthUserByEmail(normalizedEmail);
      if (profile) {
        console.log(`[Login-Fallback] User found in auth_users but not linked in profiles: ${normalizedEmail}`);
      }
    }

    
    // Log de diagnóstico para falha de login (ajuda o admin a ver o que está falhando)
    if (!profile) {
      console.warn(`[Login-Fail] User not found: ${normalizedEmail}`);
    }

    let valid = await verifyStoredPassword(
      password,
      profile?.password_hash,
      profile?.auth_password_hash,
      profile?.profile_password_hash,
    );

    if (!valid) {
      const legacyProfile = await authenticateWithLegacyAuth(email, password);
      if (legacyProfile) {
        profile = legacyProfile;
        valid = true;
      }
    }

    if (!profile || !valid) {
      for (const key of Object.values(attemptKeys)) registerAuthAttempt(key);
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }
    authAttemptBuckets.delete(attemptKeys.emailIp);
    authAttemptBuckets.delete(attemptKeys.email);

    await upgradePasswordHashIfNeeded(profile, password);

    const role = await getUserPrimaryRole(profile.id, profile.role || 'editor');

    const token = signToken({ sub: profile.id, email: profile.email, role });

    try {
      const authColumns = await getExistingColumns('auth_users').catch(() => new Set());
      if (authColumns.has('last_sign_in')) {
        await pool.query('UPDATE auth_users SET last_sign_in = NOW() WHERE id = $1 OR lower(email) = lower($2)', [profile.id, profile.email]);
      }
    } catch (lastSignInError) {
      console.error('Failed to update last_sign_in:', lastSignInError?.message || lastSignInError);
    }

    res.json({
      token,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.display_name || profile.name,
        role,
        avatar_url: profile.avatar_url,
        job_title: profile.job_title,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// ─── Refresh current session ─────────────────────────────────
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autenticado' });

    const currentToken = authHeader.replace('Bearer ', '');
    const { decoded } = decodeTokenForRefresh(currentToken);
    if (!decoded?.sub || decoded.scope) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    const profile = await getAuthProfileById(decoded.sub);

    if (!profile) return res.status(401).json({ error: 'Perfil não encontrado' });

    const role = await getUserPrimaryRole(profile.id, profile.role || 'editor');
    const token = signToken({ sub: profile.id, email: profile.email, role });

    res.json({
      token,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.display_name || profile.name,
        role,
        avatar_url: profile.avatar_url,
        job_title: profile.job_title,
      },
    });
  } catch (error) {
    // 401 só quando o token é inválido ou venceu além da carência; erro de banco
    // vira 503 para o front não apagar a sessão numa oscilação.
    if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error?.name)) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    console.error('Refresh error:', error?.message || error);
    res.status(503).json({ error: 'Servidor indisponível. Tente de novo.' });
  }
});

// ─── Get current user ───────────────────────────────────────
app.get('/api/auth/me', async (req, res) => {
  try {
    await ensureAuthSupportTables();
    const { user } = await verifyUser(req);
    // Instalações antigas podem ter IDs diferentes em profiles/auth_users para
    // o mesmo e-mail. Todas essas identidades representam o mesmo colaborador.
    const linkedUserIds = await getLinkedUserIds(user);
    const effectiveUserIds = linkedUserIds.length ? linkedUserIds : [String(user.id)];
    const { rows: linkedRoleRows } = await pool.query(
      `SELECT DISTINCT role::text AS role
         FROM user_roles
        WHERE user_id::text = ANY($1::text[])`,
      [effectiveUserIds]
    ).catch(() => ({ rows: [] }));
    const linkedRoles = linkedRoleRows.map((row) => row.role).filter(Boolean);
    const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
    const roleColumns = await getExistingColumns('user_roles').catch(() => new Set());
    const hasRoleRelation = roleColumns.has('user_id') && roleColumns.has('role');
    const profileSelect = profileColumns.has('id')
      ? `SELECT p.id,
                ${profileColumns.has('name') ? 'p.name' : profileColumns.has('email') ? `split_part(p.email, '@', 1) AS name` : 'NULL::text AS name'},
                ${profileColumns.has('email') ? 'p.email' : '$3::text AS email'},
                ${profileColumns.has('avatar_url') ? 'p.avatar_url' : 'NULL::text AS avatar_url'},
                ${profileColumns.has('display_name') ? 'p.display_name' : 'NULL::text AS display_name'},
                ${profileColumns.has('job_title') ? 'p.job_title' : 'NULL::text AS job_title'},
                ${profileColumns.has('bio') ? 'p.bio' : 'NULL::text AS bio'},
                ${profileColumns.has('birthday') ? 'p.birthday' : 'NULL::date AS birthday'},
                ${profileColumns.has('monthly_salary') ? 'p.monthly_salary' : '0::numeric AS monthly_salary'},
                COALESCE(${profileColumns.has('role') ? 'p.role::text' : 'NULL::text'}, $2) AS role,
                ${hasRoleRelation
                  ? `COALESCE((SELECT json_agg(DISTINCT ur.role::text) FROM user_roles ur WHERE ur.user_id = p.id), '[]'::json)`
                  : `'[]'::json`} AS roles
           FROM profiles p
          WHERE p.id = $1
          LIMIT 1`
      : null;
    const { rows } = profileSelect
      ? await pool.query(profileSelect, [user.id, user.role || 'editor', user.email || ''])
      : { rows: [] };

    if (rows.length === 0) {
      const fallback = await getAuthProfileById(user.id);
      if (fallback) {
        return res.json({
          id: fallback.id,
          email: fallback.email,
          name: fallback.display_name || fallback.name,
          role: fallback.role || user.role || 'editor',
          roles: Array.from(new Set([fallback.role, user.role, ...linkedRoles].filter(Boolean))),
          identity_ids: effectiveUserIds,
          avatar_url: fallback.avatar_url,
          job_title: fallback.job_title,
          bio: fallback.bio,
          birthday: fallback.birthday,
          monthly_salary: fallback.monthly_salary || 0,
        });
      }
    }
    if (rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado' });

    const profile = rows[0];
    res.json({
      id: profile.id,
      email: profile.email,
      name: profile.display_name || profile.name,
      role: profile.role,
      roles: Array.from(new Set([profile.role, ...linkedRoles, ...(Array.isArray(profile.roles) ? profile.roles : [])].filter(Boolean))),
      identity_ids: effectiveUserIds,
      avatar_url: profile.avatar_url,
      job_title: profile.job_title,
      bio: profile.bio,
      birthday: profile.birthday,
      monthly_salary: profile.monthly_salary || 0,
    });
  } catch (error) {
    if (error?.message === 'Unauthorized') return res.status(401).json({ error: 'Não autenticado' });
    console.error('Auth me error:', error?.message || error);
    res.status(503).json({ error: 'Servidor indisponível. Tente de novo.' });
  }
});

// ─── Multi-city: cidades do usuário logado ─────────────────
app.get('/api/me/cities', async (req, res) => {
  try {
    await ensureUserCitiesTable();
    const { user } = await verifyUser(req);
    const linkedUserIds = await getLinkedUserIds(user);

    // Admins sempre têm acesso a todas as cidades, independente de user_cities
    if (await isAdminUser(user)) {
      const { rows: adminRows } = await pool.query(
        'SELECT city, is_primary FROM user_cities WHERE user_id::text = ANY($1::text[])',
        [linkedUserIds]
      );
      const primary = adminRows.find(r => r.is_primary)?.city || 'minacu';
      return res.json({ cities: ['minacu', 'uruacu'], primary });
    }

    const { rows } = await pool.query(
      'SELECT city, is_primary FROM user_cities WHERE user_id::text = ANY($1::text[]) ORDER BY is_primary DESC, city ASC',
      [linkedUserIds]
    );
    if (rows.length === 0) {
      return res.json({ cities: ['minacu'], primary: 'minacu' });
    }
    const cities = rows.map(r => r.city);
    const primary = rows.find(r => r.is_primary)?.city || cities[0];
    res.json({ cities, primary });
  } catch (e) {
    res.status(401).json({ error: 'Não autenticado' });
  }
});


// ─── Change password ────────────────────────────────────────
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    // Sem a senha atual, quem pegasse um token trocaria a senha e trancaria a pessoa fora.
    if (!currentPassword) return res.status(400).json({ error: 'Informe a senha atual' });

    const attemptKey = `change-password:${user.id}`;
    if (authAttemptCount(attemptKey) >= 10) {
      return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em alguns minutos.' });
    }

    const profile = await getAuthProfileById(user.id);
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    const storedHashes = [profile.password_hash, profile.auth_password_hash, profile.profile_password_hash].filter(Boolean);
    if (storedHashes.length === 0) {
      return res.status(400).json({ error: 'Conta sem senha cadastrada: peça a redefinição a um administrador' });
    }
    const valid = await verifyStoredPassword(currentPassword, ...storedHashes);
    if (!valid) {
      registerAuthAttempt(attemptKey);
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    await storeUserPassword(user.id, newPassword);

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(error?.message === 'Unauthorized' ? 401 : (error?.statusCode || 500)).json({ error: error.message });
  }
});

// ─── Admin: Set password for a team member ──────────────────
app.post('/api/auth/set-password', async (req, res) => {
  try {
    const { user: actor } = await verifyAdmin(req);
    const { userId, password } = req.body;
    if (!userId || !password || password.length < 6) return res.status(400).json({ error: 'userId e senha (min 6 chars) obrigatórios' });
    await assertCanManageUserAccount(actor, { targetUserId: userId });

    await storeUserPassword(userId, password);

    res.json({ success: true, message: 'Senha definida com sucesso' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// ─── Admin: Create user ─────────────────────────────────────
const VALID_CITIES = ['minacu', 'uruacu'];
let userCitiesTableEnsuredPromise = null;

async function ensureUserCitiesTable() {
  if (!userCitiesTableEnsuredPromise) {
    userCitiesTableEnsuredPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS user_cities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        city TEXT NOT NULL CHECK (city IN ('minacu', 'uruacu')),
        is_primary BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, city)
      );

      CREATE INDEX IF NOT EXISTS idx_user_cities_user_id
        ON user_cities (user_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_cities_primary_per_user
        ON user_cities (user_id)
        WHERE is_primary = true;
    `).catch((error) => {
      userCitiesTableEnsuredPromise = null;
      throw error;
    });
  }

  return userCitiesTableEnsuredPromise;
}

function sanitizeCities(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const c of input) {
    const v = String(c || '').toLowerCase();
    if (VALID_CITIES.includes(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

async function saveUserCities(userId, cities, primary) {
  await ensureUserCitiesTable();
  const list = sanitizeCities(cities);
  if (list.length === 0) list.push('minacu');
  const primaryCity = list.includes(String(primary || '').toLowerCase())
    ? String(primary).toLowerCase()
    : list[0];
  await pool.query('DELETE FROM user_cities WHERE user_id = $1', [userId]);
  for (const c of list) {
    await pool.query(
      'INSERT INTO user_cities (user_id, city, is_primary) VALUES ($1, $2, $3)',
      [userId, c, c === primaryCity]
    );
  }
  return { cities: list, primary: primaryCity };
}

app.post('/api/auth/create-user', async (req, res) => {
  try {
    const { name, email, password, role, cities, primaryCity, isSelfRegister } = req.body;

    if (isSelfRegister) {
      // Cadastro público da Academy: limite por IP (contas criadas por hora).
      const ip = getClientIp(req);
      if (registerAuthAttempt(`self-register:${ip}`, 60 * 60_000) > 10) {
        return res.status(429).json({ error: 'Muitos cadastros feitos daqui. Tente de novo mais tarde.' });
      }
    } else {
      const { user: actor } = await verifyAdmin(req);
      const requestedRole = role || 'editor';
      const validRoles = await getValidAppRoles();
      if (validRoles && !validRoles.has(String(requestedRole))) {
        return res.status(400).json({ error: `Função inválida: "${String(requestedRole).slice(0, 40)}"` });
      }
      await assertCanManageUserAccount(actor, { requestedRole });
    }

    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

    const normalizedEmail = email.toLowerCase().trim();
    const { rows: existing } = await pool.query('SELECT id FROM profiles WHERE lower(email) = lower($1)', [normalizedEmail]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email já cadastrado no sistema' });

    if (!(await hasProfilesPasswordHashColumn())) {
      await ensureAuthSupportTables();
      const { rows: existingAuth } = await pool.query('SELECT id FROM auth_users WHERE lower(email) = lower($1) LIMIT 1', [normalizedEmail]);
      if (existingAuth.length > 0) return res.status(409).json({ error: 'Email já cadastrado no sistema' });
    }

    const id = crypto.randomUUID();
    const userRole = isSelfRegister ? 'videomaker' : (role || 'editor');

    if (await hasProfilesPasswordHashColumn()) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        'INSERT INTO profiles (id, name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5)',
        [id, name, normalizedEmail, userRole, hash]
      );
      await storeUserPassword(id, password);
    } else {
      await pool.query(
        'INSERT INTO profiles (id, name, email, role) VALUES ($1, $2, $3, $4)',
        [id, name, normalizedEmail, userRole]
      );
      await storeUserPassword(id, password);
    }

    await pool.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [id, userRole]
    );

    // No auto-cadastro a cidade não vem do pedido: fica a padrão, e o admin libera outra na Equipe.
    const saved = isSelfRegister
      ? await saveUserCities(id, ['minacu'], 'minacu')
      : await saveUserCities(id, cities && cities.length ? cities : ['minacu'], primaryCity);

    res.json({ success: true, user: { id, name, email: normalizedEmail, role: userRole, cities: saved.cities, primary_city: saved.primary } });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// ─── Admin: Reset password ──────────────────────────────────
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { user: actor } = await verifyAdmin(req);
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'userId e nova senha (min 6 chars) obrigatórios' });
    await assertCanManageUserAccount(actor, { targetUserId: userId });

    await storeUserPassword(userId, newPassword);

    res.json({ success: true, message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// ─── Admin: Trocar a foto de um membro da equipe ────────────
// A imagem já foi enviada por /api/upload; aqui só gravamos a URL no perfil.
app.post('/api/admin/user-avatar', async (req, res) => {
  try {
    await verifyTeamManager(req);
    const userId = String(req.body?.userId || '');
    const avatarUrl = String(req.body?.avatarUrl || '');
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    if (!/^https:\/\/agenciapulse\.tech\/uploads\/[\w./-]+\.(png|jpe?g|webp)$/i.test(avatarUrl)) {
      return res.status(400).json({ error: 'Envie uma imagem PNG, JPG ou WEBP pelo upload do sistema' });
    }
    const { rowCount } = await pool.query(
      'UPDATE profiles SET avatar_url = $2, updated_at = now() WHERE id = $1',
      [userId, avatarUrl]
    );
    if (!rowCount) return res.status(404).json({ error: 'Membro não encontrado' });
    res.json({ success: true });
  } catch (error) {
    const status = error.message === 'Unauthorized' ? 401 : /Admin|access|permiss/i.test(error.message || '') ? 403 : 500;
    res.status(status).json({ error: error.message });
  }
});

// ─── Admin: Listar cidades de todos os usuários ─────────────
app.get('/api/admin/user-cities', async (req, res) => {
  try {
    await ensureUserCitiesTable();
    await verifyTeamManager(req);
    const { rows } = await pool.query(
      'SELECT user_id, city, is_primary FROM user_cities ORDER BY user_id, is_primary DESC, city ASC'
    );
    const map = {};
    for (const r of rows) {
      if (!map[r.user_id]) map[r.user_id] = { cities: [], primary: null };
      map[r.user_id].cities.push(r.city);
      if (r.is_primary && !map[r.user_id].primary) map[r.user_id].primary = r.city;
    }
    res.json({ users: map });
  } catch (error) {
    res.status(error.message?.includes('Admin') ? 403 : 500).json({ error: error.message });
  }
});

// ─── Equipe da cidade ativa: ids de quem atende a cidade (user_cities) ───
// A Agenda e o Controle de Gravações usam para não oferecer nem distribuir gravação para
// videomaker da outra cidade. Mesma regra do resolveActiveCity: sem cidade cadastrada = Minaçu;
// contas ligadas pelo e-mail (profiles x auth_users) contam juntas.
// Bônus do próprio usuário no mês (banner de parabéns). A tabela inteira só a gestão lê.
app.get('/api/me/salary-bonuses', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const month = String(req.query.month || '');
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month (AAAA-MM) obrigatório' });
    await ensureSalaryBonusesTable();
    const ids = (await getLinkedUserIds(user).catch(() => [])).map(String);
    if (!ids.includes(String(user.id))) ids.push(String(user.id));
    // Bônus antigos não têm user_id: guardavam o nome (às vezes o de exibição)
    const { rows: [profileRow] } = await pool.query(
      `SELECT name, display_name FROM profiles WHERE id::text = ANY($1::text[]) LIMIT 1`, [ids]
    ).catch(() => ({ rows: [] }));
    const names = [profileRow?.name, profileRow?.display_name].map((n) => String(n || '').trim().toLowerCase()).filter(Boolean);
    const { rows } = await pool.query(
      `SELECT id, user_id, user_name, user_role, bonus_amount, reference_month, created_at
         FROM salary_bonuses
        WHERE reference_month = $1
          AND (user_id::text = ANY($2::text[]) OR (user_id IS NULL AND lower(trim(user_name)) = ANY($3::text[])))
        ORDER BY created_at`,
      [month, ids, names]
    );
    res.json({ bonuses: rows });
  } catch (error) {
    res.status(error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
  }
});

app.get('/api/team/city-members', async (req, res) => {
  try {
    await ensureUserCitiesTable();
    const { user } = await verifyUser(req);
    const city = await resolveActiveCity(req, user.id, user);
    const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
    const authColumns = await getExistingColumns('auth_users').catch(() => new Set());
    const linkByEmail = profileColumns.has('email') && authColumns.has('id') && authColumns.has('email');
    const { rows } = await pool.query(
      `WITH ids AS (
         SELECT p.id::text AS profile_id, p.id::text AS uid FROM profiles p
         ${linkByEmail ? `UNION
         SELECT p.id::text, a.id::text FROM profiles p
           JOIN auth_users a ON p.email IS NOT NULL AND lower(a.email) = lower(p.email)` : ''}
       )
       SELECT ids.profile_id AS id
         FROM ids LEFT JOIN user_cities uc ON uc.user_id::text = ids.uid
        GROUP BY ids.profile_id
       HAVING COALESCE(bool_or(uc.user_id IS NOT NULL AND ${cityScopeCondition('uc.city', '$1')}), false)
           OR ($1::text = 'minacu' AND COUNT(uc.user_id) = 0)`,
      [city]
    );
    res.json({ city, user_ids: rows.map(r => r.id) });
  } catch (error) {
    res.status(error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
  }
});

// ─── Admin: Atualizar cidades de um usuário ─────────────────
app.post('/api/admin/user-cities', async (req, res) => {
  try {
    await ensureUserCitiesTable();
    await verifyTeamManager(req);
    const { userId, cities, primaryCity } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
    const list = sanitizeCities(cities);
    if (list.length === 0) return res.status(400).json({ error: 'Selecione ao menos uma cidade' });
    const saved = await saveUserCities(userId, list, primaryCity);
    res.json({ success: true, ...saved });
  } catch (error) {
    console.error('Update user cities error:', error);
    res.status(error.message?.includes('Admin') ? 403 : 500).json({ error: error.message });
  }
});

// ─── AI helpers ─────────────────────────────────────────────
function getAiConfig(provider, dbApiKey) {
  const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;

  if (provider === 'gemini' && (geminiKey || dbApiKey)) return { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: geminiKey || dbApiKey, provider: 'gemini' };
  if (provider === 'openai' && (openaiKey || dbApiKey)) return { url: 'https://api.openai.com/v1/chat/completions', key: openaiKey || dbApiKey, provider: 'openai' };
  if (provider === 'claude' && (claudeKey || dbApiKey)) return { url: 'https://api.anthropic.com/v1/messages', key: claudeKey || dbApiKey, provider: 'claude' };
  if (geminiKey) return { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: geminiKey, provider: 'gemini' };
  if (openaiKey) return { url: 'https://api.openai.com/v1/chat/completions', key: openaiKey, provider: 'openai' };
  if (claudeKey) return { url: 'https://api.anthropic.com/v1/messages', key: claudeKey, provider: 'claude' };
  throw new Error('Nenhuma API key de IA configurada.');
}

async function fetchDbApiKey(db, aiProvider) {
  if (!aiProvider) return undefined;
  const providerMap = { gemini: 'ai_gemini', openai: 'ai_openai', claude: 'ai_claude' };
  const { data } = await db
    .from('api_integrations').select('config')
    .eq('provider', providerMap[aiProvider] || '').eq('status', 'ativo').limit(1).single();
  return data?.config?.api_key_encrypted;
}

// O Google desativou a família Gemini 1.x/2.x (404 "no longer available"): os nomes antigos,
// salvos na tela de APIs ou fixos no código, viram os apelidos "-latest", que acompanham a
// versão atual sozinhos. Claude 3 também saiu de linha.
function resolveAiModel(model, provider) {
  const raw = String(model || '').trim().replace(/^(?:google|models)\//i, '');
  if (provider === 'gemini') {
    if (!raw || /^gemini-(1\.|2\.)/i.test(raw)) {
      if (/pro/i.test(raw)) return 'gemini-pro-latest';
      if (/lite|8b/i.test(raw)) return 'gemini-flash-lite-latest';
      return 'gemini-3.5-flash';
    }
    // 'gemini-flash-latest' travava (>50 s sem resposta, out/2026): usa a versão fixa que responde
    if (raw === 'gemini-flash-latest') return 'gemini-3.5-flash';
    return raw;
  }
  if (provider === 'claude') {
    // Modelo escolhido na tela de APIs (Haiku/Sonnet/Opus atuais) vale como está; nome de
    // outro provedor ou de linha antiga (Claude 3/4) vira o equivalente atual.
    if (/^claude-(haiku|sonnet|opus)-5-5$/i.test(raw)) return raw;
    if (/haiku/i.test(raw)) return 'claude-haiku-5-5';
    if (/sonnet/i.test(raw)) return 'claude-sonnet-5-5';
    return 'claude-opus-5-5';
  }
  return raw;
}

// ── Claude (provedor de IA do sistema) ──
// SDK oficial. Os modelos atuais pensam antes de responder (não dá para desligar): o esforço
// controla quanto, e o max_tokens precisa caber o pensamento + a resposta. Sem temperature
// (a API recusa sampling desde 21/10/2026). A resposta pode começar com blocos 'thinking':
// o texto é lido pelos blocos 'text'.
const anthropicClients = new Map();
function getAnthropicClient(apiKey) {
  let client = anthropicClients.get(apiKey);
  if (!client) {
    // Um pedido não pode passar dos 120 s do Nginx: sem nova tentativa automática.
    client = new Anthropic({ apiKey, timeout: 100_000, maxRetries: 0 });
    anthropicClients.set(apiKey, client);
  }
  return client;
}

async function callClaude(apiKey, model, messages, options = {}) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const chat = messages.filter(m => m.role !== 'system');
  // Recusa do classificador de segurança: Opus/Sonnet tentam o modelo de reserva indicado
  // pela Anthropic (Haiku não tem reserva no servidor).
  const withFallback = /^claude-(opus|sonnet)-/i.test(model);
  const response = await getAnthropicClient(apiKey).beta.messages.create({
    model,
    max_tokens: 16000,
    output_config: { effort: options.effort || 'medium' },
    ...(system ? { system } : {}),
    messages: chat,
    ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  });
  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('A IA recusou este pedido. Reformule e tente de novo.'), { status: 422 });
  }
  return response.content.filter(block => block.type === 'text').map(block => block.text).join('').trim();
}

/**
 * Provedor de IA do pedido: o Claude, sempre que houver chave (ANTHROPIC_API_KEY ou a
 * integração Claude da tela de APIs). Sem chave do Claude, segue o provedor configurado
 * (reserva até a chave ser cadastrada).
 */
async function resolveAiConfig(aiProvider, dbApiKey) {
  let claudeKey = process.env.ANTHROPIC_API_KEY;
  if (!claudeKey) {
    const admin = getAdminClient();
    if (admin) claudeKey = await fetchDbApiKey(admin, 'claude').catch(() => undefined);
  }
  if (claudeKey) return { url: 'https://api.anthropic.com/v1/messages', key: claudeKey, provider: 'claude' };
  return getAiConfig(aiProvider, dbApiKey);
}

// Cada tentativa tem limite: o Nginx corta o pedido em 120 s, então um modelo travado não pode segurar a resposta
const AI_ATTEMPT_TIMEOUT_MS = 45_000;

async function callAi(ai, model, messages, options = {}) {
  const { temperature = 0.3, max_tokens = 2000, retries = 2 } = options;
  const resolvedModel = resolveAiModel(model, ai.provider);
  // Claude: uma chamada só (sem a cadeia de modelos e as novas tentativas do Gemini)
  if (ai.provider === 'claude') return callClaude(ai.key, resolvedModel, messages, options);

  // Fallback chain: se o modelo falhar com 429/404, tenta modelos com cotas mais altas
  const FALLBACK_MODELS = {
    'gemini-pro-latest': ['gemini-3.5-flash', 'gemini-flash-lite-latest'],
    'gemini-3.5-flash': ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'],
    'gemini-flash-lite-latest': ['gemini-3.5-flash-lite', 'gemini-3.5-flash'],
  };
  const modelsToTry = ai.provider === 'gemini'
    ? [resolvedModel, ...(FALLBACK_MODELS[resolvedModel] || ['gemini-3.5-flash', 'gemini-flash-lite-latest'])]
        .filter((m, i, all) => all.indexOf(m) === i)
    : [resolvedModel];

  let lastError;
  for (const tryModel of modelsToTry) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(ai.url, {
          method: 'POST',
          signal: AbortSignal.timeout(AI_ATTEMPT_TIMEOUT_MS),
          headers: { Authorization: `Bearer ${ai.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: tryModel, messages, temperature, max_tokens }),
        });
        if (!res.ok) {
          const errText = await res.text();
          const err = new Error(`AI error [${res.status}]: ${errText}`);
          err.status = res.status;
          
          // 429 = rate limit ou 404 = modelo descontinuado: tenta próximo modelo na chain de fallback
          if (res.status === 429 || res.status === 404) {
            console.warn(`[callAi] ${res.status} em ${tryModel}, tentando próximo modelo...`);
            lastError = err;
            break;
          }
          // 5xx = retry com backoff exponencial
          if (res.status >= 500 && attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`[callAi] ${res.status} em ${tryModel}, retry em ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      } catch (err) {
        lastError = err;
        // Modelo que não respondeu a tempo: passa para o próximo da cadeia
        if (err?.name === 'TimeoutError') {
          console.warn(`[callAi] ${tryModel} sem resposta em ${AI_ATTEMPT_TIMEOUT_MS / 1000}s, tentando próximo modelo...`);
          break;
        }
        if (err.status === 429 || err.status === 404) break; // próximo modelo
        if (attempt === retries) throw err;
      }
    }
  }
  throw lastError || new Error('AI: todos modelos falharam');
}


// WhatsApp helper — envio pelo WhatsApp próprio (Baileys, processo pulse-wa): a mensagem entra na fila e sai pela
// conexão que tem a função dela (ver vps-api-server/whatsapp/). `config` e `db` ficam por compatibilidade.
const PORTAL_BASE_URL = 'https://agenciapulse.tech/portal';

async function sendWhatsAppDirect(config, number, message, db, clientId, triggerType, purpose, { expiresAt } = {}) {
  try {
    const queued = await enqueueWhatsApp(pool, { to: number, body: message, clientId, triggerType, purpose, expiresAt });
    return { ok: true, queued: true, id: queued.id };
  } catch (e) {
    console.error('sendWhatsAppDirect error:', e);
    return { ok: false, error: e.message };
  }
}

// data + hora de um compromisso no fuso de Brasília (sem horário de verão) → Date; sem data válida = null
function brasiliaDateTime(date, time) {
  const day = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const hour = /^\d{2}:\d{2}/.test(String(time || '')) ? String(time).slice(0, 5) : '23:59';
  const at = new Date(`${day}T${hour}:00-03:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

function applyTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── 1. Financial Chat ─────────────────────────────────────
app.post('/api/financial-chat', async (req, res) => {
  try {
    const { user } = await verifyAdmin(req);
    const { question, conversationHistory, aiModel, aiProvider } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    const now = new Date();
    const SYSTEM_START = '2026-03-01'; // Sistema iniciou em março 2026
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const fmt = v => Number(v || 0).toLocaleString('pt-BR');
    const fmtMoney = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = d => { if (!d) return 'N/A'; const dt = typeof d === 'string' ? d : d.toISOString(); return dt.slice(0, 10).split('-').reverse().join('/'); };

    const aiConfigCity = (await tableHasCityColumn('api_integrations')) ? await resolveActiveCity(req, user.id, user) : null;

    // Fetch ALL system data in parallel from local PostgreSQL
    // NOTE: All operational data filtered from SYSTEM_START (March 2026). Only contracts can have earlier dates.
    const [
      revenuesRes, expensesRes, contractsRes, clientsRes, cashRes, apiKeyRes,
      recordingsRes, contentTasksRes, designTasksRes, scriptsRes,
      deliveriesRes, socialDeliveriesRes, profilesRes, plansRes,
      goalsRes, portalContentsRes,
      endoContractsRes, endoClientesRes, endoPartnerTasksRes, endoPackagesRes, onboardingTasksRes,
      waitLogsRes, taskHistoryRes
    ] = await Promise.all([
      pool.query(`SELECT r.*, c.company_name AS client_name FROM revenues r LEFT JOIN clients c ON c.id = r.client_id WHERE r.due_date >= $1 ORDER BY r.due_date DESC LIMIT 500`, [SYSTEM_START]),
      pool.query(`SELECT e.*, ec.name AS category_name FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id WHERE e.date >= $1 ORDER BY e.date DESC LIMIT 500`, [SYSTEM_START]),
      pool.query(`SELECT fc.*, c.company_name AS client_name, p.name AS plan_name, p.price AS plan_price FROM financial_contracts fc LEFT JOIN clients c ON c.id = fc.client_id LEFT JOIN plans p ON p.id = fc.plan_id WHERE fc.status = 'ativo'`),
      pool.query(`SELECT c.*, p.name AS plan_name FROM clients c LEFT JOIN plans p ON p.id = c.plan_id`),
      pool.query(`SELECT * FROM cash_reserve_movements WHERE date >= $1 ORDER BY date DESC LIMIT 100`, [SYSTEM_START]),
      // Configuração de IA ativa: a da cidade ativa primeiro, depois a mais recente
      pool.query(
        `SELECT config FROM api_integrations WHERE provider = ANY($1) AND status = 'ativo'
          ORDER BY ${aiConfigCity ? `(${cityScopeExpression('city')} = $2) DESC, ` : ''}updated_at DESC LIMIT 1`,
        aiConfigCity ? [['ai_gemini', 'ai_openai', 'ai_claude'], aiConfigCity] : [['ai_gemini', 'ai_openai', 'ai_claude']]
      ),
      pool.query(`SELECT r.*, c.company_name AS client_name, pf.name AS videomaker_name FROM recordings r LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN profiles pf ON pf.id = r.videomaker_id WHERE r.date >= $1 ORDER BY r.date DESC LIMIT 200`, [SYSTEM_START]),
      pool.query(`SELECT ct.*, c.company_name AS client_name, pf.name AS assigned_name FROM content_tasks ct LEFT JOIN clients c ON c.id = ct.client_id LEFT JOIN profiles pf ON pf.id = ct.assigned_to ORDER BY ct.updated_at DESC LIMIT 200`),
      pool.query(`SELECT dt.*, c.company_name AS client_name, pf.name AS assigned_name FROM design_tasks dt LEFT JOIN clients c ON c.id = dt.client_id LEFT JOIN profiles pf ON pf.id = dt.assigned_to ORDER BY dt.updated_at DESC LIMIT 200`),
      pool.query(`SELECT s.*, c.company_name AS client_name FROM scripts s LEFT JOIN clients c ON c.id = s.client_id ORDER BY s.created_at DESC LIMIT 200`),
      pool.query(`SELECT dr.*, c.company_name AS client_name, pf.name AS videomaker_name FROM delivery_records dr LEFT JOIN clients c ON c.id = dr.client_id LEFT JOIN profiles pf ON pf.id = dr.videomaker_id WHERE dr.date >= $1 ORDER BY dr.date DESC LIMIT 200`, [startOfMonth]),
      pool.query(`SELECT sd.*, c.company_name AS client_name FROM social_media_deliveries sd LEFT JOIN clients c ON c.id = sd.client_id WHERE sd.delivered_at >= $1 ORDER BY sd.delivered_at DESC LIMIT 300`, [startOfMonth]).catch(() => ({ rows: [] })),
      pool.query(`SELECT id, name, email, role, job_title, monthly_salary FROM profiles`),
      pool.query(`SELECT * FROM plans`),
      pool.query(`SELECT * FROM goals WHERE status != 'cancelada' ORDER BY end_date DESC LIMIT 20`).catch(() => ({ rows: [] })),
      pool.query(`SELECT cpc.*, c.company_name AS client_name FROM client_portal_contents cpc LEFT JOIN clients c ON c.id = cpc.client_id ORDER BY cpc.created_at DESC LIMIT 100`).catch(() => ({ rows: [] })),
      pool.query(`SELECT ec.*, c.company_name AS client_name, ep.package_name, ep.category AS package_category, ep.sessions_per_week, ep.duration_hours, ep.stories_per_day, pf.name AS partner_name FROM client_endomarketing_contracts ec LEFT JOIN clients c ON c.id = ec.client_id LEFT JOIN endomarketing_packages ep ON ep.id = ec.package_id LEFT JOIN profiles pf ON pf.id = ec.partner_id ORDER BY ec.created_at DESC`).catch(() => ({ rows: [] })),
      pool.query(`SELECT * FROM endomarketing_clientes ORDER BY company_name`).catch(() => ({ rows: [] })),
      pool.query(`SELECT ept.*, c.company_name AS client_name, pf.name AS partner_name FROM endomarketing_partner_tasks ept LEFT JOIN clients c ON c.id = ept.client_id LEFT JOIN profiles pf ON pf.id = ept.partner_id WHERE ept.date >= $1 ORDER BY ept.date DESC LIMIT 300`, [SYSTEM_START]).catch(() => ({ rows: [] })),
      pool.query(`SELECT * FROM endomarketing_packages ORDER BY category, package_name`).catch(() => ({ rows: [] })),
      pool.query(`SELECT ot.*, c.company_name AS client_name FROM onboarding_tasks ot LEFT JOIN clients c ON c.id = ot.client_id ORDER BY ot.created_at DESC LIMIT 100`).catch(() => ({ rows: [] })),
      pool.query(`SELECT * FROM recording_wait_logs WHERE created_at >= $1`, [startOfMonth]).catch(() => ({ rows: [] })),
      pool.query(`SELECT th.*, pf.name AS user_name FROM task_history th LEFT JOIN profiles pf ON pf.id = th.user_id WHERE th.created_at >= $1 ORDER BY th.created_at DESC LIMIT 500`, [startOfMonth]).catch(() => ({ rows: [] })),
    ]);

    const revenues = revenuesRes.rows || [];
    const expenses = expensesRes.rows || [];
    const contracts = contractsRes.rows || [];
    const clients = clientsRes.rows || [];
    const cashMovements = cashRes.rows || [];
    const recordings = recordingsRes.rows || [];
    const contentTasks = contentTasksRes.rows || [];
    const designTasks = designTasksRes.rows || [];
    const scripts = scriptsRes.rows || [];
    const deliveries = deliveriesRes.rows || [];
    const socialDeliveries = socialDeliveriesRes.rows || [];
    const profiles = profilesRes.rows || [];
    const plans = plansRes.rows || [];
    const goals = goalsRes.rows || [];
    const portalContents = portalContentsRes.rows || [];
    const endoContracts = endoContractsRes.rows || [];
    const endoClientes = endoClientesRes.rows || [];
    const endoPartnerTasks = endoPartnerTasksRes.rows || [];
    const endoPackages = endoPackagesRes.rows || [];
    const onboardingTasks = onboardingTasksRes.rows || [];
    const waitLogs = waitLogsRes.rows || [];
    const taskHistory = taskHistoryRes.rows || [];

    // ── SCORING per team member (same formula as TeamPerformanceWidget) ──
    const teamScores = [];
    const teamProfs = profiles.filter(p => p.role !== 'admin');
    const _wkStart = new Date(); _wkStart.setDate(_wkStart.getDate() - _wkStart.getDay() + 1); _wkStart.setHours(0,0,0,0);
    const _wkEnd = new Date(_wkStart); _wkEnd.setDate(_wkEnd.getDate() + 6); _wkEnd.setHours(23,59,59,999);
    const wkStartStr = _wkStart.toISOString().slice(0,10);
    const wkEndStr = _wkEnd.toISOString().slice(0,10);

    const normalizeSocialStatus = status => {
      switch (status) {
        case 'posted':
        case 'publicado':
        case 'postado':
          return 'postado';
        case 'scheduled':
        case 'agendado':
          return 'agendado';
        case 'delivered':
        case 'entregue':
          return 'entregue';
        case 'review':
        case 'revisao':
          return 'revisao';
        case 'adjustment':
        case 'alteracao':
        case 'ajuste':
          return 'ajuste';
        case 'approval':
        case 'aprovacao_cliente':
          return 'aprovacao_cliente';
        default:
          return status || '';
      }
    };

    const socialDeliveryKey = delivery => {
      if (delivery.content_task_id) return `task:${delivery.content_task_id}`;
      if (delivery.script_id) return `script:${delivery.script_id}`;

      return [
        'manual',
        delivery.created_by || 'anon',
        delivery.client_id || 'sem-cliente',
        delivery.content_type || 'outro',
        String(delivery.title || '').trim().toLowerCase(),
        String(delivery.delivered_at || '').slice(0, 10),
      ].join('|');
    };

    const socialDeliverySortValue = delivery => {
      const candidates = [delivery.updated_at, delivery.posted_at, delivery.delivered_at, delivery.created_at]
        .filter(Boolean)
        .map(value => new Date(value).getTime())
        .filter(value => !Number.isNaN(value));

      return candidates.length ? Math.max(...candidates) : 0;
    };

    const dedupeSocialDeliveries = deliveries => {
      const unique = new Map();

      for (const delivery of deliveries) {
        const key = socialDeliveryKey(delivery);
        const current = unique.get(key);
        if (!current || socialDeliverySortValue(delivery) >= socialDeliverySortValue(current)) {
          unique.set(key, delivery);
        }
      }

      return Array.from(unique.values());
    };

    for (const p of teamProfs) {
      let score = 0;
      const bd = [];
      if (p.role === 'videomaker') {
        const vmDel = deliveries.filter(r => r.videomaker_id === p.id);
        const reels = vmDel.reduce((a, r) => a + (r.reels_produced || 0), 0);
        const crtv = vmDel.reduce((a, r) => a + (r.creatives_produced || 0), 0);
        const st = vmDel.reduce((a, r) => a + (r.stories_produced || 0), 0);
        const ext = vmDel.reduce((a, r) => a + (r.extras_produced || 0), 0);
        const art = vmDel.reduce((a, r) => a + (r.arts_produced || 0), 0);
        const wRecs = recordings.filter(r => r.videomaker_id === p.id && r.date >= wkStartStr && r.date <= wkEndStr);
        const wDone = wRecs.filter(r => r.status === 'concluida' && r.type !== 'endomarketing').length;
        const wEndo = wRecs.filter(r => r.status === 'concluida' && r.type === 'endomarketing').length;
        const vmWaitSec = waitLogs.filter(l => l.videomaker_id === p.id).reduce((a, l) => a + (l.wait_duration_seconds || 0), 0);
        const waitPts = Math.floor(vmWaitSec / 600) * 2;
        score = reels * 12 + crtv * 6 + st * 3 + ext * 10 + art * 4 + wDone * 15 + wEndo * 8 + waitPts;
        bd.push(`Reels:${reels}(x12) Criativos:${crtv}(x6) Stories:${st}(x3) Extras:${ext}(x10) Artes:${art}(x4) Grav.Sem:${wDone}(x15) Endo:${wEndo}(x8) Espera:${waitPts}pts`);
      } else if (p.role === 'editor') {
        const eT = contentTasks.filter(t => t.assigned_to === p.id);
        const appr = eT.filter(t => ['aprovado','publicado','finalizado'].includes(t.kanban_column)).length;
        const editing = eT.filter(t => t.kanban_column === 'em_edicao').length;
        const rev = eT.filter(t => t.kanban_column === 'revisao').length;
        const alt = eT.filter(t => t.kanban_column === 'alteracao').length;
        const pri = eT.filter(t => t.editing_priority === true).length;
        score = appr * 15 + editing * 5 + rev * 3 + alt * 8 + pri * 5;
        bd.push(`Aprovados:${appr}(x15) Editando:${editing}(x5) Revisão:${rev}(x3) Alterações:${alt}(x8) Prioritários:${pri}(x5)`);
      } else if (p.role === 'designer' || p.role === 'fotografo') {
        const dT = designTasks.filter(t => t.assigned_to === p.id);
        const comp = dT.filter(t => ['concluida','aprovada_cliente'].includes(t.kanban_column)).length;
        const prog = dT.filter(t => ['em_andamento','revisao'].includes(t.kanban_column)).length;
        const tSec = dT.reduce((a, t) => a + (t.time_spent_seconds || 0), 0);
        const tVer = dT.reduce((a, t) => a + (t.version || 1), 0);
        const hP = dT.filter(t => t.priority === 'alta' || t.priority === 'urgente').length;
        score = comp * 12 + prog * 4 + Math.round(tSec / 3600) * 2 + tVer * 3 + hP * 6;
        bd.push(`Concluídos:${comp}(x12) EmProgresso:${prog}(x4) Horas:${Math.round(tSec/3600)}(x2) Versões:${tVer}(x3) Urgentes:${hP}(x6)`);
      } else if (p.role === 'social_media') {
        const smC = contentTasks.filter(t => t.created_by === p.id);
        const pub = smC.filter(t => t.kanban_column === 'arquivado').length;
        const mgd = smC.filter(t => t.kanban_column !== 'ideias').length;
        const uDel = dedupeSocialDeliveries(socialDeliveries.filter(d => d.created_by === p.id));
        const post = uDel.filter(d => normalizeSocialStatus(d.status) === 'postado').length;
        const sched = uDel.filter(d => normalizeSocialStatus(d.status) === 'agendado').length;
        const scrC = scripts.filter(s => s.created_by === p.id).length;
        score = pub * 10 + post * 8 + sched * 5 + mgd * 2;
        bd.push(`Publicados:${pub}(x10) Postados:${post}(x8) Agendados:${sched}(x5) Gerenciados:${mgd}(x2) Roteiros:${scrC}(x0)`);
      } else if (p.role === 'parceiro') {
        const pT = endoPartnerTasks.filter(t => t.partner_id === p.id);
        const comp = pT.filter(t => t.status === 'completed' || t.completed_at).length;
        const pend = pT.filter(t => t.status === 'pending' || t.status === 'scheduled').length;
        const tMin = pT.reduce((a, t) => a + (t.duration_minutes || 0), 0);
        score = comp * 15 + pend * 3 + Math.round(tMin / 60) * 5;
        bd.push(`Concluídos:${comp}(x15) Pendentes:${pend}(x3) Horas:${Math.round(tMin/60)}(x5)`);
      } else { continue; }
      teamScores.push({ name: p.name, role: p.role, id: p.id, score, breakdown: bd.join(' | ') });
    }
    teamScores.sort((a, b) => b.score - a.score);

    const normalizeDate = value => {
      if (!value) return '';
      return String(value).includes('T') ? String(value).slice(0, 10) : String(value).slice(0, 10);
    };

    const currentMonthRevenues = revenues.filter(r => {
      const dueDate = normalizeDate(r.due_date);
      return dueDate && dueDate >= startOfMonth;
    });

    // ── Financial summary ──
    // Note: frontend uses 'recebida' status for paid revenues, but legacy data may use 'pago'
    const totalRevenuePaid = revenues.filter(r => ['pago', 'recebida'].includes(r.status)).reduce((s, r) => s + Number(r.amount), 0);
    const totalRevenuePending = revenues.filter(r => ['pendente', 'prevista'].includes(r.status)).reduce((s, r) => s + Number(r.amount), 0);
    const totalRevenueOverdue = currentMonthRevenues.filter(r => ['vencido', 'em_atraso'].includes(r.status)).reduce((s, r) => s + Number(r.amount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

    const expByCategory = {};
    expenses.forEach(e => { const cat = e.category_name || 'Sem categoria'; expByCategory[cat] = (expByCategory[cat] || 0) + Number(e.amount); });

    const revByMonth = {};
    revenues.forEach(r => { const m = r.due_date ? (typeof r.due_date === 'string' ? r.due_date.slice(0, 7) : r.due_date.toISOString().slice(0, 7)) : 'N/A'; if (!revByMonth[m]) revByMonth[m] = { paid: 0, pending: 0, overdue: 0 }; if (['pago','recebida'].includes(r.status)) revByMonth[m].paid += Number(r.amount); else if (['vencido','em_atraso'].includes(r.status)) revByMonth[m].overdue += Number(r.amount); else revByMonth[m].pending += Number(r.amount); });

    const revByClient = {};
    revenues.forEach(r => { const name = r.client_name || 'N/A'; if (!revByClient[name]) revByClient[name] = { total: 0, paid: 0, pending: 0, overdue: 0 }; revByClient[name].total += Number(r.amount); if (['pago','recebida'].includes(r.status)) revByClient[name].paid += Number(r.amount); else if (['vencido','em_atraso'].includes(r.status)) revByClient[name].overdue += Number(r.amount); else revByClient[name].pending += Number(r.amount); });

    // ── Overdue per client (inadimplentes do mês atual) ──
    const overdueClients = currentMonthRevenues.filter(r => ['vencido', 'em_atraso'].includes(r.status));
    const overdueByClient = {};
    overdueClients.forEach(r => { const name = r.client_name || 'N/A'; if (!overdueByClient[name]) overdueByClient[name] = { amount: 0, count: 0 }; overdueByClient[name].amount += Number(r.amount); overdueByClient[name].count += 1; });
    const inadimplentesCount = Object.keys(overdueByClient).length;

    // ── MRR (from active contracts with value > 0) ──
    const mrr = contracts.filter(c => Number(c.contract_value) > 0).reduce((s, c) => s + Number(c.contract_value), 0);
    const ticketMedio = contracts.filter(c => Number(c.contract_value) > 0).length > 0 ? mrr / contracts.filter(c => Number(c.contract_value) > 0).length : 0;

    // ── Recordings summary ──
    const recByStatus = {};
    recordings.forEach(r => { recByStatus[r.status] = (recByStatus[r.status] || 0) + 1; });

    // ── Content tasks summary ──
    const tasksByColumn = {};
    contentTasks.forEach(t => { tasksByColumn[t.kanban_column] = (tasksByColumn[t.kanban_column] || 0) + 1; });

    // ── Design tasks summary ──
    const designByColumn = {};
    designTasks.forEach(t => { designByColumn[t.kanban_column] = (designByColumn[t.kanban_column] || 0) + 1; });

    // Build comprehensive context
    const contextData = `## Dados Completos da Agência Pulse — ${fmtDate(now)}

### 📊 FINANCEIRO (a partir de março/2026)
- MRR (Receita Recorrente Mensal): R$ ${fmt(mrr)}
- Ticket Médio: R$ ${fmt(ticketMedio)}
- Receitas pagas: R$ ${fmt(totalRevenuePaid)}
- Receitas pendentes/previstas: R$ ${fmt(totalRevenuePending)}
- Receitas vencidas/em atraso: R$ ${fmt(totalRevenueOverdue)}
- Despesas totais: R$ ${fmt(totalExpenses)}
- Lucro bruto: R$ ${fmt(totalRevenuePaid - totalExpenses)}
- Contratos ativos: ${contracts.length}
- Clientes inadimplentes: ${inadimplentesCount}

Receitas por Mês:
${Object.entries(revByMonth).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12).map(([m, v]) => `- ${m}: Pago R$ ${fmt(v.paid)} | Pendente R$ ${fmt(v.pending)} | Vencido R$ ${fmt(v.overdue)}`).join('\n')}

Despesas por Categoria:
${Object.entries(expByCategory).sort(([, a], [, b]) => b - a).map(([cat, val]) => `- ${cat}: R$ ${fmt(val)}`).join('\n')}

### ⚠️ CLIENTES INADIMPLENTES (${inadimplentesCount} clientes — Total: R$ ${fmt(totalRevenueOverdue)})
${Object.entries(overdueByClient).sort(([, a], [, b]) => b.amount - a.amount).map(([name, v]) => `- ${name}: R$ ${fmt(v.amount)} (${v.count} receita(s) em atraso)`).join('\n') || 'Nenhum cliente inadimplente'}

### 💰 RECEITAS DETALHADAS POR CLIENTE
${Object.entries(revByClient).sort(([, a], [, b]) => b.total - a.total).slice(0, 25).map(([name, v]) => `- ${name}: Total R$ ${fmt(v.total)} | Pago R$ ${fmt(v.paid)} | Pendente R$ ${fmt(v.pending)} | Em atraso R$ ${fmt(v.overdue)}`).join('\n')}

### 📄 TODAS RECEITAS INDIVIDUAIS (${revenues.length})
${revenues.map(r => `- ${r.client_name}: R$ ${fmt(r.amount)} | Venc: ${fmtDate(r.due_date)} | Status: ${r.status}${r.paid_at ? ' | Pago em: ' + fmtDate(r.paid_at) : ''}`).join('\n')}

Contratos Ativos:
${contracts.map(c => `- ${c.client_name}: R$ ${fmt(c.contract_value)}/mês (${c.payment_method}) Dia ${c.due_day} | Plano: ${c.plan_name || 'N/A'} | Início: ${fmtDate(c.contract_start_date)}`).join('\n')}

Contratos Ativos:
${contracts.map(c => `- ${c.client_name}: R$ ${fmt(c.contract_value)}/mês (${c.payment_method}) Dia ${c.due_day} | Plano: ${c.plan_name || 'N/A'}`).join('\n')}

Caixa:
${cashMovements.slice(0, 10).map(m => `- ${fmtDate(m.date)}: ${m.type} R$ ${fmt(m.amount)} - ${m.description}`).join('\n')}

### 👥 CLIENTES (${clients.length} total)
${clients.map(c => `- ${c.company_name} | Plano: ${c.plan_name || 'Sem plano'} | Reels: ${c.weekly_reels}/sem | Criativos: ${c.weekly_creatives}/sem | Stories: ${c.weekly_stories}/sem | Gravações: ${c.monthly_recordings}/mês | Cidade: ${c.city || 'N/A'} | Nicho: ${c.niche || 'N/A'} | Contrato desde: ${fmtDate(c.contract_start_date)}`).join('\n')}

### 📋 PLANOS
${plans.map(p => `- ${p.name}: R$ ${fmt(p.price)} | ${p.description || ''}`).join('\n')}

### 👤 EQUIPE (${profiles.length} membros)
${profiles.map(p => `- ${p.name} (${p.role}) ${p.job_title ? '— ' + p.job_title : ''}`).join('\n')}

### 🎬 GRAVAÇÕES (últimas 200)
Resumo por status: ${Object.entries(recByStatus).map(([s, n]) => `${s}: ${n}`).join(', ') || 'Nenhuma'}
${recordings.slice(0, 30).map(r => `- ${fmtDate(r.date)} ${r.start_time || ''} | ${r.client_name} | Status: ${r.status} | Videomaker: ${r.videomaker_name || 'N/A'} | Tipo: ${r.type || 'fixa'}`).join('\n')}

### 📝 ROTEIROS (${scripts.length})
${scripts.slice(0, 30).map(s => `- ${s.client_name}: "${s.title || 'Sem título'}" | Status: ${s.status || 'rascunho'} | Tipo: ${s.content_type || 'N/A'} | Criado: ${fmtDate(s.created_at)}`).join('\n')}

### 🎯 TAREFAS DE CONTEÚDO (${contentTasks.length})
Por coluna: ${Object.entries(tasksByColumn).map(([col, n]) => `${col}: ${n}`).join(', ') || 'Nenhuma'}
${contentTasks.slice(0, 30).map(t => `- ${t.client_name}: "${t.title}" | Coluna: ${t.kanban_column} | Tipo: ${t.content_type || 'N/A'} | Responsável: ${t.assigned_name || 'N/A'}`).join('\n')}

### 🎨 TAREFAS DE DESIGN (${designTasks.length})
Por coluna: ${Object.entries(designByColumn).map(([col, n]) => `${col}: ${n}`).join(', ') || 'Nenhuma'}
${designTasks.slice(0, 30).map(t => `- ${t.client_name}: "${t.title}" | Coluna: ${t.kanban_column} | Prioridade: ${t.priority || 'normal'} | Designer: ${t.assigned_name || 'N/A'}`).join('\n')}

### 📦 ENTREGAS DO MÊS (${deliveries.length} registros)
${deliveries.slice(0, 30).map(d => `- ${fmtDate(d.date)} | ${d.client_name} | Vídeos: ${d.videos_recorded} | Reels: ${d.reels_produced} | Criativos: ${d.creatives_produced} | Stories: ${d.stories_produced} | Artes: ${d.arts_produced} | Extras: ${d.extras_produced} | Status: ${d.delivery_status}`).join('\n')}

### 📱 POSTAGENS SOCIAL MEDIA (${socialDeliveries.length} neste mês)
${socialDeliveries.slice(0, 40).map(sd => `- ${fmtDate(sd.delivered_at)} | ${sd.client_name} | Tipo: ${sd.content_type || 'N/A'} | Plataforma: ${sd.platform || 'N/A'}`).join('\n')}

### 🌐 CONTEÚDOS DO PORTAL (${portalContents.length})
${portalContents.slice(0, 20).map(pc => `- ${pc.client_name}: "${pc.title}" | Tipo: ${pc.content_type} | Status: ${pc.status} | Temporada: ${pc.season_month}/${pc.season_year}`).join('\n')}

### 🏆 METAS
${goals.map(g => `- ${g.title}: ${g.current_value}/${g.target_value} (${g.status}) | Período: ${fmtDate(g.start_date)} a ${fmtDate(g.end_date)}`).join('\n') || 'Nenhuma meta cadastrada'}

### 🏢 ENDOMARKETING — CONTRATOS (${endoContracts.length})
${endoContracts.map(ec => `- ${ec.client_name}: Pacote "${ec.package_name}" (${ec.package_category || 'N/A'}) | Status: ${ec.status} | Parceiro: ${ec.partner_name || 'N/A'} | Custo parceiro: R$ ${fmt(ec.partner_cost)} | Venda cliente: R$ ${fmt(ec.sale_price)} | Sessões/sem: ${ec.sessions_per_week || 'N/A'} | Duração: ${ec.duration_hours || 'N/A'}h | Início: ${fmtDate(ec.start_date)}`).join('\n') || 'Nenhum contrato de endomarketing'}

### 🏢 ENDOMARKETING — CLIENTES (${endoClientes.length})
${endoClientes.map(ec => `- ${ec.company_name} | Plano: ${ec.plan_type} | Execução: ${ec.execution_type} | Presença: ${ec.presence_days_per_week}x/sem | Stories: ${ec.stories_per_week}/sem | Sessão: ${ec.session_duration}min | Ativo: ${ec.active ? 'Sim' : 'Não'}`).join('\n') || 'Nenhum cliente de endomarketing'}

### 🏢 ENDOMARKETING — PACOTES DISPONÍVEIS (${endoPackages.length})
${endoPackages.map(ep => `- "${ep.package_name}" (${ep.category}) | Sessões: ${ep.sessions_per_week}/sem | Duração: ${ep.duration_hours}h | Stories: ${ep.stories_per_day}/dia | Custo parceiro: R$ ${fmt(ep.partner_cost)}`).join('\n') || 'Nenhum pacote cadastrado'}

### 🏢 ENDOMARKETING — TAREFAS DO PARCEIRO (${endoPartnerTasks.length})
${endoPartnerTasks.slice(0, 50).map(t => `- ${fmtDate(t.date)} ${t.start_time || ''} | ${t.client_name} | Parceiro: ${t.partner_name || 'N/A'} | Tipo: ${t.task_type} | Status: ${t.status} | Duração: ${t.duration_minutes}min`).join('\n') || 'Nenhuma tarefa'}

### 📋 ONBOARDING DE CLIENTES (${onboardingTasks.length})
${onboardingTasks.slice(0, 30).map(ot => `- ${ot.client_name}: ${ot.description || 'Sem descrição'} | Status: ${ot.completed_at ? 'Concluído' : 'Pendente'} | Briefing: ${ot.briefing_completed ? 'Sim' : 'Não'} | Contrato enviado: ${ot.contract_sent ? 'Sim' : 'Não'} | Contrato assinado: ${ot.contract_signed ? 'Sim' : 'Não'} | Criado: ${fmtDate(ot.created_at)}`).join('\n') || 'Nenhuma tarefa de onboarding'}

Clientes com onboarding pendente: ${clients.filter(c => !c.onboarding_completed).map(c => c.company_name).join(', ') || 'Nenhum'}
Clientes com endomarketing: ${clients.filter(c => c.has_endomarketing).map(c => c.company_name).join(', ') || 'Nenhum'}

### 🏅 PONTUAÇÃO DA EQUIPE — MÊS ATUAL (Sistema de esforço por atividade)
**Fórmula de pontuação por cargo:**
- Videomaker: Gravação 15pts, Reels 12pts, Extras 10pts, Endo 8pts, Criativos 6pts, Artes 4pts, Stories 3pts, Espera 2pts/10min
- Editor: Aprovado 15pts, Alteração 8pts, Editando 5pts, Prioritário +5pts, Revisão 3pts
- Designer/Fotógrafo: Concluído 12pts, Urgente +6pts, EmProgresso 4pts, Versão 3pts, Hora 2pts
- Social Media: Publicado 10pts, Postado 8pts, Roteiro 6pts, Agendado 5pts, Gerenciado 2pts
- Parceiro: Concluído 15pts, Hora 5pts, Pendente 3pts

**Ranking atual (${teamScores.length} membros):**
${teamScores.map((s, i) => ` ${i+1}. ${s.name} (${s.role}) — **${s.score} pontos** | ${s.breakdown}`).join('\n') || 'Nenhum membro pontuado'}

### 📜 HISTÓRICO DE AÇÕES RECENTES (${taskHistory.length} ações neste mês)
${taskHistory.slice(0, 50).map(h => `- ${fmtDate(h.created_at)} | ${h.user_name || 'N/A'}: ${h.action}${h.details ? ' — ' + h.details.slice(0, 80) : ''}`).join('\n') || 'Nenhum histórico'}

### ⏳ LOGS DE ESPERA DE VIDEOMAKERS (${waitLogs.length} registros)
${waitLogs.slice(0, 30).map(w => `- Videomaker ID: ${w.videomaker_id} | Duração: ${Math.round((w.wait_duration_seconds || 0) / 60)}min | ${fmtDate(w.created_at)}`).join('\n') || 'Nenhum log de espera'}`;

    const systemPrompt = `Você é o Foguetinho 🚀, o assistente inteligente da Agência Pulse de Marketing Digital. Você tem acesso a TODOS os dados do sistema: financeiro, clientes, contratos, gravações, roteiros, tarefas de conteúdo, design, entregas, postagens, metas, equipe, endomarketing (contratos, clientes, pacotes, tarefas de parceiros), onboarding, e PONTUAÇÃO DE DESEMPENHO da equipe (com detalhamento por atividade e histórico de ações para auditoria antifraude).

CONTEXTO IMPORTANTE:
- O sistema Pulse começou a ser utilizado em MARÇO DE 2026. Dados operacionais anteriores a esta data não existem.
- Apenas contratos financeiros podem ter datas de início anteriores a março/2026 (pois os clientes já existiam antes).
- Ao analisar dados, considere que o histórico começa em março de 2026.

REGRAS:
- Responda em português do Brasil, sempre amigável e profissional
- Use formato brasileiro para números (R$, vírgulas) e datas (dd/mm/aaaa)
- Seja preciso com dados — cite números exatos
- Use markdown para formatar (negrito, listas, tabelas quando útil)
- Quando não tiver dados suficientes, diga claramente
- Sugira insights e recomendações quando pertinente
- Seja conciso mas completo
- Adicione emojis relevantes para deixar as respostas mais visuais
- Você pode cruzar dados entre módulos (ex: receita de um cliente vs entregas feitas)

${contextData}`;

    const normalizedQuestion = String(question)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const isDelinquencyQuestion = /(inadimpl|vencid|em atraso|atrasad)/.test(normalizedQuestion)
      && /(quant|quanto|valor|total|soma|cliente|clientes|quem|quais|lista)/.test(normalizedQuestion);

    if (isDelinquencyQuestion) {
      const overdueList = Object.entries(overdueByClient)
        .sort(([, a], [, b]) => b.amount - a.amount)
        .slice(0, 20)
        .map(([name, v]) => `- ${name}: ${fmtMoney(v.amount)} (${v.count} receita(s))`)
        .join('\n');

      const answer = [
        `Olá! 👋`,
        `Atualmente, temos **${inadimplentesCount} clientes inadimplentes**.`,
        `O valor total em títulos **vencidos e em atraso** é **${fmtMoney(totalRevenueOverdue)}**.`,
        overdueList ? `\n**Clientes inadimplentes:**\n${overdueList}` : '',
        `\n_Esses números foram calculados diretamente dos dados do financeiro._`,
      ].filter(Boolean).join('\n\n');

      await pool.query(
        `INSERT INTO financial_chat_messages (id, user_id, role, content, created_at) VALUES ($1, $2, 'user', $3, NOW()), ($4, $2, 'assistant', $5, NOW() + interval '1 millisecond')`,
        [crypto.randomUUID(), user.id, question, crypto.randomUUID(), answer]
      );

      return res.json({ answer });
    }

    const messages = [{ role: 'system', content: systemPrompt }];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      // Histórico vem do navegador: só papéis de conversa (nunca 'system') e texto limitado
      const safeHistory = conversationHistory
        .filter((msg) => msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string' && msg.content.trim())
        .slice(-10);
      for (const msg of safeHistory) messages.push({ role: msg.role, content: msg.content.slice(0, 4000) });
    }
    messages.push({ role: 'user', content: question });

    // Get API key from local DB — provedor e modelo configurados na tela APIs valem
    // quando o front não manda os seus (sem provedor, getAiConfig ignora a chave do banco).
    const dbApiKeyConfig = apiKeyRes.rows?.[0]?.config;
    const dbApiKey = dbApiKeyConfig?.api_key_encrypted;
    const ai = await resolveAiConfig(aiProvider || dbApiKeyConfig?.ai_provider, dbApiKey);
    const DEFAULT_CHAT_MODELS = { gemini: 'gemini-3.5-flash', openai: 'gpt-4o-mini', claude: 'claude-opus-5-5' };
    const configuredModel = (!dbApiKeyConfig?.ai_provider || dbApiKeyConfig.ai_provider === ai.provider) ? dbApiKeyConfig?.ai_model : null;
    const selectedModel = aiModel || configuredModel || DEFAULT_CHAT_MODELS[ai.provider] || 'gemini-3.5-flash';
    const answer = await callAi(ai, selectedModel, messages, { temperature: 0.3, max_tokens: 3000 });

    // Save chat messages to local DB
    await pool.query(
      `INSERT INTO financial_chat_messages (id, user_id, role, content, created_at) VALUES ($1, $2, 'user', $3, NOW()), ($4, $2, 'assistant', $5, NOW() + interval '1 millisecond')`,
      [crypto.randomUUID(), user.id, question, crypto.randomUUID(), answer]
    );

    res.json({ answer });
  } catch (error) {
    console.error('Financial chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 2. Send WhatsApp ───────────────────────────────────────
// Coloca na fila do WhatsApp próprio. `purpose` diz qual conexão envia (aprovacao, agenda, cobranca, crm, equipe,
// clube, geral); sem ele, o tipo do disparo decide. A resposta volta na hora ("na fila"); o envio sai em segundos
// e o histórico (whatsapp_messages) passa para "sent" ou "failed".
app.post('/api/send-whatsapp', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    if (!(await userHasAnyRole(user, INTERNAL_TEAM_ROLES))) {
      return res.status(403).json({ error: 'Envio de WhatsApp restrito à equipe' });
    }
    const { action, number, message, clientId, triggerType, mediaUrl, mediaFileName, purpose } = req.body || {};
    // escolher a conexão à mão é só do admin (nenhuma tela manda; os outros seguem a função)
    const connectionId = req.body?.connectionId && (await isAdminUser(user)) ? req.body.connectionId : null;
    // anexo só por link http(s); arquivo do próprio servidor pode vir como "/uploads/..."
    let media = mediaUrl ? String(mediaUrl).trim() : '';
    if (media.startsWith('/uploads/')) media = `https://agenciapulse.tech${media}`;
    if (media && !/^https?:\/\/\S/i.test(media)) return res.status(400).json({ error: 'Link do arquivo inválido' });

    if (action === 'test_connection') {
      const { rows } = await pool.query(
        `SELECT name, status, purposes FROM wa_connections WHERE desired = 'ligada' ORDER BY created_at`
      ).catch(() => ({ rows: [] }));
      const connected = rows.filter((r) => r.status === 'conectada');
      return res.json({ success: connected.length > 0, connections: rows });
    }

    if (!number || (!message && !media)) return res.status(400).json({ error: 'number and message are required' });
    const queued = await enqueueWhatsApp(pool, {
      to: number, body: message || '', clientId, triggerType: triggerType || 'manual', purpose,
      sentBy: user.id, mediaUrl: media || null, mediaName: mediaFileName, connectionId,
    });
    res.json({ success: true, status: 'fila', id: queued.id, purpose: queued.purpose });
  } catch (error) {
    console.error('send-whatsapp error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 3. Generate Script ─────────────────────────────────────
const VIDEO_TYPE_STRUCTURES = {
  vendas: `Estrutura GCT (Gancho, Conteúdo, CTA):\n1. GANCHO - Primeiros segundos para capturar atenção.\n2. CONTEÚDO - Apresente produto/serviço, benefícios.\n3. CTA - Direcione para ação.`,
  institucional: `Vídeo Institucional - Fortalecer imagem e transmitir credibilidade.`,
  reconhecimento: `Vídeo de Reconhecimento - Apresentar a empresa.`,
  educacional: `Vídeo Educacional - Ensinar algo relevante.`,
  bastidores: `Vídeo de Bastidores - Mostrar o dia a dia.`,
  depoimento: `Vídeo de Depoimento - Prova social.`,
  lancamento: `Vídeo de Lançamento - Apresentar novidade com impacto.`,
};

const FORMAT_CONTEXT = {
  reels: 'Formato: Reels (vídeo vertical curto, 30-90 segundos)',
  story: 'Formato: Story (vídeo vertical 15-60 segundos)',
  criativo: 'Formato: Criativo/Arte (peça visual estática)',
};

/**
 * Nome de modelo de IA vindo do corpo. Não é lista fixa (o admin escolhe o
 * modelo em Configurações), só o formato: na URL do Gemini não pode ter '/',
 * '?' etc.; OpenAI/Claude/gateway aceitam também 'provedor/modelo'.
 */
function sanitizeAiModelName(model, provider, fallback) {
  let raw = String(model || '').trim();
  if (!raw) return fallback;
  // 'google/gemini-...' (formato de gateway) vira o nome que a URL do Gemini espera
  if (provider === 'gemini') raw = raw.replace(/^(?:google|models)\//i, '');
  const pattern = provider === 'gemini' ? /^[A-Za-z0-9._-]{1,64}$/ : /^[A-Za-z0-9._:\/-]{1,96}$/;
  if (!pattern.test(raw)) throw Object.assign(new Error('Modelo de IA inválido'), { status: 400 });
  return raw;
}

function clipAiText(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) : text;
}

async function requireAiUser(req, res) {
  try {
    await verifyUser(req);
    return true;
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
}

app.post('/api/generate-script', async (req, res) => {
  // Usa a chave paga da agência: só para a equipe logada.
  if (!(await requireAiUser(req, res))) return;
  try {
    const { videoType, contentFormat, aiModel, aiProvider } = req.body;
    const editorial = clipAiText(req.body.editorial, 8000);
    const clientName = clipAiText(req.body.clientName, 200);
    const niche = clipAiText(req.body.niche, 200);
    // Referências: até 5 roteiros de até 4.000 caracteres cada
    const exampleScripts = Array.isArray(req.body.exampleScripts)
      ? req.body.exampleScripts.slice(0, 5).map((ex) => ({
          title: clipAiText(ex?.title, 200),
          videoType: clipAiText(ex?.videoType, 60),
          contentFormat: clipAiText(ex?.contentFormat, 60),
          clientName: clipAiText(ex?.clientName, 200),
          content: clipAiText(ex?.content, 4000),
        }))
      : [];
    const admin = getAdminClient();
    const dbApiKey = await fetchDbApiKey(admin, aiProvider);
    const ai = await resolveAiConfig(aiProvider, dbApiKey);
    const selectedModel = sanitizeAiModelName(aiModel, ai.provider, 'gemini-3.5-flash');
    const structure = VIDEO_TYPE_STRUCTURES[videoType] || VIDEO_TYPE_STRUCTURES.vendas;
    const format = FORMAT_CONTEXT[contentFormat] || FORMAT_CONTEXT.reels;

    let examplesBlock = '';
    if (exampleScripts?.length) {
      examplesBlock = '\n\nROTEIROS DE REFERÊNCIA:\n' + exampleScripts.map((ex, i) => `--- EXEMPLO ${i + 1} ---\nTítulo: ${ex.title}\nTipo: ${ex.videoType} | Formato: ${ex.contentFormat} | Cliente: ${ex.clientName}\nConteúdo:\n${ex.content}\n--- FIM ---`).join('\n\n');
    }

    const systemPrompt = `Você é um redator profissional de conteúdo para redes sociais de uma agência de marketing digital brasileira chamada Pulse.\n\nRegras: CTA conectado, venda sem parecer venda, aspas ("") para falas, [descrição] para cenas/ações.\nResponda com o roteiro completo primeiro, depois "LEGENDA:" seguido da legenda para Instagram.`;
    const userPrompt = `Crie um roteiro completo:\nCLIENTE: ${clientName}\n${niche ? `NICHO: ${niche}` : ''}\n${editorial ? `EDITORIAL:\n${editorial}` : ''}\nTIPO: ${videoType}\n${format}\nESTRUTURA:\n${structure}${examplesBlock}\n\nGere o roteiro + legenda (max 200 chars, com CTA e emojis, sem hashtags).`;

    let scriptContent = '', captionContent = '';

    if (ai.provider === 'gemini') {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${ai.key}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }], generationConfig: { maxOutputTokens: 4096, temperature: 0.8 } }),
      });
      if (!response.ok) throw new Error(`Gemini error [${response.status}]: ${await response.text()}`);
      const data = await response.json();
      const fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const legendaIdx = fullText.lastIndexOf('LEGENDA:');
      if (legendaIdx > -1) { scriptContent = fullText.slice(0, legendaIdx).trim(); captionContent = fullText.slice(legendaIdx + 8).trim(); }
      else scriptContent = fullText;
    } else {
      const answer = await callAi(ai, selectedModel, [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], { temperature: 0.8, max_tokens: 4000 });
      const legendaIdx = answer.lastIndexOf('LEGENDA:');
      if (legendaIdx > -1) { scriptContent = answer.slice(0, legendaIdx).trim(); captionContent = answer.slice(legendaIdx + 8).trim(); }
      else scriptContent = answer;
    }

    res.json({ content: scriptContent, caption: captionContent });
  } catch (error) {
    console.error('Generate script error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ─── 4. Generate Caption ────────────────────────────────────
app.post('/api/generate-caption', async (req, res) => {
  // Usa a chave paga da agência: só para a equipe logada.
  if (!(await requireAiUser(req, res))) return;
  try {
    const { aiModel, aiProvider } = req.body;
    if (!req.body.scriptContent) return res.status(400).json({ error: 'scriptContent is required' });
    const scriptContent = clipAiText(req.body.scriptContent, 20000);
    const clientName = clipAiText(req.body.clientName, 200);
    const niche = clipAiText(req.body.niche, 200);

    const admin = getAdminClient();
    const dbApiKey = await fetchDbApiKey(admin, aiProvider);
    const ai = await resolveAiConfig(aiProvider, dbApiKey);
    const model = sanitizeAiModelName(aiModel, ai.provider, 'gemini-3.5-flash');

    const prompt = `Você é um social media profissional brasileiro. Gere uma LEGENDA curta para Instagram.\nRegras: Máximo 200 chars, CTA, 1-3 emojis, sem hashtags.\n${clientName ? `CLIENTE: ${clientName}` : ''}\n${niche ? `NICHO: ${niche}` : ''}\nROTEIRO:\n${scriptContent}\n\nResponda APENAS com a legenda.`;

    let caption = '';
    if (ai.provider === 'gemini') {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${ai.key}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300, temperature: 0.7 } }),
      });
      if (!response.ok) throw new Error(`Gemini error: ${await response.text()}`);
      const data = await response.json();
      caption = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } else {
      caption = await callAi(ai, model, [{ role: 'user', content: prompt }], { temperature: 0.7, max_tokens: 300, effort: 'low' });
    }
    if (caption.length > 200) caption = caption.slice(0, 197) + '...';
    res.json({ caption });
  } catch (error) {
    console.error('Generate caption error:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});


// ─── 5. Client Portal Auth ──────────────────────────────────
// Senhas do portal: bcrypt. O SHA-256 salgado antigo ('pulse_portal_salt_2026')
// ainda é aceito por verifyPortalPassword e regravado em bcrypt no login.
const PORTAL_LEGACY_PASSWORD_SALT = 'pulse_portal_salt_2026';

/**
 * Verificador só do portal: bcrypt ou o SHA-256 salgado antigo. Não usa o
 * verifyStoredPassword da equipe (texto puro e SHA-256 sem sal): o hash guardado
 * em clients/client_portal_users é legível pela equipe e não pode valer como senha.
 */
async function verifyPortalPassword(rawPassword, passwordHash) {
  const raw = String(rawPassword ?? '');
  const stored = typeof passwordHash === 'string' ? passwordHash.trim() : '';
  if (!raw || !stored) return false;
  try {
    if (stored.startsWith('$2')) return await bcrypt.compare(raw, stored);
    if (!/^[a-f0-9]{64}$/i.test(stored)) return false;
    const salted = crypto.createHash('sha256').update(raw + PORTAL_LEGACY_PASSWORD_SALT).digest();
    return crypto.timingSafeEqual(salted, Buffer.from(stored, 'hex'));
  } catch (error) {
    console.error('[portal-login] falha ao conferir a senha:', error?.message || error);
    return false;
  }
}

// Sessão do portal: o login devolve um token próprio (segredo derivado, sem `sub`),
// exigido em /api/portal-actions e /api/portal-recordings junto com o JWT da equipe.
const PORTAL_JWT_SECRET = process.env.PORTAL_JWT_SECRET
  || crypto.createHash('sha256').update(`${JWT_SECRET}:pulse-portal-session`).digest('hex');
// 'enforce': sem token do portal nem JWT da equipe → 401.
// 'log': só registra e deixa passar — válvula para voltar atrás sem novo deploy.
// Sem PORTAL_AUTH_MODE no .env: 'log' até PORTAL_AUTH_ENFORCE_FROM e 'enforce' depois. A transição
// existe porque abas do portal abertas antes do deploy (bundle antigo, sem token) mostrariam
// "aprovado" sem gravar nada; em dois dias elas já foram recarregadas.
const PORTAL_AUTH_MODE_ENV = String(process.env.PORTAL_AUTH_MODE || '').trim().toLowerCase();
const PORTAL_AUTH_ENFORCE_FROM = Date.parse(process.env.PORTAL_AUTH_ENFORCE_FROM || '2026-10-28T03:00:00Z');
function portalAuthMode() {
  if (PORTAL_AUTH_MODE_ENV === 'log' || PORTAL_AUTH_MODE_ENV === 'enforce') return PORTAL_AUTH_MODE_ENV;
  return Number.isFinite(PORTAL_AUTH_ENFORCE_FROM) && Date.now() < PORTAL_AUTH_ENFORCE_FROM ? 'log' : 'enforce';
}
const portalSession = createPortalSession({
  jwt,
  secret: PORTAL_JWT_SECRET,
  expiresIn: process.env.PORTAL_JWT_EXPIRES_IN || '7d',
});

function resolvePortalCaller(req) {
  return portalSession.resolveCaller(req, verifyUser);
}

/** Sem sessão do portal nem da equipe. Devolve true quando já respondeu 401 (a rota para aí). */
function rejectPortalCallWithoutSession(res, route, action) {
  if (portalAuthMode() === 'log') {
    console.warn(`[Portal-Auth] ${route} sem sessão (action=${action || '-'}) — liberado (modo log)`);
    return false;
  }
  res.status(401).json({ error: 'Sua sessão do portal expirou. Entre de novo.', code: 'portal_session_required' });
  return true;
}

// ── Cidade do cliente nas rotas do portal ──
// O portal não manda x-pulse-city: a cidade vem do cadastro do cliente. Cliente global
// (city NULL) não filtra a equipe e deixa a cidade no DEFAULT da tabela.
async function getPortalClientCity(clientId) {
  if (!clientId) return null;
  const { rows: [row] } = await pool.query('SELECT city::text AS city FROM clients WHERE id = $1', [clientId]);
  return normalizeCityValue(row?.city) || null;
}

// Condição SQL "este usuário atende a cidade $n": vínculo em user_cities, ou sem
// vínculo nenhum (o resolveActiveCity trata esse usuário como Minaçu). Sem cidade, todos.
function portalCityMemberSql(userIdExpr, cityParam) {
  return `(${cityParam}::text IS NULL
    OR EXISTS (SELECT 1 FROM user_cities uc WHERE uc.user_id::text = ${userIdExpr}::text AND uc.city::text = ${cityParam}::text)
    OR (${cityParam}::text = 'minacu' AND NOT EXISTS (SELECT 1 FROM user_cities uc WHERE uc.user_id::text = ${userIdExpr}::text)))`;
}

/**
 * Avisa a equipe (pelos papéis) de algo que aconteceu no portal de um cliente: só quem
 * atende a cidade do cliente (admin e social_media veem todas, como no isAdminUser) e com
 * a cidade gravada na notificação — sem ela, o DEFAULT 'minacu' esconderia o aviso da
 * equipe de Uruaçu.
 */
async function notifyPortalTeam(clientId, roles, title, message, type = 'info', link = null) {
  const city = await getPortalClientCity(clientId).catch(() => null);
  const { rows } = await pool.query(
    `SELECT DISTINCT ur.user_id FROM user_roles ur
      WHERE ur.role::text = ANY($1::text[])
        AND (EXISTS (SELECT 1 FROM user_roles ura WHERE ura.user_id::text = ur.user_id::text AND ura.role::text IN ('admin', 'social_media'))
          OR ${portalCityMemberSql('ur.user_id', '$2')})`,
    [roles, city]
  );
  await insertPortalTeamNotifications(city, rows.map(r => r.user_id), title, message, type, link);
}

/** Grava a notificação para cada usuário, com a cidade do cliente quando houver. */
async function insertPortalTeamNotifications(city, userIds, title, message, type = 'info', link = null) {
  const withCity = !!city && await tableHasCityColumn('notifications');
  for (const userId of userIds) {
    if (!userId) continue;
    await pool.query(
      withCity
        ? `INSERT INTO notifications (user_id, title, message, type, link, city) VALUES ($1, $2, $3, $4, $5, $6)`
        : `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
      withCity ? [userId, title, message, type, link, city] : [userId, title, message, type, link]
    );
  }
}

// ── Aprovação e ajuste do portal → Kanban (content_tasks) ──
// Antes o navegador chamava sync_approval/sync_adjustment depois do approve: se a aba
// fechasse ou a rede caísse no meio, o Kanban não se mexia. Agora vai junto, no servidor.
// teamUser: alguém da equipe aprovando/pedindo ajuste em nome do cliente (fica registrado).
async function insertPortalTaskHistory(taskId, action, details, userId) {
  try {
    await pool.query(`INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)`, [taskId, action, details, userId || null]);
  } catch (err) {
    if (!userId) throw err;
    // user_id que não bate com o cadastro: registra sem ele
    await pool.query(`INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, NULL)`, [taskId, action, details]);
  }
}

// ── Vínculo conteúdo do portal ↔ card do Kanban (client_portal_contents.content_task_id) ──
// Antes o vínculo era só pelo título: dois vídeos com o mesmo título se sobrescreviam, e
// aprovar/excluir um mexia no outro. Coluna aditiva e idempotente, criada na subida. Linhas
// antigas ficam com NULL e continuam casando pelo título (só entre as sem vínculo).
let portalContentTaskLinkPromise = null;
function ensurePortalContentTaskLink() {
  if (!portalContentTaskLinkPromise) {
    portalContentTaskLinkPromise = (async () => {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'client_portal_contents' AND column_name = 'content_task_id'`
      );
      if (!rowCount) {
        const client = await pool.connect();
        try {
          await client.query(`SET lock_timeout = '2s'`);
          await client.query('ALTER TABLE client_portal_contents ADD COLUMN IF NOT EXISTS content_task_id uuid');
        } finally {
          await client.query('RESET lock_timeout').catch(() => {});
          client.release();
        }
        tableColumnsPromiseCache.delete('client_portal_contents');
      }
      await pool.query('CREATE INDEX IF NOT EXISTS idx_client_portal_contents_task ON client_portal_contents(content_task_id)');
      return true;
    })().catch((error) => {
      // Tenta de novo na próxima chamada; enquanto isso, o vínculo segue só pelo título
      portalContentTaskLinkPromise = null;
      console.warn('[portal] client_portal_contents.content_task_id indisponível:', error?.message || error);
      return false;
    });
  }
  return portalContentTaskLinkPromise;
}
// Na subida: cria a coluna (uma vez)
ensurePortalContentTaskLink();

/**
 * Card do Kanban ligado ao conteúdo do portal: primeiro pelo vínculo; sem vínculo (conteúdo
 * antigo), pelo título, como antes.
 */
async function findKanbanTaskForPortalContent(content, columns, extraFields = '') {
  const fields = `id${extraFields ? `, ${extraFields}` : ''}`;
  if (content.content_task_id) {
    const { rows: [linked] } = await pool.query(
      `SELECT ${fields} FROM content_tasks WHERE id = $1 AND kanban_column = ANY($2::text[])`,
      [content.content_task_id, columns]
    );
    // Card ligado mas fora dessas colunas: não cai no título (seria outro card com o mesmo nome)
    return linked || null;
  }
  const { rows: [byTitle] } = await pool.query(
    `SELECT ${fields} FROM content_tasks WHERE client_id = $1 AND title = $2 AND kanban_column = ANY($3::text[]) ORDER BY created_at DESC LIMIT 1`,
    [content.client_id, content.title, columns]
  );
  return byTitle || null;
}

async function syncPortalApprovalToKanban(content, teamUser = null) {
  // Arte enviada pelo detalhe da tarefa de design: quem anda é o card de design (/designer).
  const designTask = await findPortalContentDesignTask(content);
  if (designTask) {
    const result = await approveDesignTaskFromPortal(designTask.id, content.client_id, teamUser);
    if (result.status === 'ok' || result.status === 'already') return;
  }
  const task = await findKanbanTaskForPortalContent(content, ['envio', 'agendamentos']);
  if (task) {
    await pool.query(`UPDATE content_tasks SET kanban_column = 'agendamentos', approved_at = NOW(), updated_at = NOW() WHERE id = $1`, [task.id]);
    await insertPortalTaskHistory(task.id, teamUser ? '✅ Aprovado pela equipe em nome do cliente (Pulse Club)' : '✅ Aprovado pelo cliente via Pulse Club', null, teamUser?.id);
  }
  await notifyPortalTeam(content.client_id, ['admin', 'social_media'],
    teamUser ? '✅ Conteúdo aprovado pela equipe' : '✅ Conteúdo aprovado pelo cliente',
    teamUser ? `"${content.title}" foi aprovado pela equipe em nome do cliente no Pulse Club` : `"${content.title}" foi aprovado no Pulse Club`,
    'approval', '/conteudo');
}

async function syncPortalAdjustmentToKanban(content, note, teamUser = null) {
  // Arte enviada pelo detalhe da tarefa de design: o card de design vai para Ajustes e a designer é avisada.
  const designTask = await findPortalContentDesignTask(content);
  if (designTask) {
    const result = await requestDesignAdjustmentFromPortal(designTask.id, content.client_id, note, teamUser);
    if (result.status === 'ok' || result.status === 'already') return;
  }
  const task = await findKanbanTaskForPortalContent(content, ['envio', 'agendamentos'], 'assigned_to, edited_by');
  const shortNote = String(note || '').substring(0, 80);
  if (task) {
    await pool.query(`UPDATE content_tasks SET kanban_column = 'alteracao', adjustment_notes = $1, updated_at = NOW() WHERE id = $2`, [note, task.id]);
    await insertPortalTaskHistory(task.id, teamUser ? '🔧 Ajuste solicitado pela equipe no Pulse Club' : '🔧 Ajuste solicitado pelo cliente via Pulse Club', note, teamUser?.id);
    // Quem corrige é o editor do vídeo (edited_by): o assigned_to chega zerado do envio
    const editorToNotify = task.edited_by || task.assigned_to;
    if (editorToNotify) {
      await insertPortalTeamNotifications(await getPortalClientCity(content.client_id), [editorToNotify],
        teamUser ? '🔧 Ajuste solicitado pela equipe' : '🔧 Ajuste solicitado pelo cliente',
        `"${content.title}" precisa de ajustes: ${shortNote}`, 'adjustment', '/edicao/kanban');
    }
  }
  await notifyPortalTeam(content.client_id, ['admin', 'social_media'], '🔧 Ajuste solicitado no Pulse Club',
    `${teamUser ? 'Equipe' : 'Cliente'} solicitou ajuste em "${content.title}": ${shortNote}`, 'adjustment', '/entregas-social');
}

// Histórico de arte gravado pelo portal: herda a cidade do próprio card. Sem isso ficava
// no DEFAULT 'minacu' e o histórico de um cliente de Uruaçu sumia da tela de Uruaçu.
async function insertDesignTaskHistoryFromPortal(taskId, action, details = null) {
  if (await tableHasCityColumn('design_task_history')) {
    await pool.query(
      `INSERT INTO design_task_history (task_id, action, details, city)
       SELECT $1, $2, $3, dt.city FROM design_tasks dt WHERE dt.id = $1`,
      [taskId, action, details]
    );
    return;
  }
  await pool.query(`INSERT INTO design_task_history (task_id, action, details) VALUES ($1, $2, $3)`, [taskId, action, details]);
}

// ── Arte (design_tasks) aprovada ou com ajuste pedido no portal ──
// Usado pela aba Designer do portal (approve_design_task / request_design_adjustment) e pela
// biblioteca de conteúdos (approve / request_adjustment de um conteúdo "Arte: ..." ligado ao
// card). Só mexe em arte aguardando o cliente; o clique repetido não grava nem avisa de novo.
// Devolve { status: 'ok' | 'already' | 'not_found' | 'conflict' }.

// Vínculo do conteúdo do portal com o card de design (gravado pelo "Enviar via WhatsApp").
let portalContentDesignLinkPromise = null;
function ensurePortalContentDesignLink() {
  if (!portalContentDesignLinkPromise) {
    portalContentDesignLinkPromise = pool.query(`
      ALTER TABLE client_portal_contents ADD COLUMN IF NOT EXISTS design_task_id UUID;
      CREATE INDEX IF NOT EXISTS idx_client_portal_contents_design_task
        ON client_portal_contents (design_task_id) WHERE design_task_id IS NOT NULL;
    `).catch((error) => {
      portalContentDesignLinkPromise = null;
      throw error;
    });
  }
  return portalContentDesignLinkPromise;
}

ensurePortalContentDesignLink().catch((error) => {
  console.error('Failed to ensure client_portal_contents.design_task_id:', error?.message || error);
});

async function portalContentsHaveDesignLink() {
  const columns = await getExistingColumns('client_portal_contents').catch(() => null);
  return !!columns?.has('design_task_id');
}

/** Card de design de um conteúdo do portal: pelo vínculo ou, no legado, pelo título exato "Arte: <título>". */
async function findPortalContentDesignTask(content) {
  if (!content?.id || !content.client_id) return null;
  if (await portalContentsHaveDesignLink()) {
    const { rows: [linked] } = await pool.query(
      'SELECT design_task_id FROM client_portal_contents WHERE id = $1 AND design_task_id IS NOT NULL',
      [content.id]
    );
    if (linked) return { id: linked.design_task_id };
  }
  const title = String(content.title || '');
  if (!title.startsWith('Arte: ')) return null;
  const { rows: [legacy] } = await pool.query(
    `SELECT id FROM design_tasks
      WHERE client_id = $1 AND title = $2 AND kanban_column = 'enviar_cliente'
      ORDER BY updated_at DESC LIMIT 1`,
    [content.client_id, title.slice('Arte: '.length)]
  );
  return legacy || null;
}

/** Conteúdos do portal ligados ao card acompanham a decisão (senão a biblioteca seguia 'pendente'). */
async function syncLinkedPortalArtContents(taskId, status) {
  try {
    if (!(await portalContentsHaveDesignLink())) return;
    if (status === 'aprovado') {
      await pool.query(
        `UPDATE client_portal_contents SET status = 'aprovado', approved_at = NOW(), updated_at = NOW()
          WHERE design_task_id = $1 AND status NOT IN ('aprovado', 'revisao_interna')`,
        [taskId]
      );
    } else {
      await pool.query(
        `UPDATE client_portal_contents SET status = 'ajuste_solicitado', updated_at = NOW()
          WHERE design_task_id = $1 AND status = 'pendente'`,
        [taskId]
      );
    }
  } catch (err) {
    console.error('[portal-actions] falha ao atualizar a arte na biblioteca do portal', taskId, err?.message || err);
  }
}

async function getPortalDesignTaskState(taskId, scopeClientId) {
  const { rows: [current] } = await pool.query(
    'SELECT kanban_column FROM design_tasks WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid)', [taskId, scopeClientId]
  );
  return current || null;
}

async function approveDesignTaskFromPortal(taskId, scopeClientId, teamUser = null) {
  const { rows: [approved] } = await pool.query(
    `UPDATE design_tasks SET kanban_column = 'aprovado', client_approved_at = NOW(), completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid) AND kanban_column = 'enviar_cliente'
      RETURNING title, client_id`,
    [taskId, scopeClientId]
  );
  if (!approved) {
    const current = await getPortalDesignTaskState(taskId, scopeClientId);
    if (!current) return { status: 'not_found' };
    return { status: current.kanban_column === 'aprovado' ? 'already' : 'conflict' };
  }
  await insertDesignTaskHistoryFromPortal(taskId, teamUser ? '✅ Aprovado pela equipe em nome do cliente (Pulse Club)' : '✅ Aprovado pelo cliente via Pulse Club');
  await syncLinkedPortalArtContents(taskId, 'aprovado');
  // Notify designers
  await notifyPortalTeam(approved.client_id, ['admin', 'fotografo', 'designer'], '✅ Arte aprovada pelo cliente', `"${approved.title || 'Arte'}" foi aprovada no Pulse Club`, 'design', '/designer');
  return { status: 'ok' };
}

async function requestDesignAdjustmentFromPortal(taskId, scopeClientId, note, teamUser = null) {
  const { rows: [adjusted] } = await pool.query(
    `UPDATE design_tasks SET kanban_column = 'ajustes', observations = $1, updated_at = NOW()
      WHERE id = $2 AND ($3::uuid IS NULL OR client_id = $3::uuid) AND kanban_column = 'enviar_cliente'
      RETURNING title, client_id`,
    [note, taskId, scopeClientId]
  );
  if (!adjusted) {
    const current = await getPortalDesignTaskState(taskId, scopeClientId);
    if (!current) return { status: 'not_found' };
    return { status: current.kanban_column === 'ajustes' ? 'already' : 'conflict' };
  }
  await insertDesignTaskHistoryFromPortal(taskId, teamUser ? '🔧 Ajuste solicitado pela equipe no Pulse Club' : '🔧 Ajuste solicitado pelo cliente via Pulse Club', note);
  await syncLinkedPortalArtContents(taskId, 'ajuste_solicitado');
  // Notify designers
  await notifyPortalTeam(adjusted.client_id, ['admin', 'fotografo', 'designer'], '🔧 Ajuste solicitado na arte', `${teamUser ? 'Equipe' : 'Cliente'} pediu ajuste em "${adjusted.title || 'Arte'}": ${(note || '').substring(0, 80)}`, 'design', '/designer');
  return { status: 'ok' };
}

// Ensure client_portal_users table exists (multi-user per company)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_portal_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(username)
      );
    `);
    // Migrate existing credentials from clients table
    await pool.query(`
      INSERT INTO client_portal_users (client_id, username, display_name, password_hash)
      SELECT id, client_login, company_name, client_password_hash
      FROM clients
      WHERE client_login IS NOT NULL AND client_login != '' AND client_password_hash IS NOT NULL AND client_password_hash != ''
      ON CONFLICT (username) DO NOTHING;
    `);
    console.log('[Portal] client_portal_users table ready');
  } catch (err) {
    console.error('[Portal] Error creating client_portal_users:', err.message);
  }
})();

app.post('/api/client-portal-auth', async (req, res) => {
  try {
    const { action, login, password, client_id, slug, display_name } = req.body;

    if (action === 'login') {
      if (!login || !password) return res.status(400).json({ error: 'Login e senha obrigatórios' });
      const attemptKey = loginAttemptKey('portal', login);
      const retryAfter = loginRetryAfterSeconds(attemptKey);
      if (retryAfter > 0) return sendTooManyLoginAttempts(res, retryAfter);
      // Mesma resposta para login inexistente e senha errada (não revela quais logins existem)
      const invalidLogin = () => {
        registerLoginFailure(attemptKey);
        return res.status(401).json({ error: 'Login ou senha inválidos' });
      };
      // Search in client_portal_users first, fallback to clients table
      const { rows: [portalUser] } = await pool.query(
        `SELECT cpu.id as user_id, cpu.client_id, cpu.username, cpu.display_name, cpu.password_hash, c.company_name, c.color, c.logo_url
         FROM client_portal_users cpu
         JOIN clients c ON c.id = cpu.client_id
         WHERE cpu.username = $1`,
        [login.trim()]
      );
      if (portalUser) {
        // Aceita bcrypt e o SHA-256 salgado antigo; no primeiro login certo regrava em bcrypt
        if (!(await verifyPortalPassword(password, portalUser.password_hash))) return invalidLogin();
        clearLoginFailures(attemptKey);
        if (!String(portalUser.password_hash || '').startsWith('$2')) {
          const upgraded = await bcrypt.hash(password, 12);
          await pool.query('UPDATE client_portal_users SET password_hash = $1 WHERE id = $2', [upgraded, portalUser.user_id])
            .catch((error) => console.warn('[portal-login] falha ao migrar hash para bcrypt:', error?.message || error));
        }
        return res.json({ success: true, client_id: portalUser.client_id, company_name: portalUser.company_name, color: portalUser.color, logo_url: portalUser.logo_url, display_name: portalUser.display_name, portal_user_id: portalUser.user_id, portal_token: portalSession.sign({ clientId: portalUser.client_id, portalUserId: portalUser.user_id }) });
      }
      // Fallback: legacy login on clients table
      const { rows: [client] } = await pool.query(
        `SELECT id, company_name, client_login, client_password_hash, color, logo_url FROM clients WHERE client_login = $1`,
        [login.trim()]
      );
      if (!client) return invalidLogin();
      if (!(await verifyPortalPassword(password, client.client_password_hash))) return invalidLogin();
      clearLoginFailures(attemptKey);
      return res.json({ success: true, client_id: client.id, company_name: client.company_name, color: client.color, logo_url: client.logo_url, display_name: client.company_name, portal_token: portalSession.sign({ clientId: client.id }) });
    }

    if (action === 'register') {
      if (!client_id || !login || !password) return res.status(400).json({ error: 'Dados incompletos' });
      // Check client exists
      const { rows: [clientRow] } = await pool.query(`SELECT id, company_name FROM clients WHERE id = $1`, [client_id]);
      if (!clientRow) return res.status(404).json({ error: 'Cliente não encontrado' });
      // Check username not taken
      const { rows: taken } = await pool.query(`SELECT id FROM client_portal_users WHERE username = $1`, [login.trim()]);
      if (taken.length > 0) return res.status(409).json({ error: 'Nome de usuário já em uso' });
      // Senhas novas do portal já nascem em bcrypt (o login aceita os dois formatos)
      const passwordHash = await bcrypt.hash(String(password), 12);
      const name = (display_name || login).trim();
      const { rows: [newPortalUser] } = await pool.query(
        `INSERT INTO client_portal_users (client_id, username, display_name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
        [client_id, login.trim(), name, passwordHash]
      );
      return res.json({ success: true, client_id, company_name: clientRow.company_name, display_name: name, portal_token: portalSession.sign({ clientId: clientRow.id, portalUserId: newPortalUser?.id }) });
    }

    if (action === 'get_info') {
      if (!client_id && !slug) return res.status(400).json({ error: 'client_id or slug required' });
      let query, params;
      if (client_id) {
        query = `SELECT id, company_name, color, logo_url, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id, show_metrics, has_vehicle_flyer, niche, whatsapp, city FROM clients WHERE id = $1`;
        params = [client_id];
      } else {
        query = `
          SELECT id, company_name, color, logo_url, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id, show_metrics, has_vehicle_flyer, niche, whatsapp, city
          FROM clients
          WHERE trim(both '-' from regexp_replace(lower(trim(company_name)), '\\s+', '-', 'g')) = trim(both '-' from regexp_replace(lower(trim($1)), '\\s+', '-', 'g'))
             OR lower(trim(company_name)) = lower(trim(replace($1, '-', ' ')))
          LIMIT 1
        `;
        params = [slug];
      }
      const { rows: [data] } = await pool.query(query, params);
      if (!data) return res.status(404).json({ error: 'Cliente não encontrado' });
      // Pelo slug (tela de login): só a marca. O id do cliente não sai antes do login.
      if (!client_id) return res.json({ company_name: data.company_name, color: data.color, logo_url: data.logo_url });
      // Count existing portal users for this client
      const { rows: [countRow] } = await pool.query(`SELECT count(*)::int as total FROM client_portal_users WHERE client_id = $1`, [data.id]);
      return res.json({ id: data.id, company_name: data.company_name, color: data.color, logo_url: data.logo_url, registered_users: countRow?.total || 0, weekly_reels: data.weekly_reels, weekly_creatives: data.weekly_creatives, weekly_stories: data.weekly_stories, monthly_recordings: data.monthly_recordings, plan_id: data.plan_id, show_metrics: data.show_metrics, has_vehicle_flyer: data.has_vehicle_flyer, niche: data.niche, whatsapp: data.whatsapp, city: data.city });
    }

    if (action === 'get_contents') {
      const caller = await resolvePortalCaller(req);
      if (!caller && rejectPortalCallWithoutSession(res, 'client-portal-auth', action)) return;
      const contentsClientId = effectiveClientId(caller, client_id);
      if (!contentsClientId) return res.status(400).json({ error: 'client_id required' });
      // 'revisao_interna' (vídeo ainda não liberado) só vai para a equipe.
      const { rows } = await pool.query(
        `SELECT * FROM client_portal_contents WHERE client_id = $1 AND ($2::boolean OR status <> 'revisao_interna') ORDER BY created_at DESC`,
        [contentsClientId, caller?.kind === 'team']
      );
      return res.json({ contents: rows || [] });
    }

    if (action === 'list_users') {
      // Lista os logins do cliente: só para a equipe.
      const caller = await resolvePortalCaller(req);
      if (caller?.kind !== 'team') return res.status(401).json({ error: 'Unauthorized' });
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows } = await pool.query(
        `SELECT id, username, display_name, created_at FROM client_portal_users WHERE client_id = $1 ORDER BY created_at`,
        [client_id]
      );
      return res.json({ users: rows });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Portal auth error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 5b. Portal Actions (no JWT required — client-facing) ───

// ── PUBLIC CLIENT BRIEFING (no JWT required — accessed via direct link by the client) ──
app.all('/api/client-briefing', async (req, res) => {
  try {
    if (req.method === 'GET') {
      const clientId = req.query.clientId;
      if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
      if (!UUID_RE.test(String(clientId))) return res.status(404).json({ error: 'Client not found' });
      const { rows } = await pool.query(
        `SELECT id, company_name, responsible_person, color, logo_url, briefing_data
         FROM clients WHERE id = $1 LIMIT 1`, [clientId]
      );
      const client = rows[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });
      // Link público (só o id do cliente): o formulário volta sem as senhas; o POST mantém as salvas.
      client.briefing_data = withoutBriefingSecrets(client.briefing_data);

      let briefingCompleted = false;
      try {
        const { rows: tasks } = await pool.query(
          `SELECT briefing_completed FROM onboarding_tasks WHERE client_id = $1 AND stage = 'briefing' LIMIT 1`,
          [clientId]
        );
        if (tasks[0]?.briefing_completed) briefingCompleted = true;
      } catch (_) { /* table may not exist */ }

      return res.json({ client, briefingCompleted });
    }

    if (req.method === 'POST') {
      const { clientId, briefing_data, editorial, use_real_photos } = req.body || {};
      if (!clientId) return res.status(400).json({ error: 'Missing clientId' });

      // 🔒 valida formato UUID — evita IDs forjados/colados de outros sistemas
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(String(clientId))) {
        return res.status(400).json({ error: 'Invalid clientId format' });
      }

      // 🔒 confirma que o cliente realmente existe antes de qualquer escrita
      const { rows: existing } = await pool.query(
        'SELECT id, briefing_data FROM clients WHERE id = $1 LIMIT 1',
        [clientId]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // 📚 histórico de versões: permite reenvio (não bloqueia mais), grava snapshot
      const prev = existing[0].briefing_data;
      const prevObj = typeof prev === 'string' ? (() => { try { return JSON.parse(prev); } catch { return null; } })() : prev;

      // Calcula próxima versão a partir do histórico existente
      let nextVersion = 1;
      try {
        const { rows: vRows } = await pool.query(
          'SELECT COALESCE(MAX(version), 0) + 1 AS next FROM briefing_versions WHERE client_id = $1',
          [clientId]
        );
        nextVersion = vRows[0]?.next || 1;
      } catch (_) { /* tabela pode não existir ainda */ }

      // Reforça que clientId/_completed dentro do payload batem com a URL + versão
      const incoming = mergeBriefingSecrets((briefing_data && typeof briefing_data === 'object') ? briefing_data : {}, prevObj);
      // Preserva o tipo do briefing entre reenvios (padrão x provedor de internet)
      const briefingType = incoming._type || prevObj?._type || 'padrao';

      const safePayload = {
        ...incoming,
        _type: briefingType,
        _clientId: clientId,
        _completed: true,
        _submittedAt: new Date().toISOString(),
        _version: nextVersion,
      };

      // 🌐 Briefing de provedor de internet: normaliza campos para consulta posterior
      if (briefingType === 'provedor_internet') {
        const txt = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
        const PROVIDER_TEXT_FIELDS = [
          'cities', 'plans', 'mainDifferential', 'teamVideos', 'teamVideosDetails',
          'influencerBudget', 'externalMarketingBudget', 'metaAdsBudget', 'competitors',
          'targetAudience', 'currentDifficulties', 'growthGoals', 'socialLinks',
          'visualIdentity', 'additionalNotes',
        ];
        for (const f of PROVIDER_TEXT_FIELDS) safePayload[f] = txt(incoming[f]);
        safePayload.marketingChannels = Array.isArray(incoming.marketingChannels)
          ? incoming.marketingChannels.map(txt).filter(Boolean)
          : [];
      }


      // Link público: o resumo vem como texto (markdown). Tira tags HTML para não virar
      // script na tela da equipe, sem escapar (Roteiros, IA e PDF leem como texto).
      const safeEditorial = String(editorial || '').replace(/<[^>]*>/g, '').slice(0, 20000);

      // A linha editorial só é preenchida com o resumo quando ainda está vazia: um reenvio
      // não sobrescreve a editorial que a equipe já redigiu (o resumo fica na versão).
      await pool.query(
        `UPDATE clients SET briefing_data = $1, editorial = COALESCE(NULLIF(editorial, ''), $2), updated_at = now() WHERE id = $3`,
        [JSON.stringify(safePayload), safeEditorial, clientId]
      );

      // Snapshot da versão
      try {
        await pool.query(
          `INSERT INTO briefing_versions (client_id, version, briefing_data, editorial, submitted_at)
           VALUES ($1, $2, $3, $4, now())`,
          [clientId, nextVersion, JSON.stringify(safePayload), safeEditorial]
        );
      } catch (e) { console.warn('briefing version snapshot failed:', e?.message); }

      try {
        // 🔒 só atualiza onboarding_tasks que pertencem AO MESMO client_id (escopo já correto + guardrail extra)
        const { rows: tasks } = await pool.query(
          `SELECT id, client_id FROM onboarding_tasks WHERE client_id = $1 AND stage = 'briefing' LIMIT 1`, [clientId]
        );
        if (tasks[0]?.id && tasks[0].client_id === clientId) {
          await pool.query(
            `UPDATE onboarding_tasks SET briefing_data = $1, briefing_completed = true,
             use_real_photos = $2, status = 'concluido', completed_at = now(), updated_at = now()
             WHERE id = $3 AND client_id = $4`,
            [JSON.stringify(safePayload), !!use_real_photos, tasks[0].id, clientId]
          );
        }
      } catch (_) { /* optional */ }

      // 📣 Notifica admin + social_media que o briefing foi finalizado e o PDF está pronto
      try {
        const { rows: [clientInfo] } = await pool.query(
          'SELECT company_name FROM clients WHERE id = $1', [clientId]
        );
        const companyName = clientInfo?.company_name || 'Cliente';
        const { rows: notifUsers } = await pool.query(
          `SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`
        );
        for (const u of notifUsers) {
          await pool.query(
            `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
            [
              u.user_id,
              `📋 Briefing ${nextVersion > 1 ? `atualizado (v${nextVersion})` : 'finalizado'}`,
              `${companyName} ${nextVersion > 1 ? 'atualizou' : 'concluiu'} o briefing. PDF disponível para download.`,
              'briefing',
              `/clientes?clientId=${clientId}&tab=briefing`
            ]
          );
        }
      } catch (e) { console.warn('briefing notify failed:', e?.message); }

      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Client briefing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── BRIEFING VERSIONS (admin/social_media) ──
app.get('/api/briefing-versions', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const { clientId } = req.query;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!clientId || !UUID_RE.test(String(clientId))) {
      return res.status(400).json({ error: 'Invalid clientId' });
    }
    const { rows } = await pool.query(
      `SELECT id, version, briefing_data, editorial, submitted_at
       FROM briefing_versions
       WHERE client_id = $1
       ORDER BY version DESC`,
      [clientId]
    );
    if (!(await isTeamManagerUser(user))) stripBriefingSecretsFromRows(rows, ['briefing_versions']);
    return res.json({ versions: rows });
  } catch (err) {
    console.error('briefing-versions error:', err);
    res.status(err?.status || 500).json({ error: err.message || 'Server error' });
  }
});
// ─── Receitas previstas da proposta aceita ───
// Geradas no servidor, uma vez só por proposta: o UPDATE ... WHERE revenues_generated_at IS NULL
// reserva a proposta dentro da transação, então dois cliques, duas abas ou o aceite repetido
// não duplicam as receitas. Antes o navegador de quem abrisse /propostas gerava (e duplicava)
// e gravava a marca em observations, que o cliente via na página pública.
async function generateProposalRevenues(proposalId) {
  await ensureProposalRevenueColumn();
  await ensureRecurringRevenuesTables();
  const revenuesHaveCity = await tableHasCityColumn('revenues');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows } = await db.query(
      `UPDATE commercial_proposals SET revenues_generated_at = now()
        WHERE id = $1 AND status = 'aceita' AND revenues_generated_at IS NULL
          AND COALESCE(observations, '') NOT LIKE '%[RECEITAS GERADAS%'
        RETURNING *`,
      [proposalId]
    );
    if (!rows.length) {
      await db.query('ROLLBACK');
      return { created: 0, reason: 'already_generated_or_not_accepted' };
    }
    const proposal = rows[0];
    const startDate = brtDateString(proposal.client_response_at ? new Date(proposal.client_response_at) : new Date());
    const schedule = buildProposalRevenueSchedule(proposal, startDate);
    if (!schedule.length) {
      // Sem valor: não marca, para dar para gerar depois de corrigir a proposta.
      await db.query('ROLLBACK');
      return { created: 0, reason: 'no_value' };
    }
    // revenues é separada por cidade: vale a cidade da proposta.
    const city = assertValidCity(proposal.city || 'minacu');
    for (const item of schedule) {
      if (revenuesHaveCity) {
        await db.query(
          `INSERT INTO revenues (client_id, contract_id, reference_month, amount, due_date, status, description, city)
           VALUES (NULL, NULL, $1, $2, $3, 'prevista', $4, $5)`,
          [item.reference_month, item.amount, item.due_date, item.description, city]
        );
      } else {
        await db.query(
          `INSERT INTO revenues (client_id, contract_id, reference_month, amount, due_date, status, description)
           VALUES (NULL, NULL, $1, $2, $3, 'prevista', $4)`,
          [item.reference_month, item.amount, item.due_date, item.description]
        );
      }
    }
    await db.query('COMMIT');
    return {
      created: schedule.length,
      total: Math.round(schedule.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
      first_amount: schedule[0].amount,
    };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

// Botão "Gerar Receitas" da tela de propostas (proposta aceita cujas receitas ainda não saíram).
// Mesmo nível do lançamento de receitas no /api/db/query (revenues: 'team').
app.post('/api/commercial-proposals/:id/generate-revenues', async (req, res) => {
  try {
    await verifyTeamManager(req);
  } catch (e) {
    return res.status(e.message === 'Admin access required' ? 403 : 401).json({ error: e.message });
  }
  try {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ error: 'Proposta inválida' });
    }
    const result = await generateProposalRevenues(id);
    res.json(result);
  } catch (e) {
    console.error('[generate-revenues] error:', e);
    res.status(e?.statusCode || 500).json({ error: e.message || 'Erro ao gerar receitas' });
  }
});

app.post('/api/public-proposal', async (req, res) => {
  try {
    await ensureProposalTables();
    const { action, token, proposal_id, author_name, message, status, response_note } = req.body;

    if (action === 'get_proposal') {
      if (!token) return res.status(400).json({ error: 'token required' });
      const { rows } = await pool.query('SELECT * FROM commercial_proposals WHERE token = $1 LIMIT 1', [token]);
      const proposal = rows[0] || null;
      if (proposal) {
        // Controle interno das receitas: o cliente não vê a marca antiga nem a data.
        proposal.observations = stripRevenueMark(proposal.observations);
        delete proposal.revenues_generated_at;
      }
      return res.json({ proposal });
    }

    if (action === 'get_clients') {
      // Vitrine de logos da proposta: sem o id (o id do cliente abre o portal).
      const { rows } = await pool.query('SELECT company_name, logo_url, color FROM clients WHERE status = $1 ORDER BY company_name', ['ativo']);
      return res.json({ clients: rows });
    }

    if (action === 'get_comments') {
      if (!token) return res.status(400).json({ error: 'token required' });
      const { rows: propRows } = await pool.query('SELECT id FROM commercial_proposals WHERE token = $1 LIMIT 1', [token]);
      if (propRows.length === 0) return res.json({ comments: [] });
      const { rows } = await pool.query('SELECT * FROM proposal_comments WHERE proposal_id = $1 ORDER BY created_at ASC', [propRows[0].id]);
      return res.json({ comments: rows });
    }

    if (action === 'add_comment') {
      if (!token || !author_name || !message) return res.status(400).json({ error: 'token, author_name, message required' });
      const { rows: propRows } = await pool.query('SELECT id FROM commercial_proposals WHERE token = $1 LIMIT 1', [token]);
      if (propRows.length === 0) return res.status(404).json({ error: 'Proposta não encontrada' });
      await pool.query(
        'INSERT INTO proposal_comments (proposal_id, author_name, message) VALUES ($1, $2, $3)',
        [propRows[0].id, author_name, message]
      );
      return res.json({ ok: true });
    }

    if (action === 'respond') {
      if (!token || !status) return res.status(400).json({ error: 'token, status required' });
      if (status !== 'aceita' && status !== 'recusada') return res.status(400).json({ error: 'invalid status' });
      // Só responde proposta pendente (a página só mostra os botões nesse caso): uma aba antiga
      // não troca uma resposta já dada.
      const { rows: updated } = await pool.query(
        `UPDATE commercial_proposals SET status = $1, client_response_at = NOW(), client_response_note = $2
          WHERE token = $3 AND status = 'pendente' RETURNING id`,
        [status, response_note || null, token]
      );
      if (!updated.length) {
        const { rows: existing } = await pool.query('SELECT status FROM commercial_proposals WHERE token = $1 LIMIT 1', [token]);
        if (!existing.length) return res.status(404).json({ error: 'Proposta não encontrada' });
        if (existing[0].status === status) return res.json({ ok: true, already: true });
        return res.status(409).json({ error: `Esta proposta já foi ${existing[0].status === 'aceita' ? 'aceita' : 'respondida'}.`, status: existing[0].status });
      }
      if (status === 'aceita') {
        // A falha aqui não desfaz o aceite: a equipe gera pelo botão "Gerar Receitas".
        try {
          await generateProposalRevenues(updated[0].id);
        } catch (e) {
          console.error('[public-proposal] generate revenues failed:', e?.message || e);
        }
      }
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('[public-proposal] error:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
});

app.post('/api/portal-actions', async (req, res) => {
  try {
    const { action, content_id, message } = req.body;

    // Sessão: cliente logado no portal (x-portal-token) ou equipe (JWT). O cliente
    // só enxerga o próprio client_id (o do token; o do corpo é ignorado).
    const caller = await resolvePortalCaller(req);
    if (!caller && rejectPortalCallWithoutSession(res, 'portal-actions', action)) return;
    const isTeamCaller = caller?.kind === 'team';
    const client_id = effectiveClientId(caller, req.body.client_id);
    // Filtro das ações por id de item (conteúdo, comentário, arte, panfleto, notificação).
    const scopeClientId = itemScopeClientId(caller, req.body.client_id);
    // Cliente não assina como equipe: comentário e ajuste do cliente saem sempre como 'client'.
    const author_type = isTeamCaller ? req.body.author_type : 'client';
    const author_id = isTeamCaller ? req.body.author_id : null;
    const author_name = req.body.author_name;

    // ── Get client info ──
    if (action === 'get_client') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_id);
      const selectClause = await getPortalClientSelectClause();
      let query, params;
      if (isUUID) {
        query = `SELECT ${selectClause} FROM clients WHERE id = $1 LIMIT 1`;
        params = [client_id];
      } else {
        query = `SELECT ${selectClause} FROM clients WHERE trim(both '-' from regexp_replace(lower(trim(company_name)), '\\s+', '-', 'g')) = trim(both '-' from regexp_replace(lower(trim($1)), '\\s+', '-', 'g')) LIMIT 1`;
        params = [client_id];
      }
      const { rows } = await pool.query(query, params);
      if (rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
      return res.json({ client: rows[0] });
    }

    // ── Checklist de entregas (aba 'Entregas' do cliente sem contrato): só leitura ──
    if (action === 'get_proposal_checklist') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows } = await pool.query(
        `SELECT id, client_id, title, description, is_completed, completed_at, sort_order
           FROM proposal_checklist_items WHERE client_id = $1 ORDER BY sort_order ASC`,
        [client_id]
      ).catch((err) => (err?.code === '42P01' ? { rows: [] } : Promise.reject(err)));
      return res.json({ items: rows });
    }

    // ── Get portal contents ──
    if (action === 'get_contents') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      // 'revisao_interna' (vídeo ainda não liberado) só vai para a equipe.
      const { rows } = await pool.query(
        `SELECT * FROM client_portal_contents WHERE client_id = $1 AND ($2::boolean OR status <> 'revisao_interna') ORDER BY created_at DESC`,
        [client_id, isTeamCaller]
      );
      return res.json({ contents: rows });
    }

    // ── Métricas do Instagram (só se a agência liberou para este cliente) ──
    if (action === 'get_insights') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      await ensureSocialInsightsSchema();
      const { rows } = await pool.query(
        'SELECT portal_insights_enabled FROM clients WHERE id = $1 LIMIT 1',
        [client_id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Cliente não encontrado' });
      if (!rows[0].portal_insights_enabled) return res.json({ disabled: true });

      const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
      const { since, until } = req.body;
      if (!isDate(since) || !isDate(until)) return res.status(400).json({ error: 'Período inválido' });
      try {
        const insights = await getClientInsights(client_id, since, until, { maxAgeMinutes: 360 });
        return res.json({ insights });
      } catch (err) {
        return res.json({ insights: null, unavailable: err.message });
      }
    }


    // ── Get notifications ──
    if (action === 'get_notifications') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows } = await pool.query(
        'SELECT * FROM client_portal_notifications WHERE client_id = $1 ORDER BY created_at DESC LIMIT 30',
        [client_id]
      );
      return res.json({ notifications: rows });
    }

    // ── Mark notification read ──
    if (action === 'mark_notification_read') {
      // Equipe olhando o portal não marca como lida a notificação do cliente
      if (isTeamCaller) return res.json({ success: true, skipped: 'team' });
      const { notification_id, notification_ids } = req.body;
      if (notification_id) {
        await pool.query('UPDATE client_portal_notifications SET read = true WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid)', [notification_id, scopeClientId]);
      } else if (notification_ids && notification_ids.length > 0) {
        await pool.query('UPDATE client_portal_notifications SET read = true WHERE id = ANY($1) AND ($2::uuid IS NULL OR client_id = $2::uuid)', [notification_ids, scopeClientId]);
      }
      return res.json({ success: true });
    }

    // ── Get scripts (Zona Criativa) ──
    if (action === 'get_scripts') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows: scripts } = await pool.query(
        `SELECT id, title, content, caption, content_format, video_type, created_at, created_by, priority, client_priority,
                client_edited, client_edited_at, recorded
         FROM scripts WHERE client_id = $1 AND (is_endomarketing = false OR is_endomarketing IS NULL)
         ORDER BY created_at DESC`,
        [client_id]
      );
      // Get authors
      const authorIds = [...new Set(scripts.filter(s => s.created_by).map(s => s.created_by))];
      let authors = {};
      if (authorIds.length > 0) {
        const { rows: profiles } = await pool.query(
          'SELECT id, name, display_name, avatar_url, job_title FROM profiles WHERE id = ANY($1)',
          [authorIds]
        );
        profiles.forEach(p => { authors[p.id] = p; });
      }
      return res.json({ scripts, authors });
    }

    // ── Update script client priority ──
    if (action === 'set_script_priority') {
      const { script_id, priority } = req.body;
      if (!script_id) return res.status(400).json({ error: 'script_id required' });
      const { rowCount: priorityUpdated } = await pool.query(
        'UPDATE scripts SET client_priority = $1 WHERE id = $2 AND ($3::uuid IS NULL OR client_id = $3::uuid)',
        [priority || 'normal', script_id, scopeClientId]
      );
      if (!priorityUpdated) return res.status(404).json({ error: 'Roteiro não encontrado' });
      // Get client name for notifications
      const { rows: [clientInfo] } = await pool.query('SELECT company_name FROM clients WHERE id = $1', [client_id]);
      return res.json({ success: true, company_name: clientInfo?.company_name || '' });
    }

    // ── Get content tasks (for calendar) ──
    if (action === 'get_content_tasks') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      // Agenda: janela de 12 meses (a tela navega entre meses sem buscar de novo) e teto
      // de linhas. Tarefa entra se qualquer data de evento cair na janela.
      const { rows: tasks } = await pool.query(
        `SELECT id, title, content_type, kanban_column, scheduled_recording_date, scheduled_recording_time,
                editing_started_at, editing_deadline, approval_sent_at, approved_at, adjustment_notes,
                recording_id, script_id, drive_link, updated_at, created_at
         FROM content_tasks
         WHERE client_id = $1
           AND GREATEST(updated_at, created_at, approved_at, approval_sent_at, editing_deadline::timestamptz, scheduled_recording_date::timestamptz) >= NOW() - INTERVAL '12 months'
         ORDER BY updated_at DESC
         LIMIT 1000`,
        [client_id]
      );
      // Get task history (o cliente não recebe os detalhes internos: notas, links de upload, pausas)
      const taskIds = tasks.map(t => t.id);
      let history = [];
      if (taskIds.length > 0) {
        const { rows } = await pool.query(
          `SELECT id, task_id, action, CASE WHEN $2::boolean THEN details ELSE NULL END AS details, created_at
             FROM task_history
            WHERE task_id = ANY($1) AND created_at >= NOW() - INTERVAL '12 months'
            ORDER BY created_at DESC
            LIMIT 3000`,
          [taskIds, isTeamCaller]
        );
        history = rows.reverse();
      }
      return res.json({ tasks, history });
    }

    // ── Get deliveries (for calendar) ──
    if (action === 'get_deliveries') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows } = await pool.query(
        `SELECT id, title, content_type, status, delivered_at, posted_at, scheduled_time, platform
         FROM social_media_deliveries
         WHERE client_id = $1 AND COALESCE(posted_at, delivered_at) >= (CURRENT_DATE - INTERVAL '12 months')
         ORDER BY COALESCE(posted_at, delivered_at) DESC
         LIMIT 1000`,
        [client_id]
      );
      return res.json({ deliveries: rows });
    }

    // ── Flyer templates & items ──
    if (action === 'get_flyer_data') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const [templatesRes, itemsRes] = await Promise.all([
        pool.query("SELECT * FROM flyer_templates WHERE is_active = true ORDER BY created_at DESC"),
        pool.query('SELECT * FROM flyer_items WHERE client_id = $1 ORDER BY created_at DESC', [client_id]),
      ]);
      return res.json({ templates: templatesRes.rows, items: itemsRes.rows });
    }

    if (action === 'create_flyer_item') {
      const { template_id, vehicle_model, vehicle_year, price, fuel_type, transmission, tire_condition, extra_info, media_urls } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows: [item] } = await pool.query(
        `INSERT INTO flyer_items (client_id, template_id, vehicle_model, vehicle_year, price, fuel_type, transmission, tire_condition, extra_info, media_urls, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pendente') RETURNING *`,
        [client_id, template_id || null, vehicle_model || '', vehicle_year || '', price || '', fuel_type || '', transmission || '', tire_condition || '', extra_info || null, media_urls || '{}']
      );
      return res.json({ item });
    }

    if (action === 'update_flyer_item') {
      const { item_id, status } = req.body;
      if (!item_id) return res.status(400).json({ error: 'item_id required' });
      const { rowCount } = await pool.query('UPDATE flyer_items SET status = $1, updated_at = NOW() WHERE id = $2 AND ($3::uuid IS NULL OR client_id = $3::uuid)', [status, item_id, scopeClientId]);
      if (rowCount === 0) return res.status(404).json({ error: 'Item not found' });
      return res.json({ success: true });
    }

    if (action === 'delete_flyer_item') {
      const { item_id } = req.body;
      if (!item_id) return res.status(400).json({ error: 'item_id required' });
      const { rowCount } = await pool.query('DELETE FROM flyer_items WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid)', [item_id, scopeClientId]);
      if (rowCount === 0) return res.status(404).json({ error: 'Item not found' });
      return res.json({ success: true });
    }

    // ── Create event ──
    if (action === 'create_event') {
      const { title, description, event_date, event_time, event_end_time, location, max_registrations, color } = req.body;
      if (!client_id || !title || !event_date) return res.status(400).json({ error: 'client_id, title, event_date required' });
      const { rows: [event] } = await pool.query(
        `INSERT INTO client_events (client_id, title, description, event_date, event_time, event_end_time, location, max_registrations, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [client_id, title, description || '', event_date, event_time || '08:00', event_end_time || '18:00', location || '', max_registrations || null, color || '217 91% 60%']
      );
      return res.json({ event });
    }

    // ── Comments ──
    if (action === 'get_comments') {
      if (!content_id) return res.status(400).json({ error: 'content_id required' });
      const { rows } = await pool.query(
        `SELECT c.*, p.avatar_url
           FROM client_portal_comments c
           JOIN client_portal_contents cpc ON cpc.id = c.content_id
           LEFT JOIN profiles p ON p.id = c.author_id
          WHERE c.content_id = $1 AND ($2::uuid IS NULL OR cpc.client_id = $2::uuid)
          ORDER BY c.created_at ASC`,
        [content_id, scopeClientId]
      );
      return res.json({ comments: rows });
    }

    if (action === 'add_comment') {
      if (!content_id || !message) return res.status(400).json({ error: 'content_id and message required' });
      const { rowCount: commentAdded } = await pool.query(
        `INSERT INTO client_portal_comments (content_id, author_name, author_type, author_id, message)
         SELECT id, $2, $3, $4, $5 FROM client_portal_contents
          WHERE id = $1 AND ($6::uuid IS NULL OR client_id = $6::uuid) AND ($7::boolean OR status <> 'revisao_interna')`,
        [content_id, author_name || 'Cliente', author_type || 'client', author_id || null, message, scopeClientId, isTeamCaller]
      );
      if (!commentAdded) return res.status(404).json({ error: 'Conteúdo não encontrado' });
      return res.json({ success: true });
    }

    if (action === 'approve') {
      if (!content_id) return res.status(400).json({ error: 'content_id required' });
      // Idempotente (clique duplo não aprova nem avisa duas vezes) e nunca em 'revisao_interna':
      // o vídeo ainda não foi liberado para o cliente. O Kanban se mexe aqui mesmo.
      const { rows: [approvedContent] } = await pool.query(
        `UPDATE client_portal_contents SET status = 'aprovado', approved_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid) AND status NOT IN ('aprovado', 'revisao_interna')
          RETURNING *`,
        [content_id, scopeClientId]
      );
      if (!approvedContent) {
        const { rows: [currentContent] } = await pool.query(
          'SELECT status FROM client_portal_contents WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid)',
          [content_id, scopeClientId]
        );
        if (!currentContent || (currentContent.status === 'revisao_interna' && !isTeamCaller)) return res.status(404).json({ error: 'Conteúdo não encontrado' });
        if (currentContent.status === 'aprovado') return res.json({ success: true, already_approved: true });
        return res.status(409).json({ error: 'Este conteúdo ainda está em revisão interna' });
      }
      // A aprovação já foi gravada: falha no Kanban/avisos só vai para o log. Devolver erro aqui
      // faria o cliente tentar de novo e cair em already_approved, sem sincronizar nada.
      try {
        await syncPortalApprovalToKanban(approvedContent, isTeamCaller ? caller.user : null);
      } catch (syncErr) {
        console.error('[portal-actions] approve: falha ao sincronizar Kanban/avisos', content_id, syncErr);
      }
      return res.json({ success: true });
    }

    if (action === 'request_adjustment') {
      if (!content_id || !message) return res.status(400).json({ error: 'content_id and message required' });
      const { rows: [adjustedContent] } = await pool.query(
        `UPDATE client_portal_contents SET status = 'ajuste_solicitado', updated_at = NOW()
          WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid) AND status <> 'revisao_interna'
          RETURNING *`,
        [content_id, scopeClientId]
      );
      if (!adjustedContent) {
        const { rows: [currentContent] } = await pool.query(
          'SELECT status FROM client_portal_contents WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid)',
          [content_id, scopeClientId]
        );
        if (!currentContent || !isTeamCaller) return res.status(404).json({ error: 'Conteúdo não encontrado' });
        return res.status(409).json({ error: 'Este conteúdo ainda está em revisão interna' });
      }
      await pool.query(
        `INSERT INTO client_portal_comments (content_id, author_name, author_type, author_id, message) VALUES ($1, $2, $3, $4, $5)`,
        [content_id, author_name || 'Cliente', author_type || 'client', author_id || null, `🔧 Ajuste solicitado: ${message}`]
      );
      // Pedido e comentário já gravados: falha no Kanban/avisos só vai para o log (nova tentativa
      // do cliente duplicaria o comentário).
      try {
        await syncPortalAdjustmentToKanban(adjustedContent, message, isTeamCaller ? caller.user : null);
      } catch (syncErr) {
        console.error('[portal-actions] request_adjustment: falha ao sincronizar Kanban/avisos', content_id, syncErr);
      }
      return res.json({ success: true });
    }

    // ── Get single content by ID ──
    if (action === 'get_content_by_id') {
      if (!content_id) return res.status(400).json({ error: 'content_id required' });
      const { rows: [content] } = await pool.query(
        `SELECT * FROM client_portal_contents WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid) AND ($3::boolean OR status <> 'revisao_interna')`,
        [content_id, scopeClientId, isTeamCaller]
      );
      if (!content) return res.status(404).json({ error: 'Content not found' });
      return res.json({ content });
    }

    // ── Create portal content ──
    if (action === 'create_portal_content') {
      const { title, content_type, file_url, season_month, season_year, status } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      // Cliente (vídeo do panfleto): só arquivo enviado para os uploads da agência e nunca como 'revisao_interna'.
      if (!isTeamCaller) {
        if (file_url && !/^(https:\/\/agenciapulse\.tech)?\/uploads\//.test(String(file_url))) {
          return res.status(400).json({ error: 'Arquivo inválido' });
        }
        if (status === 'revisao_interna') return res.status(400).json({ error: 'Status inválido' });
      }
      await pool.query(
        `INSERT INTO client_portal_contents (client_id, title, content_type, file_url, season_month, season_year, status) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [client_id, title || '', content_type || 'reel', file_url || null, season_month || new Date().getMonth() + 1, season_year || new Date().getFullYear(), status || 'pendente']
      );
      return res.json({ success: true });
    }

    // ── Portal videos (welcome/news) ──
    if (action === 'cleanup_old_portal_videos') {
      const { user } = await verifyUser(req);
      if (user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito ao administrador' });
      const deletedCount = await cleanupOldPortalVideos();
      return res.json({ success: true, deletedCount });
    }

    if (action === 'get_portal_videos') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows: videos } = await pool.query('SELECT * FROM portal_videos WHERE is_active = true ORDER BY created_at DESC');
      const { rows: views } = await pool.query('SELECT video_id FROM portal_video_views WHERE client_id = $1', [client_id]);
      return res.json({ videos, viewed_ids: views.map(v => v.video_id) });
    }

    if (action === 'mark_video_viewed') {
      const { video_id } = req.body;
      if (!client_id || !video_id) return res.status(400).json({ error: 'client_id and video_id required' });
      // Vídeo de boas-vindas/novidades visto pela equipe não conta como visto pelo cliente
      if (isTeamCaller) return res.json({ success: true, skipped: 'team' });
      await pool.query('INSERT INTO portal_video_views (video_id, client_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [video_id, client_id]);
      return res.json({ success: true });
    }


    // ── Client: Edit script ──
    if (action === 'client_edit_script') {
      const { script_id, content, caption } = req.body;
      if (!client_id || !script_id) return res.status(400).json({ error: 'client_id and script_id required' });

      const plainContent = String(content || '').trim();
      // Texto puro do textarea: escapa & < > antes de virar <p> (sem isso, 'preço < 100'
      // quebra o HTML e uma tag digitada vira HTML na tela da equipe). Aspas ficam: o
      // highlightQuotes precisa delas para marcar as falas.
      const escapedContent = plainContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const htmlContent = escapedContent ? `<p>${escapedContent.replace(/\n/g, '</p><p>')}</p>` : '';

      const { rows: [updatedScript] } = await pool.query(
        `UPDATE scripts
         SET content = $1,
             caption = $2,
             client_edited = true,
             client_edited_at = NOW(),
             updated_at = NOW()
         WHERE id = $3 AND client_id = $4
         RETURNING id, title`,
        [htmlContent, caption || '', script_id, client_id]
      );

      if (!updatedScript) return res.status(404).json({ error: 'Roteiro não encontrado' });

      const { rows: [clientInfo] } = await pool.query(
        'SELECT company_name FROM clients WHERE id = $1 LIMIT 1',
        [client_id]
      );

      return res.json({
        success: true,
        company_name: clientInfo?.company_name || 'Cliente',
        script: updatedScript,
      });
    }

    // ── Sync: Script edited by client ──
    if (action === 'sync_script_edit') {
      const { script_id, client_name } = req.body;
      if (!script_id) return res.status(400).json({ error: 'script_id required' });

      const { rows: [script] } = await pool.query(
        'SELECT title FROM scripts WHERE id = $1 AND ($2::uuid IS NULL OR client_id = $2::uuid) LIMIT 1',
        [script_id, scopeClientId]
      );
      if (!script) return res.status(404).json({ error: 'Roteiro não encontrado' });

      await notifyPortalTeam(client_id, ['admin', 'social_media'], '✏️ Roteiro editado pelo cliente', `${client_name || 'Cliente'} editou o roteiro "${script?.title || 'Roteiro'}" no Pulse Club`, 'info', '/roteiros');

      return res.json({ success: true });
    }

    // ── Sync: Approval / Adjustment (legado) ──
    // O approve e o request_adjustment já movem o Kanban e avisam a equipe no servidor.
    // Ficam respondendo sucesso para abas antigas do portal não repetirem tudo em dobro.
    if (action === 'sync_approval' || action === 'sync_adjustment') {
      return res.json({ success: true, legacy: true });
    }

    // ── Sync: Comment notification ──
    if (action === 'sync_comment') {
      const { content_title, author_name: syncAuthorName, message: syncMessage } = req.body;
      const syncAuthorType = isTeamCaller ? req.body.author_type : 'client';
      if (syncAuthorType === 'client') {
        await notifyPortalTeam(client_id, ['admin', 'social_media'], '💬 Comentário do cliente', `${syncAuthorName} comentou em "${content_title}": ${(syncMessage || '').substring(0, 60)}`, 'comment', '/conteudos-portal');
      }
      if (syncAuthorType === 'team' && client_id) {
        await pool.query(`INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)`,
          [client_id, '💬 Nova mensagem da equipe', `${syncAuthorName} comentou em "${content_title}"`, 'comment']);
      }
      return res.json({ success: true });
    }

    // ── Sync: Script priority ──
    if (action === 'sync_script_priority') {
      const { script_title, new_priority, client_name } = req.body;
      const emoji = new_priority === 'urgent' ? '🚨' : '⭐';
      const label = new_priority === 'urgent' ? 'URGENTE' : 'Prioridade';
      await notifyPortalTeam(client_id, ['admin', 'social_media'], `${emoji} Roteiro marcado como ${label}`, `${client_name} marcou "${script_title}" como ${label} no Pulse Club`, 'priority', '/roteiros');
      // Create portal notification
      if (client_id) {
        const { rows: [script] } = await pool.query('SELECT id FROM scripts WHERE client_id = $1 AND title = $2 LIMIT 1', [client_id, script_title]);
        if (script) {
          await pool.query(`INSERT INTO client_portal_notifications (client_id, title, message, type, link_script_id) VALUES ($1, $2, $3, $4, $5)`,
            [client_id, `${emoji} Roteiro ${label}`, `"${script_title}" foi marcado como ${label}`, 'priority', script.id]);
        }
      }
      return res.json({ success: true });
    }

    // ── Get design tasks for portal ──
    if (action === 'get_design_tasks') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows: tasks } = await pool.query(
        `SELECT id, title, description, format_type, priority, kanban_column, attachment_url, mockup_url,
                created_at, completed_at, client_approved_at, observations
         FROM design_tasks WHERE client_id = $1
         ORDER BY created_at DESC`,
        [client_id]
      );
      const clientInfo = await getClientArtLimitInfo(client_id);
      return res.json({ tasks, art_requests_limit: clientInfo?.art_requests_limit ?? null });
    }

    // ── Create design request from portal ──
    if (action === 'create_design_request') {
      const { title, description, format_type, references_links } = req.body;
      if (!client_id || !title) return res.status(400).json({ error: 'client_id and title required' });

      // Check limit
      const clientInfo = await getClientArtLimitInfo(client_id, true);
      if (clientInfo?.art_requests_limit !== null && clientInfo?.art_requests_limit !== undefined) {
        const { rows: [countRow] } = await pool.query(
          `SELECT COUNT(*) as cnt FROM design_tasks
           WHERE client_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`,
          [client_id]
        );
        if (parseInt(countRow.cnt) >= clientInfo.art_requests_limit) {
          return res.status(400).json({ error: 'Limite de solicitações de arte atingido neste mês' });
        }
      }

      // O card vai para a cidade do cliente (antes caía sempre no DEFAULT 'minacu' e a
      // designer de Uruaçu não via o pedido). Cliente global (sem cidade) fica no DEFAULT.
      const clientCity = await getPortalClientCity(client_id).catch(() => null);
      const withCity = !!clientCity && await tableHasCityColumn('design_tasks');
      const { rows: [task] } = await pool.query(
        withCity
          ? `INSERT INTO design_tasks (client_id, title, description, format_type, priority, kanban_column, references_links, city)
             VALUES ($1, $2, $3, $4, 'media', 'nova_tarefa', $5, $6) RETURNING id`
          : `INSERT INTO design_tasks (client_id, title, description, format_type, priority, kanban_column, references_links)
             VALUES ($1, $2, $3, $4, 'media', 'nova_tarefa', $5) RETURNING id`,
        withCity
          ? [client_id, title, description || null, format_type || 'feed', references_links || null, clientCity]
          : [client_id, title, description || null, format_type || 'feed', references_links || null]
      );

      // Add history
      await insertDesignTaskHistoryFromPortal(task.id, '📩 Solicitação criada pelo cliente via Pulse Club', description || null);

      // Notify designers (fotografo + designer roles)
      await notifyPortalTeam(client_id, ['admin', 'fotografo', 'designer'], '🎨 Nova solicitação de arte do cliente', `${clientInfo?.company_name || 'Cliente'} solicitou: "${title}"`, 'design', '/designer');

      return res.json({ success: true, task_id: task.id });
    }

    // ── Approve design task from portal ──
    if (action === 'approve_design_task') {
      const { task_id } = req.body;
      if (!task_id) return res.status(400).json({ error: 'task_id required' });
      // Só arte aguardando o cliente; clique repetido não grava nem avisa de novo
      const result = await approveDesignTaskFromPortal(task_id, scopeClientId);
      if (result.status === 'not_found') return res.status(404).json({ error: 'Arte não encontrada' });
      if (result.status === 'already') return res.json({ success: true, already_approved: true });
      if (result.status === 'conflict') return res.status(409).json({ error: 'Esta arte não está aguardando aprovação' });
      return res.json({ success: true });
    }

    // ── Request design adjustment from portal ──
    if (action === 'request_design_adjustment') {
      const { task_id, note } = req.body;
      if (!task_id || !note) return res.status(400).json({ error: 'task_id and note required' });
      // Só arte aguardando o cliente; pedido repetido (já em ajustes) não grava nem avisa de novo
      const result = await requestDesignAdjustmentFromPortal(task_id, scopeClientId, note);
      if (result.status === 'not_found') return res.status(404).json({ error: 'Arte não encontrada' });
      if (result.status === 'already') return res.json({ success: true, already_requested: true });
      if (result.status === 'conflict') return res.status(409).json({ error: 'Esta arte não está aguardando aprovação' });
      return res.json({ success: true });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Portal actions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Avulso: create content task (dedicated endpoint) ─────────
app.post('/api/avulso-create-task', async (req, res) => {
  try {
    await verifyUser(req);
    const { title, content_type, kanban_column, description, script_id, recording_id,
            assigned_to, created_by, drive_link, editing_deadline,
            script_alteration_type, script_alteration_notes } = req.body;

    if (!title) return res.status(400).json({ error: 'title required' });

    // Ensure client_id column accepts NULL (confere uma vez por processo)
    await ensureContentTasksClientIdNullable();

    const { rows: [task] } = await pool.query(
      `INSERT INTO content_tasks
         (client_id, title, content_type, kanban_column, description, script_id, recording_id,
          assigned_to, created_by, drive_link, editing_deadline,
          script_alteration_type, script_alteration_notes)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [title, content_type || 'reels', kanban_column || 'edicao', description || '',
       script_id || null, recording_id || null, assigned_to || null, created_by || null,
       drive_link || null, editing_deadline || null,
       script_alteration_type || null, script_alteration_notes || null]
    );

    console.log('[avulso-create-task] Created content_task:', task.id);
    res.json({ data: task, error: null });
  } catch (e) {
    console.error('POST /api/avulso-create-task error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/avulso-actions', async (req, res) => {
  try {
    const { action, task_id, message } = req.body;

    if (!task_id) return res.status(400).json({ error: 'task_id required' });

    // Ensure client_id column accepts NULL (confere uma vez por processo)
    await ensureContentTasksClientIdNullable();

    if (action === 'get_task') {
      const { rows: [task] } = await pool.query(
        `SELECT ct.id, ct.title, ct.edited_video_link, ct.edited_video_type, ct.kanban_column,
                ct.adjustment_notes, ct.approved_at, ct.updated_at, ct.recording_id, r.prospect_name
         FROM content_tasks ct
         LEFT JOIN recordings r ON r.id = ct.recording_id
         WHERE ct.id = $1 AND ct.client_id IS NULL
         LIMIT 1`,
        [task_id]
      );
      if (!task) return res.status(404).json({ error: 'Vídeo avulso não encontrado' });
      return res.json({ task });
    }

    if (action === 'approve') {
      // Só com o vídeo editado pronto (fora de ideias/captação/edição). Já aprovado: sucesso sem repetir.
      const { rowCount } = await pool.query(
        `UPDATE content_tasks
         SET kanban_column = 'arquivado', approved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND client_id IS NULL AND edited_video_link IS NOT NULL
           AND kanban_column NOT IN ('ideias', 'captacao', 'edicao', 'arquivado')`,
        [task_id]
      );
      if (!rowCount) {
        const { rows: [avulsoTask] } = await pool.query(
          'SELECT kanban_column FROM content_tasks WHERE id = $1 AND client_id IS NULL', [task_id]
        );
        if (!avulsoTask) return res.status(404).json({ error: 'Vídeo avulso não encontrado' });
        if (avulsoTask.kanban_column === 'arquivado') return res.json({ success: true, already_approved: true });
        return res.status(409).json({ error: 'O vídeo ainda não está pronto para aprovação' });
      }
      await pool.query(
        `INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)`,
        [task_id, 'Cliente avulso aprovou o vídeo', null, null]
      );
      return res.json({ success: true });
    }

    if (action === 'request_revision') {
      if (!message) return res.status(400).json({ error: 'message required' });
      // Revisão só de vídeo pronto e ainda não aprovado (arquivado não volta para alteração)
      const { rowCount } = await pool.query(
        `UPDATE content_tasks
         SET kanban_column = 'alteracao', adjustment_notes = $2, editing_started_at = NULL,
             editing_paused_at = NULL, editing_paused_seconds = 0, updated_at = NOW()
         WHERE id = $1 AND client_id IS NULL AND edited_video_link IS NOT NULL
           AND kanban_column NOT IN ('ideias', 'captacao', 'edicao', 'arquivado')`,
        [task_id, message]
      );
      if (!rowCount) {
        const { rows: [avulsoTask] } = await pool.query(
          'SELECT kanban_column FROM content_tasks WHERE id = $1 AND client_id IS NULL', [task_id]
        );
        if (!avulsoTask) return res.status(404).json({ error: 'Vídeo avulso não encontrado' });
        if (avulsoTask.kanban_column === 'arquivado') return res.status(409).json({ error: 'Este vídeo já foi aprovado' });
        return res.status(409).json({ error: 'O vídeo ainda não está pronto para revisão' });
      }
      await pool.query(
        `INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)`,
        [task_id, 'Cliente avulso solicitou revisão', message, null]
      );
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (e) {
    console.error('POST /api/avulso-actions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Helpers de agenda para as rotas públicas (portal e link de reagendamento) ───
// Data (YYYY-MM-DD) e minuto do dia sempre no fuso de Brasília, não no fuso do servidor.
const BRT_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function brtDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
function brtMinutesNow(date = new Date()) {
  const [h, m] = BRT_TIME_FORMAT.format(date).split(':').map(Number);
  return h * 60 + m;
}
function addDaysToDateString(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}
const AGENDA_WEEKDAY_NAMES = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
function weekdayNameOfDate(dateStr) {
  return AGENDA_WEEKDAY_NAMES[new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
}
function isValidAgendaDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
}
function isValidAgendaTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return false;
  const [h, m] = value.split(':').map(Number);
  return h < 24 && m < 60;
}
function agendaTimeToMinutes(value) {
  const [h, m] = String(value || '00:00').split(':').map(Number);
  return h * 60 + m;
}
function getSettingsWorkDays(settings) {
  return Array.isArray(settings?.work_days) && settings.work_days.length > 0
    ? settings.work_days
    : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
}
// A gravação (início + duração) cabe inteira no turno A ou no turno B do expediente.
function fitsInWorkShifts(time, settings, duration) {
  const start = agendaTimeToMinutes(time);
  const inShift = (s, e) => start >= agendaTimeToMinutes(s) && start + duration <= agendaTimeToMinutes(e);
  return inShift(settings?.shift_a_start || '08:30', settings?.shift_a_end || '12:00')
    || inShift(settings?.shift_b_start || '14:30', settings?.shift_b_end || '18:00');
}

// Cidade do cliente (null = cliente global ou sem cidade), para as rotas públicas gravarem e filtrarem na praça certa.
async function getClientCityForAgenda(clientId) {
  if (!clientId) return null;
  try {
    const { rows: [row] } = await pool.query('SELECT city::text AS city FROM clients WHERE id = $1', [clientId]);
    return normalizeCityValue(row?.city) || null;
  } catch {
    return null;
  }
}

// Filtro SQL "este usuário atende a cidade": tem a cidade em user_cities, ou não tem cidade
// nenhuma cadastrada e a cidade é Minaçu (mesma regra do resolveActiveCity).
function userServesCitySql(userIdExpr, placeholder) {
  return `(EXISTS (SELECT 1 FROM user_cities uc WHERE uc.user_id::text = ${userIdExpr}::text AND ${cityScopeCondition('uc.city', placeholder)})
    OR (${placeholder}::text = 'minacu' AND NOT EXISTS (SELECT 1 FROM user_cities uc0 WHERE uc0.user_id::text = ${userIdExpr}::text)))`;
}

// O videomaker existe (papel videomaker) e atende a cidade do cliente (cliente global: qualquer cidade).
async function isVideomakerForCity(videomakerId, city) {
  if (!videomakerId) return false;
  const params = [videomakerId];
  let cityClause = '';
  if (city) {
    params.push(city);
    cityClause = ` AND ${userServesCitySql('ur.user_id', '$2')}`;
  }
  const { rows } = await pool.query(
    `SELECT 1 FROM user_roles ur WHERE ur.user_id::text = $1::text AND ur.role = 'videomaker'${cityClause} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

// company_settings é por cidade: lê a da cidade do cliente e, se não houver, qualquer linha (como antes).
async function getCompanySettingsForCity(city) {
  if (city) {
    try {
      if (await tableHasCityColumn('company_settings')) {
        const { rows: [row] } = await pool.query(`SELECT * FROM company_settings WHERE ${cityScopeCondition('city', '$1')} LIMIT 1`, [city]);
        if (row) return row;
      }
    } catch { /* cai para qualquer linha */ }
  }
  const { rows: [row] } = await pool.query('SELECT * FROM company_settings LIMIT 1');
  return row;
}

// Insere uma gravação vinda das rotas públicas já na cidade certa. Sem cidade (cliente global),
// fica o default da tabela e o trigger apply_global_client_city cuida do resto.
async function insertPublicRecording(db, { clientId, videomakerId, date, startTime, type, status, confirmationStatus, city, source = null }) {
  await ensurePublicReschedTable();
  const cols = ['client_id', 'videomaker_id', 'date', 'start_time', 'type', 'status', 'confirmation_status'];
  const vals = [clientId, videomakerId, date, startTime, type, status, confirmationStatus];
  if (city && await tableHasCityColumn('recordings')) { cols.push('city'); vals.push(city); }
  if (source && recordingsSourceColumnReady) { cols.push('source'); vals.push(source); }
  const { rows: [row] } = await db.query(
    `INSERT INTO recordings (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING id, date::text, start_time`,
    vals
  );
  return row;
}

// Avisa a equipe dos papéis informados. notifications é por cidade: grava a cidade do cliente
// para o aviso aparecer na praça certa (sem cidade, fica o default da tabela, como antes).
async function notifyTeamRoles(roles, { title, message, type, link }, city = null) {
  const { rows: users } = await pool.query(
    'SELECT DISTINCT ur.user_id FROM user_roles ur WHERE ur.role::text = ANY($1::text[])',
    [roles]
  );
  const withCity = Boolean(city) && await tableHasCityColumn('notifications');
  for (const u of users) {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, link${withCity ? ', city' : ''}) VALUES ($1, $2, $3, $4, $5${withCity ? ', $6' : ''})`,
      [u.user_id, title, message, type, link, ...(withCity ? [city] : [])]
    );
  }
}

// Videomakers (id, name) que atendem a cidade do cliente (cliente global: todos), menos o excluído.
async function listVideomakersForCity(city, excludeId = null) {
  const params = [];
  let where = "ur.role = 'videomaker'";
  if (excludeId) { params.push(excludeId); where += ` AND p.id::text != $${params.length}::text`; }
  if (city) { params.push(city); where += ` AND ${userServesCitySql('p.id', `$${params.length}`)}`; }
  const { rows } = await pool.query(
    `SELECT DISTINCT p.id, p.name FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE ${where}`,
    params
  );
  return rows;
}

// Horários livres (início) do videomaker num dia, dentro dos turnos do expediente.
async function getFreeSlotsForVideomaker(db, videomakerId, date, settings, duration) {
  const { rows: existing } = await db.query(
    `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
    [videomakerId, date]
  );
  return computeVmSlots(existing, settings, duration);
}

// ─── 6. Portal Recordings (uses local PostgreSQL) ───────────
app.post('/api/portal-recordings', async (req, res) => {
  try {
    const { action, recording_id, new_date, new_time } = req.body;
    // Mesma sessão do portal-actions: cliente pelo token (client_id do token) ou equipe pelo JWT.
    const caller = await resolvePortalCaller(req);
    if (!caller && rejectPortalCallWithoutSession(res, 'portal-recordings', action)) return;
    const client_id = effectiveClientId(caller, req.body.client_id);
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    if (action === 'list') {
      const { rows: recordings } = await pool.query(
        `SELECT r.id, r.client_id, r.videomaker_id, r.date::text, r.start_time, r.status, r.type, r.confirmation_status,
                p.name as videomaker_name
         FROM recordings r
         LEFT JOIN profiles p ON p.id = r.videomaker_id
         WHERE r.client_id = $1 AND r.status != 'cancelada'
         ORDER BY r.date ASC, r.start_time ASC`,
        [client_id]
      );
      return res.json({ recordings: recordings.map(r => ({ ...r, videomaker_name: r.videomaker_name || 'Videomaker' })) });
    }

    if (action === 'check_availability') {
      if (!new_date) return res.status(400).json({ error: 'new_date required' });
      const { rows: [clientData] } = await pool.query('SELECT videomaker_id FROM clients WHERE id = $1', [client_id]);
      let vmId = clientData?.videomaker_id;
      if (!vmId) {
        const { rows: [lastRec] } = await pool.query(
          `SELECT videomaker_id FROM recordings WHERE client_id = $1 AND videomaker_id IS NOT NULL ORDER BY date DESC LIMIT 1`,
          [client_id]
        );
        vmId = lastRec?.videomaker_id;
      }
      if (!vmId) return res.status(400).json({ error: 'Nenhum videomaker atribuído' });
      const settings = await getCompanySettingsForCity(await getClientCityForAgenda(client_id));
      // Mesma regra do reschedule: dia sem expediente na cidade do cliente não tem horário
      if (!isValidAgendaDate(new_date) || !getSettingsWorkDays(settings).includes(weekdayNameOfDate(new_date))) {
        return res.json({ available_slots: [], videomaker_id: vmId, date: new_date, reason: 'A agência não grava neste dia' });
      }
      const rawDur = settings?.recording_duration || 2;
      const duration = rawDur > 10 ? rawDur : rawDur * 60;
      console.log('[check_availability] recording_duration raw:', rawDur, '-> duration (min):', duration, 'shifts:', settings?.shift_a_start, '-', settings?.shift_a_end, '|', settings?.shift_b_start, '-', settings?.shift_b_end);
      const buffer = 30;
      const { rows: existing } = await pool.query(
        `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
        [vmId, new_date]
      );
      const occupied = existing.map(r => { const [h, m] = r.start_time.split(':').map(Number); const start = h * 60 + m; return { start, end: start + duration + buffer }; });
      const slots = [];
      const step = duration + buffer; // 90 + 30 = 120min between slot starts
      const generateSlots = (startStr, endStr) => { const [sh, sm] = startStr.split(':').map(Number); const [eh, em] = endStr.split(':').map(Number); let cursor = sh * 60 + sm; const endMin = eh * 60 + em; while (cursor + duration <= endMin) { const conflict = occupied.some(o => cursor < o.end && cursor + duration + buffer > o.start); if (!conflict) slots.push(`${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`); cursor += step; } };
      generateSlots(settings?.shift_a_start || '08:30', settings?.shift_a_end || '12:00');
      generateSlots(settings?.shift_b_start || '14:30', settings?.shift_b_end || '18:00');
      const { rows: [vmProfile] } = await pool.query('SELECT name FROM profiles WHERE id = $1', [vmId]);
      return res.json({ available_slots: slots, videomaker_name: vmProfile?.name || 'Videomaker', videomaker_id: vmId, date: new_date });
    }

    if (action === 'reschedule') {
      if (!recording_id || !new_date || !new_time) return res.status(400).json({ error: 'recording_id, new_date, new_time required' });
      if (!isValidAgendaDate(new_date) || !isValidAgendaTime(new_time)) return res.status(400).json({ error: 'Data ou horário inválido' });
      const { rows: [rec] } = await pool.query('SELECT id, client_id, videomaker_id, date::text, start_time, status FROM recordings WHERE id = $1 AND client_id = $2', [recording_id, client_id]);
      if (!rec) return res.status(404).json({ error: 'Gravação não encontrada' });
      // Só remarca gravação ainda agendada (não a já feita, a cancelada nem o pedido em análise)
      if (rec.status !== 'agendada') return res.status(409).json({ error: 'Esta gravação não pode mais ser remarcada' });
      // Mesma janela do calendário do portal: a partir de amanhã, nas próximas 3 semanas
      const todayResched = brtDateString();
      if (new_date <= todayResched || new_date > addDaysToDateString(todayResched, 22)) {
        return res.status(400).json({ error: 'Escolha uma data a partir de amanhã, nas próximas 3 semanas' });
      }
      const clientCityResched = await getClientCityForAgenda(client_id);
      const settings = await getCompanySettingsForCity(clientCityResched);
      if (!getSettingsWorkDays(settings).includes(weekdayNameOfDate(new_date))) {
        return res.status(400).json({ error: 'A agência não grava neste dia' });
      }
      const rawDurR = settings?.recording_duration || 2;
      const duration = rawDurR > 10 ? rawDurR : rawDurR * 60;
      const buffer = 30;
      const newTimeHHMM = new_time.slice(0, 5);
      // Conferência e remarcação na mesma transação, com trava por videomaker+dia
      const txResched = await pool.connect();
      try {
        await txResched.query('BEGIN');
        await txResched.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agenda|${rec.videomaker_id}|${new_date}`]);
        const { rows: conflicts } = await txResched.query(
          `SELECT id, start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada' AND id != $3`,
          [rec.videomaker_id, new_date, recording_id]
        );
        // Só aceita um dos horários que o portal oferece (turnos do expediente, sem conflito)
        const offeredSlots = computeVmSlots(conflicts, settings, duration);
        const newStart = agendaTimeToMinutes(new_time);
        const newEnd = newStart + duration + buffer;
        const hasConflict = conflicts.some(c => { const cStart = agendaTimeToMinutes(c.start_time); return newStart < cStart + duration + buffer && newEnd > cStart; });
        if (hasConflict || !offeredSlots.includes(newTimeHHMM)) {
          await txResched.query('ROLLBACK');
          return res.status(409).json({ error: 'Horário não está mais disponível' });
        }
        const { rowCount } = await txResched.query(
          `UPDATE recordings SET date = $1, start_time = $2, confirmation_status = 'pendente' WHERE id = $3 AND client_id = $4 AND status = 'agendada'`,
          [new_date, new_time, recording_id, client_id]
        );
        if (rowCount === 0) {
          await txResched.query('ROLLBACK');
          return res.status(409).json({ error: 'Esta gravação não pode mais ser remarcada' });
        }
        await txResched.query('COMMIT');
      } catch (txErr) {
        await txResched.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        txResched.release();
      }
      const { rows: [clientInfo] } = await pool.query('SELECT company_name FROM clients WHERE id = $1', [client_id]);
      const notifMsg = `${clientInfo?.company_name || 'Cliente'} reagendou gravação de ${rec.date} ${rec.start_time} para ${new_date} ${new_time}`;
      // Avisa admin e social_media (todas as cidades), com a cidade do cliente na notificação
      await notifyPortalTeam(client_id, ['admin', 'social_media'], 'Reagendamento pelo cliente', notifMsg, 'warning', '/agenda');
      return res.json({ success: true });
    }

    /* ── confirm ── */
    if (action === 'confirm') {
      if (!recording_id) return res.status(400).json({ error: 'recording_id required' });
      await pool.query(`UPDATE recordings SET confirmation_status = 'confirmada' WHERE id = $1 AND client_id = $2`, [recording_id, client_id]);
      const { rows: [clientInfoConf] } = await pool.query('SELECT company_name FROM clients WHERE id = $1', [client_id]);
      await notifyPortalTeam(client_id, ['admin', 'social_media'], 'Gravação confirmada pelo cliente', `${clientInfoConf?.company_name || 'Cliente'} confirmou a gravação`, 'info', '/agenda');
      return res.json({ success: true });
    }

    /* ── cancel (with backup check + alternative videomakers) ── */
    if (action === 'cancel') {
      if (!recording_id) return res.status(400).json({ error: 'recording_id required' });
      const { rows: [recCancel] } = await pool.query('SELECT id, date::text, start_time, videomaker_id FROM recordings WHERE id = $1 AND client_id = $2', [recording_id, client_id]);
      if (!recCancel) return res.status(404).json({ error: 'Gravação não encontrada' });
      const { rows: [clientCancel] } = await pool.query('SELECT backup_day, backup_time, videomaker_id, company_name, fixed_day FROM clients WHERE id = $1', [client_id]);
      const clientCityCancel = await getClientCityForAgenda(client_id);
      const settingsCancel = await getCompanySettingsForCity(clientCityCancel);
      const rawDurC = settingsCancel?.recording_duration || 2;
      const durationCancel = rawDurC > 10 ? rawDurC : rawDurC * 60;
      const bufferCancel = 30;
      const dayMapCancel = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
      const targetDayCancel = dayMapCancel[clientCancel?.backup_day] ?? 2;
      const todayCancel = new Date();
      let backupDateCancel = null;
      for (let i = 0; i <= 14; i++) { const d = new Date(todayCancel); d.setDate(d.getDate() + i); if (d.getDay() === targetDayCancel && d >= todayCancel) { backupDateCancel = d.toISOString().split('T')[0]; break; } }
      let backupAvailable = false;
      let backupSlot = null;
      if (backupDateCancel && clientCancel?.backup_time) {
        const { rows: bConflicts } = await pool.query(`SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`, [clientCancel.videomaker_id, backupDateCancel]);
        const [bh, bm] = clientCancel.backup_time.split(':').map(Number);
        const bStart = bh * 60 + bm;
        const bConflict = bConflicts.some(c => { const [ch, cm] = c.start_time.split(':').map(Number); const cStart = ch * 60 + cm; return bStart < cStart + durationCancel + bufferCancel && bStart + durationCancel + bufferCancel > cStart; });
        if (!bConflict) { backupAvailable = true; backupSlot = { date: backupDateCancel, time: clientCancel.backup_time }; }
      }

      // If main videomaker backup not available, find alternative videomakers with space
      // (só em dia de expediente: o accept_backup recusa videomaker alternativo fora dele)
      let alternativeVideomakers = [];
      if (!backupAvailable && backupDateCancel && getSettingsWorkDays(settingsCancel).includes(weekdayNameOfDate(backupDateCancel))) {
        // Só videomakers que atendem a cidade do cliente; gravações do dia numa consulta só
        const allVideomakers = await listVideomakersForCity(clientCityCancel, clientCancel?.videomaker_id || null);
        const { rows: altRecsCancel } = allVideomakers.length > 0
          ? await pool.query(
            `SELECT videomaker_id, start_time FROM recordings WHERE videomaker_id = ANY($1::uuid[]) AND date = $2 AND status != 'cancelada'`,
            [allVideomakers.map(vm => vm.id), backupDateCancel]
          )
          : { rows: [] };
        const shiftAStart = settingsCancel?.shift_a_start || '08:30';
        const shiftAEnd = settingsCancel?.shift_a_end || '12:00';
        const shiftBStart = settingsCancel?.shift_b_start || '14:30';
        const shiftBEnd = settingsCancel?.shift_b_end || '18:00';

        for (const vm of allVideomakers) {
          const vmRecs = altRecsCancel.filter(r => String(r.videomaker_id) === String(vm.id));
          const occupied = vmRecs.map(r => { const [h, m] = r.start_time.split(':').map(Number); return { start: h * 60 + m, end: h * 60 + m + durationCancel }; });
          // Find available slots for this videomaker
          const slots = [];
          const stepCancel = durationCancel + bufferCancel; // 90 + 30 = 120min
          const generateSlots = (startStr, endStr) => {
            const [sh, sm] = startStr.split(':').map(Number);
            const [eh, em] = endStr.split(':').map(Number);
            let cursor = sh * 60 + sm;
            const endMin = eh * 60 + em;
            while (cursor + durationCancel <= endMin) {
              const conflict = occupied.some(o => cursor < o.end + bufferCancel && cursor + durationCancel + bufferCancel > o.start);
              if (!conflict) slots.push(`${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`);
              cursor += stepCancel;
            }
          };
          generateSlots(shiftAStart, shiftAEnd);
          generateSlots(shiftBStart, shiftBEnd);
          if (slots.length > 0) {
            alternativeVideomakers.push({ id: vm.id, name: vm.name, date: backupDateCancel, available_slots: slots, total_free: slots.length });
          }
        }
        // Sort by most free slots first
        alternativeVideomakers.sort((a, b) => b.total_free - a.total_free);
      }

      const fixedDayCancel = dayMapCancel[clientCancel?.fixed_day] ?? 1;
      let nextFixedDate = null;
      for (let i = 1; i <= 14; i++) { const d = new Date(todayCancel); d.setDate(d.getDate() + i); if (d.getDay() === fixedDayCancel) { nextFixedDate = d.toISOString().split('T')[0]; break; } }
      await pool.query(`UPDATE recordings SET status = 'cancelada' WHERE id = $1 AND client_id = $2`, [recording_id, client_id]);
      await notifyPortalTeam(client_id, ['admin', 'social_media'], 'Gravação cancelada pelo cliente', `${clientCancel?.company_name || 'Cliente'} cancelou gravação ${recCancel.date} ${recCancel.start_time}`, 'warning', '/agenda');
      // Oferta assinada: o accept_backup só aceita uma destas opções (data, hora e videomaker).
      const backupOfferOptions = [
        ...(backupSlot ? [{ vm: clientCancel?.videomaker_id || null, date: backupSlot.date, times: [backupSlot.time], main: true }] : []),
        ...alternativeVideomakers.map(vm => ({ vm: vm.id, date: vm.date, times: vm.available_slots })),
      ];
      const backupOffer = backupOfferOptions.length > 0
        ? portalSession.signBackupOffer({ clientId: client_id, recordingId: recording_id, options: backupOfferOptions })
        : null;
      return res.json({ success: true, backup_available: backupAvailable, backup_slot: backupSlot, next_fixed_date: nextFixedDate, alternative_videomakers: alternativeVideomakers, backup_offer: backupOffer });
    }

    /* ── accept_backup ── */
    if (action === 'accept_backup') {
      const { backup_date, backup_time, videomaker_id: requestedVmId, backup_offer, recording_id: bodyCancelledRecId } = req.body;
      if (!backup_date || !backup_time) return res.status(400).json({ error: 'backup_date and backup_time required' });
      if (!isValidAgendaDate(backup_date) || !isValidAgendaTime(backup_time)) return res.status(400).json({ error: 'Data ou horário inválido' });
      const todayBackup = brtDateString();
      if (backup_date < todayBackup || backup_date > addDaysToDateString(todayBackup, 15)) {
        return res.status(400).json({ error: 'Data fora do período de remarcação' });
      }
      // Só uma das opções oferecidas no cancelamento (oferta assinada, válida por 2 h)
      const offer = portalSession.readBackupOffer(backup_offer, client_id);
      if (!offer) return res.status(400).json({ error: 'Essa opção de remarcação expirou. Fale com a equipe para remarcar.' });
      const offerOption = pickBackupOption(offer, { videomakerId: requestedVmId || null, date: backup_date, time: backup_time });
      if (!offerOption) return res.status(400).json({ error: 'Horário não faz parte das opções oferecidas' });
      // A gravação cancelada vem da oferta assinada; o recording_id do corpo, se vier, tem de ser o mesmo
      if (offer.recordingId && bodyCancelledRecId && String(bodyCancelledRecId) !== String(offer.recordingId)) {
        return res.status(400).json({ error: 'Horário não faz parte das opções oferecidas' });
      }
      const cancelledRecId = offer.recordingId || bodyCancelledRecId || null;
      // Só remarca a partir de uma gravação deste cliente cancelada e ainda não remarcada:
      // cada cancelamento vale uma remarcação (evita lotar a agenda chamando a ação em loop).
      await ensurePublicReschedTable();
      const { rows: [cancelledRec] } = await pool.query(
        `SELECT id FROM recordings
          WHERE client_id = $1 AND status = 'cancelada' AND rescheduled_to_id IS NULL
            AND ($2::text IS NULL OR id::text = $2::text) AND date >= $3
          ORDER BY date ASC, start_time ASC LIMIT 1`,
        [client_id, cancelledRecId, addDaysToDateString(todayBackup, -1)]
      );
      if (!cancelledRec) return res.status(409).json({ error: 'Nenhuma gravação cancelada para remarcar' });

      const { rows: [clientBackup] } = await pool.query('SELECT videomaker_id, backup_time FROM clients WHERE id = $1', [client_id]);
      const clientCityBackup = await getClientCityForAgenda(client_id);
      const settingsBackup = await getCompanySettingsForCity(clientCityBackup);
      const rawDurB = settingsBackup?.recording_duration || 2;
      const durationBackup = rawDurB > 10 ? rawDurB : rawDurB * 60;
      const bufferBackup = 30;
      // Videomaker da opção escolhida na oferta; o backup sem videomaker definido cai no do cliente
      const offerVmId = offerOption.vm || null;
      // Videomaker alternativo (oferecido no cancelamento) precisa ser videomaker da cidade do cliente
      const usesAlternativeVm = Boolean(offerVmId) && offerVmId !== clientBackup?.videomaker_id;
      if (usesAlternativeVm && !(await isVideomakerForCity(offerVmId, clientCityBackup))) {
        return res.status(400).json({ error: 'Videomaker indisponível para este cliente' });
      }
      // Fora o horário de backup do próprio cliente, só aceita dia útil e horário dentro do expediente
      const isClientBackupTime = !usesAlternativeVm && Boolean(clientBackup?.backup_time)
        && agendaTimeToMinutes(clientBackup.backup_time) === agendaTimeToMinutes(backup_time);
      if (!isClientBackupTime && (!getSettingsWorkDays(settingsBackup).includes(weekdayNameOfDate(backup_date)) || !fitsInWorkShifts(backup_time, settingsBackup, durationBackup))) {
        return res.status(400).json({ error: 'Horário fora do expediente da agência' });
      }
      let vmId = offerVmId;
      if (!vmId) {
        vmId = clientBackup?.videomaker_id;
      }
      if (!vmId) {
        const { rows: [lastRec] } = await pool.query(
          `SELECT videomaker_id FROM recordings WHERE client_id = $1 AND status = 'cancelada' ORDER BY created_at DESC LIMIT 1`, [client_id]
        );
        vmId = lastRec?.videomaker_id;
      }
      if (!vmId) {
        const { rows: [anyRec] } = await pool.query(
          `SELECT videomaker_id FROM recordings WHERE client_id = $1 AND videomaker_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [client_id]
        );
        vmId = anyRec?.videomaker_id;
      }
      if (!vmId) return res.status(400).json({ error: 'Nenhum videomaker encontrado para este cliente' });
      // Verify no conflict for selected videomaker/date/time — conferência e criação na mesma
      // transação, com trava por videomaker+dia, para dois pedidos não pegarem o mesmo horário
      const txClient = await pool.connect();
      try {
        await txClient.query('BEGIN');
        await txClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agenda|${vmId}|${backup_date}`]);
        const { rows: [lockedCancelled] } = await txClient.query('SELECT rescheduled_to_id FROM recordings WHERE id = $1 FOR UPDATE', [cancelledRec.id]);
        if (lockedCancelled?.rescheduled_to_id) {
          await txClient.query('ROLLBACK');
          return res.status(409).json({ error: 'Esta gravação já foi remarcada' });
        }
        const { rows: conflictsBackup } = await txClient.query(
          `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
          [vmId, backup_date]
        );
        const newStartBackup = agendaTimeToMinutes(backup_time);
        const hasConflictBackup = conflictsBackup.some(c => {
          const cStart = agendaTimeToMinutes(c.start_time);
          return newStartBackup < cStart + durationBackup + bufferBackup && newStartBackup + durationBackup + bufferBackup > cStart;
        });
        if (hasConflictBackup) {
          await txClient.query('ROLLBACK');
          return res.status(409).json({ error: 'Horário não está mais disponível' });
        }
        // Cidade do cliente na gravação (sem ela o DEFAULT 'minacu' tira a gravação da agenda de Uruaçu)
        const newBackupRec = await insertPublicRecording(txClient, {
          clientId: client_id, videomakerId: vmId, date: backup_date, startTime: backup_time,
          type: 'secundaria', status: 'agendada', confirmationStatus: 'confirmada', city: clientCityBackup, source: 'portal',
        });
        await txClient.query('UPDATE recordings SET rescheduled_to_id = $1 WHERE id = $2', [newBackupRec.id, cancelledRec.id]);
        await txClient.query('COMMIT');
      } catch (txErr) {
        await txClient.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        txClient.release();
      }
      return res.json({ success: true });
    }

    /* ── check_special_availability — smart wizard step ── */
    if (action === 'check_special_availability') {
      const { requested_date, requested_time } = req.body;
      if (!requested_date) return res.status(400).json({ error: 'requested_date required' });
      if (!isValidAgendaDate(requested_date) || (requested_time && !isValidAgendaTime(requested_time))) {
        return res.status(400).json({ error: 'Data ou horário inválido' });
      }

      const clientCitySpecial = await getClientCityForAgenda(client_id);
      const settings = await getCompanySettingsForCity(clientCitySpecial);
      const rawDur = settings?.recording_duration || 2;
      const duration = rawDur > 10 ? rawDur : rawDur * 60;
      const buffer = 30;
      const workDays = settings?.work_days || ['segunda','terca','quarta','quinta','sexta'];
      const shiftAStart = settings?.shift_a_start || '08:30';
      const shiftAEnd = settings?.shift_a_end || '12:00';
      const shiftBStart = settings?.shift_b_start || '14:30';
      const shiftBEnd = settings?.shift_b_end || '18:00';

      const dayMap = { 0:'domingo',1:'segunda',2:'terca',3:'quarta',4:'quinta',5:'sexta',6:'sabado' };
      const reqDow = dayMap[new Date(requested_date + 'T12:00:00').getDay()];

      // Check if outside business hours
      let outsideHours = false;
      if (!workDays.includes(reqDow)) {
        outsideHours = true;
      }
      if (requested_time) {
        const [rh, rm] = requested_time.split(':').map(Number);
        const reqMin = rh * 60 + rm;
        const [sah, sam] = shiftAStart.split(':').map(Number);
        const [saeh, saem] = shiftAEnd.split(':').map(Number);
        const [sbh, sbm] = shiftBStart.split(':').map(Number);
        const [sbeh, sbem] = shiftBEnd.split(':').map(Number);
        const inA = reqMin >= (sah*60+sam) && reqMin + duration <= (saeh*60+saem);
        const inB = reqMin >= (sbh*60+sbm) && reqMin + duration <= (sbeh*60+sbem);
        if (!inA && !inB) outsideHours = true;
      }

      if (outsideHours) {
        return res.json({
          outside_hours: true,
          message: 'Este horário está fora do horário comercial da agência. Entre em contato diretamente com Thiago ou Victor para verificar a disponibilidade.',
          contact_names: ['Thiago', 'Victor']
        });
      }

      // Check responsible videomaker availability
      const { rows: [clientData] } = await pool.query('SELECT videomaker_id, company_name FROM clients WHERE id = $1', [client_id]);
      let mainVmId = clientData?.videomaker_id;
      if (!mainVmId) {
        const { rows: [lastRec] } = await pool.query(`SELECT videomaker_id FROM recordings WHERE client_id = $1 AND videomaker_id IS NOT NULL ORDER BY date DESC LIMIT 1`, [client_id]);
        mainVmId = lastRec?.videomaker_id;
      }

      let mainVmBusy = false;
      let mainVmName = '';
      let mainVmSlots = [];
      let nearestAvailableDate = null;

      if (mainVmId) {
        const { rows: [vmProfile] } = await pool.query('SELECT name FROM profiles WHERE id = $1', [mainVmId]);
        mainVmName = vmProfile?.name || 'Videomaker';

        // Check if main VM has conflict at requested time
        if (requested_time) {
          const { rows: conflicts } = await pool.query(`SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`, [mainVmId, requested_date]);
          const [rh, rm] = requested_time.split(':').map(Number);
          const reqStart = rh * 60 + rm;
          mainVmBusy = conflicts.some(c => {
            const [ch, cm] = c.start_time.split(':').map(Number);
            const cStart = ch * 60 + cm;
            return reqStart < cStart + duration + buffer && reqStart + duration + buffer > cStart;
          });
        }

        // Get available slots for main VM on requested date
        const { rows: existing } = await pool.query(`SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`, [mainVmId, requested_date]);
        const occupied = existing.map(r => { const [h, m] = r.start_time.split(':').map(Number); return { start: h*60+m, end: h*60+m+duration+buffer }; });
        const step = duration + buffer;
        const genSlots = (s, e) => {
          const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
          let cur = sh*60+sm; const end = eh*60+em; const sl = [];
          while (cur + duration <= end) {
            if (!occupied.some(o => cur < o.end && cur + duration + buffer > o.start))
              sl.push(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`);
            cur += step;
          }
          return sl;
        };
        mainVmSlots = [...genSlots(shiftAStart, shiftAEnd), ...genSlots(shiftBStart, shiftBEnd)];

        // If no slots on requested date, find nearest date with availability
        if (mainVmSlots.length === 0) {
          for (let i = 1; i <= 14; i++) {
            const d = new Date(requested_date + 'T12:00:00');
            d.setDate(d.getDate() + i);
            const dow = dayMap[d.getDay()];
            if (!workDays.includes(dow)) continue;
            const dateStr = d.toISOString().split('T')[0];
            const { rows: futureRecs } = await pool.query(`SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`, [mainVmId, dateStr]);
            const occ = futureRecs.map(r => { const [h, m] = r.start_time.split(':').map(Number); return { start: h*60+m, end: h*60+m+duration+buffer }; });
            const checkSlots = (s, e) => {
              const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
              let cur = sh*60+sm; const end = eh*60+em;
              while (cur + duration <= end) {
                if (!occ.some(o => cur < o.end && cur + duration + buffer > o.start)) return true;
                cur += step;
              }
              return false;
            };
            if (checkSlots(shiftAStart, shiftAEnd) || checkSlots(shiftBStart, shiftBEnd)) {
              nearestAvailableDate = dateStr;
              break;
            }
          }
        }
      }

      // Get alternative videomakers
      const alternativeVideomakers = [];
      // Só videomakers que atendem a cidade do cliente; gravações do dia numa consulta só
      const allVms = await listVideomakersForCity(clientCitySpecial, mainVmId || null);
      const { rows: altRecsSpecial } = allVms.length > 0
        ? await pool.query(
          `SELECT videomaker_id, start_time FROM recordings WHERE videomaker_id = ANY($1::uuid[]) AND date = $2 AND status != 'cancelada'`,
          [allVms.map(vm => vm.id), requested_date]
        )
        : { rows: [] };
      for (const vm of allVms) {
        const vmRecs = altRecsSpecial.filter(r => String(r.videomaker_id) === String(vm.id));
        const occ = vmRecs.map(r => { const [h, m] = r.start_time.split(':').map(Number); return { start: h*60+m, end: h*60+m+duration+buffer }; });
        const sl = [];
        const genAltSlots = (s, e) => {
          const [sh, sm] = s.split(':').map(Number); const [eh, em] = e.split(':').map(Number);
          let cur = sh*60+sm; const end = eh*60+em;
          while (cur + duration <= end) {
            if (!occ.some(o => cur < o.end && cur + duration + buffer > o.start))
              sl.push(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`);
            cur += duration + buffer;
          }
        };
        genAltSlots(shiftAStart, shiftAEnd);
        genAltSlots(shiftBStart, shiftBEnd);
        if (sl.length > 0) alternativeVideomakers.push({ id: vm.id, name: vm.name, available_slots: sl, total_free: sl.length });
      }
      alternativeVideomakers.sort((a, b) => b.total_free - a.total_free);

      return res.json({
        outside_hours: false,
        main_videomaker: mainVmId ? { id: mainVmId, name: mainVmName, busy_at_time: mainVmBusy, available_slots: mainVmSlots, nearest_available_date: nearestAvailableDate } : null,
        alternative_videomakers: alternativeVideomakers,
      });
    }

    /* ── request_special ── */
    if (action === 'request_special') {
      const { requested_date, requested_time, comment, selected_videomaker_id } = req.body;
      if (!requested_date || !comment) return res.status(400).json({ error: 'requested_date and comment required' });
      if (!isValidAgendaDate(requested_date) || (requested_time && !isValidAgendaTime(requested_time))) {
        return res.status(400).json({ error: 'Data ou horário inválido' });
      }
      if (requested_date < brtDateString()) return res.status(400).json({ error: 'Escolha uma data a partir de hoje' });

      const { rows: [clientSpecial] } = await pool.query('SELECT company_name, videomaker_id FROM clients WHERE id = $1', [client_id]);
      const clientCityRequest = await getClientCityForAgenda(client_id);
      // Videomaker escolhido no portal precisa atender a cidade do cliente
      if (selected_videomaker_id && selected_videomaker_id !== clientSpecial?.videomaker_id
          && !(await isVideomakerForCity(selected_videomaker_id, clientCityRequest))) {
        return res.status(400).json({ error: 'Videomaker indisponível para este cliente' });
      }
      let specialVmId = selected_videomaker_id || clientSpecial?.videomaker_id || null;

      if (!specialVmId) {
        const { rows: [lastClientRec] } = await pool.query(`SELECT videomaker_id FROM recordings WHERE client_id = $1 AND videomaker_id IS NOT NULL ORDER BY date DESC, created_at DESC LIMIT 1`, [client_id]);
        specialVmId = lastClientRec?.videomaker_id || null;
      }
      if (!specialVmId) {
        // Fallback: o videomaker menos ocupado no dia, entre os que atendem a cidade do cliente
        const { rows: [fallbackVm] } = await pool.query(
          `SELECT p.id FROM profiles p JOIN user_roles ur ON ur.user_id = p.id LEFT JOIN recordings r ON r.videomaker_id = p.id AND r.date = $1 AND r.status != 'cancelada' WHERE ur.role = 'videomaker'${clientCityRequest ? ` AND ${userServesCitySql('p.id', '$2')}` : ''} GROUP BY p.id, p.name ORDER BY COUNT(r.id) ASC, p.name ASC LIMIT 1`,
          clientCityRequest ? [requested_date, clientCityRequest] : [requested_date]
        );
        specialVmId = fallbackVm?.id || null;
      }
      if (!specialVmId) return res.status(400).json({ error: 'Nenhum videomaker disponível para esta solicitação' });

      const newSpecialRec = await insertPublicRecording(pool, {
        clientId: client_id, videomakerId: specialVmId, date: requested_date, startTime: requested_time || '09:00',
        type: 'extra', status: 'solicitada', confirmationStatus: 'pendente', city: clientCityRequest, source: 'portal',
      });
      await pool.query(`INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)`,
        [client_id, '📨 Solicitação enviada', `Sua solicitação de gravação especial para ${requested_date} foi enviada para aprovação. Aguarde a confirmação da equipe.`, 'info']);
      await notifyPortalTeam(client_id, ['admin', 'social_media'], 'Solicitação de gravação especial', `${clientSpecial?.company_name || 'Cliente'}: ${comment} — Data: ${requested_date} ${requested_time || ''} — AGUARDANDO APROVAÇÃO`, 'warning', '/relacionamento');
      return res.json({ success: true, recording_id: newSpecialRec?.id });
    }

    /* ── approve_special / reject_special: só a equipe (Relacionamento) ── */
    // Login da equipe com papel admin, social_media (isAdminUser) ou gestor_projetos: o client_id do portal não basta
    if (action === 'approve_special' || action === 'reject_special') {
      const canDecideSpecial = caller?.kind === 'team'
        && (await isAdminUser(caller.user) || await userHasAssignedRole(caller.user, 'gestor_projetos'));
      if (!canDecideSpecial) return res.status(403).json({ error: 'Só a equipe aprova ou recusa gravação especial' });
    }

    /* ── approve_special ── */
    if (action === 'approve_special') {
      const { recording_id: approveRecId } = req.body;
      if (!approveRecId) return res.status(400).json({ error: 'recording_id required' });
      const { rows: [recApprove] } = await pool.query(
        `UPDATE recordings SET status = 'agendada', confirmation_status = 'pendente'
          WHERE id = $1 AND client_id = $2 AND status = 'solicitada'
          RETURNING client_id, date::text, start_time`,
        [approveRecId, client_id]
      );
      if (!recApprove) return res.status(409).json({ error: 'Solicitação não encontrada ou já respondida' });
      await pool.query(`INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)`,
        [recApprove.client_id, '✅ Gravação aprovada!', `Sua solicitação de gravação especial para ${recApprove.date} às ${recApprove.start_time} foi aprovada pela equipe! Confirme sua presença.`, 'success']);
      return res.json({ success: true });
    }

    /* ── reject_special ── */
    if (action === 'reject_special') {
      const { recording_id: rejectRecId, rejection_reason } = req.body;
      if (!rejectRecId || !rejection_reason) return res.status(400).json({ error: 'recording_id and rejection_reason required' });
      const { rows: [recReject] } = await pool.query(
        `UPDATE recordings SET status = 'cancelada'
          WHERE id = $1 AND client_id = $2 AND status = 'solicitada'
          RETURNING client_id, date::text, start_time`,
        [rejectRecId, client_id]
      );
      if (!recReject) return res.status(409).json({ error: 'Solicitação não encontrada ou já respondida' });
      await pool.query(`INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)`,
        [recReject.client_id, '❌ Solicitação não aprovada', `Sua solicitação de gravação para ${recReject.date} não pôde ser atendida: ${rejection_reason}`, 'warning']);
      return res.json({ success: true });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Portal recordings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. Portal Media Proxy (streaming-first + 480p warmup) ───────
// (Imports removidos daqui e movidos para o topo do arquivo para evitar SyntaxError de declaração dupla)


const execFileAsync = promisify(execFile);
const TRANSCODE_CACHE_DIR = '/tmp/pulse-video-cache';
const activePortalTranscodes = new Map();

try { fs.mkdirSync(TRANSCODE_CACHE_DIR, { recursive: true }); } catch {}

setInterval(() => {
  try {
    const files = fs.readdirSync(TRANSCODE_CACHE_DIR);
    const now = Date.now();
    for (const f of files) {
      const fp = path.join(TRANSCODE_CACHE_DIR, f);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(fp);
    }
  } catch {}
}, 6 * 60 * 60 * 1000);

function getPortalMediaContentType(filePathOrUrl = '') {
  if (/\.mp4(\?|$)/i.test(filePathOrUrl)) return 'video/mp4';
  if (/\.webm(\?|$)/i.test(filePathOrUrl)) return 'video/webm';
  if (/\.mov(\?|$)/i.test(filePathOrUrl)) return 'video/quicktime';
  if (/\.png(\?|$)/i.test(filePathOrUrl)) return 'image/png';
  if (/\.jpe?g(\?|$)/i.test(filePathOrUrl)) return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * Caminho relativo (dentro de /uploads/) que o proxy de mídia aceita servir.
 * Recusa '..' depois do decode (ex.: '..%2f..%2f.env'), barras invertidas,
 * byte nulo, arquivos/pastas ocultos e os vídeos de treinamento — esses só
 * saem por /api/training/stream com token assinado.
 */
function portalMediaRelativePath(targetUrl) {
  const relative = uploadRelativePath(targetUrl);
  if (!relative) return null;
  if (relative.includes('\\') || relative.includes('\0')) return null;
  const segments = relative.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((seg) => seg.startsWith('.'))) return null;
  if (segments[0].toLowerCase() === 'training-videos') return null;
  return segments.join('/');
}

function resolvePortalMediaLocalPath(targetUrl) {
  const relative = portalMediaRelativePath(targetUrl);
  if (!relative) return null;

  // Só aceita arquivos que estejam DENTRO de uma raiz de uploads (também
  // depois de seguir symlinks), nunca qualquer caminho do disco.
  for (const root of uploadRoots()) {
    try {
      const candidate = path.resolve(root, relative);
      if (!candidate.startsWith(`${root}${path.sep}`)) continue;
      if (!fs.existsSync(candidate)) continue;
      const realRoot = fs.realpathSync(root);
      const realCandidate = fs.realpathSync(candidate);
      if (!realCandidate.startsWith(`${realRoot}${path.sep}`)) continue;
      if (!fs.statSync(realCandidate).isFile()) continue;
      return realCandidate;
    } catch {
      continue;
    }
  }
  return null;
}

function setPortalMediaHeaders(res, { contentType, quality, contentLength, contentRange, acceptRanges = true, cacheControl = 'public, max-age=3600' }) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Video-Quality', quality);
  if (contentType) res.setHeader('Content-Type', contentType);
  if (acceptRanges) res.setHeader('Accept-Ranges', 'bytes');
  if (typeof contentLength === 'number') res.setHeader('Content-Length', contentLength);
  if (contentRange) res.setHeader('Content-Range', contentRange);
}

function streamLocalPortalMedia(req, res, filePath, quality) {
  const stat = fs.statSync(filePath);
  const totalSize = stat.size;
  const contentType = getPortalMediaContentType(filePath);
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (!match) {
      return res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
    }

    let start = match[1] ? Number.parseInt(match[1], 10) : 0;
    let end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;

    if (!match[1] && match[2]) {
      const suffixLength = Number.parseInt(match[2], 10);
      start = Math.max(totalSize - suffixLength, 0);
      end = totalSize - 1;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || start >= totalSize) {
      return res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
    }

    end = Math.min(end, totalSize - 1);
    const chunkSize = end - start + 1;

    setPortalMediaHeaders(res, {
      contentType,
      quality,
      contentLength: chunkSize,
      contentRange: `bytes ${start}-${end}/${totalSize}`,
    });

    return fs.createReadStream(filePath, { start, end }).pipe(res.status(206));
  }

  setPortalMediaHeaders(res, {
    contentType,
    quality,
    contentLength: totalSize,
  });

  return fs.createReadStream(filePath).pipe(res.status(200));
}

// Teto global de ffmpeg simultâneos: o proxy é público (portal do cliente),
// então sem limite qualquer pessoa poderia disparar transcodes em paralelo.
const MAX_PORTAL_TRANSCODES = 2;

function hasPortalTranscodeSlot() {
  return activePortalTranscodes.size < MAX_PORTAL_TRANSCODES;
}

// Fila do ffmpeg do 480p: no máximo 2 transcodificações ao mesmo tempo. Sem ela, abrir
// a biblioteca subia um ffmpeg por vídeo e a VPS inteira ficava lenta.
const PORTAL_TRANSCODE_CONCURRENCY = 2;
let portalTranscodesRunning = 0;
const portalTranscodeQueue = [];
function runPortalTranscodeSlot(task) {
  return new Promise((resolve, reject) => {
    const start = () => {
      portalTranscodesRunning++;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          portalTranscodesRunning--;
          const next = portalTranscodeQueue.shift();
          if (next) next();
        });
    };
    if (portalTranscodesRunning < PORTAL_TRANSCODE_CONCURRENCY) start();
    else portalTranscodeQueue.push(start);
  });
}

function warmPortal480pCache(sourcePath, cachedFile) {
  if (fs.existsSync(cachedFile)) return Promise.resolve(cachedFile);
  const existingJob = activePortalTranscodes.get(cachedFile);
  if (existingJob) return existingJob;
  if (!hasPortalTranscodeSlot()) {
    return Promise.reject(new Error('fila de transcodificação cheia — servindo o original'));
  }

  const tempFile = `${cachedFile}.tmp`;
  const job = runPortalTranscodeSlot(() => execFileAsync('ffmpeg', [
    '-i', sourcePath,
    '-vf', 'scale=-2:480',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    '-y', tempFile,
  ], { timeout: 120000 }))
    .then(() => {
      fs.renameSync(tempFile, cachedFile);
      return cachedFile;
    })
    .catch((error) => {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
      throw error;
    })
    .finally(() => {
      activePortalTranscodes.delete(cachedFile);
    });

  activePortalTranscodes.set(cachedFile, job);
  return job;
}

app.all('/api/portal-media-proxy', async (req, res) => {
  try {
    const targetUrl = req.method === 'GET' ? req.query.url : req.body?.url;
    const quality = String((req.method === 'GET' ? req.query.quality : req.body?.quality) || 'original');

    if (!targetUrl) return res.status(400).json({ error: 'url is required' });

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      if (parsedUrl.origin !== 'https://agenciapulse.tech' || !parsedUrl.pathname.startsWith('/uploads/')) {
        return res.status(400).json({ error: 'URL not allowed' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    // Barra codificada (%2f / %5c), '..' depois do decode ou vídeo de treinamento: recusa.
    if (!portalMediaRelativePath(targetUrl)) {
      return res.status(400).json({ error: 'URL not allowed' });
    }

    const localSourcePath = resolvePortalMediaLocalPath(targetUrl);
    const isVideoFile = /\.(mp4|mov|webm)(\?|$)/i.test(targetUrl);

    if (quality === '480p' && isVideoFile && localSourcePath) {
      // Chave do cache pelo arquivo local (não pela URL com query string),
      // senão '?a=1', '?a=2'... disparariam um ffmpeg novo a cada pedido.
      const urlHash = crypto.createHash('md5').update(localSourcePath).digest('hex');
      const cachedFile = path.join(TRANSCODE_CACHE_DIR, `${urlHash}_480p.mp4`);

      if (fs.existsSync(cachedFile)) {
        return streamLocalPortalMedia(req, res, cachedFile, '480p-cached');
      }

      if (activePortalTranscodes.has(cachedFile) || hasPortalTranscodeSlot()) {
        warmPortal480pCache(localSourcePath, cachedFile)
          .catch((error) => console.error('ffmpeg warmup error:', error.message));
        return streamLocalPortalMedia(req, res, localSourcePath, 'original-warming-480p');
      }

      return streamLocalPortalMedia(req, res, localSourcePath, '480p-fallback');
    }

    if (localSourcePath) {
      return streamLocalPortalMedia(req, res, localSourcePath, quality === '480p' ? '480p-fallback' : 'original-local');
    }

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers.accept) headers.Accept = req.headers.accept;

    const upstream = await fetch(targetUrl, { headers, redirect: 'follow' });
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status).json({ error: 'Failed to fetch media' });
    }

    const passthroughHeaders = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
    for (const h of passthroughHeaders) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    setPortalMediaHeaders(res, {
      contentType: upstream.headers.get('content-type') || getPortalMediaContentType(targetUrl),
      quality: quality === '480p' ? '480p-upstream-fallback' : 'original-upstream',
      cacheControl: upstream.headers.get('cache-control') || 'public, max-age=3600',
      acceptRanges: upstream.headers.get('accept-ranges') !== 'none',
    });

    res.status(upstream.status);

    if (upstream.body) {
      return Readable.fromWeb(upstream.body).pipe(res);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    console.error('portal-media-proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── 8. Meta OAuth ──────────────────────────────────────────
const META_API_BASE = 'https://graph.facebook.com/v21.0';
// Base da API do Instagram com Login do Instagram (perfil conectado direto, sem Página do Facebook)
const IG_API_BASE = 'https://graph.instagram.com/v21.0';

/**
 * Carrega a configuração Meta usada no OAuth (uma única regra para login, troca e diagnóstico).
 * Prefere o registro ativo mais recente que tenha o secret do Instagram.
 * Retorna também DE ONDE veio cada credencial — essencial para diagnosticar
 * "Error validating verification code" (quase sempre secret de outro app).
 */
async function loadMetaOAuthConfig(admin) {
  const { data: metaRows } = await admin.from('api_integrations').select('id, config, updated_at').eq('provider', 'meta_ads').eq('status', 'ativo').order('updated_at', { ascending: false });
  const rows = Array.isArray(metaRows) ? metaRows : [];
  const metaIntegration = rows.find(r => r?.config?.instagram_app_secret_encrypted) || rows[0] || null;
  const config = { ...((metaIntegration && metaIntegration.config) || {}) };
  for (const k of ['meta_app_id', 'meta_app_secret_encrypted', 'instagram_app_id', 'instagram_app_secret_encrypted']) {
    if (typeof config[k] === 'string') config[k] = config[k].replace(/\s+/g, '');
  }
  const appId = config.meta_app_id || null;
  const igAppId = config.instagram_app_id || appId || INSTAGRAM_APP_ID_DEFAULT;
  const igAppIdSource = config.instagram_app_id ? 'instagram_app_id' : (appId ? 'meta_app_id (fallback)' : 'padrão do servidor');
  const igAppSecret = config.instagram_app_secret_encrypted || config.meta_app_secret_encrypted || null;
  const igSecretSource = config.instagram_app_secret_encrypted ? 'Instagram App Secret' : (config.meta_app_secret_encrypted ? 'App Secret da Meta (fallback)' : 'nenhum');
  return { rows, metaIntegration, config, appId, igAppId, igAppIdSource, igAppSecret, igSecretSource };
}

/** Apenas os 4 últimos caracteres — suficiente para comparar com o painel da Meta sem expor o segredo. */
const secretSuffix = (s) => (s ? '••••' + String(s).slice(-4) : '(vazio)');
/** Códigos OAuth do Instagram já trocados (uso único; mantidos por 1h em memória). */
const USED_IG_CODES = new Set();

// Login do Facebook que devolve várias Páginas: antes todas viravam contas do cliente e o
// robô publicava em todas (inclusive nas de outros clientes). Agora a pessoa escolhe UMA.
// O código OAuth é de uso único, então as Páginas (com os tokens) ficam só aqui, em memória,
// por 15 min; o navegador recebe só id, nome e @ do Instagram.
const FB_PAGE_SELECTIONS = new Map();
const FB_PAGE_SELECTION_TTL_MS = 15 * 60 * 1000;

function publicFacebookPageInfo(page) {
  return {
    id: String(page.id),
    name: page.name || String(page.id),
    instagram_username: page.instagram_business_account?.username || null,
    picture: fbPagePictureUrl(page.id),
  };
}

function createFacebookPageSelection(clientId, pages) {
  const now = Date.now();
  for (const [key, entry] of FB_PAGE_SELECTIONS) {
    if (entry.expiresAt < now) FB_PAGE_SELECTIONS.delete(key);
  }
  const key = crypto.randomBytes(24).toString('hex');
  FB_PAGE_SELECTIONS.set(key, { clientId: String(clientId), pages, expiresAt: now + FB_PAGE_SELECTION_TTL_MS });
  return { needs_page_selection: true, selection_key: key, pages: pages.map(publicFacebookPageInfo) };
}

/** Escolha pendente; só vale para o mesmo cliente que fez o login. */
function getFacebookPageSelection(key, clientId) {
  const entry = FB_PAGE_SELECTIONS.get(String(key || ''));
  if (!entry || entry.expiresAt < Date.now() || entry.clientId !== String(clientId)) return null;
  return entry;
}

/**
 * Grava UMA Página do Facebook (e o Instagram ligado a ela) como conta do cliente.
 * Troca só o que veio por Página: o Instagram conectado direto (api_base='instagram')
 * é mantido e, nesse caso, o Instagram da Página não entra (seria uma segunda conta de IG).
 */
async function saveFacebookPageConnection(clientId, page, logMessage) {
  await ensureSocialPostsSchema();
  const expiration = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const connectedAccounts = [];
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`DELETE FROM social_accounts WHERE client_id = $1 AND COALESCE(api_base,'facebook') = 'facebook'`, [clientId]);
    const { rows: directIg } = await db.query(
      `SELECT account_name, username, instagram_business_id, profile_picture_url FROM social_accounts
        WHERE client_id = $1 AND platform = 'instagram' AND api_base = 'instagram' LIMIT 1`,
      [clientId]
    );
    await db.query(
      `INSERT INTO social_accounts (client_id, platform, facebook_page_id, account_name, username, profile_picture_url, access_token, status, token_expiration, api_base)
       VALUES ($1,'facebook',$2,$3,$4,$5,$6,'connected',$7,'facebook')`,
      [clientId, page.id, page.name, page.name, fbPagePictureUrl(page.id), page.access_token, expiration]
    );
    connectedAccounts.push({ platform: 'facebook', name: page.name, pageId: page.id });
    if (page.instagram_business_account && directIg.length === 0) {
      const ig = page.instagram_business_account;
      await db.query(
        `INSERT INTO social_accounts (client_id, platform, facebook_page_id, instagram_business_id, account_name, username, profile_picture_url, access_token, status, token_expiration, api_base)
         VALUES ($1,'instagram',$2,$3,$4,$5,$6,$7,'connected',$8,'facebook')`,
        [clientId, page.id, ig.id, ig.username || ig.name, ig.username || null, ig.profile_picture_url || null, page.access_token, expiration]
      );
      connectedAccounts.push({ platform: 'instagram', name: ig.username || ig.name, username: ig.username, businessId: ig.id, profilePicture: ig.profile_picture_url, pageId: page.id });
    } else if (directIg.length) {
      // O Instagram conectado direto continua valendo: vai na resposta para a tela não mostrá-lo como desconectado
      const ig = directIg[0];
      connectedAccounts.push({ platform: 'instagram', name: ig.username || ig.account_name, username: ig.username || ig.account_name, businessId: ig.instagram_business_id, profilePicture: ig.profile_picture_url, pageId: '', api_base: 'instagram' });
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
  if (logMessage) {
    await pool.query(
      `INSERT INTO integration_logs (client_id, platform, action, status, message) VALUES ($1,'facebook','oauth_connect','success',$2)`,
      [clientId, `${logMessage}: Página ${page.name}.`]
    ).catch(() => {});
  }
  return connectedAccounts;
}

/**
 * Diagnóstico das credenciais do Login do Instagram (somente admin).
 * Não expõe segredos: mostra só os 4 últimos caracteres e valida o par
 * App ID + Secret com a Meta (grant client_credentials, não cria nada).
 */
app.post('/api/meta-oauth-diagnose', async (req, res) => {
  try {
    const { admin } = await verifyAdmin(req);
    const loaded = await loadMetaOAuthConfig(admin);
    let secretCheck = { status: 'skipped', message: 'Sem App ID ou secret para testar.' };
    if (loaded.igAppId && loaded.igAppSecret) {
      try {
        const qs = new URLSearchParams({ client_id: String(loaded.igAppId), client_secret: String(loaded.igAppSecret), grant_type: 'client_credentials' });
        const r = await fetch(`${META_API_BASE}/oauth/access_token?${qs.toString()}`);
        const j = await r.json().catch(() => ({}));
        if (j.access_token) secretCheck = { status: 'ok', message: 'A Meta confirmou que este secret pertence ao App ID ' + loaded.igAppId + '.' };
        else {
          const msg = j.error?.message || JSON.stringify(j);
          secretCheck = /client secret|client_secret/i.test(msg)
            ? { status: 'invalid', message: 'Secret NÃO corresponde ao App ID ' + loaded.igAppId + ': ' + msg }
            : { status: 'inconclusive', message: 'A Meta não confirmou o par (pode ser normal para apps só do Instagram): ' + msg };
        }
      } catch (e) {
        secretCheck = { status: 'inconclusive', message: 'Falha ao consultar a Meta: ' + e.message };
      }
    }
    res.json({
      redirect_uri: META_OAUTH_REDIRECT_URI,
      active_rows: loaded.rows.length,
      integration_id: loaded.metaIntegration?.id || null,
      instagram_app_id: loaded.igAppId,
      instagram_app_id_source: loaded.igAppIdSource,
      meta_app_id: loaded.appId,
      instagram_secret: secretSuffix(loaded.config.instagram_app_secret_encrypted),
      meta_secret: secretSuffix(loaded.config.meta_app_secret_encrypted),
      secret_used: secretSuffix(loaded.igAppSecret),
      secret_used_source: loaded.igSecretSource,
      secret_check: secretCheck,
    });
  } catch (error) {
    const denied = /access required|unauthorized|token/i.test(error.message || '');
    res.status(denied ? 403 : 500).json({ error: error.message });
  }
});

/**
 * Linha da integração Meta que o servidor usa (a mesma escolhida no OAuth), sem filtro
 * de cidade: a integração é uma só para a agência. Sem linha ativa, a mais recente.
 */
async function findMetaIntegrationRow() {
  const loaded = await loadMetaOAuthConfig(getAdminClient());
  if (loaded.metaIntegration) {
    return { id: loaded.metaIntegration.id, status: 'ativo', config: loaded.metaIntegration.config || {}, activeRows: loaded.rows.length };
  }
  const { rows } = await pool.query(
    `SELECT id, status, config FROM api_integrations WHERE provider = 'meta_ads' ORDER BY updated_at DESC NULLS LAST LIMIT 1`
  );
  return rows[0] ? { id: rows[0].id, status: rows[0].status, config: rows[0].config || {}, activeRows: 0 } : null;
}

/**
 * Card "Integração Meta" (Configurações): lê e grava pela API, e não pelo /api/db/query,
 * que filtra api_integrations pela cidade — em Uruaçu o card não achava a linha de
 * Minaçu, mostrava "Pendente" e salvar criava uma segunda integração ativa.
 * Os secrets nunca voltam: só os 4 últimos caracteres.
 */
app.get('/api/meta-integration', async (req, res) => {
  try {
    await verifyAdmin(req);
    const row = await findMetaIntegrationRow();
    const config = row?.config || {};
    res.json({
      id: row?.id || null,
      status: row?.status || null,
      configured: row?.status === 'ativo' && !!config.meta_app_id,
      meta_app_id: config.meta_app_id || '',
      instagram_app_id: config.instagram_app_id || '',
      meta_secret: config.meta_app_secret_encrypted ? secretSuffix(config.meta_app_secret_encrypted) : null,
      instagram_secret: config.instagram_app_secret_encrypted ? secretSuffix(config.instagram_app_secret_encrypted) : null,
      active_rows: row?.activeRows || 0,
    });
  } catch (error) {
    // 401 sem sessão (o front renova e tenta de novo), 403 sem papel de admin
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

app.post('/api/meta-integration', async (req, res) => {
  try {
    const { user, admin } = await verifyAdmin(req);
    const b = req.body || {};
    const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, '') : '');
    const metaAppId = clean(b.meta_app_id);
    const instagramAppId = clean(b.instagram_app_id);
    const metaAppSecret = clean(b.meta_app_secret);
    const instagramAppSecret = clean(b.instagram_app_secret);
    if (!metaAppId) return res.status(400).json({ error: 'Preencha o App ID da Meta.' });
    // Valida ANTES de gravar qualquer coisa (antes a linha era gravada e só depois o secret recusado).
    // App Secrets são 32 caracteres hexadecimais; tokens (EAA..., IGAA...) não servem aqui.
    const isHexSecret = (v) => /^[a-f0-9]{32}$/i.test(v);
    for (const [label, val] of [['Meta App Secret', metaAppSecret], ['Instagram App Secret', instagramAppSecret]]) {
      if (val && !isHexSecret(val)) {
        return res.status(400).json({ error: `${label} inválido: deve ter 32 caracteres (letras a-f e números). O valor colado parece um token de acesso, não a "Chave secreta do app".` });
      }
    }

    const row = await findMetaIntegrationRow();
    const config = { ...(row?.config || {}), meta_app_id: metaAppId, credentials_updated_at: new Date().toISOString() };
    // Campo vazio = usa o App ID da Meta também no Login do Instagram (como antes)
    if (instagramAppId) config.instagram_app_id = instagramAppId; else delete config.instagram_app_id;
    if (metaAppSecret) { config.meta_app_secret_encrypted = metaAppSecret; config.meta_app_secret = '••••' + metaAppSecret.slice(-4); }
    if (instagramAppSecret) { config.instagram_app_secret_encrypted = instagramAppSecret; config.instagram_app_secret = '••••' + instagramAppSecret.slice(-4); }

    let integrationId = row?.id || null;
    if (integrationId) {
      await pool.query(
        `UPDATE api_integrations SET config = $2::jsonb, status = 'ativo', updated_at = now() WHERE id = $1`,
        [integrationId, JSON.stringify(config)]
      );
    } else {
      const { rows } = await pool.query(
        `INSERT INTO api_integrations (name, provider, api_type, endpoint_url, config, status, updated_at)
         VALUES ('Meta (Postagens Automáticas)', 'meta_ads', 'rest', $1, $2::jsonb, 'ativo', now()) RETURNING id`,
        [META_API_BASE, JSON.stringify(config)]
      );
      integrationId = rows[0]?.id || null;
    }
    try {
      await admin.from('api_integration_logs').insert({
        integration_id: integrationId, action: 'credenciais atualizadas (Configurações → Integração Meta)', status: 'success',
        details: { fields_updated: ['app_id', instagramAppId && 'instagram_app_id', metaAppSecret && 'app_secret', instagramAppSecret && 'instagram_app_secret'].filter(Boolean) },
        performed_by: user.id,
      });
    } catch { /* log é secundário */ }
    res.json({
      success: true,
      id: integrationId,
      configured: true,
      meta_secret: config.meta_app_secret_encrypted ? secretSuffix(config.meta_app_secret_encrypted) : null,
      instagram_secret: config.instagram_app_secret_encrypted ? secretSuffix(config.instagram_app_secret_encrypted) : null,
    });
  } catch (error) {
    console.error('meta-integration save error:', error);
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

/**
 * Quem pode mexer nas conexões sociais dos clientes: os mesmos papéis do menu
 * Conexões Sociais (admin, social_media, gestor_projetos, revisor_meta).
 */
async function verifySocialManager(req) {
  const ctx = await verifyUser(req);
  if (await isAdminUser(ctx.user)) return ctx;
  if (await userHasAssignedRole(ctx.user, 'gestor_projetos')) return ctx;
  if (await userHasAssignedRole(ctx.user, 'revisor_meta')) return ctx;
  throw new Error('Admin access required');
}

function socialAuthErrorStatus(error) {
  return error?.message === 'Admin access required' ? 403 : 401;
}

/** Status das rotas sociais que também têm erros internos: 401 sem login, 403 sem o papel, 500 o resto. */
function socialRouteErrorStatus(error) {
  if (error?.statusCode === 400) return 400;
  if (error?.message === 'Unauthorized') return 401;
  if (error?.message === 'Admin access required') return 403;
  return 500;
}

// Link de conexão: vale até expires_at e, depois do primeiro uso, só por mais 24 h
// (dá para conectar Instagram e depois Facebook na mesma visita, mas o link enviado
// pelo WhatsApp não fica valendo para sempre).
const SOCIAL_CONNECT_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Motivo para recusar o link ({ status, error }) ou null quando ele ainda vale. */
function socialConnectLinkProblem(link) {
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return { status: 410, error: 'Este link expirou. Peça um novo para a agência.' };
  }
  if (link.used_at && new Date(link.used_at).getTime() + SOCIAL_CONNECT_REUSE_WINDOW_MS < Date.now()) {
    return { status: 410, error: 'Este link já foi usado. Peça um novo para a agência.' };
  }
  return null;
}

/**
 * Cliente autorizado a conectar contas no /api/meta-oauth:
 * equipe logada (Clientes) usa o client_id do corpo; o cliente na página
 * pública /conectar-social usa o token do convite e o client_id vem do link.
 */
async function resolveMetaOAuthClientId(req) {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    const isTeam = await verifySocialManager(req).then(() => true).catch(() => false);
    if (isTeam) return req.body?.client_id || null;
  }
  const inviteToken = String(req.body?.invite_token || '').trim();
  if (!inviteToken) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  await ensureSocialPostsSchema();
  const { rows } = await pool.query(
    'SELECT client_id, expires_at, used_at FROM social_connect_links WHERE token = $1 LIMIT 1',
    [inviteToken]
  );
  if (!rows.length) throw Object.assign(new Error('Link inválido ou removido.'), { status: 401 });
  const problem = socialConnectLinkProblem(rows[0]);
  if (problem) throw Object.assign(new Error(problem.error), { status: problem.status });
  return rows[0].client_id;
}

app.post('/api/meta-oauth', async (req, res) => {
  let client_id;
  try {
    client_id = await resolveMetaOAuthClientId(req);
  } catch (authError) {
    return res.status(authError.status || 401).json({ error: authError.message || 'Unauthorized' });
  }

  try {
    const admin = getAdminClient();
    // redirect_uri ÚNICO: o mesmo texto vai na URL de login e na troca do código.
    // Valor do corpo é ignorado para nunca divergir (www, sem barra, preview…).
    const { action, code } = req.body;
    const redirect_uri = META_OAUTH_REDIRECT_URI;

    const loaded = await loadMetaOAuthConfig(admin);
    const { rows, metaIntegration, config } = loaded;
    if (!metaIntegration) return res.status(400).json({ error: 'Meta integration not configured' });
    if (rows.length > 1) console.warn('[meta-oauth] ' + rows.length + ' registros Meta ativos; usando', metaIntegration.id);
    const appId = loaded.appId;

    if (action === 'get_oauth_url') {
      if (!appId) return res.status(400).json({ error: 'Meta App ID not found' });
      const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,instagram_basic,instagram_content_publish,instagram_manage_insights';
      const state = JSON.stringify({ client_id });
      const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scopes}&state=${encodeURIComponent(state)}&response_type=code`;
      return res.json({ oauth_url: oauthUrl });
    }

    if (action === 'exchange_code') {
      if (!code || !redirect_uri || !client_id) return res.status(400).json({ error: 'Missing code, redirect_uri, or client_id' });
      const appSecret = config?.meta_app_secret_encrypted;
      if (!appId || !appSecret) return res.status(400).json({ error: 'Meta App ID or Secret not found' });

      const tokenRes = await fetch(`${META_API_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirect_uri)}&code=${code}`);
      const tokenData = await tokenRes.json();
      if (tokenData.error) return res.status(400).json({ error: 'Failed to exchange code: ' + (tokenData.error.message || JSON.stringify(tokenData.error)) });

      const longTokenRes = await fetch(`${META_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`);
      const longTokenData = await longTokenRes.json();
      const longToken = longTokenData.access_token || tokenData.access_token;

      const pagesRes = await fetch(`${META_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${longToken}`);
      const pagesData = await pagesRes.json();
      if (pagesData.error) return res.status(400).json({ error: 'Failed to fetch pages: ' + pagesData.error.message });

      const pages = pagesData.data || [];
      // Sem Página autorizada não apaga nada (antes o cliente ficava sem conta nenhuma)
      if (pages.length === 0) {
        return res.status(400).json({ error: 'Nenhuma Página do Facebook foi autorizada. Na tela da Meta, marque a Página do cliente e tente de novo.' });
      }
      // Várias Páginas (o login é de quem administra Páginas de vários clientes): escolher uma
      if (pages.length > 1) return res.json(createFacebookPageSelection(client_id, pages));

      const connectedAccounts = await saveFacebookPageConnection(client_id, pages[0], 'Conectada via OAuth');
      return res.json({ success: true, accounts: connectedAccounts, pages_found: pages.length });
    }

    // Segunda etapa do login do Facebook com várias Páginas: grava só a escolhida
    if (action === 'select_facebook_page') {
      const { selection_key, page_id } = req.body;
      if (!client_id || !selection_key || !page_id) return res.status(400).json({ error: 'Escolha a Página do cliente.' });
      const pending = getFacebookPageSelection(selection_key, client_id);
      if (!pending) return res.status(410).json({ error: 'A escolha da Página expirou. Clique em conectar de novo.' });
      const page = pending.pages.find(p => String(p.id) === String(page_id));
      if (!page) return res.status(400).json({ error: 'Página não encontrada entre as autorizadas.' });
      const connectedAccounts = await saveFacebookPageConnection(client_id, page, 'Conectada via OAuth (Página escolhida)');
      FB_PAGE_SELECTIONS.delete(String(selection_key));
      return res.json({ success: true, accounts: connectedAccounts, pages_found: pending.pages.length });
    }

    // ── Instagram Login direto (sem Página do Facebook) ──
    // Usa a "API do Instagram com Login do Instagram": o cliente entra com a
    // conta profissional do Instagram e autoriza a agência. Token fica só na VPS.
    const igAppId = loaded.igAppId;
    const igRedirect = META_OAUTH_REDIRECT_URI;
    const igAppSecret = loaded.igAppSecret;

    if (action === 'get_instagram_oauth_url') {
      if (!igAppId) return res.status(400).json({ error: 'Instagram App ID não configurado (Financeiro → Integrações → Meta)' });
      const scopes = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights';
      const state = JSON.stringify({ client_id, flow: 'instagram' });
      const oauthUrl = `https://www.instagram.com/oauth/authorize?client_id=${igAppId}&redirect_uri=${encodeURIComponent(igRedirect)}&scope=${scopes}&state=${encodeURIComponent(state)}&response_type=code&force_reauth=true`;
      console.log('[instagram-oauth] link gerado', { igAppId, redirect_uri: igRedirect, integration: metaIntegration.id });
      return res.json({ oauth_url: oauthUrl });
    }

    if (action === 'exchange_instagram_code') {
      if (!code || !redirect_uri || !client_id) return res.status(400).json({ error: 'Missing code, redirect_uri, or client_id' });
      if (!igAppId || !igAppSecret) return res.status(400).json({ error: 'Instagram App ID/Secret não configurados' });
      // App do Instagram separado exige o secret DELE; usar o secret da Meta gera
      // "Error validating verification code" (mensagem enganosa de redirect_uri).
      if (config?.instagram_app_id && String(config.instagram_app_id) !== String(appId) && !config?.instagram_app_secret_encrypted) {
        return res.status(400).json({ error: 'Falta o Instagram App Secret. Cole o secret do app do Instagram em Configurações → Integração Meta (o secret da Meta não serve para o App ID do Instagram).' });
      }

      // O código do Instagram é de uso único: bloqueia uma segunda troca do mesmo código
      // (duplo clique, duas abas, retorno duplicado do popup) que invalidaria a conexão.
      const cleanCode = String(code).trim().replace(/#_$/, '');
      if (USED_IG_CODES.has(cleanCode)) {
        return res.status(409).json({ error: 'Este código de autorização já foi usado. Clique em "Conectar Instagram" de novo para gerar um novo.' });
      }
      USED_IG_CODES.add(cleanCode);
      setTimeout(() => USED_IG_CODES.delete(cleanCode), 60 * 60 * 1000).unref?.();

      // 1) code → token curto (POST form-urlencoded)
      const form = new URLSearchParams({
        client_id: String(igAppId), client_secret: String(igAppSecret),
        grant_type: 'authorization_code', redirect_uri: igRedirect, code: cleanCode,
      });
      const shortRes = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
      const shortData = await shortRes.json().catch(() => ({}));
      if (!shortData.access_token) {
        const raw = shortData.error_message || shortData.error?.message || JSON.stringify(shortData);
        console.warn('[instagram-oauth] troca recusada', { igAppId, igAppIdSource: loaded.igAppIdSource, secret: secretSuffix(igAppSecret), secretSource: loaded.igSecretSource, integration: metaIntegration.id, activeRows: rows.length, redirect_uri, raw });
        const hint = /verification code|redirect_uri/i.test(raw)
          ? ` — Diagnóstico: App ID usado ${igAppId} (${loaded.igAppIdSource}); secret usado ${secretSuffix(igAppSecret)} (${loaded.igSecretSource}); redirect ${redirect_uri}. Compare o final do secret com "Chave secreta do app do Instagram" no painel da Meta (Login do Instagram → Configuração da API). Se for diferente, cole o correto em Configurações → Integração Meta → "Instagram App Secret" e use "Testar credenciais".`
          : '';
        return res.status(400).json({ error: 'Instagram recusou o código: ' + raw + hint });
      }

      // 2) token curto → token longo (60 dias)
      const longRes = await fetch(`${IG_API_BASE}/access_token?grant_type=ig_exchange_token&client_secret=${igAppSecret}&access_token=${shortData.access_token}`);
      const longData = await longRes.json().catch(() => ({}));
      const token = longData.access_token || shortData.access_token;
      const expiresIn = Number(longData.expires_in) || 60 * 24 * 60 * 60;

      // 3) perfil
      const meRes = await fetch(`${IG_API_BASE}/me?fields=user_id,username,account_type,profile_picture_url&access_token=${token}`);
      const me = await meRes.json().catch(() => ({}));
      if (me.error || !(me.user_id || me.id)) {
        return res.status(400).json({ error: 'Não foi possível ler o perfil do Instagram: ' + (me.error?.message || JSON.stringify(me)) });
      }
      const igUserId = String(me.user_id || me.id);
      if (me.account_type && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(String(me.account_type).toUpperCase())) {
        return res.status(400).json({ error: `A conta @${me.username} é pessoal. Converta para Profissional (Comercial ou Criador) nas configurações do Instagram e tente novamente.` });
      }

      await ensureSocialPostsSchema();
      // Substitui só a conta de Instagram; mantém Facebook se existir
      await pool.query(`DELETE FROM social_accounts WHERE client_id = $1 AND platform = 'instagram'`, [client_id]);
      await pool.query(
        `INSERT INTO social_accounts (client_id, platform, facebook_page_id, instagram_business_id, account_name, username, profile_picture_url, access_token, status, token_expiration, api_base)
         VALUES ($1,'instagram',NULL,$2,$3,$4,$5,$6,'connected',$7,'instagram')`,
        [client_id, igUserId, me.username || igUserId, me.username || null, me.profile_picture_url || null, token, new Date(Date.now() + expiresIn * 1000).toISOString()]
      );
      await enablePortalInsights(client_id);

      try { await admin.from('integration_logs').insert({ client_id, platform: 'instagram', action: 'oauth_connect', status: 'success', message: `Instagram @${me.username} conectado via Login do Instagram.` }); } catch {}

      return res.json({
        success: true,
        accounts: [{ platform: 'instagram', name: me.username, username: me.username, businessId: igUserId, profilePicture: me.profile_picture_url, pageId: '' }],
      });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Meta OAuth error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mesma linha do OAuth (loadMetaOAuthConfig): antes era LIMIT 1 sem ordem e, com duas
// linhas ativas, o token manual podia pegar a que não tem secret.
async function getMetaConfigFromDb() {
  const loaded = await loadMetaOAuthConfig(getAdminClient());
  return loaded.config || {};
}

/**
 * Salva um token gerado manualmente no painel da Meta (ex: token da conta ag.pulse).
 * Valida o token na API do Instagram/Facebook e insere/atualiza social_accounts.
 */
app.post('/api/social-accounts/manual-token', async (req, res) => {
  try {
    await verifySocialManager(req);
  } catch (authError) {
    return res.status(socialAuthErrorStatus(authError)).json({ error: authError.message || 'Unauthorized' });
  }

  try {
    const { client_id, platform, token: rawToken, account_name, instagram_business_id, facebook_page_id, api_base } = req.body;
    if (!client_id || client_id === 'new') return res.status(400).json({ error: 'Salve o cliente primeiro antes de colar o token.' });
    if (!platform || !['instagram', 'facebook'].includes(platform)) return res.status(400).json({ error: 'platform deve ser instagram ou facebook' });
    if (!rawToken || typeof rawToken !== 'string') return res.status(400).json({ error: 'token é obrigatório' });

    await ensureSocialPostsSchema();
    const token = rawToken.trim();
    const config = await getMetaConfigFromDb();

    // ── Instagram direto ──
    if (platform === 'instagram') {
      const meRes = await fetch(`${IG_API_BASE}/me?fields=user_id,username,account_type,profile_picture_url&access_token=${token}`);
      const me = await meRes.json().catch(() => ({}));
      if (me.error || !(me.user_id || me.id)) {
        return res.status(400).json({ error: 'Token inválido ou expirado: ' + (me.error?.message || JSON.stringify(me)) });
      }
      const igUserId = String(me.user_id || me.id);
      if (me.account_type && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(String(me.account_type).toUpperCase())) {
        return res.status(400).json({ error: `A conta @${me.username} é pessoal. Converta para Profissional (Comercial ou Criador) e tente novamente.` });
      }

      // Troca por token longo (60 dias) quando possível
      let longToken = token;
      let expiresIn = 60 * 24 * 60 * 60;
      const igAppSecret = config?.instagram_app_secret_encrypted || config?.meta_app_secret_encrypted;
      if (igAppSecret) {
        const longRes = await fetch(`${IG_API_BASE}/access_token?grant_type=ig_exchange_token&client_secret=${igAppSecret}&access_token=${token}`);
        const longData = await longRes.json().catch(() => ({}));
        if (longData.access_token) {
          longToken = longData.access_token;
          expiresIn = Number(longData.expires_in) || expiresIn;
        }
      }

      const name = me.username || account_name || igUserId;
      await pool.query(`DELETE FROM social_accounts WHERE client_id = $1 AND platform = 'instagram'`, [client_id]);
      await pool.query(
        `INSERT INTO social_accounts (client_id, platform, facebook_page_id, instagram_business_id, account_name, username, profile_picture_url, access_token, status, token_expiration, api_base)
         VALUES ($1,'instagram',NULL,$2,$3,$4,$5,$6,'connected',$7,'instagram')`,
        [client_id, igUserId, name, me.username || null, me.profile_picture_url || null, longToken, new Date(Date.now() + expiresIn * 1000).toISOString()]
      );
      await enablePortalInsights(client_id);
      return res.json({ success: true, accounts: [{ platform: 'instagram', name, username: name, businessId: igUserId, api_base: 'instagram' }] });

    }

    // ── Facebook (token de usuário → páginas) ──
    const pagesRes = await fetch(`${META_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}&access_token=${token}`);
    const pagesData = await pagesRes.json().catch(() => ({}));
    if (pagesData.error) return res.status(400).json({ error: 'Token inválido: ' + pagesData.error.message });
    const pages = pagesData.data || [];
    if (pages.length === 0) return res.status(400).json({ error: 'Nenhuma página do Facebook encontrada para esse token.' });

    // Token com várias Páginas: grava só a escolhida (antes todas viravam contas do cliente).
    // A tela manda de novo o mesmo token com facebook_page_id.
    let page = pages[0];
    if (facebook_page_id) {
      page = pages.find(p => String(p.id) === String(facebook_page_id));
      if (!page) return res.status(400).json({ error: 'Essa Página não está entre as do token.' });
    } else if (pages.length > 1) {
      return res.json({ needs_page_selection: true, pages: pages.map(publicFacebookPageInfo) });
    }

    // Preserva conexão direta do Instagram (api_base='instagram'), troca apenas o que veio via Página
    const connectedAccounts = await saveFacebookPageConnection(client_id, page, null);
    await enablePortalInsights(client_id);
    return res.json({ success: true, accounts: connectedAccounts, pages_found: pages.length });

  } catch (error) {
    console.error('Manual token error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 9. Meta Publish ────────────────────────────────────────
async function fetchMetaWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    // Sem espera na primeira chamada — só espaça entre retentativas.
    if (attempt > 0) await new Promise(r => setTimeout(r, 200));
    const response = await fetch(url, options);

    if (response.ok) return response;
    const body = await response.text();
    if (response.status === 429 || body.includes('too many calls') || response.status >= 500) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      continue;
    }
    throw new Error(`Meta API error [${response.status}]: ${body}`);
  }
  throw new Error('Max retries exceeded');
}

app.post('/api/meta-publish', async (req, res) => {
  try {
    await verifyAdmin(req);
  } catch (authError) {
    return res.status(socialAuthErrorStatus(authError)).json({ error: authError.message || 'Unauthorized' });
  }

  try {
    const admin = getAdminClient();
    const { integration_id, client_id, publish_type, media_url, caption, scheduled_time } = req.body;
    if (!integration_id || !client_id || !publish_type || !media_url) return res.status(400).json({ error: 'Missing required fields' });
    const { data: integration } = await admin.from('api_integrations').select('*').eq('id', integration_id).single();
    if (!integration || integration.status !== 'ativo') return res.status(400).json({ error: 'Integration not active' });
    const config = integration.config || {};
    const pageToken = config.meta_page_token_encrypted || config.meta_page_token;
    const igBusinessId = config.meta_ig_business_id;
    const pageId = config.meta_page_id;
    if (!pageToken || !igBusinessId || !pageId) throw new Error('Missing Meta credentials');

    let result;
    if (publish_type === 'feed') {
      const params = new URLSearchParams({ url: media_url, access_token: pageToken });
      if (caption) params.set('caption', caption);
      if (scheduled_time) { params.set('published', 'false'); params.set('scheduled_publish_time', String(scheduled_time)); }
      const response = await fetchMetaWithRetry(`${META_API_BASE}/${pageId}/photos?${params}`, { method: 'POST' });
      result = await response.json();
    } else if (publish_type === 'reels') {
      const cp = new URLSearchParams({ media_type: 'REELS', video_url: media_url, access_token: pageToken });
      if (caption) cp.set('caption', caption);
      const cr = await fetchMetaWithRetry(`${META_API_BASE}/${igBusinessId}/media?${cp}`, { method: 'POST' });
      const cd = await cr.json();
      if (!cd.id) throw new Error('Failed to create container');
      await waitForIgContainer(cd.id, pageToken, 30, META_API_BASE);

      result = await publishIgContainer(META_API_BASE, igBusinessId, cd.id, pageToken);

    } else if (publish_type === 'stories') {
      const isVideo = /\.(mp4|mov|webm)/i.test(media_url);
      const cp = new URLSearchParams({ media_type: 'STORIES', access_token: pageToken });
      if (isVideo) cp.set('video_url', media_url); else cp.set('image_url', media_url);
      const cr = await fetchMetaWithRetry(`${META_API_BASE}/${igBusinessId}/media?${cp}`, { method: 'POST' });
      const cd = await cr.json();
      if (isVideo) await waitForIgContainer(cd.id, pageToken, 20, META_API_BASE);
      result = await publishIgContainer(META_API_BASE, igBusinessId, cd.id, pageToken);

    }

    await admin.from('api_integration_logs').insert({ integration_id, action: `publicação ${publish_type}`, status: 'success', details: { client_id, media_id: result?.id, publish_type } });
    await admin.from('api_integrations').update({ last_checked_at: new Date().toISOString(), last_error: null, status: 'ativo' }).eq('id', integration_id);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Meta publish error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 10. Meta Store Credentials ─────────────────────────────
app.post('/api/meta-store-credentials', async (req, res) => {
  try {
    const { user, admin } = await verifyAdmin(req);
    const b = req.body || {};
    const clean = (v) => (typeof v === 'string' ? v.trim() : v);
    const { integration_id, secret_name, secret_value, meta_page_token, meta_ig_business_id, meta_page_id } = b;
    const meta_app_id = clean(b.meta_app_id), meta_app_secret = clean(b.meta_app_secret);
    const instagram_app_id = clean(b.instagram_app_id), instagram_app_secret = clean(b.instagram_app_secret);

    if (secret_name && secret_value) {
      const keyToProviderMap = { GOOGLE_GEMINI_API_KEY: 'ai_gemini', OPENAI_API_KEY: 'ai_openai', ANTHROPIC_API_KEY: 'ai_claude' };
      const dbProvider = keyToProviderMap[secret_name];
      if (!dbProvider) return res.status(400).json({ error: `Chave desconhecida: ${secret_name}` });
      const apiKey = String(secret_value).trim();
      // Grava com merge no próprio SQL (não troca o config inteiro). Com integration_id
      // vai na linha que a tela acabou de salvar; sem ele, na linha ativa mais recente
      // do provedor na cidade ativa.
      const keyParams = [apiKey, '••••' + apiKey.slice(-4), dbProvider];
      let target;
      if (integration_id) {
        keyParams.push(String(integration_id));
        target = 'id::text = $4';
      } else {
        const scopeCity = await tableHasCityColumn('api_integrations');
        const activeCity = scopeCity ? await resolveActiveCity(req, user.id, user) : null;
        const cityClause = scopeCity ? `AND ${cityVisibilityExpression('city', '$4')}` : '';
        if (scopeCity) keyParams.push(activeCity);
        target = `id = (SELECT id FROM api_integrations WHERE provider = $3 AND status = 'ativo' ${cityClause} ORDER BY updated_at DESC LIMIT 1)`;
      }
      const { rowCount } = await pool.query(
        `UPDATE api_integrations
            SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object('api_key_encrypted', $1::text, 'api_key_set', true, 'api_key_hint', $2::text),
                updated_at = now()
          WHERE provider = $3 AND ${target}`,
        keyParams
      );
      if (!rowCount) return res.status(404).json({ error: 'Configuração de IA não encontrada para gravar a chave' });
      return res.json({ success: true, message: `Secret ${secret_name} stored` });
    }

    if (!integration_id) return res.status(400).json({ error: 'integration_id is required' });
    // App Secrets da Meta/Instagram são sempre 32 caracteres hexadecimais (0-9, a-f).
    // Tokens de acesso (EAA..., IGAA..., terminados em "ZDZD") NÃO são secrets e quebram o OAuth.
    const isHexSecret = (s) => /^[a-f0-9]{32}$/i.test(s);
    for (const [label, val] of [['Meta App Secret', meta_app_secret], ['Instagram App Secret', instagram_app_secret]]) {
      if (val && !isHexSecret(val)) {
        return res.status(400).json({ error: `${label} inválido: deve ter 32 caracteres (letras a-f e números). O valor colado parece um token de acesso, não a "Chave secreta do app".` });
      }
    }
    const { data: current } = await admin.from('api_integrations').select('config').eq('id', integration_id).single();
    const updatedConfig = { ...(current?.config || {}) };
    if (meta_app_id) updatedConfig.meta_app_id = meta_app_id;
    if (meta_app_secret) { updatedConfig.meta_app_secret_encrypted = meta_app_secret; updatedConfig.meta_app_secret = '••••' + meta_app_secret.slice(-4); }
    if (meta_page_token) { updatedConfig.meta_page_token_encrypted = meta_page_token; updatedConfig.meta_page_token = '••••' + meta_page_token.slice(-4); }
    if (meta_ig_business_id) updatedConfig.meta_ig_business_id = meta_ig_business_id;
    if (meta_page_id) updatedConfig.meta_page_id = meta_page_id;
    if (instagram_app_id) updatedConfig.instagram_app_id = instagram_app_id;
    if (instagram_app_secret) { updatedConfig.instagram_app_secret_encrypted = instagram_app_secret; updatedConfig.instagram_app_secret = '••••' + instagram_app_secret.slice(-4); }
    updatedConfig.credentials_updated_at = new Date().toISOString();
    await admin.from('api_integrations').update({ config: updatedConfig, updated_at: new Date().toISOString() }).eq('id', integration_id);
    await admin.from('api_integration_logs').insert({ integration_id, action: 'credenciais atualizadas via backend seguro', status: 'success', details: { fields_updated: [meta_app_id && 'app_id', meta_app_secret && 'app_secret', meta_page_token && 'page_token', meta_ig_business_id && 'ig_business_id', meta_page_id && 'page_id'].filter(Boolean) }, performed_by: user.id });
    res.json({ success: true, message: 'Credentials stored securely' });
  } catch (error) {
    console.error('Store credentials error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 11. Meta Token Refresh ─────────────────────────────────
app.post('/api/meta-token-refresh', async (req, res) => {
  try {
    await verifySocialManager(req);
  } catch (authError) {
    return res.status(socialAuthErrorStatus(authError)).json({ error: authError.message || 'Unauthorized' });
  }

  try {
    const admin = getAdminClient();
    const { data: integrations } = await admin.from('api_integrations').select('*').eq('provider', 'meta_ads').eq('status', 'ativo');
    if (!integrations?.length) return res.json({ message: 'No active Meta integrations' });
    const results = [];
    for (const integration of integrations) {
      const config = integration.config || {};
      const token = config.meta_page_token_encrypted || config.meta_page_token;
      const appId = config.meta_app_id;
      const appSecret = config.meta_app_secret_encrypted || config.meta_app_secret;
      if (!token || !appId || !appSecret) { results.push({ id: integration.id, status: 'skipped' }); continue; }
      try {
        const r = await fetch(`${META_API_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`);
        const data = await r.json();
        if (data.access_token) {
          await admin.from('api_integrations').update({ config: { ...config, meta_page_token_encrypted: data.access_token, token_refreshed_at: new Date().toISOString(), token_expires_in: data.expires_in }, last_checked_at: new Date().toISOString(), last_error: null, status: 'ativo' }).eq('id', integration.id);
          results.push({ id: integration.id, status: 'refreshed' });
        } else { results.push({ id: integration.id, status: 'error', error: data.error?.message }); }
      } catch (err) { results.push({ id: integration.id, status: 'error', error: err.message }); }
    }
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── 11b. Postagem automática (fila + robô) ────────────────
// Fluxo: Social Media agenda (data/hora/legenda/mídia) → linha em scheduled_posts
// → worker roda a cada 60s → publica no perfil do cliente usando o token salvo
// em social_accounts (obtido via OAuth no cadastro do cliente).
const SOCIAL_POST_STATUSES = ['agendado', 'publicando', 'publicado', 'erro', 'cancelado'];
const SOCIAL_POST_MAX_ATTEMPTS = 3;
let socialPostsSchemaReady = false;

async function ensureSocialPostsSchema() {
  if (socialPostsSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL,
      delivery_id UUID,
      content_task_id UUID,
      platform TEXT NOT NULL DEFAULT 'instagram',
      publish_type TEXT NOT NULL DEFAULT 'reels',
      media_url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      scheduled_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'agendado',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      result JSONB,
      published_at TIMESTAMPTZ,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due ON scheduled_posts(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_posts_client ON scheduled_posts(client_id);
    ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS media_items JSONB;
    ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS story_link TEXT;
    ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS story_link_text TEXT;
    ALTER TABLE scheduled_posts ALTER COLUMN media_url DROP NOT NULL;
    ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS access_token TEXT NOT NULL DEFAULT '';
    ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS token_expiration TIMESTAMPTZ;
    ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS api_base TEXT NOT NULL DEFAULT 'facebook';
    ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS username TEXT;
    ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
    CREATE TABLE IF NOT EXISTS social_connect_links (
      token TEXT PRIMARY KEY,
      client_id UUID NOT NULL,
      created_by UUID,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_social_connect_links_client ON social_connect_links(client_id);
  `);
  socialPostsSchemaReady = true;
}
ensureSocialPostsSchema().catch(err => console.error('[social-posts] schema init failed:', err.message));

// ─── Links públicos de conexão (o próprio cliente autoriza sua conta) ───
// A agência gera um link com token temporário e envia ao cliente. O cliente
// abre o link, faz o login oficial na Meta e autoriza. Nenhuma senha ou token
// do cliente passa pelo nosso frontend — a troca acontece só nesta API.

/** Cria (ou renova) o link de autorização de um cliente. */
app.post('/api/social-connect-links', async (req, res) => {
  let created_by = null;
  try {
    const { user } = await verifySocialManager(req);
    created_by = user?.id || null;
  } catch (authError) {
    return res.status(socialAuthErrorStatus(authError)).json({ error: authError.message || 'Unauthorized' });
  }

  try {
    const { client_id, days = 14, reuse = false } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id é obrigatório' });
    await ensureSocialPostsSchema();

    const { rows: clientRows } = await pool.query(
      `SELECT id, company_name FROM clients WHERE id = $1 LIMIT 1`,
      [client_id]
    );
    if (!clientRows.length) return res.status(404).json({ error: 'Cliente não encontrado' });

    // reuse: devolve o link que o cliente já recebeu, se ainda vale (gerar outro derruba o anterior)
    if (reuse) {
      const { rows: current } = await pool.query(
        `SELECT token, expires_at, used_at FROM social_connect_links WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [client_id]
      );
      if (current[0] && !socialConnectLinkProblem(current[0])) {
        return res.json({
          token: current[0].token,
          path: `/conectar-social/${current[0].token}`,
          client_name: clientRows[0].company_name,
          expires_at: new Date(current[0].expires_at).toISOString(),
          reused: true,
        });
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    const validDays = Math.min(Math.max(Number(days) || 14, 1), 90);
    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

    await pool.query(`DELETE FROM social_connect_links WHERE client_id = $1`, [client_id]);
    await pool.query(
      `INSERT INTO social_connect_links (token, client_id, created_by, expires_at) VALUES ($1,$2,$3,$4)`,
      [token, client_id, created_by, expiresAt.toISOString()]
    );

    return res.json({
      token,
      path: `/conectar-social/${token}`,
      client_name: clientRows[0].company_name,
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('social-connect-links error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/** Página pública lê os dados mínimos do link (sem expor tokens). */
app.get('/api/social-connect/:token', async (req, res) => {
  try {
    await ensureSocialPostsSchema();
    const { rows } = await pool.query(
      `SELECT l.client_id, l.expires_at, l.used_at, c.company_name
         FROM social_connect_links l
         JOIN clients c ON c.id = l.client_id
        WHERE l.token = $1 LIMIT 1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Link inválido ou removido.' });
    const problem = socialConnectLinkProblem(rows[0]);
    if (problem) return res.status(problem.status).json({ error: problem.error });

    const { rows: accounts } = await pool.query(
      `SELECT platform, account_name, username, profile_picture_url FROM social_accounts WHERE client_id = $1 AND status = 'connected'`,
      [rows[0].client_id]
    );

    return res.json({
      client_id: rows[0].client_id,
      client_name: rows[0].company_name,
      expires_at: rows[0].expires_at,
      accounts,
    });
  } catch (error) {
    console.error('social-connect read error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/** Marca o link como usado depois que o cliente concluiu a autorização. */
app.post('/api/social-connect/:token/complete', async (req, res) => {
  try {
    await ensureSocialPostsSchema();
    const { rows } = await pool.query(
      'SELECT expires_at, used_at FROM social_connect_links WHERE token = $1 LIMIT 1',
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Link inválido ou removido.' });
    const problem = socialConnectLinkProblem(rows[0]);
    if (problem) return res.status(problem.status).json({ error: problem.error });
    // Guarda só o primeiro uso: a janela de 24 h conta dele e não se renova a cada conexão
    await pool.query(`UPDATE social_connect_links SET used_at = COALESCE(used_at, now()) WHERE token = $1`, [req.params.token]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


/**
 * Aguarda o container ficar pronto. Faz a primeira checagem quase imediata e usa
 * backoff curto (250ms → 2s), em vez de dormir 2s fixos antes de cada tentativa.
 * `maxTries` é mantido por compatibilidade e vira um orçamento de tempo (~2s por tentativa).
 */
async function waitForIgContainer(containerId, token, maxTries = 30, base = META_API_BASE) {
  const deadline = Date.now() + maxTries * 2000;
  let delay = 250;
  for (;;) {
    const sr = await fetchMetaWithRetry(`${base}/${containerId}?fields=status_code,status&access_token=${token}`, { method: 'GET' });
    const sd = await sr.json();
    if (sd.status_code === 'FINISHED') return true;
    if (sd.status_code === 'ERROR' || sd.status_code === 'EXPIRED') throw new Error(`Meta recusou a mídia (${sd.status || sd.status_code}). Verifique formato/tamanho do arquivo.`);
    if (Date.now() >= deadline) break;
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 2000);
  }
  throw new Error('Meta demorou demais para processar a mídia (timeout).');
}

/**
 * Publica um container já criado. A Meta às vezes devolve "Media ID is not available"
 * (código 9007 / subcódigo 2207027) mesmo depois do status FINISHED, porque o
 * processamento interno ainda está terminando. Nesse caso tentamos de novo com
 * espera curta e crescente (500ms → 4s) para publicar o quanto antes.
 */
async function publishIgContainer(base, igId, containerId, token, maxTries = 12) {
  let last = null;
  let delay = 500;
  for (let i = 0; i < maxTries; i++) {
    const r = await fetchMetaWithRetry(`${base}/${igId}/media_publish?creation_id=${containerId}&access_token=${token}`, { method: 'POST' });
    const d = await r.json();
    if (d && d.id) return d;
    last = d;
    const err = d && d.error;
    const transient = err && (err.code === 9007 || err.error_subcode === 2207027 || err.code === 4 || err.code === 2);
    if (!transient) return d;
    await new Promise(res => setTimeout(res, delay));
    delay = Math.min(delay * 2, 4000);
  }
  return last;
}



const IS_VIDEO_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;

/** Normaliza a lista de mídias do post (carrossel usa media_items, os demais usam media_url). */
function postMediaList(post) {
  const raw = post.media_items;
  const items = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw ? JSON.parse(raw) : []);
  const list = items
    .map(i => (typeof i === 'string' ? { url: i } : i))
    .filter(i => i && typeof i.url === 'string' && /^https?:\/\//i.test(i.url));
  if (list.length) return list;
  return post.media_url ? [{ url: post.media_url }] : [];
}

/**
 * A Meta baixa a mídia do nosso servidor. Se a URL não for pública e https,
 * a publicação falha com uma mensagem genérica — então validamos antes.
 */
async function assertPublicMedia(url) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`A mídia precisa estar em um endereço https público. Recebido: ${url}`);
  }
  try {
    let r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (r.status === 405 || r.status === 501) {
      r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1024' }, redirect: 'follow' });
    }
    if (!r.ok && r.status !== 206) {
      throw new Error(`o servidor respondeu ${r.status}`);
    }
    const type = (r.headers.get('content-type') || '').toLowerCase();
    if (type && !/^(image|video|application\/octet-stream|binary)/.test(type)) {
      throw new Error(`o endereço não devolveu um arquivo de imagem ou vídeo (${type})`);
    }
  } catch (err) {
    throw new Error(`A Meta não conseguiu baixar a mídia (${url}): ${err.message}`);
  }
}

/** Marca o cliente para exibir as métricas no portal assim que uma conta é conectada. */
async function enablePortalInsights(clientId) {
  try {
    await ensureSocialInsightsSchema();
    await pool.query(
      `UPDATE clients SET portal_insights_enabled = true WHERE id = $1`,
      [clientId]
    );
  } catch (err) {
    console.warn('[insights] não foi possível habilitar o portal:', err.message);
  }
}

/**
 * Publica no perfil de UM cliente usando o token da conta conectada.
 * @param account linha de social_accounts (instagram ou facebook)
 * @param post { publish_type: 'reels'|'feed'|'stories'|'carousel', media_url, media_items, caption, story_link }
 */
async function publishToClientAccount(account, post) {
  const token = account.access_token;
  if (!token) throw new Error(`Conta ${account.platform} sem token. Reconecte a conta no cadastro do cliente.`);
  const media = postMediaList(post);
  if (!media.length) throw new Error('Post sem mídia válida.');
  for (const item of media) await assertPublicMedia(item.url);
  const mainUrl = media[0].url;
  const isVideo = IS_VIDEO_RE.test(mainUrl);
  const caption = post.caption || '';


  if (account.platform === 'facebook') {
    const pageId = account.facebook_page_id;
    if (!pageId) throw new Error('Página do Facebook não identificada na conta conectada.');
    if (post.publish_type === 'carousel' && media.length > 1) {
      // Facebook: publica cada imagem sem aparecer no feed e junta tudo num único post
      const attached = [];
      for (const item of media) {
        if (IS_VIDEO_RE.test(item.url)) throw new Error('Carrossel no Facebook aceita apenas imagens.');
        const p = new URLSearchParams({ url: item.url, published: 'false', access_token: token });
        const r = await fetchMetaWithRetry(`${META_API_BASE}/${pageId}/photos?${p}`, { method: 'POST' });
        const d = await r.json();
        if (!d.id) throw new Error('Facebook recusou uma das imagens: ' + JSON.stringify(d));
        attached.push({ media_fbid: d.id });
      }
      const p = new URLSearchParams({ message: caption, access_token: token });
      p.set('attached_media', JSON.stringify(attached));
      const r = await fetchMetaWithRetry(`${META_API_BASE}/${pageId}/feed?${p}`, { method: 'POST' });
      return r.json();
    }
    if (isVideo) {
      const params = new URLSearchParams({ file_url: mainUrl, description: caption, access_token: token });
      const r = await fetchMetaWithRetry(`${META_API_BASE}/${pageId}/videos?${params}`, { method: 'POST' });
      return r.json();
    }
    const params = new URLSearchParams({ url: mainUrl, caption, access_token: token });
    const r = await fetchMetaWithRetry(`${META_API_BASE}/${pageId}/photos?${params}`, { method: 'POST' });
    return r.json();
  }

  // Instagram (Business/Creator) — via Página do Facebook OU Login direto do Instagram
  const igId = account.instagram_business_id;
  const IG_BASE = account.api_base === 'instagram' ? IG_API_BASE : META_API_BASE;
  if (!igId) throw new Error('Conta do Instagram não identificada. O perfil precisa ser Business/Criador e vinculado à página do Facebook.');

  // ── Carrossel: N containers filhos → container pai → publish
  if (post.publish_type === 'carousel') {
    if (media.length < 2) throw new Error('Carrossel precisa de pelo menos 2 mídias.');
    if (media.length > 10) throw new Error('Carrossel aceita no máximo 10 mídias.');
    // Cria todos os filhos em paralelo (mantendo a ordem) — antes era um de cada vez.
    const childIds = await Promise.all(media.map(async (item) => {
      const childVideo = IS_VIDEO_RE.test(item.url);
      const p = new URLSearchParams({ access_token: token, is_carousel_item: 'true' });
      if (childVideo) { p.set('media_type', 'VIDEO'); p.set('video_url', item.url); }
      else p.set('image_url', item.url);
      const r = await fetchMetaWithRetry(`${IG_BASE}/${igId}/media?${p}`, { method: 'POST' });
      const d = await r.json();
      if (!d.id) throw new Error('Meta recusou uma mídia do carrossel: ' + JSON.stringify(d));
      if (childVideo) await waitForIgContainer(d.id, token, 30, IG_BASE);
      return d.id;
    }));

    const pp = new URLSearchParams({ access_token: token, media_type: 'CAROUSEL', children: childIds.join(',') });
    if (caption) pp.set('caption', caption);
    const pr = await fetchMetaWithRetry(`${IG_BASE}/${igId}/media?${pp}`, { method: 'POST' });
    const pd = await pr.json();
    if (!pd.id) throw new Error('Meta não criou o carrossel: ' + JSON.stringify(pd));
    await waitForIgContainer(pd.id, token, 30, IG_BASE).catch(() => {});
    return publishIgContainer(IG_BASE, igId, pd.id, token);

  }

  const cp = new URLSearchParams({ access_token: token });
  if (post.publish_type === 'stories') {
    cp.set('media_type', 'STORIES');
    if (isVideo) cp.set('video_url', mainUrl); else cp.set('image_url', mainUrl);
    // Link no story (sticker) — só é aplicado por contas com permissão de link na API da Meta
    if (post.story_link && /^https?:\/\//i.test(post.story_link)) {
      cp.set('link', post.story_link);
      cp.set('link_attachment', post.story_link);
      if (post.story_link_text) cp.set('sticker_text', post.story_link_text);
    }
  } else if (post.publish_type === 'reels' || isVideo) {
    cp.set('media_type', 'REELS');
    cp.set('video_url', mainUrl);
    if (caption) cp.set('caption', caption);
  } else {
    cp.set('image_url', mainUrl);
    if (caption) cp.set('caption', caption);
  }
  let cr = await fetchMetaWithRetry(`${IG_BASE}/${igId}/media?${cp}`, { method: 'POST' });
  let cd = await cr.json();
  // Se a Meta recusar por causa do parâmetro de link do story, tenta de novo sem o link.
  if (!cd.id && post.publish_type === 'stories' && post.story_link) {
    cp.delete('link'); cp.delete('link_attachment'); cp.delete('sticker_text');
    cr = await fetchMetaWithRetry(`${IG_BASE}/${igId}/media?${cp}`, { method: 'POST' });
    cd = await cr.json();
  }
  if (!cd.id) throw new Error('Meta não criou o container de mídia: ' + JSON.stringify(cd));
  if (isVideo) await waitForIgContainer(cd.id, token, 60, IG_BASE);
  else await waitForIgContainer(cd.id, token, 10, IG_BASE).catch(() => {});
  return publishIgContainer(IG_BASE, igId, cd.id, token);

}

/** URL pública da foto de uma Página do Facebook (redireciona para a imagem). */
function fbPagePictureUrl(pageId) {
  return pageId ? `${META_API_BASE}/${pageId}/picture?type=normal` : null;
}

// Contas cuja foto já tentamos buscar (id → quando): perfil sem foto ou token vencido não
// é consultado de novo a cada abertura de Conexões Sociais.
const PROFILE_REFRESH_TRIED = new Map();
const PROFILE_REFRESH_RETRY_MS = 6 * 60 * 60 * 1000;

/** Busca @usuário e foto do perfil na Meta e atualiza a linha (melhor esforço). */
async function refreshAccountProfile(a) {
  try {
    const base = a.api_base === 'instagram' ? IG_API_BASE : META_API_BASE;
    if (a.platform === 'instagram' && a.instagram_business_id) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(`${base}/${a.instagram_business_id}?fields=username,profile_picture_url&access_token=${a.access_token}`, { signal: controller.signal })
        .finally(() => clearTimeout(timer));
      const d = await r.json().catch(() => ({}));
      if (!d.error && (d.username || d.profile_picture_url)) {
        await pool.query(`UPDATE social_accounts SET username = COALESCE($2, username), profile_picture_url = COALESCE($3, profile_picture_url) WHERE id = $1`,
          [a.id, d.username || null, d.profile_picture_url || null]);
        a.username = d.username || a.username;
        a.profile_picture_url = d.profile_picture_url || a.profile_picture_url;
      }
    } else if (a.platform === 'facebook' && a.facebook_page_id) {
      const pic = fbPagePictureUrl(a.facebook_page_id);
      await pool.query(`UPDATE social_accounts SET username = COALESCE(username, $2), profile_picture_url = COALESCE($3, profile_picture_url) WHERE id = $1`,
        [a.id, a.account_name, pic]);
      a.username = a.username || a.account_name;
      a.profile_picture_url = a.profile_picture_url || pic;
    }
  } catch { /* melhor esforço */ }
}

async function getConnectedAccounts(clientId) {
  const { rows } = await pool.query(
    `SELECT id, client_id, platform, facebook_page_id, instagram_business_id, account_name, username, profile_picture_url, access_token, token_expiration, status, api_base
     FROM social_accounts WHERE client_id = $1 AND status = 'connected'`,
    [clientId]
  );
  return rows;
}

function sanitizeAccount(a) {
  return {
    id: a.id, platform: a.platform, account_name: a.account_name,
    username: a.username || a.account_name,
    profile_picture_url: a.profile_picture_url || null,
    facebook_page_id: a.facebook_page_id, instagram_business_id: a.instagram_business_id,
    token_expiration: a.token_expiration, status: a.status,
    has_token: !!a.access_token,
    api_base: a.api_base || 'facebook',
    expiring_soon: !!a.token_expiration && new Date(a.token_expiration).getTime() - Date.now() < 7 * 86400000,
  };
}

// Colunas do kanban de conteúdo em que o card voltou para a produção: o post
// agendado não vale mais (o vídeo vai mudar ou ainda não foi aprovado).
const AUTOPOST_BLOCKING_CONTENT_COLUMNS = new Set(['ideias', 'captacao', 'edicao', 'pre_revisao', 'revisao', 'alteracao', 'envio']);
const DELIVERY_STATUS_LABELS = {
  revisao: 'Revisão', ajuste: 'Alteração', aprovacao_cliente: 'Enviado p/ cliente',
  entregue: 'Agendar', agendado: 'Agendado', postado: 'Postado',
};

/**
 * Confere, logo antes de publicar, se a entrega e o card ainda pedem esta postagem.
 * Vale para qualquer tela (kanban social, kanban de conteúdo, tráfego, agentes) e
 * para o card excluído. Devolve o motivo do cancelamento ou null quando pode publicar.
 * 'postado' na entrega é aceito: abas antigas marcavam 'postado' no horário, antes do robô.
 */
async function getAutoPostCancelReason(post) {
  let deliveryStatus = null;
  if (post.delivery_id) {
    const { rows } = await pool.query('SELECT status FROM social_media_deliveries WHERE id = $1', [post.delivery_id]);
    if (!rows.length) return 'a entrega foi excluída do kanban social';
    deliveryStatus = rows[0].status;
    if (!['agendado', 'postado'].includes(deliveryStatus)) {
      return `a entrega saiu de Agendado (está em "${DELIVERY_STATUS_LABELS[deliveryStatus] || deliveryStatus}")`;
    }
  }
  if (post.content_task_id) {
    const { rows } = await pool.query('SELECT kanban_column FROM content_tasks WHERE id = $1', [post.content_task_id]);
    if (!rows.length) return 'o card de conteúdo foi excluído';
    const column = rows[0].kanban_column;
    if (AUTOPOST_BLOCKING_CONTENT_COLUMNS.has(column)) return `o card de conteúdo voltou para "${column}"`;
    // "Postado!" manual (entrega postada e card arquivado): publicar agora duplicaria o post.
    if (deliveryStatus === 'postado' && column === 'arquivado') return 'o conteúdo já foi marcado como postado manualmente';
  }
  return null;
}

/** Contas repetidas da mesma rede no cliente (ex.: várias Páginas): não dá para saber qual é a dele. */
function duplicatedPlatformAccounts(accounts) {
  const byPlatform = new Map();
  for (const a of accounts) byPlatform.set(a.platform, [...(byPlatform.get(a.platform) || []), a]);
  return [...byPlatform.entries()].filter(([, list]) => list.length > 1);
}

async function getClientDisplayName(clientId) {
  try {
    const { rows } = await pool.query('SELECT company_name FROM clients WHERE id = $1', [clientId]);
    return rows[0]?.company_name || String(clientId);
  } catch {
    return String(clientId);
  }
}

/** Aviso para quem cuida das redes sociais (admin e social_media). */
async function notifySocialTeam(title, message) {
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, type, link)
     SELECT DISTINCT ur.user_id, $1, $2, 'error', '/entregas-social'
     FROM user_roles ur WHERE ur.role IN ('admin','social_media')`,
    [title, String(message).slice(0, 500)]
  ).catch(() => {});
}

// Posts em andamento neste processo (robô e "Publicar agora"): a recuperação não mexe neles.
const SOCIAL_POSTS_IN_FLIGHT = new Set();

/** Executa um post da fila. Nunca lança — grava resultado/erro na linha. */
async function runScheduledPost(post) {
  SOCIAL_POSTS_IN_FLIGHT.add(String(post.id));
  try {
    await runScheduledPostNow(post);
  } finally {
    SOCIAL_POSTS_IN_FLIGHT.delete(String(post.id));
  }
}

async function runScheduledPostNow(post) {
  let cancelReason = null;
  try {
    cancelReason = await getAutoPostCancelReason(post);
  } catch (err) {
    // Sem conseguir conferir a entrega, não publica (ela pode ter voltado para alteração).
    await pool.query(
      `UPDATE scheduled_posts SET status='erro', last_error=$2, updated_at=now() WHERE id=$1`,
      [post.id, `Não foi possível conferir a entrega antes de publicar: ${err.message}`.slice(0, 2000)]
    );
    return;
  }
  if (cancelReason) {
    await pool.query(
      `UPDATE scheduled_posts SET status='cancelado', last_error=$2, updated_at=now() WHERE id=$1`,
      [post.id, `Cancelado antes de publicar: ${cancelReason}.`]
    );
    if (post.created_by) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, 'Postagem automática cancelada', $2, 'info', '/entregas-social')`,
        [post.created_by, `${await getClientDisplayName(post.client_id)}: não publicado porque ${cancelReason}.`.slice(0, 500)]
      ).catch(() => {});
    }
    return;
  }

  const accounts = await getConnectedAccounts(post.client_id);
  const targets = accounts.filter(a => post.platform === 'both' ? true : a.platform === post.platform);
  const duplicated = duplicatedPlatformAccounts(targets);
  if (duplicated.length) {
    // Conexão antiga gravou várias Páginas/perfis no mesmo cliente: publicar em todas
    // espalharia o conteúdo em perfis de outros clientes. Não publica em nenhuma.
    const detail = duplicated
      .map(([platform, list]) => `${list.length} contas de ${platform} (${list.map(a => a.username || a.account_name).join(', ')})`)
      .join(' e ');
    const message = `Não publicado: o cliente tem ${detail}. Desconecte as que não são dele em Conexões Sociais e publique de novo.`;
    await pool.query(
      `UPDATE scheduled_posts SET status='erro', last_error=$2, attempts=attempts+1, updated_at=now() WHERE id=$1`,
      [post.id, message]
    );
    await notifySocialTeam('⚠️ Postagem automática bloqueada', `${await getClientDisplayName(post.client_id)}: ${message}`);
    return;
  }

  const results = [];
  const errors = [];
  if (targets.length === 0) errors.push(`Nenhuma conta ${post.platform === 'both' ? '' : post.platform + ' '}conectada para este cliente.`);
  for (const account of targets) {
    try {
      const r = await publishToClientAccount(account, post);
      results.push({ platform: account.platform, account: account.account_name, id: r?.id || r?.post_id || null, raw: r });
      await pool.query(
        `INSERT INTO integration_logs (client_id, platform, action, status, message) VALUES ($1,$2,'auto_publish','success',$3)`,
        [post.client_id, account.platform, `Publicado automaticamente (${post.publish_type}) em ${account.account_name}`]
      ).catch(() => {});
    } catch (err) {
      errors.push(`${account.platform}: ${err.message}`);
      await pool.query(
        `INSERT INTO integration_logs (client_id, platform, action, status, message) VALUES ($1,$2,'auto_publish','error',$3)`,
        [post.client_id, account.platform, err.message.slice(0, 900)]
      ).catch(() => {});
    }
  }

  const attempts = (post.attempts || 0) + 1;
  const partial = errors.length > 0 && results.length > 0;
  if (errors.length === 0 || partial) {
    // Saiu em pelo menos uma rede: não tenta de novo (duplicaria onde já saiu) e a entrega vira postada.
    await pool.query(
      `UPDATE scheduled_posts SET status='publicado', published_at=now(), result=$2, last_error=$4, attempts=$3, updated_at=now() WHERE id=$1`,
      [post.id, JSON.stringify(results), attempts, partial ? errors.join(' | ').slice(0, 2000) : null]
    );
    if (post.delivery_id) {
      await pool.query(`UPDATE social_media_deliveries SET status='postado', posted_at=CURRENT_DATE, updated_at=now() WHERE id=$1`, [post.delivery_id]).catch(() => {});
    }
    if (post.content_task_id) {
      // 'arquivado' é a coluna do conteúdo postado (igual ao botão "Postado!"); 'postado' não existe
      // no kanban de conteúdo e fazia o card reaparecer na Zona de Ideias.
      await pool.query(
        `UPDATE content_tasks SET kanban_column='arquivado', updated_at=now()
          WHERE id=$1 AND kanban_column IN ('agendamentos','acompanhamento','postado')`,
        [post.content_task_id]
      ).catch(() => {});
    }
    await pool.query(
      `INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1,'✅ Conteúdo publicado',$2,'success')`,
      [post.client_id, `Seu conteúdo foi publicado automaticamente${results[0]?.account ? ' em ' + results[0].account : ''}.`]
    ).catch(() => {});
    if (partial) {
      await notifySocialTeam(
        '⚠️ Postagem automática incompleta',
        `${await getClientDisplayName(post.client_id)}: publicado em ${results.map(r => r.platform).join(', ')}, mas falhou em ${errors.join(' | ')}`
      );
    }
    return;
  }

  const retry = attempts < SOCIAL_POST_MAX_ATTEMPTS;
  await pool.query(
    `UPDATE scheduled_posts
       SET status=$2, attempts=$3, last_error=$4, result=$5,
           scheduled_at = CASE WHEN $2='agendado' THEN now() + interval '5 minutes' ELSE scheduled_at END,
           updated_at=now()
     WHERE id=$1`,
    [post.id, retry ? 'agendado' : 'erro', attempts, errors.join(' | ').slice(0, 2000), JSON.stringify(results)]
  );
  if (!retry) {
    // Avisa a equipe de social media que a postagem falhou (com o nome do cliente, não o id)
    await notifySocialTeam('⚠️ Postagem automática falhou', `${await getClientDisplayName(post.client_id)}: ${errors[0]}`);
  }
}

const STUCK_POST_MESSAGE = 'Publicação interrompida (o servidor reiniciou no meio). Confira o perfil antes de publicar de novo.';

/**
 * Post preso em 'publicando' porque a API reiniciou no meio da publicação: vira 'erro'
 * com aviso (pode já ter saído na Meta), em vez de voltar sozinho para 'agendado'.
 * Roda a cada ciclo do robô e ignora os posts que este processo ainda está publicando.
 */
async function recoverStuckScheduledPosts() {
  const { rows } = await pool.query(
    `UPDATE scheduled_posts SET status='erro', last_error=$2, updated_at=now()
      WHERE status='publicando' AND updated_at < now() - interval '40 minutes'
        AND NOT (id::text = ANY($1::text[]))
      RETURNING id, client_id`,
    [[...SOCIAL_POSTS_IN_FLIGHT], STUCK_POST_MESSAGE]
  );
  for (const post of rows) {
    await notifySocialTeam('⚠️ Postagem automática interrompida', `${await getClientDisplayName(post.client_id)}: ${STUCK_POST_MESSAGE}`);
  }
}

let socialPostWorkerBusy = false;
async function processDueScheduledPosts() {
  if (socialPostWorkerBusy) return;
  socialPostWorkerBusy = true;
  try {
    await ensureSocialPostsSchema();
    try {
      await recoverStuckScheduledPosts();
    } catch (err) {
      console.error('[social-posts] recuperação de posts travados falhou:', err.message);
    }
    // Claim atômico: evita publicar duas vezes se houver mais de uma instância
    const { rows } = await pool.query(
      `UPDATE scheduled_posts SET status='publicando', updated_at=now()
       WHERE id IN (
         SELECT id FROM scheduled_posts
         WHERE status='agendado' AND scheduled_at <= now()
         ORDER BY scheduled_at ASC LIMIT 5 FOR UPDATE SKIP LOCKED
       ) RETURNING *`
    );
    for (const post of rows) {
      try { await runScheduledPost(post); }
      catch (err) {
        console.error('[social-posts] unexpected failure', post.id, err.message);
        await pool.query(`UPDATE scheduled_posts SET status='erro', last_error=$2, updated_at=now() WHERE id=$1`, [post.id, err.message]).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[social-posts] worker error:', err.message);
  } finally {
    socialPostWorkerBusy = false;
  }
}
setInterval(processDueScheduledPosts, 15_000);

// Renova tokens do Instagram (login direto) a cada 24h; tokens longos duram 60 dias
// e só podem ser renovados quando têm mais de 24h de vida e faltam menos de 60 dias.
async function refreshInstagramDirectTokens() {
  try {
    await ensureSocialPostsSchema();
    const { rows } = await pool.query(
      `SELECT id, client_id, account_name, access_token FROM social_accounts
       WHERE platform='instagram' AND api_base='instagram' AND status='connected' AND access_token <> ''
         AND (token_expiration IS NULL OR token_expiration < now() + interval '30 days')`
    );
    for (const acc of rows) {
      try {
        const r = await fetch(`${IG_API_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${acc.access_token}`);
        const d = await r.json();
        if (d.access_token) {
          await pool.query(`UPDATE social_accounts SET access_token=$2, token_expiration=$3 WHERE id=$1`,
            [acc.id, d.access_token, new Date(Date.now() + (Number(d.expires_in) || 5184000) * 1000).toISOString()]);
        } else if (d.error) {
          console.warn('[ig-refresh] falhou para', acc.account_name, d.error.message);
          if (d.error.code === 190) await pool.query(`UPDATE social_accounts SET status='expired' WHERE id=$1`, [acc.id]);
        }
      } catch (err) { console.warn('[ig-refresh] erro', acc.account_name, err.message); }
    }
  } catch (err) { console.error('[ig-refresh] job error', err.message); }
}
setInterval(refreshInstagramDirectTokens, 24 * 60 * 60 * 1000);
setTimeout(refreshInstagramDirectTokens, 30_000);
// Posts travados em 'publicando' depois de um restart do PM2: recoverStuckScheduledPosts,
// a cada ciclo do robô (vão para 'erro' com aviso, sem republicar sozinhos).

// Status de conexão do cliente (sem expor tokens)
app.get('/api/social-posts/accounts/:clientId', async (req, res) => {
  try {
    await verifySocialManager(req);
    await ensureSocialPostsSchema();
    const accounts = await getConnectedAccounts(req.params.clientId);
    res.json({ accounts: accounts.map(sanitizeAccount) });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

// Visão geral de conexões de TODOS os clientes (sem expor tokens)
app.get('/api/social-posts/accounts-overview', async (req, res) => {
  try {
    await verifySocialManager(req);
    await ensureSocialPostsSchema();
    await ensureSocialInsightsSchema();
    const { rows: clients } = await pool.query(
      `SELECT id, company_name AS name, city, COALESCE(portal_insights_enabled, false) AS portal_insights_enabled
       FROM clients WHERE COALESCE(status,'ativo') <> 'inativo' ORDER BY company_name`
    );
    const { rows: accounts } = await pool.query(
      `SELECT id, client_id, platform, facebook_page_id, instagram_business_id, account_name, username, profile_picture_url, access_token, token_expiration, status, api_base
       FROM social_accounts WHERE status = 'connected'`
    );
    // Preenche @usuário/foto de contas conectadas antes dessa melhoria (melhor esforço, sem travar a lista)
    // Sem segurar a resposta (a foto aparece na próxima carga) e sem repetir a mesma conta por 6 h
    const now = Date.now();
    const missing = accounts
      .filter(a => !a.profile_picture_url && now - (PROFILE_REFRESH_TRIED.get(a.id) || 0) > PROFILE_REFRESH_RETRY_MS)
      .slice(0, 20);
    for (const a of missing) PROFILE_REFRESH_TRIED.set(a.id, now);
    if (missing.length) Promise.all(missing.map(a => refreshAccountProfile({ ...a }))).catch(() => {});
    const byClient = new Map();
    for (const a of accounts) {
      if (!byClient.has(a.client_id)) byClient.set(a.client_id, []);
      byClient.get(a.client_id).push(sanitizeAccount(a));
    }
    res.json({
      clients: clients.map(c => ({ ...c, accounts: byClient.get(c.id) || [] })),
    });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

// ─── 11c. Métricas do Instagram (relatório mensal + portal do cliente) ───────
// Busca alcance, seguidores, visitas ao perfil, cliques no link e desempenho
// por publicação direto na API da Meta usando o token já salvo em social_accounts.
let socialInsightsSchemaReady = false;
async function ensureSocialInsightsSchema() {
  if (socialInsightsSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_insights_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      account_name TEXT,
      data JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT social_insights_period_uniq UNIQUE (client_id, period_start, period_end)
    );
    CREATE INDEX IF NOT EXISTS idx_social_insights_client ON social_insights_snapshots(client_id);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_insights_enabled BOOLEAN NOT NULL DEFAULT false;
  `);
  socialInsightsSchemaReady = true;
}
ensureSocialInsightsSchema().catch(err => console.error('[insights] schema init failed:', err.message));

/** GET simples na Graph API, lançando o erro devolvido pela Meta. */
async function metaGetJson(url) {
  const r = await fetchMetaWithRetry(url, { method: 'GET' });
  const d = await r.json().catch(() => ({}));
  if (d && d.error) throw new Error(d.error.message || 'Erro na API da Meta');
  return d || {};
}

const DAY_SECONDS = 86400;

/** Quebra o período em janelas de no máximo 30 dias (limite da Meta). */
function insightWindows(startMs, endMs) {
  const out = [];
  let cursor = startMs;
  while (cursor <= endMs) {
    const next = Math.min(cursor + 29 * DAY_SECONDS * 1000, endMs);
    out.push([Math.floor(cursor / 1000), Math.floor(next / 1000)]);
    cursor = next + DAY_SECONDS * 1000;
  }
  return out;
}

/** Série diária de uma métrica de conta. Nunca lança — devolve [] em caso de erro. */
async function fetchDailyMetric(base, igId, token, metric, windows, extra = '') {
  const series = [];
  for (const [s, u] of windows) {
    try {
      const d = await metaGetJson(
        `${base}/${igId}/insights?metric=${metric}&period=day&since=${s}&until=${u}${extra}&access_token=${token}`
      );
      const values = d?.data?.[0]?.values || [];
      for (const v of values) {
        series.push({ date: (v.end_time || '').slice(0, 10), value: Number(v.value) || 0 });
      }
    } catch (err) {
      console.warn(`[insights] métrica ${metric} indisponível:`, err.message);
    }
  }
  return series;
}

/** Valor total de uma métrica (API v21 exige metric_type=total_value para várias). */
async function fetchTotalMetric(base, igId, token, metric, windows) {
  let total = 0;
  let ok = false;
  for (const [s, u] of windows) {
    try {
      const d = await metaGetJson(
        `${base}/${igId}/insights?metric=${metric}&metric_type=total_value&period=day&since=${s}&until=${u}&access_token=${token}`
      );
      const tv = d?.data?.[0]?.total_value?.value;
      if (typeof tv === 'number') { total += tv; ok = true; }
    } catch (err) {
      console.warn(`[insights] total ${metric} indisponível:`, err.message);
    }
  }
  return ok ? total : null;
}

/** Tenta uma métrica de publicação isoladamente para que uma métrica negada não esconda as demais. */
async function fetchMediaMetric(base, mediaId, token, metric) {
  try {
    const d = await metaGetJson(`${base}/${mediaId}/insights?metric=${metric}&access_token=${token}`);
    const item = d?.data?.[0];
    const value = item?.total_value?.value ?? item?.values?.[0]?.value;
    return typeof value === 'number' ? value : null;
  } catch (err) {
    console.warn(`[insights] mídia ${mediaId}/${metric} indisponível:`, err.message);
    return null;
  }
}

const sumSeries = (series) => series.reduce((acc, i) => acc + (i.value || 0), 0);

/** Roda fn em todos os itens com no máximo `limit` ao mesmo tempo (mantém a ordem do resultado). */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Métricas por publicação. 'plays', 'total_watch_time' e 'avg_watch_time' saíram da API
// da Meta (só davam erro e log); para reels valem os nomes ig_reels_*.
const IG_MEDIA_METRICS = ['reach', 'saved', 'total_interactions', 'shares', 'views'];
const IG_REELS_EXTRA_METRICS = ['ig_reels_video_view_total_time', 'ig_reels_avg_watch_time'];

/**
 * Reúne todas as métricas do período para uma conta do Instagram.
 * Cada bloco é tolerante a falha: se a Meta negar uma métrica, ela vem como null.
 */
async function fetchInstagramInsights(account, since, until) {
  const token = account.access_token;
  if (!token) throw new Error('Conta sem token. Reconecte o Instagram do cliente.');
  const direct = (account.api_base || 'facebook') === 'instagram';
  const base = direct ? IG_API_BASE : META_API_BASE;
  const igId = direct ? (account.instagram_business_id || 'me') : account.instagram_business_id;
  if (!igId) throw new Error('Conta do Instagram não identificada.');

  const startMs = new Date(`${since}T00:00:00Z`).getTime();
  const endMs = new Date(`${until}T00:00:00Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error('Período inválido.');
  }
  const windows = insightWindows(startMs, endMs);

  // Perfil e métricas da conta ao mesmo tempo (antes eram 13 chamadas uma depois da outra).
  // Cada métrica continua separada para que uma negada pela Meta não esconda as outras.
  const [
    profile, reachSeries, followerSeries, profileViews, websiteClicks, accountsEngaged,
    impressions, totalInteractions, likes, comments, saves, shares, replies,
  ] = await Promise.all([
    metaGetJson(`${base}/${igId}?fields=username,followers_count,media_count&access_token=${token}`).catch((err) => {
      console.warn('[insights] perfil indisponível:', err.message);
      return {};
    }),
    fetchDailyMetric(base, igId, token, 'reach', windows),
    fetchDailyMetric(base, igId, token, 'follower_count', windows),
    fetchTotalMetric(base, igId, token, 'profile_views', windows),
    fetchTotalMetric(base, igId, token, 'website_clicks', windows),
    fetchTotalMetric(base, igId, token, 'accounts_engaged', windows),
    fetchTotalMetric(base, igId, token, 'views', windows),
    fetchTotalMetric(base, igId, token, 'total_interactions', windows),
    fetchTotalMetric(base, igId, token, 'likes', windows),
    fetchTotalMetric(base, igId, token, 'comments', windows),
    fetchTotalMetric(base, igId, token, 'saves', windows),
    fetchTotalMetric(base, igId, token, 'shares', windows),
    fetchTotalMetric(base, igId, token, 'replies', windows),
  ]);

  // Publicações do período com desempenho individual
  const posts = [];
  try {
    const fields = [
      'id', 'caption', 'media_type', 'media_product_type', 'media_url', 'thumbnail_url',
      'permalink', 'timestamp', 'like_count', 'comments_count',
    ].join(',');
    let url = `${base}/${igId}/media?fields=${encodeURIComponent(fields)}&limit=50&access_token=${token}`;
    let pages = 0;
    const inPeriod = [];
    try {
      while (url && pages < 6) {
        const page = await metaGetJson(url);
        for (const m of page.data || []) {
          const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
          if (!ts || ts < startMs || ts > endMs + DAY_SECONDS * 1000) continue;
          inPeriod.push(m);
        }
        const oldest = (page.data || []).slice(-1)[0]?.timestamp;
        if (oldest && new Date(oldest).getTime() < startMs) break;
        url = page.paging?.next || null;
        pages += 1;
      }
    } catch (err) {
      // Página seguinte falhou: segue com as publicações já listadas (como antes)
      console.warn('[insights] lista de publicações incompleta:', err.message);
    }
    // Até 4 publicações ao mesmo tempo (antes uma de cada vez), sem estourar o limite da Meta
    const withMetrics = await mapWithConcurrency(inPeriod, 4, async (m) => {
      const metricNames = m.media_product_type === 'REELS'
        ? [...IG_MEDIA_METRICS, ...IG_REELS_EXTRA_METRICS]
        : IG_MEDIA_METRICS;
      const values = await Promise.all(metricNames.map(name => fetchMediaMetric(base, m.id, token, name)));
      return { m, ins: Object.fromEntries(metricNames.map((name, index) => [name, values[index]])) };
    });
    for (const { m, ins } of withMetrics) {
      posts.push({
        id: m.id,
        caption: (m.caption || '').slice(0, 220),
        media_type: m.media_product_type === 'REELS' ? 'REELS' : (m.media_type || 'IMAGE'),
        thumbnail: m.thumbnail_url || m.media_url || null,
        permalink: m.permalink || null,
        timestamp: m.timestamp || null,
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        reach: ins.reach ?? null,
        saved: ins.saved ?? null,
        interactions: ins.total_interactions ?? null,
        shares: ins.shares ?? null,
        views: ins.views ?? null,
        plays: null,
        total_watch_time: ins.ig_reels_video_view_total_time ?? null,
        avg_watch_time: ins.ig_reels_avg_watch_time ?? null,
      });
    }
  } catch (err) {
    console.warn('[insights] publicações indisponíveis:', err.message);
  }
  posts.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));

  const totalReach = reachSeries.length ? sumSeries(reachSeries) : null;
  const followersGained = followerSeries.length ? sumSeries(followerSeries) : null;
  const engagement = posts.reduce((acc, p) => acc + (p.interactions ?? (p.likes + p.comments)), 0);

  return {
    account_name: profile.username || account.account_name || null,
    period: { since, until },
    followers_total: profile.followers_count ?? null,
    followers_gained: followersGained,
    media_total: profile.media_count ?? null,
    reach: totalReach,
    views: impressions,
    profile_views: profileViews,
    website_clicks: websiteClicks,
    accounts_engaged: accountsEngaged,
    interactions: totalInteractions ?? (posts.length ? engagement : null),
    likes,
    comments,
    saves,
    shares,
    replies,
    posts_count: posts.length,
    avg_reach_per_post: posts.length && totalReach !== null
      ? Math.round(posts.reduce((a, p) => a + (p.reach ?? 0), 0) / posts.length)
      : null,
    reach_series: reachSeries,
    follower_series: followerSeries,
    posts: posts.slice(0, 30),
  };
}

/** Métricas permitidas de uma Página do Facebook conectada ao mesmo cliente. */
async function fetchFacebookInsights(account, since, until) {
  const token = account.access_token;
  const pageId = account.facebook_page_id;
  if (!token || !pageId) throw new Error('Página do Facebook sem identificação ou token.');
  const startMs = new Date(`${since}T00:00:00Z`).getTime();
  const endMs = new Date(`${until}T00:00:00Z`).getTime();
  const windows = insightWindows(startMs, endMs);
  let profile = {};
  try {
    profile = await metaGetJson(`${META_API_BASE}/${pageId}?fields=name,followers_count,fan_count&access_token=${token}`);
  } catch (err) {
    console.warn('[insights] página Facebook indisponível:', err.message);
  }
  const metricMap = {
    reach: 'page_impressions_unique',
    impressions: 'page_impressions',
    engaged_users: 'page_engaged_users',
    post_engagements: 'page_post_engagements',
    video_views: 'page_video_views',
    reactions: 'page_actions_post_reactions_total',
  };
  const entries = await Promise.all(Object.entries(metricMap).map(async ([key, metric]) => {
    const series = await fetchDailyMetric(META_API_BASE, pageId, token, metric, windows);
    return [key, series.length ? sumSeries(series) : null];
  }));
  return {
    account_name: profile.name || account.account_name || null,
    followers_total: profile.followers_count ?? profile.fan_count ?? null,
    ...Object.fromEntries(entries),
  };
}

/** Busca (com cache) as métricas do cliente no período. */
const INSIGHTS_MAX_RANGE_DAYS = 93;

/**
 * Período das métricas: datas reais, início ≤ fim, até 93 dias (cabe qualquer mês e o
 * atalho de 90 dias do portal) e fim até um mês à frente (o modo mensal manda o último
 * dia do mês). Sem limite, um período de anos virava milhares de chamadas à Meta e
 * gastava o limite de chamadas do perfil, o mesmo da postagem automática.
 * Devolve a mensagem do problema ou null.
 */
function insightsPeriodError(since, until) {
  const parse = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    const time = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(time);
    // Date.UTC joga ano < 100 para 19xx e aceita 31/02: só vale a data que volta igual
    if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
    return time;
  };
  const start = parse(since);
  const end = parse(until);
  if (start === null || end === null) return 'Período inválido (use datas reais no formato AAAA-MM-DD).';
  if (start > end) return 'A data inicial é depois da final.';
  if ((end - start) / 86400000 + 1 > INSIGHTS_MAX_RANGE_DAYS) return 'Escolha um período de até 3 meses.';
  if (end > Date.now() + 32 * 86400000) return 'A data final está muito no futuro.';
  return null;
}

// Busca sem cache já em andamento (mesmo cliente e período): quem pedir de novo espera a
// mesma resposta em vez de repetir todas as chamadas à Meta.
const INSIGHTS_IN_FLIGHT = new Map();

async function getClientInsights(clientId, since, until, { maxAgeMinutes = 180 } = {}) {
  const periodError = insightsPeriodError(since, until);
  if (periodError) throw Object.assign(new Error(periodError), { statusCode: 400 });
  await ensureSocialInsightsSchema();
  const { rows: cached } = await pool.query(
    `SELECT data, fetched_at FROM social_insights_snapshots
     WHERE client_id = $1 AND period_start = $2 AND period_end = $3`,
    [clientId, since, until]
  );
  const fresh = cached[0] && (Date.now() - new Date(cached[0].fetched_at).getTime()) < maxAgeMinutes * 60000;
  if (fresh) return { ...cached[0].data, cached: true, fetched_at: cached[0].fetched_at };

  const key = `${clientId}:${since}:${until}`;
  if (INSIGHTS_IN_FLIGHT.has(key)) return INSIGHTS_IN_FLIGHT.get(key);
  const pending = fetchAndCacheClientInsights(clientId, since, until, cached).finally(() => INSIGHTS_IN_FLIGHT.delete(key));
  INSIGHTS_IN_FLIGHT.set(key, pending);
  return pending;
}

async function fetchAndCacheClientInsights(clientId, since, until, cached) {
  const { rows: accounts } = await pool.query(
    `SELECT * FROM social_accounts WHERE client_id = $1 AND platform IN ('instagram', 'facebook') AND status = 'connected'`,
    [clientId]
  );
  const instagram = accounts.find(account => account.platform === 'instagram');
  const facebook = accounts.find(account => account.platform === 'facebook');
  if (!instagram && !facebook) {
    if (cached[0]) return { ...cached[0].data, cached: true, fetched_at: cached[0].fetched_at };
    throw new Error('Cliente sem Instagram ou Facebook conectado.');
  }

  try {
    const instagramData = instagram ? await fetchInstagramInsights(instagram, since, until) : null;
    const facebookData = facebook ? await fetchFacebookInsights(facebook, since, until).catch(err => ({ unavailable: err.message })) : null;
    const data = instagramData
      ? { ...instagramData, instagram: instagramData, facebook: facebookData }
      : {
          account_name: facebookData?.account_name || null,
          period: { since, until }, followers_total: null, followers_gained: null, media_total: null,
          reach: null, views: null, profile_views: null, website_clicks: null, accounts_engaged: null,
          interactions: null, likes: null, comments: null, saves: null, shares: null, replies: null,
          posts_count: 0, avg_reach_per_post: null, reach_series: [], follower_series: [], posts: [],
          instagram: null, facebook: facebookData,
        };
    await pool.query(
      `INSERT INTO social_insights_snapshots (client_id, period_start, period_end, account_name, data, fetched_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT ON CONSTRAINT social_insights_period_uniq
       DO UPDATE SET data = EXCLUDED.data, account_name = EXCLUDED.account_name, fetched_at = now()`,
      [clientId, since, until, data.account_name, JSON.stringify(data)]
    );
    return { ...data, cached: false, fetched_at: new Date().toISOString() };
  } catch (err) {
    if (cached[0]) return { ...cached[0].data, cached: true, stale_error: err.message, fetched_at: cached[0].fetched_at };
    throw err;
  }
}

// Métricas de um cliente (equipe)
app.get('/api/social-posts/insights', async (req, res) => {
  try {
    await verifySocialManager(req);
    const clientId = String(req.query.client_id || '').trim();
    const since = String(req.query.since || '').trim();
    const until = String(req.query.until || '').trim();
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!clientId) return res.status(400).json({ error: 'client_id é obrigatório' });
    if (!isDate(since) || !isDate(until)) return res.status(400).json({ error: 'Período inválido (use YYYY-MM-DD)' });
    const refresh = String(req.query.refresh || '') === '1';
    const insights = await getClientInsights(clientId, since, until, { maxAgeMinutes: refresh ? 0 : 180 });
    res.json({ insights });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

// Liga/desliga a exibição das métricas no portal do cliente
app.post('/api/social-posts/portal-insights', async (req, res) => {
  try {
    await verifySocialManager(req);
    await ensureSocialInsightsSchema();
    const { client_id, enabled } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id é obrigatório' });
    await pool.query(`UPDATE clients SET portal_insights_enabled = $2 WHERE id = $1`, [client_id, !!enabled]);
    res.json({ success: true, enabled: !!enabled });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});



// Biblioteca de mídias já existentes no sistema para um cliente (artes e vídeos)
app.get('/api/social-posts/media-library', async (req, res) => {
  try {
    await verifySocialManager(req);
    const clientId = String(req.query.client_id || '').trim();
    if (!clientId) return res.status(400).json({ error: 'client_id é obrigatório' });

    const isVideo = (u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u || '');
    const items = [];
    const seen = new Set();
    const push = (item) => {
      const url = (item.url || '').trim();
      if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
      seen.add(url);
      items.push({ ...item, url, kind: item.kind || (isVideo(url) ? 'video' : 'image') });
    };

    const [designs, portal, contents] = await Promise.all([
      pool.query(
        `SELECT id, title, mockup_url, attachment_url, format_type, updated_at
           FROM design_tasks WHERE client_id = $1 ORDER BY updated_at DESC LIMIT 120`,
        [clientId]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT id, title, file_url, thumbnail_url, content_type, created_at
           FROM client_portal_contents WHERE client_id = $1 ORDER BY created_at DESC LIMIT 120`,
        [clientId]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT id, title, edited_video_link, content_type, updated_at
           FROM content_tasks WHERE client_id = $1 AND edited_video_link IS NOT NULL
           ORDER BY updated_at DESC LIMIT 120`,
        [clientId]
      ).catch(() => ({ rows: [] })),
    ]);

    for (const d of designs.rows) {
      push({ id: `design-${d.id}`, title: d.title || 'Arte', url: d.mockup_url || d.attachment_url, thumbnail: d.mockup_url || d.attachment_url, source: 'Design', tag: d.format_type, date: d.updated_at });
    }
    for (const c of portal.rows) {
      push({ id: `portal-${c.id}`, title: c.title || 'Conteúdo', url: c.file_url, thumbnail: c.thumbnail_url || (isVideo(c.file_url) ? null : c.file_url), source: 'Portal', tag: c.content_type, date: c.created_at });
    }
    for (const t of contents.rows) {
      push({ id: `video-${t.id}`, title: t.title || 'Vídeo editado', url: t.edited_video_link, thumbnail: null, source: 'Edição', tag: t.content_type, date: t.updated_at });
    }

    res.json({ items });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

// Desconectar conta social de um cliente
app.post('/api/social-accounts/disconnect', async (req, res) => {
  try {
    await verifySocialManager(req);
    const { client_id, platform, account_id } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id é obrigatório' });
    if (account_id) {
      // Uma conta só (ex.: Página de outro cliente gravada por uma conexão antiga)
      await pool.query(`DELETE FROM social_accounts WHERE id = $1 AND client_id = $2`, [account_id, client_id]);
    } else if (platform) {
      await pool.query(`DELETE FROM social_accounts WHERE client_id = $1 AND platform = $2`, [client_id, platform]);
    } else {
      await pool.query(`DELETE FROM social_accounts WHERE client_id = $1`, [client_id]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

// ============================================================
// Conformidade Meta (App Review): desautorização e exclusão de dados
// Endpoints PÚBLICOS chamados pela Meta — autenticados via signed_request.
// ============================================================

/** Garante a tabela de solicitações de exclusão exigida pela Meta. */
async function ensureMetaDeletionSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meta_deletion_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      confirmation_code TEXT UNIQUE NOT NULL,
      meta_user_id TEXT,
      kind TEXT NOT NULL DEFAULT 'deletion',
      status TEXT NOT NULL DEFAULT 'concluido',
      accounts_removed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/** Decodifica e valida o signed_request enviado pela Meta (HMAC-SHA256 com o App Secret). */
function parseMetaSignedRequest(signedRequest, appSecret) {
  if (typeof signedRequest !== 'string' || !signedRequest.includes('.')) return null;
  const [encodedSig, payload] = signedRequest.split('.', 2);
  const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  let data;
  try {
    data = JSON.parse(b64(payload).toString('utf8'));
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', appSecret).update(payload).digest();
  const received = b64(encodedSig);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  return data;
}

/**
 * App Secrets da integração Meta (a mesma linha do OAuth). O callback pode vir assinado
 * pelo app da Meta ou pelo app do Instagram (quando são apps separados): os dois são testados.
 */
async function getMetaAppSecrets() {
  const { config } = await loadMetaOAuthConfig(getAdminClient());
  return [...new Set([config.meta_app_secret_encrypted, config.instagram_app_secret_encrypted].filter(Boolean))];
}

/** Remove todas as contas sociais vinculadas a um usuário Meta/Instagram. */
async function purgeMetaUserData(metaUserId) {
  if (!metaUserId) return 0;
  const { rowCount } = await pool.query(
    `DELETE FROM social_accounts
      WHERE facebook_page_id = $1 OR instagram_business_id = $1 OR external_user_id = $1`,
    [String(metaUserId)]
  ).catch(async () => pool.query(
    `DELETE FROM social_accounts WHERE facebook_page_id = $1 OR instagram_business_id = $1`,
    [String(metaUserId)]
  ));
  return rowCount || 0;
}

async function handleMetaComplianceRequest(req, res, kind) {
  try {
    await ensureMetaDeletionSchema();
    const appSecrets = await getMetaAppSecrets();
    if (!appSecrets.length) return res.status(503).json({ error: 'Meta integration not configured' });

    const signedRequest = req.body?.signed_request || req.query?.signed_request;
    const parsed = appSecrets.map(secret => parseMetaSignedRequest(signedRequest, secret)).find(Boolean) || null;
    if (!parsed) return res.status(400).json({ error: 'Invalid signed_request' });

    const metaUserId = parsed.user_id || parsed.user?.id || null;
    const removed = await purgeMetaUserData(metaUserId);
    const confirmationCode = crypto.randomBytes(12).toString('hex');

    await pool.query(
      `INSERT INTO meta_deletion_requests (confirmation_code, meta_user_id, kind, accounts_removed)
       VALUES ($1, $2, $3, $4)`,
      [confirmationCode, metaUserId ? String(metaUserId) : null, kind, removed]
    );

    const base = process.env.PUBLIC_APP_URL || 'https://agenciapulse.tech';
    return res.json({
      url: `${base}/exclusao-de-dados?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    console.error('[meta-compliance]', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// Callback de exclusão de dados (Data Deletion Request Callback)
app.post('/api/meta/data-deletion', (req, res) => handleMetaComplianceRequest(req, res, 'deletion'));
// Callback de desautorização (Deauthorize Callback)
app.post('/api/meta/deauthorize', (req, res) => handleMetaComplianceRequest(req, res, 'deauthorize'));

// Consulta pública do status de uma solicitação pelo código de confirmação
app.get('/api/meta/deletion-status/:code', async (req, res) => {
  try {
    await ensureMetaDeletionSchema();
    const { rows } = await pool.query(
      `SELECT confirmation_code, kind, status, accounts_removed, created_at
         FROM meta_deletion_requests WHERE confirmation_code = $1 LIMIT 1`,
      [req.params.code]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Código não encontrado' });
    res.json({ request: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});


app.get('/api/social-posts', async (req, res) => {
  try {
    await verifySocialManager(req);
    await ensureSocialPostsSchema();
    const { client_id, status, limit, delivery_ids } = req.query;
    const params = [];
    const where = [];
    if (client_id) { params.push(client_id); where.push(`sp.client_id = $${params.length}`); }
    if (status && SOCIAL_POST_STATUSES.includes(String(status))) { params.push(status); where.push(`sp.status = $${params.length}`); }
    // Posts de entregas específicas (o kanban social confere se a entrega agendada tem postagem automática)
    if (delivery_ids) {
      const ids = String(delivery_ids).split(',').map(s => s.trim()).filter(s => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 300);
      params.push(ids);
      where.push(`sp.delivery_id::text = ANY($${params.length}::text[])`);
    }
    params.push(Math.min(Number(limit) || 200, 500));
    const { rows } = await pool.query(
      `SELECT sp.*, c.company_name AS client_name
       FROM scheduled_posts sp LEFT JOIN clients c ON c.id = sp.client_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY sp.scheduled_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ posts: rows });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

app.post('/api/social-posts', async (req, res) => {
  try {
    const { user } = await verifySocialManager(req);
    await ensureSocialPostsSchema();
    const {
      client_id, delivery_id, content_task_id, platform = 'instagram', publish_type = 'reels',
      media_url, media_items, caption = '', scheduled_at, story_link, story_link_text,
    } = req.body || {};

    if (!client_id) return res.status(400).json({ error: 'client_id é obrigatório' });
    if (!['instagram', 'facebook', 'both'].includes(platform)) return res.status(400).json({ error: 'platform inválida' });
    if (!['reels', 'feed', 'stories', 'carousel'].includes(publish_type)) return res.status(400).json({ error: 'publish_type inválido' });

    const items = Array.isArray(media_items)
      ? media_items.map(i => (typeof i === 'string' ? { url: i } : i)).filter(i => i && typeof i.url === 'string')
      : [];
    const urls = items.length ? items.map(i => i.url) : (media_url ? [media_url] : []);
    if (!urls.length) return res.status(400).json({ error: 'Envie pelo menos uma mídia com link público (https://...)' });
    for (const u of urls) {
      if (!/^https?:\/\//i.test(u)) return res.status(400).json({ error: 'Todas as mídias precisam ser links públicos (https://...)' });
      if (/drive\.google\.com|dropbox\.com\/s\//i.test(u) && !/uc\?export=download|dl=1/i.test(u)) {
        return res.status(400).json({ error: 'Links de pasta/visualização do Drive/Dropbox não funcionam. Use o link direto do arquivo.' });
      }
    }
    if (publish_type === 'carousel' && urls.length < 2) return res.status(400).json({ error: 'Carrossel precisa de pelo menos 2 mídias.' });
    if (publish_type === 'carousel' && urls.length > 10) return res.status(400).json({ error: 'Carrossel aceita no máximo 10 mídias.' });
    if (story_link && !/^https?:\/\//i.test(story_link)) return res.status(400).json({ error: 'O link do story precisa começar com https://' });

    const when = new Date(scheduled_at);
    if (!scheduled_at || Number.isNaN(when.getTime())) return res.status(400).json({ error: 'scheduled_at inválido' });
    // Data no passado publicaria na hora (o robô pega tudo que já venceu). Folga de 5 min para relógio atrasado.
    if (when.getTime() < Date.now() - 5 * 60_000) return res.status(400).json({ error: 'O horário escolhido já passou. Escolha um horário futuro.' });
    if (caption.length > 2200) return res.status(400).json({ error: 'Legenda acima de 2200 caracteres (limite do Instagram)' });

    const accounts = await getConnectedAccounts(client_id);
    const needed = platform === 'both' ? ['instagram', 'facebook'] : [platform];
    const missing = needed.filter(p => !accounts.some(a => a.platform === p && a.access_token));
    if (missing.length) return res.status(400).json({ error: `Cliente sem conta conectada: ${missing.join(', ')}. Conecte em Clientes → editar → Redes Sociais.` });
    // Várias contas da mesma rede: o robô não publicaria (não sabe qual é a do cliente). Avisa já no agendamento.
    const duplicated = duplicatedPlatformAccounts(accounts.filter(a => needed.includes(a.platform)));
    if (duplicated.length) {
      const detail = duplicated.map(([p, list]) => `${list.length} contas de ${p} (${list.map(a => a.username || a.account_name).join(', ')})`).join(' e ');
      return res.status(400).json({ error: `O cliente tem ${detail}. Desconecte as que não são dele em Conexões Sociais antes de agendar.` });
    }

    // Evita duplicar a mesma entrega na fila (o post com erro também sai, senão "Publicar agora" nele duplicaria)
    if (delivery_id) {
      await pool.query(`UPDATE scheduled_posts SET status='cancelado', updated_at=now() WHERE delivery_id=$1 AND status IN ('agendado','erro')`, [delivery_id]);
    }
    const { rows } = await pool.query(
      `INSERT INTO scheduled_posts (client_id, delivery_id, content_task_id, platform, publish_type, media_url, media_items, caption, scheduled_at, created_by, story_link, story_link_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        client_id, delivery_id || null, content_task_id || null, platform, publish_type,
        urls[0], items.length ? JSON.stringify(items) : null, caption, when.toISOString(), user?.id || null,
        story_link || null, story_link_text || null,
      ]
    );
    res.json({ success: true, post: rows[0] });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

app.post('/api/social-posts/:id/cancel', async (req, res) => {
  try {
    await verifySocialManager(req);
    const { rowCount } = await pool.query(`UPDATE scheduled_posts SET status='cancelado', updated_at=now() WHERE id=$1 AND status IN ('agendado','erro')`, [req.params.id]);
    if (!rowCount) return res.status(400).json({ error: 'Só é possível cancelar posts agendados ou com erro' });
    res.json({ success: true });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

/**
 * Cancela os posts automáticos ainda pendentes de uma entrega e/ou de um card de conteúdo.
 * O front chama quando o card sai de Agendado (alteração, volta de coluna, "Postado!" manual)
 * ou é excluído. Quem move cards (editor, videomaker…) também chama, por isso vale para a
 * equipe interna toda; o robô confere a entrega de novo antes de publicar.
 */
app.post('/api/social-posts/cancel-linked', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    if (!(await userHasAnyRole(user, INTERNAL_TEAM_ROLES))) return res.status(403).json({ error: 'Sem permissão' });
    await ensureSocialPostsSchema();
    const { delivery_id, content_task_id, reason } = req.body || {};
    const isUuid = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
    const params = [];
    const conds = [];
    if (isUuid(delivery_id)) { params.push(delivery_id); conds.push(`delivery_id = $${params.length}`); }
    if (isUuid(content_task_id)) { params.push(content_task_id); conds.push(`content_task_id = $${params.length}`); }
    if (!conds.length) return res.status(400).json({ error: 'delivery_id ou content_task_id é obrigatório' });
    params.push(`Cancelado: ${String(reason || 'o card saiu de Agendado').slice(0, 200)}.`);
    const { rowCount } = await pool.query(
      `UPDATE scheduled_posts SET status='cancelado', last_error=$${params.length}, updated_at=now()
        WHERE status IN ('agendado','erro') AND (${conds.join(' OR ')})`,
      params
    );
    res.json({ success: true, cancelled: rowCount });
  } catch (error) {
    res.status(error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
  }
});

app.post('/api/social-posts/:id/publish-now', async (req, res) => {
  try {
    await verifySocialManager(req);
    const { rows } = await pool.query(
      `UPDATE scheduled_posts SET status='publicando', updated_at=now() WHERE id=$1 AND status IN ('agendado','erro') RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Post não está agendado nem com erro' });
    await runScheduledPost({ ...rows[0], attempts: SOCIAL_POST_MAX_ATTEMPTS - 1 });
    const { rows: fresh } = await pool.query(`SELECT * FROM scheduled_posts WHERE id=$1`, [req.params.id]);
    const ok = fresh[0]?.status === 'publicado';
    res.json({ success: ok, post: fresh[0], error: ok ? null : (fresh[0]?.last_error || 'Falha ao publicar') });

  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});

/**
 * Diagnóstico da conexão de um cliente: token, perfil, limite de publicações,
 * métricas e (opcionalmente) se a Meta consegue baixar uma mídia nossa.
 * Devolve uma lista de checagens em português — nunca expõe tokens.
 */
app.post('/api/social-posts/diagnose', async (req, res) => {
  try {
    await verifySocialManager(req);
    await ensureSocialPostsSchema();
    const { client_id, media_url } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id é obrigatório' });

    const checks = [];
    const add = (label, ok, detail) => checks.push({ label, ok, detail: detail || null });

    const accounts = await getConnectedAccounts(client_id);
    add('Contas conectadas', accounts.length > 0,
      accounts.length ? accounts.map(a => `${a.platform}: ${a.account_name}`).join(' · ') : 'Nenhuma conta conectada para este cliente.');

    for (const acc of accounts) {
      const base = acc.platform === 'instagram' && acc.api_base === 'instagram' ? IG_API_BASE : META_API_BASE;
      const id = acc.platform === 'facebook' ? acc.facebook_page_id : acc.instagram_business_id;
      try {
        const d = await metaGetJson(`${base}/${id}?fields=id,name,username&access_token=${acc.access_token}`);
        add(`Token de ${acc.account_name}`, true, `Válido (${d.username || d.name || id}).`);
      } catch (err) {
        add(`Token de ${acc.account_name}`, false, `${err.message}. Reconecte a conta.`);
        continue;
      }
      if (acc.platform === 'instagram') {
        try {
          const q = await metaGetJson(`${base}/${acc.instagram_business_id}?fields=content_publishing_limit&access_token=${acc.access_token}`);
          const used = q?.content_publishing_limit?.data?.[0]?.quota_usage;
          add('Limite de publicações do Instagram', true, used === undefined ? 'Disponível.' : `${used} de 50 publicações usadas nas últimas 24h.`);
        } catch (err) {
          add('Limite de publicações do Instagram', false, err.message);
        }
        try {
          await metaGetJson(`${base}/${acc.instagram_business_id}/insights?metric=reach&period=day&access_token=${acc.access_token}`);
          add('Métricas do perfil', true, 'A Meta já libera os números para este perfil.');
        } catch (err) {
          add('Métricas do perfil', false, `${err.message} (a permissão de métricas pode ainda estar em análise).`);
        }
      }
    }

    if (media_url) {
      try {
        await assertPublicMedia(String(media_url));
        add('Mídia acessível pela Meta', true, 'O arquivo abre publicamente.');
      } catch (err) {
        add('Mídia acessível pela Meta', false, err.message);
      }
    }

    const { rows: portalRow } = await pool.query(
      'SELECT COALESCE(portal_insights_enabled, false) AS on FROM clients WHERE id = $1',
      [client_id]
    );
    add('Métricas visíveis no portal do cliente', !!portalRow[0]?.on,
      portalRow[0]?.on ? 'A aba de desempenho aparece no portal.' : 'Ative o botão "Mostrar desempenho no portal".');

    const { rows: lastErr } = await pool.query(
      `SELECT last_error, updated_at FROM scheduled_posts
        WHERE client_id = $1 AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1`,
      [client_id]
    );
    if (lastErr[0]) add('Último erro registrado', false, lastErr[0].last_error);

    res.json({ checks, ok: checks.every(c => c.ok) });
  } catch (error) {
    res.status(socialRouteErrorStatus(error)).json({ error: error.message });
  }
});



// ─── 12. Reset Password ────────────────────────────────────
app.post('/api/reset-password', async (req, res) => {
  try {
    const { user, admin } = await verifyAdmin(req);
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'userId and newPassword (min 6 chars) required' });
    await assertCanManageUserAccount(user, { targetUserId: userId });
    await storeUserPassword(userId, newPassword);
    res.json({ success: true });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

// ─── 13. Delete User ────────────────────────────────────────
app.post('/api/delete-user', async (req, res) => {
  try {
    const { user } = await verifyAdmin(req);
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    if (userId === user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await assertCanManageUserAccount(user, { targetUserId: userId });

    // Ids ligados (perfil + auth_users com o mesmo e-mail) calculados ANTES de apagar:
    // em instalações antigas o auth_users tem outro id e sobrava um login sem perfil.
    await ensureAuthSupportTables();
    const targetId = String(userId);
    const { rows: profileRows } = await pool.query('SELECT email FROM profiles WHERE id::text = $1 LIMIT 1', [targetId]);
    const targetEmail = String(profileRows[0]?.email || '').trim().toLowerCase();
    const linkedIds = await getLinkedUserIds({ id: targetId, email: targetEmail });
    if (linkedIds.includes(String(user.id))) return res.status(400).json({ error: 'Cannot delete yourself' });

    // Tudo numa transação: se o perfil não puder sair (ex.: gravações ligadas), nada é apagado.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const table of ['partners', 'user_roles', 'user_permissions', 'user_cities', 'notifications']) {
        const { rows: [{ exists }] } = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${table}`]);
        if (exists) await client.query(`DELETE FROM ${table} WHERE user_id::text = ANY($1::text[])`, [linkedIds]);
      }
      await client.query('DELETE FROM profiles WHERE id::text = $1', [targetId]);
      if (targetEmail) {
        await client.query('DELETE FROM auth_users WHERE id::text = ANY($1::text[]) OR lower(email) = $2', [linkedIds, targetEmail]);
      } else {
        await client.query('DELETE FROM auth_users WHERE id::text = ANY($1::text[])', [linkedIds]);
      }
      await client.query('COMMIT');
    } catch (deleteError) {
      await client.query('ROLLBACK').catch(() => null);
      throw deleteError;
    } finally {
      client.release();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// ─── 14. Client Onboarding ──────────────────────────────────
// Videomakers oferecidos no onboarding público: papel videomaker (user_roles ou o legado
// profiles.role) que atende a cidade do cliente. Cliente global (sem cidade): todos.
// Se ninguém estiver cadastrado na cidade, mostra todos (como antes) para o link não travar.
async function listOnboardingVideomakers(city) {
  const query = async (cityFilter) => {
    const params = [];
    let cityClause = '';
    if (cityFilter) {
      await ensureUserCitiesTable().catch(() => {});
      params.push(cityFilter);
      cityClause = ` AND ${userServesCitySql('p.id', '$1')}`;
    }
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.display_name, p.avatar_url, p.bio, p.job_title
         FROM profiles p
        WHERE (p.role::text = 'videomaker'
               OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id::text = p.id::text AND ur.role::text = 'videomaker'))${cityClause}`,
      params
    );
    return rows;
  };
  const rows = await query(city);
  if (city && rows.length === 0) return query(null);
  return rows;
}

// Colunas do plano que o onboarding usa (has_recording/has_photography só existem em alguns bancos).
async function getOnboardingPlan(planId) {
  if (!planId) return null;
  const existing = await getExistingColumns('plans').catch(() => new Set());
  const cols = ['id', 'name', 'recording_sessions', 'accepts_extra_content', 'arts_qty', 'has_recording', 'has_photography']
    .filter((col) => col === 'id' || col === 'name' || existing.has(col));
  const { rows: planRows } = await pool.query(`SELECT ${cols.join(', ')} FROM plans WHERE id = $1`, [planId]);
  return planRows[0] || null;
}

app.all('/api/client-onboarding', async (req, res) => {
  let txClient = null;
  try {
    if (req.method === 'GET') {
      const clientId = req.query.clientId;
      if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
      if (!UUID_RE.test(String(clientId))) return res.status(404).json({ error: 'Client not found' });

      const { rows: clients } = await pool.query(
        `SELECT id, company_name, responsible_person, logo_url, onboarding_completed, videomaker_id,
                fixed_day, fixed_time, backup_day, backup_time, monthly_recordings, accepts_extra,
                extra_content_types, extra_client_appears, plan_id, selected_weeks, client_type,
                photo_preference, has_photo_shoot, accepts_photo_shoot_cost, briefing_data
         FROM clients WHERE id = $1`, [clientId]
      );
      const client = clients[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });
      // Link público: sem as senhas do briefing (o POST mantém as já salvas).
      client.briefing_data = withoutBriefingSecrets(client.briefing_data);

      // Tudo na praça do cliente: videomakers que atendem a cidade e o expediente dela.
      const clientCity = await getClientCityForAgenda(clientId);
      const videomakers = await listOnboardingVideomakers(clientCity);
      const settings = (await getCompanySettingsForCity(clientCity)) || null;
      // Horários ocupados: só videomaker/dia/hora, sem o id dos outros clientes e sem o próprio.
      const { rows: existingClients } = await pool.query(
        `SELECT videomaker_id, fixed_day, fixed_time FROM clients
          WHERE videomaker_id IS NOT NULL AND id <> $1 AND COALESCE(status::text, 'ativo') <> 'cancelado'`,
        [clientId]
      );

      const plan = await getOnboardingPlan(client.plan_id);

      return res.json({ client, videomakers: videomakers || [], settings, existingClients: existingClients || [], plan });
    }

    // POST — full onboarding save logic
    const body = req.body || {};
    const { clientId, videomaker_id, fixed_day, fixed_time, backup_day, backup_time, monthly_recordings, accepts_extra, extra_content_types, extra_client_appears, selected_weeks, photo_preference, has_photo_shoot, accepts_photo_shoot_cost, briefing_data, full_shift_recording, preferred_shift } = body;
    if (!clientId || !UUID_RE.test(String(clientId))) return res.status(400).json({ error: 'Missing required fields' });

    const { rows: [currentClient] } = await pool.query(
      'SELECT id, plan_id, onboarding_completed, briefing_data FROM clients WHERE id = $1',
      [clientId]
    );
    if (!currentClient) return res.status(404).json({ error: 'Client not found' });
    // Formulário já concluído (a tela mostra "Tudo certo" e não reenvia): não regrava agenda nem briefing.
    if (currentClient.onboarding_completed === true) {
      return res.status(409).json({ error: 'Este formulário já foi enviado. Fale com a equipe para alterar as preferências.' });
    }

    // O plano lido no servidor decide se há gravação (plano só de artes não escolhe videomaker).
    const plan = await getOnboardingPlan(currentClient.plan_id);
    const planHasRecording = plan?.has_recording !== false;
    const clientCity = await getClientCityForAgenda(clientId);
    if (planHasRecording) {
      if (!videomaker_id || !fixed_day) return res.status(400).json({ error: 'Missing required fields' });
      if (!full_shift_recording && !fixed_time) return res.status(400).json({ error: 'Missing fixed_time' });
      const allowedVideomakers = await listOnboardingVideomakers(clientCity);
      if (!allowedVideomakers.some((vm) => String(vm.id) === String(videomaker_id))) {
        return res.status(400).json({ error: 'Videomaker indisponível para a sua cidade. Recarregue a página e escolha outro.' });
      }
    }

    const updateFields = {
      videomaker_id, fixed_day, fixed_time: fixed_time || '08:30',
      backup_day: backup_day || 'terca', backup_time: backup_time || '14:00',
      monthly_recordings: monthly_recordings || 4,
      accepts_extra: accepts_extra || false,
      extra_content_types: extra_content_types || '{}',
      extra_client_appears: extra_client_appears || false,
      selected_weeks: selected_weeks || [1, 2, 3, 4],
      onboarding_completed: true,
      photo_preference: photo_preference || 'nao_precisa',
      has_photo_shoot: has_photo_shoot || false,
      accepts_photo_shoot_cost: accepts_photo_shoot_cost || false,
      full_shift_recording: full_shift_recording || false,
      preferred_shift: preferred_shift || 'manha',
    };

    const sets = [];
    const vals = [];
    const addSet = (column, value) => { vals.push(value); sets.push(`${column}=$${vals.length}`); };
    // Plano sem gravação: não mexe na agenda fixa do cliente
    if (planHasRecording) {
      addSet('videomaker_id', updateFields.videomaker_id);
      addSet('fixed_day', updateFields.fixed_day);
      addSet('fixed_time', updateFields.fixed_time);
      addSet('backup_day', updateFields.backup_day);
      addSet('backup_time', updateFields.backup_time);
      addSet('monthly_recordings', updateFields.monthly_recordings);
      addSet('selected_weeks', updateFields.selected_weeks);
      addSet('full_shift_recording', updateFields.full_shift_recording);
      addSet('preferred_shift', updateFields.preferred_shift);
    }
    addSet('accepts_extra', updateFields.accepts_extra);
    addSet('extra_content_types', updateFields.extra_content_types);
    addSet('extra_client_appears', updateFields.extra_client_appears);
    addSet('onboarding_completed', updateFields.onboarding_completed);
    addSet('photo_preference', updateFields.photo_preference);
    addSet('has_photo_shoot', updateFields.has_photo_shoot);
    addSet('accepts_photo_shoot_cost', updateFields.accepts_photo_shoot_cost);

    if (briefing_data && typeof briefing_data === 'object' && Object.keys(briefing_data).length > 0) {
      // Junta com o briefing anterior (não apaga o que veio do /briefing) e mantém as
      // senhas salvas quando o campo volta vazio (o GET não devolve as senhas).
      const prevBriefing = parseBriefingObject(currentClient.briefing_data) || {};
      addSet('briefing_data', JSON.stringify({ ...prevBriefing, ...mergeBriefingSecrets(briefing_data, currentClient.briefing_data) }));
      if (briefing_data.instagram_login) addSet('client_login', briefing_data.instagram_login);
      if (briefing_data.niche) addSet('niche', briefing_data.niche);
    }

    vals.push(clientId);
    txClient = await pool.connect();
    await txClient.query('BEGIN');
    await txClient.query(
      `UPDATE clients SET ${sets.join(', ')}, updated_at=now() WHERE id=$${vals.length}`,
      vals
    );

    // Create upcoming recordings
    const weeks = selected_weeks || [1, 2, 3, 4];
    const dayMap = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
    const targetDay = planHasRecording ? dayMap[fixed_day] : undefined;
    if (targetDay !== undefined) {
      // As fixas futuras que a agenda já tinha (do cadastro ou de um envio anterior) dão lugar
      // às do horário escolhido agora. Ficam as pedidas pelo portal/link, as que já começaram e
      // as que têm algo vinculado (mesma regra do "Regenerar agenda").
      await ensurePublicReschedTable();
      const { rows: replacedRows } = await txClient.query(
        `DELETE FROM recordings r
          WHERE r.client_id = $1 AND r.status::text = 'agendada' AND r.type::text = 'fixa'
            AND (r.date > $2::date OR (r.date = $2::date
                 AND (CASE WHEN r.start_time::text ~ '^[0-9]{1,2}:[0-9]{2}'
                           THEN split_part(r.start_time::text, ':', 1)::int * 60 + split_part(r.start_time::text, ':', 2)::int
                           ELSE 0 END) > $3))
            ${recordingsSourceColumnReady ? "AND COALESCE(r.source, '') NOT IN ('portal', 'link')" : ''}
            AND NOT EXISTS (SELECT 1 FROM recordings o WHERE o.rescheduled_to_id = r.id)
            AND NOT EXISTS (SELECT 1 FROM active_recordings a WHERE a.recording_id = r.id)
            AND NOT EXISTS (SELECT 1 FROM delivery_records d WHERE d.recording_id = r.id)
            AND NOT EXISTS (SELECT 1 FROM content_tasks ct WHERE ct.recording_id = r.id)
          RETURNING r.id::text AS id`,
        [clientId, brtDateString(), brtMinutesNow()]
      );
      if (replacedRows.length > 0) {
        await txClient.query(
          'UPDATE scripts SET recording_id = NULL, updated_at = NOW() WHERE recording_id::text = ANY($1::text[])',
          [replacedRows.map((row) => row.id)]
        );
      }

      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const allDates = [];
      const current = new Date(year, month, 1);
      while (current.getMonth() === month) { if (current.getDay() === targetDay) allDates.push(current.toISOString().split('T')[0]); current.setDate(current.getDate() + 1); }
      const todayStr = today.toISOString().split('T')[0];
      let dates = weeks.filter(w => w >= 1 && w <= allDates.length).map(w => allDates[w - 1]).filter(d => d > todayStr);
      if (dates.length === 0) {
        const nextMonth = new Date(year, month + 1, 1);
        const nextAllDates = [];
        const next = new Date(nextMonth);
        while (next.getMonth() === nextMonth.getMonth()) { if (next.getDay() === targetDay) nextAllDates.push(next.toISOString().split('T')[0]); next.setDate(next.getDate() + 1); }
        dates = weeks.filter(w => w >= 1 && w <= nextAllDates.length).map(w => nextAllDates[w - 1]);
      }
      // Gravações na cidade do cliente (sem cidade = cliente global: default da tabela + trigger)
      const withCity = Boolean(clientCity) && await tableHasCityColumn('recordings');
      for (const date of dates) {
        // Não duplica uma fixa que ficou no mesmo dia (ex.: já vinculada a vídeos)
        const { rows: [kept] } = await txClient.query(
          `SELECT 1 FROM recordings WHERE client_id = $1 AND date = $2::date AND type::text = 'fixa' AND status::text <> 'cancelada' LIMIT 1`,
          [clientId, date]
        );
        if (kept) continue;
        await txClient.query(
          `INSERT INTO recordings (client_id, videomaker_id, date, start_time, type, status, confirmation_status${withCity ? ', city' : ''})
           VALUES ($1, $2, $3, $4, 'fixa', 'agendada', 'pendente'${withCity ? ', $5' : ''})`,
          [clientId, videomaker_id, date, updateFields.fixed_time, ...(withCity ? [clientCity] : [])]
        );
      }
    }

    await txClient.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    if (txClient) await txClient.query('ROLLBACK').catch(() => {});
    console.error('Client onboarding error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (txClient) txClient.release();
  }
});

// ─── Public Team Presentation ────────────────────────────────
// Used by /equipe/apresentacao. This route is intentionally public because
// the page is sent to clients before they have portal access.
app.get('/api/public-team-presentation', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, display_name, role, avatar_url, bio, job_title
       FROM profiles
       WHERE name IS NOT NULL
         AND role IN ('admin','gestor_projetos','copywriter','social_media','designer','videomaker','editor','fotografo','endomarketing','parceiro')
       ORDER BY CASE
         WHEN lower(coalesce(display_name, name)) LIKE '%thiago%' THEN 1
         WHEN lower(coalesce(display_name, name)) LIKE '%naay%' THEN 2
         WHEN lower(coalesce(display_name, name)) LIKE '%naraely%' THEN 3
         WHEN lower(coalesce(display_name, name)) LIKE '%rayssa%' THEN 4
         WHEN lower(coalesce(display_name, name)) LIKE '%adriely%' THEN 5
         WHEN lower(coalesce(display_name, name)) LIKE '%victor gabriel%' THEN 6
         WHEN lower(coalesce(display_name, name)) LIKE '%fabiely%' THEN 7
         WHEN lower(coalesce(display_name, name)) = 'victor' THEN 8
         WHEN lower(coalesce(display_name, name)) LIKE '%iggor%' THEN 9
         WHEN lower(coalesce(display_name, name)) LIKE '%victor oliveira%' THEN 10
         ELSE 99
       END, name ASC`
    );

    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return res.json({ members: rows || [] });
  } catch (error) {
    console.error('public-team-presentation error:', error);
    return res.status(500).json({ error: 'Não foi possível carregar a equipe.' });
  }
});

// ─── 15. Billing Automation ─────────────────────────────────
// Roda sozinha todo dia às 9h (agendador do WhatsApp, mais abaixo); a rota é só para o admin disparar à mão.
app.post('/api/billing-automation', async (req, res) => {
  try {
    await verifyAdmin(req);
    res.json(await runBillingAutomation());
  } catch (error) {
    res.status(error.message === 'Admin access required' ? 403 : error.message === 'Unauthorized' ? 401 : 500).json({ error: String(error.message || error) });
  }
});

/** Tira da lista os contratos de clientes com status 'cancelado' (defesa da cobrança automática). */
async function withoutCancelledClients(contracts) {
  if (!Array.isArray(contracts) || contracts.length === 0) return contracts || [];
  const clientIds = [...new Set(contracts.map((c) => c.client_id).filter(Boolean))];
  if (clientIds.length === 0) return contracts;
  const { rows } = await pool.query(
    `SELECT id FROM clients WHERE id = ANY($1::uuid[]) AND status = 'cancelado'`,
    [clientIds],
  );
  if (!rows.length) return contracts;
  const cancelled = new Set(rows.map((r) => String(r.id)));
  return contracts.filter((c) => !cancelled.has(String(c.client_id)));
}

async function runBillingAutomation() {
  {
    const admin = getAdminClient();
    await ensureRecurringRevenuesTables().catch(() => {});
    // Datas no calendário de Brasília (o agendador roda das 9h às 20h de lá)
    const brDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const todayStr = brDate(new Date());
    const [currentYear, currentMonthNum] = todayStr.split('-').map(Number);
    const currentMonth = currentMonthNum - 1;
    const pad2 = (n) => String(n).padStart(2, '0');
    const monthStart = (year, monthIdx) => {
      const d = new Date(Date.UTC(year, monthIdx, 1));
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
    };
    // Vencimento do contrato no mês, limitado ao último dia (dia 30/31 em fevereiro etc.)
    const contractDueDate = (year, monthIdx, dueDay) => {
      const first = new Date(Date.UTC(year, monthIdx, 1));
      const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      const day = Math.min(Math.max(Number(dueDay) || 10, 1), lastDay);
      return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-${pad2(day)}`;
    };
    const addDays = (dateStr, days) => {
      const d = new Date(`${dateStr}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const toDateKey = (v) => {
      if (!v) return '';
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v).slice(0, 10);
    };
    const isReceived = (r) => r?.status === 'recebida' || r?.status === 'pago';

    const { data: activeContracts } = await admin.from('financial_contracts').select('*').eq('status', 'ativo');
    // Cliente cancelado não é cobrado, mesmo que o contrato tenha ficado 'ativo' por engano
    const contracts = await withoutCancelledClients(activeContracts);
    if (!contracts?.length) return { message: 'No active contracts', processed: 0 };
    // PIX/templates por cidade: cada contrato usa a config da sua cidade; sem config
    // própria, cai na primeira cadastrada (comportamento anterior).
    const paymentConfigHasCity = await tableHasCityColumn('payment_config');
    const { rows: paymentConfigRows } = await pool.query('SELECT * FROM payment_config');
    const paymentConfigByCity = new Map();
    for (const pc of paymentConfigRows) {
      const city = paymentConfigHasCity ? (normalizeCityValue(pc.city) || 'minacu') : 'minacu';
      if (!paymentConfigByCity.has(city)) paymentConfigByCity.set(city, pc);
    }
    const billingMessagesHasCity = await tableHasCityColumn('billing_messages');
    const { data: whatsappConfigs } = await admin.from('whatsapp_config').select('*').limit(1);
    const whatsappConfig = whatsappConfigs?.[0];
    const results = [];

    const refThis = monthStart(currentYear, currentMonth);
    const refPrev = monthStart(currentYear, currentMonth - 1);

    for (const contract of contracts) {
      if (contract.billing_enabled === false) continue;

      // Só a mensalidade do contrato (sem recorrência extra nem lançamento manual),
      // do mês atual e do anterior — o lembrete de +3 dias atravessa a virada do mês.
      const { rows: monthlyRevenues } = await pool.query(
        `SELECT * FROM revenues
          WHERE client_id = $1
            AND recurrence_id IS NULL
            AND (description IS NULL OR btrim(description) = '')
            AND (contract_id IS NULL OR contract_id = $2)
            AND reference_month = ANY($3::date[])
          ORDER BY (contract_id = $2) DESC NULLS LAST, created_at ASC`,
        [contract.client_id, contract.id, [refThis, refPrev]]
      );
      const revenuesOf = (ref) => monthlyRevenues.filter((r) => toDateKey(r.reference_month) === ref);
      // Mês atual: sem receita gerada ainda, vale o dia do contrato (como antes).
      // Mês anterior: só lembra se a mensalidade daquele mês existe.
      const prevRevenues = revenuesOf(refPrev);
      const candidates = [
        { revenues: revenuesOf(refThis), fallbackDue: contractDueDate(currentYear, currentMonth, contract.due_day) },
        ...(prevRevenues.length ? [{ revenues: prevRevenues, fallbackDue: '' }] : []),
      ].map((c) => ({ ...c, dueDate: toDateKey(c.revenues[0]?.due_date) || c.fallbackDue }))
        .filter((c) => c.dueDate);

      // Cobrança no dia do vencimento da receita do mês; lembrete 3 dias depois
      const dueToday = candidates[0]?.dueDate === todayStr ? candidates[0] : null;
      const reminder = dueToday ? null : candidates.find((c) => addDays(c.dueDate, 3) === todayStr) || null;
      const target = dueToday || reminder;
      if (!target) continue;
      const isReminder = Boolean(reminder);

      // Já pago (qualquer mensalidade do mês recebida) → não cobra
      if (target.revenues.some(isReceived)) continue;
      const revenue = target.revenues[0] || null;

      const { data: clientData } = await admin.from('clients').select('*').eq('id', contract.client_id).single();
      if (!clientData?.whatsapp) continue;
      const { data: existingMessages } = await admin.from('billing_messages').select('*').eq('client_id', contract.client_id).gte('sent_at', todayStr + 'T00:00:00').lte('sent_at', todayStr + 'T23:59:59');
      if (existingMessages?.length) continue;

      const contractCity = normalizeCityValue(contract.city) || normalizeCityValue(clientData.city) || 'minacu';
      const paymentConfig = paymentConfigByCity.get(contractCity) || paymentConfigByCity.get('minacu') || paymentConfigRows[0];

      const value = Number(revenue?.amount ?? contract.contract_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      let paymentInfo = '';
      if (paymentConfig?.pix_key) {
        const template = paymentConfig.msg_payment_data || '💳 *Dados:*\nNome: {nome_recebedor}\nBanco: {banco}\nPIX: {chave_pix}\nDoc: {documento}';
        paymentInfo = template.replace(/\{nome_recebedor\}/g, paymentConfig.receiver_name || '').replace(/\{banco\}/g, paymentConfig.bank || '').replace(/\{chave_pix\}/g, paymentConfig.pix_key || '').replace(/\{documento\}/g, paymentConfig.document || '');
      }

      const dueDayLabel = String(Number(target.dueDate.slice(8, 10)));
      const applyVars = tpl => tpl.replace(/\{nome_cliente\}/g, clientData.company_name).replace(/\{valor\}/g, value).replace(/\{dia_vencimento\}/g, dueDayLabel).replace(/\{dados_pagamento\}/g, paymentInfo);
      let message;
      if (isReminder) {
        message = applyVars(paymentConfig?.msg_billing_overdue || `Olá, {nome_cliente}! Identificamos pendência de {valor}. Se já pagou, desconsidere.{dados_pagamento}`);
        if (revenue && revenue.status === 'prevista') await admin.from('revenues').update({ status: 'em_atraso' }).eq('id', revenue.id);
      } else {
        message = applyVars(paymentConfig?.msg_billing_due || `Olá, {nome_cliente}! 🚀\n💰 Mensalidade: {valor}\n📅 Vencimento: Dia {dia_vencimento}{dados_pagamento}`);
      }

      if (whatsappConfig?.integration_active) {
        try {
          await sendWhatsAppDirect(whatsappConfig, clientData.whatsapp, message, admin, contract.client_id, isReminder ? 'cobranca_lembrete' : 'cobranca', 'cobranca');
          await admin.from('billing_messages').insert({
            revenue_id: revenue?.id || null,
            client_id: contract.client_id,
            message_type: isReminder ? 'lembrete' : 'cobranca',
            status: 'enviada',
            ...(billingMessagesHasCity ? { city: contractCity } : {}),
          });
          results.push({ client: clientData.company_name, type: isReminder ? 'lembrete' : 'cobranca', status: 'sent' });
        } catch (err) { results.push({ client: clientData.company_name, status: 'error', error: String(err) }); }
      }
    }
    return { results, processed: results.length };
  }
}

// ─── 16. WhatsApp Webhook ───────────────────────────────────
// A mensagem inteira tem que ser a opção (o modelo pede 1️⃣ ou 2️⃣): "1", "1 - confirmo", "Sim, confirmo!",
// "Confirmado, estaremos lá", "2", "Cancelar". Frase solta não vale: "Não gostei da música" não cancela,
// "100% aprovado" não confirma e "2ª feira pode?" ou "2 pessoas vão" não cancelam a gravação.
const normalizeReply = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const REPLY_COURTESY = '(?: (?:obrigad[oa]|obg|valeu|vlw|beleza|blz|desculpa|desculpe))?';
const CONFIRM_REPLY = new RegExp(`^(?:(?:1(?: (?:sim|ok|confirmo|confirmado|confirmada|confirmar))?|(?:sim |ok )?(?:confirmar|confirma))${REPLY_COURTESY}|(?:(?:sim|ok) )?(?:confirmo|confirmado|confirmada|confirmadissimo)(?: .*)?)$`, 'u');
const CANCEL_REPLY = new RegExp(`^(?:2(?: (?:cancelar|cancelo|cancela|cancelado|cancelada))?|cancelar|cancelo|cancela|cancelado|cancelada|nao posso|nao vou poder|nao vamos poder)${REPLY_COURTESY}$`, 'u');
// no privado, um "ok"/"sim" sozinho também confirma (no grupo não: pode ser de outra conversa)
const CONFIRM_ALONE = new RegExp(`^(?:ok|okay|sim|sim sim)${REPLY_COURTESY}$`, 'u');

function classifyGroupResponse(text) {
  if (String(text || '').includes('?')) return 'unknown'; // pergunta não é resposta
  const n = normalizeReply(text);
  if (CONFIRM_REPLY.test(n) && !/\bnao\b/.test(n)) return 'confirm';
  if (CANCEL_REPLY.test(n)) return 'cancel';
  return 'unknown';
}

function classifyResponse(text) {
  const explicit = classifyGroupResponse(text);
  if (explicit !== 'unknown' || String(text || '').includes('?')) return explicit;
  return CONFIRM_ALONE.test(normalizeReply(text)) ? 'confirm' : 'unknown';
}

// Confirmação ainda válida: a gravação continua agendada e não passou. As outras (gravação feita, cancelada,
// remarcada ou de um dia que já foi) viram "expired", para uma resposta solta não mexer em gravação antiga.
async function pickActiveConfirmation(admin, confirmations) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  for (const confirmation of confirmations || []) {
    if (confirmation.type !== 'confirmation') continue;
    const recording = confirmation.recordings;
    if (recording?.status === 'agendada' && String(recording.date || '') >= today) return confirmation;
    await admin.from('whatsapp_confirmations').update({ status: 'expired' }).eq('id', confirmation.id).eq('status', 'pending');
  }
  return null;
}

function extractPayload(body) {
  let phone = body.from || body.number || body.phone || body.remoteJid || body.contact?.number || body.ticket?.contact?.number || '';
  let message = body.body || body.message || body.text || body.msg || body.content || '';
  if (typeof message === 'object' && message !== null) message = message.body || message.text || message.content || message.conversation || '';
  if (!phone && body.data) { phone = body.data.from || body.data.number || body.data.phone || ''; if (!message) message = body.data.body || body.data.message || ''; }
  if (!phone && body.ticket) phone = body.ticket.contact?.number || body.ticket.number || '';
  if (!message && body.ticket) message = body.ticket.lastMessage || '';
  phone = phone.replace(/\D/g, '').replace(/@.*/, '');
  return { phone, message: typeof message === 'string' ? message : '' };
}

// Resposta recebida no WhatsApp próprio (o processo pulse-wa grava em wa_inbound; o laço abaixo chama esta função).
// A rota ficou só para o admin testar à mão: sem a AtendeClique, ninguém de fora manda mais nada para cá.
app.post('/api/whatsapp-webhook', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { phone, message } = extractPayload(req.body);
    res.json(await handleWhatsAppReply(phone, message));
  } catch (error) {
    res.status(error.message === 'Admin access required' ? 403 : error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
  }
});

// No privado: acha a confirmação pelo número. No grupo do cliente: pela confirmação pendente do cliente do grupo,
// e a resposta volta no grupo.
async function handleWhatsAppReply(phoneInput, messageText, { groupJid = null } = {}) {
  {
    const admin = getAdminClient();
    const phoneNumber = String(phoneInput || '').replace(/\D/g, '');
    if ((!phoneNumber && !groupJid) || !messageText) return { ok: true, skipped: 'no_phone_or_message' };
    if (groupJid) {
      const classification = classifyGroupResponse(messageText);
      if (classification === 'unknown') return { ok: true, skipped: 'unrecognized_response' };
      const groupClients = await clientsForGroup(pool, groupJid);
      if (!groupClients.length) return { ok: true, skipped: 'group_without_client' };
      const { data: groupConfirmations } = await admin.from('whatsapp_confirmations').select('*, recordings(*), clients(*)')
        .in('client_id', groupClients.map((c) => c.id)).eq('status', 'pending').not('sent_at', 'is', null)
        .order('sent_at', { ascending: false }).limit(10);
      const groupConfirmation = await pickActiveConfirmation(admin, groupConfirmations);
      if (!groupConfirmation) return { ok: true, skipped: 'no_pending_confirmation' };
      return applyConfirmationReply(admin, groupConfirmation, messageText, groupJid, classification);
    }

    // o cadastro pode ter o número com ou sem 55 e com ou sem o 9º dígito
    const local = phoneNumber.startsWith('55') && phoneNumber.length > 11 ? phoneNumber.slice(2) : phoneNumber;
    const localVariants = new Set([local]);
    if (local.length === 11 && local[2] === '9') localVariants.add(local.slice(0, 2) + local.slice(3));
    if (local.length === 10) localVariants.add(`${local.slice(0, 2)}9${local.slice(2)}`);
    const phoneVariants = [...localVariants].flatMap((v) => [v, `55${v}`]);

    const classification = classifyResponse(messageText);
    if (classification === 'unknown') return { ok: true, skipped: 'unrecognized_response' };
    const { data: confirmations } = await admin.from('whatsapp_confirmations').select('*, recordings(*), clients(*)').in('phone_number', phoneVariants).eq('status', 'pending').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(10);
    const confirmation = await pickActiveConfirmation(admin, confirmations);
    if (!confirmation) return { ok: true, skipped: 'no_pending_confirmation' };
    // "ok"/"sim" sozinho logo depois de receber vídeos no privado é resposta aos vídeos, não à gravação
    if (classification === 'confirm' && classifyGroupResponse(messageText) === 'unknown') {
      const { rows: newerVideos } = await pool.query(
        `SELECT 1 FROM wa_approval_requests WHERE phone = ANY($1) AND status = 'pendente' AND created_at > $2 LIMIT 1`,
        [phoneVariants, confirmation.sent_at]
      ).catch(() => ({ rows: [] }));
      if (newerVideos.length) return { ok: true, skipped: 'resposta_aos_videos' };
    }
    return applyConfirmationReply(admin, confirmation, messageText, null, classification);
  }
}

async function applyConfirmationReply(admin, confirmation, messageText, replyTo, classification) {
  {
    const recording = confirmation.recordings;
    const client = confirmation.clients;
    if (classification === 'unknown') return { ok: true, skipped: 'unrecognized_response' };

    const { data: configData } = await admin.from('whatsapp_config').select('*').limit(1).single();
    if (!configData) return { ok: false, error: 'whatsapp_config vazio' };

    const portalLink = `${PORTAL_BASE_URL}/${client?.id || ''}`;
    const templateVars = { nome_cliente: client?.company_name || '', data_gravacao: recording?.date || '', hora_gravacao: recording?.start_time || '', link_portal: portalLink };

    if (confirmation.type === 'confirmation') {
      if (classification === 'confirm') {
        await admin.from('whatsapp_confirmations').update({ status: 'confirmed', responded_at: new Date().toISOString(), response_message: messageText }).eq('id', confirmation.id);
        await admin.from('recordings').update({ confirmation_status: 'confirmada' }).eq('id', confirmation.recording_id);
        await sendWhatsAppDirect(configData, replyTo || clientTarget(client, 'agenda') || confirmation.phone_number, applyTemplate(configData.msg_confirmation_confirmed, templateVars), admin, client?.id, 'auto_confirmation', 'agenda');
      } else {
        // só cancela gravação que ainda está agendada (nunca uma já feita ou já remarcada pela equipe)
        const { data: cancelled } = await admin.from('recordings').update({ status: 'cancelada', confirmation_status: 'cancelada' })
          .eq('id', confirmation.recording_id).eq('status', 'agendada');
        if (!cancelled?.length) {
          await admin.from('whatsapp_confirmations').update({ status: 'expired' }).eq('id', confirmation.id).eq('status', 'pending');
          return { ok: true, skipped: 'recording_not_scheduled' };
        }
        await admin.from('whatsapp_confirmations').update({ status: 'cancelled', responded_at: new Date().toISOString(), response_message: messageText }).eq('id', confirmation.id);
        await sendWhatsAppDirect(configData, replyTo || clientTarget(client, 'agenda') || confirmation.phone_number, applyTemplate(configData.msg_confirmation_cancelled, templateVars), admin, client?.id, 'auto_confirmation', 'agenda');
      }
    }

    return { ok: true, classification, type: confirmation.type };
  }
}

// ─── 17. Confirmation Cron ──────────────────────────────────
// Roda sozinha todo dia às 10h (agendador do WhatsApp); a rota é para o admin disparar à mão.
app.post('/api/whatsapp-confirmation-cron', async (req, res) => {
  try {
    await verifyAdmin(req);
    res.json(await runConfirmationCron());
  } catch (error) {
    console.error('confirmation-cron error:', error);
    res.status(error.message === 'Admin access required' ? 403 : error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
  }
});

async function runConfirmationCron() {
  {
    const admin = getAdminClient();
    // pendentes de gravação que já passou ou não está mais agendada: não esperam mais resposta
    await pool.query(
      `UPDATE whatsapp_confirmations wc SET status = 'expired'
         FROM recordings r
        WHERE r.id = wc.recording_id AND wc.status = 'pending' AND wc.type = 'confirmation'
          AND (r.date < (now() AT TIME ZONE 'America/Sao_Paulo')::date OR r.status <> 'agendada')`
    ).catch((error) => console.error('confirmation-cron expirar:', error.message));
    const { data: config } = await admin.from('whatsapp_config').select('*').limit(1).single();
    if (!config?.integration_active || !config?.auto_confirmation) return { ok: true, skipped: 'disabled' };

    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const { data: recordings } = await admin.from('recordings').select('*, clients(*)').eq('date', tomorrowStr).eq('status', 'agendada').eq('confirmation_status', 'pendente');
    if (!recordings?.length) return { ok: true, sent: 0 };

    const recordingIds = recordings.map(r => r.id);
    const { data: existingConfirmations } = await admin.from('whatsapp_confirmations').select('recording_id').in('recording_id', recordingIds).eq('type', 'confirmation');
    const alreadySent = new Set((existingConfirmations || []).map(c => c.recording_id));

    const vmIds = [...new Set(recordings.map(r => r.videomaker_id))];
    const { data: profiles } = await admin.from('profiles').select('id, name').in('id', vmIds);
    const vmNames = {};
    (profiles || []).forEach(p => { vmNames[p.id] = p.name; });

    let sentCount = 0;
    for (const recording of recordings) {
      if (alreadySent.has(recording.id)) continue;
      const client = recording.clients;
      if (!client?.whatsapp) continue;
      const phoneNumber = client.whatsapp.replace(/\D/g, '');
      if (!phoneNumber) continue;
      const portalLink = `${PORTAL_BASE_URL}/${client.id}`;
      const message = applyTemplate(config.msg_confirmation, { nome_cliente: client.company_name, data_gravacao: recording.date, hora_gravacao: recording.start_time, videomaker: vmNames[recording.videomaker_id] || 'Equipe', link_portal: portalLink });
      await admin.from('whatsapp_confirmations').insert({ recording_id: recording.id, client_id: client.id, phone_number: phoneNumber, type: 'confirmation', status: 'pending', sent_at: new Date().toISOString() });
      await admin.from('recordings').update({ confirmation_status: 'aguardando' }).eq('id', recording.id);
      // no grupo do cliente (se tiver); a resposta 1/2 vale no grupo ou no privado
      // depois da hora da gravação a confirmação não faz mais sentido (número fora do ar até lá: não sai)
      const result = await sendWhatsAppDirect(config, clientTarget(client, 'agenda'), message, admin, client.id, 'auto_confirmation', 'agenda',
        { expiresAt: brasiliaDateTime(recording.date, recording.start_time) });
      if (result.ok) sentCount++;
    }
    return { ok: true, sent: sentCount, total: recordings.length };
  }
}

// ─── 18. Approval Deadline Cron ─────────────────────────────
app.post('/api/approval-deadline-cron', async (req, res) => {
  try {
    await verifyAdmin(req);
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const { data: expiredTasks } = await admin.from('content_tasks').select('id, client_id, title, edited_video_link, approval_deadline').eq('kanban_column', 'envio').not('approval_deadline', 'is', null).lt('approval_deadline', now);
    if (!expiredTasks?.length) return res.json({ ok: true, moved: 0 });

    const { data: config } = await admin.from('whatsapp_config').select('*').limit(1).single();
    const clientIds = [...new Set(expiredTasks.map(t => t.client_id))];
    const { data: clientsData } = await admin.from('clients').select('id, company_name, whatsapp, whatsapp_group, responsible_person').in('id', clientIds);
    const clientsMap = {};
    (clientsData || []).forEach(c => { clientsMap[c.id] = c; });

    let movedCount = 0;
    for (const task of expiredTasks) {
      await admin.from('content_tasks').update({ kanban_column: 'agendamentos', approved_at: now, updated_at: now }).eq('id', task.id);
      await admin.from('social_media_deliveries').update({ status: 'entregue' }).eq('content_task_id', task.id);
      const client = clientsMap[task.client_id];
      await admin.rpc('notify_role', { _role: 'social_media', _title: 'Aprovação expirada', _message: `"${task.title}" (${client?.company_name || ''}) não foi aprovado em 6h. Movido para agendamento.`, _type: 'deadline', _link: '/entregas-social' });

      if (config?.integration_active && config?.auto_approval_expired && client?.whatsapp) {
        const portalLink = `${PORTAL_BASE_URL}/${task.client_id}`;
        const msg = applyTemplate(config.msg_approval_expired || 'Olá, {nome_cliente}! O vídeo "{titulo}" foi encaminhado para agendamento.', { nome_cliente: client.responsible_person || client.company_name, titulo: task.title, link_portal: portalLink });
        await sendWhatsAppDirect(config, clientTarget(client, 'aprovacao'), msg, admin, task.client_id, 'auto_approval_expired', 'aprovacao');
      }
      movedCount++;
    }
    res.json({ ok: true, moved: movedCount });
  } catch (error) {
    res.status(error.message === 'Admin access required' ? 403 : error.message === 'Unauthorized' ? 401 : 500).json({ error: error.message });
  }
});

// ─── 19. Generate Monthly Revenues ──────────────────────────
app.post('/api/generate-monthly-revenues', async (req, res) => {
  // Admin logado ou agendador com a chave CRON_KEY do .env (header X-Cron-Key)
  if (!secretMatches(process.env.CRON_KEY, req.headers['x-cron-key'])) {
    if (!(await requireAdminRoute(req, res))) return;
  }
  try {
    const admin = getAdminClient();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const refMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const { data: activeContracts } = await admin.from('financial_contracts').select('*').eq('status', 'ativo');
    // Cliente cancelado não ganha mensalidade nova, mesmo com o contrato 'ativo'
    const contracts = await withoutCancelledClients(activeContracts);
    if (!contracts?.length) return res.json({ message: 'No active contracts', generated: 0 });
    const { data: existing } = await admin.from('revenues').select('client_id').eq('reference_month', refMonth);
    const existingClientIds = new Set((existing || []).map(r => r.client_id));
    const newRevenues = contracts.filter(c => !existingClientIds.has(c.client_id)).map(c => ({ client_id: c.client_id, contract_id: c.id, reference_month: refMonth, amount: c.contract_value, due_date: `${year}-${String(month).padStart(2, '0')}-${String(c.due_day).padStart(2, '0')}`, status: 'prevista' }));
    if (newRevenues.length > 0) {
      await admin.from('revenues').insert(newRevenues);
      await admin.from('financial_activity_log').insert({ action_type: 'geração_automática', entity_type: 'receita', description: `Cron gerou ${newRevenues.length} receita(s) recorrente(s)`, details: { month: refMonth, count: newRevenues.length } });
    }
    res.json({ generated: newRevenues.length, month: refMonth });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── 20. Endo Daily Tasks Notify ────────────────────────────
app.post('/api/endo-daily-tasks-notify', async (req, res) => {
  try {
    await verifyUser(req);
    const admin = getAdminClient();
    const today = new Date().toISOString().split('T')[0];
    const { data: configData } = await admin.from('whatsapp_config').select('integration_active').limit(1).single();
    if (!configData?.integration_active) return res.status(400).json({ error: 'WhatsApp desativado' });

    let tasksQuery = admin.from('endomarketing_partner_tasks').select('*, clients(company_name)').eq('date', today).eq('status', 'pendente');
    const requestedPartnerId = req.body?.partner_id;
    if (requestedPartnerId) tasksQuery = tasksQuery.eq('partner_id', requestedPartnerId);
    const { data: todayTasks } = await tasksQuery;
    if (!todayTasks?.length) return res.json({ success: true, message: 'Sem tarefas para hoje', sent: 0 });

    const tasksByPartner = new Map();
    for (const task of todayTasks) { if (!task.partner_id) continue; const arr = tasksByPartner.get(task.partner_id) || []; arr.push(task); tasksByPartner.set(task.partner_id, arr); }
    const partnerIds = [...tasksByPartner.keys()];
    if (!partnerIds.length) return res.json({ success: true, sent: 0 });

    const { data: profiles } = await admin.from('profiles').select('id, name, display_name').in('id', partnerIds);
    const { data: partners } = await admin.from('partners').select('user_id, phone').in('user_id', partnerIds);
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const phoneMap = Object.fromEntries((partners || []).map(p => [p.user_id, p.phone]));

    let sentCount = 0;
    for (const [partnerId, partnerTasks] of tasksByPartner) {
      const phone = phoneMap[partnerId];
      if (!phone) continue;
      const profile = profileMap[partnerId];
      const partnerName = profile?.display_name || profile?.name || 'Parceiro';
      const taskLines = partnerTasks.map((t, i) => `   ${i + 1}. ${t.task_type} — *${t.clients?.company_name || 'Cliente'}* (${t.duration_minutes}min)`).join('\n');
      const message = `🌟 *Bom dia, ${partnerName}!*\n\n📋 *Suas tarefas de hoje:*\n\n${taskLines}\n\n✨ Você está fazendo um trabalho incrível! 🚀`;
      const result = await sendWhatsAppDirect(configData, phone, message, admin, partnerTasks[0].client_id, 'endo_daily_tasks', 'equipe');
      if (result.ok) sentCount++;
    }
    res.json({ success: true, sent: sentCount, total_partners: partnerIds.length });
  } catch (error) {
    console.error('endo-daily-tasks-notify error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GENERIC DB QUERY ENDPOINT — Replaces Supabase PostgREST
// ═══════════════════════════════════════════════════════════════

const ALLOWED_TABLES = [
  'clients','recordings','kanban_tasks','scripts','company_settings','active_recordings',
  'profiles','user_roles','plans','goals','notifications','content_tasks','task_history',
  'crm_leads','crm_notes',
  'task_comments','design_tasks','design_task_history','delivery_records','revenues',
  'expenses','expense_categories','financial_contracts','financial_activity_log',
  'financial_chat_messages','cash_reserve_movements','billing_messages','payment_config',
  'social_media_deliveries','social_accounts','integration_logs','automation_flows',
  'automation_logs','api_integrations','api_integration_logs','onboarding_tasks',
  'client_portal_contents','client_portal_comments','client_portal_notifications',
  'flyer_items','flyer_templates','endomarketing_clientes','endomarketing_agendamentos',
  'endomarketing_profissionais','endomarketing_logs','endomarketing_packages',
  'endomarketing_partner_tasks','client_endomarketing_contracts','partners',
  'traffic_campaigns','whatsapp_config','whatsapp_messages','whatsapp_confirmations',
  'recording_wait_logs','portal_videos','portal_video_views','commercial_proposals','proposal_comments','scheduled_recordings','scheduled_posts',
  'event_recordings','client_testimonials','proposal_checklist_items','holidays',
  'tv_settings','fieldwork_activities',
  'training_presentations','training_slides',
  'training_tracks','training_modules','training_lessons','user_training_progress',
  'user_permissions','login_logs',
  'campaigns','campaign_slots',
  'story_editing_sessions','script_requests','manual_video_tasks','plan_promotions',
  'client_professionals','client_units','client_collaborators','short_links','client_bio_links','client_bio_buttons',
  'warehouse_items','warehouse_movements','structure_investments','recurring_revenues',
  'salary_bonuses',



];

// ═══════════════════════════════════════════════════════════════
// MULTI-CITY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════
// Tabelas que devem ser filtradas pela cidade ativa do usuário.
// notifications fica de fora: o aviso é da pessoa (filtrado por user_id) e os
// avisos do servidor gravam a cidade padrão, então sumiam para quem está em Uruaçu.
const TABLES_WITH_CITY = new Set([
  'clients','recordings','kanban_tasks','scripts','active_recordings',
  'content_tasks','task_history','task_comments',
  'design_tasks','design_task_history','delivery_records',
  'revenues','expenses','financial_contracts','financial_activity_log','recurring_revenues',
  'salary_bonuses',
  'financial_chat_messages','cash_reserve_movements','billing_messages',
  'social_media_deliveries','social_accounts','integration_logs',
  'automation_flows','automation_logs','api_integrations','api_integration_logs',
  'onboarding_tasks',
  'client_portal_contents','client_portal_comments','client_portal_notifications',
  'flyer_items','flyer_templates',
  'endomarketing_clientes','endomarketing_agendamentos','endomarketing_profissionais',
  'endomarketing_logs','endomarketing_packages','endomarketing_partner_tasks',
  'client_endomarketing_contracts',
  'traffic_campaigns','whatsapp_messages','whatsapp_confirmations',
  'recording_wait_logs','portal_videos','portal_video_views','scheduled_posts',
  'commercial_proposals','proposal_comments','event_recordings',
  'client_testimonials','proposal_checklist_items',
  'fieldwork_activities','goals',
  'company_settings','whatsapp_config','payment_config',
  'crm_leads','crm_notes',
  'plans',
  'story_editing_sessions','script_requests','manual_video_tasks','client_bio_links','client_bio_buttons',
]);

// Cache de quais tabelas realmente possuem a coluna `city` no schema atual.
// Evita 42703 (column does not exist) se a migração ainda não rodou para alguma tabela.
const _cityColumnCache = new Map();
async function tableHasCityColumn(tableName) {
  const cached = getSchemaCacheValue(_cityColumnCache, tableName);
  if (cached !== null) return cached;
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'city' LIMIT 1`,
      [tableName]
    );
    const has = rows.length > 0;
    _cityColumnCache.set(tableName, { value: has, cachedAt: Date.now() });
    return has;
  } catch {
    return false;
  }
}

// Whitelist global das cidades suportadas pelo sistema.
// Implementação compartilhada em ./lib/cityResolution.mjs (coberta por testes automatizados).
const {
  ALLOWED_CITIES,
  normalizeCityValue,
  assertValidCity,
  resolveTransferCity,
  resolveTransferCityDetailed,
  formatCityResolutionLog,
  diagnoseTransferCity,
  CITY_ERROR_CODES,
  cityLabel,
} = await import('./lib/cityResolution.mjs');



function cityScopeExpression(columnName = 'city') {
  const safeColumn = columnName
    .split('.')
    .map((part) => sanitizeIdentifier(part))
    .join('.');
  // `city` can be TEXT on older VPS databases or the city_code ENUM after the
  // multi-city migration. Cast to text before btrim/lower so scoped queries do
  // not fail with: function btrim(city_code) does not exist.
  return `replace(lower(coalesce(nullif(btrim(${safeColumn}::text), ''), 'minacu')), 'ç', 'c')`;
}

function cityVisibilityExpression(columnName = 'city', placeholder) {
  const safeColumn = columnName
    .split('.')
    .map((part) => sanitizeIdentifier(part))
    .join('.');
  const scopedColumn = cityScopeExpression(columnName);
  return `(${scopedColumn} = ${placeholder} OR ${safeColumn} IS NULL OR nullif(btrim(${safeColumn}::text), '') IS NULL)`;
}

function cityScopeCondition(columnName = 'city', placeholder) {
  return `${cityScopeExpression(columnName)} = ${placeholder}`;
}

// Resolve a cidade ativa do request: header x-pulse-city, validado contra user_cities.
// Fallback: primary do usuário, ou 'minacu' se não houver registro.
async function resolveActiveCity(req, userId, userObj = null) {
  const requested = normalizeCityValue(req.headers['x-pulse-city']);
  const requestedValid = requested && ALLOWED_CITIES.has(requested) ? requested : null;

  // Admins podem acessar qualquer cidade sem precisar de registro em user_cities
  // (conferido antes dos ids ligados, que o admin não usa)
  try {
    if (userObj && await isAdminUser(userObj)) {
      return assertValidCity(requestedValid || 'minacu');
    }
  } catch (e) {
    if (e && e.statusCode === 400) throw e;
    /* segue fluxo normal */
  }

  const linkedUserIds = await getLinkedUserIds(userObj || { id: userId });
  try {
    const { rows } = await pool.query(
      'SELECT city, is_primary FROM user_cities WHERE user_id::text = ANY($1::text[])',
      [linkedUserIds.length ? linkedUserIds : [String(userId)]]
    );
    // Sem registro em user_cities: só Minaçu, igual ao /api/me/cities (antes valia
    // qualquer cidade mandada no cabeçalho).
    if (rows.length === 0) return 'minacu';
    const allowed = rows.map(r => normalizeCityValue(r.city)).filter(Boolean);
    if (requestedValid && allowed.includes(requestedValid)) return requestedValid;
    const primary = normalizeCityValue(rows.find(r => r.is_primary)?.city);
    return assertValidCity(primary || allowed[0]);
  } catch (e) {
    if (e && e.statusCode === 400) throw e;
    // Banco sem a tabela user_cities: ninguém tem registro, vale a cidade padrão.
    if (e?.code === '42P01') return 'minacu';
    // Outra falha: não aceita o cabeçalho às cegas (gravaria na cidade errada).
    console.error('resolveActiveCity: falha ao ler user_cities:', e?.message || e);
    throw Object.assign(new Error('Não foi possível conferir a cidade agora. Tente de novo.'), { statusCode: 503 });
  }
}

async function getScopedCityContext(req, tableName = null) {
  const { user } = await verifyUser(req);
  const scopeCity = tableName ? await tableHasCityColumn(tableName) : false;
  const activeCity = scopeCity ? await resolveActiveCity(req, user.id, user) : null;
  return { user, activeCity, scopeCity };
}

function cityScopedWhere(baseQuery, columnName = 'city', startIndex = 1, hasWhere = false) {
  const clause = `${columnName} = $${startIndex}`;
  return `${baseQuery}${hasWhere ? ' AND ' : ' WHERE '}${clause}`;
}


function sanitizeIdentifier(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

function sanitizeOrderColumn(column, fallbackTable) {
  const raw = String(column || '').trim();
  if (raw.includes('.')) {
    const [tableName, columnName] = raw.split('.').map(sanitizeIdentifier);
    if (tableName && columnName) return `${tableName}.${columnName}`;
  }
  return `${fallbackTable}.${sanitizeIdentifier(raw)}`;
}

function dbQueryError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Colunas que nunca saem pelo /api/db/query (hash de senha da equipe e do portal e o
// token de publicação das contas sociais dos clientes, que só o servidor usa).
const DB_QUERY_HIDDEN_COLUMNS = {
  profiles: ['password_hash', 'profile_password_hash', 'auth_password_hash'],
  clients: ['client_password_hash'],
  social_accounts: ['access_token'],
};

// Colunas que só quem gerencia a equipe enxerga (a pessoa sempre vê a própria linha).
const DB_QUERY_MANAGER_COLUMNS = {
  profiles: ['monthly_salary'],
};

// Senhas de Instagram/Facebook que o cliente digita no briefing e no onboarding
// (ficam dentro de briefing_data). Só quem gerencia (admin, social_media,
// gestor_projetos) recebe; o resto da equipe e as rotas públicas (o link do
// briefing abre só com o id do cliente) recebem o briefing sem elas.
const BRIEFING_SECRET_KEYS = ['instagramPassword', 'facebookPassword', 'instagram_password', 'facebook_password'];
const BRIEFING_DATA_TABLES = new Set(['clients', 'onboarding_tasks', 'briefing_versions']);

function parseBriefingObject(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** briefing_data sem as senhas (mesmo formato de entrada: objeto ou texto JSON). */
function withoutBriefingSecrets(value) {
  const obj = parseBriefingObject(value);
  if (!obj || !BRIEFING_SECRET_KEYS.some((key) => key in obj)) return value;
  const copy = { ...obj };
  for (const key of BRIEFING_SECRET_KEYS) delete copy[key];
  return typeof value === 'string' ? JSON.stringify(copy) : copy;
}

/**
 * Reenvio do formulário: como o GET público não devolve mais as senhas, o campo
 * volta vazio. Vazio ou ausente mantém a senha que já estava salva.
 */
function mergeBriefingSecrets(incoming, previous) {
  const prevObj = parseBriefingObject(previous);
  if (!incoming || typeof incoming !== 'object' || !prevObj) return incoming;
  const merged = { ...incoming };
  for (const key of BRIEFING_SECRET_KEYS) {
    const value = merged[key];
    const isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
    if (isEmpty && prevObj[key]) merged[key] = prevObj[key];
  }
  return merged;
}

/** Tira as senhas do briefing_data das linhas (base e joins: `clients_briefing_data`). */
function stripBriefingSecretsFromRows(rows, tables = ['clients']) {
  const columns = ['briefing_data', ...tables.filter((table) => BRIEFING_DATA_TABLES.has(table)).map((table) => `${table}_briefing_data`)];
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    if (!row || typeof row !== 'object') continue;
    for (const column of columns) {
      if (row[column]) row[column] = withoutBriefingSecrets(row[column]);
    }
  }
  return rows;
}

/** Linhas de clients para a equipe: nunca o hash do portal; senhas do briefing só para quem gerencia. */
async function sanitizeClientRowsForUser(rows, user) {
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    if (row && typeof row === 'object') delete row.client_password_hash;
  }
  if (!(await isTeamManagerUser(user))) stripBriefingSecretsFromRows(rows);
  return rows;
}

/**
 * Lista fechada para o campo `select` do /api/db/query.
 * Aceita só o que o src/lib/vpsDb.ts (_parseSelect) gera: `*`, `col`,
 * `col as alias`, `tabela.*` e `tabela.col as alias`, onde `tabela` é a base
 * ou um join já aceito. Qualquer outra coisa (parênteses, aspas, `;`, `--`,
 * subconsulta, função) volta 400 — antes o texto ia cru para o SQL.
 */
function buildSafeSelectClause(selectClause, baseTable, joinTables = []) {
  const raw = selectClause === undefined || selectClause === null ? '*' : selectClause;
  if (typeof raw !== 'string') throw dbQueryError('Campo "select" inválido.');
  const allowedTables = new Set([baseTable, ...joinTables]);
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return `${baseTable}.*`;

  return parts
    .map((part) => {
      const match = part.match(/^(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*|\*)(?:\s+as\s+([a-z_][a-z0-9_]*))?$/i);
      if (!match) throw dbQueryError(`Item inválido no select: "${part.slice(0, 60)}"`);
      const [, prefix, column, alias] = match;
      const tableName = prefix || baseTable;
      if (!allowedTables.has(tableName)) throw dbQueryError(`Tabela "${tableName}" não faz parte da consulta.`);
      if (column === '*') {
        if (alias) throw dbQueryError('Alias não é aceito em "*".');
        return `${tableName}.*`;
      }
      // A limpeza da resposta é pelo nome da coluna: coluna protegida não pode ganhar outro nome.
      const protectedColumns = [
        ...(DB_QUERY_HIDDEN_COLUMNS[tableName] || []),
        ...(DB_QUERY_MANAGER_COLUMNS[tableName] || []),
      ];
      if (alias && alias.toLowerCase() !== column.toLowerCase() && protectedColumns.includes(column.toLowerCase())) {
        throw dbQueryError(`A coluna "${column}" não pode ser renomeada.`);
      }
      return alias ? `${tableName}.${column} AS ${alias}` : `${tableName}.${column}`;
    })
    .join(', ');
}

/**
 * Tira da resposta do /api/db/query as colunas sensíveis das tabelas envolvidas
 * (base + joins). `ownIds` libera as colunas de gestor na própria linha de profiles.
 */
function stripDbQueryColumns(rows, tables, { canSeeManagerColumns = false, ownIds = [] } = {}) {
  const hidden = new Set();
  const managerOnly = new Set();
  for (const table of tables) {
    for (const column of DB_QUERY_HIDDEN_COLUMNS[table] || []) hidden.add(column);
    if (!canSeeManagerColumns) {
      for (const column of DB_QUERY_MANAGER_COLUMNS[table] || []) managerOnly.add(column);
    }
  }
  if (hidden.size === 0 && managerOnly.size === 0) return rows;
  const own = new Set((ownIds || []).map(String));
  const isProfilesBase = tables[0] === 'profiles';
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    if (!row || typeof row !== 'object') continue;
    for (const column of hidden) delete row[column];
    if (managerOnly.size > 0 && !(isProfilesBase && own.has(String(row.id)))) {
      for (const column of managerOnly) delete row[column];
    }
  }
  return rows;
}

/**
 * Monta o WHERE do /api/db/query a partir dos filtros do vpsDb (eq, neq, gt, gte,
 * lt, lte, like, ilike, is, in, contains, not, or). Usado por select, update e
 * delete — antes o update só entendia eq/in e descartava o resto em silêncio
 * (o `.is('assigned_to', null)` do "pegar vídeo" sumia). Operador desconhecido
 * volta 400. Os placeholders seguem `params`, que pode já ter os valores do SET.
 */
function buildDbQueryWhere(filters, safeTable, params) {
  const whereClauses = [];
  if (filters === undefined || filters === null) return whereClauses;
  if (!Array.isArray(filters)) throw dbQueryError('Filtros inválidos.');
  const protectedColumns = new Set([
    ...(DB_QUERY_HIDDEN_COLUMNS[safeTable] || []),
    ...(DB_QUERY_MANAGER_COLUMNS[safeTable] || []),
  ]);
  const qualify = (rawColumn) => {
    const col = sanitizeIdentifier(String(rawColumn || ''));
    if (!col) throw dbQueryError('Filtro sem coluna.');
    if (protectedColumns.has(col.toLowerCase())) throw dbQueryError(`Não é possível filtrar por "${col}".`);
    return `${safeTable}.${col}`;
  };
  const param = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  for (const f of filters) {
    if (!f || typeof f !== 'object') throw dbQueryError('Filtro inválido.');
    switch (f.op) {
      case 'eq': whereClauses.push(`${qualify(f.column)} = ${param(f.value)}`); break;
      case 'neq': whereClauses.push(`${qualify(f.column)} != ${param(f.value)}`); break;
      case 'gt': whereClauses.push(`${qualify(f.column)} > ${param(f.value)}`); break;
      case 'gte': whereClauses.push(`${qualify(f.column)} >= ${param(f.value)}`); break;
      case 'lt': whereClauses.push(`${qualify(f.column)} < ${param(f.value)}`); break;
      case 'lte': whereClauses.push(`${qualify(f.column)} <= ${param(f.value)}`); break;
      case 'like': whereClauses.push(`${qualify(f.column)} LIKE ${param(f.value)}`); break;
      case 'ilike': whereClauses.push(`${qualify(f.column)} ILIKE ${param(f.value)}`); break;
      case 'is': whereClauses.push(`${qualify(f.column)} IS ${f.value === null ? 'NULL' : 'NOT NULL'}`); break;
      case 'in': whereClauses.push(`${qualify(f.column)} = ANY(${param(f.value)})`); break;
      case 'contains': whereClauses.push(`${qualify(f.column)} @> ${param(f.value)}`); break;
      case 'or': {
        const orClauses = [];
        for (const part of splitOrFilterParts(f.value)) {
          const [rawColumn, rawOp, ...rawValueParts] = part.split('.');
          const orColumn = sanitizeIdentifier(rawColumn || '');
          const orOp = String(rawOp || '').trim();
          const rawValue = rawValueParts.join('.');
          if (!orColumn || !orOp) continue;

          switch (orOp) {
            case 'eq': orClauses.push(`${qualify(orColumn)} = ${param(rawValue)}`); break;
            case 'neq': orClauses.push(`${qualify(orColumn)} != ${param(rawValue)}`); break;
            case 'gt': orClauses.push(`${qualify(orColumn)} > ${param(rawValue)}`); break;
            case 'gte': orClauses.push(`${qualify(orColumn)} >= ${param(rawValue)}`); break;
            case 'lt': orClauses.push(`${qualify(orColumn)} < ${param(rawValue)}`); break;
            case 'lte': orClauses.push(`${qualify(orColumn)} <= ${param(rawValue)}`); break;
            case 'like': orClauses.push(`${qualify(orColumn)} LIKE ${param(rawValue)}`); break;
            case 'ilike': orClauses.push(`${qualify(orColumn)} ILIKE ${param(rawValue)}`); break;
            case 'is': orClauses.push(`${qualify(orColumn)} IS ${rawValue === 'null' ? 'NULL' : 'NOT NULL'}`); break;
            case 'in': orClauses.push(`${qualify(orColumn)} = ANY(${param(parseFilterArray(rawValue))})`); break;
          }
        }
        if (orClauses.length > 0) whereClauses.push(`(${orClauses.join(' OR ')})`);
        break;
      }
      case 'not': {
        const nestedOp = f.value?.op;
        const nestedValue = f.value?.value;
        if (nestedOp === 'is') {
          whereClauses.push(`${qualify(f.column)} IS ${nestedValue === null ? 'NOT NULL' : 'NULL'}`);
        } else if (nestedOp === 'in') {
          whereClauses.push(`NOT (${qualify(f.column)} = ANY(${param(parseFilterArray(nestedValue))}))`);
        } else {
          whereClauses.push(`${qualify(f.column)} != ${param(nestedValue)}`);
        }
        break;
      }
      default:
        throw dbQueryError(`Operador de filtro desconhecido: "${String(f.op).slice(0, 20)}"`);
    }
  }
  return whereClauses;
}

/** Quem gerencia a equipe (mesmo critério do verifyTeamManager). */
async function isTeamManagerUser(user) {
  if (await isAdminUser(user)) return true;
  return userHasAssignedRole(user, 'gestor_projetos');
}

async function getDbQueryStripOptions(user, tables) {
  if (!tables.some((table) => DB_QUERY_MANAGER_COLUMNS[table])) return {};
  const canSeeManagerColumns = await isTeamManagerUser(user);
  const ownIds = canSeeManagerColumns ? [] : await getLinkedUserIds(user);
  return { canSeeManagerColumns, ownIds };
}

// Papéis que só um admin pode conceder ou tirar.
const DB_QUERY_PRIVILEGED_ROLES = PRIVILEGED_USER_ROLES;

// Papéis do endomarketing: o contrato de parceiro lança a despesa (useEndomarketing.createEndoExpense).
const DB_QUERY_ENDO_ROLES = ['endomarketing', 'parceiro'];

// Regras por tabela do /api/db/query (antes a única barreira era ALLOWED_TABLES).
// 'admin' = isAdminUser (admin ou social_media); 'team' = quem gerencia a equipe
// (admin, social_media ou gestor_projetos, como o verifyTeamManager); uma lista
// = quem gerencia a equipe ou tem um desses papéis. Os papéis saíram das telas
// que usam cada tabela (menu do Layout): financeiro só admin, Metas/Clientes/
// Relatórios/Contratos admin, social_media e gestor_projetos.
// Sem regra, qualquer pessoa logada lê e grava, como antes.
const DB_QUERY_TABLE_RULES = {
  user_roles: { write: 'team' },        // Equipe (Team.tsx) troca funções
  user_permissions: { write: 'team' },  // Equipe → permissões de módulo
  login_logs: { read: 'admin', write: 'admin' }, // insert do próprio login é liberado abaixo
  payment_config: { read: 'team', write: 'admin' }, // Financeiro → configurações (chave PIX da cobrança)
  whatsapp_config: { read: 'team', write: 'team' }, // o front usa /api/whatsapp/config
  whatsapp_messages: { read: 'team', write: 'team' }, // telefones e valores de cobrança
  api_integrations: { write: 'admin' }, // Financeiro → APIs e Configurações → integrações
  // Contas sociais: só Clientes (admin, social_media, gestor_projetos) grava pelo genérico;
  // a conexão de verdade (com token) é feita pelas rotas da Meta.
  social_accounts: { write: 'team' },
  api_integration_logs: { read: 'admin', write: 'admin' },
  plans: { write: 'admin' },
  commercial_proposals: { write: 'admin' },
  plan_promotions: { write: 'admin' },
  client_testimonials: { write: 'admin' },
  revenues: { read: 'team', write: 'team' },
  recurring_revenues: { read: 'team', write: 'team' },
  financial_contracts: { read: 'team', write: 'team' },
  financial_activity_log: { read: 'team', write: 'team' },
  financial_chat_messages: { read: 'team', write: 'team' },
  cash_reserve_movements: { read: 'team', write: 'team' },
  billing_messages: { read: 'team', write: 'team' },
  structure_investments: { read: 'team', write: 'team' },
  expenses: { read: DB_QUERY_ENDO_ROLES, write: DB_QUERY_ENDO_ROLES },
  // bônus de salário (Financeiro → Salários); o banner do colaborador usa /api/me/salary-bonuses
  salary_bonuses: { read: 'team', write: 'team' },
  expense_categories: { read: DB_QUERY_ENDO_ROLES, write: DB_QUERY_ENDO_ROLES },
};

// Artes: excluir um card (e o histórico dele) é de admin/social_media, como no detalhe da
// tarefa. Apagar em massa — filtro que não é o id de um card, como o "Limpar Banco de Dados"
// do cliente, que apaga por client_id — só um administrador. Coluna que identifica o card:
const DB_QUERY_DESIGN_DELETE_KEY = { design_tasks: 'id', design_task_history: 'task_id' };

// Tabelas de papel e perfil: upsert (ninguém usa no front) só para admin, porque
// o ON CONFLICT DO UPDATE passaria por cima das regras de update abaixo.
const DB_QUERY_STRICT_UPSERT_TABLES = new Set(['user_roles', 'profiles', 'user_permissions']);

/** Tem algum dos papéis (principal ou em user_roles, pelos ids ligados). */
async function userHasAnyAssignedRole(user, roles) {
  if (!user || !Array.isArray(roles) || roles.length === 0) return false;
  if (roles.includes(user.role)) return true;
  try {
    await ensureAuthSupportTables();
    const linkedIds = await getLinkedUserIds(user);
    if (linkedIds.length === 0) return false;
    const { rows } = await pool.query(
      'SELECT 1 FROM user_roles WHERE user_id::text = ANY($1::text[]) AND role::text = ANY($2::text[]) LIMIT 1',
      [linkedIds, roles]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('Role lookup failed:', error?.message || error);
    return false;
  }
}

async function dbQueryLevelAllows(user, level) {
  if (!level) return true;
  if (level === 'admin') return isAdminUser(user);
  if (await isTeamManagerUser(user)) return true;
  return Array.isArray(level) ? userHasAnyAssignedRole(user, level) : false;
}

/** Chaves de uma linha como o insert/update vão gravar (sanitizeIdentifier) e em minúsculas. */
function dbQueryRowKeys(item) {
  if (!item || typeof item !== 'object') return [];
  return Object.keys(item).map((key) => sanitizeIdentifier(String(key)).toLowerCase());
}

/** Valor de uma coluna procurando pela chave já limpa (evita "ro-le" virar "role" depois da checagem). */
function dbQueryRowValue(item, column) {
  if (!item || typeof item !== 'object') return undefined;
  const entry = Object.entries(item).find(([key]) => sanitizeIdentifier(String(key)).toLowerCase() === column);
  return entry ? entry[1] : undefined;
}

// Chaves de api_integrations.config que quem não é admin pode ler (o resto são segredos).
const API_INTEGRATION_PUBLIC_CONFIG_KEYS = new Set(['ai_model', 'ai_provider', 'api_key_set']);

function sanitizeApiIntegrationRows(rows) {
  for (const row of Array.isArray(rows) ? rows : [rows]) {
    if (!row || typeof row !== 'object' || !row.config || typeof row.config !== 'object') continue;
    row.config = Object.fromEntries(
      Object.entries(row.config).filter(([key]) => API_INTEGRATION_PUBLIC_CONFIG_KEYS.has(key))
    );
  }
  return rows;
}

async function selectRolesForDbQueryFilters(table, filters) {
  const params = [];
  const whereClauses = buildDbQueryWhere(filters, table, params);
  if (whereClauses.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT ${table}.role::text AS role FROM ${table} WHERE ${whereClauses.join(' AND ')}`,
    params
  );
  return rows.map((row) => row.role).filter(Boolean);
}

/**
 * Aplica as regras por papel do /api/db/query. Lança erro 403 quando o papel não
 * permite. Devolve { data, filters } a usar: em profiles, quem não gerencia a
 * equipe só altera a própria linha; em login_logs, o insert vai sempre com o
 * próprio user_id.
 */
async function enforceDbQueryRules({ safeTable, operation, data, filters, user, select, joins }) {
  if (operation === 'rpc') return { data, filters };
  const isWrite = operation !== 'select';
  const forbidden = (message) => dbQueryError(message || 'Sem permissão para esta operação.', 403);

  if (safeTable === 'login_logs' && operation === 'insert') {
    const items = (Array.isArray(data) ? data : [data]).map((item) => ({
      ...Object.fromEntries(Object.entries(item || {}).filter(([key]) => sanitizeIdentifier(String(key)).toLowerCase() !== 'user_id')),
      user_id: user.id,
    }));
    return { data: Array.isArray(data) ? items : items[0], filters };
  }

  const rule = DB_QUERY_TABLE_RULES[safeTable];
  const level = rule ? (isWrite ? rule.write : rule.read) : null;
  if (level && !(await dbQueryLevelAllows(user, level))) throw forbidden();

  if (operation === 'select') {
    // Join também lê a outra tabela: vale a regra de leitura dela.
    for (const join of Array.isArray(joins) ? joins : []) {
      const joinTable = sanitizeIdentifier(String(join?.table || ''));
      if (!joinTable || !ALLOWED_TABLES.includes(joinTable)) continue;
      const joinLevel = joinTable === 'api_integrations' ? 'admin' : DB_QUERY_TABLE_RULES[joinTable]?.read;
      if (joinLevel && !(await dbQueryLevelAllows(user, joinLevel))) throw forbidden();
    }
    // A limpeza de api_integrations.config é pelo nome da coluna: sem alias para quem não é admin.
    if (safeTable === 'api_integrations' && /\sas\s/i.test(String(select || '')) && !(await isAdminUser(user))) {
      throw forbidden();
    }
  }

  if (operation === 'upsert' && DB_QUERY_STRICT_UPSERT_TABLES.has(safeTable) && !(await isStrictAdminUser(user))) {
    throw forbidden();
  }

  if (operation === 'delete' && DB_QUERY_DESIGN_DELETE_KEY[safeTable]) {
    if (!(await isAdminUser(user))) throw forbidden('Apenas admin ou social_media podem excluir artes.');
    const keyColumn = DB_QUERY_DESIGN_DELETE_KEY[safeTable];
    const bySingleCard = (Array.isArray(filters) ? filters : []).some((filter) =>
      sanitizeIdentifier(String(filter?.column || '')).toLowerCase() === keyColumn
      && filter?.op === 'eq'
      && filter?.value !== undefined && filter?.value !== null && String(filter.value) !== ''
    );
    if (!bySingleCard && !(await isStrictAdminUser(user))) {
      throw forbidden('Só um administrador pode apagar várias artes de uma vez.');
    }
  }

  // Token de publicação só entra pelas rotas da Meta (que validam a conta); pelo genérico
  // dava para trocar a conta de um cliente pela de outra pessoa.
  if (safeTable === 'social_accounts' && isWrite) {
    const items = Array.isArray(data) ? data : [data];
    if (items.some((item) => dbQueryRowKeys(item).includes('access_token'))) {
      throw forbidden('O token da conta social só é gravado pela conexão com a Meta.');
    }
  }

  if (safeTable === 'user_roles' && isWrite && !(await isStrictAdminUser(user))) {
    const items = Array.isArray(data) ? data : [data];
    const grantsPrivileged = (operation === 'insert' || operation === 'upsert' || operation === 'update')
      && items.some((item) => DB_QUERY_PRIVILEGED_ROLES.has(String(dbQueryRowValue(item, 'role') ?? '')));
    const touchesPrivileged = (operation === 'update' || operation === 'delete')
      && (await selectRolesForDbQueryFilters('user_roles', filters)).some((role) => DB_QUERY_PRIVILEGED_ROLES.has(role));
    if (grantsPrivileged || touchesPrivileged) {
      throw forbidden('Só um administrador pode dar ou tirar as funções admin, social_media e socio_gestor.');
    }
  }

  if (safeTable === 'profiles' && isWrite) {
    const isTeam = await isTeamManagerUser(user);
    if (operation !== 'update') {
      // Ninguém cria nem apaga perfil pelo front (usa /api/auth/create-user e /api/delete-user).
      if (!(await isStrictAdminUser(user))) throw forbidden();
      return { data, filters };
    }
    const keys = dbQueryRowKeys(data);
    const blocked = ['id', 'password_hash', 'profile_password_hash', 'auth_password_hash'];
    if (!(await isStrictAdminUser(user))) blocked.push('email');
    if (!isTeam) blocked.push('role', 'monthly_salary');
    const blockedKey = keys.find((key) => blocked.includes(key));
    if (blockedKey) throw forbidden(`Sem permissão para alterar "${blockedKey}" do perfil.`);

    if (!isTeam) {
      // Quem não gerencia a equipe só altera o próprio perfil.
      const ownIds = await getLinkedUserIds(user);
      return { data, filters: [...(Array.isArray(filters) ? filters : []), { column: 'id', op: 'in', value: ownIds.length ? ownIds : [String(user.id)] }] };
    }

    if (keys.includes('role') && !(await isStrictAdminUser(user))) {
      const currentRoles = await selectRolesForDbQueryFilters('profiles', filters);
      if (DB_QUERY_PRIVILEGED_ROLES.has(String(dbQueryRowValue(data, 'role') ?? '')) || currentRoles.some((role) => DB_QUERY_PRIVILEGED_ROLES.has(role))) {
        throw forbidden('Só um administrador pode dar ou tirar as funções admin, social_media e socio_gestor.');
      }
    }
  }

  return { data, filters };
}

// Funções do banco que o front chama por supabase.rpc(). Qualquer outra é recusada.
const DB_QUERY_ALLOWED_RPC = new Set([
  'notify_role', 'notify_user', 'increment_promotion_redemption', 'cleanup_old_portal_videos',
]);

function isCrmLeadManagementPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const restrictedFields = new Set(['name', 'company', 'email', 'phone', 'contract_value']);
  return Object.keys(data).some((key) => restrictedFields.has(key));
}

/** Estágios válidos do CRM (espelha a CHECK constraint de crm_leads.status). */
const CRM_VALID_STAGES = new Set([
  'lead', 'contacted', 'meeting', 'contracted', 'disqualified',
  'lost', 'recovery_followup_1', 'recovery_followup_2', 'fridge',
]);

/** Estágios cuja entrada/saída exige permissão elevada (admin/social_media). */
const CRM_PRIVILEGED_STAGES = new Set(['contracted']);

/**
 * Valida a movimentação de um lead entre estágios.
 * Lança Error com .statusCode para ser traduzido em resposta HTTP.
 */
async function validateCrmStageTransition({ leadId, nextStatus, payload, user }) {
  if (!CRM_VALID_STAGES.has(nextStatus)) {
    const err = new Error(`Estágio inválido: "${nextStatus}".`);
    err.statusCode = 400;
    throw err;
  }

  if (!leadId) {
    const err = new Error('Movimentação de estágio exige o ID do lead.');
    err.statusCode = 400;
    throw err;
  }

  const { rows } = await pool.query(
    'SELECT id, status, contract_value, meeting_date, meeting_time FROM crm_leads WHERE id = $1',
    [leadId]
  );
  const current = rows[0];
  if (!current) {
    const err = new Error('Lead não encontrado.');
    err.statusCode = 404;
    throw err;
  }

  if (current.status === nextStatus) return; // no-op, nada a validar

  const isPrivilegedMove =
    CRM_PRIVILEGED_STAGES.has(nextStatus) || CRM_PRIVILEGED_STAGES.has(current.status);
  if (isPrivilegedMove && !(await isAdminUser(user))) {
    const err = new Error('Apenas admin ou social_media podem mover leads de/para "Contratado".');
    err.statusCode = 403;
    throw err;
  }

  if (nextStatus === 'contracted') {
    const value = Number(payload?.contract_value ?? current.contract_value ?? 0);
    if (!Number.isFinite(value) || value <= 0) {
      const err = new Error('Defina um valor de contrato maior que zero antes de marcar como Contratado.');
      err.statusCode = 400;
      throw err;
    }
  }

  if (nextStatus === 'meeting') {
    const mDate = payload?.meeting_date ?? current.meeting_date;
    const mTime = payload?.meeting_time ?? current.meeting_time;
    if (!mDate || !mTime) {
      const err = new Error('Agende data e horário antes de mover o lead para "Reunião".');
      err.statusCode = 400;
      throw err;
    }
  }
}



// Generic query endpoint
app.post('/api/db/query', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const { table, operation, select, order, limit: queryLimit, single, joins, onConflict } = req.body;
    let { data, filters } = req.body;

    const safeTable = sanitizeIdentifier(table);
    if (!ALLOWED_TABLES.includes(safeTable)) {
      return res.status(403).json({ error: `Table "${safeTable}" is not allowed` });
    }

    if (safeTable === 'profiles') {
      await ensureProfilesMonthlySalaryColumn().catch((error) => {
        console.warn('Could not ensure profiles.monthly_salary before generic query:', error?.message || error);
      });
    }

    if (safeTable === 'client_professionals' || safeTable === 'client_units' || safeTable === 'client_collaborators') {
      await ensureClientDatabaseTables().catch((error) => {
        console.warn('Could not ensure client database tables:', error?.message || error);
      });
    }



    if (safeTable === 'commercial_proposals' || safeTable === 'proposal_comments') {
      await ensureProposalTables();
    }

    if (safeTable === 'warehouse_items' || safeTable === 'warehouse_movements' || safeTable === 'structure_investments') {
      await ensureWarehouseTables().catch((error) => {
        console.warn('Could not ensure warehouse/structure tables:', error?.message || error);
      });
    }

    if (PENTE_FINO_SCHEMA[safeTable]) {
      await ensurePenteFinoTables().catch((error) => {
        console.warn('Could not ensure pente-fino tables:', error?.message || error);
      });
    }

    if (safeTable === 'story_editing_sessions') {

      await ensureStoryEditingSessionsTable();
    }

    if (safeTable === 'script_requests') {
      await ensureScriptRequestsTable();
    }

    if (safeTable === 'manual_video_tasks') {
      await ensureManualVideoTasksTable();
    }

    if (safeTable === 'plan_promotions') {
      await ensurePlanPromotionsTable();
    }

    if (safeTable === 'client_testimonials') {
      await ensureTestimonialsTable().catch((error) => {
        console.warn('Could not ensure client_testimonials table:', error?.message || error);
      });
    }

    if (safeTable === 'scheduled_recordings') {

      await ensureScheduledRecordingsTable();
    }

    if (safeTable === 'short_links' || safeTable === 'short_link_clicks') {
      await ensureShortLinksTables();
    }

    if (safeTable === 'salary_bonuses') {
      await ensureSalaryBonusesTable().catch((error) => {
        console.warn('Could not ensure salary bonuses table:', error?.message || error);
      });
    }

    if (safeTable === 'recurring_revenues' || safeTable === 'revenues') {
      await ensureRecurringRevenuesTables().catch((error) => {
        console.warn('Could not ensure recurring revenues tables:', error?.message || error);
      });
    }

    if (safeTable === 'campaigns' || safeTable === 'campaign_slots' || safeTable === 'scripts') {
      await ensureCampaignTables().catch((error) => {
        console.warn('Could not ensure campaign tables:', error?.message || error);
      });
    }



    // Multi-city: resolve cidade ativa e prepara flag de scoping
    // Só aplica se a tabela estiver na lista E realmente tiver a coluna `city` no DB.
    const scopeCity = TABLES_WITH_CITY.has(safeTable) && await tableHasCityColumn(safeTable);
    const activeCity = scopeCity ? await resolveActiveCity(req, user.id, user) : null;

    // Regras por papel (user_roles, profiles, configurações...). Pode restringir os filtros.
    ({ data, filters } = await enforceDbQueryRules({ safeTable, operation, data, filters, user, select, joins }));

    let result;


    switch (operation) {
      case 'select': {
        if (safeTable === 'crm_leads') {
          await ensureCrmLeadsColumns();
        }
        // Só entram joins de tabela liberada; o select só pode citar a base e esses joins.
        const acceptedJoins = (Array.isArray(joins) ? joins : [])
          .filter((join) => join && ALLOWED_TABLES.includes(sanitizeIdentifier(String(join.table || ''))));
        const joinTables = acceptedJoins.map((join) => sanitizeIdentifier(String(join.table)));
        const selectClause = buildSafeSelectClause(select, safeTable, joinTables);
        let query = `SELECT ${selectClause} FROM ${safeTable}`;

        const params = [];
        let paramIdx = 1;

        // Handle joins
        if (acceptedJoins.length > 0) {
          for (const join of acceptedJoins) {
            const joinTable = sanitizeIdentifier(String(join.table));
            const joinType = join.type === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';

            // Support structured join (leftTable.leftColumn = rightTable.rightColumn)
            if (join.leftTable && join.leftColumn && join.rightTable && join.rightColumn) {
              const lt = sanitizeIdentifier(join.leftTable);
              const lc = sanitizeIdentifier(join.leftColumn);
              const rt = sanitizeIdentifier(join.rightTable);
              const rc = sanitizeIdentifier(join.rightColumn);
              query += ` ${joinType} ${joinTable} ON ${lt}.${lc} = ${rt}.${rc}`;
            } else if (join.on) {
              // Legacy: sanitize each part of "table.col = table.col"
              const onParts = join.on.split('=').map(p => p.trim());
              if (onParts.length === 2) {
                const sanitizeQualified = (s) => s.split('.').map(sanitizeIdentifier).join('.');
                query += ` ${joinType} ${joinTable} ON ${sanitizeQualified(onParts[0])} = ${sanitizeQualified(onParts[1])}`;
              }
            }
          }
        }

        // Handle filters (mesmo montador do update e do delete)
        const whereClauses = buildDbQueryWhere(filters, safeTable, params);
        if (whereClauses.length > 0) query += ` WHERE ${whereClauses.join(' AND ')}`;
        paramIdx = params.length + 1;

        // Multi-city: força filtro de cidade no SELECT
        if (scopeCity) {
          query += (query.includes(' WHERE ') ? ' AND ' : ' WHERE ') + `${cityVisibilityExpression(`${safeTable}.city`, `$${paramIdx}`)}`;
          params.push(activeCity);
          paramIdx++;
        }


        // Handle order
        if (order) {
          const orderParts = Array.isArray(order) ? order : [order];
          const orderClauses = orderParts.map(o => {
            const orderColumn = sanitizeOrderColumn(o?.column, safeTable);
            const [orderTable, orderName] = orderColumn.split('.');
            const blocked = [...(DB_QUERY_HIDDEN_COLUMNS[orderTable] || []), ...(DB_QUERY_MANAGER_COLUMNS[orderTable] || [])];
            if (blocked.includes(String(orderName || '').toLowerCase())) throw dbQueryError(`Não é possível ordenar por "${orderName}".`);
            return `${orderColumn} ${o?.ascending === false ? 'DESC' : 'ASC'}`;
          });
          query += ` ORDER BY ${orderClauses.join(', ')}`;
        }

        // Handle limit
        if (queryLimit) query += ` LIMIT ${parseInt(queryLimit)}`;

        // Protocolo estendido: impede comandos empilhados mesmo quando não há parâmetros.
        const { rows } = await pool.query({ text: query, values: params, queryMode: 'extended' });
        const selectTables = [safeTable, ...joinTables];
        stripDbQueryColumns(rows, selectTables, await getDbQueryStripOptions(user, selectTables));
        if (safeTable === 'api_integrations' && !(await isAdminUser(user))) sanitizeApiIntegrationRows(rows);
        if (selectTables.some((table) => BRIEFING_DATA_TABLES.has(table)) && !(await isTeamManagerUser(user))) {
          stripBriefingSecretsFromRows(rows, selectTables);
        }
        result = { data: single ? (rows[0] || null) : rows, error: null };
        break;
      }

      case 'insert': {
        const items = Array.isArray(data) ? data : [data];
        const allResults = [];
        const jsonColumns = await getTableJsonColumns(safeTable);
        const isAdmin = await isAdminUser(user);
        const existingColumns = await getExistingColumns(safeTable);
        if (safeTable === 'crm_leads') {
          await ensureCrmLeadsColumns();
        }
        for (const item of items) {
          if (safeTable === 'crm_leads' && item.status === 'meeting') {
            await validateMeetingConflict(item.meeting_date, item.meeting_time);
          }


          // Multi-city: força city para a cidade ativa (ignora qualquer valor enviado pelo cliente)
          const itemScoped = scopeCity
            ? { ...item, city: assertValidCity(activeCity) }
            : (item && item.city !== undefined ? { ...item, city: assertValidCity(item.city) } : item);

          // ─── Regra anti-duplicação: reutiliza placeholder em "ideias" ───
          // Um roteiro novo (card em "ideias" com script_id) ocupa a vaga gerada pela demanda
          // semanal da Copy (mesmo cliente + tipo, sem script e sem gravação) em vez de criar
          // outro card. Evita cópias fantasmas na Zona de Ideias.
          // Só vale para os placeholders automáticos (descrição "🤖 Gerado automaticamente" /
          // "🎯 Gerado manualmente"). Antes qualquer insert (ideia manual, divisão de otimização,
          // story, gravação finalizada) sobrescrevia a ideia mais antiga do cliente, e os N
          // placeholders da Copy viravam 1. Insert com id próprio também não reaproveita:
          // quem manda o id usa ele logo depois (entregas, portal).
          const isCopyPlaceholder = (description) => typeof description === 'string'
            && (description.startsWith('🤖 Gerado automaticamente') || description.startsWith('🎯 Gerado manualmente'));
          if (
            safeTable === 'content_tasks' &&
            itemScoped &&
            itemScoped.client_id &&
            itemScoped.content_type &&
            itemScoped.script_id &&
            !itemScoped.id &&
            (itemScoped.kanban_column || 'ideias') === 'ideias' &&
            !isCopyPlaceholder(itemScoped.description)
          ) {
            try {
              const cityClause = scopeCity ? `AND ${cityVisibilityExpression('city', '$3')}` : '';
              const placeholderQuery = `
                SELECT id FROM content_tasks
                WHERE client_id = $1
                  AND content_type = $2
                  AND kanban_column = 'ideias'
                  AND script_id IS NULL
                  AND recording_id IS NULL
                  AND (description LIKE '🤖 Gerado automaticamente%' OR description LIKE '🎯 Gerado manualmente%')
                  ${cityClause}
                ORDER BY created_at ASC
                LIMIT 1
              `;
              const placeholderParams = scopeCity
                ? [itemScoped.client_id, itemScoped.content_type, activeCity]
                : [itemScoped.client_id, itemScoped.content_type];
              const { rows: placeholderRows } = await pool.query(placeholderQuery, placeholderParams);
              if (placeholderRows.length > 0) {
                const placeholderId = placeholderRows[0].id;
                const updateEntries = Object.entries(itemScoped)
                  .map(([key, value]) => [sanitizeIdentifier(key), value])
                  .filter(([key]) => key !== 'id' && key !== 'created_at')
                  .filter(([key]) => !existingColumns || existingColumns.has(key));
                if (updateEntries.length > 0) {
                  const updKeys = updateEntries.map(([k]) => k);
                  const updValues = updateEntries.map(([k, v]) => serializeValueForColumn(k, v, jsonColumns));
                  const setClause = updKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
                  const { rows: updated } = await pool.query(
                    `UPDATE content_tasks SET ${setClause}, updated_at = NOW() WHERE id = $${updKeys.length + 1} RETURNING *`,
                    [...updValues, placeholderId]
                  );
                  console.log(`[content_tasks anti-dup] Reused placeholder ${placeholderId} (client=${itemScoped.client_id}, type=${itemScoped.content_type})`);
                  allResults.push(updated[0]);
                  continue;
                }
              }
            } catch (dupErr) {
              console.warn('[content_tasks anti-dup] check failed, falling back to INSERT:', dupErr?.message || dupErr);
            }
          }

          const entries = Object.entries(itemScoped)
            .map(([key, value]) => [sanitizeIdentifier(key), value])
            .filter(([key]) => !existingColumns || existingColumns.has(key));
          if (entries.length === 0) continue;
          const keys = entries.map(([key]) => key);
          const values = entries.map(([key, value]) => serializeValueForColumn(key, value, jsonColumns));
          const placeholders = values.map((_, i) => `$${i + 1}`);
          const { rows } = await pool.query(
            `INSERT INTO ${safeTable} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
            values
          );
          allResults.push(rows[0]);

          // Broadcaster: Notificações globais de novos fechamentos
          if (safeTable === 'crm_leads' && rows[0]?.status === 'contracted') {
            const city = rows[0].city || 'Pulse';
            broadcastToAll({
              type: 'broadcast',
              event: 'crm:new_client',
              payload: { 
                id: rows[0].id, 
                name: rows[0].name, 
                city,
                message: `🎉 Novo contrato fechado: ${rows[0].name} (${city})`
              }
            });
          }
        }
        result = { data: allResults.length === 1 ? allResults[0] : allResults, error: null };
        break;
      }

      case 'upsert': {
        const items = Array.isArray(data) ? data : [data];
        const allResults = [];
        const jsonColumns = await getTableJsonColumns(safeTable);

        if (safeTable === 'crm_leads') {
          await ensureCrmLeadsColumns();
        }
        if (safeTable === 'client_bio_links' || safeTable === 'client_bio_buttons') {
          await ensureBioLinksTables();
        }
        for (const item of items) {

          const itemScoped = scopeCity
            ? { ...item, city: assertValidCity(activeCity) }
            : (item && item.city !== undefined ? { ...item, city: assertValidCity(item.city) } : item);
          const entries = Object.entries(itemScoped || {}).map(([key, value]) => [sanitizeIdentifier(key), value]);
          if (entries.length === 0) continue;

          const keys = entries.map(([key]) => key);
          const values = entries.map(([key, value]) => serializeValueForColumn(key, value, jsonColumns));
          const placeholders = values.map((_, i) => `$${i + 1}`);
          const conflictColumns = String(onConflict || 'id')
            .split(',')
            .map((column) => sanitizeIdentifier(column.trim()))
            .filter(Boolean);
          const conflictSet = new Set(conflictColumns);
          const updateKeys = keys.filter((key) => !conflictSet.has(key));
          const updateSet = updateKeys.length > 0
            ? updateKeys.map((key) => `${key} = EXCLUDED.${key}`).join(', ')
            : `${conflictColumns[0] || keys[0]} = EXCLUDED.${conflictColumns[0] || keys[0]}`;

          // Multi-city: o DO UPDATE só alcança linha da cidade ativa (ou sem cidade), como
          // o update e o delete. Antes um id de outra cidade era sobrescrito e mudava de praça.
          const upsertParams = scopeCity ? [...values, activeCity] : values;
          const cityGuard = scopeCity
            ? ` WHERE ${cityVisibilityExpression(`${safeTable}.city`, `$${values.length + 1}`)}`
            : '';

          const { rows } = await pool.query(
            `INSERT INTO ${safeTable} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})
             ON CONFLICT (${(conflictColumns.length ? conflictColumns : ['id']).join(', ')}) DO UPDATE SET ${updateSet}${cityGuard}
             RETURNING *`,
            upsertParams
          );
          if (rows.length === 0) {
            throw dbQueryError('Esse registro é de outra cidade e não foi alterado.', 409);
          }
          allResults.push(rows[0]);
        }

        result = { data: single ? (allResults[0] || null) : (allResults.length === 1 ? allResults[0] : allResults), error: null };
        break;
      }


      case 'update': {
        if (safeTable === 'crm_leads') {
          await ensureCrmLeadsColumns();
          if (isCrmLeadManagementPayload(data) && !(await isAdminUser(user))) {
            return res.status(403).json({ error: 'Apenas admin ou social_media podem editar este lead no CRM.' });
          }
          if (data && typeof data === 'object' && data.status !== undefined) {
            const leadId = filters?.find(f => f.column === 'id' && f.op === 'eq')?.value;
            try {
              await validateCrmStageTransition({ leadId, nextStatus: data.status, payload: data, user });
            } catch (stageError) {
              return res
                .status(stageError.statusCode || 400)
                .json({ error: stageError.message || 'Movimentação de estágio inválida.' });
            }
          }
        }



        const scopedData = scopeCity
          ? { ...data, city: assertValidCity(activeCity) }
          : (data && data.city !== undefined ? { ...data, city: assertValidCity(data.city) } : data);

        let crmResetReminder = false;
        if (safeTable === 'crm_leads' && (scopedData.meeting_date || scopedData.meeting_time || scopedData.status === 'meeting')) {
          const leadId = filters?.find(f => f.column === 'id' && f.op === 'eq')?.value;
          const { rows: currentLead } = await pool.query(`SELECT meeting_date, meeting_time, status FROM crm_leads WHERE id = $1`, [leadId]);
          
          const mDate = scopedData.meeting_date || currentLead[0]?.meeting_date;
          const mTime = scopedData.meeting_time || currentLead[0]?.meeting_time;
          const status = scopedData.status || currentLead[0]?.status;

          if (status === 'meeting') {
            await validateMeetingConflict(mDate, mTime, leadId);
          }

          // Reunião reagendada: o lembrete de 24h volta a valer para a data/hora nova.
          if (currentLead[0]) {
            const dateChanged = scopedData.meeting_date !== undefined
              && String(scopedData.meeting_date || '').slice(0, 10) !== String(currentLead[0].meeting_date || '').slice(0, 10);
            const timeChanged = scopedData.meeting_time !== undefined
              && String(scopedData.meeting_time || '').slice(0, 5) !== String(currentLead[0].meeting_time || '').slice(0, 5);
            crmResetReminder = dateChanged || timeChanged;
          }
        }

        const existingColumns = await getExistingColumns(safeTable);
        const entries = Object.entries(crmResetReminder ? { ...scopedData, reminder_sent_24h: false } : scopedData)
          .map(([key, value]) => [sanitizeIdentifier(key), value])
          .filter(([key]) => !existingColumns || existingColumns.has(key));
        if (entries.length === 0) {
          result = { data: [], error: null };
          break;
        }
        const keys = entries.map(([key]) => key);
        const jsonColumns = await getTableJsonColumns(safeTable);
        const values = entries.map(([key, value]) => serializeValueForColumn(key, value, jsonColumns));

        // CRM: o aviso de contrato/reunião sai só quando o status muda (antes saía em
        // qualquer edição de um lead já fechado ou em reunião, até ao mudar observação).
        let crmPreviousStatus = null;
        if (safeTable === 'crm_leads' && (scopedData?.status === 'contracted' || scopedData?.status === 'meeting')) {
          const prevParams = [];
          const prevWhere = buildDbQueryWhere(filters, safeTable, prevParams);
          if (prevWhere.length > 0) {
            const { rows: prevRows } = await pool.query(
              `SELECT id::text AS id, status::text AS status FROM crm_leads WHERE ${prevWhere.join(' AND ')}`,
              prevParams
            ).catch(() => ({ rows: [] }));
            crmPreviousStatus = new Map(prevRows.map((row) => [row.id, row.status]));
          }
        }

        let paramIdx = 1;
        const setClauses = keys.map(k => {
          const placeholder = `$${paramIdx++}`;
          // api_integrations: os secrets (*_encrypted) que não vierem no config novo continuam.
          // A tela de APIs regravava o config só com App ID e notas e apagava o App Secret da Meta.
          if (safeTable === 'api_integrations' && k === 'config') {
            return `config = COALESCE((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(COALESCE(api_integrations.config, '{}'::jsonb)) e
                       WHERE right(e.key, 10) = '_encrypted'), '{}'::jsonb) || COALESCE(${placeholder}::jsonb, '{}'::jsonb)`;
          }
          return `${k} = ${placeholder}`;
        });

        let query = `UPDATE ${safeTable} SET ${setClauses.join(', ')}`;
        const params = [...values];

        // Todos os filtros valem (antes só eq/in). Sem filtro do cliente, recusa:
        // o filtro de cidade sozinho viraria um UPDATE na cidade inteira.
        const whereClauses = buildDbQueryWhere(filters, safeTable, params);
        if (whereClauses.length === 0) {
          return res.status(400).json({ data: null, error: { message: 'Atualização sem filtro recusada.' } });
        }
        query += ` WHERE ${whereClauses.join(' AND ')}`;
        paramIdx = params.length + 1;
        // Multi-city: impede UPDATE cruzado
        if (scopeCity) {
          query += (query.includes(' WHERE ') ? ' AND ' : ' WHERE ') + `${cityVisibilityExpression('city', `$${paramIdx}`)}`;
          params.push(activeCity);
          paramIdx++;
        }
        query += ' RETURNING *';

        const { rows } = await pool.query(query, params);
        
        // Broadcaster: Notificações globais de status de lead (só na mudança de status)
        if (safeTable === 'crm_leads' && rows.length > 0 && crmPreviousStatus) {
          for (const lead of rows) {
            if (crmPreviousStatus.get(String(lead.id)) === lead.status) continue;
            if (lead.status === 'contracted') {
              await incrementPromotionsForClosedLead(lead);
              broadcastToAll({
                type: 'broadcast',
                event: 'crm:new_client',
                payload: { 
                  id: lead.id, name: lead.name, city: lead.city || 'Pulse',
                  message: `🎉 Novo contrato fechado: ${lead.name} (${lead.city || 'Pulse'})`
                }
              });
            } else if (lead.status === 'meeting') {
              broadcastToAll({
                type: 'broadcast',
                event: 'crm:meeting_scheduled',
                payload: { 
                  id: lead.id, name: lead.name, 
                  date: lead.meeting_date, time: lead.meeting_time,
                  message: `📅 Reunião agendada: ${lead.name} às ${lead.meeting_time}`
                }
              });
            }
          }
        }
        
        result = { data: rows, error: null };
        break;
      }

      case 'delete': {
        if (safeTable === 'crm_leads' && !(await isAdminUser(user))) {
          return res.status(403).json({ error: 'Apenas admin ou social_media podem excluir leads do CRM.' });
        }

        let query = `DELETE FROM ${safeTable}`;
        const params = [];

        // Mesmo montador do select (antes is/not/or eram ignorados e apagavam a mais).
        // Sem filtro do cliente, recusa: o filtro de cidade sozinho apagaria a cidade inteira.
        const whereClauses = buildDbQueryWhere(filters, safeTable, params);
        if (whereClauses.length === 0) {
          return res.status(400).json({ data: null, error: { message: 'Exclusão sem filtro recusada.' } });
        }
        query += ` WHERE ${whereClauses.join(' AND ')}`;
        let paramIdx = params.length + 1;
        // Multi-city: impede DELETE cruzado
        if (scopeCity) {
          query += (query.includes(' WHERE ') ? ' AND ' : ' WHERE ') + `${cityVisibilityExpression('city', `$${paramIdx}`)}`;
          params.push(activeCity);
          paramIdx++;
        }
        query += ' RETURNING *';

        const { rows } = await pool.query(query, params);
        result = { data: rows, error: null };
        break;
      }

      case 'rpc': {
        // Call a database function (só as da lista fechada)
        const funcName = sanitizeIdentifier(String(data?.function_name || ''));
        if (!DB_QUERY_ALLOWED_RPC.has(funcName)) {
          return res.status(403).json({ error: `Função "${funcName}" não é permitida` });
        }
        const args = data.args || {};
        const argKeys = Object.keys(args);
        const argValues = Object.values(args);
        const placeholders = argValues.map((_, i) => `$${i + 1}`);
        const funcCall = argKeys.length > 0
          ? `SELECT * FROM ${funcName}(${argKeys.map((k, i) => `${sanitizeIdentifier(k)} := $${i + 1}`).join(', ')})`
          : `SELECT * FROM ${funcName}()`;
        const { rows } = await pool.query(funcCall, argValues);
        result = { data: single ? (rows[0] || null) : rows, error: null };
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown operation: ${operation}` });
    }

    // RETURNING * de insert/update/upsert/delete também não devolve colunas sensíveis
    if (operation !== 'select' && operation !== 'rpc' && result?.data) {
      stripDbQueryColumns(result.data, [safeTable], await getDbQueryStripOptions(user, [safeTable]));
      if (BRIEFING_DATA_TABLES.has(safeTable) && !(await isTeamManagerUser(user))) {
        stripBriefingSecretsFromRows(result.data, [safeTable]);
      }
    }

    res.json(result);
  } catch (e) {
    console.error('DB query error:', e);
    const status = [400, 403, 409, 503].includes(e?.statusCode)
      ? e.statusCode
      : e?.message === 'Unauthorized' ? 401 : 500;
    res.status(status).json({ data: null, error: { message: e.message } });
  }
});

// ═══════════════════════════════════════════════════════════════
// CRUD ROUTES — Phase 4: Direct DB access (replaces Supabase SDK)
// ═══════════════════════════════════════════════════════════════

/** checklist vem como JSONB (array) ou, em base antiga, como texto JSON. */
function parseDesignChecklist(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ─── Designer fast feed ──────────────────────────────────────
// Endpoint especializado para o Kanban/Painel da designer.
// Evita o endpoint genérico /db/query, que precisa montar SELECT + JOINs
// dinamicamente e ficou pesado para a primeira renderização dos cards.
app.get('/api/design-tasks/fast', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'design_tasks');
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '600'), 10) || 600, 50), 1000);
    const postadoDays = Math.min(Math.max(parseInt(String(req.query.postado_days || '21'), 10) || 21, 1), 120);
    const postadoSince = new Date(Date.now() - postadoDays * 24 * 60 * 60 * 1000).toISOString();

    const params = [postadoSince];
    let paramIdx = 2;
    const where = [
      `(dt.kanban_column IS DISTINCT FROM 'postado' OR dt.updated_at >= $1)`,
    ];

    if (scopeCity) {
      where.push(cityVisibilityExpression('dt.city', `$${paramIdx}`));
      params.push(activeCity);
      paramIdx++;
    }

    params.push(limit);

    // Checklist (Reformulação do onboarding) e colaborador (arte de aniversário) aparecem no
    // detalhe da tarefa; só entram se a coluna existir, para o feed não cair por falta dela.
    const dtColumns = await getExistingColumns('design_tasks').catch(() => null);
    const extraSelect = [
      dtColumns?.has('checklist') ? 'dt.checklist' : null,
      dtColumns?.has('collaborator_id') ? 'dt.collaborator_id' : null,
    ].filter(Boolean).map((col) => `\n          ${col},`).join('');

    const { rows } = await pool.query(
      `SELECT${extraSelect}
          dt.id,
          dt.client_id,
          dt.prospect_name,
          dt.title,
          dt.description,
          dt.format_type,
          dt.kanban_column,
          dt.priority,
          dt.copy_text,
          COALESCE(dt.references_links, ARRAY[]::text[]) AS references_links,
          COALESCE(dt.reference_images, ARRAY[]::text[]) AS reference_images,
          dt.attachment_url,
          COALESCE(dt.attachment_urls, ARRAY[]::text[]) AS attachment_urls,
          dt.editable_file_url,
          dt.observations,
          dt.created_by,
          dt.assigned_to,
          dt.started_at,
          dt.completed_at,
          dt.sent_to_client_at,
          dt.client_approved_at,
          COALESCE(dt.auto_approved, false) AS auto_approved,
          COALESCE(dt.time_spent_seconds, 0) AS time_spent_seconds,
          COALESCE(dt.timer_running, false) AS timer_running,
          dt.timer_started_at,
          COALESCE(dt.version, 1) AS version,
          dt.mockup_url,
          dt.due_date,
          COALESCE(dt.position, 999999999) AS position,
          dt.created_at,
          dt.updated_at,
          c.company_name AS clients_company_name,
          c.color AS clients_color,
          c.logo_url AS clients_logo_url,
          c.whatsapp AS clients_whatsapp,
          c.responsible_person AS clients_responsible_person,
          p.name AS profiles_name,
          p.display_name AS profiles_display_name,
          p.avatar_url AS profiles_avatar_url
       FROM design_tasks dt
       LEFT JOIN clients c ON c.id = dt.client_id
       LEFT JOIN profiles p ON p.id = dt.assigned_to
       WHERE ${where.join(' AND ')}
       ORDER BY
          CASE WHEN dt.kanban_column = 'postado' THEN 1 ELSE 0 END ASC,
          dt.position ASC NULLS LAST,
          dt.created_at DESC
       LIMIT $${paramIdx}`,
      params
    );

    const data = rows.map((row) => ({
      id: row.id,
      client_id: row.client_id,
      prospect_name: row.prospect_name,
      title: row.title,
      description: row.description,
      format_type: row.format_type,
      kanban_column: row.kanban_column,
      priority: row.priority,
      copy_text: row.copy_text,
      references_links: row.references_links || [],
      reference_images: row.reference_images || [],
      attachment_url: row.attachment_url,
      attachment_urls: row.attachment_urls || [],
      editable_file_url: row.editable_file_url,
      observations: row.observations,
      created_by: row.created_by,
      assigned_to: row.assigned_to,
      started_at: row.started_at,
      completed_at: row.completed_at,
      sent_to_client_at: row.sent_to_client_at,
      client_approved_at: row.client_approved_at,
      auto_approved: row.auto_approved,
      time_spent_seconds: row.time_spent_seconds,
      timer_running: row.timer_running,
      timer_started_at: row.timer_started_at,
      version: row.version,
      mockup_url: row.mockup_url,
      due_date: row.due_date,
      position: row.position,
      created_at: row.created_at,
      updated_at: row.updated_at,
      checklist: parseDesignChecklist(row.checklist),
      collaborator_id: row.collaborator_id ?? null,
      clients: row.clients_company_name ? {
        company_name: row.clients_company_name,
        color: row.clients_color || '217 91% 60%',
        logo_url: row.clients_logo_url,
        whatsapp: row.clients_whatsapp || '',
        responsible_person: row.clients_responsible_person || '',
      } : null,
      profiles: row.profiles_name ? {
        name: row.profiles_name,
        display_name: row.profiles_display_name,
        avatar_url: row.profiles_avatar_url,
      } : null,
    }));

    // A cidade vai só no cabeçalho x-pulse-city (a URL é a mesma): sem cache no
    // navegador, senão a troca de cidade (ou criar/excluir card) recebia a lista antiga.
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    console.error('GET /api/design-tasks/fast error:', e);
    res.status(e.message === 'Unauthorized' ? 401 : 500).json({ error: e.message });
  }
});

// ─── Clients ────────────────────────────────────────────────
app.get('/api/clients', async (req, res) => {
  try {
    const { user, activeCity, scopeCity } = await getScopedCityContext(req, 'clients');
    const { rows } = scopeCity
      ? await pool.query(`SELECT * FROM clients WHERE ${cityVisibilityExpression('city', '$1')} ORDER BY company_name`, [activeCity])
      : await pool.query('SELECT * FROM clients ORDER BY company_name');
    res.json(await sanitizeClientRowsForUser(rows, user));
  } catch (e) { res.status(e.message === 'Unauthorized' ? 401 : 500).json({ error: e.message }); }
});

app.post('/api/clients', async (req, res) => {
  try {
    const { user, activeCity, scopeCity } = await getScopedCityContext(req, 'clients');
    // Garante colunas NUMERIC antes de gravar metas fracionadas do plano especial
    await ensureClientFractionalGoalColumns().catch(() => {});
    await ensureClientExperienceColumns().catch(() => {});
    await ensureGlobalClientSupport().catch(() => {});
    const c = req.body;

    const { rows } = await pool.query(
      `INSERT INTO clients (id, company_name, responsible_person, phone, color, logo_url, fixed_day, fixed_time,
        videomaker_id, backup_time, backup_day, extra_day, extra_content_types, accepts_extra, extra_client_appears,
        whatsapp, whatsapp_group, email, city, weekly_reels, weekly_creatives, weekly_goal, has_endomarketing,
        has_vehicle_flyer, weekly_stories, presence_days, monthly_recordings, niche, client_login,
        drive_link, drive_fotos, drive_identidade_visual, editorial, plan_id, contract_start_date,
        contract_duration_months, auto_renewal, selected_weeks, has_photo_shoot, accepts_photo_shoot_cost,
        briefing_data, show_metrics, photo_preference, client_type, company_birthday, client_owners)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46)
       RETURNING *`,
      [
        c.id || crypto.randomUUID(), c.company_name, c.responsible_person || '', c.phone || '', c.color || '217 91% 60%',
        c.logo_url || null, c.fixed_day || 'segunda', c.fixed_time || '09:00', c.videomaker_id || null,
        c.backup_time || '14:00', c.backup_day || 'terca', c.extra_day || 'quarta',
        c.extra_content_types || '{}', c.accepts_extra ?? false, c.extra_client_appears ?? false,
        c.whatsapp || '', c.whatsapp_group || null, c.email || '', assertValidCity(scopeCity ? activeCity : (c.city || 'minacu')),
        parseWeeklyGoal(c.weekly_reels, 0), parseWeeklyGoal(c.weekly_creatives, 0), parseWeeklyGoal(c.weekly_goal, 10), c.has_endomarketing ?? false,
        c.has_vehicle_flyer ?? false, parseWeeklyGoal(c.weekly_stories, 0), c.presence_days ?? 1, c.monthly_recordings ?? 4,

        c.niche || '', (c.client_login && String(c.client_login).trim()) || null, c.drive_link || '', c.drive_fotos || '',
        c.drive_identidade_visual || '', c.editorial || '', c.plan_id || null, c.contract_start_date || null,
        c.contract_duration_months ?? 12, c.auto_renewal ?? false, c.selected_weeks || '{1,2,3,4}',
        c.has_photo_shoot ?? false, c.accepts_photo_shoot_cost ?? false,
        c.briefing_data ? JSON.stringify(c.briefing_data) : '{}', c.show_metrics ?? true,
        c.photo_preference || 'nao_precisa', c.client_type || 'novo',
        parseDateOrNull(c.company_birthday), JSON.stringify(normalizeClientOwners(c.client_owners))
      ]
    );
    let created = rows[0];
    if (c.is_admin_client === true || c.is_admin_client === 'true') {
      const upd = await pool.query(
        `UPDATE clients SET is_admin_client = true WHERE id = $1 RETURNING *`,
        [created.id]
      );
      created = upd.rows[0] || created;
    }
    res.json(await sanitizeClientRowsForUser(created, user));
  } catch (e) {
    console.error('POST /api/clients error:', e);
    // 23505 = violação de índice único (ex.: client_login repetido)
    if (e?.code === '23505') {
      const field = /client_login/i.test(e.detail || '') ? 'login do cliente' : 'campo único';
      return res.status(409).json({ error: `Já existe um cliente com o mesmo ${field}. Altere o login e tente novamente.` });
    }
    const status = e?.statusCode === 400 ? 400 : 500;
    res.status(status).json({ error: e.message });
  }

});

// ─── Pré-validação (dry-run) da transferência de cidade ─────
// Retorna quais tabelas/registros seriam movidos, sem alterar nada no banco.
const TRANSFER_TABLE_LABELS = {
  recordings: 'Gravações',
  kanban_tasks: 'Tarefas Kanban',
  scripts: 'Roteiros',
  content_tasks: 'Tarefas de Conteúdo',
  design_tasks: 'Tarefas de Design',
  delivery_records: 'Entregas',
  revenues: 'Receitas',
  expenses: 'Despesas',
  financial_contracts: 'Contratos Financeiros',
  billing_messages: 'Cobranças',
  social_media_deliveries: 'Entregas Social Media',
  social_accounts: 'Contas Sociais',
  onboarding_tasks: 'Onboarding',
  client_portal_contents: 'Conteúdos do Portal',
  client_portal_comments: 'Comentários do Portal',
  client_portal_notifications: 'Notificações do Portal',
  flyer_items: 'Encartes',
  portal_videos: 'Vídeos do Portal',
  traffic_campaigns: 'Campanhas de Tráfego',
  whatsapp_messages: 'Mensagens WhatsApp',
  whatsapp_confirmations: 'Confirmações WhatsApp',
  commercial_proposals: 'Propostas Comerciais',
  event_recordings: 'Gravações de Evento',
  client_testimonials: 'Depoimentos',
  script_requests: 'Solicitações de Roteiro',
  manual_video_tasks: 'Vídeos Avulsos',
  story_editing_sessions: 'Edição de Stories',
  crm_leads: 'Leads CRM',
  crm_notes: 'Notas CRM',
  endomarketing_clientes: 'Endomarketing',
  goals: 'Metas',
  task_comments: 'Comentários de Tarefas',
  task_history: 'Histórico de Tarefas',
  design_task_history: 'Histórico de Design',
  proposal_comments: 'Comentários de Propostas',
  client_bio_buttons: 'Botões da Bio',
};

app.get('/api/clients/:id/transfer-preview', async (req, res) => {
   try {
     const { id } = req.params;

     // Admins podem visualizar previews sem validar activeCity rigorosamente
     const { user } = await verifyUser(req);

    // Diagnóstico estrito: em vez de cair silenciosamente em 'minacu', devolve
    // um erro estruturado (code + hint) quando a cidade não pode ser resolvida.
    const diagnosis = diagnoseTransferCity({ headers: req.headers, query: req.query });
    if (!diagnosis.ok) {
      console.warn(`[City-Resolution] scope=transfer-preview client=${id} FAILED code=${diagnosis.error.code} header=${req.headers['x-pulse-city'] ?? '-'} query=${req.query?.city ?? '-'}`);
      return res.status(400).json(diagnosis.error);
    }

    const validatedCity = diagnosis.city;
    console.log(formatCityResolutionLog(diagnosis, { scope: 'transfer-preview', clientId: id }));
    if (diagnosis.warning) {
      console.warn(`[City-Resolution] scope=transfer-preview client=${id} ${diagnosis.warning.code}: ${diagnosis.warning.message}`);
    }




     const { rows: currentRows } = await pool.query(
       'SELECT id, company_name, city FROM clients WHERE id = $1',
       [id]
     );

    if (currentRows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const client = currentRows[0];
    const currentCity = normalizeCityValue(client.city) || 'minacu';
    const targetCityFinal = validatedCity || 'minacu';

    // Mesma regra do PUT: só a gestão da cidade de origem transfere.
    if (!(await canTransferClientCity(user, currentCity))) {
      return res.status(403).json({
        code: 'TRANSFER_FORBIDDEN',
        error: 'Sem permissão para transferir este cliente de cidade.',
        message: 'Só admin, social media ou gestor de projetos da cidade de origem podem transferir o cliente.',
      });
    }

    const details = [];
    let total = 0;

    for (const tableName of TABLES_WITH_CITY) {
      if (tableName === 'clients') continue;
      try {
        if (!(await tableHasCityColumn(tableName))) continue;
        const existingColumns = await getExistingColumns(tableName);
        if (!existingColumns.has('client_id')) continue;

        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS total FROM ${tableName} WHERE client_id = $1`,
          [id]
        );
        const count = rows[0]?.total || 0;
        if (count > 0) {
          total += count;
          details.push({
            table: tableName,
            label: TRANSFER_TABLE_LABELS[tableName] || tableName,
            count,
          });
        }
      } catch (err) {
        console.warn(`[Transfer-Preview] Falha ao contar ${tableName}:`, err?.message || err);
      }
    }

    // Comentários e históricos (sem client_id) também acompanham o cliente.
    for (const child of CLIENT_CITY_CHILD_TABLES) {
      try {
        const where = await clientChildCityWhere(child, '$1');
        if (!where) continue;
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM ${child.table} WHERE ${where}`, [id]);
        const count = rows[0]?.total || 0;
        if (count > 0) {
          total += count;
          details.push({ table: child.table, label: TRANSFER_TABLE_LABELS[child.table] || child.table, count });
        }
      } catch (err) {
        console.warn(`[Transfer-Preview] Falha ao contar ${child.table}:`, err?.message || err);
      }
    }

    details.sort((a, b) => b.count - a.count);

    if (currentCity === targetCityFinal) {
      return res.status(409).json({
        code: CITY_ERROR_CODES.SAME_CITY,
        message: `${client.company_name} já pertence a ${cityLabel(currentCity)}.`,
        hint: 'Escolha uma cidade de destino diferente da cidade de origem.',
        from: currentCity,
        to: targetCityFinal,
      });
    }

    res.json({
      client: { id: client.id, name: client.company_name },
      from: currentCity,
      to: targetCityFinal,
      same_city: false,
      total_records: total,
      tables_affected: details.length,
      details,
      warnings: diagnosis.warning ? [diagnosis.warning] : [],
    });
  } catch (e) {
    console.error('GET /api/clients/:id/transfer-preview error:', e);
    const status = e?.statusCode === 400 ? 400 : 500;
    res.status(status).json({
      code: 'TRANSFER_PREVIEW_FAILED',
      message: e.message || 'Falha ao validar a transferência.',
      hint: 'Tente novamente em alguns segundos. Se o erro persistir, verifique os logs da API (City-Resolution).',
      error: e.message,
    });
  }
});

app.put('/api/clients/:id', async (req, res) => {

  try {
    const { user, activeCity, scopeCity } = await getScopedCityContext(req, 'clients');
    const { id } = req.params;
    const c = req.body;
    await ensureClientExperienceColumns().catch(() => {});
    await ensureGlobalClientSupport().catch(() => {});

    // First, get the current client data to check the existing city
    const { rows: currentRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    const oldCity = currentRows[0]?.city;
    const oldIsGlobal = currentRows[0]?.is_admin_client === true;

    // Cidade só muda com um valor reconhecido. Texto livre ("Porangatu - GO") é recusado em vez
    // de cair em Minaçu pelo fallback do assertValidCity (moveria o cliente e todos os registros).
    // Cidade vazia (cliente legado sem praça) não mexe na coluna.
    const rawCity = typeof c.city === 'string' ? c.city.trim() : c.city;
    let newCity;
    if (rawCity) {
      const normalizedRaw = normalizeCityValue(rawCity);
      if (!normalizedRaw || !ALLOWED_CITIES.has(normalizedRaw)) {
        return res.status(400).json({
          code: CITY_ERROR_CODES.INVALID,
          error: `Cidade inválida: "${rawCity}". Use Minaçu ou Uruaçu (para mudar de cidade, use Transferir Cidade).`,
          message: `Cidade inválida: "${rawCity}". Use Minaçu ou Uruaçu.`,
          supported: [...ALLOWED_CITIES],
        });
      }
      newCity = normalizedRaw;
    }

    // Log de auditoria: registra qual fonte definiu a cidade nesta transferência.
    if (newCity && normalizeCityValue(oldCity) !== newCity) {
      const bodyResolution = resolveTransferCityDetailed(
        { headers: req.headers, query: { city: c.city } },
      );
      console.log(formatCityResolutionLog(
        { ...bodyResolution, city: newCity, source: c.city ? 'body' : bodyResolution.source },
        { scope: 'transfer-execute', clientId: id },
      ), `from=${normalizeCityValue(oldCity) || '-'} to=${newCity}`);
    }


    const allowed = [
      'company_name','responsible_person','phone','color','logo_url','fixed_day','fixed_time',
      'videomaker_id','backup_time','backup_day','extra_day','extra_content_types','accepts_extra',
      'extra_client_appears','whatsapp','whatsapp_group','email','weekly_reels','weekly_creatives',
      'weekly_goal','has_endomarketing','has_vehicle_flyer','weekly_stories','presence_days',
      'monthly_recordings','niche','client_login','drive_link','drive_fotos','drive_identidade_visual',
      'editorial','plan_id','contract_start_date','contract_duration_months','auto_renewal',
      'selected_weeks','has_photo_shoot','accepts_photo_shoot_cost','briefing_data','show_metrics',
      'photo_preference','client_type','onboarding_completed',
      'company_birthday','client_owners','is_admin_client'
    ];
    const isGlobalRequested = c.is_admin_client === true || c.is_admin_client === 'true';
    // A marcação de cliente admin mudou de verdade nesta edição
    const globalChanged = c.is_admin_client !== undefined && isGlobalRequested !== oldIsGlobal;
    const sets = []; const vals = [];
    let idx = 1;
    for (const key of allowed) {
      if (c[key] !== undefined) {
        let value = c[key];
        if (key === 'is_admin_client') value = isGlobalRequested;
        if (key === 'briefing_data') value = JSON.stringify(c[key]);
        if (key === 'company_birthday') value = parseDateOrNull(c[key]);
        if (key === 'client_owners') value = JSON.stringify(normalizeClientOwners(c[key]));
        // Metas semanais aceitam fração (plano especial): 6 reels/mês => 1.5/semana
        if (['weekly_reels', 'weekly_creatives', 'weekly_stories', 'weekly_goal'].includes(key)) {
          value = parseWeeklyGoal(c[key], 0);
        }
        sets.push(`${key} = $${idx}`);
        vals.push(value);
        idx++;
      }

    }
    // Cliente admin global não pertence a nenhuma praça. Ao desmarcar sem cidade informada,
    // volta para a cidade ativa de forma explícita.
    let cityToSet;
    if (isGlobalRequested) cityToSet = null;
    else if (newCity) cityToSet = newCity;
    else if (globalChanged) cityToSet = activeCity || 'minacu';
    if (cityToSet !== undefined) {
      sets.push(`city = $${idx}`);
      vals.push(cityToSet);
      idx++;
    }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    let whereSql = `WHERE id = $${idx}`;

    // Detecta transferência de cidade ANTES de montar o escopo.
    const normalizedOldCity = normalizeCityValue(oldCity);
    const isCityTransfer = Boolean(cityToSet && normalizedOldCity && cityToSet !== normalizedOldCity);

    // Transferir de praça é ação de gestão: admin/social_media ou gestor_projetos que atende
    // a cidade de origem. Antes qualquer login movia cliente de outra cidade.
    if (isCityTransfer && !(await canTransferClientCity(user, normalizedOldCity))) {
      return res.status(403).json({
        code: 'TRANSFER_FORBIDDEN',
        error: 'Sem permissão para transferir este cliente de cidade.',
        message: 'Só admin, social media ou gestor de projetos da cidade de origem podem transferir o cliente.',
      });
    }

    // Em uma transferência, o frontend envia o header `x-pulse-city` já com a
    // cidade de DESTINO. Se aplicássemos esse escopo no WHERE, o cliente (ainda
    // na cidade de origem) não seria encontrado e o UPDATE afetaria 0 linhas —
    // exatamente o bug de "passou todas as etapas mas nada mudou". Por isso, em
    // transferências o escopo usa a cidade de ORIGEM (já conferida acima).
    if (scopeCity) {
      vals.push(isCityTransfer ? normalizedOldCity : activeCity);
      whereSql += ` AND ${cityVisibilityExpression('city', `$${idx + 1}`)}`;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`UPDATE clients SET ${sets.join(', ')} ${whereSql} RETURNING *`, vals);

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          code: 'CLIENT_NOT_UPDATED',
          error: 'Cliente não encontrado no escopo atual',
          message: 'Nenhum registro foi alterado. O cliente não está visível na cidade de origem informada.',
          hint: 'Recarregue a lista de clientes e tente novamente com a cidade de origem correta.',
        });
      }

      // If the city was changed, update all related scoped tables
      if (isCityTransfer) {
        console.log(`[Cascading-City-Update] Transferring client ${id} from ${normalizedOldCity} to ${cityToSet}`);

        for (const tableName of TABLES_WITH_CITY) {
          if (tableName === 'clients') continue;

          const hasCity = await tableHasCityColumn(tableName);
          if (!hasCity) continue;

          const existingColumns = await getExistingColumns(tableName);
          if (existingColumns.has('client_id')) {
            await client.query(
              `UPDATE ${tableName} SET city = $1 WHERE client_id = $2`,
              [cityToSet, id]
            );
          }
        }
      }

      await client.query('COMMIT');

      // Comentários e históricos das tarefas (sem client_id) acompanham a nova cidade.
      if (isCityTransfer) {
        await cascadeClientCityToChildren(id, cityToSet);
      }

      // Marcou/desmarcou como admin global: propaga a cidade das demandas (só reescreve as
      // linhas que estão em outra cidade, então um salvamento comum fica barato).
      if (c.is_admin_client !== undefined) {
        const syncCity = cityToSet || normalizedOldCity || activeCity || 'minacu';
        await syncGlobalClientCity(id, isGlobalRequested, syncCity).catch(() => {});
        // A marcação mudou de verdade: comentários e históricos (sem client_id) acompanham.
        if (globalChanged) {
          await cascadeClientCityToChildren(id, isGlobalRequested ? null : assertValidCity(syncCity));
        }
      }

      res.json(await sanitizeClientRowsForUser(rows[0], user));

    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('PUT /api/clients error:', e);
    const status = e?.statusCode === 400 ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Cascade delete related tables
      const { rows: contentTasks } = await client.query('SELECT id FROM content_tasks WHERE client_id = $1', [id]);
      if (contentTasks.length > 0) {
        const taskIds = contentTasks.map(t => t.id);
        await client.query('DELETE FROM task_comments WHERE task_id = ANY($1)', [taskIds]);
        await client.query('DELETE FROM task_history WHERE task_id = ANY($1)', [taskIds]);
      }
      await client.query('DELETE FROM content_tasks WHERE client_id = $1', [id]);
      await client.query('DELETE FROM social_media_deliveries WHERE client_id = $1', [id]);
      await client.query('DELETE FROM delivery_records WHERE client_id = $1', [id]);
      await client.query('DELETE FROM active_recordings WHERE client_id = $1', [id]);
      await client.query('DELETE FROM recordings WHERE client_id = $1', [id]);
      await client.query('DELETE FROM billing_messages WHERE client_id = $1', [id]);
      await client.query('DELETE FROM revenues WHERE client_id = $1', [id]);
      await client.query('DELETE FROM financial_contracts WHERE client_id = $1', [id]);
      await client.query('DELETE FROM endomarketing_partner_tasks WHERE client_id = $1', [id]);
      await client.query('DELETE FROM client_endomarketing_contracts WHERE client_id = $1', [id]);
      const { rows: endoClients } = await client.query("SELECT id FROM endomarketing_clientes WHERE client_id = $1", [id]);
      if (endoClients.length > 0) {
        const endoIds = endoClients.map(e => e.id);
        await client.query('DELETE FROM endomarketing_agendamentos WHERE cliente_id = ANY($1)', [endoIds]);
        await client.query('DELETE FROM endomarketing_logs WHERE cliente_id = ANY($1)', [endoIds]);
      }
      await client.query("DELETE FROM endomarketing_clientes WHERE client_id = $1", [id]);
      await client.query('DELETE FROM social_accounts WHERE client_id = $1', [id]);
      await client.query('DELETE FROM integration_logs WHERE client_id = $1', [id]);
      await client.query('DELETE FROM kanban_tasks WHERE client_id = $1', [id]);
      await client.query('DELETE FROM scripts WHERE client_id = $1', [id]);
      await client.query('DELETE FROM flyer_items WHERE client_id = $1', [id]);
      await client.query('DELETE FROM onboarding_tasks WHERE client_id = $1', [id]);
      await client.query('DELETE FROM client_portal_contents WHERE client_id = $1', [id]);
      await client.query('DELETE FROM client_portal_notifications WHERE client_id = $1', [id]);
      // Design tasks cascade
      const { rows: designTasks } = await client.query('SELECT id FROM design_tasks WHERE client_id = $1', [id]);
      if (designTasks.length > 0) {
        const dtIds = designTasks.map(t => t.id);
        await client.query('DELETE FROM design_task_history WHERE task_id = ANY($1)', [dtIds]);
      }
      await client.query('DELETE FROM design_tasks WHERE client_id = $1', [id]);
      // Traffic campaigns
      await client.query('DELETE FROM traffic_campaigns WHERE client_id = $1', [id]);
      // Finally delete client
      await client.query('DELETE FROM clients WHERE id = $1', [id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('DELETE /api/clients error:', e);
    // Sem papel de admin/social media: 403 com mensagem legível (antes saía 500 em inglês)
    if (e?.message === 'Admin access required') {
      return res.status(403).json({ error: 'Só admin ou social media podem excluir clientes.' });
    }
    res.status(e?.message === 'Unauthorized' ? 401 : 500).json({ error: e.message });
  }
});

// ─── Recordings ─────────────────────────────────────────────
// Índice da subconsulta do status efetivo (content_tasks por gravação). Idempotente, na subida.
pool.query('CREATE INDEX IF NOT EXISTS idx_content_tasks_recording ON content_tasks(recording_id)')
  .catch(e => console.warn('idx_content_tasks_recording:', e?.message || e));

app.get('/api/recordings', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    // Período opcional (?from=AAAA-MM-DD&to=AAAA-MM-DD) para telas que não precisam do histórico todo.
    // Sem os parâmetros, continua vindo tudo (relatórios dependem do histórico completo).
    const params = [];
    const where = [];
    if (scopeCity) { params.push(activeCity); where.push(cityVisibilityExpression('r.city', `$${params.length}`)); }
    const from = typeof req.query.from === 'string' && isValidAgendaDate(req.query.from) ? req.query.from : null;
    const to = typeof req.query.to === 'string' && isValidAgendaDate(req.query.to) ? req.query.to : null;
    if (from) { params.push(from); where.push(`r.date >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`r.date <= $${params.length}::date`); }
    const { rows } = await pool.query(`
      SELECT
        r.*,
        CASE
          WHEN r.status IN ('concluida', 'cancelada', 'organizando_material') THEN r.status
          WHEN EXISTS (
            SELECT 1
            FROM delivery_records dr
            WHERE dr.recording_id = r.id
          ) THEN 'concluida'
          WHEN EXISTS (
            SELECT 1
            FROM content_tasks ct
            WHERE ct.recording_id = r.id
              AND ct.kanban_column IN ('captacao_concluida', 'edicao', 'revisao', 'alteracao', 'aprovado', 'finalizado')
          ) THEN 'concluida'
          ELSE r.status
        END AS effective_status
      FROM recordings r
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY r.date DESC, r.start_time ASC
    `, params);

    res.json(rows.map(({ effective_status, ...recording }) => ({
      ...recording,
      status: effective_status || recording.status,
    })));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// Colunas opcionais de recordings (prospect_name, client_id anulável), em cache como o tableHasCityColumn
const _recordingsSchemaCache = new Map();
async function getRecordingsSchemaInfo() {
  const cached = getSchemaCacheValue(_recordingsSchemaCache, 'recordings');
  if (cached !== null) return cached;
  const schemaResult = await pool.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'recordings'
      AND column_name IN ('client_id', 'prospect_name')
  `);
  const info = {
    hasProspectName: schemaResult.rows.some((row) => row.column_name === 'prospect_name'),
    clientIdNullable: schemaResult.rows.some((row) => row.column_name === 'client_id' && row.is_nullable === 'YES'),
  };
  _recordingsSchemaCache.set('recordings', { value: info, cachedAt: Date.now() });
  return info;
}

app.post('/api/recordings', async (req, res) => {
  let txClient = null;
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const { hasProspectName, clientIdNullable } = await getRecordingsSchemaInfo();

    // Valida o lote inteiro antes de gravar qualquer linha
    for (const r of items) {
      const isAvulso = r.type === 'avulso' || Boolean(r.prospect_name);
      if (isAvulso && !clientIdNullable && !r.client_id) {
        return res.status(500).json({
          error: 'Schema da VPS desatualizado: client_id da tabela recordings ainda está NOT NULL e bloqueia vídeo avulso.'
        });
      }
      if (isAvulso && r.prospect_name && !hasProspectName) {
        return res.status(500).json({
          error: 'Schema da VPS desatualizado: coluna prospect_name não existe na tabela recordings.'
        });
      }
    }

    // Videomaker que atende as duas cidades: a tela só enxerga as gravações da cidade ativa,
    // então o mesmo horário na outra cidade é conferido aqui (gravação avulsa, uma por vez)
    if (scopeCity && items.length === 1 && items[0]?.videomaker_id && items[0]?.date && items[0]?.start_time
        && (items[0].status || 'agendada') !== 'cancelada') {
      const one = items[0];
      const { rows: otherCity } = await pool.query(
        `SELECT 1 FROM recordings
          WHERE videomaker_id::text = $1::text AND date = $2::date AND start_time::text = $3::text
            AND status::text <> 'cancelada' AND NOT ${cityVisibilityExpression('city', '$4')}
          LIMIT 1`,
        [one.videomaker_id, one.date, one.start_time, activeCity]
      );
      if (otherCity.length > 0) {
        return res.status(409).json({ error: 'O videomaker já tem gravação neste horário na outra cidade' });
      }
    }

    // Lote numa transação: ou entra tudo, ou nada (sem metade gravada para duplicar na nova tentativa).
    // ON CONFLICT (id) DO NOTHING deixa reenviar o mesmo lote (mesmos ids) sem erro nem duplicata.
    txClient = await pool.connect();
    await txClient.query('BEGIN');
    const results = [];
    for (const r of items) {
      const cols = ['id', 'client_id', 'videomaker_id', 'date', 'start_time', 'type', 'status', 'confirmation_status'];
      const vals = [r.id || crypto.randomUUID(), r.client_id || null, r.videomaker_id, r.date, r.start_time, r.type || 'fixa', r.status || 'agendada', r.confirmation_status || 'pendente'];
      if (scopeCity) {
        cols.push('city');
        vals.push(assertValidCity(activeCity));
      } else if (r.city !== undefined) {
        cols.push('city');
        vals.push(assertValidCity(r.city));
      }
      if (hasProspectName && r.prospect_name) {
        cols.push('prospect_name');
        vals.push(r.prospect_name);
      }
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await txClient.query(
        `INSERT INTO recordings (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING RETURNING *`,
        vals
      );
      if (rows[0]) {
        results.push(rows[0]);
      } else {
        // Já existia (reenvio do mesmo lote): devolve a linha atual
        const { rows: existingRows } = await txClient.query('SELECT * FROM recordings WHERE id = $1', [vals[0]]);
        if (existingRows[0]) results.push(existingRows[0]);
      }
    }
    await txClient.query('COMMIT');
    res.json(results.length === 1 ? results[0] : results);
  } catch (e) {
    if (txClient) await txClient.query('ROLLBACK').catch(() => {});
    console.error('POST /api/recordings error:', e);
    const status = e?.statusCode === 400 ? 400 : e?.message === 'Unauthorized' ? 401 : 500;
    res.status(status).json({ error: e.message });
  } finally {
    if (txClient) txClient.release();
  }
});

app.put('/api/recordings/:id', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    const { id } = req.params;
    const r = req.body;
    const { hasProspectName, clientIdNullable } = await getRecordingsSchemaInfo();
    if ((r.type === 'avulso' || r.prospect_name) && r.client_id == null && !clientIdNullable) {
      return res.status(500).json({ error: 'Schema da VPS desatualizado: client_id da tabela recordings ainda está NOT NULL e bloqueia vídeo avulso.' });
    }
    const allowed = ['client_id','videomaker_id','date','start_time','type','status','confirmation_status','city', ...(hasProspectName ? ['prospect_name'] : [])];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) {
      if (r[key] !== undefined) {
        let value = r[key];
        if (key === 'city') value = assertValidCity(scopeCity ? activeCity : value);
        sets.push(`${key} = $${idx}`);
        vals.push(value);
        idx++;
      }
    }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    vals.push(id);
    const cityClause = scopeCity ? ` AND ${cityVisibilityExpression('city', `$${idx + 1}`)}` : '';
    if (scopeCity) vals.push(activeCity);
    const { rows } = await pool.query(`UPDATE recordings SET ${sets.join(', ')} WHERE id = $${idx}${cityClause} RETURNING *`, vals);
    // Nada atualizado (apagada ou de outra cidade): erro, para a tela não mostrar sucesso
    if (!rows[0]) return res.status(404).json({ error: 'Gravação não encontrada' });
    res.json(rows[0]);
  } catch (e) {
    const status = e?.statusCode === 400 ? 400 : e?.message === 'Unauthorized' ? 401 : 500;
    res.status(status).json({ error: e.message });
  }
});

app.delete('/api/recordings/:id', async (req, res) => {
  let txClient = null;
  try {
    const { user, activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    const id = req.params.id;
    const force = req.query.force === '1' || req.query.force === 'true';
    txClient = await pool.connect();
    await txClient.query('BEGIN');
    // Confere antes (com o filtro de cidade) se a gravação existe; nada é apagado de outra cidade
    const { rows: [rec] } = await txClient.query(
      `SELECT id, status FROM recordings WHERE id = $1${scopeCity ? ` AND ${cityVisibilityExpression('city', '$2')}` : ''} FOR UPDATE`,
      scopeCity ? [id, activeCity] : [id]
    );
    if (!rec) {
      await txClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Gravação não encontrada' });
    }
    // Gravação já realizada (concluída, organizando material, com entrega ou vídeos em produção)
    // não é apagada no uso normal: o certo é cancelar. Só admin apaga, e de forma explícita (force).
    const { rows: [usage] } = await txClient.query(
      `SELECT EXISTS (SELECT 1 FROM delivery_records WHERE recording_id = $1) AS has_delivery,
              (SELECT COUNT(*)::int FROM content_tasks WHERE recording_id = $1
                 AND kanban_column IN ('captacao_concluida', 'edicao', 'revisao', 'alteracao', 'aprovado', 'finalizado')) AS videos_in_production`,
      [id]
    );
    const alreadyRecorded = ['concluida', 'organizando_material'].includes(rec.status) || usage?.has_delivery || Number(usage?.videos_in_production || 0) > 0;
    if (alreadyRecorded) {
      if (!force || !(await isAdminUser(user))) {
        await txClient.query('ROLLBACK');
        return res.status(409).json({
          error: 'Esta gravação já foi realizada e não pode ser apagada. Use Cancelar ou peça a um admin.',
          already_recorded: true,
          videos_in_production: Number(usage?.videos_in_production || 0),
        });
      }
    }
    // Cascade: remove dependent records first
    await txClient.query('DELETE FROM active_recordings WHERE recording_id = $1', [id]);
    await txClient.query('DELETE FROM recording_wait_logs WHERE recording_id = $1', [id]);
    if (alreadyRecorded) {
      await txClient.query('DELETE FROM delivery_records WHERE recording_id = $1', [id]);
    }
    // Vídeos vinculados NÃO são apagados: os que ainda estão na captação voltam para "ideias"
    // (igual a cancelar a gravação ativa) e os que já passaram dela só perdem o vínculo.
    const backToIdeasColumns = alreadyRecorded ? ['captacao'] : ['captacao', 'captacao_concluida', 'aguardando_link'];
    await txClient.query(
      `UPDATE content_tasks SET kanban_column = 'ideias', recording_id = NULL, updated_at = NOW()
        WHERE recording_id = $1 AND kanban_column = ANY($2::text[])`,
      [id, backToIdeasColumns]
    );
    await txClient.query('UPDATE content_tasks SET recording_id = NULL, updated_at = NOW() WHERE recording_id = $1', [id]);
    // Mark linked scripts as not recorded (só quando a gravação não chegou a acontecer)
    if (!alreadyRecorded) {
      await txClient.query("UPDATE scripts SET recorded = false, updated_at = NOW() WHERE recording_id = $1", [id]);
    }
    await txClient.query('DELETE FROM recordings WHERE id = $1', [id]);
    await txClient.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    if (txClient) await txClient.query('ROLLBACK').catch(() => {});
    const status = e?.message === 'Unauthorized' ? 401 : 500;
    res.status(status).json({ error: e.message });
  } finally {
    if (txClient) txClient.release();
  }
});

// Bulk delete future recordings for a client
// Regenerar agenda do cliente: apaga as gravações futuras geradas pela agenda (fixa, backup, extra)
// para recriar as fixas com a configuração nova. Ficam: as que o cliente criou ou confirmou pelo
// portal/link, as que já começaram (hoje, no fuso de Brasília) e as que têm algo vinculado
// (em andamento, entrega, vídeos). Tudo numa transação, limpando o vínculo dos roteiros.
app.delete('/api/recordings/future/:clientId', async (req, res) => {
  let txClient = null;
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    await ensurePublicReschedTable();
    const today = brtDateString();
    const nowMinutes = brtMinutesNow();
    const params = [req.params.clientId, today, nowMinutes];
    let cityClause = '';
    if (scopeCity) { params.push(activeCity); cityClause = ` AND ${cityVisibilityExpression('r.city', `$${params.length}`)}`; }
    txClient = await pool.connect();
    await txClient.query('BEGIN');
    const { rows: deletedRows } = await txClient.query(
      `DELETE FROM recordings r
        WHERE r.client_id = $1 AND r.status::text = 'agendada'
          AND r.type::text IN ('fixa', 'backup', 'extra')
          AND (r.date > $2::date OR (r.date = $2::date
               AND (CASE WHEN r.start_time::text ~ '^[0-9]{1,2}:[0-9]{2}'
                         THEN split_part(r.start_time::text, ':', 1)::int * 60 + split_part(r.start_time::text, ':', 2)::int
                         ELSE 0 END) > $3))
          AND NOT (r.type::text <> 'fixa' AND COALESCE(r.confirmation_status::text, '') = 'confirmada')
          ${recordingsSourceColumnReady ? "AND COALESCE(r.source, '') NOT IN ('portal', 'link')" : ''}
          AND NOT EXISTS (SELECT 1 FROM recordings o WHERE o.rescheduled_to_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM active_recordings a WHERE a.recording_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM delivery_records d WHERE d.recording_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM content_tasks ct WHERE ct.recording_id = r.id)${cityClause}
        RETURNING r.id::text AS id`,
      params
    );
    const deletedIds = deletedRows.map(row => row.id);
    if (deletedIds.length > 0) {
      await txClient.query('UPDATE scripts SET recording_id = NULL, updated_at = NOW() WHERE recording_id::text = ANY($1::text[])', [deletedIds]);
    }
    await txClient.query('COMMIT');
    res.json({ deleted: deletedIds.length, deleted_ids: deletedIds });
  } catch (e) {
    if (txClient) await txClient.query('ROLLBACK').catch(() => {});
    res.status(e?.message === 'Unauthorized' ? 401 : 500).json({ error: e.message });
  } finally {
    if (txClient) txClient.release();
  }
});

// ─── Kanban Tasks ───────────────────────────────────────────
app.get('/api/kanban-tasks', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'kanban_tasks');
    const { rows } = await pool.query(
      `SELECT * FROM kanban_tasks${scopeCity ? ` WHERE ${cityVisibilityExpression('city', '$1')}` : ''} ORDER BY created_at DESC`,
      scopeCity ? [activeCity] : []
    );
    res.json(rows);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post('/api/kanban-tasks', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'kanban_tasks');
    const t = req.body;
    const cityCols = scopeCity ? ', city' : '';
    const cityVals = scopeCity ? ', $8' : '';
    const { rows } = await pool.query(
      `INSERT INTO kanban_tasks (id, client_id, title, "column", checklist, week_start, recording_date${cityCols})
       VALUES ($1,$2,$3,$4,$5,$6,$7${cityVals}) RETURNING *`,
      scopeCity
        ? [t.id || crypto.randomUUID(), t.client_id, t.title, t.column || 'todo', JSON.stringify(t.checklist || []), t.week_start, t.recording_date || null, activeCity]
        : [t.id || crypto.randomUUID(), t.client_id, t.title, t.column || 'todo', JSON.stringify(t.checklist || []), t.week_start, t.recording_date || null]
    );
    res.json(rows[0]);
  } catch (e) { console.error('POST /api/kanban-tasks error:', e); res.status(500).json({ error: e.message }); }
});

app.put('/api/kanban-tasks/:id', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'kanban_tasks');
    const { id } = req.params;
    const t = req.body;
    const allowed = ['client_id','title','column','checklist','week_start','recording_date'];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) {
      if (t[key] !== undefined) {
        sets.push(`"${key === 'column' ? 'column' : key}" = $${idx}`);
        vals.push(key === 'checklist' ? JSON.stringify(t[key]) : t[key]);
        idx++;
      }
    }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    sets.push('updated_at = NOW()');
    vals.push(id);
    const cityClause = scopeCity ? ` AND ${cityVisibilityExpression('city', `$${idx + 1}`)}` : '';
    if (scopeCity) vals.push(activeCity);
    const { rows } = await pool.query(`UPDATE kanban_tasks SET ${sets.join(', ')} WHERE id = $${idx}${cityClause} RETURNING *`, vals);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/kanban-tasks/:id', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'kanban_tasks');
    await pool.query(
      `DELETE FROM kanban_tasks WHERE id = $1${scopeCity ? ` AND ${cityVisibilityExpression('city', '$2')}` : ''}`,
      scopeCity ? [req.params.id, activeCity] : [req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Scripts ────────────────────────────────────────────────
app.get('/api/scripts', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'scripts');
    const { rows } = await pool.query(
      `SELECT * FROM scripts${scopeCity ? ` WHERE ${cityVisibilityExpression('city', '$1')}` : ''} ORDER BY created_at DESC`,
      scopeCity ? [activeCity] : []
    );
    res.json(rows);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post('/api/scripts', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'scripts');
    const s = req.body;
    const cityCols = scopeCity ? ', city' : '';
    const cityVals = scopeCity ? ', $17' : '';
    const { rows } = await pool.query(
      `INSERT INTO scripts (id, client_id, title, video_type, content_format, content, recorded, priority, is_endomarketing, endo_client_id, scheduled_date, created_by, caption, client_priority, direct_to_editing, recording_id${cityCols})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16${cityVals}) RETURNING *`,
      scopeCity
        ? [s.id || crypto.randomUUID(), s.client_id, s.title, s.video_type || 'reels', s.content_format || 'reels',
           s.content || '', s.recorded ?? false, s.priority || 'normal', s.is_endomarketing ?? false,
           s.endo_client_id || null, s.scheduled_date || null, s.created_by || null, s.caption || null, s.client_priority || 'normal', s.direct_to_editing ?? false, s.recording_id || null, activeCity]
        : [s.id || crypto.randomUUID(), s.client_id, s.title, s.video_type || 'reels', s.content_format || 'reels',
           s.content || '', s.recorded ?? false, s.priority || 'normal', s.is_endomarketing ?? false,
           s.endo_client_id || null, s.scheduled_date || null, s.created_by || null, s.caption || null, s.client_priority || 'normal', s.direct_to_editing ?? false, s.recording_id || null]
    );
    // Create portal notification
    try {
      await pool.query(
        `INSERT INTO client_portal_notifications (client_id, title, message, type, link_script_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [s.client_id, '📝 Novo roteiro criado', `O roteiro "${s.title}" foi criado. Confira na Zona Criativa!`, 'new_script', rows[0].id]
      );
    } catch (err) { console.error('Portal script notification error:', err); }
    res.json(rows[0]);
  } catch (e) { console.error('POST /api/scripts error:', e); res.status(500).json({ error: e.message }); }
});

app.put('/api/scripts/:id', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'scripts');
    const { id } = req.params;
    const s = req.body;
    const allowed = ['client_id','title','video_type','content_format','content','recorded','priority','is_endomarketing','endo_client_id','scheduled_date','created_by','caption','client_priority','direct_to_editing','recording_id'];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) { if (s[key] !== undefined) { sets.push(`${key} = $${idx}`); vals.push(s[key]); idx++; } }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    sets.push('updated_at = NOW()');
    vals.push(id);
    const cityClause = scopeCity ? ` AND ${cityVisibilityExpression('city', `$${idx + 1}`)}` : '';
    if (scopeCity) vals.push(activeCity);
    const { rows } = await pool.query(`UPDATE scripts SET ${sets.join(', ')} WHERE id = $${idx}${cityClause} RETURNING *`, vals);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/scripts/:id', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'scripts');
    await pool.query(
      `DELETE FROM scripts WHERE id = $1${scopeCity ? ` AND ${cityVisibilityExpression('city', '$2')}` : ''}`,
      scopeCity ? [req.params.id, activeCity] : [req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Configurações da landing page (Pixel da Meta) ──────────
// A tabela só existia no Supabase antigo e não está liberada no /api/db/query, então o Pixel nunca era salvo.
// Leitura pública só das seções da própria landing (a página é anônima); gravação só do admin. O Pixel vai
// dentro de um <script> da landing, por isso só aceita números.
const LANDING_PUBLIC_SECTIONS = ['facebook_pixel', 'quem_somos'];
let landingSettingsReady = null;
function ensureLandingSettingsTable() {
  if (!landingSettingsReady) {
    landingSettingsReady = pool.query(`
      CREATE TABLE IF NOT EXISTS landing_page_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        section TEXT NOT NULL UNIQUE,
        video_url TEXT,
        title TEXT,
        description TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `).catch((error) => {
      landingSettingsReady = null;
      throw error;
    });
  }
  return landingSettingsReady;
}

app.get('/api/public/landing-settings', async (req, res) => {
  try {
    const section = String(req.query.section || '');
    if (!LANDING_PUBLIC_SECTIONS.includes(section)) return res.status(400).json({ error: 'Seção inválida' });
    await ensureLandingSettingsTable();
    const { rows } = await pool.query(
      'SELECT section, video_url, title, description, updated_at FROM landing_page_settings WHERE section = $1 LIMIT 1', [section]
    );
    res.json(rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/landing-settings/facebook-pixel', async (req, res) => {
  try {
    await verifyAdmin(req);
  } catch (e) {
    return res.status(e.message === 'Admin access required' ? 403 : 401).json({ error: e.message });
  }
  try {
    const pixelId = String(req.body?.pixelId ?? '').trim();
    if (pixelId && !/^\d{5,20}$/.test(pixelId)) {
      return res.status(400).json({ error: 'O Pixel ID tem só números (ex.: 123456789012345)' });
    }
    await ensureLandingSettingsTable();
    const { rows: updated } = await pool.query(
      `UPDATE landing_page_settings SET title = $1, updated_at = now() WHERE section = 'facebook_pixel' RETURNING section, title`,
      [pixelId || null]
    );
    if (updated.length) return res.json(updated[0]);
    const { rows } = await pool.query(
      `INSERT INTO landing_page_settings (section, title) VALUES ('facebook_pixel', $1) RETURNING section, title`, [pixelId || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Landing pública: depoimentos aprovados, vídeos dos planos e logos de clientes ───
// A landing é anônima e lia essas tabelas pelo /api/db/query (exige login): os depoimentos
// aprovados nunca apareciam (no lugar entravam 3 depoimentos inventados) e os vídeos e logos
// não carregavam. O link de depoimento (/feedback) também gravava pelo /api/db/query.
let testimonialsTableReady = null;
function ensureTestimonialsTable() {
  if (!testimonialsTableReady) {
    testimonialsTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS client_testimonials (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_name TEXT NOT NULL DEFAULT '',
          client_role TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL DEFAULT '',
          rating INTEGER NOT NULL DEFAULT 5,
          token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
          status TEXT NOT NULL DEFAULT 'pending',
          approved_at TIMESTAMPTZ,
          city TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      // Ajustes opcionais (tabela antiga vinda do Supabase): sem permissão, seguem como estão.
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='client_testimonials' AND column_name='updated_at') THEN
            ALTER TABLE client_testimonials ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
          END IF;
        END $$;
      `).catch((e) => console.warn('client_testimonials.updated_at:', e?.message || e));
      await pool.query('CREATE INDEX IF NOT EXISTS idx_client_testimonials_token ON client_testimonials (token)')
        .catch((e) => console.warn('idx_client_testimonials_token:', e?.message || e));
    })().catch((error) => {
      testimonialsTableReady = null;
      throw error;
    });
  }
  return testimonialsTableReady;
}

// Planos que têm vídeo na landing (mesmos nomes da seção de planos).
const LANDING_PLAN_VIDEO_NAMES = ['Starter', 'Boost', 'Premium', 'Elite', 'Endomarketing'];
let planVideosTableReady = null;
function ensurePlanVideosTable() {
  if (!planVideosTableReady) {
    planVideosTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS plan_videos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_name TEXT NOT NULL UNIQUE,
        video_url TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `).catch((error) => {
      planVideosTableReady = null;
      throw error;
    });
  }
  return planVideosTableReady;
}

let publicLandingCache = null; // { at, data } — cache curto, a landing é aberta por qualquer visitante
const PUBLIC_LANDING_CACHE_MS = 60_000;

app.get('/api/public/landing', async (_req, res) => {
  try {
    if (publicLandingCache && Date.now() - publicLandingCache.at < PUBLIC_LANDING_CACHE_MS) {
      return res.json(publicLandingCache.data);
    }
    await Promise.all([
      ensureTestimonialsTable().catch((e) => console.warn('ensureTestimonialsTable:', e?.message || e)),
      ensurePlanVideosTable().catch((e) => console.warn('ensurePlanVideosTable:', e?.message || e)),
    ]);
    // Depoimentos das duas cidades: a landing é da agência inteira.
    const [testimonials, planVideos, clientLogos] = await Promise.all([
      pool.query(
        `SELECT client_name, client_role, message, rating FROM client_testimonials
          WHERE status = 'approved' AND btrim(message) <> '' AND btrim(client_name) <> ''
          ORDER BY approved_at DESC NULLS LAST LIMIT 6`
      ).then((r) => r.rows).catch(() => []),
      pool.query(
        `SELECT plan_name, video_url FROM plan_videos WHERE video_url IS NOT NULL AND btrim(video_url) <> ''`
      ).then((r) => r.rows).catch(() => []),
      // Mesma vitrine da proposta pública: clientes ativos com logo.
      pool.query(
        `SELECT company_name, logo_url, color FROM clients
          WHERE status = 'ativo' AND logo_url IS NOT NULL AND btrim(logo_url) <> ''
          ORDER BY company_name`
      ).then((r) => r.rows).catch(() => []),
    ]);
    const data = { testimonials, plan_videos: planVideos, client_logos: clientLogos };
    publicLandingCache = { at: Date.now(), data };
    res.json(data);
  } catch (e) {
    console.error('[public landing] error:', e?.message || e);
    res.status(500).json({ error: 'Erro ao carregar a landing' });
  }
});

function cleanFeedbackToken(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 128);
}

// Link de depoimento (/feedback?token=): confere se ainda está pendente.
app.get('/api/public/testimonials/:token', async (req, res) => {
  try {
    const token = cleanFeedbackToken(req.params.token);
    if (!token) return res.json({ valid: false });
    await ensureTestimonialsTable().catch((e) => console.warn('ensureTestimonialsTable:', e?.message || e));
    const { rows } = await pool.query('SELECT status FROM client_testimonials WHERE token = $1 LIMIT 1', [token]);
    res.json({ valid: rows[0]?.status === 'pending' });
  } catch (e) {
    console.error('[public testimonials] check error:', e?.message || e);
    res.status(500).json({ error: 'Erro ao conferir o link' });
  }
});

// Envio do depoimento: só pending -> submitted, uma vez; o admin aprova em /depoimentos.
app.post('/api/public/testimonials/:token', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown';
    if (promoRateLimited(`testimonial:${ip}`, 10)) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante.' });
    }
    const token = cleanFeedbackToken(req.params.token);
    const name = String(req.body?.client_name ?? '').trim();
    const role = String(req.body?.client_role ?? '').trim();
    const message = String(req.body?.message ?? '').trim();
    const rating = Number(req.body?.rating);
    if (!token) return res.status(400).json({ error: 'Link inválido' });
    if (!name || !message) return res.status(400).json({ error: 'Preencha seu nome e depoimento' });
    if (name.length > 120 || role.length > 120) return res.status(400).json({ error: 'Nome ou cargo muito longo' });
    if (message.length > 2000) return res.status(400).json({ error: 'Depoimento muito longo (máx. 2000 caracteres)' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Nota inválida' });
    await ensureTestimonialsTable().catch((e) => console.warn('ensureTestimonialsTable:', e?.message || e));
    const { rows } = await pool.query(
      `UPDATE client_testimonials
          SET client_name = $2, client_role = $3, message = $4, rating = $5, status = 'submitted', updated_at = now()
        WHERE token = $1 AND status = 'pending'
        RETURNING id`,
      [token, name, role, message, rating]
    );
    if (!rows.length) return res.status(409).json({ error: 'Link inválido ou já utilizado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[public testimonials] submit error:', e?.message || e);
    res.status(500).json({ error: 'Erro ao enviar o depoimento' });
  }
});

function cleanLandingVideoUrl(value) {
  const url = String(value ?? '').trim();
  if (!url) return null;
  if (url.length > 2000 || !/^https?:\/\//i.test(url)) {
    throw Object.assign(new Error('Endereço do vídeo inválido'), { statusCode: 400 });
  }
  return url;
}

// Admin da landing: vídeo/título/descrição do "Quem somos".
app.put('/api/landing-settings/quem-somos', async (req, res) => {
  if (!(await requireAdminRoute(req, res))) return;
  try {
    const videoUrl = cleanLandingVideoUrl(req.body?.video_url);
    const title = String(req.body?.title ?? '').slice(0, 300);
    const description = String(req.body?.description ?? '').slice(0, 3000);
    await ensureLandingSettingsTable();
    const { rows } = await pool.query(
      `INSERT INTO landing_page_settings (section, video_url, title, description, updated_at)
       VALUES ('quem_somos', $1, $2, $3, now())
       ON CONFLICT (section) DO UPDATE SET video_url = EXCLUDED.video_url, title = EXCLUDED.title,
         description = EXCLUDED.description, updated_at = now()
       RETURNING section, video_url, title, description, updated_at`,
      [videoUrl, title, description]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(e?.statusCode || 500).json({ error: e.message });
  }
});

// Admin da landing: vídeo de explicação de cada plano.
app.put('/api/landing-settings/plan-video', async (req, res) => {
  if (!(await requireAdminRoute(req, res))) return;
  try {
    const planName = String(req.body?.plan_name ?? '');
    if (!LANDING_PLAN_VIDEO_NAMES.includes(planName)) return res.status(400).json({ error: 'Plano inválido' });
    const videoUrl = cleanLandingVideoUrl(req.body?.video_url);
    await ensurePlanVideosTable();
    const { rows } = await pool.query(
      `INSERT INTO plan_videos (plan_name, video_url, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (plan_name) DO UPDATE SET video_url = EXCLUDED.video_url, updated_at = now()
       RETURNING plan_name, video_url`,
      [planName, videoUrl]
    );
    publicLandingCache = null;
    res.json(rows[0]);
  } catch (e) {
    res.status(e?.statusCode || 500).json({ error: e.message });
  }
});

// ─── Company Settings ───────────────────────────────────────
app.get('/api/company-settings', async (req, res) => {
  try {
    await verifyUser(req);
    const { rows } = await pool.query('SELECT * FROM company_settings LIMIT 1');
    res.json(rows[0] || null);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

// Chaves de liga/desliga dos prazos e o auto-preencher vagas: garante as colunas (aditivo) e lê quais existem,
// para uma coluna ausente no banco não derrubar o salvamento inteiro.
let companySettingsColumnsPromise = null;
function companySettingsColumns() {
  if (!companySettingsColumnsPromise) {
    companySettingsColumnsPromise = (async () => {
      for (const column of ['editing_deadline_enabled', 'review_deadline_enabled', 'alteration_deadline_enabled', 'approval_deadline_enabled']) {
        await pool.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS ${column} BOOLEAN NOT NULL DEFAULT true`).catch(() => {});
      }
      await pool.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_fill_vacancies BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_settings'`
      );
      return new Set(rows.map((r) => r.column_name));
    })().catch((error) => {
      companySettingsColumnsPromise = null;
      throw error;
    });
  }
  return companySettingsColumnsPromise;
}

const COMPANY_SETTINGS_BOOLEANS = new Set(['editing_deadline_enabled', 'review_deadline_enabled', 'alteration_deadline_enabled', 'approval_deadline_enabled', 'auto_fill_vacancies']);
const COST_ALLOCATION_RULES = ['approved', 'recorded', 'posted'];

app.put('/api/company-settings/:id', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { id } = req.params;
    const s = req.body || {};
    if (s.cost_allocation_rule !== undefined && !COST_ALLOCATION_RULES.includes(s.cost_allocation_rule)) {
      return res.status(400).json({ error: 'Regra de rateio inválida' });
    }
    const existing = await companySettingsColumns();
    const allowed = ['shift_a_start','shift_a_end','shift_b_start','shift_b_end','work_days','recording_duration','editing_deadline_hours','review_deadline_hours','alteration_deadline_hours','approval_deadline_hours',
      'editing_deadline_enabled','review_deadline_enabled','alteration_deadline_enabled','approval_deadline_enabled','auto_fill_vacancies','cost_allocation_rule']
      .filter((key) => existing.has(key));
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) {
      if (s[key] === undefined) continue;
      sets.push(`${key} = $${idx}`);
      vals.push(COMPANY_SETTINGS_BOOLEANS.has(key) ? s[key] === true || s[key] === 'true' : s[key]);
      idx++;
    }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    sets.push('updated_at = NOW()');
    vals.push(id);
    const { rows } = await pool.query(`UPDATE company_settings SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Active Recordings ──────────────────────────────────────
app.get('/api/active-recordings', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'active_recordings');
    const { rows } = await pool.query(
      `SELECT * FROM active_recordings${scopeCity ? ` WHERE ${cityVisibilityExpression('city', '$1')}` : ''}`,
      scopeCity ? [activeCity] : []
    );
    res.json(rows);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post('/api/active-recordings', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'active_recordings');
    const r = req.body;
    // Remove existing for this recording
    await pool.query(
      `DELETE FROM active_recordings WHERE recording_id = $1${scopeCity ? ` AND ${cityVisibilityExpression('city', '$2')}` : ''}`,
      scopeCity ? [r.recording_id, activeCity] : [r.recording_id]
    );
    const { rows } = await pool.query(
      `INSERT INTO active_recordings (recording_id, videomaker_id, client_id, started_at, planned_script_ids${scopeCity ? ', city' : ''})
       VALUES ($1,$2,$3,$4,$5${scopeCity ? ', $6' : ''}) RETURNING *`,
      scopeCity
        ? [r.recording_id, r.videomaker_id, r.client_id, r.started_at || new Date().toISOString(), r.planned_script_ids || '{}', activeCity]
        : [r.recording_id, r.videomaker_id, r.client_id, r.started_at || new Date().toISOString(), r.planned_script_ids || '{}']
    );
    res.json(rows[0]);
  } catch (e) { console.error('POST /api/active-recordings error:', e); res.status(500).json({ error: e.message }); }
});

app.delete('/api/active-recordings/:recordingId', async (req, res) => {
  try {
    await verifyUser(req);
    const { rows } = await pool.query('SELECT * FROM active_recordings WHERE recording_id = $1', [req.params.recordingId]);
    await pool.query('DELETE FROM active_recordings WHERE recording_id = $1', [req.params.recordingId]);
    res.json({ success: true, deleted: rows[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Métricas de gravação (tempo real de gravação, espera, vídeos por gravação)
// Schema idempotente: garante recording_wait_logs e colunas de duração em
// delivery_records mesmo em instâncias que não rodaram o schema SQL completo.
// ---------------------------------------------------------------------------
let recordingMetricsSchemaReady = false;
async function ensureRecordingMetricsSchema() {
  if (recordingMetricsSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recording_wait_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recording_id UUID,
      videomaker_id UUID,
      client_id UUID,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      wait_duration_seconds INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_recording_wait_logs_client ON recording_wait_logs(client_id);
    CREATE INDEX IF NOT EXISTS idx_recording_wait_logs_recording ON recording_wait_logs(recording_id);
    ALTER TABLE delivery_records ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
    ALTER TABLE delivery_records ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;
    ALTER TABLE delivery_records ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER;
    ALTER TABLE delivery_records ADD COLUMN IF NOT EXISTS wait_duration_seconds INTEGER;
  `);
  recordingMetricsSchemaReady = true;
}
ensureRecordingMetricsSchema().catch(err => console.error('[recording-metrics] schema init failed:', err.message));

// Contagens do registro de entrega (o que não vier fica 0, e pelo menos 1 vídeo gravado)
function deliveryCountsFrom(overrides) {
  return {
    reels_produced: overrides?.reels_produced ?? 0,
    creatives_produced: overrides?.creatives_produced ?? 0,
    stories_produced: overrides?.stories_produced ?? 0,
    arts_produced: overrides?.arts_produced ?? 0,
    extras_produced: overrides?.extras_produced ?? 0,
    videos_recorded: overrides?.videos_recorded ?? 1,
  };
}

// Cidade de uma gravação: a da gravação ativa (se informada), senão a da gravação, senão a do cliente.
async function getRecordingCity(recordingId, activeCity = null) {
  const fromActive = normalizeCityValue(activeCity);
  if (fromActive) return fromActive;
  try {
    const hasRecCity = await tableHasCityColumn('recordings');
    const { rows: [row] } = await pool.query(
      `SELECT ${hasRecCity ? 'r.city::text' : 'NULL'} AS rec_city, c.city::text AS client_city
         FROM recordings r LEFT JOIN clients c ON c.id = r.client_id
        WHERE r.id = $1`,
      [recordingId]
    );
    return normalizeCityValue(row?.rec_city) || normalizeCityValue(row?.client_city) || null;
  } catch {
    return null;
  }
}

// Um registro de entrega por gravação: atualiza o que existe e só insere quando não há nenhum.
// Funciona com ou sem o índice único delivery_records_recording_id_unique.
async function upsertDeliveryRecord({ recordingId, clientId, videomakerId, date, city, counts = null, timing = null }) {
  const updates = { ...(counts || {}), ...(timing || {}) };
  const keys = Object.keys(updates);
  if (keys.length > 0) {
    const { rowCount } = await pool.query(
      `UPDATE delivery_records SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE recording_id = $1`,
      [recordingId, ...keys.map(k => updates[k])]
    );
    if (rowCount > 0) return 'updated';
  } else {
    const { rows } = await pool.query('SELECT 1 FROM delivery_records WHERE recording_id = $1 LIMIT 1', [recordingId]);
    if (rows.length > 0) return 'exists';
  }
  // client_id e videomaker_id são obrigatórios: gravação avulsa (sem cliente) não gera entrega
  if (!clientId || !videomakerId) return 'skipped';
  const row = {
    recording_id: recordingId,
    client_id: clientId,
    videomaker_id: videomakerId,
    date,
    ...deliveryCountsFrom(null),
    ...(counts || {}),
    delivery_status: 'realizada',
    observations: 'Registro automático ao finalizar gravação',
    ...(timing || {}),
  };
  if (city && await tableHasCityColumn('delivery_records')) row.city = city;
  const cols = Object.keys(row);
  await pool.query(
    `INSERT INTO delivery_records (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map(c => row[c])
  );
  return 'inserted';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Roteiros planejados que NÃO foram gravados voltam para "ideias"
// (e desvinculam do recording para sumir da captação dessa gravação)
async function returnUnrecordedScriptsToIdeas(notRecorded) {
  const ids = [...new Set((notRecorded || []).map(String))].filter(id => UUID_PATTERN.test(id));
  if (ids.length === 0) return;
  await pool.query(
    `UPDATE content_tasks
       SET kanban_column = 'ideias',
           recording_id = NULL,
           drive_link = NULL,
           updated_at = NOW()
     WHERE script_id = ANY($1::uuid[])
       AND kanban_column IN ('captacao', 'captacao_concluida', 'aguardando_link')`,
    [ids]
  );
  // Garante que os scripts não fiquem marcados como gravados
  await pool.query(
    `UPDATE scripts SET recorded = false, recording_id = NULL, updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );
}

// Stop active recording with delivery record creation
// deferDelivery: o painel do videomaker fecha o cronômetro ao tocar em Finalizar, mas só informa
// roteiros e contagens depois, no diálogo de finalização (rota /finalize). Nesse modo o stop grava
// só o tempo (início, fim, duração e espera) e não mexe em roteiros nem em contagens.
app.post('/api/active-recordings/:recordingId/stop', async (req, res) => {
  try {
    await verifyUser(req);
    await ensureRecordingMetricsSchema().catch(() => {});
    const { recordingId } = req.params;
    const { deliveryOverrides, completedScriptIds, deferDelivery } = req.body || {};

    const { rows: activeRows } = await pool.query('SELECT * FROM active_recordings WHERE recording_id = $1', [recordingId]);
    await pool.query('DELETE FROM active_recordings WHERE recording_id = $1', [recordingId]);

    const active = activeRows[0];
    if (active) {
      const finishedAt = new Date();
      const startedAt = active.started_at ? new Date(active.started_at) : null;

      // Fecha esperas ainda abertas dessa gravação e soma o total de espera.
      // Há dois tipos: a espera antes do início ("Aguardar cliente", que o Iniciar encerra) e a pausa
      // durante a gravação ("Em Espera" no card ao vivo). Uma espera aberta que começou antes do início
      // termina no início (senão o tempo gravado entraria como espera); a pausa termina agora.
      let waitSeconds = 0;
      let pausedSeconds = 0;
      try {
        await pool.query(
          `UPDATE recording_wait_logs
              SET ended_at = CASE WHEN $2::timestamptz IS NOT NULL AND started_at < $2::timestamptz THEN $2::timestamptz ELSE NOW() END,
                  wait_duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (
                    (CASE WHEN $2::timestamptz IS NOT NULL AND started_at < $2::timestamptz THEN $2::timestamptz ELSE NOW() END) - started_at
                  ))::int)
            WHERE recording_id = $1 AND ended_at IS NULL`,
          [recordingId, startedAt ? startedAt.toISOString() : null]
        );
        // total = toda a espera (informativo); during = só o trecho de espera dentro da gravação
        const { rows: waitRows } = await pool.query(
          `SELECT COALESCE(SUM(wait_duration_seconds), 0)::int AS total,
                  COALESCE(SUM(CASE WHEN $2::timestamptz IS NULL THEN 0 ELSE GREATEST(0, EXTRACT(EPOCH FROM (
                    LEAST(COALESCE(ended_at, $3::timestamptz), $3::timestamptz) - GREATEST(started_at, $2::timestamptz)
                  ))) END), 0)::int AS during
             FROM recording_wait_logs WHERE recording_id = $1`,
          [recordingId, startedAt ? startedAt.toISOString() : null, finishedAt.toISOString()]
        );
        waitSeconds = Number(waitRows[0]?.total || 0);
        pausedSeconds = Number(waitRows[0]?.during || 0);
      } catch (waitErr) {
        console.warn('[recording-metrics] wait aggregation failed:', waitErr.message);
      }

      // Duração efetiva = total decorrido - pausas durante a gravação (nunca negativa).
      // A espera antes do início não é descontada: fica só em wait_duration_seconds.
      const grossSeconds = startedAt ? Math.max(0, Math.floor((finishedAt - startedAt) / 1000)) : null;
      const recordingSeconds = grossSeconds === null ? null : Math.max(0, grossSeconds - pausedSeconds);
      const deliveryCity = await getRecordingCity(recordingId, active.city);

      await upsertDeliveryRecord({
        recordingId,
        clientId: active.client_id,
        videomakerId: active.videomaker_id,
        date: finishedAt.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
        city: deliveryCity,
        counts: deferDelivery ? null : deliveryCountsFrom(deliveryOverrides),
        timing: {
          started_at: startedAt ? startedAt.toISOString() : null,
          finished_at: finishedAt.toISOString(),
          recording_duration_seconds: recordingSeconds,
          wait_duration_seconds: waitSeconds,
        },
      });

      if (!deferDelivery) {
        // social_media_deliveries.client_id é NOT NULL: gravação avulsa/sem cliente não gera entrega
        // (igual ao 'skipped' do upsertDeliveryRecord). A falha de um roteiro não derruba a finalização.
        if (completedScriptIds?.length > 0 && active.client_id) {
          const smdHasCity = Boolean(deliveryCity) && await tableHasCityColumn('social_media_deliveries');
          for (const scriptId of completedScriptIds) {
            try {
              const { rows: scriptRows } = await pool.query('SELECT title, content_format FROM scripts WHERE id = $1', [scriptId]);
              const script = scriptRows[0];
              await pool.query(
                `INSERT INTO social_media_deliveries (client_id, content_type, title, status, delivered_at, script_id, recording_id, created_by${smdHasCity ? ', city' : ''})
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8${smdHasCity ? ',$9' : ''})`,
                [active.client_id, script?.content_format || 'reels', script?.title || 'Vídeo gravado',
                 'entregue', new Date().toISOString().split('T')[0], scriptId, recordingId, active.videomaker_id,
                 ...(smdHasCity ? [deliveryCity] : [])]
              );
            } catch (smdErr) {
              console.warn('[active-recordings/stop] social_media_deliveries insert failed:', scriptId, smdErr.message);
            }
          }
        }

        const planned = Array.isArray(active.planned_script_ids) ? active.planned_script_ids : [];
        const completed = new Set(completedScriptIds || []);
        await returnUnrecordedScriptsToIdeas(planned.filter(id => !completed.has(id)));
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/active-recordings/stop error:', e);
    res.status(e?.message === 'Unauthorized' ? 401 : 500).json({ error: e.message });
  }
});

// Segundo passo do stop com deferDelivery: depois do diálogo de finalização, grava as contagens
// no registro de entrega (sem mexer no tempo de gravação) e só então devolve para "ideias"
// os roteiros planejados que não foram gravados.
app.post('/api/active-recordings/:recordingId/finalize', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    await ensureRecordingMetricsSchema().catch(() => {});
    const { recordingId } = req.params;
    const { deliveryOverrides, completedScriptIds, plannedScriptIds } = req.body || {};
    const { rows: [rec] } = await pool.query(
      `SELECT id, client_id, videomaker_id, date::text AS date FROM recordings
        WHERE id = $1${scopeCity ? ` AND ${cityVisibilityExpression('city', '$2')}` : ''}`,
      scopeCity ? [recordingId, activeCity] : [recordingId]
    );
    if (!rec) return res.status(404).json({ error: 'Gravação não encontrada' });

    await upsertDeliveryRecord({
      recordingId,
      clientId: rec.client_id,
      videomakerId: rec.videomaker_id,
      date: rec.date,
      city: await getRecordingCity(recordingId),
      counts: deliveryCountsFrom(deliveryOverrides),
    });

    // Não gravados = planejados informados pelo painel + os que ainda estão na captação desta gravação
    const completed = new Set((Array.isArray(completedScriptIds) ? completedScriptIds : []).map(String));
    const { rows: pendingTasks } = await pool.query(
      `SELECT script_id::text AS script_id FROM content_tasks
        WHERE recording_id = $1 AND script_id IS NOT NULL
          AND kanban_column IN ('captacao', 'captacao_concluida', 'aguardando_link')`,
      [recordingId]
    );
    const candidates = [...(Array.isArray(plannedScriptIds) ? plannedScriptIds : []), ...pendingTasks.map(t => t.script_id)];
    await returnUnrecordedScriptsToIdeas(candidates.filter(id => !completed.has(String(id))));
    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/active-recordings/finalize error:', e);
    res.status(e?.message === 'Unauthorized' ? 401 : 500).json({ error: e.message });
  }
});

// ─── Production Assistant (AI Mascot) ──────────────────────
// Foguetinho: cada aba aberta pede um recado ao abrir e a cada hora. Um recado por pessoa a
// cada 20 min basta (o resto sai do cache), e falha da IA vai para o log no máximo a cada 10 min.
const ASSISTANT_CACHE_MS = 20 * 60 * 1000;
const assistantCache = new Map();
let assistantErrorLoggedAt = 0;

app.post('/api/production-assistant', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const cachedTip = assistantCache.get(String(user.id));
    if (cachedTip && Date.now() - cachedTip.at < ASSISTANT_CACHE_MS) return res.json({ message: cachedTip.message, cached: true });
    const admin = getAdminClient();
    if (!admin) return res.status(500).json({ error: 'DB not available' });
    const { context, aiModel, aiProvider } = req.body;
    if (!context) return res.status(400).json({ error: 'Context is required' });

    // Recado curto: o modelo leve basta
    const selectedModel = aiModel || 'gemini-flash-lite-latest';
    const dbApiKey = await fetchDbApiKey(admin, aiProvider);
    const ai = await resolveAiConfig(aiProvider, dbApiKey);

    const systemPrompt = `Você é o "Foguetinho", o mascote animado da Agência Pulse — um foguetinho com olhos expressivos.
Sua missão é manter a produção fluindo! Você monitora prazos, deadlines e cobranças de maneira LEVE, DIVERTIDA e MOTIVACIONAL.
Regras:
- Fale em 1ª pessoa como personagem vivo do sistema ("Ei, percebi que...")
- Use linguagem informal brasileira, com gírias leves
- Máximo 3-4 frases curtas
- Use emojis de foguete 🚀 e fogo 🔥 com moderação
- Seja encorajador, nunca agressivo
- Mencione dados concretos quando disponíveis (ex: "tem 3 vídeos atrasados")
- Na sexta-feira, lembre que final de semana não trabalha e incentive finalizar pendências
- Se não houver nada urgente, dê uma mensagem motivacional rápida`;

    const userPrompt = `Contexto atual:
- Usuário: ${context.userName} (${context.userRole})
- Dia da semana: ${context.isFriday ? 'SEXTA-FEIRA' : new Date().toLocaleDateString('pt-BR', { weekday: 'long' })}
- Tarefas atrasadas na agência: ${context.overdueCount}
- Títulos atrasados: ${context.overdueTitles?.join(', ') || 'nenhum'}
- Minhas tarefas de conteúdo pendentes: ${context.myPendingContent}
- Minhas tarefas de design pendentes: ${context.myPendingDesign}
- Total de tarefas em produção: ${context.totalPending}

Gere uma mensagem curta e divertida para este momento.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const message = await callAi(ai, selectedModel, messages, { temperature: 0.8, max_tokens: 1200, effort: 'low' });
    assistantCache.set(String(user.id), { at: Date.now(), message });
    if (assistantCache.size > 500) assistantCache.delete(assistantCache.keys().next().value);
    res.json({ message });
  } catch (error) {
    // Sem chave de IA configurada não é um erro de servidor: responde 200 desativado
    // para não poluir os logs com stack traces a cada polling do front-end.
    if (String(error?.message || '').includes('Nenhuma API key de IA')) {
      return res.json({ message: null, disabled: true, reason: 'ai_not_configured' });
    }
    if (Date.now() - assistantErrorLoggedAt > 10 * 60 * 1000) {
      assistantErrorLoggedAt = Date.now();
      console.error('Production assistant error:', error?.message || error);
    }
    res.status(500).json({ error: error.message });
  }
});

// ─── Repair missing content_tasks for completed recordings ──
app.post('/api/repair-content-tasks', async (req, res) => {
  try {
    // Ferramenta de manutenção (nenhuma tela usa): só admin, e só na cidade ativa.
    if (!(await requireAdminRoute(req, res))) return;
    const { recording_id } = req.body;
    const contentTasksClientIdNullable = await hasNullableClientIdOnContentTasks();
    const { user } = await verifyUser(req);
    const activeCity = await resolveActiveCity(req, user.id, user);
    const recordingsScoped = await tableHasCityColumn('recordings');
    // Card criado aqui fica na cidade ativa (antes caía no DEFAULT 'minacu')
    const taskCity = (await tableHasCityColumn('content_tasks')) ? activeCity : null;
    const recordingCityClause = (placeholder) => (recordingsScoped ? ` AND ${cityVisibilityExpression('r.city', placeholder)}` : '');

    // Find recording
    let recordings;
    if (recording_id) {
      const { rows } = await pool.query(
        `SELECT r.* FROM recordings r WHERE r.id = $1${recordingCityClause('$2')}`,
        recordingsScoped ? [recording_id, activeCity] : [recording_id]
      );
      recordings = rows;
    } else {
      // Find all completed recordings that have scripts without content_tasks
      const { rows } = await pool.query(`
        SELECT r.* FROM recordings r
        WHERE r.status = 'concluida'
        AND EXISTS (
          SELECT 1 FROM scripts s
          WHERE s.recording_id = r.id
          AND s.recorded = true
          AND NOT EXISTS (
            SELECT 1 FROM content_tasks ct WHERE ct.script_id = s.id
          )
        )${recordingCityClause('$1')}
        ORDER BY r.date DESC LIMIT 20
      `, recordingsScoped ? [activeCity] : []);
      recordings = rows;
    }

    const created = [];
    for (const rec of recordings) {
      const clientId = rec.client_id;
      const isAvulso = !clientId;
      if (isAvulso && !contentTasksClientIdNullable) continue;

      // Find recorded scripts linked to this recording (só desta gravação: o "OR client_id"
      // recriava em Edição cards de outras gravações e os que foram excluídos de propósito)
      const { rows: recScripts } = await pool.query(
        `SELECT s.* FROM scripts s
         WHERE s.recording_id = $1
         AND s.recorded = true
         AND NOT EXISTS (SELECT 1 FROM content_tasks ct WHERE ct.script_id = s.id)`,
        [rec.id]
      );

      for (const script of recScripts) {
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 48);
        const description = isAvulso
          ? `📹 VÍDEO AVULSO${rec.prospect_name ? ` — Prospect: ${rec.prospect_name}` : ''}\n\nRoteiro gravado pelo videomaker. Reparado automaticamente.`
          : `Roteiro gravado pelo videomaker. Reparado automaticamente.`;
        const { rows: inserted } = await pool.query(
          `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, script_id, recording_id, drive_link, editing_deadline, created_by${taskCity ? ', city' : ''})
           VALUES ($1, $2, $3, 'edicao', $4, $5, $6, $7, $8, $9${taskCity ? ', $10' : ''}) RETURNING id, title`,
          [
            clientId,
            script.title,
            script.content_format || 'reels',
            description,
            script.id,
            rec.id,
            script.drive_link || null,
            deadline.toISOString(),
            rec.videomaker_id || null,
            ...(taskCity ? [taskCity] : []),
          ]
        );
        if (inserted[0]) created.push(inserted[0]);
      }
    }

    res.json({ repaired: created.length, tasks: created });
  } catch (e) {
    console.error('POST /api/repair-content-tasks error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Find and fix specific content task by title ──
app.post('/api/fix-content-task', async (req, res) => {
  try {
    // Ferramenta de manutenção (nenhuma tela usa): só admin, só na cidade ativa e com uma busca
    // específica. Antes qualquer usuário logado, com title_search vazio ('%%'), levava um card
    // qualquer (de qualquer cidade, até arquivado) de volta para Edição.
    if (!(await requireAdminRoute(req, res))) return;
    const title_search = String(req.body?.title_search || '').trim();
    const drive_link = req.body?.drive_link ? String(req.body.drive_link).trim() : null;
    if (title_search.length < 5) {
      return res.status(400).json({ error: 'Informe title_search com pelo menos 5 caracteres.' });
    }
    const contentTasksClientIdNullable = await hasNullableClientIdOnContentTasks();
    const { user } = await verifyUser(req);
    const activeCity = await resolveActiveCity(req, user.id, user);
    const recordingsScoped = await tableHasCityColumn('recordings');
    const scriptsScoped = await tableHasCityColumn('scripts');
    const tasksScoped = await tableHasCityColumn('content_tasks');
    const taskCity = tasksScoped ? activeCity : null;

    // Find recording by searching for matching scripts or client names
    const { rows: matchingRecordings } = await pool.query(`
      SELECT r.*, c.company_name FROM recordings r
      LEFT JOIN clients c ON c.id = r.client_id
      WHERE r.status = 'concluida'
      AND r.date >= CURRENT_DATE - INTERVAL '7 days'
      ${recordingsScoped ? `AND ${cityVisibilityExpression('r.city', '$1')}` : ''}
      ORDER BY r.date DESC
    `, recordingsScoped ? [activeCity] : []);

    // Find scripts matching the title
    const { rows: matchingScripts } = await pool.query(
       `SELECT s.*, r.client_id as rec_client_id, r.id as rec_id, r.prospect_name FROM scripts s
       LEFT JOIN recordings r ON r.id = s.recording_id
       WHERE s.title ILIKE $1 AND s.recorded = true
       ${scriptsScoped ? `AND ${cityVisibilityExpression('s.city', '$2')}` : ''}`,
      scriptsScoped ? [`%${title_search}%`, activeCity] : [`%${title_search}%`]
    );

    // Check if content_task already exists (na cidade ativa)
    const { rows: existingTasks } = await pool.query(
      `SELECT * FROM content_tasks WHERE title ILIKE $1
       ${tasksScoped ? `AND ${cityVisibilityExpression('city', '$2')}` : ''}
       ORDER BY updated_at DESC`,
      tasksScoped ? [`%${title_search}%`, activeCity] : [`%${title_search}%`]
    );

    if (existingTasks.length > 0) {
      // Task exists — update it to edicao if needed (só card que ainda não passou da edição:
      // revisão, envio, agendado ou arquivado não volta para trás por aqui)
      const task = existingTasks[0];
      if (drive_link) {
        if (!['ideias', 'captacao', 'edicao'].includes(task.kanban_column)) {
          return res.status(409).json({ error: `O card "${task.title}" está em "${task.kanban_column}" e não volta para Edição por aqui.`, task: { id: task.id, title: task.title, kanban_column: task.kanban_column } });
        }
        await pool.query(
          `UPDATE content_tasks SET drive_link = $1, kanban_column = 'edicao', updated_at = NOW() WHERE id = $2`,
          [drive_link, task.id]
        );
      }
      return res.json({ status: 'updated', task: { ...task, drive_link: drive_link || task.drive_link } });
    }

    // No existing task — create one from script/recording data
    if (matchingScripts.length > 0) {
      const script = matchingScripts[0];
      const clientId = script.rec_client_id || script.client_id || null;
      if (!clientId && !contentTasksClientIdNullable) {
        return res.status(400).json({ error: 'Schema da VPS desatualizado: content_tasks.client_id ainda está NOT NULL.' });
      }

      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 48);
      const description = clientId
        ? `Reparado manualmente. Link dos materiais: ${drive_link || 'N/A'}`
        : `📹 VÍDEO AVULSO${script.prospect_name ? ` — Prospect: ${script.prospect_name}` : ''}\n\nReparado manualmente. Link dos materiais: ${drive_link || 'N/A'}`;
      const { rows: inserted } = await pool.query(
        `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, script_id, recording_id, drive_link, editing_deadline${taskCity ? ', city' : ''})
         VALUES ($1, $2, $3, 'edicao', $4, $5, $6, $7, $8${taskCity ? ', $9' : ''}) RETURNING *`,
        [
          clientId,
          script.title,
          script.content_format || 'reels',
          description,
          script.id,
          script.rec_id || script.recording_id || null,
          drive_link || null,
          deadline.toISOString(),
          ...(taskCity ? [taskCity] : []),
        ]
      );
      return res.json({ status: 'created', task: inserted[0] });
    }

    // Fallback: search by client name matching the title
    for (const rec of matchingRecordings) {
      if (rec.company_name && title_search.toLowerCase().includes(rec.company_name.toLowerCase().substring(0, 5))) {
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 48);
        const { rows: inserted } = await pool.query(
          `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, drive_link, recording_id, editing_deadline${taskCity ? ', city' : ''})
           VALUES ($1, $2, 'reels', 'edicao', $3, $4, $5, $6${taskCity ? ', $7' : ''}) RETURNING *`,
          [
            rec.client_id,
            title_search,
            `Conteúdo reparado. Link dos materiais: ${drive_link || 'N/A'}`,
            drive_link || null,
            rec.id,
            deadline.toISOString(),
            ...(taskCity ? [taskCity] : []),
          ]
        );
        return res.json({ status: 'created', task: inserted[0] });
      }
    }

    res.status(404).json({ error: 'Could not find matching recording/script', matchingRecordings: matchingRecordings.map(r => ({ id: r.id, date: r.date, client: r.company_name })) });
  } catch (e) {
    console.error('POST /api/fix-content-task error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── CLUBE DE DESCONTOS ─────────────────────────────────────

// Helper: generate random 6-digit code
const COUPON_CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_CAMPAIGN_COUPONS = 5000;

function generateCouponCode() {
  // crypto.randomInt: sempre 6 caracteres (o Math.random às vezes gerava menos)
  let code = '';
  for (let i = 0; i < 6; i += 1) code += COUPON_CODE_CHARS[crypto.randomInt(COUPON_CODE_CHARS.length)];
  return code;
}

/**
 * Insere `count` cupons novos na campanha em lote. O código é único no banco
 * inteiro: colisões são descartadas e completadas na rodada seguinte.
 */
async function insertCampaignCoupons(db, campaignId, count) {
  let inserted = 0;
  for (let round = 0; round < 5 && inserted < count; round += 1) {
    const codes = new Set();
    while (codes.size < count - inserted) codes.add(generateCouponCode());
    const { rowCount } = await db.query(
      `INSERT INTO discount_coupons (campaign_id, code)
       SELECT $1, unnest($2::text[])
       ON CONFLICT (code) DO NOTHING`,
      [campaignId, [...codes]]
    );
    inserted += rowCount || 0;
  }
  if (inserted < count) throw new Error('Não foi possível gerar todos os cupons. Tente novamente.');
  return inserted;
}

function discountAuthErrorStatus(error) {
  return error?.message === 'Admin access required' ? 403 : 401;
}

/** Telefone de quem pegou cupom sem login da equipe: só os 4 últimos dígitos. */
function maskClaimPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return phone || null;
  return `•••• ${digits.slice(-4)}`;
}

// List all clients with active discount campaigns (public)
app.get('/api/discount-clubs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id as client_id, c.company_name, c.logo_url, c.color,
              COUNT(dc.id)::int as campaign_count,
              COALESCE(SUM(
                (SELECT COUNT(*) FROM discount_coupons dcoup WHERE dcoup.campaign_id = dc.id AND dcoup.status = 'available')
              ), 0)::int as total_available
       FROM discount_campaigns dc
       JOIN clients c ON c.id = dc.client_id
       WHERE dc.is_active = true
       GROUP BY c.id, c.company_name, c.logo_url, c.color
       HAVING COALESCE(SUM(
         (SELECT COUNT(*) FROM discount_coupons dcoup WHERE dcoup.campaign_id = dc.id AND dcoup.status = 'available')
       ), 0) > 0
       ORDER BY c.company_name`
    );
    res.json({ clients: rows });
  } catch (e) {
    console.error('GET /api/discount-clubs error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get campaigns for a client (public - no auth)
app.get('/api/discount-campaigns/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { rows: campaigns } = await pool.query(
      `SELECT dc.*, c.company_name, c.logo_url, c.color
       FROM discount_campaigns dc
       JOIN clients c ON c.id = dc.client_id
       WHERE dc.client_id = $1 AND dc.is_active = true
       AND (dc.expires_at IS NULL OR dc.expires_at > NOW())
       ORDER BY dc.created_at DESC`,
      [clientId]
    );
    // For each campaign, get available coupon count
    for (const camp of campaigns) {
      const { rows: [countRow] } = await pool.query(
        `SELECT COUNT(*) as available FROM discount_coupons WHERE campaign_id = $1 AND status = 'available'`,
        [camp.id]
      );
      camp.available_coupons = parseInt(countRow.available);
    }
    res.json({ campaigns });
  } catch (e) {
    console.error('GET /api/discount-campaigns error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Claim a coupon (public - mini registration)
app.post('/api/discount-claim', async (req, res) => {
  try {
    const { campaign_id, name, phone } = req.body;
    if (!campaign_id || !name || !phone) {
      return res.status(400).json({ error: 'campaign_id, name e phone são obrigatórios' });
    }

    // Check if this phone already claimed from this campaign
    const { rows: existing } = await pool.query(
      `SELECT id FROM discount_coupons WHERE campaign_id = $1 AND claimed_by_phone = $2 AND status != 'available'`,
      [campaign_id, phone]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Você já resgatou um cupom desta campanha' });
    }

    // Find first available coupon and claim it atomically
    const { rows: claimed } = await pool.query(
      `UPDATE discount_coupons
       SET status = 'claimed', claimed_by_name = $2, claimed_by_phone = $3, claimed_at = NOW()
       WHERE id = (
         SELECT id FROM discount_coupons
         WHERE campaign_id = $1 AND status = 'available'
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [campaign_id, name, phone]
    );

    if (claimed.length === 0) {
      return res.status(410).json({ error: 'Todos os cupons desta campanha já foram resgatados' });
    }

    // Update campaign claimed count
    await pool.query(
      `UPDATE discount_campaigns SET coupons_claimed = coupons_claimed + 1, updated_at = NOW() WHERE id = $1`,
      [campaign_id]
    );

    // Get campaign + client info for WhatsApp message
    const { rows: [campInfo] } = await pool.query(
      `SELECT dc.title, dc.discount_type, dc.discount_value, c.company_name
       FROM discount_campaigns dc JOIN clients c ON c.id = dc.client_id
       WHERE dc.id = $1`,
      [campaign_id]
    );

    // Send WhatsApp notification to claimant
    const discountText = campInfo.discount_type === 'percentage'
      ? `${campInfo.discount_value}% de desconto`
      : `R$ ${Number(campInfo.discount_value).toFixed(2)} de desconto`;

    {
      const cleanPhone = phone.replace(/\D/g, '');
      const whatsPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const message = `🎉 Parabéns ${name}!\n\nVocê resgatou um cupom de *${discountText}* na *${campInfo.company_name}*!\n\n🎟️ Seu código: *${claimed[0].code}*\n\nApresente este código no caixa para validar seu desconto.\n\n_Clube de Descontos Pulse_`;
      // pela fila do WhatsApp próprio (conexão com a função "clube"); o código também aparece na tela
      await enqueueWhatsApp(pool, { to: whatsPhone, body: message, triggerType: 'clube_cupom', purpose: 'clube' })
        .catch((whatsErr) => console.error('WhatsApp notification error:', whatsErr.message));
    }

    res.json({ coupon: claimed[0], store_name: campInfo.company_name });
  } catch (e) {
    console.error('POST /api/discount-claim error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Verify/redeem coupon (portal - client validates at checkout)
app.post('/api/discount-verify', async (req, res) => {
  try {
    const { code, client_id, sale_value } = req.body;
    if (!code || !client_id) {
      return res.status(400).json({ error: 'code e client_id são obrigatórios' });
    }

    const { rows: coupons } = await pool.query(
      `SELECT dc2.*, dcamp.title as campaign_title, dcamp.discount_type, dcamp.discount_value, dcamp.client_id
       FROM discount_coupons dc2
       JOIN discount_campaigns dcamp ON dcamp.id = dc2.campaign_id
       WHERE dc2.code = $1`,
      [code.toUpperCase()]
    );

    if (coupons.length === 0) {
      return res.status(404).json({ error: 'Cupom não encontrado', valid: false });
    }

    const coupon = coupons[0];

    if (coupon.client_id !== client_id) {
      return res.status(403).json({ error: 'Este cupom não pertence a esta loja', valid: false });
    }

    if (coupon.status === 'used') {
      return res.status(409).json({ error: 'Este cupom já foi utilizado', valid: false, coupon });
    }

    if (coupon.status === 'available') {
      return res.status(400).json({ error: 'Este cupom ainda não foi resgatado', valid: false });
    }

    // Mark as used
    await pool.query(
      `UPDATE discount_coupons SET status = 'used', used_at = NOW(), sale_value = $2 WHERE id = $1`,
      [coupon.id, sale_value || 0]
    );

    res.json({ valid: true, coupon: { ...coupon, status: 'used', used_at: new Date().toISOString() } });
  } catch (e) {
    console.error('POST /api/discount-verify error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get discount stats for portal
// Equipe (admin/social_media, com Bearer) vê tudo; sem login (portal do cliente)
// o telefone de quem pegou o cupom sai mascarado — o client_id é público.
app.get('/api/discount-stats/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    let isTeamAdmin = false;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      isTeamAdmin = await verifyAdmin(req).then(() => true).catch(() => false);
    }
    const { rows: campaigns } = await pool.query(
      `SELECT * FROM discount_campaigns WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId]
    );

    const { rows: coupons } = await pool.query(
      `SELECT dc2.* FROM discount_coupons dc2
       JOIN discount_campaigns dcamp ON dcamp.id = dc2.campaign_id
       WHERE dcamp.client_id = $1
       ORDER BY dc2.created_at DESC`,
      [clientId]
    );

    const totalDiscountGiven = coupons
      .filter(c => c.status === 'used')
      .reduce((sum, c) => {
        const camp = campaigns.find(ca => ca.id === c.campaign_id);
        if (!camp) return sum;
        return sum + (camp.discount_type === 'percentage' ? (Number(c.sale_value) * Number(camp.discount_value) / 100) : Number(camp.discount_value));
      }, 0);

    const totalSalesFromCoupons = coupons
      .filter(c => c.status === 'used')
      .reduce((sum, c) => sum + Number(c.sale_value || 0), 0);

    res.json({
      campaigns,
      coupons: isTeamAdmin
        ? coupons
        : coupons.map((c) => ({ ...c, claimed_by_phone: maskClaimPhone(c.claimed_by_phone) })),
      stats: {
        total_coupons_issued: coupons.length,
        total_claimed: coupons.filter(c => c.status === 'claimed').length,
        total_used: coupons.filter(c => c.status === 'used').length,
        total_available: coupons.filter(c => c.status === 'available').length,
        total_discount_given: totalDiscountGiven,
        total_sales_from_coupons: totalSalesFromCoupons,
      },
    });
  } catch (e) {
    console.error('GET /api/discount-stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: create campaign with coupons
app.post('/api/discount-campaigns', async (req, res) => {
  let user;
  try {
    ({ user } = await verifyAdmin(req));
  } catch (authError) {
    return res.status(discountAuthErrorStatus(authError)).json({ error: authError.message || 'Unauthorized' });
  }

  try {
    const { client_id, description, discount_type, discount_value, min_purchase_value, expires_at } = req.body;
    const title = String(req.body?.title || '').trim();
    const total_coupons = Number(req.body?.total_coupons);
    if (!client_id || !title || !req.body?.total_coupons) {
      return res.status(400).json({ error: 'client_id, title e total_coupons são obrigatórios' });
    }
    if (!Number.isInteger(total_coupons) || total_coupons < 1 || total_coupons > MAX_CAMPAIGN_COUPONS) {
      return res.status(400).json({ error: `total_coupons deve ser um número inteiro entre 1 e ${MAX_CAMPAIGN_COUPONS}` });
    }
    if (title.length > 120) return res.status(400).json({ error: 'Título muito longo (máximo de 120 caracteres)' });
    if (String(description || '').length > 1000) return res.status(400).json({ error: 'Descrição muito longa (máximo de 1000 caracteres)' });

    // Campanha e cupons juntos: se a geração falhar, nada fica pela metade.
    const db = await pool.connect();
    let campaign;
    try {
      await db.query('BEGIN');
      ({ rows: [campaign] } = await db.query(
        `INSERT INTO discount_campaigns (client_id, title, description, discount_type, discount_value, min_purchase_value, total_coupons, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [client_id, title, description || '', discount_type || 'percentage', discount_value || 0, min_purchase_value || 0, total_coupons, expires_at || null, user?.id || null]
      ));
      await insertCampaignCoupons(db, campaign.id, total_coupons);
      await db.query('COMMIT');
    } catch (txError) {
      await db.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      db.release();
    }

    // Notify existing coupon holders from this client that new coupons are available
    const { rows: existingClaimants } = await pool.query(
      `SELECT DISTINCT dc2.claimed_by_phone, dc2.claimed_by_name
       FROM discount_coupons dc2
       JOIN discount_campaigns dcamp ON dcamp.id = dc2.campaign_id
       WHERE dcamp.client_id = $1 AND dc2.claimed_by_phone IS NOT NULL AND dc2.status != 'available'`,
      [client_id]
    );

    if (existingClaimants.length > 0) {
      const { rows: [clientInfo] } = await pool.query(`SELECT company_name FROM clients WHERE id = $1`, [client_id]);
      const storeName = clientInfo?.company_name || 'Loja parceira';

      for (const claimant of existingClaimants) {
        const cleanPhone = claimant.claimed_by_phone.replace(/\D/g, '');
        const whatsPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        const message = `🎁 Novidade no Clube de Descontos!\n\n${claimant.claimed_by_name}, a *${storeName}* acabou de lançar novos cupons de desconto!\n\n📌 *${title}*\n\nCorra e garanta o seu antes que acabe! 🏃‍♂️\n\n_Clube de Descontos Pulse_`;

        // a fila espaça os envios (vários segundos entre cada um) para o número não ser bloqueado por disparo em massa
        await enqueueWhatsApp(pool, { to: whatsPhone, body: message, clientId: client_id, triggerType: 'clube_campanha', purpose: 'clube' })
          .catch((whatsErr) => console.error('WhatsApp new campaign notification error:', whatsErr.message));
      }
    }

    res.json({ campaign, coupons_generated: total_coupons });
  } catch (e) {
    console.error('POST /api/discount-campaigns error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: editar campanha (título, desconto, validade...) ou ativar/desativar
app.patch('/api/discount-campaigns/:id', async (req, res) => {
  try {
    await verifyAdmin(req);
  } catch (authError) {
    return res.status(discountAuthErrorStatus(authError)).json({ error: authError.message || 'Unauthorized' });
  }

  const db = await pool.connect();
  try {
    const { id } = req.params;
    const body = req.body || {};

    // Só atualiza os campos enviados (antes o PATCH só lia is_active e a edição
    // gravava is_active = NULL, falhando sem salvar nada).
    const sets = [];
    const params = [id];
    const setField = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (body.title !== undefined) {
      const title = String(body.title || '').trim();
      if (!title) return res.status(400).json({ error: 'Título obrigatório' });
      if (title.length > 120) return res.status(400).json({ error: 'Título muito longo (máximo de 120 caracteres)' });
      setField('title', title);
    }
    if (body.description !== undefined) {
      if (String(body.description || '').length > 1000) return res.status(400).json({ error: 'Descrição muito longa (máximo de 1000 caracteres)' });
      setField('description', body.description || '');
    }
    if (body.discount_type !== undefined) setField('discount_type', body.discount_type || 'percentage');
    if (body.discount_value !== undefined) setField('discount_value', Number(body.discount_value) || 0);
    if (body.min_purchase_value !== undefined) setField('min_purchase_value', Number(body.min_purchase_value) || 0);
    // expires_at pode ser limpo de propósito (null = sem validade)
    if (body.expires_at !== undefined) setField('expires_at', body.expires_at || null);
    if (body.is_active !== undefined && body.is_active !== null) setField('is_active', Boolean(body.is_active));

    let targetTotal = null;
    if (body.total_coupons !== undefined && body.total_coupons !== null && body.total_coupons !== '') {
      targetTotal = Number(body.total_coupons);
      if (!Number.isInteger(targetTotal) || targetTotal < 1 || targetTotal > MAX_CAMPAIGN_COUPONS) {
        return res.status(400).json({ error: `total_coupons deve ser um número inteiro entre 1 e ${MAX_CAMPAIGN_COUPONS}` });
      }
    }

    await db.query('BEGIN');
    const { rows: [current] } = await db.query('SELECT id FROM discount_campaigns WHERE id = $1 FOR UPDATE', [id]);
    if (!current) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    if (targetTotal !== null) {
      const { rows: [counts] } = await db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'available')::int AS available
           FROM discount_coupons WHERE campaign_id = $1`,
        [id]
      );
      const used = counts.total - counts.available;
      if (targetTotal < used) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: `Esta campanha já tem ${used} cupons resgatados; o total não pode ficar abaixo disso.` });
      }
      if (targetTotal > counts.total) {
        await insertCampaignCoupons(db, id, targetTotal - counts.total);
      } else if (targetTotal < counts.total) {
        // Reduzir: tira só cupons ainda disponíveis (nunca os já resgatados)
        await db.query(
          `DELETE FROM discount_coupons
            WHERE id IN (
              SELECT id FROM discount_coupons
               WHERE campaign_id = $1 AND status = 'available'
               ORDER BY created_at DESC
               LIMIT $2
            )`,
          [id, counts.total - targetTotal]
        );
      }
      setField('total_coupons', targetTotal);
    }

    let updated = null;
    if (sets.length > 0) {
      ({ rows: [updated] } = await db.query(
        `UPDATE discount_campaigns SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        params
      ));
    } else {
      ({ rows: [updated] } = await db.query('SELECT * FROM discount_campaigns WHERE id = $1', [id]));
    }
    await db.query('COMMIT');
    res.json({ campaign: updated });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('PATCH /api/discount-campaigns/:id error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    db.release();
  }
});

// Admin: delete campaign and its coupons
app.delete('/api/discount-campaigns/:id', async (req, res) => {
  const client = await pool.connect();

  try {
    await verifyAdmin(req);
    const { id } = req.params;

    await client.query('BEGIN');

    const { rows: [campaign] } = await client.query(
      'SELECT id, title FROM discount_campaigns WHERE id = $1',
      [id]
    );

    if (!campaign) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    await client.query('DELETE FROM discount_coupons WHERE campaign_id = $1', [id]);
    await client.query('DELETE FROM discount_campaigns WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ success: true, deleted_campaign_id: id, title: campaign.title });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('DELETE /api/discount-campaigns/:id error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─── Health check ───────────────────────────────────────────

const TV_DAY_MS = 24 * 60 * 60 * 1000;

function normalizeTvNiche(value = '') {
  return String(value || 'outro').trim().toLowerCase();
}

function startOfTvDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function tvDaysUntil(baseDate, targetDate) {
  return Math.round((startOfTvDay(targetDate).getTime() - startOfTvDay(baseDate).getTime()) / TV_DAY_MS);
}

function formatTvDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTvNthWeekdayOfMonth(year, month, weekday, nth) {
  const date = new Date(year, month - 1, 1);
  let count = 0;

  while (date.getMonth() === month - 1) {
    if (date.getDay() === weekday) {
      count += 1;
      if (count === nth) return new Date(date);
    }
    date.setDate(date.getDate() + 1);
  }

  return new Date(year, month - 1, 1);
}

function getTvLastWeekdayOfMonth(year, month, weekday) {
  const date = new Date(year, month, 0);
  while (date.getDay() !== weekday) date.setDate(date.getDate() - 1);
  return new Date(date);
}

function getTvUrgency(days) {
  if (days <= 7) return 'high';
  if (days <= 20) return 'medium';
  return 'low';
}

const tvHealthNiches = ['saude', 'farmacia', 'odontologia', 'beleza', 'barbearia', 'emagrecimento', 'clinica_veterinaria'];
const tvRetailNiches = ['varejo', 'mercado', 'moda', 'moveis', 'infantil', 'joalheria', 'otica', 'construcao', 'grafica', 'outro'];
const tvFoodNiches = ['alimentacao', 'confeitaria', 'mercado'];

const tvSeasonalTemplates = [
  {
    label: 'Dia Mundial da Saúde',
    month: 4,
    day: 7,
    niches: tvHealthNiches,
    suggestion: 'Ative conteúdo educativo com dica prática, autoridade e CTA direto para atendimento.',
  },
  {
    label: 'Dia do Trabalhador',
    month: 5,
    day: 1,
    suggestion: 'Mostre bastidores, equipe e ofertas com linguagem humana para aproximar a marca.',
  },
  {
    label: 'Dia das Mães',
    computeDate: (year) => getTvNthWeekdayOfMonth(year, 5, 0, 2),
    niches: [...tvRetailNiches, ...tvFoodNiches, 'farmacia', 'saude', 'beleza', 'barbearia', 'turismo', 'pet'],
    suggestion: 'Antecipe kits, combos e uma campanha emocional com CTA forte no WhatsApp.',
  },
  {
    label: 'Dia dos Namorados',
    month: 6,
    day: 12,
    niches: [...tvRetailNiches, ...tvFoodNiches, 'turismo', 'beleza', 'barbearia', 'otica'],
    suggestion: 'Trabalhe desejo, presenteável e urgência com boa vitrine e oferta especial.',
  },
  {
    label: 'Dia do Cliente',
    month: 9,
    day: 15,
    suggestion: 'Reforce relacionamento com condição especial, prova social e reativação.',
  },
  {
    label: 'Black Friday',
    computeDate: (year) => getTvLastWeekdayOfMonth(year, 11, 5),
    suggestion: 'Planeje aquecimento, lista de espera e comunicação de oportunidade real.',
  },
  {
    label: 'Natal',
    month: 12,
    day: 25,
    suggestion: 'Use emoção, kits, presentes e fechamento de ano com forte apelo visual.',
  },
];

function resolveTvSeasonalDate(template, today) {
  let resolved = template.computeDate
    ? template.computeDate(today.getFullYear())
    : new Date(today.getFullYear(), (template.month || 1) - 1, template.day || 1);

  if (tvDaysUntil(today, resolved) < 0) {
    resolved = template.computeDate
      ? template.computeDate(today.getFullYear() + 1)
      : new Date(today.getFullYear() + 1, (template.month || 1) - 1, template.day || 1);
  }

  return resolved;
}

function buildSeasonalAlertItems(clients = [], referenceDate = new Date()) {
  return (clients || []).map((client) => {
    const niche = normalizeTvNiche(client?.niche);
    const candidateEvents = tvSeasonalTemplates
      .map((template) => {
        const targetDate = resolveTvSeasonalDate(template, referenceDate);
        const daysUntil = tvDaysUntil(referenceDate, targetDate);
        return { template, targetDate, daysUntil };
      })
      .filter(({ template, daysUntil }) => {
        if (daysUntil < 0 || daysUntil > 60) return false;
        return !template.niches?.length || template.niches.includes(niche);
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 4)
      .map(({ template, targetDate, daysUntil }) => ({
        label: template.label,
        date: formatTvDate(targetDate),
        days_until: daysUntil,
        urgency: getTvUrgency(daysUntil),
        suggestion: template.suggestion,
      }));

    const fallbackEvents = tvSeasonalTemplates
      .map((template) => {
        const targetDate = resolveTvSeasonalDate(template, referenceDate);
        const daysUntil = tvDaysUntil(referenceDate, targetDate);
        return { template, targetDate, daysUntil };
      })
      .filter(({ daysUntil }) => daysUntil >= 0 && daysUntil <= 60)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 2)
      .map(({ template, targetDate, daysUntil }) => ({
        label: template.label,
        date: formatTvDate(targetDate),
        days_until: daysUntil,
        urgency: getTvUrgency(daysUntil),
        suggestion: template.suggestion,
      }));

    const dates = candidateEvents.length ? candidateEvents : fallbackEvents;

    return {
      clientId: client?.id || crypto.randomUUID(),
      clientName: client?.company_name || 'Cliente',
      niche,
      clientLogo: client?.logo_url || null,
      clientColor: client?.color || null,
      dates,
    };
  }).filter((alert) => alert.dates.length > 0);
}

function buildTvSeasonalSlidesFromAlerts(alerts = []) {
  const slideMap = new Map();

  for (const alert of alerts || []) {
    for (const dateItem of alert?.dates || []) {
      const safeLabel = String(dateItem?.label || '').trim();
      const safeDate = String(dateItem?.date || '').trim();
      if (!safeLabel || !safeDate) continue;

      const key = `${safeLabel}|${safeDate}`;
      if (!slideMap.has(key)) {
        slideMap.set(key, {
          label: safeLabel,
          date: safeDate,
          daysUntil: Math.max(0, Number(dateItem?.days_until || 0)),
          urgency: dateItem?.urgency || getTvUrgency(Number(dateItem?.days_until || 0)),
          suggestion: dateItem?.suggestion || '',
          clients: [],
        });
      }

      const currentSlide = slideMap.get(key);
      if (!currentSlide.clients.find((entry) => entry.name === alert?.clientName)) {
        currentSlide.clients.push({
          name: alert?.clientName || 'Cliente',
          niche: normalizeTvNiche(alert?.niche),
          logoUrl: alert?.clientLogo || null,
          color: alert?.clientColor || null,
        });
      }
    }
  }

  return Array.from(slideMap.values())
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 12);
}

function buildTvSeasonalSlides(clients = [], referenceDate = new Date()) {
  return buildTvSeasonalSlidesFromAlerts(buildSeasonalAlertItems(clients, referenceDate));
}

async function loadSeasonalClients(clientIds = []) {
  const params = [];
  const conditions = ["niche IS NOT NULL", "btrim(niche) <> ''"];

  if (Array.isArray(clientIds) && clientIds.length > 0) {
    params.push(clientIds);
    conditions.push(`id = ANY($${params.length}::uuid[])`);
  }

  const { rows } = await pool.query(
    `
      SELECT id, company_name, niche, logo_url, color
      FROM clients
      WHERE ${conditions.join(' AND ')}
      ORDER BY company_name ASC
    `,
    params
  );

  return rows || [];
}

async function fetchSystemSeasonalAlerts({ clientIds = [], fallbackClients = null } = {}) {
  // Alertas sazonais calculados 100% localmente na VPS (sem serviços externos).
  const referenceDate = new Date();
  const clients = Array.isArray(fallbackClients) ? fallbackClients : await loadSeasonalClients(clientIds);
  return buildSeasonalAlertItems(clients, referenceDate);
}

// ─── TV Dashboard endpoint ──────────────────────────────────
app.get('/api/tv-dashboard', async (req, res) => {
  if (!(await tvAccessAllowed(req))) return res.status(401).json({ error: 'Unauthorized' });
  let stage = 'init';
  try {
    const safeQuery = async (label, sql, params = []) => {
      try {
        const { rows } = await pool.query(sql, params);
        return rows;
      } catch (error) {
        console.warn(`[tv-dashboard] Failed to load ${label}:`, error?.message || error);
        return [];
      }
    };

    stage = 'profiles';

    // 1. Get all team profiles
    const profiles = await safeQuery('profiles', `
      SELECT p.id, p.name, p.role, p.avatar_url, p.monthly_salary
      FROM profiles p
      WHERE p.role IS NOT NULL
      ORDER BY p.name
    `);

    // 2. Get online user IDs from presence
    stage = 'presence';
    const onlineIds = collectOnlinePresenceIds();

    // 3. Get active content tasks (editing/reviewing/altering)
    const contentTasks = await safeQuery('content_tasks', `
      SELECT ct.id, ct.title, ct.kanban_column, ct.assigned_to, ct.editing_started_at,
             ct.editing_paused_at, ct.editing_paused_seconds, ct.reviewing_by,
             ct.reviewing_at, ct.client_id, ct.edited_by,
             c.company_name AS client_name
      FROM content_tasks ct
      LEFT JOIN clients c ON c.id = ct.client_id
      WHERE ct.kanban_column IN ('edicao', 'revisao', 'alteracao')
        AND (ct.assigned_to IS NOT NULL OR ct.reviewing_by IS NOT NULL OR ct.edited_by IS NOT NULL)
    `);

    // 4. Get active design tasks (inclui fila de baixa prioridade e nova_tarefa para monitoramento de SLA)
    const designTasks = await safeQuery('design_tasks', `
      SELECT dt.id, dt.title, dt.kanban_column, dt.assigned_to, dt.timer_running,
             dt.timer_started_at, dt.time_spent_seconds, dt.created_at, dt.updated_at, dt.priority,
             c.company_name AS client_name, c.logo_url AS client_logo, c.color AS client_color,
             p.name AS designer_name, p.avatar_url AS designer_avatar
      FROM design_tasks dt
      LEFT JOIN clients c ON c.id = dt.client_id
      LEFT JOIN profiles p ON p.id = dt.assigned_to
      WHERE dt.kanban_column IN ('nova_tarefa', 'executando', 'fila_baixa_prioridade', 'em_analise', 'ajustes', 'em_andamento', 'revisao_interna')
      ORDER BY dt.updated_at DESC
    `);

    // 5. Get active recordings
    const activeRecs = await safeQuery('active_recordings', `
      SELECT ar.videomaker_id, ar.started_at, ar.recording_id, c.company_name AS client_name
      FROM active_recordings ar
      LEFT JOIN clients c ON c.id = ar.client_id
    `);

    // Build activity map: userId -> activity info
    const activityMap = new Map();

    // Content tasks
    for (const t of contentTasks) {
      const userId = t?.edited_by || t?.assigned_to || t?.reviewing_by;
      if (!userId) continue;

      let activity = 'editing';
      let timeOnTask = 0;

      if (t?.kanban_column === 'revisao') {
        activity = 'reviewing';
        if (t?.reviewing_at) {
          const reviewedAt = new Date(t.reviewing_at).getTime();
          timeOnTask = Number.isFinite(reviewedAt) ? Math.floor((Date.now() - reviewedAt) / 1000) : 0;
        }
      } else if (t?.kanban_column === 'alteracao') {
        activity = 'editing';
        if (t?.editing_started_at && !t?.editing_paused_at) {
          const startedAt = new Date(t.editing_started_at).getTime();
          const elapsed = Number.isFinite(startedAt) ? Math.floor((Date.now() - startedAt) / 1000) : 0;
          timeOnTask = elapsed - (t?.editing_paused_seconds || 0);
        }
      } else {
        if (t?.editing_started_at && !t?.editing_paused_at) {
          const startedAt = new Date(t.editing_started_at).getTime();
          const elapsed = Number.isFinite(startedAt) ? Math.floor((Date.now() - startedAt) / 1000) : 0;
          timeOnTask = elapsed - (t?.editing_paused_seconds || 0);
        } else if (t?.editing_paused_at) {
          activity = 'paused';
          timeOnTask = t?.editing_paused_seconds || 0;
        }
      }

      if (!activityMap.has(userId) || (timeOnTask > 0 && !activityMap.get(userId)?.timeOnTask)) {
        activityMap.set(userId, {
          activity,
          taskTitle: t?.title || 'Sem título',
          clientName: t?.client_name || 'Cliente',
          timeOnTask: Math.max(0, timeOnTask),
        });
      }
    }

    // Design tasks
    for (const t of designTasks) {
      if (!t?.assigned_to || activityMap.has(t.assigned_to)) continue;
      let timeOnTask = t?.time_spent_seconds || 0;
      if (t?.timer_running && t?.timer_started_at) {
        const startedAt = new Date(t.timer_started_at).getTime();
        if (Number.isFinite(startedAt)) {
          timeOnTask += Math.floor((Date.now() - startedAt) / 1000);
        }
      }
      activityMap.set(t.assigned_to, {
        activity: 'designing',
        taskTitle: t?.title || 'Sem título',
        clientName: t?.client_name || 'Cliente',
        timeOnTask,
      });
    }

    // Active recordings
    for (const r of activeRecs) {
      if (!r?.videomaker_id || activityMap.has(r.videomaker_id)) continue;
      const startedAt = r?.started_at ? new Date(r.started_at).getTime() : 0;
      const timeOnTask = Number.isFinite(startedAt) && startedAt > 0 ? Math.floor((Date.now() - startedAt) / 1000) : 0;
      activityMap.set(r.videomaker_id, {
        activity: 'recording',
        taskTitle: 'Gravação ativa',
        clientName: r?.client_name || 'Cliente',
        timeOnTask,
      });
    }

    // Fieldwork activities (external production without agenda)
    const fieldworkActivities = await safeQuery('fieldwork_activities', `
      SELECT fa.videomaker_id, fa.activity_type, fa.started_at, fa.notes,
             c.company_name AS client_name
      FROM fieldwork_activities fa
      LEFT JOIN clients c ON c.id = fa.client_id
      WHERE fa.ended_at IS NULL
    `);

    const FIELDWORK_LABELS = {
      taker: '📹 Coletando Taker',
      story: '📱 Gravando Story',
      produtos: '🛍️ Fotos Produtos',
      fotos: '📷 Fotos Gerais',
      evento: '🎪 Cobertura Evento',
      entrega: '📦 Entrega Material',
      outro: '🔧 Atividade Externa',
    };

    for (const fw of fieldworkActivities) {
      if (!fw?.videomaker_id || activityMap.has(fw.videomaker_id)) continue;
      const startedAt = fw?.started_at ? new Date(fw.started_at).getTime() : 0;
      const timeOnTask = Number.isFinite(startedAt) && startedAt > 0 ? Math.floor((Date.now() - startedAt) / 1000) : 0;
      activityMap.set(fw.videomaker_id, {
        activity: 'fieldwork',
        taskTitle: FIELDWORK_LABELS[fw.activity_type] || '📍 Em campo',
        clientName: fw?.client_name || 'Cliente',
        timeOnTask,
        taskType: fw.activity_type,
      });
    }

    // Admin/social_media are always "management" when online
    const managementRoles = new Set(['admin', 'social_media']);

    // Build response
    const members = (profiles || []).map((p) => {
      const safeId = p?.id || crypto.randomUUID();
      const safeName = p?.name || 'Sem nome';
      const safeRole = p?.role || 'admin';
      const isOnline = onlineIds.has(safeId);
      const taskInfo = activityMap.get(safeId);

      let activity = 'idle';
      if (taskInfo) {
        activity = taskInfo.activity;
      } else if (isOnline && managementRoles.has(safeRole)) {
        activity = 'management';
      }

      return {
        id: safeId,
        name: safeName,
        role: safeRole,
        avatarUrl: p?.avatar_url || null,
        isOnline,
        activity,
        clientName: taskInfo?.clientName || null,
        taskTitle: taskInfo?.taskTitle || null,
        timeOnTask: taskInfo?.timeOnTask || 0,
        taskType: taskInfo?.taskType || null,
      };
    });

    // Sort: online first, then by role
    members.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    // 6. Get today's recordings schedule
    const today = new Date().toISOString().split('T')[0];
    const recordings = await safeQuery('recordings', `
      SELECT r.id, r.client_id, r.videomaker_id, r.start_time, r.type, r.status,
             r.confirmation_status,
             c.company_name AS client_name, c.logo_url AS client_logo, c.color AS client_color,
             p.name AS videomaker_name, p.avatar_url AS videomaker_avatar
      FROM recordings r
      LEFT JOIN clients c ON c.id = r.client_id
      LEFT JOIN profiles p ON p.id = r.videomaker_id
      WHERE r.date::date = $1::date
      ORDER BY r.start_time ASC
    `, [today]);

    // 7. Get today's event recordings (optional; should not break the whole dashboard)
    let eventItems = [];
    try {
      const { rows: events } = await pool.query(`
        SELECT er.id, er.title, er.start_time, er.end_time, er.address, er.status,
               er.client_id, er.videomaker_id,
               c.company_name AS client_name,
               p.name AS videomaker_name, p.avatar_url AS videomaker_avatar
        FROM event_recordings er
        LEFT JOIN clients c ON c.id = er.client_id
        LEFT JOIN profiles p ON p.id = er.videomaker_id
        WHERE er.date::date = $1::date
        ORDER BY er.start_time ASC
      `, [today]);

      eventItems = (events || []).map((e) => ({
        id: e?.id || crypto.randomUUID(),
        type: 'event',
        clientName: e?.client_name || e?.title || 'Evento',
        clientLogo: null,
        clientColor: null,
        videomakerName: e?.videomaker_name || null,
        videomakerAvatar: e?.videomaker_avatar || null,
        startTime: e?.start_time || '23:59',
        endTime: e?.end_time || null,
        title: e?.title || 'Evento',
        address: e?.address || null,
        status: e?.status || 'agendada',
      }));
    } catch (error) {
      console.warn('[tv-dashboard] Failed to load event_recordings:', error?.message || error);
    }

    const schedule = (recordings || []).map((r) => ({
      id: r?.id || crypto.randomUUID(),
      type: 'recording',
      clientName: r?.client_name || 'Cliente',
      clientLogo: r?.client_logo || null,
      clientColor: r?.client_color || null,
      videomakerName: r?.videomaker_name || null,
      videomakerAvatar: r?.videomaker_avatar || null,
      startTime: r?.start_time || '23:59',
      recordingType: r?.type || null,
      status: r?.status || 'agendada',
      confirmationStatus: r?.confirmation_status || null,
    }));

    const todaySchedule = [...schedule, ...eventItems].sort((a, b) => String(a?.startTime || '').localeCompare(String(b?.startTime || '')));

    const designPipeline = (designTasks || []).map((t) => {
      let timeOnTask = t?.time_spent_seconds || 0;
      if (t?.timer_running && t?.timer_started_at) {
        const startedAt = new Date(t.timer_started_at).getTime();
        if (Number.isFinite(startedAt)) {
          timeOnTask += Math.floor((Date.now() - startedAt) / 1000);
        }
      }

      return {
        id: t?.id || crypto.randomUUID(),
        title: t?.title || 'Sem título',
        column: t?.kanban_column || 'executando',
        clientName: t?.client_name || 'Cliente',
        clientLogo: t?.client_logo || null,
        clientColor: t?.client_color || null,
        designerName: t?.designer_name || null,
        designerAvatar: t?.designer_avatar || null,
        assignedTo: t?.assigned_to || null,
        priority: t?.priority || 'media',
        createdAt: t?.created_at || null,
        updatedAt: t?.updated_at || null,
        timerRunning: !!t?.timer_running,
        timerStartedAt: t?.timer_started_at || null,
        timeOnTask: Math.max(0, timeOnTask),
        isPaused: !t?.timer_running,
        isLive: t?.kanban_column === 'executando' && !!t?.timer_running,
      };
    });

    // 8. Get editing tasks (active editing pipeline)
    const editingTasks = await safeQuery('editing_pipeline', `
      SELECT ct.id, ct.title, ct.kanban_column, ct.content_type, ct.editing_started_at,
             ct.editing_paused_at, ct.editing_paused_seconds, ct.edited_by,
             ct.reviewing_by, ct.reviewing_by_name, ct.reviewing_at,
             ct.client_id, ct.edited_video_link,
             c.company_name AS client_name, c.logo_url AS client_logo, c.color AS client_color,
             pe.name AS editor_name, pe.avatar_url AS editor_avatar,
             pr.name AS reviewer_name, pr.avatar_url AS reviewer_avatar
      FROM content_tasks ct
      LEFT JOIN clients c ON c.id = ct.client_id
      LEFT JOIN profiles pe ON pe.id = ct.edited_by
      LEFT JOIN profiles pr ON pr.id = ct.reviewing_by
      WHERE ct.kanban_column IN ('edicao', 'revisao', 'alteracao')
        AND (ct.edited_by IS NOT NULL OR ct.reviewing_by IS NOT NULL)
      ORDER BY ct.updated_at DESC
    `);

    const editingPipeline = (editingTasks || []).map((t) => {
      let timeOnTask = 0;
      if (t?.kanban_column === 'revisao' && t?.reviewing_at) {
        const reviewingAt = new Date(t.reviewing_at).getTime();
        timeOnTask = Number.isFinite(reviewingAt) ? Math.floor((Date.now() - reviewingAt) / 1000) : 0;
      } else if (t?.editing_started_at && !t?.editing_paused_at) {
        const editingAt = new Date(t.editing_started_at).getTime();
        const elapsed = Number.isFinite(editingAt) ? Math.floor((Date.now() - editingAt) / 1000) : 0;
        timeOnTask = elapsed - (t?.editing_paused_seconds || 0);
      }
      return {
        id: t?.id || crypto.randomUUID(),
        title: t?.title || 'Sem título',
        column: t?.kanban_column || 'edicao',
        contentType: t?.content_type || 'conteúdo',
        clientName: t?.client_name || 'Cliente',
        clientLogo: t?.client_logo || null,
        clientColor: t?.client_color || null,
        editorName: t?.editor_name || null,
        editorAvatar: t?.editor_avatar || null,
        reviewerName: t?.reviewer_name || t?.reviewing_by_name || null,
        reviewerAvatar: t?.reviewer_avatar || null,
        timeOnTask: Math.max(0, timeOnTask),
        isPaused: !!t?.editing_paused_at,
      };
    });

    // 9. Get today's scheduled posts + week ahead (reels only)
    let todayPosts = [];
    let weekPosts = [];
    try {
      const { rows: scheduledPosts } = await pool.query(`
        WITH parsed AS (
          SELECT smd.id, smd.title, smd.content_type, smd.platform, smd.status,
                 smd.scheduled_time, smd.delivered_at, smd.posted_at,
                 c.company_name AS client_name, c.logo_url AS client_logo, c.color AS client_color,
                 CASE
                   WHEN smd.scheduled_time ~ '^\\d{4}-\\d{2}-\\d{2}'
                     THEN split_part(replace(smd.scheduled_time, 'T', ' '), ' ', 1)::date
                   WHEN smd.delivered_at IS NOT NULL THEN smd.delivered_at
                   WHEN smd.posted_at IS NOT NULL THEN smd.posted_at
                   ELSE NULL
                 END AS post_date,
                 CASE
                   WHEN smd.scheduled_time ~ '^\\d{2}:\\d{2}$' THEN smd.scheduled_time
                   WHEN smd.scheduled_time ~ '^\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}'
                     THEN substring(replace(smd.scheduled_time, 'T', ' ') from 12 for 5)
                   ELSE NULL
                 END AS post_time
          FROM social_media_deliveries smd
          LEFT JOIN clients c ON c.id = smd.client_id
          WHERE smd.content_type = 'reels'
        )
        SELECT * FROM parsed
        WHERE post_date IS NOT NULL
          AND post_date BETWEEN $1::date AND ($1::date + INTERVAL '6 days')
        ORDER BY post_date ASC, post_time ASC NULLS LAST
      `, [today]);

      weekPosts = (scheduledPosts || []).map((p) => ({
        id: p?.id || crypto.randomUUID(),
        title: p?.title || 'Sem título',
        contentType: p?.content_type || 'conteúdo',
        platform: p?.platform || null,
        status: p?.status || 'pendente',
        scheduledTime: p?.post_time || null,
        scheduledDate: p?.post_date ? new Date(p.post_date).toISOString().slice(0, 10) : null,
        clientName: p?.client_name || 'Cliente',
        clientLogo: p?.client_logo || null,
        clientColor: p?.client_color || null,
      }));

      todayPosts = weekPosts.filter(p => p.scheduledDate === today);
    } catch (error) {
      console.warn('[tv-dashboard] Failed to load social_media_deliveries:', error?.message || error);
    }

    stage = 'seasonal_slides';
    const seasonalClients = await loadSeasonalClients();
    const seasonalAlerts = await fetchSystemSeasonalAlerts({ fallbackClients: seasonalClients });
    const seasonalSlides = buildTvSeasonalSlidesFromAlerts(seasonalAlerts);

    // Build list of recording IDs that are actively being recorded
    const activeRecordingIds = (activeRecs || []).map(r => r?.recording_id).filter(Boolean);

    // Story editing sessions (videomakers editando stories agora)
    let storyEditingSessions = [];
    try {
      const { rows } = await pool.query(`
        SELECT ses.id, ses.videomaker_id, ses.started_at, ses.stories_count,
               p.name AS videomaker_name, p.avatar_url AS videomaker_avatar
        FROM story_editing_sessions ses
        LEFT JOIN profiles p ON p.id = ses.videomaker_id
        WHERE ses.ended_at IS NULL
        ORDER BY ses.started_at ASC
      `);
      storyEditingSessions = rows.map(r => ({
        id: r.id,
        videomakerId: r.videomaker_id,
        videomakerName: r.videomaker_name,
        videomakerAvatar: r.videomaker_avatar,
        startedAt: r.started_at,
        storiesCount: r.stories_count || 0,
      }));
    } catch (error) {
      console.warn('[tv-dashboard] Failed to load story_editing_sessions:', error?.message || error);
    }

    // Copy sessions (copywriters executando roteiros agora)
    let copyActiveSessions = [];
    try {
      await ensureCopyActiveSessionsTable();
      const { rows } = await pool.query(`
        SELECT s.id, s.copywriter_id, s.copywriter_name, s.task_id, s.request_id,
               s.client_id, s.topic, s.content_format, s.batch_size, s.started_at,
               p.name AS profile_name, p.avatar_url AS copywriter_avatar,
               c.company_name AS client_name, c.logo_url AS client_logo, c.color AS client_color
        FROM copy_active_sessions s
        LEFT JOIN profiles p ON p.id = s.copywriter_id
        LEFT JOIN clients c ON c.id = s.client_id
        ORDER BY s.started_at ASC
      `);
      copyActiveSessions = rows.map(r => ({
        id: r.id,
        copywriterId: r.copywriter_id,
        copywriterName: r.copywriter_name || r.profile_name || 'Copywriter',
        copywriterAvatar: r.copywriter_avatar,
        taskId: r.task_id,
        requestId: r.request_id,
        clientId: r.client_id,
        clientName: r.client_name,
        clientLogo: r.client_logo,
        clientColor: r.client_color,
        topic: r.topic,
        contentFormat: r.content_format,
        batchSize: r.batch_size || 0,
        startedAt: r.started_at,
      }));
    } catch (error) {
      console.warn('[tv-dashboard] Failed to load copy_active_sessions:', error?.message || error);
    }

    res.json({ members, todaySchedule, editingPipeline, designPipeline, todayPosts, weekPosts, seasonalSlides, activeRecordingIds, storyEditingSessions, copyActiveSessions, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[tv-dashboard] Error at stage:', stage, err);
    res.json({ members: [], todaySchedule: [], editingPipeline: [], designPipeline: [], todayPosts: [], weekPosts: [], seasonalSlides: [], activeRecordingIds: [], updatedAt: new Date().toISOString(), error: 'fallback' });
  }
});

// ─── Seasonal Alerts proxy (calls Supabase edge function) ───
// Sem login (TV) os alertas saem sem o id do cliente: o id abre o portal.
function publicSeasonalAlerts(alerts = []) {
  return alerts.map(({ clientId, ...rest }) => rest);
}

app.post('/api/seasonal-alerts', async (req, res) => {
  try {
    const isTeam = await hasTeamSession(req);
    if (!isTeam && !(await tvAccessAllowed(req))) return res.status(401).json({ error: 'Unauthorized' });
    const clientIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds : [];
    const seasonalClients = await loadSeasonalClients(clientIds);
    const alerts = await fetchSystemSeasonalAlerts({ clientIds, fallbackClients: seasonalClients });
    res.json({ alerts: isTeam ? alerts : publicSeasonalAlerts(alerts) });
  } catch (err) {
    console.error('[seasonal-alerts] proxy error:', err?.message);
    res.json({ alerts: [] });
  }
});

// Also support GET for simpler calls
app.get('/api/seasonal-alerts', async (req, res) => {
  try {
    const isTeam = await hasTeamSession(req);
    if (!isTeam && !(await tvAccessAllowed(req))) return res.status(401).json({ error: 'Unauthorized' });
    const seasonalClients = await loadSeasonalClients();
    const alerts = await fetchSystemSeasonalAlerts({ fallbackClients: seasonalClients });
    res.json({ alerts: isTeam ? alerts : publicSeasonalAlerts(alerts) });
  } catch (err) {
    console.error('[seasonal-alerts] proxy error:', err?.message);
    res.json({ alerts: [] });
  }
});



app.get('/api/presence', async (req, res) => {
  // Quem está online (ids da equipe): só para a equipe logada
  if (!(await hasTeamSession(req))) return res.status(401).json({ error: 'Unauthorized', users: [] });
  res.json({ users: collectOnlinePresenceUsers() });
});

/**
 * Usuário da equipe para presença/Quick Chat por REST. O sendBeacon (saída ao
 * fechar a aba) não manda cabeçalho, então o token também é aceito no corpo.
 * O userId do corpo só vale se for do próprio usuário do token.
 */
async function presenceRequestUser(req) {
  let user = null;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    user = await verifyUser(req).then((ctx) => ctx.user).catch(() => null);
  }
  if (!user && typeof req.body?.token === 'string') {
    const auth = await authenticateSocketToken(req.body.token);
    user = auth?.user || null;
  }
  if (!user) return null;
  const ids = await presenceIdsForUser(user);
  const ownId = (id) => (id && ids.has(String(id)) ? String(id) : null);
  return { user, ids, ownId };
}

app.post('/api/presence/heartbeat', async (req, res) => {
  const auth = await presenceRequestUser(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const userId = auth.ownId(req.body?.userId) || String(auth.user.id);
  setPresenceHeartbeat(userId);
  // Broadcast to WebSocket clients
  broadcastPresence();
  res.json({ ok: true });
});

app.post('/api/presence/leave', async (req, res) => {
  const auth = await presenceRequestUser(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const userId = auth.ownId(req.body?.userId) || String(auth.user.id);
  presenceState.delete(userId);
  broadcastPresence();
  res.json({ ok: true });
});

// ─── Quick Chat REST endpoint ──────────────────────────────
app.post('/api/quick-chat', async (req, res) => {
  const auth = await presenceRequestUser(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const { toUserId, message } = req.body;
  // Remetente é sempre o usuário do token (o fromUserId do corpo só vale se for dele)
  const fromUserId = auth.ownId(req.body?.fromUserId) || String(auth.user.id);
  if (!toUserId || !message) {
    return res.status(400).json({ error: 'fromUserId, toUserId, message required' });
  }
  const payload = {
    id: String(req.body?.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    fromUserId,
    toUserId: String(toUserId),
    message: String(message).slice(0, 4000),
    createdAt: new Date().toISOString(),
  };
  // Só para as abas do remetente e do destinatário
  broadcastQuickMessage(payload);
  res.json({ ok: true, message: payload });
});

// ─── Training Video Protected Streaming ─────────────────────
// Blocks direct download by:
//   1. nginx denies /uploads/training-videos/* (returns 403)
//   2. /api/training/sign requires a valid logged-in user JWT
//   3. /api/training/stream requires a short-lived (10 min) signed token bound to lessonId + user
//   4. Stream response forces inline disposition, no-store cache, range support
const TRAINING_VIDEO_ROOT = process.env.TRAINING_VIDEO_ROOT || '/var/www/html/uploads/training-videos';
const TRAINING_VIDEO_ROOTS = Array.from(new Set([
  path.resolve(TRAINING_VIDEO_ROOT),
  path.resolve('/var/www/uploads/training-videos'),
  path.resolve('/var/www/html/uploads/training-videos'),
  path.resolve('/var/www/uploads/general'),
  path.resolve('/var/www/html/uploads/general'),
  path.resolve('/var/www/uploads/content'),
  path.resolve('/var/www/html/uploads/content'),
  path.resolve('/var/www/uploads'),
  path.resolve('/var/www/html/uploads'),
]));
const TRAINING_STREAM_TTL = 60 * 10; // 10 min

function getTrainingStreamContentType(filePathOrUrl = '') {
  return getPortalMediaContentType(filePathOrUrl);
}

async function ensureTrainingPlayableSource(sourcePath, lessonId) {
  const ext = path.extname(sourcePath || '').toLowerCase();
  if (ext !== '.mov') return { filePath: sourcePath, contentType: getTrainingStreamContentType(sourcePath) };

  const cacheKey = crypto.createHash('md5').update(`${lessonId}:${sourcePath}`).digest('hex');
  const cachedFile = path.join(TRANSCODE_CACHE_DIR, `training_${cacheKey}.mp4`);

  if (fs.existsSync(cachedFile)) {
    return { filePath: cachedFile, contentType: 'video/mp4' };
  }

  // Kick off transcode in the background — do NOT block the player. Most .mov files
  // from iPhone/macOS are H.264/AAC and browsers will play them when served as
  // video/mp4 with byte-range support. Next play will hit the cached MP4.
  warmPortal480pCache(sourcePath, cachedFile).catch((error) => {
    console.error('[training] background transcode error:', error?.message || error);
  });

  return { filePath: sourcePath, contentType: 'video/mp4' };
}

function resolveTrainingFile(videoPathOrUrl) {
  if (!videoPathOrUrl) return null;
  let rel = String(videoPathOrUrl).trim();
  rel = rel.replace(/^https?:\/\/[^/]+/, '');
  rel = decodeURIComponent(rel.split('?')[0].split('#')[0] || '');
  rel = rel.replace(/^\/+/, '');
  if (rel.includes('..') || rel.includes('\0')) return null;

  const base = path.basename(rel);
  const relativeCandidates = Array.from(new Set([
    rel,
    rel.replace(/^uploads\/training-videos\//, ''),
    rel.replace(/^uploads\//, ''),
    rel.replace(/^training-videos\//, ''),
    rel.replace(/^uploads\//, 'training-videos/'),
    rel.replace(/^\/?/, 'training-videos/'),
    base,
    `training-videos/${base}`,
  ].filter(Boolean)));

  for (const root of TRAINING_VIDEO_ROOTS) {
    for (const candidate of relativeCandidates) {
      const abs = path.resolve(root, candidate);
      if (!abs.startsWith(root)) continue;
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
    }
  }

  // Last-resort: recursive search by basename in known upload roots
  const searchRoots = [
    '/var/www/html/uploads',
    '/var/www/uploads',
    '/var/www/html',
    '/var/www',
  ];
  for (const r of searchRoots) {
    try {
      if (!fs.existsSync(r)) continue;
      const stack = [r];
      let steps = 0;
      while (stack.length && steps < 5000) {
        const cur = stack.pop();
        steps++;
        let entries;
        try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
          const full = path.join(cur, e.name);
          if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
            stack.push(full);
          } else if (e.isFile() && e.name === base) {
            return full;
          }
        }
      }
    } catch { /* ignore */ }
  }

  return null;
}

function getTrainingAuthTokenFromHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.replace('Bearer ', '').trim() || null;
}

// Probe a media file with ffprobe (best-effort). Returns { ok, durationSec?, hasVideoStream? }
async function probeTrainingMedia(absPath) {
  return new Promise((resolve) => {
    try {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        absPath,
      ]);
      let out = '';
      let err = '';
      const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve({ ok: false, error: 'ffprobe timeout' }); }, 5000);
      proc.stdout.on('data', (c) => { out += c.toString(); });
      proc.stderr.on('data', (c) => { err += c.toString(); });
      proc.on('error', () => { clearTimeout(timer); resolve({ ok: true, skipped: true }); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return resolve({ ok: false, error: err || `ffprobe exit ${code}` });
        try {
          const info = JSON.parse(out);
          const streams = Array.isArray(info.streams) ? info.streams : [];
          const hasVideoStream = streams.some((s) => s.codec_type === 'video');
          const durationSec = Number(info?.format?.duration || 0) || null;
          resolve({ ok: hasVideoStream, hasVideoStream, durationSec });
        } catch {
          resolve({ ok: false, error: 'invalid ffprobe output' });
        }
      });
    } catch {
      resolve({ ok: true, skipped: true });
    }
  });
}

// GET /api/training/verify?path=...  → confirms uploaded file exists on disk and is a valid media file
app.get('/api/training/verify', async (req, res) => {
  try {
    await verifyUser(req);
    const src = String(req.query.path || req.query.url || '');
    if (!src) return res.status(400).json({ ok: false, error: 'path required' });

    if (/^https?:\/\//.test(src) && !src.includes('agenciapulse.tech')) {
      return res.json({ ok: true, external: true });
    }

    const abs = resolveTrainingFile(src);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ ok: false, error: 'file not found on disk' });
    }
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size === 0) {
      return res.status(404).json({ ok: false, error: 'invalid file' });
    }
    if (stat.size < 1024) {
      return res.status(409).json({ ok: false, error: 'file too small / still writing', size: stat.size });
    }

    const probe = await probeTrainingMedia(abs);
    if (!probe.ok && !probe.skipped) {
      return res.status(415).json({ ok: false, error: probe.error || 'unplayable media', size: stat.size });
    }

    res.json({
      ok: true,
      size: stat.size,
      path: abs,
      durationSec: probe.durationSec ?? null,
      hasVideoStream: probe.hasVideoStream ?? null,
      probed: !probe.skipped,
    });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message || 'Unauthorized' });
  }
});

// GET /api/training/sign?lessonId=xxx → { url }

app.get('/api/training/sign', async (req, res) => {
  try {
    const headerToken = getTrainingAuthTokenFromHeader(req);
    const { user } = await verifyUser(req);
    const lessonId = String(req.query.lessonId || '');
    if (!lessonId) return res.status(400).json({ error: 'lessonId required' });

    const { rows } = await pool.query(
      'SELECT video_path, video_url FROM training_lessons WHERE id = $1 LIMIT 1',
      [lessonId],
    );
    if (!rows.length) return res.status(404).json({ error: 'lesson not found' });
    const src = rows[0].video_path || rows[0].video_url;
    if (!src) return res.status(404).json({ error: 'no video' });

    // If external URL (YouTube/Vimeo), return as-is — those have their own DRM
    if (/^https?:\/\//.test(src) && !src.includes('agenciapulse.tech')) {
      return res.json({ url: src, external: true });
    }

    // Gate em disco: sem arquivo valido -> sem token. Evita o player abrir e dar erro.
    const absCheck = resolveTrainingFile(src);
    if (!absCheck || !fs.existsSync(absCheck)) {
      console.warn('[training/sign] arquivo nao encontrado', { lessonId, src });
      return res.status(404).json({ error: 'video file not available yet', code: 'NOT_ON_DISK' });
    }
    let stat;
    try { stat = fs.statSync(absCheck); } catch { stat = null; }
    if (!stat || !stat.isFile() || stat.size < 1024) {
      return res.status(409).json({ error: 'video is still being written', code: 'INCOMPLETE', size: stat?.size || 0 });
    }

    const token = jwt.sign(
      { lessonId, sub: user.id, scope: 'training-stream' },
      JWT_SECRET,
      { expiresIn: TRAINING_STREAM_TTL },
    );
    res.json({ url: `/api/training/stream/${lessonId}?token=${token}`, size: stat.size });
  } catch (err) {
    console.error('[training/sign] auth error:', err?.message);
    res.status(401).json({ error: err.message || 'Unauthorized' });
  }
});

// GET /api/training/stream/:lessonId?token=xxx → ranged video stream
app.get('/api/training/stream/:lessonId', async (req, res) => {
  try {
    const lessonId = req.params.lessonId;
    const token = String(req.query.token || '');
    if (!token) return res.status(401).end();
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).end();
    }
    if (decoded.scope !== 'training-stream' || decoded.lessonId !== lessonId) {
      return res.status(403).end();
    }

    const { rows } = await pool.query(
      'SELECT video_path, video_url FROM training_lessons WHERE id = $1 LIMIT 1',
      [lessonId],
    );
    if (!rows.length) return res.status(404).end();
    const rawFilePath = resolveTrainingFile(rows[0].video_path || rows[0].video_url);
    if (!rawFilePath || !fs.existsSync(rawFilePath)) return res.status(404).end();
    const { filePath, contentType } = await ensureTrainingPlayableSource(rawFilePath, lessonId);

    const stat = fs.statSync(filePath);
    const total = stat.size;
    const range = req.headers.range;

    // Anti-download / anti-cache headers
    const baseHeaders = {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Accept-Ranges': 'bytes',
    };

    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match) {
        res.writeHead(416, baseHeaders);
        return res.end();
      }
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 1024 * 1024 - 1, total - 1);
      if (start >= total || end >= total) {
        res.writeHead(416, { ...baseHeaders, 'Content-Range': `bytes */${total}` });
        return res.end();
      }
      res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': end - start + 1,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...baseHeaders, 'Content-Length': total });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('[training/stream] error:', err?.message);
    res.status(500).end();
  }
});

// GET /api/public/bio/:slug
app.get('/api/public/bio/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const { rows: bioRows } = await pool.query(
      'SELECT id, client_id, slug, title, description, logo_url, theme_config, sections FROM client_bio_links WHERE slug = $1 LIMIT 1',
      [slug]
    );
    if (!bioRows.length) return res.status(404).json({ error: 'Bio não encontrada' });
    const bio = bioRows[0];
    const { rows: buttonRows } = await pool.query(
      'SELECT id, label, type, value, icon, position FROM client_bio_buttons WHERE bio_link_id = $1 AND active = true ORDER BY position ASC',
      [bio.id]
    );
    res.json({ bio, buttons: buttonRows });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════
// SORTEIOS DE PRÊMIOS (roleta / raspadinha com QR Code descartável)
// ═══════════════════════════════════════════════════════════════
let promoTablesPromise = null;
async function ensurePromoTables() {
  if (promoTablesPromise) return promoTablesPromise;
  promoTablesPromise = pool.query(`
    CREATE TABLE IF NOT EXISTS promo_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      rules_text TEXT DEFAULT '',
      require_lead_capture BOOLEAN NOT NULL DEFAULT false,
      require_document BOOLEAN NOT NULL DEFAULT false,
      lgpd_terms_text TEXT DEFAULT '',
      banner_url TEXT,
      logo_url TEXT,
      accent_color TEXT NOT NULL DEFAULT '#E11D48',
      code_prefix TEXT NOT NULL DEFAULT 'A3P',
      validation_pin TEXT NOT NULL DEFAULT '1234',
      is_active BOOLEAN NOT NULL DEFAULT true,
      city TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS promo_prizes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_url TEXT,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      remaining_quantity INTEGER NOT NULL DEFAULT 0,
      win_probability_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_promo_prizes_campaign ON promo_prizes(campaign_id);

    CREATE TABLE IF NOT EXISTS promo_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      batch_label TEXT,
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available','opened','revealed','redeemed','expired')),
      game_type TEXT,
      prize_id UUID REFERENCES promo_prizes(id) ON DELETE SET NULL,
      redemption_code TEXT UNIQUE,
      participant_name TEXT,
      participant_phone TEXT,
      participant_document TEXT,
      lgpd_accepted BOOLEAN NOT NULL DEFAULT false,
      opened_at TIMESTAMPTZ,
      revealed_at TIMESTAMPTZ,
      redeemed_at TIMESTAMPTZ,
      redeemed_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_promo_tickets_token ON promo_tickets(token);
    CREATE INDEX IF NOT EXISTS idx_promo_tickets_campaign ON promo_tickets(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_promo_tickets_code ON promo_tickets(redemption_code);
    CREATE INDEX IF NOT EXISTS idx_promo_tickets_batch ON promo_tickets(campaign_id, batch_label);

    -- Nicho de atuação: o módulo atende postos, lojas, restaurantes, clínicas etc.
    ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS business_segment TEXT DEFAULT 'generico';
    ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS earn_ticket_text TEXT;
    ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS redeem_instruction_text TEXT;
    ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS operator_label TEXT;
  `).catch((error) => {
    console.error('ensurePromoTables error:', error);
    promoTablesPromise = null;
  });
  return promoTablesPromise;
}
ensurePromoTables();

const PROMO_TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function promoRandomToken(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += PROMO_TOKEN_ALPHABET[bytes[i] % PROMO_TOKEN_ALPHABET.length];
  }
  return out;
}

function promoPublicCampaign(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    rules_text: row.rules_text || '',
    require_lead_capture: !!row.require_lead_capture,
    require_document: !!row.require_document,
    lgpd_terms_text: row.lgpd_terms_text || '',
    banner_url: row.banner_url || null,
    logo_url: row.logo_url || null,
    accent_color: row.accent_color || '#E11D48',
    business_segment: row.business_segment || 'generico',
    earn_ticket_text: row.earn_ticket_text || '',
    redeem_instruction_text: row.redeem_instruction_text || '',
    operator_label: row.operator_label || '',
    is_active: !!row.is_active,
  };
}

// Limite simples de tentativas por IP (protege o motor de sorteio contra abuso).
const promoRateBuckets = new Map();
function promoRateLimited(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const bucket = promoRateBuckets.get(key);
  if (!bucket || now > bucket.reset) {
    promoRateBuckets.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/** GET /api/promo/public/:slug — dados públicos da campanha (usado pela tela de validação) */
app.get('/api/promo/public/:slug', async (req, res) => {
  try {
    await ensurePromoTables();
    const { rows } = await pool.query(
      'SELECT * FROM promo_campaigns WHERE lower(slug) = $1 LIMIT 1',
      [String(req.params.slug || '').toLowerCase()]
    );
    if (!rows.length) return res.status(404).json({ error: 'Sorteio não encontrado' });
    res.json({ campaign: promoPublicCampaign(rows[0]) });
  } catch (error) {
    console.error('[promo/public:campaign] error:', error);
    res.status(500).json({ error: 'Falha ao carregar o sorteio' });
  }
});

/** GET /api/promo/public/:slug/:token — estado do cupom para a página pública */
app.get('/api/promo/public/:slug/:token', async (req, res) => {
  try {
    await ensurePromoTables();
    const slug = String(req.params.slug || '').toLowerCase();
    const token = String(req.params.token || '').toUpperCase();

    const { rows: campaignRows } = await pool.query(
      'SELECT * FROM promo_campaigns WHERE lower(slug) = $1 LIMIT 1',
      [slug]
    );
    if (!campaignRows.length) return res.status(404).json({ error: 'Sorteio não encontrado' });
    const campaign = campaignRows[0];
    if (!campaign.is_active) return res.status(403).json({ error: 'Este sorteio está encerrado.' });

    const { rows: ticketRows } = await pool.query(
      `SELECT t.id, t.status, t.game_type, t.redemption_code, t.participant_name, t.revealed_at,
              p.name AS prize_name, p.description AS prize_description, p.image_url AS prize_image_url
         FROM promo_tickets t
         LEFT JOIN promo_prizes p ON p.id = t.prize_id
        WHERE t.campaign_id = $1 AND upper(t.token) = $2
        LIMIT 1`,
      [campaign.id, token]
    );

    if (!ticketRows.length) {
      return res.json({ campaign: promoPublicCampaign(campaign), ticket: null, reason: 'not_found' });
    }
    const ticket = ticketRows[0];

    // Mostra os prêmios possíveis (sem probabilidades) para montar a roleta.
    const { rows: prizes } = await pool.query(
      `SELECT id, name, image_url FROM promo_prizes
        WHERE campaign_id = $1 AND is_active = true
        ORDER BY created_at ASC`,
      [campaign.id]
    );

    if (ticket.status === 'available' || ticket.status === 'opened') {
      if (ticket.status === 'available') {
        await pool.query(
          "UPDATE promo_tickets SET status = 'opened', opened_at = COALESCE(opened_at, now()) WHERE id = $1",
          [ticket.id]
        );
      }
      return res.json({
        campaign: promoPublicCampaign(campaign),
        prizes,
        ticket: { status: 'playable' },
      });
    }

    return res.json({
      campaign: promoPublicCampaign(campaign),
      prizes,
      ticket: {
        status: ticket.status,
        game_type: ticket.game_type,
        redemption_code: ticket.redemption_code,
        participant_name: ticket.participant_name,
        revealed_at: ticket.revealed_at,
        prize: ticket.prize_name
          ? { name: ticket.prize_name, description: ticket.prize_description, image_url: ticket.prize_image_url }
          : null,
      },
    });
  } catch (error) {
    console.error('[promo/public] error:', error);
    res.status(500).json({ error: 'Falha ao carregar o sorteio' });
  }
});

/** POST /api/promo/play — motor de sorteio (100% servidor) */
app.post('/api/promo/play', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensurePromoTables();
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown';
    if (promoRateLimited(`play:${ip}`)) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante.' });
    }

    const slug = String(req.body?.slug || '').toLowerCase();
    const token = String(req.body?.token || '').toUpperCase();
    const gameType = req.body?.game_type === 'scratch' ? 'scratch' : 'roulette';
    const name = String(req.body?.name || '').trim().slice(0, 120);
    const phone = String(req.body?.phone || '').trim().slice(0, 30);
    const document = String(req.body?.document || '').trim().slice(0, 20);
    const lgpdAccepted = req.body?.lgpd_accepted === true;

    if (!slug || !token) return res.status(400).json({ error: 'Cupom inválido' });

    await client.query('BEGIN');

    const { rows: campaignRows } = await client.query(
      'SELECT * FROM promo_campaigns WHERE lower(slug) = $1 LIMIT 1',
      [slug]
    );
    if (!campaignRows.length || !campaignRows[0].is_active) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sorteio indisponível' });
    }
    const campaign = campaignRows[0];

    if (campaign.require_lead_capture) {
      if (name.length < 2 || phone.length < 8 || !lgpdAccepted) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Preencha nome, WhatsApp e aceite os termos para jogar.' });
      }
      if (campaign.require_document && document.length < 11) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Informe um CPF válido.' });
      }
    }

    const { rows: ticketRows } = await client.query(
      'SELECT * FROM promo_tickets WHERE campaign_id = $1 AND upper(token) = $2 FOR UPDATE',
      [campaign.id, token]
    );
    if (!ticketRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cupom inválido' });
    }
    const ticket = ticketRows[0];
    if (ticket.status !== 'available' && ticket.status !== 'opened') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Este QR Code já foi utilizado.' });
    }

    const { rows: prizes } = await client.query(
      `SELECT * FROM promo_prizes
        WHERE campaign_id = $1 AND is_active = true AND remaining_quantity > 0
        ORDER BY created_at ASC
        FOR UPDATE`,
      [campaign.id]
    );

    // Sorteio ponderado: cada prêmio ocupa sua faixa de 0 a 100; a sobra é "tente novamente".
    const draw = Math.random() * 100;
    let cursor = 0;
    let winner = null;
    for (const prize of prizes) {
      const weight = Number(prize.win_probability_percent) || 0;
      if (weight <= 0) continue;
      if (draw >= cursor && draw < cursor + weight) {
        winner = prize;
        break;
      }
      cursor += weight;
    }

    let redemptionCode = null;
    if (winner) {
      // Baixa atômica do estoque: se outra transação levou a última unidade, o cupom vira "tente novamente".
      const decrement = await client.query(
        'UPDATE promo_prizes SET remaining_quantity = remaining_quantity - 1 WHERE id = $1 AND remaining_quantity > 0',
        [winner.id]
      );
      if (decrement.rowCount === 0) winner = null;
    }
    if (winner) {
      const prefix = (campaign.code_prefix || 'A3P').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'A3P';
      for (let attempt = 0; attempt < 12 && !redemptionCode; attempt += 1) {
        const candidate = `${prefix}-${String(crypto.randomInt(1000, 9999))}`;
        const { rows: exists } = await client.query(
          'SELECT 1 FROM promo_tickets WHERE redemption_code = $1 LIMIT 1',
          [candidate]
        );
        if (!exists.length) redemptionCode = candidate;
      }
      if (!redemptionCode) redemptionCode = `${prefix}-${promoRandomToken(6)}`;
    }

    await client.query(
      `UPDATE promo_tickets
          SET status = 'revealed',
              game_type = $2,
              prize_id = $3,
              redemption_code = $4,
              participant_name = NULLIF($5, ''),
              participant_phone = NULLIF($6, ''),
              participant_document = NULLIF($7, ''),
              lgpd_accepted = $8,
              opened_at = COALESCE(opened_at, now()),
              revealed_at = now()
        WHERE id = $1`,
      [ticket.id, gameType, winner?.id || null, redemptionCode, name, phone, document, lgpdAccepted]
    );

    await client.query('COMMIT');

    res.json({
      won: !!winner,
      prize: winner
        ? { id: winner.id, name: winner.name, description: winner.description, image_url: winner.image_url }
        : null,
      redemption_code: redemptionCode,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[promo/play] error:', error);
    res.status(500).json({ error: 'Falha ao realizar o sorteio' });
  } finally {
    client.release();
  }
});

async function promoFindCampaignBySlug(slug) {
  const { rows } = await pool.query(
    'SELECT * FROM promo_campaigns WHERE lower(slug) = $1 LIMIT 1',
    [String(slug || '').toLowerCase()]
  );
  return rows[0] || null;
}

/** POST /api/promo/validate — consulta / confirma a entrega do prêmio no caixa */
app.post('/api/promo/validate', async (req, res) => {
  try {
    await ensurePromoTables();
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown';
    if (promoRateLimited(`validate:${ip}`, 60)) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante.' });
    }

    const campaign = await promoFindCampaignBySlug(req.body?.slug);
    if (!campaign) return res.status(404).json({ error: 'Sorteio não encontrado' });

    const pin = String(req.body?.pin || '');
    if (pin !== String(campaign.validation_pin || '')) {
      return res.status(401).json({ error: 'PIN incorreto' });
    }

    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Informe o código de resgate' });

    const { rows } = await pool.query(
      `SELECT t.*, p.name AS prize_name, p.description AS prize_description, p.image_url AS prize_image_url
         FROM promo_tickets t
         LEFT JOIN promo_prizes p ON p.id = t.prize_id
        WHERE t.campaign_id = $1 AND upper(t.redemption_code) = $2
        LIMIT 1`,
      [campaign.id, code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Código inválido' });
    const ticket = rows[0];

    const payload = {
      code: ticket.redemption_code,
      participant_name: ticket.participant_name,
      participant_phone: ticket.participant_phone,
      prize: ticket.prize_name
        ? { name: ticket.prize_name, description: ticket.prize_description, image_url: ticket.prize_image_url }
        : null,
      redeemed_at: ticket.redeemed_at,
      redeemed_by: ticket.redeemed_by,
    };

    if (ticket.status === 'redeemed') {
      return res.status(409).json({ status: 'redeemed', ...payload });
    }
    if (ticket.status !== 'revealed') {
      return res.status(409).json({ status: 'invalid', error: 'Cupom sem prêmio liberado' });
    }

    if (req.body?.confirm === true) {
      const operator = String(req.body?.operator_name || '').trim().slice(0, 80) || 'Operador';
      // Nome informado pelo operador no momento da entrega (opcional; substitui o cadastrado se enviado).
      const winnerName = String(req.body?.winner_name || '').trim().slice(0, 120);
      const { rows: updated } = await pool.query(
        `UPDATE promo_tickets
            SET status = 'redeemed',
                redeemed_at = now(),
                redeemed_by = $2,
                participant_name = COALESCE(NULLIF($3, ''), participant_name)
          WHERE id = $1 AND status = 'revealed'
          RETURNING redeemed_at, redeemed_by, participant_name`,
        [ticket.id, operator, winnerName]
      );
      if (!updated.length) return res.status(409).json({ status: 'redeemed', ...payload });
      return res.json({
        status: 'confirmed',
        ...payload,
        participant_name: updated[0].participant_name,
        redeemed_at: updated[0].redeemed_at,
        redeemed_by: updated[0].redeemed_by,
      });
    }

    res.json({ status: 'allowed', ...payload });
  } catch (error) {
    console.error('[promo/validate] error:', error);
    res.status(500).json({ error: 'Falha ao validar o código' });
  }
});

// ─── Administração (autenticado) ───────────────────────────
const PROMO_ADMIN_ROLES = new Set(['admin', 'social_media']);
async function promoRequireAuth(req, res) {
  let user;
  try {
    user = await verifyUser(req);
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  const role = user?.user?.role || user?.role;
  if (!PROMO_ADMIN_ROLES.has(role)) {
    res.status(403).json({ error: 'Sem permissão para gerenciar sorteios' });
    return false;
  }
  await ensurePromoTables();
  req.promoUser = user;
  return true;
}

app.get('/api/promo/campaigns', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    const { rows } = await pool.query(`
      SELECT c.*,
             (SELECT count(*) FROM promo_tickets t WHERE t.campaign_id = c.id) AS tickets_total,
             (SELECT count(*) FROM promo_tickets t WHERE t.campaign_id = c.id AND t.status <> 'available') AS tickets_opened,
             (SELECT count(*) FROM promo_tickets t WHERE t.campaign_id = c.id AND t.prize_id IS NOT NULL) AS prizes_drawn,
             (SELECT count(*) FROM promo_tickets t WHERE t.campaign_id = c.id AND t.status = 'redeemed') AS prizes_redeemed,
             (SELECT count(*) FROM promo_tickets t WHERE t.campaign_id = c.id AND t.participant_phone IS NOT NULL) AS leads_total
        FROM promo_campaigns c
       ORDER BY c.created_at DESC
    `);
    res.json({ campaigns: rows });
  } catch (error) {
    console.error('[promo/campaigns] error:', error);
    res.status(500).json({ error: 'Falha ao carregar sorteios' });
  }
});

app.post('/api/promo/campaigns', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    const b = req.body || {};
    const slug = String(b.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!b.title || !slug) return res.status(400).json({ error: 'Informe título e slug' });

    if (b.id) {
      const { rows } = await pool.query(
        `UPDATE promo_campaigns SET
            title = $2, slug = $3, rules_text = $4, require_lead_capture = $5, require_document = $6,
            lgpd_terms_text = $7, banner_url = $8, logo_url = $9, accent_color = $10,
            code_prefix = $11, validation_pin = $12, is_active = $13,
            business_segment = $14, earn_ticket_text = $15, redeem_instruction_text = $16, operator_label = $17,
            updated_at = now()
          WHERE id = $1 RETURNING *`,
        [b.id, b.title, slug, b.rules_text || '', !!b.require_lead_capture, !!b.require_document,
         b.lgpd_terms_text || '', b.banner_url || null, b.logo_url || null, b.accent_color || '#E11D48',
         b.code_prefix || 'A3P', String(b.validation_pin || '1234'), b.is_active !== false,
         b.business_segment || 'generico', b.earn_ticket_text || '', b.redeem_instruction_text || '', b.operator_label || '']
      );
      return res.json({ campaign: rows[0] });
    }

    const { rows } = await pool.query(
      `INSERT INTO promo_campaigns
         (title, slug, rules_text, require_lead_capture, require_document, lgpd_terms_text,
          banner_url, logo_url, accent_color, code_prefix, validation_pin, is_active,
          business_segment, earn_ticket_text, redeem_instruction_text, operator_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [b.title, slug, b.rules_text || '', !!b.require_lead_capture, !!b.require_document,
       b.lgpd_terms_text || '', b.banner_url || null, b.logo_url || null, b.accent_color || '#E11D48',
       b.code_prefix || 'A3P', String(b.validation_pin || '1234'), b.is_active !== false,
       b.business_segment || 'generico', b.earn_ticket_text || '', b.redeem_instruction_text || '', b.operator_label || '']
    );
    res.json({ campaign: rows[0] });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: 'Já existe um sorteio com este slug' });
    console.error('[promo/campaigns:save] error:', error);
    res.status(500).json({ error: 'Falha ao salvar o sorteio' });
  }
});

app.delete('/api/promo/campaigns/:id', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    await pool.query('DELETE FROM promo_campaigns WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[promo/campaigns:delete] error:', error);
    res.status(500).json({ error: 'Falha ao excluir o sorteio' });
  }
});

app.get('/api/promo/campaigns/:id/prizes', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM promo_prizes WHERE campaign_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ prizes: rows });
  } catch (error) {
    console.error('[promo/prizes] error:', error);
    res.status(500).json({ error: 'Falha ao carregar prêmios' });
  }
});

app.post('/api/promo/prizes', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    const b = req.body || {};
    if (!b.campaign_id || !b.name) return res.status(400).json({ error: 'Dados incompletos' });
    const total = Math.max(0, Number(b.total_quantity) || 0);
    const probability = Math.min(100, Math.max(0, Number(b.win_probability_percent) || 0));

    if (b.id) {
      const remaining = b.remaining_quantity === undefined || b.remaining_quantity === null
        ? null
        : Math.max(0, Number(b.remaining_quantity) || 0);
      const { rows } = await pool.query(
        `UPDATE promo_prizes SET
            name = $2, description = $3, image_url = $4, total_quantity = $5,
            remaining_quantity = COALESCE($6, remaining_quantity),
            win_probability_percent = $7, is_active = $8
          WHERE id = $1 RETURNING *`,
        [b.id, b.name, b.description || '', b.image_url || null, total, remaining, probability, b.is_active !== false]
      );
      return res.json({ prize: rows[0] });
    }

    const { rows } = await pool.query(
      `INSERT INTO promo_prizes
         (campaign_id, name, description, image_url, total_quantity, remaining_quantity, win_probability_percent, is_active)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7) RETURNING *`,
      [b.campaign_id, b.name, b.description || '', b.image_url || null, total, probability, b.is_active !== false]
    );
    res.json({ prize: rows[0] });
  } catch (error) {
    console.error('[promo/prizes:save] error:', error);
    res.status(500).json({ error: 'Falha ao salvar o prêmio' });
  }
});

app.delete('/api/promo/prizes/:id', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    await pool.query('DELETE FROM promo_prizes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[promo/prizes:delete] error:', error);
    res.status(500).json({ error: 'Falha ao excluir o prêmio' });
  }
});

/** Gera um lote de cupons e devolve os tokens para impressão. */
app.post('/api/promo/tickets/generate', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    const campaignId = req.body?.campaign_id;
    const quantity = Math.min(1000, Math.max(1, Number(req.body?.quantity) || 0));
    if (!campaignId || !quantity) return res.status(400).json({ error: 'Informe o sorteio e a quantidade' });

    const batchLabel = `LOTE-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
    const created = [];
    for (let i = 0; i < quantity; i += 1) {
      let inserted = null;
      for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
        try {
          const { rows } = await pool.query(
            `INSERT INTO promo_tickets (campaign_id, token, batch_label)
             VALUES ($1, $2, $3) RETURNING id, token, batch_label, created_at`,
            [campaignId, promoRandomToken(10), batchLabel]
          );
          inserted = rows[0];
        } catch (error) {
          if (error?.code !== '23505') throw error;
        }
      }
      if (inserted) created.push(inserted);
    }

    res.json({ batch_label: batchLabel, tickets: created });
  } catch (error) {
    console.error('[promo/tickets:generate] error:', error);
    res.status(500).json({ error: 'Falha ao gerar os cupons' });
  }
});

app.get('/api/promo/campaigns/:id/tickets', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    const params = [req.params.id];
    let where = 'WHERE campaign_id = $1';
    if (req.query.batch) {
      params.push(String(req.query.batch));
      where += ` AND batch_label = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, token, batch_label, status, created_at FROM promo_tickets ${where}
        ORDER BY created_at DESC LIMIT 2000`,
      params
    );
    const { rows: batches } = await pool.query(
      `SELECT batch_label, count(*)::int AS total, min(created_at) AS created_at
         FROM promo_tickets WHERE campaign_id = $1 AND batch_label IS NOT NULL
        GROUP BY batch_label ORDER BY min(created_at) DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ tickets: rows, batches });
  } catch (error) {
    console.error('[promo/tickets] error:', error);
    res.status(500).json({ error: 'Falha ao carregar os cupons' });
  }
});

app.get('/api/promo/campaigns/:id/leads', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    const { rows } = await pool.query(
      `SELECT t.participant_name, t.participant_phone, t.participant_document, t.lgpd_accepted,
              t.status, t.redemption_code, t.revealed_at, t.redeemed_at, p.name AS prize_name
         FROM promo_tickets t
         LEFT JOIN promo_prizes p ON p.id = t.prize_id
        WHERE t.campaign_id = $1 AND (t.participant_phone IS NOT NULL OR t.participant_name IS NOT NULL)
        ORDER BY t.revealed_at DESC NULLS LAST
        LIMIT 5000`,
      [req.params.id]
    );
    res.json({ leads: rows });
  } catch (error) {
    console.error('[promo/leads] error:', error);
    res.status(500).json({ error: 'Falha ao carregar os leads' });
  }
});

/** Prêmios efetivamente entregues no caixa. */
app.get('/api/promo/campaigns/:id/redemptions', async (req, res) => {
  if (!(await promoRequireAuth(req, res))) return;
  try {
    await ensurePromoTables();
    const { rows } = await pool.query(
      `SELECT t.id, t.participant_name, t.participant_phone, t.participant_document,
              t.redemption_code, t.revealed_at, t.redeemed_at, t.redeemed_by, t.batch_label,
              p.name AS prize_name, p.image_url AS prize_image_url
         FROM promo_tickets t
         LEFT JOIN promo_prizes p ON p.id = t.prize_id
        WHERE t.campaign_id = $1 AND t.status = 'redeemed'
        ORDER BY t.redeemed_at DESC NULLS LAST
        LIMIT 5000`,
      [req.params.id]
    );
    res.json({ redemptions: rows });
  } catch (error) {
    console.error('[promo/redemptions] error:', error);
    res.status(500).json({ error: 'Falha ao carregar os resgates' });
  }
});


// ─── WebSocket Server for real-time presence & chat ─────────

// WebSocketServer already uses the global server instance initialized at the top

// Os três servidores usam `noServer` e um único listener de 'upgrade' que
// despacha pelo caminho. Antes cada um tinha `{ server, path }`: no ws 8 o que
// não era dono do caminho respondia 400 no mesmo socket e derrubava os outros
// (presença, Quick Chat e realtime nunca funcionavam).
const wssOffice = new WebSocketServer({ noServer: true });
// /api/realtime (o front usa VPS_API_BASE + '/realtime') e /realtime caem no
// mesmo servidor: relay de canais + avisos globais da equipe (broadcastToAll).
const realtimeWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname.replace(/\/+$/, '');
  } catch { /* caminho inválido */ }
  const target = pathname === '/ws/office'
    ? wssOffice
    : (pathname === '/api/realtime' || pathname === '/realtime') ? realtimeWss : null;
  if (!target) {
    socket.destroy();
    return;
  }
  target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
});

// ── Autenticação dos WebSockets ──
// O token vai na primeira mensagem ({ type: 'auth', token } ou no 'subscribe'
// do realtime), não na URL, para não ficar nos logs do Nginx. Sem token
// válido em WS_AUTH_TIMEOUT_MS a conexão é fechada.
const WS_AUTH_TIMEOUT_MS = 10_000;
const presenceIdsCache = new Map();

/** Ids que representam o mesmo usuário (profiles/auth_users), com cache curto. */
async function presenceIdsForUser(user) {
  const key = String(user?.id || '');
  if (!key) return new Set();
  const cached = presenceIdsCache.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.ids;
  const ids = new Set((await getLinkedUserIds(user).catch(() => [key])).map(String));
  ids.add(key);
  presenceIdsCache.set(key, { ids, at: Date.now() });
  if (presenceIdsCache.size > 2000) presenceIdsCache.delete(presenceIdsCache.keys().next().value);
  return ids;
}

async function authenticateSocketToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = verifyToken(token);
    if (!decoded?.sub) return null;
    const user = { id: String(decoded.sub), email: decoded.email || null };
    return { user, ids: await presenceIdsForUser(user) };
  } catch {
    return null;
  }
}

function armSocketAuthTimeout(ws) {
  const timer = setTimeout(() => {
    if (!ws._pulseUser) {
      try { ws.close(4401, 'unauthorized'); } catch { /* ignore */ }
    }
  }, WS_AUTH_TIMEOUT_MS);
  timer.unref?.();
  ws.on('close', () => clearTimeout(timer));
}

const wsClients = new Set();

function broadcastPresence() {
  const online = collectOnlinePresenceUsers();
  const msg = JSON.stringify({ type: 'presence_sync', users: online });
  for (const ws of wsClients) {
    try { if (ws.readyState === 1) ws.send(msg); } catch { /* ignore */ }
  }
}

/** Quick Chat: só para as abas do remetente e do destinatário (antes ia para todos). */
function broadcastQuickMessage(payload) {
  const msg = JSON.stringify({ type: 'quick_message', payload });
  const from = String(payload?.fromUserId || '');
  const to = String(payload?.toUserId || '');
  for (const ws of wsClients) {
    const ids = ws._pulseIds;
    if (!ids || !(ids.has(from) || ids.has(to))) continue;
    try { if (ws.readyState === 1) ws.send(msg); } catch { /* ignore */ }
  }
}

function setPresenceHeartbeat(userId) {
  const now = new Date().toISOString();
  const existing = presenceState.get(userId);
  presenceState.set(userId, {
    userId,
    heartbeatAt: now,
    connectedAt: existing?.connectedAt || now,
  });
}

wssOffice.on('connection', (ws) => {
  armSocketAuthTimeout(ws);
  let authPromise = null;

  ws.on('message', async (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (!data || typeof data !== 'object') return;

    if (data.type === 'auth') {
      if (ws._pulseUser) return;
      authPromise = authPromise || authenticateSocketToken(data.token);
      const auth = await authPromise;
      if (!auth) {
        try { ws.close(4401, 'unauthorized'); } catch { /* ignore */ }
        return;
      }
      ws._pulseUser = auth.user;
      ws._pulseIds = auth.ids;
      wsClients.add(ws);
      // Send current presence immediately
      try { ws.send(JSON.stringify({ type: 'presence_sync', users: collectOnlinePresenceUsers() })); } catch { /* ignore */ }
      return;
    }

    if (authPromise && !ws._pulseUser) await authPromise;
    if (!ws._pulseUser) return; // sem login não marca presença nem manda mensagem

    try {
      // O id do corpo só vale se for do próprio usuário do token
      const ownId = (id) => (id && ws._pulseIds?.has(String(id)) ? String(id) : null);
      if (data.type === 'heartbeat') {
        const userId = ownId(data.userId) || ws._pulseUser.id;
        setPresenceHeartbeat(userId);
        broadcastPresence();
      } else if (data.type === 'leave') {
        const userId = ownId(data.userId) || ws._pulseUser.id;
        presenceState.delete(userId);
        broadcastPresence();
      } else if (data.type === 'quick_message') {
        const payload = data.payload || {};
        if (!ownId(payload.fromUserId) || !payload.toUserId || !payload.message) return;
        broadcastQuickMessage({
          id: String(payload.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
          fromUserId: String(payload.fromUserId),
          toUserId: String(payload.toUserId),
          message: String(payload.message).slice(0, 4000),
          createdAt: payload.createdAt || new Date().toISOString(),
        });
      }
    } catch { /* ignore malformed messages */ }
  });

  ws.on('close', () => { wsClients.delete(ws); });
  ws.on('error', () => { wsClients.delete(ws); });
});

// ─── Generic Realtime Channel Relay (WebSocket) ─────────
// Client (src/lib/vpsDb.ts ChannelBuilder) connects to /api/realtime,
// sends { type:'subscribe', channel, token, events } then
// { type:'broadcast', channel, event, payload }.
// Server relays broadcast frames to every other socket subscribed to that channel.
// Só sockets autenticados (token no 'auth' ou no 'subscribe') entram nos canais
// e recebem os avisos globais (broadcastToAll → wssClients).

// channel name -> Set<ws>
const realtimeChannels = new Map();

function subscribeSocketToChannel(ws, channel) {
  if (!channel || typeof channel !== 'string') return;
  if (!ws._pulseChannels) ws._pulseChannels = new Set();
  ws._pulseChannels.add(channel);
  let set = realtimeChannels.get(channel);
  if (!set) { set = new Set(); realtimeChannels.set(channel, set); }
  set.add(ws);
}

function unsubscribeSocketFromAll(ws) {
  const chans = ws._pulseChannels;
  if (!chans) return;
  for (const channel of chans) {
    const set = realtimeChannels.get(channel);
    if (!set) continue;
    set.delete(ws);
    if (set.size === 0) realtimeChannels.delete(channel);
  }
  ws._pulseChannels = null;
}

function relayBroadcast(channel, event, payload, senderWs) {
  const set = realtimeChannels.get(channel);
  if (!set || set.size === 0) return 0;
  const msg = JSON.stringify({ type: 'broadcast', channel, event, payload: payload ?? null });
  let delivered = 0;
  for (const client of set) {
    if (client === senderWs) continue;
    try {
      if (client.readyState === 1) { client.send(msg); delivered++; }
    } catch { /* ignore */ }
  }
  return delivered;
}

realtimeWss.on('connection', (ws) => {
  ws._pulseChannels = new Set();
  armSocketAuthTimeout(ws);
  let authPromise = null;

  const ensureAuth = async (token) => {
    if (ws._pulseUser) return true;
    if (!authPromise && token) authPromise = authenticateSocketToken(token);
    const auth = authPromise ? await authPromise : null;
    if (!auth) return false;
    if (!ws._pulseUser) {
      ws._pulseUser = auth.user;
      wssClients.add(ws);
    }
    return true;
  };

  ws.on('message', async (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (!data || typeof data !== 'object') return;

    if (data.type === 'auth' || data.type === 'subscribe') {
      if (!(await ensureAuth(data.token))) {
        try { ws.close(4401, 'unauthorized'); } catch { /* ignore */ }
        return;
      }
      if (data.type === 'auth') return;
    } else if (!(await ensureAuth(null))) {
      return; // nada antes do login
    }

    if (data.type === 'subscribe' && typeof data.channel === 'string') {
      subscribeSocketToChannel(ws, data.channel);
      try { ws.send(JSON.stringify({ type: 'subscribed', channel: data.channel })); } catch { /* ignore */ }
      return;
    }

    if (data.type === 'unsubscribe' && typeof data.channel === 'string') {
      const set = realtimeChannels.get(data.channel);
      if (set) {
        set.delete(ws);
        if (set.size === 0) realtimeChannels.delete(data.channel);
      }
      ws._pulseChannels?.delete(data.channel);
      return;
    }

    // Eventos 'crm:*' só saem do servidor (broadcastToAll), nunca de um cliente
    if (data.type === 'broadcast' && typeof data.channel === 'string' && typeof data.event === 'string' && !data.event.startsWith('crm:')) {
      // Ensure sender is subscribed so they receive future broadcasts too
      if (!ws._pulseChannels?.has(data.channel)) subscribeSocketToChannel(ws, data.channel);
      relayBroadcast(data.channel, data.event, data.payload, ws);
      return;
    }

    if (data.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })); } catch { /* ignore */ }
    }
  });

  ws.on('close', () => { wssClients.delete(ws); unsubscribeSocketFromAll(ws); });
  ws.on('error', () => { wssClients.delete(ws); unsubscribeSocketFromAll(ws); });
});

// Server-side helper to emit into a realtime channel (usable from any HTTP route)
function emitRealtime(channel, event, payload) {
  return relayBroadcast(channel, event, payload, null);
}
globalThis.emitRealtime = emitRealtime;

// Clean stale presence every 30s
setInterval(() => {
  const before = presenceState.size;
  collectOnlinePresenceUsers();
  const changed = presenceState.size !== before;
  if (changed) broadcastPresence();
}, 30_000);

// ═══════════════════════════════════════════════════════════════
// PAINEL DE GESTÃO — SÓCIOS GESTORES
// Cross-city aggregation for management dashboard
// ═══════════════════════════════════════════════════════════════

let gestaoTablesReady = null;
async function ensureGestaoTables() {
  if (gestaoTablesReady) return gestaoTablesReady;
  gestaoTablesReady = (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS city_transfer_costs (
          content_type text PRIMARY KEY,
          unit_cost numeric NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`
        INSERT INTO city_transfer_costs (content_type, unit_cost) VALUES
          ('reels', 45),
          ('arte', 20),
          ('story', 8),
          ('roteiro', 15),
          ('social_media', 30)
        ON CONFLICT (content_type) DO NOTHING;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS monthly_closings (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          month text NOT NULL,
          city text NOT NULL,
          revenue numeric NOT NULL DEFAULT 0,
          salaries numeric NOT NULL DEFAULT 0,
          expenses numeric NOT NULL DEFAULT 0,
          transfer_out numeric NOT NULL DEFAULT 0,
          transfer_in numeric NOT NULL DEFAULT 0,
          net_margin numeric NOT NULL DEFAULT 0,
          content_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
          closed_by uuid,
          closed_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(month, city)
        );
      `);
    } catch (e) {
      console.warn('ensureGestaoTables warning:', e?.message || e);
    }
  })();
  return gestaoTablesReady;
}
ensureGestaoTables().catch(() => {});

async function isSocioGestor(user) {
  if (!user) return false;
  if (await isAdminUser(user)) return true;
  try {
    const linkedIds = await getLinkedUserIds(user);
    const { rows } = await pool.query(
      "SELECT 1 FROM user_roles WHERE user_id::text = ANY($1::text[]) AND role = 'socio_gestor' LIMIT 1",
      [linkedIds]
    );
    return rows.length > 0;
  } catch { return false; }
}

async function requireSocioGestor(req) {
  const { user } = await verifyUser(req);
  if (!(await isSocioGestor(user))) {
    const err = new Error('Acesso restrito a Sócios Gestores');
    err.status = 403;
    throw err;
  }
  return user;
}

function monthBounds(monthStr) {
  const m = /^\d{4}-\d{2}$/.test(monthStr) ? monthStr : new Date().toISOString().slice(0, 7);
  const start = `${m}-01`;
  const [y, mo] = m.split('-').map(Number);
  const nextMonth = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  return { month: m, start, end: nextMonth };
}

// Content-type unit costs -----------------------------------------
app.get('/api/gestao/unit-costs', async (req, res) => {
  try {
    await ensureGestaoTables();
    await requireSocioGestor(req);
    const { rows } = await pool.query('SELECT content_type, unit_cost FROM city_transfer_costs ORDER BY content_type');
    res.json({ costs: rows });
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message || 'Não autorizado' });
  }
});

app.put('/api/gestao/unit-costs', async (req, res) => {
  try {
    await ensureGestaoTables();
    await requireSocioGestor(req);
    const { costs } = req.body || {};
    if (!Array.isArray(costs)) return res.status(400).json({ error: 'costs must be array' });
    for (const c of costs) {
      if (!c?.content_type) continue;
      await pool.query(
        `INSERT INTO city_transfer_costs (content_type, unit_cost, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (content_type) DO UPDATE SET unit_cost = EXCLUDED.unit_cost, updated_at = now()`,
        [String(c.content_type), Number(c.unit_cost) || 0]
      );
    }
    const { rows } = await pool.query('SELECT content_type, unit_cost FROM city_transfer_costs ORDER BY content_type');
    res.json({ costs: rows });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Erro' });
  }
});

// Aggregated summary ----------------------------------------------
async function safeCount(sql, params) {
  try { const { rows } = await pool.query(sql, params); return Number(rows[0]?.n || 0); }
  catch { return 0; }
}
async function safeSum(sql, params) {
  try { const { rows } = await pool.query(sql, params); return Number(rows[0]?.total || 0); }
  catch { return 0; }
}

app.get('/api/gestao/summary', async (req, res) => {
  try {
    await ensureGestaoTables();
    await requireSocioGestor(req);
    const { month, start, end } = monthBounds(String(req.query.month || ''));

    const { rows: costRows } = await pool.query('SELECT content_type, unit_cost FROM city_transfer_costs');
    const unitCost = Object.fromEntries(costRows.map(r => [r.content_type, Number(r.unit_cost)]));

    // Content counts for Uruaçu (per city column on tables)
    const counts = {
      reels: await safeCount(
        `SELECT COUNT(*)::int AS n FROM content_tasks WHERE city='uruacu' AND content_type='reels' AND created_at >= $1 AND created_at < $2`,
        [start, end]
      ),
      story: await safeCount(
        `SELECT COUNT(*)::int AS n FROM content_tasks WHERE city='uruacu' AND content_type='story' AND created_at >= $1 AND created_at < $2`,
        [start, end]
      ),
      arte: await safeCount(
        `SELECT COUNT(*)::int AS n FROM design_tasks WHERE city='uruacu' AND created_at >= $1 AND created_at < $2`,
        [start, end]
      ),
      roteiro: await safeCount(
        `SELECT COUNT(*)::int AS n FROM scripts WHERE city='uruacu' AND created_at >= $1 AND created_at < $2`,
        [start, end]
      ),
      social_media: await safeCount(
        `SELECT COUNT(*)::int AS n FROM social_media_deliveries WHERE city='uruacu' AND created_at >= $1 AND created_at < $2`,
        [start, end]
      ),
    };

    const transferBreakdown = Object.entries(counts).map(([type, qty]) => ({
      content_type: type,
      qty,
      unit_cost: unitCost[type] || 0,
      total: (unitCost[type] || 0) * qty,
    }));
    const transferTotal = transferBreakdown.reduce((s, r) => s + r.total, 0);

    // Uruaçu revenue (received / to-receive in month)
    const revenueUruacu = await safeSum(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM revenues WHERE city='uruacu' AND reference_month >= $1 AND reference_month < $2`,
      [start, end]
    );
    const expensesUruacu = await safeSum(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE city='uruacu' AND expense_date >= $1 AND expense_date < $2`,
      [start, end]
    );
    // Salaries Uruaçu: sum monthly_salary of profiles whose primary user_cities city = 'uruacu'
    const salariesUruacu = await safeSum(
      `SELECT COALESCE(SUM(p.monthly_salary), 0) AS total
         FROM profiles p
         JOIN user_cities uc ON uc.user_id = p.id AND uc.is_primary = true
        WHERE uc.city = 'uruacu'`,
      []
    );

    const netMargin = revenueUruacu - salariesUruacu - expensesUruacu - transferTotal;

    // Active contracts Uruaçu
    const contractsUruacu = await safeCount(
      `SELECT COUNT(*)::int AS n FROM financial_contracts WHERE city='uruacu' AND status='ativo'`,
      []
    );

    // Plans margin: per city
    const { rows: plans } = await pool.query(
      `SELECT p.id, p.name, p.price, p.city, p.reels_qty, p.stories_qty, p.arts_qty,
              (SELECT COUNT(*)::int FROM financial_contracts fc WHERE fc.plan_id = p.id AND fc.status='ativo') AS active_clients
         FROM plans p WHERE p.status='ativo' ORDER BY p.city, p.price`
    );
    const plansWithMargin = plans.map(pl => {
      const productionCost =
        (Number(pl.reels_qty) || 0) * (unitCost.reels || 0) +
        (Number(pl.stories_qty) || 0) * (unitCost.story || 0) +
        (Number(pl.arts_qty) || 0) * (unitCost.arte || 0);
      const revenue = Number(pl.price) * Number(pl.active_clients);
      const grossMarginUnit = Number(pl.price) - productionCost;
      const marginPct = Number(pl.price) > 0 ? (grossMarginUnit / Number(pl.price)) * 100 : 0;
      return {
        id: pl.id, name: pl.name, city: pl.city, price: Number(pl.price),
        active_clients: pl.active_clients, revenue,
        production_cost: productionCost, gross_margin_unit: grossMarginUnit, margin_pct: marginPct,
      };
    });

    // Per Uruaçu client breakdown
    const { rows: uruClients } = await pool.query(
      `SELECT c.id, c.name, c.plan_id, p.name AS plan_name, p.price AS plan_price,
              (SELECT COUNT(*)::int FROM content_tasks ct WHERE ct.client_id = c.id AND ct.content_type='reels' AND ct.created_at >= $1 AND ct.created_at < $2) AS reels,
              (SELECT COUNT(*)::int FROM content_tasks ct WHERE ct.client_id = c.id AND ct.content_type='story' AND ct.created_at >= $1 AND ct.created_at < $2) AS stories,
              (SELECT COUNT(*)::int FROM design_tasks dt WHERE dt.client_id = c.id AND dt.created_at >= $1 AND dt.created_at < $2) AS artes,
              (SELECT COUNT(*)::int FROM scripts s WHERE s.client_id = c.id AND s.created_at >= $1 AND s.created_at < $2) AS roteiros
         FROM clients c
         LEFT JOIN plans p ON p.id = c.plan_id
        WHERE c.city='uruacu' AND COALESCE(c.status,'ativo')='ativo'
        ORDER BY c.name`,
      [start, end]
    ).catch(() => ({ rows: [] }));

    const clientsBreakdown = uruClients.map(c => {
      const cost =
        c.reels * (unitCost.reels || 0) +
        c.stories * (unitCost.story || 0) +
        c.artes * (unitCost.arte || 0) +
        c.roteiros * (unitCost.roteiro || 0);
      const rev = Number(c.plan_price || 0);
      return {
        id: c.id, name: c.name, plan_name: c.plan_name, revenue: rev,
        reels: c.reels, stories: c.stories, artes: c.artes, roteiros: c.roteiros,
        production_cost: cost, margin: rev - cost,
      };
    });

    res.json({
      month,
      kpis: {
        revenue_uruacu: revenueUruacu,
        expenses_uruacu: expensesUruacu,
        salaries_uruacu: salariesUruacu,
        transfer_to_minacu: transferTotal,
        net_margin_uruacu: netMargin,
        active_contracts_uruacu: contractsUruacu,
      },
      unit_costs: unitCost,
      transfer_breakdown: transferBreakdown,
      plans: plansWithMargin,
      clients_uruacu: clientsBreakdown,
    });
  } catch (e) {
    console.error('gestao/summary error:', e?.message || e);
    res.status(e.status || 500).json({ error: e.message || 'Erro' });
  }
});

app.post('/api/portal-videos/bulk-delete', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    if (!(await userHasAssignedRole(user, 'admin'))) return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    const { months = [], clientId = null, allClients = true, contentTypes = [], includeOpen = false, dryRun = false } = req.body;
    if (!Array.isArray(months) || months.length === 0 || months.some(month => !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))) {
      return res.status(400).json({ error: 'Selecione ao menos um mês válido' });
    }
    // Sem cliente escolhido não apaga de todos por engano: "todos" precisa vir explícito.
    if (!clientId && allClients !== true) return res.status(400).json({ error: 'Escolha o cliente' });

    const cleanupOptions = {
      months,
      clientId,
      allClients,
      contentTypes: Array.isArray(contentTypes) ? contentTypes : [],
      olderThanDays: months.length > 0 ? null : 60,
      includeOpen: includeOpen === true,
    };
    if (dryRun === true) {
      const preview = await cleanupOldPortalVideos({ ...cleanupOptions, dryRun: true });
      return res.json({ success: true, dryRun: true, ...preview });
    }

    const deletedCount = await cleanupOldPortalVideos(cleanupOptions);

    res.json({ success: true, deletedCount, freedBytes: lastCleanupStats.freedBytes });

  } catch (error) {
    console.error('bulk-delete error:', error);
    const message = error?.message || 'Erro interno';
    const status = error?.status || (/unauthorized|token|jwt/i.test(message) ? 401 : 500);
    res.status(status).json({ error: status === 401 ? 'Sessão expirada. Faça login novamente.' : message });
  }
});

/**
 * Pastas intocáveis: banco de dados de clientes, artes da designer,
 * treinamentos, contratos, panfletagem, sorteios e afins.
 * Nunca entram na auditoria nem na remoção de órfãos — nem no primeiro
 * nível nem aninhadas (ex.: design/artes/<cliente>).
 */
const ORPHAN_SKIP_DIRS = new Set([
  // Banco de dados de clientes
  'client-database',
  'clientdb',
  'client-logos',
  'logos',
  'professionals',
  'collaborators',
  'units',
  // Designer / artes — intocável
  'design',
  'design-files',
  'designs',
  'artes',
  'arte',
  'mockups',
  'referencias',
  'flyers',
  'flyer-templates',
  'panfletagem',
  'post-studio',
  // Treinamento, contratos e financeiro
  'training-videos',
  'onboarding-contracts',
  'contracts',
  'internal-invoices',
  // Campanhas, sorteios e links
  'promo',
  'sorteios',
  'bio-links',
]);

/**
 * Nome de arquivo gerado pelo upload da VPS: <timestamp>_<hex>.
 * Usado para proteger arquivos citados no banco por caminho relativo
 * (sem o prefixo /uploads/), que a busca por "uploads/" não pegaria.
 */
const UPLOAD_NAME_RE = /\d{10,16}_[0-9a-f]{8,32}(?:\.[A-Za-z0-9]{1,6})?/g;

/**
 * Varre TODAS as colunas textuais/JSON do schema public procurando
 * referências a /uploads/. Assim nenhum módulo (banco de dados de
 * clientes, artes, portal, campanhas...) pode ter arquivo apagado
 * por engano só porque a tabela não estava numa lista fixa.
 */
async function collectReferencedUploads() {
  const referenced = new Set();
  const referencedNames = new Set();
  const addFromText = (value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    if (!text) return;
    const matches = text.match(/[^"'\s,\\]*\/uploads\/[^"'\s,\\)\]]+/g) || [];
    for (const m of matches) {
      const rel = uploadRelativePath(m);
      if (rel) {
        referenced.add(rel);
        referencedNames.add(rel.slice(rel.lastIndexOf('/') + 1));
      }
    }
    // Segunda rede de proteção: qualquer nome de arquivo gerado pelo upload
    // citado em qualquer lugar do banco (mesmo sem o prefixo /uploads/).
    const names = text.match(UPLOAD_NAME_RE) || [];
    for (const n of names) referencedNames.add(n);
  };

  const { rows: columns } = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text','character varying','character','json','jsonb','ARRAY')
  `);

  for (const col of columns) {
    const sql = `
      SELECT "${col.column_name}"::text AS u
      FROM public."${col.table_name}"
      WHERE "${col.column_name}"::text LIKE '%uploads/%'
         OR "${col.column_name}"::text ~ '[0-9]{10,16}_[0-9a-f]{8,32}'
    `;
    try {
      const { rows } = await pool.query(sql);
      for (const row of rows) addFromText(row.u);
    } catch {
      // Coluna não convertível/tabela inacessível — ignora com segurança.
    }
  }
  return { referenced, referencedNames };
}

/**
 * Lista arquivos em /uploads/ que não têm nenhuma referência no banco.
 * Só leitura — não apaga nada. `minAgeDays` protege arquivos recentes.
 */
async function auditOrphanFiles({ minAgeDays = 7 } = {}) {
  const { referenced, referencedNames } = await collectReferencedUploads();
  if (referenced.size === 0 && referencedNames.size === 0) {
    const err = new Error('Auditoria abortada: nenhuma referência encontrada no banco.');
    err.status = 409;
    throw err;
  }

  const minAgeMs = Math.max(0, Number(minAgeDays) || 0) * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const files = [];
  let scanned = 0;
  let skippedRecent = 0;
  let skippedProtectedDirs = 0;

  const walk = (root, dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ORPHAN_SKIP_DIRS.has(entry.name.toLowerCase())) { skippedProtectedDirs += 1; continue; }
        walk(root, full);
        continue;
      }
      const rel = path.relative(root, full).split(path.sep).join('/');
      scanned += 1;
      // Proteção tripla: caminho relativo, nome do arquivo citado em qualquer
      // lugar do banco e pasta de módulo protegida em qualquer profundidade.
      if (referenced.has(rel)) continue;
      if (referencedNames.has(entry.name)) continue;
      if (rel.toLowerCase().split('/').slice(0, -1).some((seg) => ORPHAN_SKIP_DIRS.has(seg))) continue;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (now - stat.mtimeMs < minAgeMs) { skippedRecent += 1; continue; }
      files.push({
        path: rel,
        fullPath: full,
        size: stat.size,
        modifiedAt: new Date(stat.mtimeMs).toISOString(),
        folder: rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '/',
        ext: (path.extname(rel) || '').replace('.', '').toLowerCase(),
      });
    }
  };

  for (const root of uploadRoots()) {
    if (fs.existsSync(root)) walk(root, root);
  }

  files.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  return { referenced, referencedNames, files, scanned, skippedRecent, skippedProtectedDirs };
}

/**
 * Auditoria (somente leitura) dos arquivos órfãos, com data e tamanho,
 * para o administrador escolher exatamente o que apagar.
 */
app.get('/api/portal-videos/orphan-audit', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    if (!(await userHasAssignedRole(user, 'admin'))) {
      return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    }
    const minAgeDays = req.query.minAgeDays !== undefined ? Number(req.query.minAgeDays) : 7;
    const { referenced, referencedNames, files, scanned, skippedRecent, skippedProtectedDirs } =
      await auditOrphanFiles({ minAgeDays });

    const byMonth = new Map();
    let totalBytes = 0;
    for (const f of files) {
      totalBytes += f.size;
      const month = f.modifiedAt.slice(0, 7);
      const acc = byMonth.get(month) || { month, count: 0, bytes: 0 };
      acc.count += 1;
      acc.bytes += f.size;
      byMonth.set(month, acc);
    }

    res.json({
      success: true,
      scanned,
      skippedRecent,
      skippedProtectedDirs,
      protectedRefs: referenced.size + referencedNames.size,
      totalFiles: files.length,
      totalBytes,
      totalMb: Number((totalBytes / 1048576).toFixed(1)),
      months: [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1)),
      files: files.slice(0, 3000).map(({ fullPath, ...rest }) => rest),
      truncated: files.length > 3000,
    });
  } catch (error) {
    console.error('orphan-audit error:', error);
    const message = error?.message || 'Erro interno';
    const status = error?.status || (/unauthorized|token|jwt/i.test(message) ? 401 : 500);
    res.status(status).json({ error: status === 401 ? 'Sessão expirada. Faça login novamente.' : message });
  }
});

/**
 * Apaga apenas os caminhos escolhidos pelo administrador, e só depois de
 * revalidar no banco que continuam órfãos. Qualquer arquivo que voltou a ser
 * referenciado é ignorado silenciosamente (protegido).
 */
app.post('/api/portal-videos/delete-orphans', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    if (!(await userHasAssignedRole(user, 'admin'))) {
      return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    }
    const requested = Array.isArray(req.body?.paths) ? req.body.paths.map(String) : [];
    if (requested.length === 0) return res.status(400).json({ error: 'Nenhum arquivo selecionado' });
    if (requested.length > 500) {
      return res.status(400).json({ error: 'Selecione no máximo 500 arquivos por vez.' });
    }

    const minAgeDays = req.body?.minAgeDays !== undefined ? Number(req.body.minAgeDays) : 7;
    const { files } = await auditOrphanFiles({ minAgeDays });
    const allowed = new Map(files.map((f) => [f.path, f]));

    let deletedFiles = 0;
    let freedBytes = 0;
    let protectedSkipped = 0;

    for (const rel of requested) {
      const target = allowed.get(rel);
      if (!target) { protectedSkipped += 1; continue; }
      try {
        fs.unlinkSync(target.fullPath);
        deletedFiles += 1;
        freedBytes += target.size;
        console.log('[orphan-delete] removido:', target.path);
      } catch (error) {
        console.warn('[orphan-delete] falha ao remover:', target.fullPath, error?.message || error);
      }
    }

    res.json({
      success: true,
      deletedFiles,
      protectedSkipped,
      freedBytes,
      freedMb: Number((freedBytes / 1048576).toFixed(1)),
    });
  } catch (error) {
    console.error('delete-orphans error:', error);
    const message = error?.message || 'Erro interno';
    const status = error?.status || (/unauthorized|token|jwt/i.test(message) ? 401 : 500);
    res.status(status).json({ error: status === 401 ? 'Sessão expirada. Faça login novamente.' : message });
  }
});

/**
 * Varredura de órfãos: SOMENTE RELATÓRIO. Nunca apaga nada — a remoção
 * em massa foi desativada por segurança. Para liberar espaço, o
 * administrador seleciona arquivo por arquivo em /delete-orphans.
 */
app.post('/api/portal-videos/sweep-orphans', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    if (!(await userHasAssignedRole(user, 'admin'))) {
      return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    }
    const { referenced, referencedNames, files, scanned, skippedRecent, skippedProtectedDirs } =
      await auditOrphanFiles({ minAgeDays: 7 });

    const freedBytes = files.reduce((sum, f) => sum + f.size, 0);

    res.json({
      success: true,
      dryRun: true,
      readOnly: true,
      scanned,
      skipped: skippedRecent,
      skippedProtectedDirs,
      protectedRefs: referenced.size + referencedNames.size,
      deletedFiles: 0,
      candidateFiles: files.length,
      freedBytes,
      freedMb: Number((freedBytes / 1048576).toFixed(1)),
    });
  } catch (error) {
    console.error('sweep-orphans error:', error);
    const message = error?.message || 'Erro interno';
    const status = error?.status || (/unauthorized|token|jwt/i.test(message) ? 401 : 500);
    res.status(status).json({ error: status === 401 ? 'Sessão expirada. Faça login novamente.' : message });
  }
});



app.get('/api/portal-videos/months', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    if (!(await userHasAssignedRole(user, 'admin'))) return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    const clientId = String(req.query.clientId || '').trim();
    const rawTypes = String(req.query.contentTypes || '').trim();
    const types = rawTypes ? rawTypes.split(',').map((t) => t.trim()).filter((t) => t && t !== 'arte') : [];

    const params = [];
    let filter = '';
    if (clientId) { params.push(clientId); filter += ` AND client_id = $${params.length}`; }

    const typeFilter = types.length ? (() => { params.push(types); return ` AND content_type = ANY($${params.length}::text[])`; })() : '';

    const { rows } = await pool.query(`
      SELECT season_year, season_month, COUNT(*)::int AS video_count
      FROM client_portal_contents
      WHERE file_url IS NOT NULL
        AND content_type <> 'arte'
        ${filter}${typeFilter}
      GROUP BY season_year, season_month
      ORDER BY season_year DESC, season_month DESC
    `, params);

    const { rows: typeRows } = await pool.query(`
      SELECT COALESCE(content_type, 'outros') AS content_type, COUNT(*)::int AS video_count
      FROM client_portal_contents
      WHERE file_url IS NOT NULL
        AND content_type <> 'arte'
        ${filter}
      GROUP BY 1
      ORDER BY 1
    `, clientId ? [clientId] : []);

    res.json({ months: rows, contentTypes: typeRows });
  } catch (error) {
    console.error('portal-videos/months error:', error);
    const message = error?.message || 'Erro interno';
    const status = error?.status || (/unauthorized|token|jwt/i.test(message) ? 401 : 500);
    res.status(status).json({ error: status === 401 ? 'Sessão expirada. Faça login novamente.' : message });
  }
});

// Close month snapshot --------------------------------------------
app.post('/api/gestao/close-month', async (req, res) => {
  try {
    await ensureGestaoTables();
    const user = await requireSocioGestor(req);
    const { month } = req.body || {};
    const monthStr = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : new Date().toISOString().slice(0, 7);

    // Fetch summary internally by calling logic (simpler: recompute inline via GET handler is heavy)
    // For simplicity, we snapshot using same query patterns.
    const b = monthBounds(monthStr);
    const { rows: costRows } = await pool.query('SELECT content_type, unit_cost FROM city_transfer_costs');
    const unitCost = Object.fromEntries(costRows.map(r => [r.content_type, Number(r.unit_cost)]));
    const cnt = {
      reels: await safeCount(`SELECT COUNT(*)::int AS n FROM content_tasks WHERE city='uruacu' AND content_type='reels' AND created_at >= $1 AND created_at < $2`, [b.start, b.end]),
      story: await safeCount(`SELECT COUNT(*)::int AS n FROM content_tasks WHERE city='uruacu' AND content_type='story' AND created_at >= $1 AND created_at < $2`, [b.start, b.end]),
      arte: await safeCount(`SELECT COUNT(*)::int AS n FROM design_tasks WHERE city='uruacu' AND created_at >= $1 AND created_at < $2`, [b.start, b.end]),
      roteiro: await safeCount(`SELECT COUNT(*)::int AS n FROM scripts WHERE city='uruacu' AND created_at >= $1 AND created_at < $2`, [b.start, b.end]),
      social_media: await safeCount(`SELECT COUNT(*)::int AS n FROM social_media_deliveries WHERE city='uruacu' AND created_at >= $1 AND created_at < $2`, [b.start, b.end]),
    };
    const transferOut = Object.entries(cnt).reduce((s, [k, v]) => s + v * (unitCost[k] || 0), 0);
    const revenue = await safeSum(`SELECT COALESCE(SUM(amount),0) AS total FROM revenues WHERE city='uruacu' AND reference_month >= $1 AND reference_month < $2`, [b.start, b.end]);
    const expenses = await safeSum(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE city='uruacu' AND expense_date >= $1 AND expense_date < $2`, [b.start, b.end]);
    const salaries = await safeSum(`SELECT COALESCE(SUM(p.monthly_salary),0) AS total FROM profiles p JOIN user_cities uc ON uc.user_id = p.id AND uc.is_primary=true WHERE uc.city='uruacu'`, []);
    const net = revenue - salaries - expenses - transferOut;

    await pool.query(
      `INSERT INTO monthly_closings (month, city, revenue, salaries, expenses, transfer_out, transfer_in, net_margin, content_counts, closed_by)
       VALUES ($1,'uruacu',$2,$3,$4,$5,0,$6,$7::jsonb,$8)
       ON CONFLICT (month, city) DO UPDATE SET
         revenue=EXCLUDED.revenue, salaries=EXCLUDED.salaries, expenses=EXCLUDED.expenses,
         transfer_out=EXCLUDED.transfer_out, net_margin=EXCLUDED.net_margin,
         content_counts=EXCLUDED.content_counts, closed_by=EXCLUDED.closed_by, closed_at=now()`,
      [monthStr, revenue, salaries, expenses, transferOut, net, JSON.stringify(cnt), user.id]
    );
    // Mirror for Minaçu with transfer_in
    await pool.query(
      `INSERT INTO monthly_closings (month, city, revenue, salaries, expenses, transfer_out, transfer_in, net_margin, content_counts, closed_by)
       VALUES ($1,'minacu',0,0,0,0,$2,$2,$3::jsonb,$4)
       ON CONFLICT (month, city) DO UPDATE SET
         transfer_in=EXCLUDED.transfer_in, net_margin=monthly_closings.revenue - monthly_closings.salaries - monthly_closings.expenses - monthly_closings.transfer_out + EXCLUDED.transfer_in,
         content_counts=EXCLUDED.content_counts, closed_by=EXCLUDED.closed_by, closed_at=now()`,
      [monthStr, transferOut, JSON.stringify(cnt), user.id]
    );

    res.json({ ok: true, month: monthStr, transferOut, revenue, expenses, salaries, netMargin: net });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Erro' });
  }
});

// History (last 12 months of closings) -----------------------------
app.get('/api/gestao/history', async (req, res) => {
  try {
    await ensureGestaoTables();
    await requireSocioGestor(req);
    const { rows } = await pool.query(
      `SELECT month, city, revenue, salaries, expenses, transfer_out, transfer_in, net_margin, content_counts, closed_at
         FROM monthly_closings ORDER BY month DESC, city ASC LIMIT 60`
    );
    res.json({ closings: rows });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Erro' });
  }
});

// ─── Public reschedule (link enviado ao cliente após cancelamento manual) ───
let publicReschedTableReady = null;
let recordingsSourceColumnReady = false;
async function ensurePublicReschedTable() {
  if (publicReschedTableReady) return publicReschedTableReady;
  publicReschedTableReady = (async () => {
    try {
      await pool.query(`
        ALTER TABLE recordings
          ADD COLUMN IF NOT EXISTS rescheduled_to_id uuid REFERENCES recordings(id) ON DELETE SET NULL
      `);
    } catch (e) { console.warn('ensurePublicReschedTable:', e?.message || e); }
    // Origem das gravações criadas pelo cliente: 'portal' (pedido especial, remarcação no portal)
    // ou 'link' (link público de reagendamento). Vazio = criada pela equipe.
    try {
      await pool.query(`ALTER TABLE recordings ADD COLUMN IF NOT EXISTS source text`);
      recordingsSourceColumnReady = true;
    } catch (e) { console.warn('ensurePublicReschedTable (source):', e?.message || e); }
  })();
  return publicReschedTableReady;
}
ensurePublicReschedTable().catch(() => {});

const DAY_MAP_PR = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

function computeVmSlots(existingRecs, settings, duration) {
  const buffer = 30;
  const occupied = existingRecs.map(r => {
    const [h, m] = r.start_time.split(':').map(Number);
    return { start: h * 60 + m, end: h * 60 + m + duration };
  });
  const slots = [];
  const step = duration + buffer;
  const gen = (startStr, endStr) => {
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    let cursor = sh * 60 + sm;
    const endMin = eh * 60 + em;
    while (cursor + duration <= endMin) {
      const conflict = occupied.some(o => cursor < o.end + buffer && cursor + duration + buffer > o.start);
      if (!conflict) slots.push(`${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`);
      cursor += step;
    }
  };
  gen(settings?.shift_a_start || '08:30', settings?.shift_a_end || '12:00');
  gen(settings?.shift_b_start || '14:30', settings?.shift_b_end || '18:00');
  return slots;
}

app.post('/api/public-reschedule', async (req, res) => {
  try {
    await ensurePublicReschedTable();
    const { action, token, date, time } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token requerido' });

    const { rows: [rec] } = await pool.query(
      `SELECT r.id, r.client_id, r.videomaker_id, r.date::text, r.start_time, r.status, r.type, r.rescheduled_to_id,
              c.company_name, c.color, c.logo_url, c.fixed_day, c.fixed_time, c.whatsapp,
              p.name AS videomaker_name
         FROM recordings r
         JOIN clients c ON c.id = r.client_id
         LEFT JOIN profiles p ON p.id = r.videomaker_id
        WHERE r.id = $1`,
      [token]
    );
    if (!rec) return res.status(404).json({ error: 'Link inválido ou expirado' });
    if (rec.status !== 'cancelada') return res.status(400).json({ error: 'Esta gravação não está cancelada.' });
    // A nova gravação fica na cidade da gravação original (senão a do cliente)
    const recCity = await getRecordingCity(rec.id);

    // If already rescheduled, return that info (idempotent)
    let alreadyBooked = null;
    if (rec.rescheduled_to_id) {
      const { rows: [nr] } = await pool.query(
        `SELECT id, date::text, start_time FROM recordings WHERE id = $1`, [rec.rescheduled_to_id]
      );
      if (nr) alreadyBooked = { id: nr.id, date: nr.date, start_time: nr.start_time };
    }

    const settings = await getCompanySettingsForCity(recCity);
    const rawDur = settings?.recording_duration || 2;
    const duration = rawDur > 10 ? rawDur : rawDur * 60;
    const workDays = getSettingsWorkDays(settings);
    // Hoje e agora no fuso de Brasília; horário de hoje só com pelo menos 1 h de antecedência
    const todayBrt = brtDateString();
    const minStartTodayMin = brtMinutesNow() + 60;
    // Horários que o link oferece num dia: dia útil da agência, dentro dos 14 dias, livres e, se hoje, ainda por vir
    const offeredSlotsFor = (dateStr, existing) => {
      if (dateStr < todayBrt || dateStr > addDaysToDateString(todayBrt, 13)) return [];
      if (!workDays.includes(weekdayNameOfDate(dateStr))) return [];
      const free = computeVmSlots(existing, settings, duration);
      return dateStr === todayBrt ? free.filter(t => agendaTimeToMinutes(t) >= minStartTodayMin) : free;
    };

    if (action === 'info' || !action) {
      // Build next 14 days of slots for this videomaker (current + next week)
      const days = [];
      for (let i = 0; i < 14; i++) {
        const dateStr = addDaysToDateString(todayBrt, i);
        const { rows: existing } = await pool.query(
          `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
          [rec.videomaker_id, dateStr]
        );
        const slots = offeredSlotsFor(dateStr, existing);
        days.push({ date: dateStr, weekday: new Date(`${dateStr}T12:00:00Z`).getUTCDay(), slots });
      }

      // Next fixed occurrence (7-14 days from cancelled date)
      const fixedDayNum = DAY_MAP_PR[rec.fixed_day] ?? null;
      let nextFixed = null;
      if (fixedDayNum !== null) {
        const startFrom = new Date(); startFrom.setHours(0, 0, 0, 0); startFrom.setDate(startFrom.getDate() + 1);
        for (let i = 0; i < 21; i++) {
          const d = new Date(startFrom); d.setDate(d.getDate() + i);
          if (d.getDay() === fixedDayNum) { nextFixed = { date: d.toISOString().split('T')[0], time: rec.fixed_time || '08:30' }; break; }
        }
      }

      return res.json({
        client: { id: rec.client_id, company_name: rec.company_name, color: rec.color, logo_url: rec.logo_url },
        videomaker: { id: rec.videomaker_id, name: rec.videomaker_name || 'Videomaker' },
        cancelled: { date: rec.date, start_time: rec.start_time },
        fixed: { day: rec.fixed_day, time: rec.fixed_time },
        next_fixed: nextFixed,
        days,
        already_booked: alreadyBooked,
      });
    }

    if (alreadyBooked) return res.status(409).json({ error: 'Este link já foi usado para reagendar.', already_booked: alreadyBooked });

    // Conferência e criação numa transação: trava a gravação cancelada (um link = um reagendamento)
    // e o dia do videomaker (dois clientes não pegam o mesmo horário). Avisa a equipe só depois do COMMIT.
    async function createBackup(newDate, newTime, { requireOffered = true } = {}) {
      const buffer = 30;
      const txClient = await pool.connect();
      let newRec;
      try {
        await txClient.query('BEGIN');
        const { rows: [locked] } = await txClient.query('SELECT rescheduled_to_id FROM recordings WHERE id = $1 FOR UPDATE', [rec.id]);
        if (locked?.rescheduled_to_id) { const err = new Error('Este link já foi usado para reagendar.'); err.status = 409; throw err; }
        await txClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agenda|${rec.videomaker_id}|${newDate}`]);
        // Conflict recheck
        const { rows: existing } = await txClient.query(
          `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
          [rec.videomaker_id, newDate]
        );
        if (requireOffered && !offeredSlotsFor(newDate, existing).includes(String(newTime).slice(0, 5))) {
          const err = new Error('Horário não está mais disponível.'); err.status = 409; throw err;
        }
        const ns = agendaTimeToMinutes(newTime); const ne = ns + duration + buffer;
        const conflict = existing.some(c => { const cs = agendaTimeToMinutes(c.start_time); return ns < cs + duration + buffer && ne > cs; });
        if (conflict) { const err = new Error('Horário não está mais disponível.'); err.status = 409; throw err; }

        newRec = await insertPublicRecording(txClient, {
          clientId: rec.client_id, videomakerId: rec.videomaker_id, date: newDate, startTime: newTime,
          type: 'backup', status: 'agendada', confirmationStatus: 'confirmada', city: recCity, source: 'link',
        });
        await txClient.query(`UPDATE recordings SET rescheduled_to_id = $1 WHERE id = $2`, [newRec.id, rec.id]);
        await txClient.query('COMMIT');
      } catch (txErr) {
        await txClient.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        txClient.release();
      }

      // Notify team
      const msg = `${rec.company_name} reagendou (via link) para ${newDate} ${newTime}`;
      await notifyTeamRoles(['admin', 'social_media', 'videomaker'], { title: 'Reagendamento por link', message: msg, type: 'info', link: '/agenda' }, recCity);
      return newRec;
    }

    if (action === 'book') {
      if (!date || !time) return res.status(400).json({ error: 'date e time requeridos' });
      if (!isValidAgendaDate(date) || !isValidAgendaTime(time)) return res.status(400).json({ error: 'Data ou horário inválido' });
      const nr = await createBackup(date, time);
      return res.json({ success: true, booked: nr });
    }

    if (action === 'keep_next_week') {
      // Find next fixed_day occurrence (skip if it's the cancelled date)
      const fixedDayNum = DAY_MAP_PR[rec.fixed_day];
      if (fixedDayNum === undefined) return res.status(400).json({ error: 'Cliente sem dia fixo configurado.' });
      const startFrom = new Date(); startFrom.setHours(0, 0, 0, 0); startFrom.setDate(startFrom.getDate() + 1);
      let target = null;
      for (let i = 0; i < 21; i++) {
        const d = new Date(startFrom); d.setDate(d.getDate() + i);
        if (d.getDay() === fixedDayNum) { target = d.toISOString().split('T')[0]; break; }
      }
      if (!target) return res.status(400).json({ error: 'Não foi possível calcular a próxima data fixa.' });
      // Horário fixo do cliente: não precisa estar na grade do link, só livre
      const nr = await createBackup(target, rec.fixed_time || '08:30', { requireOffered: false });
      return res.json({ success: true, booked: nr });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (e) {
    console.error('[public-reschedule]', e);
    return res.status(e.status || 500).json({ error: e.message || 'Erro' });
  }
});

// ─── Uploads (substitui o antigo upload-server na porta 3001) ───
// O front (src/services/vpsApi.ts) envia multipart para POST /api/upload
// com os campos { folder?, file } e espera { path } relativo a /uploads/.
function resolveUploadRoot() {
  const configuredRoot = process.env.UPLOAD_ROOT?.trim();
  const candidates = [
    configuredRoot,
    '/var/www/uploads',
    path.join(__dirname, '..', 'uploads'),
  ].filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    try {
      const absolute = path.resolve(candidate);
      fs.mkdirSync(absolute, { recursive: true });
      fs.accessSync(absolute, fs.constants.R_OK | fs.constants.W_OK);
      return absolute;
    } catch (error) {
      console.error(`[upload] diretório indisponível: ${candidate}`, error.message);
    }
  }

  throw new Error('Nenhum diretório de upload possui permissão de leitura e escrita');
}

const UPLOAD_ROOT = resolveUploadRoot();
console.log(`[upload] arquivos serão gravados em ${UPLOAD_ROOT}`);

function sanitizeUploadFolder(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .split('/')
    .map((part) => part.trim().replace(/[^a-zA-Z0-9._-]/g, ''))
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

const uploadStorage = multer.diskStorage({
  destination(req, _file, cb) {
    try {
      // Rotas públicas fixam a pasta (ex.: banco de clientes); as demais usam o campo folder.
      const folder = req.forcedUploadFolder ?? sanitizeUploadFolder(req.body?.folder);
      const dest = path.resolve(UPLOAD_ROOT, folder);
      if (!dest.startsWith(path.resolve(UPLOAD_ROOT))) return cb(new Error('Pasta inválida'));
      fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    } catch (error) {
      cb(error);
    }
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const base = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${base}${ext}`);
  },
});

function uploadExtension(originalname) {
  return path.extname(originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
}

// Extensões que o navegador executaria se o arquivo fosse aberto direto em
// /uploads (mesmo domínio do app, onde fica o JWT da equipe): nunca aceitar.
const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  '.html', '.htm', '.xhtml', '.xht', '.shtml', '.mht', '.mhtml',
  '.js', '.mjs', '.cjs', '.php', '.phtml', '.phar', '.hta',
]);

// Mídias aceitas nos envios sem login da equipe (portal e links públicos).
const PUBLIC_MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.avif', '.bmp',
  '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.3gp',
  '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.opus', '.flac',
]);

function isPublicMediaUpload(file) {
  const ext = uploadExtension(file?.originalname);
  const mime = String(file?.mimetype || '').toLowerCase();
  if (ext === '.svg' || ext === '.xml' || mime.includes('svg') || mime.includes('xml')) return false;
  if (PUBLIC_MEDIA_EXTENSIONS.has(ext)) return true;
  return /^(image|video|audio)\//.test(mime);
}

// Pastas que o portal do cliente (sem login da equipe) usa na panfletagem:
// flyers/<client_id>[/generated] e panfletagem/<client_id>[/generated].
const PORTAL_UPLOAD_FOLDER_RE = /^(?:flyers|panfletagem)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/generated)?$/i;

function uploadRejection(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function uploadFileFilter(req, file, cb) {
  if (BLOCKED_UPLOAD_EXTENSIONS.has(uploadExtension(file?.originalname))) {
    return cb(uploadRejection(415, 'Tipo de arquivo não permitido', 'BLOCKED_FILE_TYPE'));
  }
  // Equipe logada: qualquer tipo (designers enviam .ai, .psd, .svg, .xml...).
  if (!req.uploadPublicScope) return cb(null, true);

  if (!isPublicMediaUpload(file)) {
    return cb(uploadRejection(415, 'Envie apenas fotos, vídeos ou áudios', 'BLOCKED_FILE_TYPE'));
  }
  if (req.uploadPublicScope !== 'portal') return cb(null, true);

  // Portal: só as pastas da panfletagem de um cliente que existe.
  const match = PORTAL_UPLOAD_FOLDER_RE.exec(sanitizeUploadFolder(req.body?.folder));
  if (!match) {
    // Sem Authorization nenhum e fora da panfletagem: é uma aba da equipe aberta
    // antes do deploy (o vpsApi antigo não mandava o login). "Faça login" confundia
    // quem está logado; a saída é atualizar a página. A mensagem não pode conter
    // "indisponível" (o front antigo repetiria o envio inteiro).
    if (!req.headers.authorization) {
      return cb(uploadRejection(401, 'Há uma versão nova do sistema: atualize a página e envie de novo', 'CLIENT_OUTDATED'));
    }
    return cb(uploadRejection(401, 'Faça login para enviar arquivos', 'UNAUTHORIZED'));
  }
  pool.query('SELECT 1 FROM clients WHERE id::text = lower($1) LIMIT 1', [match[1]])
    .then(({ rows }) => (rows.length
      ? cb(null, true)
      : cb(uploadRejection(404, 'Cliente não encontrado', 'CLIENT_NOT_FOUND'))))
    .catch((error) => cb(error));
}

const uploadHandler = multer({
  storage: uploadStorage,
  fileFilter: uploadFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB (equipe logada)
});

// Envios sem login da equipe (portal do cliente e banco de clientes público).
const publicUploadHandler = multer({
  storage: uploadStorage,
  fileFilter: uploadFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

function uploadErrorStatus(error) {
  if (error?.status) return error.status;
  if (error?.code === 'LIMIT_FILE_SIZE') return 413;
  if (error?.code === 'ENOSPC') return 507;
  return 500;
}

/**
 * Caminho relativo a /uploads/ a partir do que o front manda no DELETE:
 * URL completa (https://agenciapulse.tech/uploads/...), '/uploads/...',
 * 'uploads/...' ou só o relativo ('content/...').
 */
function uploadDeleteRelativePath(rawPath) {
  const raw = String(rawPath || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      if (new URL(raw).origin !== 'https://agenciapulse.tech') return null;
    } catch {
      return null;
    }
    return uploadRelativePath(raw);
  }
  const relative = raw.replace(/^\/+/, '').replace(/^uploads\//, '');
  return uploadRelativePath(`/uploads/${relative}`);
}

app.get('/api/upload-health', async (req, res) => {
  // Expõe caminho do disco e espaço livre: só admin
  if (!(await requireAdminRoute(req, res))) return;
  try {
    fs.accessSync(UPLOAD_ROOT, fs.constants.R_OK | fs.constants.W_OK);
    const stats = fs.statfsSync(UPLOAD_ROOT);
    return res.json({
      ok: true,
      uploadRoot: UPLOAD_ROOT,
      freeBytes: stats.bavail * stats.bsize,
    });
  } catch (error) {
    console.error('[upload:health] error:', error);
    return res.status(503).json({ ok: false, error: error.message || 'Diretório de upload indisponível' });
  }
});


// ─── Endpoint de Reparo e Diagnóstico Atômico ───────────────
// Executa manutenções críticas no banco e filesystem sem deletar dados.
// API Admin atomic repair
/**
 * Chave do reparo atômico (header X-Repair-Key contra REPAIR_KEY do .env).
 * Não usa JWT de propósito: a rota existe para quando o login está quebrado.
 * Sem REPAIR_KEY configurada a rota fica desligada (404).
 */
function repairKeyMatches(req) {
  return secretMatches(process.env.REPAIR_KEY, req.headers['x-repair-key']);
}

app.post('/api/admin/repair-atomic', async (req, res) => {
  if (!String(process.env.REPAIR_KEY || '').trim()) return res.status(404).json({ error: 'Not found' });
  if (!repairKeyMatches(req)) return res.status(401).json({ error: 'Chave de reparo inválida' });

  try {
    // Público só com a chave secreta no header (X-Repair-Key), para permitir
    // recuperação quando o JWT está expirado/inválido.
    const results = [];

    // 1. Garantir colunas do CRM (Geladeira, etc)
    results.push({ task: 'ensure_crm_columns', status: 'started' });
    await ensureCrmLeadsColumns().catch(e => results.push({ task: 'ensure_crm_columns', error: e.message }));
    
    // Ensure Structure column on expenses
    results.push({ task: 'ensure_expense_structure_column', status: 'started' });
    await ensureExpenseStructureColumn().catch(e => results.push({ task: 'ensure_expense_structure_column', error: e.message }));

    // Ensure Warehouse tables
    results.push({ task: 'ensure_warehouse_tables', status: 'started' });
    await ensureWarehouseTables().catch(e => results.push({ task: 'ensure_warehouse_tables', error: e.message }));

    // 2. Garantir tabelas do Auth (Se existirem)
    results.push({ task: 'check_auth_tables', status: 'started' });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.auth_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        last_sign_in timestamptz
      );
      CREATE TABLE IF NOT EXISTS public.user_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        role text NOT NULL,
        created_at timestamptz DEFAULT now(),
        UNIQUE(user_id, role)
      );
      ALTER TABLE public.user_roles 
      DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey,
      ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
    `).catch(e => results.push({ task: 'check_auth_tables', error: e.message }));

    // 3. Reparar permissões (Crucial para erro 502/401 se o user perdeu acesso)
    results.push({ task: 'repair_permissions', status: 'started' });
    const dbUser = process.env.PG_USER || process.env.PGUSER || 'pulse_user';
    const dbName = process.env.PG_DATABASE || process.env.PGDATABASE || 'pulse_db';
    
    // Tenta resetar o owner e privilégios de forma agressiva
    try {
      await pool.query(`ALTER TABLE IF EXISTS auth_users OWNER TO ${dbUser}`);
      await pool.query(`ALTER TABLE IF EXISTS user_roles OWNER TO ${dbUser}`);
      await pool.query(`ALTER TABLE IF EXISTS profiles OWNER TO ${dbUser}`);
      await pool.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${dbUser}`);
      await pool.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${dbUser}`);
      results.push({ task: 'repair_permissions', status: 'success' });
    } catch (e) {
      results.push({ task: 'repair_permissions', warning: e.message });
      // Fallback para quando não é superuser: tenta apenas grant
      await pool.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${dbUser}`).catch(() => {});
    }

    // 4. Sincronizar perfis órfãos (Crucial para erro 401)
    results.push({ task: 'sync_orphan_profiles', status: 'started' });
    await pool.query(`
      INSERT INTO auth_users (id, email, password_hash)
      SELECT p.id, p.email, p.password_hash 
      FROM profiles p
      WHERE p.email IS NOT NULL 
        AND p.password_hash IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM auth_users au WHERE au.id = p.id OR lower(au.email) = lower(p.email))
      ON CONFLICT DO NOTHING
    `).catch(e => results.push({ task: 'sync_orphan_profiles', error: e.message }));

    res.json({ success: true, results });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload', async (req, res) => {
  // Equipe logada: qualquer pasta, até 2 GB. Sem login: só a panfletagem do
  // portal do cliente (flyers/<id>, panfletagem/<id>), só mídia e até 500 MB.
  let isTeamUpload = false;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    isTeamUpload = await verifyUser(req).then(() => true).catch(() => false);
  }
  if (!isTeamUpload) req.uploadPublicScope = 'portal';
  const handler = isTeamUpload ? uploadHandler : publicUploadHandler;

  handler.single('file')(req, res, async (err) => {
    if (err) {
      console.error('[upload] error:', err);
      return res.status(uploadErrorStatus(err)).json({
        error: err.code === 'ENOSPC'
          ? 'Sem espaço disponível para armazenar o arquivo'
          : err.message || 'Falha no upload',
        code: err.code || 'UPLOAD_ERROR',
      });
    }
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    try {
      const relative = path
        .relative(path.resolve(UPLOAD_ROOT), req.file.path)
        .split(path.sep)
        .join('/');

      // Obter colunas JSON explicitamente para evitar ReferenceError caso a tabela precise ser mapeada
      const jsonCols = await getTableJsonColumns('client_portal_contents').catch(() => new Set());

      res.json({
        path: relative,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        // URL completa, como o upload-server antigo devolvia (bio links e treinamento gravam o url direto)
        url: `${String(process.env.PUBLIC_UPLOADS_URL || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '')}/${relative}`,
      });
    } catch (error) {
      console.error('[upload:process] error:', error);
      res.status(500).json({ error: 'Erro ao processar metadados do upload' });
    }
  });
});

app.delete('/api/upload', express.json(), async (req, res) => {
  try {
    await verifyUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Aceita a URL completa (o EditorDashboard manda https://agenciapulse.tech/uploads/...)
    const relative = uploadDeleteRelativePath(req.body?.path);
    if (!relative) return res.status(400).json({ error: 'Caminho inválido' });
    const publicPath = `/uploads/${relative}`;

    // Troca de vídeo: o mesmo arquivo pode estar publicado no portal do cliente.
    if (req.body?.keep_if_referenced) {
      const { rows } = await pool.query(
        `SELECT 1 FROM client_portal_contents
          WHERE right(coalesce(file_url, ''), length($1)) = $1
             OR right(coalesce(thumbnail_url, ''), length($1)) = $1
          LIMIT 1`,
        [publicPath]
      );
      if (rows.length > 0) return res.json({ success: true, removed: false, skipped: 'referenced' });
      // Versões entregues pelos agentes (histórico de edição) também apontam para o arquivo.
      // Sem a tabela (agentes nunca usados), o erro vira "sem referência".
      const { rows: versionRows } = await pool.query(
        `SELECT 1 FROM edit_versions
          WHERE right(coalesce(video_url, ''), length($1)) = $1
          LIMIT 1`,
        [publicPath]
      ).catch(() => ({ rows: [] }));
      if (versionRows.length > 0) return res.json({ success: true, removed: false, skipped: 'referenced' });
    }

    let removed = 0;
    for (const root of uploadRoots()) {
      const candidate = path.resolve(root, relative);
      if (!candidate.startsWith(`${root}${path.sep}`)) continue;
      if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
      fs.unlinkSync(candidate);
      removed += 1;
    }
    if (removed === 0) return res.status(404).json({ error: 'Arquivo não encontrado', removed: false });
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error('[upload:delete] error:', error);
    res.status(500).json({ error: error.message || 'Falha ao remover arquivo' });
  }
});

// Busca REAL de empresas via OpenStreetMap (Overpass API) — sem chave de API.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];


const NICHE_OSM_FILTERS = {
  varejo: ['["shop"]'],
  saude: ['["amenity"~"clinic|doctors|dentist|pharmacy|hospital|veterinary"]', '["healthcare"]'],
  aliment: ['["amenity"~"restaurant|cafe|fast_food|bar|ice_cream|pub"]', '["shop"~"bakery|butcher|confectionery|supermarket"]'],
  serviços: ['["office"]', '["shop"~"hairdresser|beauty|laundry|travel_agency"]', '["amenity"~"gym|fitness_centre"]'],
  indústria: ['["man_made"="works"]', '["industrial"]', '["landuse"="industrial"]["name"]'],
  construção: ['["shop"~"hardware|doityourself|trade|building_materials"]', '["craft"~"builder|carpenter|electrician|plumber"]'],
  agro: ['["shop"~"agrarian|farm"]', '["craft"="agricultural_engines"]', '["landuse"="farmyard"]["name"]'],
  automotiv: ['["shop"~"car|car_repair|car_parts|tyres|motorcycle"]', '["amenity"="fuel"]'],
  all: [
    '["shop"]',
    '["office"]',
    '["craft"]',
    '["healthcare"]',
    '["amenity"]["name"]',
    '["tourism"~"hotel|motel|guest_house|apartment|hostel|attraction"]',
    '["leisure"]["name"]',
    '["building"~"commercial|retail|industrial"]["name"]',
    '["company"]',
  ],
};

const normalizeText = (v) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

async function runOverpass(query) {
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'PulseGrowthMarketing/1.0 (CRM lead harvest)',
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await response.text();
      if (!response.ok || !text.trim().startsWith('{')) {
        lastError = new Error(`Overpass ${response.status} em ${endpoint}`);
        continue;
      }
      return JSON.parse(text);

    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Falha ao consultar a base de empresas');
}

// Ticket médio estimado por nicho (usado como "potencial de investimento" do lead)
const NICHE_TICKET_ESTIMATE = {
  varejo: 1200,
  saude: 2500,
  aliment: 1500,
  'serviços': 1800,
  'indústria': 3500,
  'construção': 2200,
  agro: 3000,
  automotiv: 2000,
  all: 1500,
};

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

function toWhatsappLink(phone) {
  const d = digitsOnly(phone);
  if (d.length < 10) return '';
  const withCountry = d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${withCountry}`;
}

function pickSocial(tags, key) {
  const raw = tags[`contact:${key}`] || tags[key] || '';
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = String(raw).replace(/^@/, '').trim();
  return handle ? `https://${key}.com/${handle}` : '';
}

function osmElementToCompany(el, niche) {
  const tags = el.tags || {};
  const name = tags.name || tags['operator'] || tags['brand'];
  if (!name) return null;

  const atuacao = tags.shop || tags.amenity || tags.office || tags.craft || tags.healthcare || tags.industrial || tags.tourism || 'Empresa';
  const bairro = tags['addr:suburb'] || tags['addr:neighbourhood'] || tags['addr:district'] || '';
  const enderecoParts = [
    [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', '),
    bairro,
    tags['addr:city'],
  ].filter(Boolean);

  const telefones = [tags.phone, tags['contact:phone'], tags['contact:mobile'], tags['phone:mobile']]
    .filter(Boolean)
    .flatMap(p => String(p).split(/[;,]/))
    .map(p => p.trim())
    .filter((p, i, arr) => p && arr.indexOf(p) === i);

  const telefone = telefones[0] || '';
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;
  const website = tags.website || tags['contact:website'] || tags.url || '';
  const email = tags.email || tags['contact:email'] || '';
  const instagram = pickSocial(tags, 'instagram');
  const facebook = pickSocial(tags, 'facebook');

  // Score de qualificação (0-100) — quanto mais dados de contato, mais quente o lead
  let score = 20;
  if (telefone) score += 30;
  if (email) score += 15;
  if (website) score += 10;
  if (instagram || facebook) score += 10;
  if (enderecoParts.length) score += 10;
  if (tags['opening_hours']) score += 5;
  score = Math.min(score, 100);

  const ticket = NICHE_TICKET_ESTIMATE[niche] || NICHE_TICKET_ESTIMATE.all;
  // Sem site/redes = maior necessidade de marketing => potencial maior
  const multiplicador = (!website && !instagram && !facebook) ? 1.3 : 1;

  return {
    id: `${el.type}/${el.id}`,
    razao_social: name,
    cnpj: extractCnpj(tags),
    decisor: tags['contact:person'] || '',
    decisor_cargo: tags['contact:person'] ? 'Responsável (OSM)' : '',
    fontes: ['openstreetmap'],
    contato: tags['contact:person'] || tags.operator || name,
    email,
    telefone,
    telefones,
    whatsapp: toWhatsappLink(telefone),
    atuacao: String(atuacao).replace(/_/g, ' '),
    categoria: [tags.shop, tags.amenity, tags.office, tags.craft, tags.healthcare, tags.cuisine]
      .filter(Boolean).map(v => String(v).replace(/_/g, ' ')).join(' / '),
    endereco: enderecoParts.join(' - ') || tags['addr:full'] || '',
    bairro,
    cep: tags['addr:postcode'] || '',
    website,
    instagram,
    facebook,
    horario: tags['opening_hours'] || '',
    marca: tags.brand || '',
    cidade: tags['addr:city'] || '',
    lat,
    lon,
    maps_url: lat && lon ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : '',
    score,
    potencial_mensal: Math.round(ticket * multiplicador),
    tem_contato: Boolean(telefone || email),
  };
}

// Resolve a cidade em uma área OSM (qualquer cidade do Brasil), com fallback via Nominatim
const AREA_CACHE = new Map();

// Resolve a cidade via Nominatim → id de área OSM + bounding box (fallback confiável)
async function resolveSearchArea(areaName, state) {
  const cacheKey = normalizeText(`${areaName}|${state}`);
  if (AREA_CACHE.has(cacheKey)) return AREA_CACHE.get(cacheKey);

  const escapedArea = areaName.replace(/"/g, '\\"');
  const escapedState = String(state || '').replace(/"/g, '\\"');
  const fallbackBlock = escapedState
    ? `area["name"~"^${escapedState}$",i]["boundary"="administrative"]->.state;
area["name"~"^${escapedArea}$",i]["boundary"="administrative"](area.state)->.searchArea;`
    : `area["name"~"^${escapedArea}$",i]["boundary"="administrative"]->.searchArea;`;

  let resolved = { areaBlock: fallbackBlock, bbox: null };

  try {
    const q = [areaName, state, 'Brasil'].filter(Boolean).join(', ');
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'PulseGrowthMarketing/1.0 (CRM lead harvest)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const arr = await resp.json();
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (hit) {
      const bb = (hit.boundingbox || []).map(Number);
      const bbox = bb.length === 4 && bb.every(n => Number.isFinite(n))
        ? { south: bb[0], north: bb[1], west: bb[2], east: bb[3] }
        : null;
      if (hit.osm_type === 'relation') {
        resolved = { areaBlock: `area(${3600000000 + Number(hit.osm_id)})->.searchArea;`, bbox };
      } else {
        resolved = { areaBlock: fallbackBlock, bbox };
      }
    }
  } catch (err) {
    console.warn('[crm:harvest] nominatim fallback:', err.message);
  }

  AREA_CACHE.set(cacheKey, resolved);
  return resolved;
}

// ===================== Enriquecimento de contatos (multi-fonte) =====================
// Fontes usadas, todas públicas e sem chave de API:
//  1) OpenStreetMap (tags de contato) — base primária
//  2) BrasilAPI / ReceitaWS (CNPJ) — sócios (decisor), telefone e e-mail oficiais
//  3) Site oficial da empresa — varredura de tel:, mailto: e wa.me

const ENRICH_CACHE = new Map();
const ENRICH_CACHE_MAX = 5000;

async function fetchJsonSafe(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'PulseGrowthMarketing/1.0 (CRM lead enrichment)' },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractCnpj(tags = {}) {
  const raw = tags['ref:vatin'] || tags['ref:cnpj'] || tags['cnpj'] || tags['ref:CNPJ'] || '';
  const digits = String(raw).replace(/\D/g, '').replace(/^55(?=\d{14}$)/, '');
  return digits.length === 14 ? digits : '';
}

// Consulta o CNPJ e devolve o quadro societário (decisor) + contatos oficiais
async function fetchCnpjData(cnpj) {
  const data =
    (await fetchJsonSafe(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)) ||
    (await fetchJsonSafe(`https://publica.cnpj.ws/cnpj/${cnpj}`));
  if (!data) return null;

  const socios = Array.isArray(data.qsa) ? data.qsa : (data.socios || []);
  const principal = socios[0] || null;
  const ddd = data.ddd_telefone_1 || '';
  const telefone = ddd
    ? String(ddd)
    : [data.ddd_1, data.telefone_1].filter(Boolean).join('');

  return {
    cnpj,
    razao_social_oficial: data.razao_social || data.nome || '',
    decisor: principal?.nome_socio || principal?.nome || '',
    decisor_cargo: principal?.qualificacao_socio || principal?.qualificacao || 'Sócio / Responsável',
    socios: socios.slice(0, 5).map(s => s.nome_socio || s.nome).filter(Boolean),
    telefones: [telefone, data.ddd_telefone_2].filter(Boolean).map(String),
    email: data.email || '',
    capital_social: data.capital_social || null,
    porte: data.porte || data.descricao_porte || '',
    abertura: data.data_inicio_atividade || data.data_abertura || '',
  };
}

// ---------- Utilitários de telefone BR ----------
const DDDS_VALIDOS = new Set([
  11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,
  47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,
  86,87,88,89,91,92,93,94,95,96,97,98,99,
]);

function normalizePhoneBR(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return '';
  if (!DDDS_VALIDOS.has(Number(d.slice(0, 2)))) return '';
  if (d.length === 11 && d[2] !== '9') return '';
  return d;
}

function extractPhonesFromText(text = '') {
  const out = [];
  const re = /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g;
  for (const m of String(text).matchAll(re)) {
    const p = normalizePhoneBR(m[0]);
    if (p && !out.includes(p)) out.push(p);
    if (out.length >= 6) break;
  }
  return out;
}

function extractEmailsFromText(text = '') {
  return Array.from(String(text).matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g))
    .map(m => m[0].toLowerCase())
    .filter(e => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e))
    .filter(e => !/(sentry|wixpress|example|domain|email)\.(com|io)$/i.test(e))
    .filter((e, i, arr) => arr.indexOf(e) === i)
    .slice(0, 4);
}

// ─── Busca de páginas externas sem SSRF ───
// O site vem do corpo do enriquecimento: nunca deixar a VPS acessar a própria
// rede (127.0.0.1:3002, Postgres, metadados da nuvem...). O IP é conferido no
// momento da conexão (lookup próprio), então DNS rebinding também não passa.
function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127) // CGNAT
      || (a === 169 && b === 254) // link-local / metadados
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower);
  }
  return true;
}

function publicOnlyLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options?.family || 4 }];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error(`Endereço bloqueado: ${hostname}`), { code: 'EBLOCKEDHOST' }));
    }
    if (options?.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

function isAllowedExternalUrl(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && !['80', '443'].includes(url.port)) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateAddress(host)) return false;
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) return false;
  return true;
}

function requestExternalText(url, timeoutMs) {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, {
      lookup: publicOnlyLookup,
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PulseGrowthBot/1.0; +https://pulsegrowthmarketing.com)',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }, (resp) => {
      const status = resp.statusCode || 0;
      if (status >= 300 && status < 400 && resp.headers.location) {
        resp.resume();
        return resolve({ redirect: resp.headers.location });
      }
      if (status < 200 || status >= 300) {
        resp.resume();
        return resolve(null);
      }
      const encoding = String(resp.headers['content-encoding'] || '').toLowerCase();
      let stream = resp;
      if (encoding.includes('br')) stream = resp.pipe(zlib.createBrotliDecompress());
      else if (encoding.includes('gzip')) stream = resp.pipe(zlib.createGunzip());
      else if (encoding.includes('deflate')) stream = resp.pipe(zlib.createInflate());
      const chunks = [];
      let size = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve({ text: Buffer.concat(chunks).toString('utf8').slice(0, 500000) });
      };
      stream.on('data', (chunk) => {
        chunks.push(chunk);
        size += chunk.length;
        // Mesmo teto de antes (500 mil caracteres): corta o download aí
        if (size > 600000) {
          finish();
          req.destroy();
        }
      });
      stream.on('end', finish);
      stream.on('error', () => { if (!done) { done = true; resolve(null); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
  });
}

async function fetchTextSafe(url, timeoutMs = 9000) {
  const deadline = Date.now() + timeoutMs;
  try {
    let current = new URL(url);
    // Redirecionamentos seguidos à mão (até 3), revalidando cada destino
    for (let hop = 0; hop <= 3; hop += 1) {
      if (!isAllowedExternalUrl(current)) return null;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      const result = await requestExternalText(current, remaining);
      if (!result) return null;
      if (result.redirect) {
        current = new URL(result.redirect, current);
        continue;
      }
      return result.text;
    }
    return null;
  } catch {
    return null;
  }
}

// Varre o site oficial (home + páginas de contato) atrás de telefone, e-mail, WhatsApp e redes
async function scrapeSiteContacts(website) {
  const base = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  let root;
  try { root = new URL(base); } catch { return null; }

  const paths = ['', '/contato', '/contatos', '/fale-conosco', '/sobre', '/quem-somos', '/contact'];
  const emails = [];
  const telefones = [];
  const whats = [];
  let instagram = '';
  let facebook = '';
  let achou = false;

  for (const p of paths) {
    const html = await fetchTextSafe(new URL(p, root).toString());
    if (!html) continue;
    achou = true;

    extractEmailsFromText(html).forEach(e => { if (!emails.includes(e)) emails.push(e); });

    for (const m of html.matchAll(/tel:\+?([\d\s().-]{8,20})/gi)) {
      const n = normalizePhoneBR(m[1]);
      if (n && !telefones.includes(n)) telefones.push(n);
    }
    for (const m of html.matchAll(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d{10,15})/gi)) {
      const n = normalizePhoneBR(m[1]);
      if (n && !whats.includes(n)) whats.push(n);
    }
    // Texto visível: pega telefones escritos sem link
    const visivel = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
    extractPhonesFromText(visivel).forEach(n => { if (!telefones.includes(n)) telefones.push(n); });

    if (!instagram) {
      const ig = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})/i);
      if (ig && !/^(p|reel|explore)$/i.test(ig[1])) instagram = `https://instagram.com/${ig[1]}`;
    }
    if (!facebook) {
      const fb = html.match(/https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.-]{3,40})/i);
      if (fb && !/^(sharer|plugins|tr)$/i.test(fb[1])) facebook = `https://facebook.com/${fb[1]}`;
    }

    if (telefones.length && emails.length) break;
  }

  if (!achou || (!emails.length && !telefones.length && !whats.length && !instagram && !facebook)) return null;
  return { emails, telefones: Array.from(new Set([...whats, ...telefones])), whatsapp: whats[0] || '', instagram, facebook };
}

// Busca aberta na web (DuckDuckGo HTML + Bing) para achar telefone de quem não tem site
async function searchWebContacts(name, cidade) {
  const q = encodeURIComponent(`"${name}" ${cidade || ''} telefone contato whatsapp`);
  const urls = [
    `https://html.duckduckgo.com/html/?q=${q}`,
    `https://lite.duckduckgo.com/lite/?q=${q}`,
    `https://www.bing.com/search?q=${q}&setlang=pt-br`,
  ];
  const telefones = [];
  const emails = [];
  let instagram = '';

  for (const url of urls) {
    const html = await fetchTextSafe(url, 8000);
    if (!html) continue;
    const texto = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
    extractPhonesFromText(texto).forEach(n => { if (!telefones.includes(n)) telefones.push(n); });
    extractEmailsFromText(texto).forEach(e => { if (!emails.includes(e)) emails.push(e); });
    if (!instagram) {
      const ig = html.match(/instagram\.com\/([A-Za-z0-9_.]{3,30})/i);
      if (ig && !/^(p|reel|explore|accounts)$/i.test(ig[1])) instagram = `https://instagram.com/${ig[1]}`;
    }
    if (telefones.length) break;
  }

  if (!telefones.length && !emails.length && !instagram) return null;
  return { telefones, emails, instagram };
}

// Registra a origem de cada dado (valor, fonte, data, confiança) — exigido para auditoria
function registrarOrigem(origem, campo, valor, fonte) {
  if (!valor) return;
  const atual = origem[campo];
  if (atual) {
    if (!atual.fontes.includes(fonte)) atual.fontes.push(fonte);
    atual.confianca = atual.fontes.length >= 3 ? 'confirmado'
      : atual.fontes.length === 2 ? 'alta' : atual.confianca;
    return;
  }
  origem[campo] = {
    valor: String(valor),
    fontes: [fonte],
    coletado_em: new Date().toISOString(),
    confianca: fonte === 'receita-federal' ? 'confirmado'
      : fonte === 'site-oficial' ? 'alta'
      : fonte === 'openstreetmap' ? 'media' : 'baixa',
  };
}

async function enrichCompany(company, opts = {}) {
  // O resultado depende do site e do CNPJ enviados: entram na chave para um
  // pedido com site falso não contaminar o cache do id real.
  const cacheKey = `${company.id}|${company.website || ''}|${company.cnpj || ''}`;
  const cacheHit = ENRICH_CACHE.get(cacheKey);
  if (cacheHit && opts.force !== true) {
    return { ...company, ...cacheHit, cache: true };
  }

  const patch = { fontes: ['openstreetmap'] };
  const origem = { ...(company.origem || {}) };
  const historico = [...(company.historico || [])];
  const log = (evento) => historico.push({ evento, em: new Date().toISOString() });
  const erros = [];

  if (!historico.length) log('Empresa encontrada na base pública (OpenStreetMap)');
  if (company.telefone) registrarOrigem(origem, 'telefone', company.telefone, 'openstreetmap');
  if (company.email) registrarOrigem(origem, 'email', company.email, 'openstreetmap');
  if (company.website) registrarOrigem(origem, 'website', company.website, 'openstreetmap');
  if (company.instagram) registrarOrigem(origem, 'instagram', company.instagram, 'openstreetmap');
  if (company.endereco) registrarOrigem(origem, 'endereco', company.endereco, 'openstreetmap');

  const telefones = new Set((company.telefones || []).map(normalizePhoneBR).filter(Boolean));
  let email = company.email || '';

  // 1) Receita Federal via CNPJ (sócio/decisor + contatos oficiais)
  if (company.cnpj) {
    try {
      const cnpjData = await fetchCnpjData(company.cnpj);
      if (cnpjData) {
        patch.fontes.push('receita-federal');
        patch.decisor = cnpjData.decisor || '';
        patch.decisor_cargo = cnpjData.decisor_cargo || '';
        patch.socios = cnpjData.socios;
        patch.capital_social = cnpjData.capital_social;
        patch.porte = cnpjData.porte;
        patch.razao_social_oficial = cnpjData.razao_social_oficial;
        registrarOrigem(origem, 'cnpj', company.cnpj, 'receita-federal');
        if (cnpjData.decisor) {
          registrarOrigem(origem, 'decisor', cnpjData.decisor, 'receita-federal');
          log(`Responsável identificado: ${cnpjData.decisor}`);
        }
        if (!email && cnpjData.email) {
          email = cnpjData.email;
          registrarOrigem(origem, 'email', email, 'receita-federal');
        }
        cnpjData.telefones.forEach(t => {
          const n = normalizePhoneBR(t);
          if (n) { telefones.add(n); registrarOrigem(origem, 'telefone', formatPhoneBR(n), 'receita-federal'); }
        });
      }
    } catch (err) {
      erros.push({ fonte: 'receita-federal', erro: err.message });
    }
  }

  // 2) Site oficial (home + páginas de contato)
  if (company.website && (!telefones.size || !email)) {
    try {
      const site = await scrapeSiteContacts(company.website);
      if (site) {
        patch.fontes.push('site-oficial');
        if (!email && site.emails.length) {
          email = site.emails[0];
          registrarOrigem(origem, 'email', email, 'site-oficial');
        }
        patch.emails_extras = site.emails.slice(1);
        site.telefones.forEach(t => {
          telefones.add(t);
          registrarOrigem(origem, 'telefone', formatPhoneBR(t), 'site-oficial');
        });
        if (site.whatsapp) {
          patch.whatsapp_status = 'confirmado';
          patch.whatsapp = toWhatsappLink(site.whatsapp);
          registrarOrigem(origem, 'whatsapp', formatPhoneBR(site.whatsapp), 'site-oficial');
          log('WhatsApp encontrado no site oficial');
        }
        if (!company.instagram && site.instagram) {
          patch.instagram = site.instagram;
          registrarOrigem(origem, 'instagram', site.instagram, 'site-oficial');
        }
        if (!company.facebook && site.facebook) patch.facebook = site.facebook;
      }
    } catch (err) {
      erros.push({ fonte: 'site-oficial', erro: err.message });
    }
  }

  // 3) Busca aberta na web — apenas no modo profundo ou quando não há contato algum
  if (!telefones.size && opts.webSearch !== false) {
    try {
      const web = await searchWebContacts(company.razao_social, company.cidade);
      if (web) {
        patch.fontes.push('busca-web');
        web.telefones.forEach(t => {
          telefones.add(t);
          registrarOrigem(origem, 'telefone', formatPhoneBR(t), 'busca-web');
        });
        if (!email && web.emails.length) {
          email = web.emails[0];
          registrarOrigem(origem, 'email', email, 'busca-web');
        }
        if (!company.instagram && web.instagram) {
          patch.instagram = web.instagram;
          registrarOrigem(origem, 'instagram', web.instagram, 'busca-web');
        }
      }
    } catch (err) {
      erros.push({ fonte: 'busca-web', erro: err.message });
    }
  }

  const lista = Array.from(telefones);
  if (lista.length) {
    patch.telefones = lista.map(formatPhoneBR);
    patch.telefone = patch.telefones[0];
    log(`Telefone encontrado: ${patch.telefone}`);
    // Celular (11 dígitos iniciando com 9) => WhatsApp apenas "provável", nunca afirmado
    const celular = lista.find(d => d.length === 11);
    if (!patch.whatsapp && celular) {
      patch.whatsapp = toWhatsappLink(celular);
      patch.whatsapp_status = 'provavel';
    }
  }
  if (!patch.whatsapp && company.whatsapp) {
    patch.whatsapp = company.whatsapp;
    patch.whatsapp_status = company.whatsapp_status || 'provavel';
  }
  if (email) {
    patch.email = email;
    log(`E-mail encontrado: ${email}`);
  }

  patch.contato = patch.decisor || company.contato;
  patch.tem_contato = Boolean(patch.telefone || company.telefone || email);
  patch.origem = origem;
  patch.historico = historico;
  patch.erros_fontes = erros;
  patch.enriquecido_em = new Date().toISOString();

  ENRICH_CACHE.delete(cacheKey);
  ENRICH_CACHE.set(cacheKey, patch);
  // Teto de memória: descarta os mais antigos
  while (ENRICH_CACHE.size > ENRICH_CACHE_MAX) {
    ENRICH_CACHE.delete(ENRICH_CACHE.keys().next().value);
  }
  return { ...company, ...patch, cache: false };
}

const CAMPOS_COMPLETUDE = [
  'cnpj', 'razao_social', 'telefone', 'whatsapp', 'email',
  'instagram', 'website', 'decisor', 'endereco',
];

// Score comercial (0-100), completude e nível de confiança consolidado
function finalizeLead(company, niche) {
  const preenchidos = CAMPOS_COMPLETUDE.filter(f => Boolean(company[f]));
  const completude = Math.round((preenchidos.length / CAMPOS_COMPLETUDE.length) * 100);

  let score = 0;
  if (company.telefone) score += 20;
  if (company.whatsapp) score += company.whatsapp_status === 'confirmado' ? 20 : 12;
  if (company.instagram) score += 15;
  if (company.website) score += 10;
  if (company.decisor) score += 15;
  if (company.email) score += 10;
  if (niche && niche !== 'all' && normalizeText(company.categoria || company.atuacao).includes(normalizeText(niche))) {
    score += 10;
  }
  score = Math.min(100, score);

  const classificacao = score >= 80 ? 'quente' : score >= 60 ? 'bom' : score >= 40 ? 'moderado' : 'fraco';

  const origem = company.origem || {};
  const niveis = Object.values(origem).map(o => o.confianca);
  const peso = { confirmado: 4, alta: 3, media: 2, baixa: 1 };
  const media = niveis.length
    ? niveis.reduce((s, n) => s + (peso[n] || 1), 0) / niveis.length
    : 0;
  const confianca = media >= 3.5 ? 'confirmado' : media >= 2.5 ? 'alta' : media >= 1.5 ? 'media' : media > 0 ? 'baixa' : 'nao_confirmado';

  return {
    ...company,
    score,
    completude,
    classificacao,
    confianca,
    tem_decisor: Boolean(company.decisor),
    pronto_para_contato: Boolean(company.telefone || company.whatsapp || company.email),
  };
}

// Similaridade de nomes para deduplicação (tokens em comum)
function nameSimilarity(a, b) {
  const clean = (v) => normalizeText(v).replace(/\b(ltda|me|epp|eireli|sa|s\/a|comercio|clinica|servicos)\b/g, ' ');
  const ta = new Set(clean(a).split(/\W+/).filter(t => t.length > 2));
  const tb = new Set(clean(b).split(/\W+/).filter(t => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach(t => { if (tb.has(t)) inter++; });
  return inter / Math.min(ta.size, tb.size);
}

// Deduplica por CNPJ e, na ausência dele, por similaridade de nome + endereço/telefone
function dedupeCompanies(companies) {
  const porCnpj = new Map();
  const restantes = [];
  for (const c of companies) {
    if (c.cnpj) {
      const existente = porCnpj.get(c.cnpj);
      if (!existente) porCnpj.set(c.cnpj, c);
      else porCnpj.set(c.cnpj, { ...existente, ...c });
    } else {
      restantes.push(c);
    }
  }

  const finais = Array.from(porCnpj.values());
  for (const c of restantes) {
    const dup = finais.find(f =>
      nameSimilarity(f.razao_social, c.razao_social) >= 0.8 &&
      (
        normalizeText(f.endereco) === normalizeText(c.endereco) ||
        (f.telefone && f.telefone === c.telefone) ||
        (f.website && f.website === c.website)
      )
    );
    if (!dup) finais.push(c);
  }
  return finais;
}

function harvestStats(companies) {
  const total = companies.length;
  const soma = (fn) => companies.filter(fn).length;
  return {
    total,
    com_telefone: soma(c => Boolean(c.telefone)),
    com_whatsapp: soma(c => Boolean(c.whatsapp)),
    com_instagram: soma(c => Boolean(c.instagram)),
    com_email: soma(c => Boolean(c.email)),
    com_decisor: soma(c => Boolean(c.decisor)),
    com_site: soma(c => Boolean(c.website)),
    prontos: soma(c => c.pronto_para_contato),
    enriquecidos: soma(c => Boolean(c.enriquecido_em)),
    completude_media: total ? Math.round(companies.reduce((s, c) => s + (c.completude || 0), 0) / total) : 0,
    score_medio: total ? Math.round(companies.reduce((s, c) => s + (c.score || 0), 0) / total) : 0,
    taxa_enriquecimento: total ? Math.round((soma(c => c.pronto_para_contato) / total) * 100) : 0,
  };
}


function formatPhoneBR(d) {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

// Enriquecimento com paralelismo controlado (evita bloqueio das fontes públicas)
async function enrichCompanies(companies, maxItems = 400, concurrency = 10, opts = {}) {
  // Prioriza quem está sem contato — objetivo é não deixar empresa sem telefone
  const alvo = companies
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => c.cnpj || c.website || !c.tem_contato)
    .sort((a, b) => Number(a.c.tem_contato) - Number(b.c.tem_contato))
    .slice(0, maxItems);

  const out = [...companies];
  let cursor = 0;

  const worker = async () => {
    while (cursor < alvo.length) {
      const item = alvo[cursor++];
      try {
        out[item.index] = await enrichCompany(item.c, opts);
      } catch (err) {
        console.warn('[crm:harvest] enrich falhou:', err.message);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, alvo.length) }, worker));
  return out;
}


// Elementos brutos do Overpass por área + estado + nicho + limite (15 min): Anterior/Próxima e
// os filtros de contato/termo/completude não refazem as duas consultas (até 30 s cada, com
// risco de rate limit). Os filtros continuam rodando a cada chamada.
const HARVEST_ELEMENTS_CACHE = new Map();
const HARVEST_ELEMENTS_TTL_MS = 15 * 60 * 1000;
const HARVEST_ELEMENTS_MAX = 20;

app.post('/api/crm/harvest/search', async (req, res) => {
  try {
    await verifyUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { city, location, niche, term, limit, state, onlyWithContact } = req.body || {};

    const cityName = city && city !== 'all' ? String(city).trim() : '';
    const locationText = String(location || '').trim();
    // Qualquer cidade é aceita: a área da busca é a cidade informada; se vazia, usa a localização livre.
    const areaName = cityName || locationText;
    const locationFilter = cityName && locationText ? locationText : '';
    if (!areaName) {
      return res.status(400).json({ error: 'Informe a cidade ou a localização para buscar empresas reais.' });
    }

    const filters = NICHE_OSM_FILTERS[niche] || NICHE_OSM_FILTERS.all;
    const { areaBlock, bbox } = await resolveSearchArea(areaName, state);

    const cap = Math.min(Math.max(Number(limit) || 2000, 1), 5000);

    const buildQuery = (scope) => {
      const body = filters
        .map(f => `  node${f}${scope};\n  way${f}${scope};\n  relation${f}${scope};`)
        .join('\n');
      return `[out:json][timeout:120];\n${scope === '(area.searchArea)' ? areaBlock : ''}\n(\n${body}\n);\nout center ${cap};`;
    };

    // Combina a área administrativa com o bounding box. Algumas cidades têm relações OSM
    // incompletas; consultar somente uma das fontes pode devolver apenas poucos registros.
    const elementsKey = [normalizeText(areaName), normalizeText(String(state || '')), String(niche || 'all'), cap].join('|');
    const cachedElements = HARVEST_ELEMENTS_CACHE.get(elementsKey);
    let elements = [];
    if (cachedElements && Date.now() - cachedElements.at < HARVEST_ELEMENTS_TTL_MS) {
      elements = cachedElements.elements;
    } else {
      try {
        const json = await runOverpass(buildQuery('(area.searchArea)'));
        elements = Array.isArray(json?.elements) ? json.elements : [];
      } catch (err) {
        console.warn('[crm:harvest] area query falhou:', err.message);
      }

      if (bbox) {
        try {
          const scope = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
          const json = await runOverpass(buildQuery(scope));
          const bboxEls = Array.isArray(json?.elements) ? json.elements : [];
          const byOsmId = new Map(elements.map(element => [`${element.type}/${element.id}`, element]));
          bboxEls.forEach(element => byOsmId.set(`${element.type}/${element.id}`, element));
          elements = Array.from(byOsmId.values());
        } catch (err) {
          console.warn('[crm:harvest] bbox query falhou:', err.message);
        }
      }

      // Só guarda resultado de verdade (consulta que falhou não fica no cache).
      if (elements.length > 0) {
        HARVEST_ELEMENTS_CACHE.delete(elementsKey);
        HARVEST_ELEMENTS_CACHE.set(elementsKey, { at: Date.now(), elements });
        while (HARVEST_ELEMENTS_CACHE.size > HARVEST_ELEMENTS_MAX) {
          HARVEST_ELEMENTS_CACHE.delete(HARVEST_ELEMENTS_CACHE.keys().next().value);
        }
      }
    }

    let companies = elements.map(el => osmElementToCompany(el, niche)).filter(Boolean);

    // Deduplicação (CNPJ + similaridade de nome/endereço/telefone)
    companies = dedupeCompanies(companies);

    if (locationFilter) {
      const l = normalizeText(locationFilter);
      companies = companies.filter(c =>
        normalizeText(c.endereco).includes(l) || normalizeText(c.bairro).includes(l)
      );
    }

    if (term) {
      const t = normalizeText(term);
      companies = companies.filter(c =>
        normalizeText(c.razao_social).includes(t) ||
        normalizeText(c.atuacao).includes(t) ||
        normalizeText(c.categoria).includes(t) ||
        normalizeText(c.endereco).includes(t)
      );
    }

    // Modos: "rapido" devolve os dados públicos imediatamente (sem enriquecimento bloqueante,
    // que estourava o timeout do proxy e deixava a tela sem resultados);
    // "profundo" enriquece um lote limitado antes de responder.
    const mode = req.body?.mode === 'profundo' ? 'profundo' : 'rapido';
    const enrichAtivo = req.body?.enrich === true || mode === 'profundo';
    if (enrichAtivo) {
      const limiteEnriquecimento = Math.min(
        Number(req.body?.enrichLimit) || 120,
        150,
      );
      try {
        companies = await enrichCompanies(
          companies,
          limiteEnriquecimento,
          Number(req.body?.enrichConcurrency) || 10,
          { webSearch: mode === 'profundo' && req.body?.webSearch !== false },
        );
      } catch (err) {
        console.warn('[crm:harvest] enriquecimento falhou, devolvendo dados base:', err.message);
      }
    }

    companies = companies.map(c => finalizeLead({ ...c, cidade: c.cidade || areaName }, niche));

    // Filtros de qualidade / prontidão para prospecção
    const contactFilter = String(req.body?.contactFilter || (onlyWithContact ? 'qualquer' : 'todos'));
    const filtroContato = {
      whatsapp: (c) => Boolean(c.whatsapp),
      telefone: (c) => Boolean(c.telefone),
      email: (c) => Boolean(c.email),
      instagram: (c) => Boolean(c.instagram),
      qualquer: (c) => c.pronto_para_contato,
      todos: () => true,
    }[contactFilter] || (() => true);
    companies = companies.filter(filtroContato);

    if (req.body?.onlyWithDecisor) companies = companies.filter(c => c.tem_decisor);
    const minScore = Number(req.body?.minScore) || 0;
    if (minScore) companies = companies.filter(c => (c.score || 0) >= minScore);
    const minCompletude = Number(req.body?.minCompletude) || 0;
    if (minCompletude) companies = companies.filter(c => (c.completude || 0) >= minCompletude);

    companies.sort((a, b) => b.score - a.score || a.razao_social.localeCompare(b.razao_social));

    const stats = harvestStats(companies);
    const pageSize = Math.min(Math.max(Number(req.body?.pageSize) || 100, 25), 1000);
    const page = Math.max(Number(req.body?.page) || 1, 1);
    const paginadas = companies.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      data: paginadas,
      source: 'openstreetmap',
      mode,
      area: areaName,
      page,
      page_size: pageSize,
      total_pages: Math.max(1, Math.ceil(companies.length / pageSize)),
      total: companies.length,
      com_contato: stats.prontos,
      stats,
      potencial_total: companies.reduce((s, c) => s + (c.potencial_mensal || 0), 0),
    });

  } catch (error) {
    console.error('[crm:harvest] error:', error);
    res.status(502).json({ error: error.message || 'Falha ao consultar a base pública de empresas' });
  }
});

// Enriquecimento sob demanda dos leads selecionados (botão "Enriquecer leads")
app.post('/api/crm/harvest/enrich', async (req, res) => {
  try {
    await verifyUser(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const entrada = Array.isArray(req.body?.companies) ? req.body.companies : [];
    if (!entrada.length) return res.status(400).json({ error: 'Nenhuma empresa enviada para enriquecimento.' });
    if (entrada.length > 200) return res.status(400).json({ error: 'Selecione no máximo 200 empresas por vez.' });

    const niche = req.body?.niche || 'all';
    const force = req.body?.force === true;
    const out = [...entrada];
    let cursor = 0;

    const worker = async () => {
      while (cursor < entrada.length) {
        const i = cursor++;
        try {
          out[i] = finalizeLead(await enrichCompany(entrada[i], { webSearch: true, force }), niche);
        } catch (err) {
          console.warn('[crm:harvest:enrich] falhou:', err.message);
          out[i] = finalizeLead(entrada[i], niche);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, entrada.length) }, worker));

    res.json({ data: out, stats: harvestStats(out) });
  } catch (error) {
    console.error('[crm:harvest:enrich] error:', error);
    res.status(502).json({ error: error.message || 'Falha ao enriquecer os leads' });
  }
});





// Cron-like task for CRM meeting reminders
setInterval(async () => {
  try {
    // Busca reuniões agendadas para amanhã (24h de antecedência) que ainda não tiveram lembrete enviado.
    // "Amanhã" no fuso de Brasília: o toISOString é UTC e, das 21h em diante, já pegava a reunião
    // de depois de amanhã com o texto "nossa reunião de amanhã". Como o job roda de hora em hora
    // desde a subida, só envia em horário comercial (9h às 19h59 de Brasília).
    const nowBrtMinutes = brtMinutesNow();
    if (nowBrtMinutes < 9 * 60 || nowBrtMinutes >= 20 * 60) return;
    const tomorrowStr = addDaysToDateString(brtDateString(), 1);

    const { rows: pendingReminders } = await pool.query(
      `SELECT id, name, phone, meeting_date, meeting_time, company 
       FROM crm_leads 
       WHERE status = 'meeting' 
         AND meeting_date = $1 
         AND reminder_sent_24h = FALSE 
         AND phone IS NOT NULL`,
      [tomorrowStr]
    );

    if (!pendingReminders.length) return;
    const { rows: [waConfig] } = await pool.query(`SELECT integration_active FROM whatsapp_config LIMIT 1`).catch(() => ({ rows: [] }));
    if (!waConfig?.integration_active) return;

    for (const lead of pendingReminders) {
      const message = `Olá ${lead.name}, aqui é da Agência Pulse! Passando para confirmar nossa reunião de amanhã às ${lead.meeting_time?.slice(0, 5)}. Podemos confirmar?`;
      // pela fila do WhatsApp próprio (conexão com a função "crm")
      await enqueueWhatsApp(pool, { to: lead.phone, body: message, triggerType: 'crm_reminder', purpose: 'crm',
        expiresAt: brasiliaDateTime(lead.meeting_date, lead.meeting_time) });
      await pool.query(`UPDATE crm_leads SET reminder_sent_24h = TRUE WHERE id = $1`, [lead.id]);
    }
  } catch (err) {
    console.error('[CRM-Reminder-Error]', err);
  }
}, 1000 * 60 * 60); // Roda a cada 1 hora

// ─── Contribuição pública (append-only) no Banco de Dados ───
// O cliente acessa via token compartilhado e pode APENAS adicionar:
// profissionais, unidades e mídias. Nenhuma rota aqui remove/edita dados.

/** Resolve o client_id de um token público ativo. Lança se inválido. */
async function resolveShareClientId(rawToken) {
  const token = String(rawToken || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!token) { const e = new Error('Token inválido'); e.status = 400; throw e; }
  await ensureClientDatabaseShareTable();
  const share = await pool.query(
    'SELECT client_id FROM client_database_shares WHERE token = $1 AND active = true LIMIT 1',
    [token],
  );
  if (share.rows.length === 0) { const e = new Error('Link inválido ou revogado'); e.status = 404; throw e; }
  return share.rows[0].client_id;
}

function sanitizeText(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/** Só URLs devolvidas pelo upload público do banco (/uploads/client-database/...), até 30. */
function publicClientDbMediaUrls(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((u) => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => /^\/uploads\/client-database\/[^\s?#]+$/.test(u) && !u.includes('..'))
    .slice(0, 30);
}

/** Upload público de mídia, restrito a um token de compartilhamento válido. */
app.post('/api/public/client-database/:token/upload', async (req, res) => {
  // Valida o token ANTES de gravar qualquer coisa no disco.
  try {
    await resolveShareClientId(req.params.token);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Falha no upload' });
  }
  req.uploadPublicScope = 'client-database';
  req.forcedUploadFolder = 'client-database';

  publicUploadHandler.single('file')(req, res, async (err) => {
    const discardFile = () => {
      try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    };
    try {
      if (err) {
        discardFile();
        return res.status(uploadErrorStatus(err)).json({ error: err.message || 'Falha no upload' });
      }
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const relative = path
        .relative(path.resolve(UPLOAD_ROOT), req.file.path)
        .split(path.sep)
        .join('/');
      return res.json({ path: relative, url: `/uploads/${relative}` });
    } catch (error) {
      discardFile();
      console.error('[public-clientdb:upload]', error);
      return res.status(error.status || 500).json({ error: error.message || 'Falha no upload' });
    }
  });
});

/** Cliente adiciona um novo profissional (somente inclusão). */
app.post('/api/public/client-database/:token/professionals', async (req, res) => {
  try {
    const clientId = await resolveShareClientId(req.params.token);
    await ensureClientDatabaseTables();

    const name = sanitizeText(req.body?.name, 160);
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const photos = publicClientDbMediaUrls(req.body?.photos);

    const inserted = await pool.query(
      `INSERT INTO client_professionals
         (client_id, name, specialty, council_type, council_number, rqe, phone, email, bio, schedule_notes, photos, city)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, c.city
         FROM clients c WHERE c.id = $1
       RETURNING id, name, specialty, photos, videos`,
      [
        clientId,
        name,
        sanitizeText(req.body?.specialty, 160),
        sanitizeText(req.body?.council_type, 20) || 'CRM',
        sanitizeText(req.body?.council_number, 60),
        sanitizeText(req.body?.rqe, 60),
        sanitizeText(req.body?.phone, 40),
        sanitizeText(req.body?.email, 160),
        sanitizeText(req.body?.bio, 2000),
        sanitizeText(req.body?.schedule_notes, 2000),
        JSON.stringify(photos),
      ],
    );

    if (inserted.rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
    return res.json({ professional: inserted.rows[0] });
  } catch (error) {
    console.error('[public-clientdb:professional]', error);
    return res.status(error.status || 500).json({ error: error.message || 'Falha ao cadastrar profissional' });
  }
});

/** Cliente adiciona um novo colaborador (somente inclusão). */
app.post('/api/public/client-database/:token/collaborators', async (req, res) => {
  try {
    const clientId = await resolveShareClientId(req.params.token);
    await ensureClientDatabaseTables();

    const name = sanitizeText(req.body?.name, 160);
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const rawBirthday = sanitizeText(req.body?.birthday, 10);
    const birthday = /^\d{4}-\d{2}-\d{2}$/.test(rawBirthday) ? rawBirthday : null;

    const photos = publicClientDbMediaUrls(req.body?.photos);

    const inserted = await pool.query(
      `INSERT INTO client_collaborators
         (client_id, name, job_role, department, birthday, phone, email, notes, photos, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, true)
       RETURNING id, name, job_role, department, birthday, photos, videos`,
      [
        clientId,
        name,
        sanitizeText(req.body?.job_role, 160),
        sanitizeText(req.body?.department, 160),
        birthday,
        sanitizeText(req.body?.phone, 40),
        sanitizeText(req.body?.email, 160),
        sanitizeText(req.body?.notes, 2000),
        JSON.stringify(photos),
      ],
    );

    return res.json({ collaborator: inserted.rows[0] });
  } catch (error) {
    console.error('[public-clientdb:collaborator]', error);
    return res.status(error.status || 500).json({ error: error.message || 'Falha ao cadastrar colaborador' });
  }
});

/** Cliente anexa mídias a um profissional ou unidade (append-only). */
app.post('/api/public/client-database/:token/media', async (req, res) => {
  try {
    const clientId = await resolveShareClientId(req.params.token);
    await ensureClientDatabaseTables();

    const kindMap = {
      unit: 'client_units',
      collaborator: 'client_collaborators',
      professional: 'client_professionals',
    };
    const kind = kindMap[req.body?.kind] ? req.body.kind : 'professional';
    const table = kindMap[kind];
    const column = req.body?.mediaType === 'videos' ? 'videos' : 'photos';
    const targetId = String(req.body?.id || '');
    if (!UUID_RE.test(targetId)) return res.status(400).json({ error: 'Registro inválido' });

    // Só arquivos enviados pelo próprio upload público (nada de links externos ou de outras pastas)
    const urls = publicClientDbMediaUrls(req.body?.urls);
    if (urls.length === 0) return res.status(400).json({ error: 'Nenhuma mídia enviada' });

    // COALESCE + concatenação garante que nada existente é removido.
    const updated = await pool.query(
      `UPDATE ${table}
          SET ${column} = COALESCE(${column}, '[]'::jsonb) || $1::jsonb,
              updated_at = now()
        WHERE id = $2 AND client_id = $3
        RETURNING id, ${column}`,
      [JSON.stringify(urls), targetId, clientId],
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Registro não encontrado' });
    return res.json({ success: true, record: updated.rows[0] });
  } catch (error) {
    console.error('[public-clientdb:media]', error);
    return res.status(error.status || 500).json({ error: error.message || 'Falha ao anexar mídias' });
  }
});

// ─── Agentes de edição (chaves próprias, fila, entrega) ─────
registerWhatsAppRoutes(app, { pool, verifyAdmin, verifyUser, verifyTeamManager, handleWhatsAppReply, runBillingAutomation, runConfirmationCron });

registerAgentRoutes(app, {
  pool,
  uploadRoot: UPLOAD_ROOT,
  verifyUser,
  isStrictAdmin: (user) => (user?.role === 'admin' ? true : userHasAssignedRole(user, 'admin')),
  publicUploadsUrl: process.env.PUBLIC_UPLOADS_URL,
});

// ─── Assistente PULSE (comandos da equipe pelo WhatsApp) e pedidos para os agentes dos PCs ──
registerAssistant(app, {
  pool,
  verifyAdmin,
  isStrictAdmin: (user) => (user?.role === 'admin' ? true : userHasAssignedRole(user, 'admin')),
  resolveAiConfig,
  resolveAiModel,
  uploadRoot: UPLOAD_ROOT,
  publicUploadsUrl: process.env.PUBLIC_UPLOADS_URL,
  getClientInsights,
});

// ─── Start ──────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`🚀 Pulse API Server running on port ${PORT} (HTTP + WebSocket)`);
});


/*
 * .env required variables:
 * 
 * GOOGLE_GEMINI_API_KEY=<your_gemini_key>
 * API_PORT=3002
 * 
 * Optional:
 * OPENAI_API_KEY=<if using OpenAI>
 * ANTHROPIC_API_KEY=<if using Claude>
 */
